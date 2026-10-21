import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type Provider = "openai" | "anthropic" | "gemini";
export type ChatMessage = { role: "user" | "assistant"; content: string };
type CallOptions = { system: string; messages: ChatMessage[]; model?: string; webSearch?: boolean };

const LIMIT_MESSAGES: Record<string, string> = {
  AI_DISABLED: "AI sedang dinonaktifkan oleh admin.",
  GLOBAL_LIMIT: "Batas harian AI untuk seluruh aplikasi sudah tercapai. Coba lagi besok.",
  USER_CALL_LIMIT: "Batas panggilan AI harian kamu sudah tercapai.",
  USER_QUESTION_LIMIT: "Batas jumlah soal yang dibuat AI hari ini sudah tercapai.",
};

export class AIError extends Error {}

/** Checks limits and records usage before any AI call (PRD 9). Throws AIError with a user-facing message. */
export async function consumeQuota(userId: string, calls: number, questions = 0) {
  const { error } = await createAdminClient().rpc("consume_ai_quota", {
    p_user_id: userId,
    p_calls: calls,
    p_questions: questions,
  });
  if (error) {
    const code = Object.keys(LIMIT_MESSAGES).find((k) => error.message.includes(k));
    throw new AIError(code ? LIMIT_MESSAGES[code] : `Gagal mengecek limit: ${error.message}`);
  }
}

async function getConfig() {
  const db = createAdminClient();
  const [{ data: settings }, { data: key }] = await Promise.all([
    db.from("ai_settings").select("provider, model").eq("id", true).maybeSingle(),
    db.rpc("get_ai_api_key"),
  ]);
  if (!settings || !key) throw new AIError("AI belum dikonfigurasi admin (provider, model, atau API key).");
  return { provider: settings.provider as Provider, model: settings.model as string, apiKey: key as string };
}

export async function getVerifierModels(): Promise<string[]> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "verifier_models").single();
  return (data?.value?.models as string[]) ?? [];
}

/** One completion with the admin's provider and key. Caller must call consumeQuota first. */
export async function complete({ system, messages, model, webSearch }: CallOptions): Promise<string> {
  const cfg = await getConfig();
  const m = model || cfg.model;
  let res: Response;

  if (cfg.provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: m,
        max_tokens: 16000,
        system,
        messages,
        ...(webSearch && { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] }),
      }),
    });
    const json = await readJson(res);
    return json.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  }

  if (cfg.provider === "openai") {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: m,
        instructions: system,
        input: messages,
        ...(webSearch && { tools: [{ type: "web_search" }] }),
      }),
    });
    const json = await readJson(res);
    return json.output
      .filter((o: { type: string }) => o.type === "message")
      .flatMap((o: { content: { type: string; text: string }[] }) => o.content)
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text: string }) => c.text)
      .join("");
  }

  res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((x) => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.content }] })),
      ...(webSearch && { tools: [{ google_search: {} }] }),
    }),
  });
  const json = await readJson(res);
  return (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
}

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(`Provider AI menolak permintaan (${res.status}): ${json?.error?.message ?? "tanpa detail"}`);
  return json;
}

/** Pulls the first JSON object/array out of a model reply (models often wrap JSON in prose or fences). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < start) throw new AIError("Balasan AI tidak berisi JSON yang valid.");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
