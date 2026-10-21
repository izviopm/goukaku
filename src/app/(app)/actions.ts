"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { findOrCreateExam } from "@/lib/exams";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type CreateExamState = { error?: string };

export async function createExam(_prev: CreateExamState, form: FormData): Promise<CreateExamState> {
  const user = await getUser();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 100) return { error: "Nama ujian 2–100 karakter" };
  let slug: string;
  try {
    ({ slug } = await findOrCreateExam(name, user.id));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal membuat ujian" };
  }
  redirect(`/ujian/${slug}`);
}
