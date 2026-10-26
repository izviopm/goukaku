import "server-only";
import { AIError, complete, consumeQuota, extractJson } from "@/lib/ai";
import { saveQuestions, solve, verifyQuestions } from "@/lib/questions";
import { chunk, LETTERS, normalize, structureError, topicPlan, type QuestionInput } from "@/lib/rules";
import { examContext } from "@/lib/exam-context";
import { createAdminClient } from "@/lib/supabase/server";

const LANG = { id: "Bahasa Indonesia", en: "English" } as const;
const PREPARE_ROUNDS = 3;
const PREPARE_BUFFER = 1.2; // some generated questions fail verification, so ask for a little more

type Job = { id: string; user_id: string; exam_id: string; kind: "generate" | "upload" | "prepare"; requested: number; payload: Record<string, unknown> | null };
type Db = ReturnType<typeof createAdminClient>;

/** Background runner for every AI job (generate, upload, prepare). Progress and a summary are written to ai_jobs. */
export async function runJob(jobId: string) {
  const db = createAdminClient();
  const { data: job } = await db.from("ai_jobs").select("*").eq("id", jobId).single<Job>();
  if (!job) return;
  // Claim the job atomically so a duplicate trigger cannot run it twice.
  const { data: claimed } = await db.from("ai_jobs").update({ status: "running" }).eq("id", jobId).eq("status", "queued").select("id");
  if (!claimed?.length) return;

  let done = 0;
  const progress = async (n: number, extra: Record<string, unknown> = {}) => {
    done += n;
    await db.from("ai_jobs").update({ done, ...extra }).eq("id", jobId);
  };

  try {
    const exam = await examInfo(job.exam_id);
    const summary =
      job.kind === "upload" ? await runUpload(db, job, exam, progress) : job.kind === "prepare" ? await runPrepare(db, job, exam, progress) : await runGenerate(db, job, exam, progress);
    await db.from("ai_jobs").update({ status: "done", summary }).eq("id", jobId);
  } catch (e) {
    await db.from("ai_jobs").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", jobId);
  }
}

/** `text` is the confirmed exam identity, e.g. "Certified General Insurance (AAUI) · Module 002 …". */
type Exam = { text: string; language: "id" | "en" | null; format: "mcq" | "essay" | null };
type Progress = (n: number, extra?: Record<string, unknown>) => Promise<void>;

async function examInfo(examId: string): Promise<Exam> {
  const ctx = await examContext(examId);
  return { text: ctx.text, language: ctx.language, format: ctx.format };
}

async function blueprintFor(db: Db, job: Job) {
  const { data } = await db.rpc("effective_blueprint_for", { p_user: job.user_id, p_exam_id: job.exam_id });
  return (data ?? []) as { topic: string; percentage: number }[];
}

async function recentBodies(db: Db, examId: string) {
  const { data } = await db.from("questions").select("body").eq("exam_id", examId).order("created_at", { ascending: false }).limit(150);
  return (data ?? []).map((e) => e.body as string);
}

/** Generates and verifies one question per entry in `topics`, batch by batch. */
async function generateTopics(db: Db, job: Job, exam: Exam, topics: string[], progress: Progress) {
  if (!exam.language) throw new AIError("Set the question language for this exam first.");
  if (!exam.format) throw new AIError("Choose the question format for this exam first.");
  let added = 0;
  for (const batch of chunk(topics)) {
    await consumeQuota(job.user_id, 1, batch.length);
    const items = await generateBatch(exam.text, LANG[exam.language], batch, await recentBodies(db, job.exam_id), exam.format);
    const { newIds } = await saveQuestions(job.exam_id, job.user_id, items, "ai_generated", exam.format);
    await verifyQuestions(job.user_id, newIds);
    added += newIds.length;
    await progress(items.length);
  }
  return added;
}

/** "Generate with AI": N new questions split by the user's blueprint. */
async function runGenerate(db: Db, job: Job, exam: Exam, progress: Progress) {
  const blueprint = await blueprintFor(db, job);
  if (!blueprint.length) throw new AIError("Set a blueprint for this exam first.");
  const added = await generateTopics(db, job, exam, topicPlan(blueprint, job.requested), progress);
  return { added };
}

