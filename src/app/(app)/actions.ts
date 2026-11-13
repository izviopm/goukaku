"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { findCatalog, findOrCreateExam } from "@/lib/exams";
import { examDisplayName } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type CreateExamState = { error?: string };

/** Adds an exam that already exists in the catalog to the user's dashboard. */
export async function joinExam(form: FormData) {
  const user = await getUser();
  const catalog = await findCatalog(String(form.get("slug") ?? ""));
  if (!catalog) return;
  const { slug } = await findOrCreateExam(catalog.display_name, user.id);
  redirect(`/ujian/${slug}`);
}

export async function createExam(_prev: CreateExamState, form: FormData): Promise<CreateExamState> {
  const user = await getUser();
  const certification = String(form.get("certification") ?? "").trim();
  const subject = String(form.get("module") ?? "").trim();
  if (certification.length < 2 || certification.length > 100) return { error: "Certification must be 2–100 characters" };
  if (!subject || subject.length > 100) return { error: "Module is required (use General when the exam has no module)" };
  const name = examDisplayName(certification, subject);
  if (name.length > 100) return { error: "Certification and module are too long together" };
  let slug: string;
  try {
    // "CGI" + "002 Hukum" joins the existing "CGI 002" bank instead of starting an empty one.
    const code = subject.match(/\b\d{3}\b/)?.[0];
    const byCode = code && !(await findCatalog(name)) ? await findCatalog(examDisplayName(certification, code)) : null;
    ({ slug } = await findOrCreateExam(byCode?.display_name ?? name, user.id));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the exam" };
  }
  redirect(`/ujian/${slug}`);
}
