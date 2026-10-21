import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";

const STATUS: Record<string, string> = { in_progress: "Berjalan", finished: "Selesai", abandoned: "Ditinggalkan" };
const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ ujian?: string }> }) {
  const { ujian } = await searchParams;
  const { supabase, id } = await getUser();
  const exam = ujian ? await getExamBySlug(ujian) : null;

  let query = supabase
    .from("simulations")
    .select("id, started_at, feedback_mode, size, score, status, pass_score_snapshot, exams(exam_catalog(display_name))")
    .eq("user_id", id)
    .order("started_at", { ascending: false })
    .limit(200);
  if (exam) query = query.eq("exam_id", exam.examId);
  const { data: sims } = await query;

  return (
    <>
      <PageTitle sub={exam ? `Ujian: ${exam.display_name}` : "Semua ujian"}>Riwayat</PageTitle>
      <Card className="overflow-x-auto p-0 sm:p-0">
        {!sims?.length ? (
          <p className="p-6 text-muted-foreground">Belum ada simulasi.</p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Tanggal</th>
                <th scope="col" className="px-4 py-3 font-medium">Ujian</th>
                <th scope="col" className="px-4 py-3 font-medium">Mode</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Soal</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Skor</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sims.map((s) => {
                const name = (s.exams as unknown as { exam_catalog: { display_name: string } }).exam_catalog.display_name;
                const href = s.status === "in_progress" ? `/simulasi/${s.id}` : `/riwayat/${s.id}`;
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={href} className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {fmt.format(new Date(s.started_at))}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3">{s.feedback_mode === "instant" ? "Langsung" : "Di akhir"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.size}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.score ?? "–"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={s.status === "abandoned" ? "accent" : "primary"}>{STATUS[s.status]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
