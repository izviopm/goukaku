import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Runner, type RunnerItem } from "./runner";

type Snapshot = { body: string; options: string[]; answer: string; explanation: string | null; topic: string | null };

export default async function SimulationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kurang?: string }>;
}) {
  const [{ id }, { kurang }] = await Promise.all([params, searchParams]);
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
    .select("id, position, question_id, snapshot, user_answer, is_correct, answered_at")
    .eq("simulation_id", id)
    .order("position");

  // The key and explanation only reach the browser once instant feedback is due.
  const items: RunnerItem[] = (rows ?? []).map((r) => {
    const s = r.snapshot as Snapshot;
    const reveal = sim.feedback_mode === "instant" && r.answered_at;
    return {
      id: r.id,
      questionId: r.question_id,
      body: s.body,
      options: s.options,
      topic: s.topic,
      userAnswer: r.user_answer,
      feedback: reveal ? { is_correct: !!r.is_correct, answer: s.answer, explanation: s.explanation } : undefined,
    };
  });

  const name = (sim.exams as unknown as { exam_catalog: { display_name: string } }).exam_catalog.display_name;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Runner simId={id} examName={name} mode={sim.feedback_mode as "instant" | "end"} items={items} shortBy={Number(kurang) || 0} />
    </div>
  );
}
