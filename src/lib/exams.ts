import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** "CGI", " cgi " and "C.G.I" all map to slug "cgi". */
export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function findCatalog(name: string) {
  const slug = slugify(name);
  if (!slug) return null;
  const { data } = await createAdminClient()
    .from("exam_catalog")
    .select("*")
    .or(`slug.eq.${slug},aliases.cs.{${slug}}`)
    .limit(1)
    .maybeSingle();
  return data;
}

/** PRD 3: map the name to the catalog, create catalog + exam if new, and put it on the user's dashboard. */
export async function findOrCreateExam(name: string, userId: string) {
  const db = createAdminClient();
  const slug = slugify(name);
  if (!slug) throw new Error("Nama ujian tidak valid");

  let catalog = await findCatalog(name);
  if (!catalog) {
    const { data, error } = await db
      .from("exam_catalog")
      .upsert({ slug, display_name: name.trim(), aliases: [slug] }, { onConflict: "slug" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    catalog = data;
  }

  await db.from("exams").upsert({ catalog_id: catalog.id, created_by: userId }, { onConflict: "catalog_id", ignoreDuplicates: true });
  const { data: exam, error } = await db.from("exams").select("id").eq("catalog_id", catalog.id).single();
  if (error) throw new Error(error.message);

  await db.from("user_exams").upsert({ user_id: userId, exam_id: exam.id }, { ignoreDuplicates: true });
  return { slug: catalog.slug as string, examId: exam.id as string };
}

/** Catalog row plus its exam id. Shared data, so no per-user filter. */
export async function getExamBySlug(slug: string) {
  const { data } = await createAdminClient()
    .from("exam_catalog")
    .select("*, exams(id)")
    .eq("slug", slug)
    .maybeSingle();
  const exam = data?.exams as unknown as { id: string } | null;
  if (!data || !exam) return null;
  return { ...data, examId: exam.id };
}
