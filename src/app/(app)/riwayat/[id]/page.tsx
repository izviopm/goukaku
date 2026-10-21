import { notFound } from "next/navigation";
import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ReportQuestion } from "@/components/report";
import { getUser } from "@/lib/auth";
import { LETTERS } from "@/lib/rules";
import { topicStats } from "@/lib/stats";

type Snapshot = { body: string; options: string[]; answer: string; explanation: string | null; topic: string | null };

export default async function HistoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data: sim } = await supabase
    .from("simulations")
    .select("*, exams(exam_catalog(display_name))")
    .eq("id", id)
    .maybeSingle();
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
  const passed = sim.pass_score_snapshot != null && sim.score != null ? Number(sim.score) >= Number(sim.pass_score_snapshot) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle sub={`${sim.feedback_mode === "instant" ? "Mode langsung" : "Mode di akhir"} · ${sim.status === "abandoned" ? "ditinggalkan" : sim.status === "finished" ? "selesai" : "berjalan"}`}>
        {name}
      </PageTitle>

      <Card aria-live="polite" className="flex flex-col gap-2">
        <p className="text-3xl font-bold tabular-nums">{sim.score ?? "–"}</p>
        <p className="text-muted-foreground">
          {correct} benar dari {sim.size} soal
          {sim.pass_score_snapshot != null && ` · nilai lulus ${sim.pass_score_snapshot}`}
        </p>
        {passed != null && (
          <p className={`flex items-center gap-2 font-semibold ${passed ? "text-success" : "text-accent-text"}`}>
            {passed ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
            {passed ? "Goukaku! Lulus" : "Belum lulus"}
          </p>
        )}
      </Card>

      {stats.length > 0 && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Skor per topik</h2>
          <table className="w-full text-sm">
            <tbody>
              {stats.map((s) => (
                <tr key={s.topic} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">{s.topic}</th>
                  <td className="py-2 text-right tabular-nums">{s.correct}/{s.total}</td>
                  <td className="py-2 text-right tabular-nums">{s.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ol className="flex flex-col gap-4">
        {(items ?? []).map((it) => {
          const s = it.snapshot as Snapshot;
          const current = it.questions as unknown as { answer: string | null } | null;
          const keyChanged = current && current.answer !== s.answer;
          return (
            <li key={it.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Soal {it.position}</span>
                  {s.topic && <Badge>{s.topic}</Badge>}
                  {keyChanged && <Badge tone="accent">Kunci diperbarui setelah ujian</Badge>}
                </div>
                <p className="max-w-[70ch] whitespace-pre-wrap">{s.body}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.options.map((o, k) => {
                    const l = LETTERS[k];
                    const isKey = l === s.answer;
                    const picked = l === it.user_answer;
                    return (
                      <li key={l} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${isKey ? "border-success bg-success/10" : picked ? "border-accent-text bg-accent-soft" : ""}`}>
                        <span className="font-semibold">{l}.</span>
                        <span className="flex-1">{o}</span>
                        {isKey && <span className="font-medium text-success">Kunci</span>}
                        {picked && <span className="font-medium">{isKey ? "· Pilihanmu" : "Pilihanmu"}</span>}
                      </li>
                    );
                  })}
                </ul>
                <p className={`flex items-center gap-2 text-sm font-semibold ${it.is_correct ? "text-success" : it.user_answer ? "text-accent-text" : "text-muted-foreground"}`}>
                  {it.is_correct ? <CircleCheck aria-hidden="true" className="size-4" /> : it.user_answer ? <CircleX aria-hidden="true" className="size-4" /> : <CircleMinus aria-hidden="true" className="size-4" />}
                  {it.is_correct ? "Benar" : it.user_answer ? "Salah" : "Tidak dijawab"}
                </p>
                {s.explanation && <p className="max-w-[70ch] rounded-lg bg-muted p-3 text-sm">{s.explanation}</p>}
                <ReportQuestion questionId={it.question_id} />
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
