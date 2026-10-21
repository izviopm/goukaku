"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/exams";
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
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Email tidak valid" };
  if (password.length < 8) return { error: "Password minimal 8 karakter" };
  const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  return done(`Akun ${email} dibuat`);
}

export async function saveAiSettings(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const provider = String(form.get("provider"));
  const model = String(form.get("model") ?? "").trim();
  const key = String(form.get("apiKey") ?? "").trim();
  const verifiers = String(form.get("verifiers") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!["openai", "anthropic", "gemini"].includes(provider)) return { error: "Provider tidak dikenal" };
  if (!model) return { error: "Model wajib diisi" };
  if (verifiers.length && new Set(verifiers).size < 2) return { error: "Model verifikasi minimal 2 model berbeda" };

  const { error } = await supabase.from("ai_settings").upsert({ id: true, provider, model, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  if (key) {
    const { error: e } = await supabase.rpc("set_ai_api_key", { p_key: key });
    if (e) return { error: e.message };
  }
  const { error: e2 } = await supabase.from("app_settings").upsert({ key: "verifier_models", value: { models: [...new Set(verifiers)] } });
  if (e2) return { error: e2.message };
  return done(key ? "Pengaturan AI dan API key disimpan" : "Pengaturan AI disimpan");
}

export async function saveLimits(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const calls = int(form.get("calls"));
  const questions = int(form.get("questions"));
  const global = int(form.get("global"));
  if ([calls, questions, global].some((n) => Number.isNaN(n))) return { error: "Limit harus bilangan bulat ≥ 0 (atau kosong = tanpa batas)" };
  const { error } = await supabase.from("app_settings").upsert([
    { key: "default_limits", value: { ai_calls_per_day: calls, questions_generated_per_day: questions } },
    { key: "global_daily_limit", value: { calls_per_day: global } },
    { key: "ai_kill_switch", value: { enabled: form.get("kill") === "on" } },
  ]);
  if (error) return { error: error.message };
  return done("Limit disimpan");
}

export async function saveUserLimit(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase, id } = await requireAdmin();
  const userId = String(form.get("userId"));
  const calls = int(form.get("calls"));
  const questions = int(form.get("questions"));
  if ([calls, questions].some((n) => Number.isNaN(n))) return { error: "Limit harus bilangan bulat ≥ 0" };
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
  return done("Limit user disimpan");
}

export async function saveCatalog(_p: AdminState, form: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const lang = String(form.get("language") ?? "");
  const pass = String(form.get("pass_score") ?? "").trim();
  const passNum = pass === "" ? null : Number(pass);
  if (passNum != null && !(passNum >= 0 && passNum <= 100)) return { error: "Nilai lulus 0–100" };
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
  return done("Katalog disimpan");
}
