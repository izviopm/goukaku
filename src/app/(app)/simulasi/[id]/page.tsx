import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Runner, type RunnerItem } from "./runner";

type Snapshot = {
  type?: "mcq" | "essay";
  body: string;
  options: string[];
  answer?: string | null;
  rubric?: string[] | null;
  explanation: string | null;
  topic: string | null;
};

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data: sim } = await supabase
    .from("simulations")
    .select("id, status, feedback_mode, size, exams(exam_catalog(display_name))")
    .eq("id", id)
    .maybeSingle();
  if (!sim) notFound();
  if (sim.status !== "in_progress") redirect(`/riwayat/${id}`);

  const { data: rows } = await supabase
    .from("simulation_items")
    .select("id, position, question_id, snapshot, user_answer, is_correct, ai_score, ai_feedback, answered_at")
    .eq("simulation_id", id)
    .order("position");

  // The key, rubric, and explanation only reach the browser once instant feedback is due.
  const items: RunnerItem[] = (rows ?? []).map((r) => {
    const s = r.snapshot as Snapshot;
    const type = s.type ?? "mcq";
    const reveal = sim.feedback_mode === "instant" && (type === "essay" ? r.ai_score != null : !!r.answered_at);
    return {
      id: r.id,
      questionId: r.question_id,
      type,
      body: s.body,
      options: s.options,
      rubric: s.rubric ?? undefined,
      topic: s.topic,
      userAnswer: r.user_answer,
      feedback: reveal
        ? type === "essay"
          ? { is_correct: !!r.is_correct, score: Number(r.ai_score), feedback: r.ai_feedback ?? "" }
          : { is_correct: !!r.is_correct, answer: s.answer ?? undefined, explanation: s.explanation }
        : undefined,
    };
  });

  const name = (sim.exams as unknown as { exam_catalog: { display_name: string } }).exam_catalog.display_name;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Runner simId={id} examName={name} mode={sim.feedback_mode as "instant" | "end"} items={items} />
    </div>
  );
}
