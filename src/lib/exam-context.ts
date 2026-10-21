import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type ExamIdentity = { full_name: string; issuer?: string | null; scope?: string | null; country?: string | null; summary: string };

/** One line every AI prompt gets, so "CGI" means Certified General Insurance and not computer graphics. */
export function describeExam(name: string, identity: ExamIdentity | null) {
  if (!identity) return name;
  const head = [identity.full_name, identity.issuer && `(${identity.issuer})`].filter(Boolean).join(" ");
  const parts = [head, identity.scope, identity.country].filter(Boolean).join(" · ");
  return `${parts}. ${identity.summary}`.trim();
}

export async function examContext(examId: string) {
  const { data } = await createAdminClient().from("exams").select("exam_catalog(id, display_name, language, identity)").eq("id", examId).single();
  const c = data?.exam_catalog as unknown as { id: string; display_name: string; language: "id" | "en" | null; identity: ExamIdentity | null } | null;
  if (!c) throw new Error("Exam not found");
  return { catalogId: c.id, name: c.display_name, language: c.language, identity: c.identity, text: describeExam(c.display_name, c.identity) };
}
