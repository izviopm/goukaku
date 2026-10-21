import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { Badge, Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getExamBySlug } from "@/lib/exams";
import { topicStats } from "@/lib/stats";
import { confirmBlueprint } from "./actions";
import { Chat } from "./chat";
import { GoalForm, StartSimulationForm, UploadForms } from "./forms";

export const maxDuration = 300; // uploads run AI extraction + verification inline

export default async function ExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await getExamBySlug(slug);
  if (!exam) notFound();
  const { supabase, id: userId } = await getUser();

  const [{ data: pool }, { data: blueprint }, { data: goal }, { data: items }] = await Promise.all([
    supabase.from("user_exam_pool").select("questions(answer_status, status)").eq("exam_id", exam.examId).eq("user_id", userId),
    supabase.from("exam_blueprints").select("id, topic, percentage, source, source_url, confirmed_by").eq("exam_id", exam.examId).order("percentage", { ascending: false }),
    supabase.from("user_exam_goal").select("target_score").eq("exam_id", exam.examId).eq("user_id", userId).maybeSingle(),
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
  const unconfirmed = (blueprint ?? []).some((b) => !b.confirmed_by);
  const passScore = goal?.target_score ?? exam.pass_score;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          sub={
            <span className="flex flex-wrap gap-2">
              <Badge>Bahasa: {exam.language === "en" ? "Inggris" : exam.language === "id" ? "Indonesia" : "belum ditentukan"}</Badge>
              <Badge>
                {passScore != null
                  ? `Nilai lulus: ${passScore}${goal ? " (target pribadi)" : exam.pass_score_source ? ` (${exam.pass_score_source})` : ""}`
                  : "Nilai lulus belum ada"}
              </Badge>
            </span>
          }
        >
          {exam.display_name}
        </PageTitle>
        <LinkButton href={`/riwayat?ujian=${slug}`} variant="outline">
          <History aria-hidden="true" className="size-4" />
          Riwayat
        </LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Siap disimulasikan" value={ready} />
        <Stat label="Menunggu verifikasi" value={pending} />
        <Stat label="Dipersoalkan / disembunyikan" value={disputed} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Mulai Moshi (simulasi)</h2>
          <StartSimulationForm examId={exam.examId} ready={ready} />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Analisis per topik</h2>
          {stats.length === 0 ? (
            <p className="text-muted-foreground">Belum ada riwayat jawaban.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 font-medium">Topik</th>
                    <th scope="col" className="py-2 text-right font-medium">Benar</th>
                    <th scope="col" className="py-2 text-right font-medium">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.topic} className="border-b last:border-0">
                      <td className="py-2">{s.topic}</td>
                      <td className="py-2 text-right tabular-nums">{s.correct}/{s.total}</td>
                      <td className="py-2 text-right tabular-nums">{s.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {weak.length > 0 && (
                <p className="mt-4 text-sm">
                  <span className="font-medium text-accent-text">Topik lemah:</span> {weak.map((w) => w.topic).join(", ")}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Chat AI</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Minta soal (misalnya &quot;tambahkan 60 soal&quot;), tentukan blueprint, nilai lulus, atau tanya tips ujian.
        </p>
        <Chat examId={exam.examId} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Blueprint</h2>
            {unconfirmed && <Badge tone="accent">Belum dikonfirmasi</Badge>}
          </div>
          {!blueprint?.length ? (
            <p className="text-muted-foreground">Belum ada. Tanyakan lewat chat agar AI mencarinya atau membantu menyusunnya.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 text-sm">
                {blueprint.map((b) => (
                  <li key={b.id} className="flex justify-between gap-4">
                    <span>{b.topic}</span>
                    <span className="tabular-nums">{b.percentage}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">
                Sumber: {blueprint[0].source}
                {blueprint[0].source_url && (
                  <>
                    {" · "}
                    <a href={blueprint[0].source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                      tautan
                    </a>
                  </>
                )}
              </p>
              {unconfirmed && (
                <form action={confirmBlueprint} className="mt-4">
                  <input type="hidden" name="examId" value={exam.examId} />
                  <Button type="submit" variant="accent">Konfirmasi blueprint</Button>
                </form>
              )}
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Target pribadi</h2>
          <GoalForm examId={exam.examId} current={goal?.target_score ?? null} />
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Tambah soal</h2>
        <UploadForms examId={exam.examId} />
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </Card>
  );
}
