import { notFound } from "next/navigation";
import {
  ChartColumn,
  CircleCheck,
  Flag,
  History,
  Hourglass,
  Languages,
  ListTree,
  Play,
  Target,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Badge, Card, EmptyState, Hero, LinkButton, ProgressBar, SectionTitle, StatTile } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";
import { topicStats } from "@/lib/stats";
import { BlueprintEditor } from "./blueprint-editor";
import { Chat } from "./chat";
import { GoalForm, StartSimulationForm, UploadForms } from "./forms";

export const maxDuration = 300; // uploads run AI extraction + verification inline

const SOURCE = { web: "web", user: "you" } as Record<string, string>;

export default async function ExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await getExamBySlug(slug);
  if (!exam) notFound();
  const { supabase, id: userId } = await getUser();

  const [{ data: pool }, { data: blueprint }, { data: defaults }, { data: topicRows }, { data: goal }, { data: items }] = await Promise.all([
    supabase.from("user_exam_pool").select("questions(answer_status, status)").eq("exam_id", exam.examId).eq("user_id", userId),
    supabase.rpc("effective_blueprint", { p_exam_id: exam.examId }),
    supabase.from("exam_blueprints").select("topic, source_url").eq("exam_id", exam.examId).not("confirmed_by", "is", null),
    supabase.from("questions").select("topic").eq("exam_id", exam.examId).not("topic", "is", null).limit(1000),
    supabase.from("user_exam_goal").select("target_score, exam_size").eq("exam_id", exam.examId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("simulation_items")
      .select("is_correct, snapshot, simulations!inner(exam_id, status)")
      .eq("simulations.exam_id", exam.examId)
      .neq("simulations.status", "in_progress")
      .not("answered_at", "is", null),
  ]);

  const qs = (pool ?? []).map((p) => p.questions as unknown as { answer_status: string; status: string });
  const ready = qs.filter((q) => q.answer_status === "verified" && q.status === "active").length;
  const pending = qs.filter((q) => q.answer_status === "unverified").length;
  const disputed = qs.filter((q) => q.answer_status === "disputed" || q.status === "hidden").length;
  const stats = topicStats(items ?? []);
  const weak = stats.filter((s) => s.total >= 3 && s.pct < 60);
  const bp = ((blueprint ?? []) as { topic: string; percentage: number; personal: boolean }[]).sort((a, b) => b.percentage - a.percentage);
  const personal = bp.some((b) => b.personal);
  const topicSuggestions = [...new Set([...(defaults ?? []).map((d) => d.topic), ...(topicRows ?? []).map((t) => t.topic as string)])].sort();
  const passScore = goal?.target_score ?? exam.pass_score;

  return (
    <div className="flex flex-col gap-6">
      <Hero
        eyebrow="Exam"
        title={exam.display_name}
        actions={
          <>
            <LinkButton href="#practice" variant="accent">
              <Play aria-hidden="true" className="size-4" />
              Start practice
            </LinkButton>
            <LinkButton href={`/riwayat?ujian=${slug}`} variant="outline">
              <History aria-hidden="true" className="size-4" />
              History
            </LinkButton>
          </>
        }
      >
        <span className="mt-1 flex flex-wrap gap-2">
          <Badge>
            <Languages aria-hidden="true" className="size-3.5" />
            {exam.language === "en" ? "English" : exam.language === "id" ? "Indonesian" : "Language not set"}
          </Badge>
          <Badge>
            <Flag aria-hidden="true" className="size-3.5" />
            {passScore != null
              ? `Passing score ${passScore}${goal ? " (personal target)" : exam.pass_score_source ? ` (${SOURCE[exam.pass_score_source]})` : ""}`
              : "No passing score yet"}
          </Badge>
        </span>
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile icon={CircleCheck} label="Ready to practice" value={ready} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Hourglass} label="Awaiting verification" value={pending} tone="muted" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={TriangleAlert} label="Disputed or hidden" value={disputed} tone="accent" />
        </StaggerItem>
      </Stagger>

      <Reveal className="grid gap-4 lg:grid-cols-2" delay={0.12}>
        <Card id="practice" className="scroll-mt-6">
          <SectionTitle icon={Play}>Start a practice exam</SectionTitle>
          <StartSimulationForm examId={exam.examId} ready={ready} />
        </Card>
        <Card>
          <SectionTitle icon={ChartColumn}>Topic analysis</SectionTitle>
          {stats.length === 0 ? (
            <EmptyState icon={ChartColumn} title="No data yet">
              Finish one practice exam to see your score per topic and which topics need more work.
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col gap-4 text-sm">
                {stats.map((s) => (
                  <li key={s.topic} className="flex flex-col gap-2">
                    <div className="flex justify-between gap-4">
                      <span className="font-medium">{s.topic}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.correct}/{s.total} · <span className="font-semibold text-foreground">{s.pct}%</span>
                      </span>
                    </div>
                    <ProgressBar value={s.pct} tone={s.total >= 3 && s.pct < 60 ? "accent" : "primary"} />
                  </li>
                ))}
              </ul>
              {weak.length > 0 && (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-accent-soft p-3 text-sm text-accent-foreground">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-semibold">Weak topics:</span> {weak.map((w) => w.topic).join(", ")}
                  </span>
                </p>
              )}
            </>
          )}
        </Card>
      </Reveal>

      <Chat examId={exam.examId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={Target}>Goal</SectionTitle>
          <GoalForm
            examId={exam.examId}
            language={exam.language}
            target={goal?.target_score ?? null}
            examSize={goal?.exam_size ?? null}
            officialPass={exam.pass_score}
          />
        </Card>
        <Card>
          <SectionTitle icon={ListTree}>Blueprint</SectionTitle>
          <BlueprintEditor
            examId={exam.examId}
            initial={bp.map(({ topic, percentage }) => ({ topic, percentage: Number(percentage) }))}
            personal={personal}
            hasDefault={(defaults ?? []).length > 0}
            sourceUrl={(defaults ?? []).find((d) => d.source_url)?.source_url ?? null}
            topicSuggestions={topicSuggestions}
          />
        </Card>
      </div>

      <Card>
        <SectionTitle icon={Upload}>Add questions</SectionTitle>
        <UploadForms examId={exam.examId} />
      </Card>
    </div>
  );
}
