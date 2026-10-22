import { notFound } from "next/navigation";
import { ChartColumn, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, ProgressBar, SectionTitle } from "@/components/ui";
import { ReportQuestion } from "@/components/report";
import { getUser } from "@/lib/auth";
import { LETTERS } from "@/lib/rules";
import { topicStats } from "@/lib/stats";

type Snapshot = { body: string; options: string[]; answer: string; explanation: string | null; topic: string | null };

export default async function HistoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data: sim } = await supabase.from("simulations").select("*, exams(exam_catalog(display_name))").eq("id", id).maybeSingle();
  if (!sim) notFound();

  const { data: items } = await supabase
    .from("simulation_items")
    .select("id, position, question_id, snapshot, user_answer, is_correct, answered_at, questions(answer)")
    .eq("simulation_id", id)
    .order("position");

  const name = (sim.exams as unknown as { exam_catalog: { display_name: string } }).exam_catalog.display_name;
  const answeredItems = (items ?? []).filter((x) => x.answered_at);
  const stats = topicStats(answeredItems);
  const correct = answeredItems.filter((x) => x.is_correct).length;
  const score = sim.score != null ? Number(sim.score) : null;
  const passed = sim.pass_score_snapshot != null && score != null ? score >= Number(sim.pass_score_snapshot) : null;
  const status = sim.status === "abandoned" ? "left early" : sim.status === "finished" ? "finished" : "in progress";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Reveal>
        <section
          aria-live="polite"
          className={`relative overflow-hidden rounded-2xl p-6 shadow-sm sm:p-8 ${passed === false ? "bg-accent-soft text-accent-foreground" : "bg-linear-to-br from-primary to-primary-strong text-white"}`}
        >
          <div aria-hidden="true" className="pattern-seigaiha absolute inset-0" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium opacity-90">
                {sim.feedback_mode === "instant" ? "Instant feedback" : "Feedback at the end"} · {status}
              </p>
              <h1 className="text-2xl font-bold sm:text-3xl">{name}</h1>
              <p className="opacity-90">
                {correct} of {sim.size} correct
                {sim.pass_score_snapshot != null && ` · passing score ${sim.pass_score_snapshot}`}
              </p>
              {passed != null && (
                <p className="mt-2 flex items-center gap-2 font-semibold">
                  {passed ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
                  {passed ? "Passed" : "Not passed yet"}
                </p>
              )}
            </div>
            <p className="text-5xl font-bold tabular-nums sm:text-6xl">{score ?? "–"}</p>
          </div>
        </section>
      </Reveal>

      {stats.length > 0 && (
        <Reveal delay={0.08}>
          <Card>
            <SectionTitle icon={ChartColumn}>Score by topic</SectionTitle>
            <ul className="flex flex-col gap-4 text-sm">
              {stats.map((s) => (
                <li key={s.topic} className="flex flex-col gap-2">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">{s.topic}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.correct}/{s.total} · <span className="font-semibold text-foreground">{s.pct}%</span>
                    </span>
                  </div>
                  <ProgressBar value={s.pct} tone={s.pct < 60 ? "accent" : "primary"} />
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      )}

      <Stagger as="ul" className="flex flex-col gap-4">
        {(items ?? []).map((it) => {
          const s = it.snapshot as Snapshot;
          const current = it.questions as unknown as { answer: string | null } | null;
          const keyChanged = current && current.answer !== s.answer;
          return (
            <StaggerItem as="li" key={it.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Question {it.position}</span>
                  {s.topic && <Badge>{s.topic}</Badge>}
                  {keyChanged && <Badge tone="accent">Answer key updated after this exam</Badge>}
                </div>
                <p className="max-w-prose whitespace-pre-wrap">{s.body}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {s.options.map((o, k) => {
                    const l = LETTERS[k];
                    const isKey = l === s.answer;
                    const picked = l === it.user_answer;
                    return (
                      <li key={l} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${isKey ? "border-success bg-success/10" : picked ? "border-accent-text bg-accent-soft" : ""}`}>
                        <span className="font-semibold">{l}.</span>
                        <span className="flex-1">{o}</span>
                        {isKey && <span className="font-medium text-success">Correct answer</span>}
                        {picked && <span className="font-medium">{isKey ? "· Yours" : "Your answer"}</span>}
                      </li>
                    );
                  })}
                </ul>
                <p className={`flex items-center gap-2 text-sm font-semibold ${it.is_correct ? "text-success" : it.user_answer ? "text-accent-text" : "text-muted-foreground"}`}>
                  {it.is_correct ? <CircleCheck aria-hidden="true" className="size-4" /> : it.user_answer ? <CircleX aria-hidden="true" className="size-4" /> : <CircleMinus aria-hidden="true" className="size-4" />}
                  {it.is_correct ? "Correct" : it.user_answer ? "Wrong" : "Not answered"}
                </p>
                {s.explanation && <p className="rounded-lg bg-muted p-3 text-sm">{s.explanation}</p>}
                <ReportQuestion questionId={it.question_id} />
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
