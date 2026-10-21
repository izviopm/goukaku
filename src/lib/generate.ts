import "server-only";
import { AIError, complete, consumeQuota, extractJson } from "@/lib/ai";
import { addToPool, saveQuestions, verifyQuestions } from "@/lib/questions";
import { chunk, topicPlan, type QuestionInput } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

const LANG = { id: "Bahasa Indonesia", en: "English" } as const;

/** Path C (PRD 5): reuse the shared bank first, then generate the rest per blueprint in batches. */
export async function runJob(jobId: string) {
  const db = createAdminClient();
  const { data: job } = await db.from("ai_jobs").select("*").eq("id", jobId).single();
  if (!job || job.status !== "queued") return;
  await db.from("ai_jobs").update({ status: "running" }).eq("id", jobId);

  let done = 0;
  const progress = (n: number) => db.from("ai_jobs").update({ done: (done += n) }).eq("id", jobId);

  try {
    const { data: exam } = await db.from("exams").select("id, exam_catalog(display_name, language)").eq("id", job.exam_id).single();
    const catalog = exam?.exam_catalog as unknown as { display_name: string; language: "id" | "en" | null };
    if (!catalog?.language) throw new AIError("The question language for this exam is not set yet.");

    // 1. Shared bank: questions others already added that are not in this user's pool yet.
    const { data: pool } = await db.from("user_exam_pool").select("question_id").eq("user_id", job.user_id).eq("exam_id", job.exam_id);
    const inPool = new Set((pool ?? []).map((p) => p.question_id));
    const { data: shared } = await db
      .from("questions")
      .select("id")
      .eq("exam_id", job.exam_id)
      .eq("status", "active")
      .neq("answer_status", "disputed");
    const reuse = (shared ?? []).filter((q) => !inPool.has(q.id)).slice(0, job.requested).map((q) => q.id);
    await addToPool(job.user_id, job.exam_id, reuse);
    await progress(reuse.length);

    // 2. Generate the remainder following the blueprint.
    const remaining = job.requested - reuse.length;
    if (remaining > 0) {
      // The user's effective blueprint: their personal one, or the shared default.
      const { data: bp } = await db.rpc("effective_blueprint_for", { p_user: job.user_id, p_exam_id: job.exam_id });
      const blueprint = (bp ?? []) as { topic: string; percentage: number }[];
      if (!blueprint.length) throw new AIError("Set a blueprint for this exam first.");

      for (const topics of chunk(topicPlan(blueprint, remaining))) {
        const { data: existing } = await db
          .from("questions")
          .select("body")
          .eq("exam_id", job.exam_id)
          .order("created_at", { ascending: false })
          .limit(150);
        await consumeQuota(job.user_id, 1, topics.length);
        const items = await generateBatch(catalog.display_name, LANG[catalog.language], topics, (existing ?? []).map((e) => e.body));
        const { newIds } = await saveQuestions(job.exam_id, job.user_id, items, "ai_generated");
        await verifyQuestions(job.user_id, newIds);
        await progress(items.length);
      }
    }
    await db.from("ai_jobs").update({ status: "done" }).eq("id", jobId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("ai_jobs").update({ status: "failed", error: msg }).eq("id", jobId);
  }
}

async function generateBatch(examName: string, language: string, topics: string[], existing: string[]) {
  const counts = Object.entries(topics.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}));
  const text = await complete({
    system:
      `Kamu penyusun soal ujian sertifikasi ${examName}. Tulis soal dalam ${language}. ` +
      "Soal pilihan ganda dengan 4 opsi, tepat satu jawaban benar, penjelasan singkat yang akurat. " +
      'Balas HANYA JSON array: [{"body": "...", "options": ["...","...","...","..."], "answer": "A", "explanation": "...", "topic": "..."}].',
    messages: [
      {
        role: "user",
        content:
          `Buat soal dengan komposisi topik berikut:\n${counts.map(([t, n]) => `- ${t}: ${n} soal`).join("\n")}\n\n` +
          `JANGAN membuat soal yang sama atau mirip dengan soal yang sudah ada berikut:\n` +
          existing.map((b) => `- ${b.slice(0, 160)}`).join("\n"),
      },
    ],
  });
  const allowed = new Set(topics);
  return extractJson<QuestionInput[]>(text)
    .filter((q) => q && typeof q.body === "string" && Array.isArray(q.options))
    .slice(0, topics.length)
    .map((q, i) => ({ ...q, topic: allowed.has(q.topic ?? "") ? q.topic : topics[i] }));
}
