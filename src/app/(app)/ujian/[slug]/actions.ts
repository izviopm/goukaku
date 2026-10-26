"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
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

export type Readiness = { topic: string; needed: number; available: number; unanswered: number };

/** Per-topic needed/available for a run of `size`, for the Start card. */
export async function getReadiness(examId: string, size: number): Promise<Readiness[]> {
  const { supabase } = await getUser();
  if (!Number.isInteger(size) || size < 1 || size > 200) return [];
  const { data } = await supabase.rpc("exam_readiness", { p_exam_id: examId, p_size: size });
  return (data ?? []) as Readiness[];
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

/** Setup step 1: question language (shared, set once), optional personal target, and real exam size. */
export async function saveGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, id } = await getUser();
  const examId = String(form.get("examId"));
  const language = String(form.get("language") ?? "");
  const format = String(form.get("format") ?? "");
  const rawTarget = String(form.get("target") ?? "").trim();
  const rawSize = String(form.get("examSize") ?? "").trim();
  const target = rawTarget === "" ? null : Number(rawTarget);
  const examSize = rawSize === "" ? null : Number(rawSize);

  if (form.has("language") && language !== "en" && language !== "id") return { error: "Choose the question language", field: "language" };
  if (form.has("format") && format !== "mcq" && format !== "essay") return { error: "Choose the question format", field: "format" };
  if (target !== null && !(Number.isFinite(target) && target >= 0 && target <= 100)) return { error: "Target must be between 0 and 100", field: "target" };
  if (examSize !== null && !(Number.isInteger(examSize) && examSize >= 1 && examSize <= 500)) return { error: "Enter a whole number between 1 and 500", field: "examSize" };

  if (form.has("language") || form.has("format")) {
    // Shared per exam: only the first learner sets each; the admin can change them later.
    const db = createAdminClient();
    const { data: exam } = await db.from("exams").select("catalog_id").eq("id", examId).single();
    if (exam) {
      if (form.has("language")) await db.from("exam_catalog").update({ language }).eq("id", exam.catalog_id).is("language", null);
      if (form.has("format")) await db.from("exam_catalog").update({ format }).eq("id", exam.catalog_id).is("format", null);
    }
  }
  const { error } = await supabase.from("user_exam_goal").upsert({ user_id: id, exam_id: examId, target_score: target, exam_size: examSize });
  if (error) return { error: error.message, field: "target" };
  revalidatePath("/ujian/[slug]", "page");
  return { message: "Saved" };
}
