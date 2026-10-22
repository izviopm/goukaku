import Link from "next/link";
import { BookOpenCheck, ChevronRight, ClipboardList, Library, Plus, ShieldCheck, Trophy } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, Hero, IconTile, ProgressBar, SectionTitle, StatTile } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { CreateExamForm } from "./create-exam-form";

type ExamRow = { exam_id: string; exams: { exam_catalog: { slug: string; display_name: string } } };

export default async function Dashboard() {
  const { supabase, id, email, name } = await getUser();
  const [{ data: exams }, { data: pool }, { data: sims }] = await Promise.all([
    supabase.from("user_exams").select("exam_id, exams(exam_catalog(slug, display_name))").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("user_exam_pool").select("exam_id, questions(answer_status, status)").eq("user_id", id),
    supabase.from("simulations").select("exam_id, score, pass_score_snapshot, started_at").eq("user_id", id).eq("status", "finished").order("started_at", { ascending: false }),
  ]);
  const list = ((exams ?? []) as unknown as ExamRow[]).map((e) => ({ id: e.exam_id, ...e.exams.exam_catalog }));

  // First visit: nothing to show yet, so the page is only the "create exam" step.
  if (list.length === 0) {
    return (
      <Reveal className="mx-auto flex w-full max-w-lg flex-col gap-6 py-8 sm:py-16">
        <Card className="relative overflow-hidden p-0">
          <div className="relative overflow-hidden bg-linear-to-br from-primary to-primary-strong px-6 py-8 text-white">
            <div aria-hidden="true" className="pattern-seigaiha absolute inset-0 text-white" />
            <div className="relative flex flex-col gap-2">
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-white/15">
                <Plus aria-hidden="true" className="size-6" />
              </span>
              <h1 className="text-2xl font-bold">Create your first exam</h1>
              <p className="text-white/90">Name the certification you are studying for. Everyone studying the same exam shares one question bank.</p>
            </div>
          </div>
          <div className="p-6">
            <CreateExamForm />
          </div>
        </Card>
      </Reveal>
    );
  }

  const readyBy = new Map<string, number>();
  for (const p of pool ?? []) {
    const q = p.questions as unknown as { answer_status: string; status: string } | null;
    if (q?.answer_status === "verified" && q.status === "active") readyBy.set(p.exam_id, (readyBy.get(p.exam_id) ?? 0) + 1);
  }
  const lastBy = new Map<string, { score: number; pass: number | null }>();
  for (const s of sims ?? []) if (!lastBy.has(s.exam_id)) lastBy.set(s.exam_id, { score: Number(s.score), pass: s.pass_score_snapshot });
  const totalReady = [...readyBy.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <Hero eyebrow="Welcome back" title={`Hi, ${name?.split(" ")[0] ?? email.split("@")[0]}`}>
        A little practice every day adds up. Pick an exam, take a practice run, and track your progress.
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile icon={Library} label="Exams" value={list.length} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={BookOpenCheck} label="Questions ready" value={totalReady} />
        </StaggerItem>
        <StaggerItem>
          <StatTile icon={Trophy} label="Practice exams finished" value={sims?.length ?? 0} tone="accent" />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="flex flex-col lg:col-span-2" aria-labelledby="exams-title">
          <SectionTitle icon={ClipboardList}>
            <span id="exams-title">Your exams</span>
          </SectionTitle>
          <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
            {list.map((c) => {
              const ready = readyBy.get(c.id) ?? 0;
              const last = lastBy.get(c.id);
              const passed = last && last.pass != null ? last.score >= last.pass : null;
              return (
                <StaggerItem as="li" key={c.slug}>
                  <Link
                    href={`/ujian/${c.slug}`}
                    className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <IconTile icon={BookOpenCheck} />
                        <span className="truncate text-lg font-semibold">{c.display_name}</span>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{ready} ready</Badge>
                      {passed != null && <Badge tone={passed ? "primary" : "accent"}>{passed ? "Passed last time" : "Not passed yet"}</Badge>}
                    </div>
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Last score</span>
                        <span className="font-semibold tabular-nums">{last ? last.score : "–"}</span>
                      </div>
                      <ProgressBar value={last?.score ?? 0} tone={passed === false ? "accent" : "primary"} />
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
        <Reveal className="flex flex-col gap-4" delay={0.1}>
          <SectionTitle icon={Plus}>New exam</SectionTitle>
          <Card>
            <CreateExamForm />
          </Card>
          <Card className="flex gap-4 bg-ai-soft/60">
            <IconTile icon={ShieldCheck} tone="ai" />
            <p className="text-sm">
              <span className="font-semibold">Verified keys:</span> new questions appear in practice only after two AI models agree on the answer key.
            </p>
          </Card>
        </Reveal>
      </div>
    </>
  );
}
