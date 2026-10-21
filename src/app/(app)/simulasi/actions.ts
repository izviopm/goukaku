"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { verifyQuestions } from "@/lib/questions";

export type Feedback = { is_correct: boolean; answer: string; explanation: string | null };

export async function answerItem(itemId: string, answer: string): Promise<{ error?: string; feedback?: Feedback }> {
  const { supabase } = await getUser();
  const { data, error } = await supabase.rpc("answer_item", { p_item_id: itemId, p_answer: answer });
  if (error) return { error: error.message.includes("ALREADY_ANSWERED") ? "This question is already answered." : "Could not save your answer." };
  return data.saved ? {} : { feedback: data as Feedback };
}

export async function endSimulation(simId: string, status: "finished" | "abandoned") {
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("end_simulation", { p_sim_id: simId, p_status: status });
  if (error && !error.message.includes("SIM_NOT_ACTIVE")) return { error: "Could not save the practice exam." };
  redirect(`/riwayat/${simId}`);
}

/** PRD 10: record the report (3 distinct users hide it in SQL) and re-run verification. */
export async function reportQuestion(questionId: string, reason: string): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, id } = await getUser();
  const text = reason.trim();
  if (!text || text.length > 1000) return { error: "Enter a reason (up to 1000 characters)." };
  const { error } = await supabase.rpc("report_question", { p_question_id: questionId, p_reason: text });
  if (error) return { error: "Could not send the report." };
  after(() => verifyQuestions(id, [questionId]).catch((e) => console.error("re-verify failed", e)));
  return { ok: true };
}
