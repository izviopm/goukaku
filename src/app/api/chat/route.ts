import { after } from "next/server";
import { z } from "zod";
import { AIError, complete, consumeQuota, type ChatMessage } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { runJob } from "@/lib/generate";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const Body = z.object({
  examId: z.uuid(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40),
});

const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_language"), language: z.enum(["id", "en"]) }),
  z.object({
    type: z.literal("set_blueprint"),
    source: z.enum(["web", "user", "ai"]),
    source_url: z.url().optional(),
    topics: z.array(z.object({ topic: z.string().min(1).max(200), percentage: z.number().positive().max(100) })).min(1).max(40),
  }),
  z.object({ type: z.literal("set_pass_score"), score: z.number().min(0).max(100), source: z.enum(["web", "user"]), url: z.url().optional() }),
  z.object({ type: z.literal("set_target"), score: z.number().min(0).max(100) }),
  z.object({ type: z.literal("generate_questions"), count: z.number().int().min(1).max(200) }),
]);

export async function POST(req: Request) {
  const user = await getUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  const { examId, messages } = parsed.data;

  const db = createAdminClient();
  const [{ data: exam }, { data: blueprint }, { data: goal }, { count: poolCount }] = await Promise.all([
    db.from("exams").select("id, catalog_id, exam_catalog(*)").eq("id", examId).single(),
    db.from("exam_blueprints").select("topic, percentage, source, source_url, confirmed_by").eq("exam_id", examId),
    db.from("user_exam_goal").select("target_score").eq("exam_id", examId).eq("user_id", user.id).maybeSingle(),
    db.from("user_exam_pool").select("*", { count: "exact", head: true }).eq("exam_id", examId).eq("user_id", user.id),
  ]);
  if (!exam) return Response.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  const catalog = exam.exam_catalog as unknown as Record<string, unknown>;

  try {
    await consumeQuota(user.id, 1);
    const raw = await complete({ system: systemPrompt(catalog, blueprint ?? [], goal?.target_score, poolCount ?? 0), messages: messages as ChatMessage[], webSearch: true });

    const notes: string[] = [];
    let jobId: string | null = null;
    for (const block of raw.matchAll(/```action\s*([\s\S]*?)```/g)) {
      const action = Action.safeParse(parseOrNull(block[1]));
      if (!action.success) {
        notes.push("Satu aksi dari AI ditolak karena formatnya tidak valid.");
        continue;
      }
      const a = action.data;
      if (a.type === "set_language") {
        await db.from("exam_catalog").update({ language: a.language }).eq("id", exam.catalog_id);
        notes.push(`Bahasa soal disimpan: ${a.language === "en" ? "Inggris" : "Indonesia"}.`);
      } else if (a.type === "set_blueprint") {
        // Web blueprints stay inactive until someone confirms them (PRD 6).
        await db.from("exam_blueprints").delete().eq("exam_id", examId);
        await db.from("exam_blueprints").insert(
          a.topics.map((t) => ({
            exam_id: examId,
            topic: t.topic,
            percentage: t.percentage,
            source: a.source,
            source_url: a.source_url ?? null,
            confirmed_by: a.source === "web" ? null : user.id,
          })),
        );
        notes.push(a.source === "web" ? "Blueprint dari web disimpan. Konfirmasi dulu di panel Blueprint." : "Blueprint disimpan.");
      } else if (a.type === "set_pass_score") {
        await db
          .from("exam_catalog")
          .update({ pass_score: a.score, pass_score_source: a.source, pass_score_url: a.url ?? null })
          .eq("id", exam.catalog_id);
        notes.push(`Nilai kelulusan disimpan: ${a.score}.`);
      } else if (a.type === "set_target") {
        await db.from("user_exam_goal").upsert({ user_id: user.id, exam_id: examId, target_score: a.score });
        notes.push(`Target pribadi disimpan: ${a.score}.`);
      } else if (a.type === "generate_questions") {
        const { data: job, error } = await db
          .from("ai_jobs")
          .insert({ user_id: user.id, exam_id: examId, requested: a.count })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        jobId = job.id;
        after(() => runJob(job.id));
        notes.push(`Menyiapkan ${a.count} soal: bank bersama dicek dulu, sisanya dibuat AI lalu diverifikasi.`);
      }
    }

    const reply = raw.replace(/```action[\s\S]*?```/g, "").trim();
    return Response.json({ reply, notes, jobId });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Terjadi kesalahan saat memanggil AI.";
    if (!(e instanceof AIError)) console.error(e);
    return Response.json({ error: msg }, { status: e instanceof AIError ? 429 : 500 });
  }
}

function parseOrNull(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function systemPrompt(
  c: Record<string, unknown>,
  bp: { topic: string; percentage: number; source: string; source_url: string | null; confirmed_by: string | null }[],
  target: number | undefined,
  poolCount: number,
) {
  const bpText = bp.length
    ? bp.map((b) => `- ${b.topic}: ${b.percentage}% (sumber ${b.source}${b.confirmed_by ? "" : ", BELUM dikonfirmasi"})`).join("\n")
    : "(belum ada)";
  return `Kamu asisten belajar di aplikasi Goukaku untuk ujian "${c.display_name}". Jawab ringkas dalam bahasa yang dipakai user.

Kondisi ujian saat ini:
- Bahasa soal: ${c.language ?? "BELUM ditentukan"}
- Blueprint:\n${bpText}
- Nilai kelulusan: ${c.pass_score ?? "belum ada"}${c.pass_score_source ? ` (sumber ${c.pass_score_source})` : ""}
- Target pribadi user: ${target ?? "belum ada"}
- Soal di bank pribadi user: ${poolCount}

Aturan:
1. Bahasa: jika ujian umumnya berbahasa Inggris (misalnya TOEFL, IELTS), langsung set "en". Jika umumnya bahasa Indonesia, set "id". Jika campuran atau tidak jelas, TANYA user dulu.
2. Blueprint: jika belum ada, cari di internet. Jika ketemu, simpan dengan source "web" dan source_url. Jika tidak ketemu, tanya user apakah ingin menentukan persentase sendiri (source "user") atau diserahkan ke AI (source "ai"). Total persentase harus 100.
3. Nilai kelulusan: jika belum ada, cari di internet (source "web" + url). Jika tidak ketemu, tanya user (source "user").
4. Saat user minta soal (misalnya "tambahkan 60 soal"), pastikan bahasa sudah ditentukan dan blueprint sudah dikonfirmasi; jika belum, selesaikan itu dulu.
5. Saran topik atau tips dari internet WAJIB disertai sumber (URL).
6. Jangan pernah menyebut atau meminta API key.

Untuk menyimpan sesuatu, sisipkan blok berikut (boleh lebih dari satu) di akhir balasan:
\`\`\`action
{"type": "set_language", "language": "en"}
\`\`\`
Tipe aksi yang tersedia:
- {"type":"set_language","language":"id"|"en"}
- {"type":"set_blueprint","source":"web"|"user"|"ai","source_url":"https://...","topics":[{"topic":"...","percentage":30}]}
- {"type":"set_pass_score","score":70,"source":"web"|"user","url":"https://..."}
- {"type":"set_target","score":80}
- {"type":"generate_questions","count":60}
Hanya buat aksi jika datanya sudah jelas. Jangan mengarang URL.`;
}
