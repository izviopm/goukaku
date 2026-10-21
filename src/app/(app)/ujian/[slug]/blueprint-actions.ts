"use server";

import { revalidatePath } from "next/cache";
import { AIError, complete, consumeQuota, extractJson, webSearchAvailable } from "@/lib/ai";
import { getUser, requireAdmin } from "@/lib/auth";
import { blueprintError, normalizeBlueprint, type BlueprintRow } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type Source = "web" | "ai" | "user";
export type Suggestion = { rows?: BlueprintRow[]; source?: Source; sourceUrl?: string | null; error?: string };
export type SaveResult = { scope?: "default" | "personal"; error?: string };

const safeUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\/\S+$/.test(u) ? u : null);

/** Draft only: the AI proposes topics and percentages; nothing is saved until the user presses Save. */
export async function suggestBlueprint(examId: string): Promise<Suggestion> {
  const user = await getUser();
  const db = createAdminClient();
  const [{ data: exam }, { data: topics }] = await Promise.all([
    db.from("exams").select("exam_catalog(display_name)").eq("id", examId).single(),
    db.from("questions").select("topic").eq("exam_id", examId).not("topic", "is", null).limit(500),
  ]);
  const name = (exam?.exam_catalog as unknown as { display_name: string } | null)?.display_name;
  if (!name) return { error: "Exam not found" };
  const known = [...new Set((topics ?? []).map((t) => t.topic as string))].slice(0, 60);

  try {
    await consumeQuota(user.id, 1);
    const web = await webSearchAvailable();
    const reply = await complete({
      webSearch: web,
      system:
        `You design exam blueprints. ${web ? "Search the web for the official exam guide first. " : ""}` +
        "Reply ONLY with JSON: " +
        '{"source": "web" | "ai", "source_url": "https://..." | null, "topics": [{"topic": "...", "percentage": 25}]}. ' +
        'Use "web" with the exact URL only if you found an official or authoritative breakdown; otherwise "ai" with source_url null. ' +
        "Use 3 to 12 topics with short names. Percentages must add up to 100." +
        (known.length ? ` Reuse these existing topic names where they fit: ${known.join(", ")}.` : ""),
      messages: [{ role: "user", content: `Exam: ${name}` }],
    });
    const parsed = extractJson<{ source?: string; source_url?: string | null; topics?: BlueprintRow[] }>(reply);
    const rows = normalizeBlueprint(parsed.topics ?? []);
    if (!rows.length) return { error: "The AI did not return a usable blueprint. Try again or set it yourself." };
    const url = safeUrl(parsed.source_url);
    return { rows, source: parsed.source === "web" && url ? "web" : "ai", sourceUrl: url };
  } catch (e) {
    return { error: e instanceof AIError ? e.message : "Could not get a suggestion from the AI." };
  }
}

/** First save for an exam becomes the shared default; after that, saves are personal (PRD 6, hybrid). */
export async function saveBlueprint(examId: string, rows: BlueprintRow[], source: Source, sourceUrl: string | null): Promise<SaveResult> {
  const { id: userId, supabase } = await getUser();
  const clean = rows.map((r) => ({ topic: String(r.topic).trim(), percentage: Number(r.percentage) }));
  const invalid = blueprintError(clean);
  if (invalid) return { error: invalid };

  const db = createAdminClient();
  const { count } = await db.from("exam_blueprints").select("*", { count: "exact", head: true }).eq("exam_id", examId).not("confirmed_by", "is", null);

  if (!count) {
    await db.from("exam_blueprints").delete().eq("exam_id", examId);
    const { error } = await db.from("exam_blueprints").insert(
      clean.map((r) => ({ exam_id: examId, ...r, source, source_url: safeUrl(sourceUrl), confirmed_by: userId })),
    );
    if (error) return { error: error.message };
    await supabase.from("user_blueprints").delete().eq("user_id", userId).eq("exam_id", examId);
    revalidatePath("/ujian/[slug]", "page");
    return { scope: "default" };
  }

  await supabase.from("user_blueprints").delete().eq("user_id", userId).eq("exam_id", examId);
  const { error } = await supabase.from("user_blueprints").insert(clean.map((r) => ({ user_id: userId, exam_id: examId, ...r })));
  if (error) return { error: error.message };
  revalidatePath("/ujian/[slug]", "page");
  return { scope: "personal" };
}

export async function resetBlueprint(examId: string): Promise<SaveResult> {
  const { id, supabase } = await getUser();
  const { error } = await supabase.from("user_blueprints").delete().eq("user_id", id).eq("exam_id", examId);
  if (error) return { error: error.message };
  revalidatePath("/ujian/[slug]", "page");
  return { scope: "default" };
}

/** Admin only: replace the shared default that everyone without a personal blueprint uses. */
export async function saveDefaultBlueprint(examId: string, rows: BlueprintRow[], source: Source, sourceUrl: string | null): Promise<SaveResult> {
  const { id } = await requireAdmin();
  const clean = rows.map((r) => ({ topic: String(r.topic).trim(), percentage: Number(r.percentage) }));
  const invalid = blueprintError(clean);
  if (invalid) return { error: invalid };
  const db = createAdminClient();
  await db.from("exam_blueprints").delete().eq("exam_id", examId);
  const { error } = await db.from("exam_blueprints").insert(clean.map((r) => ({ exam_id: examId, ...r, source, source_url: safeUrl(sourceUrl), confirmed_by: id })));
  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/ujian/[slug]", "page");
  return { scope: "default" };
}
