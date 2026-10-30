import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  ChartColumn,
  CircleCheck,
  FileText,
  Flag,
  History,
  Hourglass,
  Languages,
  ListTree,
  Lock,
  Play,
  RefreshCcw,
  Settings2,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, Hero, LinkButton, ProgressBar, SectionTitle, StatTile } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";
import { normalize } from "@/lib/rules";
import type { Readiness } from "./actions";
import { AddQuestions } from "./add-questions";
import { BlueprintEditor } from "./blueprint-editor";
import { Chat } from "./chat";
import type { ExamIdentity } from "@/lib/exam-context";
import { ExamIdentityChat, IdentityCard } from "./exam-identity";
import { GoalForm } from "./forms";
import { StartPractice } from "./start-practice";

export const maxDuration = 300;

const MIN_TO_PRACTICE = 10;

export default async function ExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await getExamBySlug(slug);
  if (!exam) notFound();
  const { supabase, id: userId } = await getUser();

  const [{ data: blueprint }, { data: defaults }, { data: topicRows }, { data: goal }, { count: pending }, { data: progress }, { data: activeJobs }] = await Promise.all([
    supabase.rpc("effective_blueprint", { p_exam_id: exam.examId }),
    supabase.from("exam_blueprints").select("topic, source_url").eq("exam_id", exam.examId).not("confirmed_by", "is", null),
    supabase.from("questions").select("topic").eq("exam_id", exam.examId).not("topic", "is", null).limit(1000),
    supabase.from("user_exam_goal").select("target_score, exam_size").eq("exam_id", exam.examId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", exam.examId)
      .eq("type", exam.format ?? "mcq")
      .eq("answer_status", "unverified")
      .eq("status", "active"),
    supabase
      .from("user_progress")
      .select("correct_count, wrong_count, correct_streak, last_correct, questions!inner(exam_id, type, topic)")
      .eq("user_id", userId)
      .eq("questions.exam_id", exam.examId)
      .eq("questions.type", exam.format ?? "mcq"),
    // Jobs still in flight, so their progress shows again after a refresh.
    supabase.from("ai_jobs").select("id, kind").eq("exam_id", exam.examId).eq("user_id", userId).in("status", ["queued", "running"]).order("created_at", { ascending: false }),
  ]);
  const activeJob = (kind: string) => (activeJobs ?? []).find((j) => j.kind === kind)?.id;

  const bp = ((blueprint ?? []) as { topic: string; percentage: number; personal: boolean }[]).sort((a, b) => b.percentage - a.percentage);
  const defaultSize = Math.min(goal?.exam_size ?? 20, 200);
  const { data: readinessData } = bp.length ? await supabase.rpc("exam_readiness", { p_exam_id: exam.examId, p_size: defaultSize }) : { data: [] };
  const readiness = (readinessData ?? []) as Readiness[];

  const verified = readiness.reduce((s, r) => s + r.available, 0);
  const unanswered = readiness.reduce((s, r) => s + r.unanswered, 0);
  const minimum = Math.min(MIN_TO_PRACTICE, goal?.exam_size ?? MIN_TO_PRACTICE);
  const identity = exam.identity as ExamIdentity | null;
  const goalDone = !!identity && !!goal && !!exam.language && !!exam.format;
  const blueprintDone = bp.length > 0;
  const questionsDone = verified >= minimum;
  const practice = goalDone && blueprintDone && questionsDone;

  const topicSuggestions = [...new Set([...(defaults ?? []).map((d) => d.topic), ...(topicRows ?? []).map((t) => t.topic as string)])].sort();
  const passScore = goal?.target_score ?? exam.pass_score;

  const identityBlock = identity ? (
    <div className="flex flex-col gap-2">
      <IdentityCard identity={identity} />
      <p className="text-xs text-muted-foreground">
        Shared by everyone studying &quot;{exam.display_name}&quot;. Preparing for a different module or level? Create a separate exam for it, for example &quot;
        {exam.display_name} 003&quot;.
      </p>
    </div>
  ) : (
    <ExamIdentityChat examId={exam.examId} examName={exam.display_name} />
  );
  const goalForm = (
    <GoalForm
      examId={exam.examId}
      language={exam.language}
      format={exam.format}
      target={goal?.target_score ?? null}
      examSize={goal?.exam_size ?? null}
      officialPass={exam.pass_score}
      submitLabel={goalDone ? "Save" : "Save and continue"}
    />
  );
  const blueprintEditor = (
    <BlueprintEditor
      examId={exam.examId}
      initial={bp.map(({ topic, percentage }) => ({ topic, percentage: Number(percentage) }))}
      personal={bp.some((b) => b.personal)}
      hasDefault={(defaults ?? []).length > 0}
      sourceUrl={(defaults ?? []).find((d) => d.source_url)?.source_url ?? null}
      topicSuggestions={topicSuggestions}
    />
  );
  const addQuestions = (
    <AddQuestions
      examId={exam.examId}
      topics={bp.map((b) => b.topic)}
      format={exam.format ?? "mcq"}
      activeJobs={{ upload: activeJob("upload"), generate: activeJob("generate") }}
    />
  );

  const badges = (
    <span className="mt-1 flex flex-wrap gap-2">
      <Badge>
        <Languages aria-hidden="true" className="size-3.5" />
        {exam.language === "en" ? "English" : exam.language === "id" ? "Indonesian" : "Language not set"}
      </Badge>
      <Badge>
        <FileText aria-hidden="true" className="size-3.5" />
        {exam.format === "essay" ? "Essay" : exam.format === "mcq" ? "Multiple choice" : "Format not set"}
      </Badge>
      <Badge>
        <Flag aria-hidden="true" className="size-3.5" />
        {passScore != null ? `Passing score ${passScore}${goal?.target_score != null ? " (your target)" : ""}` : "No passing score yet"}
      </Badge>
    </span>
  );

  // ============ Setup mode: one step at a time ============
  if (!practice) {
    const current = !goalDone ? 1 : !blueprintDone ? 2 : 3;
    return (
      <div className="flex flex-col gap-6">
        <Hero eyebrow="Set up your exam" title={exam.display_name}>
          {badges}
        </Hero>
        <ol className="flex flex-col gap-4">
          <Step
            n={1}
            title="Your exam and goal"
            icon={Target}
            done={goalDone}
            current={current === 1}
            summary={
              goalDone
                ? `${identity?.full_name}${identity?.scope ? ` · ${identity.scope}` : ""} · ${exam.language === "en" ? "English" : "Indonesian"} · ${exam.format === "essay" ? "essay" : "multiple choice"}${goal?.target_score != null ? ` · target ${goal.target_score}` : ""}`
                : undefined
            }
          >
            <div className="flex flex-col gap-6">
              {identityBlock}
              {identity && goalForm}
            </div>
          </Step>
          <Step n={2} title="Blueprint" icon={ListTree} done={blueprintDone} current={current === 2} locked={current < 2} summary={blueprintDone ? `${bp.length} topics${bp.some((b) => b.personal) ? " · personal" : ""}` : undefined}>
            <p className="-mt-1 mb-4 text-sm text-muted-foreground">Which topics the exam covers and how much of it each one is. Every practice run follows this mix exactly.</p>
            {blueprintEditor}
          </Step>
          <Step n={3} title="Add questions" icon={Upload} done={questionsDone} current={current === 3} locked={current < 3}>
            <div className="mb-4 flex flex-col gap-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  <span className="font-semibold tabular-nums">{verified}</span> of {minimum} verified questions to unlock practice
                </span>
                {!!pending && <span className="text-muted-foreground">{pending} being verified</span>}
              </div>
              <ProgressBar value={(100 * verified) / minimum} />
            </div>
            {addQuestions}
          </Step>
        </ol>
        <Chat examId={exam.examId} />
      </div>
    );
  }

  // ============ Practice mode ============
  const items = (progress ?? []).map((p) => ({ ...p, topic: (p.questions as unknown as { topic: string | null }).topic }));
  const mastered = items.filter((p) => p.correct_streak >= 3).length;
  const review = items.filter((p) => p.last_correct === false).length;
  const byTopic = new Map<string, { correct: number; wrong: number }>();
  const display = new Map(bp.map((b) => [normalize(b.topic), b.topic]));
  for (const p of items) {
    const name = display.get(normalize(p.topic ?? "")) ?? p.topic ?? "No topic";
    const t = byTopic.get(name) ?? { correct: 0, wrong: 0 };
    t.correct += p.correct_count;
    t.wrong += p.wrong_count;
    byTopic.set(name, t);
  }
  const topics = [...byTopic.entries()]
    .map(([topic, t]) => ({ topic, ...t, pct: Math.round((100 * t.correct) / Math.max(1, t.correct + t.wrong)) }))
    .sort((a, b) => a.pct - b.pct);

  return (
    <div className="flex flex-col gap-6">
      <Hero
        eyebrow="Exam"
        title={exam.display_name}
        actions={
          <>
            <LinkButton href="#practice" variant="accent">
              <Play aria-hidden="true" className="size-4" /> Start practice
            </LinkButton>
            <LinkButton href={`/ujian/${slug}/analisis`} variant="outline">
              <ChartColumn aria-hidden="true" className="size-4" /> Analytics
            </LinkButton>
            <LinkButton href={`/riwayat?ujian=${slug}`} variant="outline">
              <History aria-hidden="true" className="size-4" /> History
            </LinkButton>
          </>
        }
      >
        {badges}
      </Hero>

      {unanswered === 0 && (
        <Reveal>
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-accent bg-accent-soft p-4 text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3">
              <RefreshCcw aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="font-semibold">You have answered every question in your bank.</span> From now on questions repeat, starting with the ones you got wrong.
                Add new questions to keep practice fresh.
              </span>
            </p>
            <LinkButton href="#add-questions" variant="primary" className="shrink-0">
              <Sparkles aria-hidden="true" className="size-4" /> Add questions
            </LinkButton>
          </div>
        </Reveal>
      )}

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile icon={CircleCheck} label="Ready" value={verified} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Sparkles} label="Not seen yet" value={unanswered} tone="ai" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Target} label="Mastered" value={mastered} hint="3 correct in a row" />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={TriangleAlert} label="Needs review" value={review} tone="accent" hint="Last answer wrong" />
        </StaggerItem>
      </Stagger>

      <Reveal className="grid gap-4 lg:grid-cols-2" delay={0.1}>
        <Card id="practice" className="scroll-mt-6">
          <SectionTitle icon={Play}>Start a practice exam</SectionTitle>
          <StartPractice key={JSON.stringify(readiness)} examId={exam.examId} defaultSize={defaultSize} initial={readiness} format={exam.format ?? "mcq"} activeJobId={activeJob("prepare")} />
        </Card>
        <Card>
          <SectionTitle icon={ChartColumn} aside={<LinkButton href={`/ujian/${slug}/analisis`} variant="ghost" className="min-h-9 px-2 text-sm">See all</LinkButton>}>
            Topics
          </SectionTitle>
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">Finish a practice exam to see how you do on each topic.</p>
          ) : (
            <ul className="flex flex-col gap-4 text-sm">
              {topics.slice(0, 6).map((t) => (
                <li key={t.topic} className="flex flex-col gap-2">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">{t.topic}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {t.correct} correct · {t.wrong} wrong · <span className="font-semibold text-foreground">{t.pct}%</span>
                    </span>
                  </div>
                  <ProgressBar value={t.pct} tone={t.correct + t.wrong >= 3 && t.pct < 60 ? "accent" : "primary"} />
                </li>
              ))}
            </ul>
          )}
          {!!pending && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Hourglass aria-hidden="true" className="size-4" /> {pending} questions are being verified.
            </p>
          )}
        </Card>
      </Reveal>

      <Card id="add-questions" className="scroll-mt-6">
        <SectionTitle icon={Upload}>Add questions</SectionTitle>
        {addQuestions}
      </Card>

      <Card>
        <SectionTitle icon={Settings2}>Exam settings</SectionTitle>
        <div className="flex flex-col gap-3">
          <details className="rounded-xl border">
            <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 font-medium">
              <Target aria-hidden="true" className="size-4 text-primary" /> Exam and goal
            </summary>
            <div className="flex flex-col gap-6 border-t p-4">
              {identityBlock}
              {goalForm}
            </div>
          </details>
          <details className="rounded-xl border">
            <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 font-medium">
              <ListTree aria-hidden="true" className="size-4 text-primary" /> Blueprint
              <span className="text-sm font-normal text-muted-foreground">
                {bp.length} topics{bp.some((b) => b.personal) ? " · personal" : " · default"}
              </span>
            </summary>
            <div className="border-t p-4">{blueprintEditor}</div>
          </details>
        </div>
      </Card>

      <Chat examId={exam.examId} />
    </div>
  );
}

function Step({
  n,
  title,
  icon: Icon,
  done,
  current,
  locked = false,
  summary,
  children,
}: {
  n: number;
  title: string;
  icon: typeof Target;
  done: boolean;
  current: boolean;
  locked?: boolean;
  summary?: string;
  children: ReactNode;
}) {
  const badge = done ? "bg-success text-white" : current ? "bg-primary text-white" : "bg-muted text-muted-foreground";
  return (
    <li>
      <Card className={`flex flex-col gap-4 ${current ? "border-primary/40" : ""} ${locked ? "opacity-70" : ""}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${badge}`}>
            {done ? <CircleCheck aria-hidden="true" className="size-5" /> : locked ? <Lock aria-hidden="true" className="size-4" /> : n}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Icon aria-hidden="true" className="size-4 text-primary" /> Step {n}: {title}
              <span className="sr-only">{done ? " (done)" : locked ? " (locked)" : current ? " (current step)" : ""}</span>
            </h2>
            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
          </div>
        </div>
        {locked ? (
          <p className="text-sm text-muted-foreground">Finish step {n - 1} first.</p>
        ) : current ? (
          children
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-primary">Edit</summary>
            <div className="mt-4">{children}</div>
          </details>
        )}
      </Card>
    </li>
  );
}
