"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { findOrCreateExam } from "@/lib/exams";
import { examDisplayName } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type CreateExamState = { error?: string };

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
    ({ slug } = await findOrCreateExam(name, user.id));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the exam" };
  }
  redirect(`/ujian/${slug}`);
}
