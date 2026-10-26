import "server-only";
import { createHash } from "node:crypto";
import { complete, consumeQuota, extractJson, getVerifierModels, isFatal } from "@/lib/ai";
import { examContext } from "@/lib/exam-context";
import { MAX_VERIFIERS, upToN } from "@/lib/fallback";
import { chunk, LETTERS, normalize, structureError, type QuestionInput, type QuestionType } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type Origin = "user_upload" | "user_pdf_ai_answered" | "ai_generated" | "web";

export function contentHash(q: QuestionInput) {
  const text = q.type === "essay" ? `essay\n${normalize(q.body)}` : [q.body, ...q.options].map(normalize).join("\n");
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Inserts into the shared bank (dedup by content hash) and adds every question, new or existing, to the user's pool.
 * Returns ids of newly inserted questions and the count that already existed.
 */
export async function saveQuestions(examId: string, userId: string, items: QuestionInput[], origin: Origin, type: QuestionType = "mcq") {
  const db = createAdminClient();
  const rows = new Map<string, Record<string, unknown>>();
  for (const q of items) {
    const hash = contentHash({ ...q, type });
    rows.set(hash, {
      exam_id: examId,
      type,
      body: q.body.trim(),
      options: type === "essay" ? [] : q.options.map((o) => o.trim()),
      answer: type === "essay" ? q.answer?.trim() || null : q.answer?.trim().toUpperCase() || null,
      rubric: type === "essay" ? (q.rubric ?? []).map((c) => c.trim()) : null,
      explanation: q.explanation?.trim() || null,
      topic: q.topic?.trim() || null,
      origin,
      created_by: userId,
      content_hash: hash,
    });
  }
  if (rows.size === 0) return { newIds: [] as string[], existing: 0 };

  const { data: inserted, error } = await db
    .from("questions")
    .upsert([...rows.values()], { onConflict: "exam_id,content_hash", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`Could not save questions: ${error.message}`);

  const { data: all, error: e2 } = await db
    .from("questions")
    .select("id")
    .eq("exam_id", examId)
    .in("content_hash", [...rows.keys()]);
  if (e2) throw new Error(e2.message);

  await addToPool(userId, examId, (all ?? []).map((r) => r.id));
  const newIds = (inserted ?? []).map((r) => r.id);
  return { newIds, existing: rows.size - newIds.length };
}

export async function addToPool(userId: string, examId: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await createAdminClient()
    .from("user_exam_pool")
    .upsert(ids.map((question_id) => ({ user_id: userId, exam_id: examId, question_id })), { ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

const formatForSolve = (qs: QuestionInput[]) =>
  qs
    .map((q, i) => `[${i}] ${q.body}\n${q.options.map((o, j) => `${LETTERS[j]}. ${o}`).join("\n")}`)
    .join("\n\n");

/** Asks one model to answer questions without seeing any key. */
export async function solve(userId: string, qs: QuestionInput[], model?: string, examText?: string) {
  await consumeQuota(userId, 1);
  const text = await complete({
    model,
    system:
      (examText ? `Soal-soal ini untuk ujian sertifikasi: ${examText}. ` : "") +
      "Kamu ahli yang menjawab soal pilihan ganda ujian sertifikasi. Jawab setiap soal dengan satu huruf. " +
      'Balas HANYA JSON array: [{"i": nomor, "answer": "A", "explanation": "alasan singkat"}].',
    messages: [{ role: "user", content: formatForSolve(qs) }],
  });
  const parsed = extractJson<{ i: number; answer: string; explanation?: string }[]>(text);
  return qs.map((_, i) => {
    const r = parsed.find((p) => Number(p.i) === i);
    return { answer: r?.answer?.trim().toUpperCase() ?? null, explanation: r?.explanation ?? "" };
  });
}

/**
 * PRD 5 answer-key check: structure, then a blind solve by 2 to MAX_VERIFIERS different models.
 * All agree with the key -> verified; any disagreement or structure failure -> disputed.
 * Fewer than 2 models reachable -> stays unverified so a later check can retry.
 */
export async function verifyQuestions(userId: string, ids: string[]) {
  if (!ids.length) return;
  const db = createAdminClient();
  const models = await getVerifierModels();
  const { data: qs, error } = await db
    .from("questions")
    .select("id, exam_id, body, options, answer, type, rubric")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const examText = qs?.length ? (await examContext(qs[0].exam_id)).text : undefined;

  const now = new Date().toISOString();
  const valid: typeof qs = [];
  for (const q of qs ?? []) {
    const err = structureError(q as unknown as QuestionInput);
    if (err) {
      await db.from("questions").update({ answer_status: "disputed", verification: { checked_at: now, structure: err } }).eq("id", q.id);
    } else if (q.type === "essay") {
      // Essays have no single answer to solve; a valid reference answer and rubric is enough.
      await db.from("questions").update({ answer_status: "verified", verification: { checked_at: now, structure: "ok", mode: "rubric" } }).eq("id", q.id);
    } else valid.push(q);
  }

  if (models.length < 2) {
    for (const q of valid)
      await db
        .from("questions")
        .update({ answer_status: "unverified", verification: { checked_at: now, structure: "ok", note: "The admin has not set at least 2 verifier models" } })
        .eq("id", q.id);
    return;
  }

  for (const batch of chunk(valid)) {
    const { ok, failed } = await upToN(models, MAX_VERIFIERS, (m) => solve(userId, batch, m, examText), isFatal);
    if (failed.length) console.warn("Verifier fallback:", failed);
    for (const [i, q] of batch.entries()) {
      const solvers = ok.map(({ model, value }) => ({ model, ...value[i] }));
      const enough = solvers.length >= 2;
      const agree = enough && solvers.every((s) => s.answer === q.answer);
      await db
        .from("questions")
        .update({
          answer_status: !enough ? "unverified" : agree ? "verified" : "disputed",
          verification: {
            checked_at: now,
            structure: "ok",
            key: q.answer,
            solvers,
            ...(failed.length && { unavailable: failed }),
            ...(!enough && { note: "Fewer than 2 verifier models were reachable" }),
          },
        })
        .eq("id", q.id);
    }
  }
}