/** "Prepare missing questions": fill only the topics short for a run of `size`, re-checking after verification. */
async function runPrepare(db: Db, job: Job, exam: Exam, progress: Progress) {
  const size = Number(job.payload?.size);
  let added = 0;
  let short: { topic: string; missing: number }[] = [];
  for (let round = 1; round <= PREPARE_ROUNDS; round++) {
    const { data } = await db.rpc("exam_readiness_for", { p_user: job.user_id, p_exam_id: job.exam_id, p_size: size });
    short = ((data ?? []) as { topic: string; needed: number; available: number }[])
      .filter((r) => r.available < r.needed)
      .map((r) => ({ topic: r.topic, missing: r.needed - r.available }));
    if (!short.length) return { added, rounds: round - 1 };
    const plan = short.flatMap((s) => Array(Math.ceil(s.missing * PREPARE_BUFFER)).fill(s.topic));
    added += await generateTopics(db, job, exam, plan, progress);
  }
  const { data } = await db.rpc("exam_readiness_for", { p_user: job.user_id, p_exam_id: job.exam_id, p_size: size });
  const left = ((data ?? []) as { topic: string; needed: number; available: number }[]).filter((r) => r.available < r.needed);
  if (left.length)
    throw new AIError(`Still short after ${PREPARE_ROUNDS} rounds: ${left.map((r) => `${r.topic} ${r.available} of ${r.needed}`).join(", ")}. Try again or add questions yourself.`);
  return { added, rounds: PREPARE_ROUNDS };
}

/**
 * "Upload a file": CSV/JSON rows are saved as given; PDF/DOCX/TXT text is read by the AI, which keeps the
 * file's own answer key when present and answers the rest itself. Every new question is then verified.
 */
async function runUpload(db: Db, job: Job, exam: Exam, progress: Progress) {
  const payload = job.payload ?? {};
  let withKey: QuestionInput[] = [];
  const withoutKey: QuestionInput[] = [];

  if (Array.isArray(payload.items)) {
    withKey = payload.items as QuestionInput[];
  } else {
    const text = String(payload.text ?? "");
    const blueprint = await blueprintFor(db, job);
    const { data: known } = await db.from("questions").select("topic").eq("exam_id", job.exam_id).not("topic", "is", null).limit(500);
    const topics = [...new Set([...blueprint.map((b) => b.topic), ...(known ?? []).map((k) => k.topic as string)])];
    for (const piece of text.match(/[\s\S]{1,12000}/g) ?? []) {
      await consumeQuota(job.user_id, 1);
      const found = await extractQuestions(piece, topics, exam.text, exam.format);
      for (const q of found) {
        if (exam.format === "essay") {
          if (!structureError(q)) withKey.push(q);
        } else (q.answer && !structureError(q) ? withKey : withoutKey).push(q);
      }
    }
    await db.from("ai_jobs").update({ requested: withKey.length + withoutKey.length }).eq("id", job.id);
    if (exam.format !== "essay")
      for (const batch of chunk(withoutKey)) {
        const answers = await solve(job.user_id, batch, undefined, exam.text);
        batch.forEach((q, i) => Object.assign(q, answers[i]));
      }
  }

  const valid = (qs: QuestionInput[]) => qs.filter((q) => !structureError(q));
  const keyed = await saveQuestions(job.exam_id, job.user_id, valid(withKey), "user_upload", exam.format ?? "mcq");
  const answered = await saveQuestions(job.exam_id, job.user_id, valid(withoutKey), "user_pdf_ai_answered", exam.format ?? "mcq");
  const newIds = [...keyed.newIds, ...answered.newIds];
  for (const ids of chunk(newIds)) {
    await verifyQuestions(job.user_id, ids);
    await progress(ids.length);
  }
  return {
    found: withKey.length + withoutKey.length,
    withKey: withKey.length,
    aiAnswered: withoutKey.length,
    added: newIds.length,
    existing: keyed.existing + answered.existing,
    skipped: withKey.length + withoutKey.length - valid(withKey).length - valid(withoutKey).length,
  };
}

