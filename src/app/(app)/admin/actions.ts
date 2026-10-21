"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/exams";
import { modelSettingsError, type ModelSettings } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminState = { error?: string; message?: string };

const int = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

function done(message: string): AdminState {
  revalidatePath("/admin");
  return { message };
}

export async function createUser(_p: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email" };
  if (password.length < 8) return { error: "The password needs at least 8 characters" };
  const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  return done(`Account ${email} created`);
}

export async function saveAiSettings(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const provider = String(form.get("provider"));
  const key = String(form.get("apiKey") ?? "").trim();
  const baseUrl = String(form.get("baseUrl") ?? "").trim();
  if (!["openai", "anthropic", "gemini", "openai_compatible"].includes(provider)) return { error: "Unknown provider" };
  if (provider === "openai_compatible" && !/^https?:\/\/\S+$/.test(baseUrl)) return { error: "Enter a base URL, for example https://openrouter.ai/api/v1" };

  let settings: ModelSettings;
  try {
    const raw = JSON.parse(String(form.get("models") ?? "[]")) as { id: unknown; name: unknown }[];
    settings = {
      models: raw.map((m) => ({ id: String(m.id ?? "").trim(), name: String(m.name ?? "").trim() })),
      main: String(form.get("main") ?? ""),
      verifiers: form.getAll("verifiers").map(String),
    };
  } catch {
    return { error: "The model list is invalid" };
  }
  const invalid = modelSettingsError(settings);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("ai_settings").upsert({
    id: true,
    provider,
    model: settings.main,
    base_url: provider === "openai_compatible" ? baseUrl : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  if (key) {
    const { error: e } = await supabase.rpc("set_ai_api_key", { p_key: key });
    if (e) return { error: e.message };
  }
  const { error: e2 } = await supabase.from("app_settings").upsert([
    { key: "ai_models", value: { models: settings.models } },
    // List order is priority order: the first verifiers are used, later ones are backups.
    { key: "verifier_models", value: { models: settings.models.map((m) => m.id).filter((id) => settings.verifiers.includes(id)) } },
  ]);
  if (e2) return { error: e2.message };
  return done(key ? "AI settings and API key saved" : "AI settings saved");
}

export async function saveLimits(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const calls = int(form.get("calls"));
  const questions = int(form.get("questions"));
  const global = int(form.get("global"));
  if ([calls, questions, global].some((n) => Number.isNaN(n))) return { error: "Limits must be whole numbers of 0 or more (leave empty for no limit)" };
  const { error } = await supabase.from("app_settings").upsert([
    { key: "default_limits", value: { ai_calls_per_day: calls, questions_generated_per_day: questions } },
    { key: "global_daily_limit", value: { calls_per_day: global } },
    { key: "ai_kill_switch", value: { enabled: form.get("kill") === "on" } },
  ]);
  if (error) return { error: error.message };
  return done("Limits saved");
}

export async function saveUserLimit(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase, id } = await requireAdmin();
  const userId = String(form.get("userId"));
  const calls = int(form.get("calls"));
  const questions = int(form.get("questions"));
  if ([calls, questions].some((n) => Number.isNaN(n))) return { error: "Limits must be whole numbers of 0 or more" };
  const { error } = await supabase.from("user_limits").upsert({
    user_id: userId,
    ai_calls_per_day: calls,
    questions_generated_per_day: questions,
    unlimited: form.get("unlimited") === "on",
    note: String(form.get("note") ?? "").trim() || null,
    set_by: id,
    set_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return done("User limits saved");
}

export async function saveCatalog(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const lang = String(form.get("language") ?? "");
  const pass = String(form.get("pass_score") ?? "").trim();
  const passNum = pass === "" ? null : Number(pass);
  if (passNum != null && !(passNum >= 0 && passNum <= 100)) return { error: "Passing score must be between 0 and 100" };
  const aliases = String(form.get("aliases") ?? "").split(",").map(slugify).filter(Boolean);
  const { error } = await supabase
    .from("exam_catalog")
    .update({
      display_name: String(form.get("display_name") ?? "").trim(),
      aliases: [...new Set([String(form.get("slug")), ...aliases])],
      language: lang === "id" || lang === "en" ? lang : null,
      pass_score: passNum,
      pass_score_source: passNum == null ? null : String(form.get("pass_score_source") || "user"),
    })
    .eq("id", String(form.get("id")));
  if (error) return { error: error.message };
  return done("Catalog saved");
}
