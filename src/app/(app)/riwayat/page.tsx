import Link from "next/link";
import { ChartLine, ChevronRight, History, Target, Trophy } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, EmptyState, Hero, StatTile } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";

const STATUS: Record<string, { label: string; tone: "primary" | "accent" }> = {
  in_progress: { label: "In progress", tone: "primary" },
  finished: { label: "Finished", tone: "primary" },
  abandoned: { label: "Left", tone: "accent" },
};
const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

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
  const { data } = await query;

  const sims = (data ?? []).map((s) => ({
    ...s,
    name: (s.exams as unknown as { exam_catalog: { display_name: string } }).exam_catalog.display_name,
    href: s.status === "in_progress" ? `/simulasi/${s.id}` : `/riwayat/${s.id}`,
  }));
  const finished = sims.filter((s) => s.status === "finished" && s.score != null);
  const best = finished.length ? Math.max(...finished.map((s) => Number(s.score))) : null;
  const avg = finished.length ? Math.round(finished.reduce((a, s) => a + Number(s.score), 0) / finished.length) : null;

  return (
    <>
      <Hero eyebrow="History" title={exam ? exam.display_name : "All practice exams"}>
        Every run is saved with a snapshot of its questions, so past results never change.
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile icon={History} label="Runs" value={sims.length} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={ChartLine} label="Average score" value={avg ?? "–"} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Trophy} label="Best score" value={best ?? "–"} tone="accent" />
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.1}>
        {sims.length === 0 ? (
          <EmptyState icon={Target} title="No practice exams yet">
            Start one from an exam page. Your results will show up here.
          </EmptyState>
        ) : (
          <>
            {/* Phones: cards. */}
            <ul className="flex flex-col gap-3 sm:hidden">
              {sims.map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-semibold">{s.name}</span>
                      <span className="text-sm text-muted-foreground">{fmt.format(new Date(s.started_at))}</span>
                      <span className="flex flex-wrap gap-2">
                        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                        <Badge>{s.size} questions</Badge>
                      </span>
                    </div>
                    <span className="text-2xl font-bold tabular-nums">{s.score ?? "–"}</span>
                    <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet and up: table. */}
            <Card className="hidden overflow-x-auto p-0 sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Date</th>
                    <th scope="col" className="px-4 py-3 font-medium">Exam</th>
                    <th scope="col" className="px-4 py-3 font-medium">Feedback</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Questions</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Score</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sims.map((s) => (
                    <tr key={s.id} className="border-b transition-colors duration-150 last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={s.href} className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {fmt.format(new Date(s.started_at))}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{s.name}</td>
                      <td className="px-4 py-3">{s.feedback_mode === "instant" ? "Instant" : "At the end"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.size}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{s.score ?? "–"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </Reveal>
    </>
  );
}
