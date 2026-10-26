"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { examContext } from "@/lib/exam-context";
import { fileToText, MAX_TEXT } from "@/lib/extract";
import { runJob } from "@/lib/generate";
import { saveQuestions, verifyQuestions } from "@/lib/questions";
import { questionsFromCsv, questionsFromJson, structureError, type QuestionInput } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type JobState = { error?: string; field?: string; message?: string; jobId?: string };

async function startJob(userId: string, examId: string, kind: "generate" | "upload" | "prepare", requested: number, payload: Record<string, unknown>) {
  const { data, error } = await createAdminClient()
    .from("ai_jobs")
    .insert({ user_id: userId, exam_id: examId, kind, requested, payload })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  after(() => runJob(data.id));
  return data.id as string;
}

async function setupError(userId: string, examId: string) {
  const [ctx, { data: bp }] = await Promise.all([
    examContext(examId),
    createAdminClient().rpc("effective_blueprint_for", { p_user: userId, p_exam_id: examId }),
  ]);
  if (!ctx.identity) return "Describe this exam in step 1 first, so the AI writes questions for the right certification.";
  if (!ctx.language) return "Set the question language first.";
  if (!ctx.format) return "Choose the question type first.";
  if (!bp?.length) return "Set a blueprint first, so new questions follow your topic mix.";
  return null;
}

const issues = (items: QuestionInput[]) => {
  const bad = items.map((q, i) => [i + 1, structureError(q)] as const).filter(([, e]) => e);
  return bad.length ? `Please fix: ${bad.slice(0, 5).map(([n, e]) => `question ${n}: ${e}`).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ""}` : null;
};

/** One upload card for every format. CSV/JSON are parsed here; PDF/DOCX/TXT go to the AI in the background. */
export async function uploadFile(_prev: JobState, form: FormData): Promise<JobState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file", field: "upload" };
  const name = file.name.toLowerCase();
  const { format } = await examContext(examId);
  if (!format) return { error: "Choose the question type first.", field: "upload" };

  try {
    if (name.endsWith(".csv") || name.endsWith(".json")) {
      const text = await file.text();
      const items = name.endsWith(".json") ? questionsFromJson(text, format) : questionsFromCsv(text, format);
      if (!items.length) return { error: "No questions found in the file", field: "upload" };
      if (items.length > 500) return { error: "Upload at most 500 questions at a time", field: "upload" };
      const bad = issues(items);
      if (bad) return { error: bad, field: "upload" };
      return { jobId: await startJob(user.id, examId, "upload", items.length, { items, filename: file.name }) };
    }
    if (![".pdf", ".docx", ".txt"].some((ext) => name.endsWith(ext))) return { error: "Use a CSV, JSON, PDF, DOCX, or TXT file", field: "upload" };
    const text = await fileToText(file);
    if (!text) return { error: "The file has no readable text (scanned PDFs are not supported yet)", field: "upload" };
    if (text.length > MAX_TEXT) return { error: "The file is too long (about 60,000 characters max). Split it into parts.", field: "upload" };
    return { jobId: await startJob(user.id, examId, "upload", 0, { text, filename: file.name }) };
  } catch (e) {
    return { error: `Could not read the file: ${e instanceof Error ? e.message : e}`, field: "upload" };
  }
}

/** "Generate with AI": N new questions split by the user's blueprint. */
export async function generateQuestions(_prev: JobState, form: FormData): Promise<JobState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const count = Number(form.get("count"));
  if (!Number.isInteger(count) || count < 1 || count > 100) return { error: "Choose between 1 and 100 questions", field: "count" };
  const blocked = await setupError(user.id, examId);
  if (blocked) return { error: blocked, field: "count" };
  try {
    return { jobId: await startJob(user.id, examId, "generate", count, {}) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start", field: "count" };
  }
}

/** Generates only the questions a run of `size` is missing per blueprint topic. */
export async function prepareMissing(examId: string, size: number): Promise<JobState> {
  const user = await getUser();
  if (!Number.isInteger(size) || size < 1 || size > 200) return { error: "Choose between 1 and 200 questions" };
  const blocked = await setupError(user.id, examId);
  if (blocked) return { error: blocked };
  const { data } = await user.supabase.rpc("exam_readiness", { p_exam_id: examId, p_size: size });
  const missing = ((data ?? []) as { needed: number; available: number }[]).reduce((s, r) => s + Math.max(0, r.needed - r.available), 0);
  if (!missing) return { message: "Every topic already has enough questions." };
  try {
    return { jobId: await startJob(user.id, examId, "prepare", missing, { size }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start" };
  }
}

/** Manual entry: one question with the user's answer key; verification runs after the response. */
export async function addManualQuestion(_prev: JobState, form: FormData): Promise<JobState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const { format } = await examContext(examId);
  if (!format) return { error: "Choose the question type first.", field: "body" };
  const q: QuestionInput =
    format === "essay"
      ? {
          type: "essay",
          body: String(form.get("body") ?? ""),
          options: [],
          answer: String(form.get("reference") ?? ""),
          rubric: String(form.get("rubric") ?? "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          explanation: String(form.get("explanation") ?? ""),
          topic: String(form.get("topic") ?? ""),
        }
      : {
          type: "mcq",
          body: String(form.get("body") ?? ""),
          options: ["A", "B", "C", "D", "E"].map((l) => String(form.get(`opt${l}`) ?? "").trim()).filter(Boolean),
          answer: String(form.get("answer") ?? ""),
          explanation: String(form.get("explanation") ?? ""),
          topic: String(form.get("topic") ?? ""),
        };
  const bad = structureError(q);
  if (bad) return { error: bad, field: "body" };
  if (!q.topic?.trim()) return { error: "Choose a topic so the question counts toward your blueprint", field: "topic" };
  try {
    const { newIds, existing } = await saveQuestions(examId, user.id, [q], "user_upload", format);
    after(() => verifyQuestions(user.id, newIds).catch((e) => console.error("verify failed", e)));
    revalidatePath("/ujian/[slug]", "page");
    return { message: existing ? "This question is already in the bank." : "Question saved. It is being verified now." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save", field: "body" };
  }
}
