import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChartColumn, CircleCheck, ListChecks, Sparkles, Target, TriangleAlert } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, EmptyState, Hero, LinkButton, ProgressBar, SectionTitle, StatTile } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";
import { normalize } from "@/lib/rules";

type Status = "mastered" | "review" | "learning" | "new";
const STATUS: Record<Status, { label: string; tone: "primary" | "accent" }> = {
  mastered: { label: "Mastered", tone: "primary" },
  review: { label: "Needs review", tone: "accent" },
  learning: { label: "Learning", tone: "primary" },
  new: { label: "New", tone: "primary" },
};
const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "review", label: "Needs review" },
  { key: "learning", label: "Learning" },
  { key: "mastered", label: "Mastered" },
  { key: "new", label: "New" },
];

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ slug }, { status: filterParam }] = await Promise.all([params, searchParams]);
  const exam = await getExamBySlug(slug);
  if (!exam) notFound();
  const { supabase, id: userId } = await getUser();

  const [{ data: blueprint }, { data: progress }, { data: bank }] = await Promise.all([
    supabase.rpc("effective_blueprint", { p_exam_id: exam.examId }),
    supabase
      .from("user_progress")
      .select("question_id, correct_count, wrong_count, correct_streak, last_correct, last_answered_at")
      .eq("user_id", userId),
    supabase.from("questions").select("id, body, topic").eq("exam_id", exam.examId).eq("answer_status", "verified").eq("status", "active").limit(2000),
  ]);

  const display = new Map(((blueprint ?? []) as { topic: string }[]).map((b) => [normalize(b.topic), b.topic]));
  const prog = new Map((progress ?? []).map((p) => [p.question_id, p]));
  const rows = (bank ?? []).map((q) => {
    const p = prog.get(q.id);
    const status: Status = !p ? "new" : p.correct_streak >= 3 ? "mastered" : p.last_correct === false ? "review" : "learning";
    return {
      id: q.id,
      body: q.body as string,
      topic: display.get(normalize(q.topic ?? "")) ?? q.topic ?? "No topic",
      correct: p?.correct_count ?? 0,
      wrong: p?.wrong_count ?? 0,
      status,
    };
  });

  const counts = { new: 0, review: 0, learning: 0, mastered: 0 } as Record<Status, number>;
  rows.forEach((r) => counts[r.status]++);
  const topics = [...rows.reduce((m, r) => {
    const t = m.get(r.topic) ?? { correct: 0, wrong: 0, total: 0 };
    t.correct += r.correct;
    t.wrong += r.wrong;
    t.total++;
    return m.set(r.topic, t);
  }, new Map<string, { correct: number; wrong: number; total: number }>())]
    .map(([topic, t]) => ({ topic, ...t, pct: t.correct + t.wrong ? Math.round((100 * t.correct) / (t.correct + t.wrong)) : null }))
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

  const filter = (FILTERS.some((f) => f.key === filterParam) ? filterParam : "all") as Status | "all";
  const list = rows
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => b.wrong - a.wrong || a.correct - b.correct)
    .slice(0, 300);

  return (
    <div className="flex flex-col gap-6">
      <Hero
        eyebrow="Analytics"
        title={exam.display_name}
        actions={
          <LinkButton href={`/ujian/${slug}`} variant="outline">
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to exam
          </LinkButton>
        }
      >
        Every answer you give is counted, including repeats, so you can see which questions you keep getting wrong.
      </Hero>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile icon={Target} label="Mastered" value={counts.mastered} hint="3 correct in a row" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={TriangleAlert} label="Needs review" value={counts.review} tone="accent" hint="Last answer wrong" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={ListChecks} label="Learning" value={counts.learning} tone="muted" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Sparkles} label="Not seen yet" value={counts.new} tone="ai" />
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.08}>
        <Card>
          <SectionTitle icon={ChartColumn}>By topic</SectionTitle>
          {topics.length === 0 ? (
            <EmptyState icon={ChartColumn} title="No verified questions yet" />
          ) : (
            <ul className="flex flex-col gap-4 text-sm">
              {topics.map((t) => (
                <li key={t.topic} className="flex flex-col gap-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{t.topic}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {t.correct} correct · {t.wrong} wrong · {t.total} questions
                      {t.pct != null && <span className="font-semibold text-foreground"> · {t.pct}%</span>}
                    </span>
                  </div>
                  <ProgressBar value={t.pct ?? 0} tone={t.pct != null && t.correct + t.wrong >= 3 && t.pct < 60 ? "accent" : "primary"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.12}>
        <Card>
          <SectionTitle icon={ListChecks}>Questions</SectionTitle>
          <nav aria-label="Filter questions" className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? `/ujian/${slug}/analisis` : `/ujian/${slug}/analisis?status=${f.key}`}
                aria-current={filter === f.key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 ${
                  filter === f.key ? "border-primary bg-primary text-white" : "bg-card hover:bg-muted"
                }`}
              >
                {f.label}
                {f.key !== "all" && <span className="ml-1.5 tabular-nums opacity-80">{counts[f.key]}</span>}
              </Link>
            ))}
          </nav>
          {list.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing here" />
          ) : (
            <ul className="flex flex-col divide-y">
              {list.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2">{r.body}</p>
                    <p className="text-xs text-muted-foreground">{r.topic}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="tabular-nums">
                      <span className="font-semibold text-success">{r.correct}</span> correct · <span className="font-semibold text-accent-text">{r.wrong}</span> wrong
                    </span>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
