"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AIError, complete, consumeQuota, extractJson, webSearchAvailable, type ChatMessage } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { examContext, type ExamIdentity } from "@/lib/exam-context";
import { createAdminClient } from "@/lib/supabase/server";

const Identity = z.object({
  full_name: z.string().trim().min(2).max(200),
  issuer: z.string().trim().max(200).nullish(),
  scope: z.string().trim().max(200).nullish(),
  country: z.string().trim().max(100).nullish(),
  summary: z.string().trim().min(5).max(600),
});

const Reply = z.object({
  status: z.enum(["question", "identified"]),
  message: z.string().max(1500),
  identity: Identity.nullish(),
});

export type ClarifyResult = { message?: string; identity?: ExamIdentity; error?: string };

/**
 * One turn of the "What is this exam?" conversation. The AI keeps asking until it knows the full
 * official name, issuer, and module/level, then proposes an identity card for the user to confirm.
 */
export async function clarifyExam(examId: string, messages: ChatMessage[]): Promise<ClarifyResult> {
  const user = await getUser();
  if (!messages.length || messages.length > 30) return { error: "Describe the exam first." };
  const clean = messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) }) as ChatMessage);

  try {
    const ctx = await examContext(examId);
    await consumeQuota(user.id, 1);
    const web = await webSearchAvailable();
    const raw = await complete({
      webSearch: web,
      system:
        `You help a learner pin down exactly which certification exam they are preparing for. The exam was created with the name "${ctx.name}". ` +
        "Reply in the language the learner writes in. Ask ONE short question at a time until you are confident about: the full official name, " +
        "the issuing body, the specific module, level, or part if the certification has several, and the country if relevant. " +
        "Never assume what an abbreviation stands for without the learner confirming it. " +
        (web ? "Use web search to check the certification exists and how it is structured. " : "") +
        'Reply ONLY with JSON, either {"status": "question", "message": "..."} or ' +
        '{"status": "identified", "message": "short confirmation", "identity": {"full_name": "...", "issuer": "..." | null, "scope": "module or level" | null, "country": "..." | null, "summary": "1-2 sentences on what this exam covers"}}.',
      messages: clean,
    });
    const reply = Reply.safeParse(extractJson(raw));
    if (!reply.success) return { error: "The AI reply could not be read. Please try again." };
    if (reply.data.status === "identified" && reply.data.identity) return { message: reply.data.message, identity: reply.data.identity };
    return { message: reply.data.message };
  } catch (e) {
    return { error: e instanceof AIError ? e.message : "Could not reach the AI." };
  }
}

/** Saves the confirmed identity. Shared per exam, so only the first learner can set it (admin can change it later). */
export async function confirmIdentity(examId: string, identity: ExamIdentity): Promise<{ error?: string }> {
  const user = await getUser();
  const parsed = Identity.safeParse(identity);
  if (!parsed.success) return { error: "The exam details are incomplete." };
  const ctx = await examContext(examId);
  const { data, error } = await createAdminClient()
    .from("exam_catalog")
    .update({ identity: parsed.data, identity_set_by: user.id })
    .eq("id", ctx.catalogId)
    .is("identity", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Someone already described this exam. Refresh the page to see it." };
  revalidatePath("/ujian/[slug]", "page");
  return {};
}
