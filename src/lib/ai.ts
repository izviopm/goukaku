import "server-only";
import { AllFailedError, firstSuccess } from "@/lib/fallback";
import { createAdminClient } from "@/lib/supabase/server";

export type Provider = "openai" | "anthropic" | "gemini" | "openai_compatible";
export type AiModel = { id: string; name: string };
export type ChatMessage = { role: "user" | "assistant"; content: string };
type CallOptions = { system: string; messages: ChatMessage[]; model?: string; webSearch?: boolean };

const LIMIT_MESSAGES: Record<string, string> = {
  AI_DISABLED: "AI is turned off by the admin.",
  GLOBAL_LIMIT: "The app-wide daily AI limit has been reached. Try again tomorrow.",
  USER_CALL_LIMIT: "You have reached your daily AI call limit.",
  USER_QUESTION_LIMIT: "You have reached today's limit for AI-generated questions.",
};

export class AIError extends Error {}
/** Limit or kill switch hit: trying another model would not help. */
export class QuotaError extends AIError {}
/** HTTP error from the provider, with its status. */
export class ProviderError extends AIError {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Every model shares one key, so a key/permission error or a quota stop fails them all. Anything else
// (outage, timeout, rate limit, unknown model, bad JSON) is worth retrying on the next model.
export const isFatal = (e: unknown) => e instanceof QuotaError || (e instanceof ProviderError && (e.status === 401 || e.status === 403));

const TIMEOUT_MS = 120_000;

/** Checks limits and records usage before any AI call (PRD 9). Throws QuotaError with a user-facing message. */
export async function consumeQuota(userId: string, calls: number, questions = 0) {
  const { error } = await createAdminClient().rpc("consume_ai_quota", {
    p_user_id: userId,
    p_calls: calls,
    p_questions: questions,
  });
  if (error) {
    const code = Object.keys(LIMIT_MESSAGES).find((k) => error.message.includes(k));
    throw new QuotaError(code ? LIMIT_MESSAGES[code] : `Could not check the AI limit: ${error.message}`);
  }
}

type Config = { provider: Provider; model: string; models: string[]; baseUrl: string; apiKey: string };

async function getConfig(): Promise<Config> {
  const db = createAdminClient();
  const [{ data: settings }, { data: key }, { data: list }] = await Promise.all([
    db.from("ai_settings").select("provider, model, base_url").eq("id", true).maybeSingle(),
    db.rpc("get_ai_api_key"),
    db.from("app_settings").select("value").eq("key", "ai_models").maybeSingle(),
  ]);
  if (!settings || !key) throw new AIError("AI is not set up yet. Ask the admin to set the provider, model, and API key.");
  return {
    provider: settings.provider as Provider,
    model: settings.model as string,
    models: ((list?.value?.models as AiModel[]) ?? []).map((m) => m.id),
    baseUrl: (settings.base_url as string | null) ?? "",
    apiKey: key as string,
  };
}

/** OpenAI-compatible endpoints have no standard web search tool. */
export async function webSearchAvailable() {
  const { data } = await createAdminClient().from("ai_settings").select("provider").eq("id", true).maybeSingle();
  return !!data && data.provider !== "openai_compatible";
}

export async function getVerifierModels(): Promise<string[]> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "verifier_models").single();
  return (data?.value?.models as string[]) ?? [];
}

/**
 * One completion with the admin's provider and key. Caller must call consumeQuota first.
 * Without an explicit `model`, the main model is tried first and the rest of the admin's list (in order)
 * takes over if it is down.
 */
export async function complete(opts: CallOptions): Promise<string> {
  const cfg = await getConfig();
  const order = opts.model ? [opts.model] : [cfg.model, ...cfg.models.filter((m) => m !== cfg.model)];
  try {
    const { model, value, failed } = await firstSuccess(order, (m) => callModel(cfg, m, opts), isFatal);
    if (failed.length) console.warn(`AI fallback: answered by ${model} after`, failed);
    return value;
  } catch (e) {
    if (!(e instanceof AllFailedError)) throw e;
    throw new AIError(order.length > 1 ? `All AI models are unavailable right now (${e.message}).` : e.message);
  }
}

async function callModel(cfg: Config, m: string, { system, messages, webSearch }: CallOptions): Promise<string> {
  const text = await request(cfg, m, system, messages, webSearch);
  if (!text.trim()) throw new AIError("Empty reply");
  return text;
}

async function request(cfg: Config, m: string, system: string, messages: ChatMessage[], webSearch?: boolean): Promise<string> {
  let res: Response;
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  if (cfg.provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
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

  if (cfg.provider === "openai_compatible") {
    res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: m, messages: [{ role: "system", content: system }, ...messages] }),
    });
    const json = await readJson(res);
    return json.choices?.[0]?.message?.content ?? "";
  }

  if (cfg.provider === "openai") {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
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
    signal,
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
  if (!res.ok) throw new ProviderError(res.status, `The AI provider rejected the request (${res.status}): ${json?.error?.message ?? "no details"}`);
  return json;
}

/** Pulls the first JSON object/array out of a model reply (models often wrap JSON in prose or fences). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < start) throw new AIError("The AI reply did not contain valid JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
