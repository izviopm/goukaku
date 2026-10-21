import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { CreateExamForm } from "./create-exam-form";

export default async function Dashboard() {
  const { supabase, id } = await getUser();
  const { data: exams } = await supabase
    .from("user_exams")
    .select("exam_id, exams(exam_catalog(slug, display_name))")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  const list = (exams ?? []).map((e) => (e.exams as unknown as { exam_catalog: { slug: string; display_name: string } }).exam_catalog);

  return (
    <>
      <PageTitle sub="Pilih ujian untuk menambah soal, renshuu, atau melihat analisis.">Dashboard</PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Ujian kamu</h2>
          {list.length === 0 ? (
            <p className="text-muted-foreground">Belum ada ujian. Buat yang pertama di samping.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {list.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/ujian/${c.slug}`}
                    className="flex min-h-11 items-center justify-between rounded-md px-2 py-3 font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.display_name}
                    <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Buat ujian baru</h2>
          <CreateExamForm />
        </Card>
      </div>
    </>
  );
}
