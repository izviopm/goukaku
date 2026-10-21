"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { AIError, complete, consumeQuota, extractJson } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { saveQuestions, solve, verifyQuestions } from "@/lib/questions";
import { chunk, questionsFromCsv, questionsFromJson, structureError, type QuestionInput } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type FormState = { error?: string; field?: string; message?: string };

const SIM_ERRORS: Record<string, string> = {
  NO_BLUEPRINT: "Set a blueprint for this exam first.",
  BAD_SIZE: "Choose between 1 and 200 questions.",
  BAD_MODE: "Choose a feedback mode.",
};

/** SHORTFALL:[{topic, needed, available}] from start_simulation -> readable per-topic message. */
function shortfallMessage(raw: string) {
  try {
    const rows = JSON.parse(raw.slice(raw.indexOf("[")).trim()) as { topic: string; needed: number; available: number }[];
    if (rows.length)
      return `Not enough verified questions to follow your blueprint: ${rows.map((r) => `${r.topic} ${r.available} of ${r.needed}`).join(", ")}. Prepare the missing questions first.`;
  } catch {}
  return "Not enough verified questions to follow your blueprint. Prepare the missing questions first.";
}

export async function startSimulation(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getUser();
  const size = Number(form.get("size"));
  const mode = String(form.get("mode") ?? "");
  if (!Number.isInteger(size) || size < 1 || size > 200) return { error: SIM_ERRORS.BAD_SIZE, field: "size" };
  if (mode !== "instant" && mode !== "end") return { error: SIM_ERRORS.BAD_MODE, field: "mode" };

  const { data, error } = await supabase.rpc("start_simulation", { p_exam_id: String(form.get("examId")), p_size: size, p_mode: mode });
  if (error) {
    if (error.message.includes("SHORTFALL")) return { error: shortfallMessage(error.message), field: "size" };
    const code = Object.keys(SIM_ERRORS).find((k) => error.message.includes(k));
    return { error: code ? SIM_ERRORS[code] : error.message, field: "size" };
  }
  redirect(`/simulasi/${data.id}`);
}

/** Path A: questions with answers, from a CSV/JSON file or the manual form. */
export async function uploadWithAnswers(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const file = form.get("file");
  let items: QuestionInput[];

  try {
    if (file instanceof File && file.size > 0) {
      const text = await file.text();
      items = file.name.toLowerCase().endsWith(".json") ? questionsFromJson(text) : questionsFromCsv(text);
    } else {
      const options = ["A", "B", "C", "D", "E"].map((l) => String(form.get(`opt${l}`) ?? "").trim()).filter(Boolean);
      items = [
        {
          body: String(form.get("body") ?? ""),
          options,
          answer: String(form.get("answer") ?? ""),
          explanation: String(form.get("explanation") ?? ""),
          topic: String(form.get("topic") ?? ""),
        },
      ];
    }
  } catch (e) {
    return { error: `Could not read the file: ${e instanceof Error ? e.message : e}`, field: "file" };
  }

  if (!items.length) return { error: "No questions found", field: "file" };
  if (items.length > 500) return { error: "Upload at most 500 questions at a time", field: "file" };
  const bad = items.map((q, i) => [i + 1, structureError(q)] as const).filter(([, e]) => e);
  if (bad.length)
    return {
      error: `Please fix: ${bad.slice(0, 5).map(([n, e]) => `question ${n}: ${e}`).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ""}`,
      field: file instanceof File && file.size > 0 ? "file" : "body",
    };

  return finish(user.id, examId, items, "user_upload");
}

/** Path B: questions without answers from PDF/text; AI extracts and answers, then the usual verification runs. */
export async function uploadWithoutAnswers(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or text file", field: "file-b" };

  let text: string;
  try {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      text = (await extractText(pdf, { mergePages: true })).text;
    } else text = await file.text();
  } catch {
    return { error: "Could not read the file", field: "file-b" };
  }
  text = text.trim();
  if (!text) return { error: "The file has no text (scanned PDFs are not supported yet)", field: "file-b" };
  if (text.length > 60000) return { error: "The text is too long (about 60,000 characters max). Split the file.", field: "file-b" };

  try {
    const pieces = text.match(/[\s\S]{1,12000}/g) ?? [];
    const items: QuestionInput[] = [];
    for (const piece of pieces) {
      await consumeQuota(user.id, 1);
      const reply = await complete({
        system:
          "Extract every multiple-choice question from the following text exactly as written, without changing the question or options. " +
          'Reply ONLY with a JSON array: [{"body": "...", "options": ["..."], "topic": "..."}]. Ignore text that is not a question.',
        messages: [{ role: "user", content: piece }],
      });
      items.push(...extractJson<QuestionInput[]>(reply).filter((q) => q?.body && Array.isArray(q.options)));
    }
    if (!items.length) return { error: "The AI found no multiple-choice questions in this file", field: "file-b" };

    // The answering model fills in the key; independent verifier models then blind-solve it.
    for (const batch of chunk(items)) {
      const answers = await solve(user.id, batch);
      batch.forEach((q, i) => Object.assign(q, answers[i]));
    }
    return finish(user.id, examId, items.filter((q) => !structureError(q)), "user_pdf_ai_answered");
  } catch (e) {
    return { error: e instanceof AIError ? e.message : "Could not process the file with AI", field: "file-b" };
  }
}

async function finish(userId: string, examId: string, items: QuestionInput[], origin: "user_upload" | "user_pdf_ai_answered"): Promise<FormState> {
  try {
    const { newIds, existing } = await saveQuestions(examId, userId, items, origin);
    let note = "";
    try {
      await verifyQuestions(userId, newIds);
    } catch (e) {
      note = ` Verification is pending: ${e instanceof Error ? e.message : e}`;
    }
    revalidatePath("/ujian/[slug]", "page");
    return { message: `${newIds.length} new questions added to the bank, ${existing} already existed and were reused.${note}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save", field: "file" };
  }
}

/** Setup step 1: question language (shared, set once), optional personal target, and real exam size. */
export async function saveGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, id } = await getUser();
  const examId = String(form.get("examId"));
  const language = String(form.get("language") ?? "");
  const rawTarget = String(form.get("target") ?? "").trim();
  const rawSize = String(form.get("examSize") ?? "").trim();
  const target = rawTarget === "" ? null : Number(rawTarget);
  const examSize = rawSize === "" ? null : Number(rawSize);

  if (form.has("language") && language !== "en" && language !== "id") return { error: "Choose the question language", field: "language" };
  if (target !== null && !(Number.isFinite(target) && target >= 0 && target <= 100)) return { error: "Target must be between 0 and 100", field: "target" };
  if (examSize !== null && !(Number.isInteger(examSize) && examSize >= 1 && examSize <= 500)) return { error: "Enter a whole number between 1 and 500", field: "examSize" };

  if (form.has("language")) {
    // Shared per exam: only the first learner sets it; the admin can change it later.
    const db = createAdminClient();
    const { data: exam } = await db.from("exams").select("catalog_id").eq("id", examId).single();
    if (exam) await db.from("exam_catalog").update({ language }).eq("id", exam.catalog_id).is("language", null);
  }
  const { error } = await supabase.from("user_exam_goal").upsert({ user_id: id, exam_id: examId, target_score: target, exam_size: examSize });
  if (error) return { error: error.message, field: "target" };
  revalidatePath("/ujian/[slug]", "page");
  return { message: "Saved" };
}