/** Reads questions out of free text. MCQ keeps a key only when the document states it; essay gets a reference answer and rubric. */
async function extractQuestions(text: string, topics: string[], examText: string, type: "mcq" | "essay" | null): Promise<QuestionInput[]> {
  const essay = type === "essay";
  const reply = await complete({
    system:
      `The document contains practice questions for: ${examText}. ` +
      (essay
        ? "Extract every essay question exactly as written. For each, write a concise reference answer and 3 to 5 short grading criteria when the document does not provide them. "
        : "Extract every multiple-choice question from the text exactly as written, without changing the question or the options. " +
          "If the document states the correct answer (answer key, marked option, or answer list), give its letter; otherwise use null. Never guess. ") +
      (topics.length ? `Label each question with the closest topic from this list: ${topics.join(", ")}. ` : "Label each question with a short topic name. ") +
      (essay
        ? 'Reply ONLY with a JSON array: [{"body": "...", "answer": "reference answer", "rubric": ["criterion"], "explanation": "..." | null, "topic": "..."}]. Ignore text that is not a question.'
        : 'Reply ONLY with a JSON array: [{"body": "...", "options": ["..."], "answer": "A" | null, "explanation": "..." | null, "topic": "..."}]. Ignore text that is not a question.'),
    messages: [{ role: "user", content: text }],
  });
  const canonical = new Map(topics.map((t) => [normalize(t), t]));
  return extractJson<QuestionInput[]>(reply)
    .filter((q) => q && typeof q.body === "string" && (essay ? Array.isArray(q.rubric) : Array.isArray(q.options)))
    .map((q) => {
      const topic = q.topic ? (canonical.get(normalize(q.topic)) ?? q.topic) : undefined;
      if (essay)
        return {
          type: "essay",
          body: q.body,
          options: [],
          answer: typeof q.answer === "string" ? q.answer : "",
          rubric: Array.isArray(q.rubric) ? q.rubric.map(String) : [],
          explanation: q.explanation ?? undefined,
          topic,
        };
      const answer = typeof q.answer === "string" ? q.answer.trim().toUpperCase() : "";
      return {
        body: q.body,
        options: q.options.map(String),
        answer: LETTERS.includes(answer) ? answer : undefined,
        explanation: q.explanation ?? undefined,
        topic,
      };
    });
}

async function generateBatch(examText: string, language: string, topics: string[], existing: string[], type: "mcq" | "essay") {
  const counts = Object.entries(topics.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}));
  const essay = type === "essay";
  const text = await complete({
    system:
      `You write practice questions for this certification exam: ${examText}. Write them in ${language}. ` +
      "Stay strictly within this certification's syllabus and the level of its real exam; never drift into other fields that share the same abbreviation. " +
      (essay
        ? "Each question is a written essay. Add a concise reference answer and 3 to 5 short, observable grading criteria. " +
          'Reply ONLY with a JSON array: [{"body": "...", "answer": "reference answer", "rubric": ["criterion"], "explanation": "...", "topic": "..."}].'
        : "Multiple choice with 4 options, exactly one correct answer, and a short, accurate explanation. " +
          'Reply ONLY with a JSON array: [{"body": "...", "options": ["...","...","...","..."], "answer": "A", "explanation": "...", "topic": "..."}].'),
    messages: [
      {
        role: "user",
        content:
          `Write questions with this topic mix:\n${counts.map(([t, n]) => `- ${t}: ${n}`).join("\n")}\n\n` +
          "Do NOT write questions that are the same as or close to these existing ones:\n" +
          existing.map((b) => `- ${b.slice(0, 160)}`).join("\n"),
      },
    ],
  });
  // Keep the requested topic names exactly, so blueprint quotas can count these questions.
  return extractJson<QuestionInput[]>(text)
    .filter((q) => q && typeof q.body === "string" && (essay ? Array.isArray(q.rubric) : Array.isArray(q.options)))
    .slice(0, topics.length)
    .map((q, i) =>
      essay
        ? {
            type,
            body: q.body,
            options: [],
            answer: typeof q.answer === "string" ? q.answer : "",
            rubric: Array.isArray(q.rubric) ? q.rubric.map(String) : [],
            explanation: q.explanation ?? undefined,
            topic: topics[i],
          }
        : { ...q, topic: topics[i] },
    );
}
