import { after } from "next/server";
import { z } from "zod";
import { AIError, complete, consumeQuota, webSearchAvailable, type ChatMessage } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { describeExam, type ExamIdentity } from "@/lib/exam-context";
import { runJob } from "@/lib/generate";
import { normalizeBlueprint } from "@/lib/rules";
import { saveBlueprint } from "@/app/(app)/ujian/[slug]/blueprint-actions";
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
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { examId, messages } = parsed.data;

  const db = createAdminClient();
  const [{ data: exam }, { data: blueprint }, { data: goal }, { count: poolCount }] = await Promise.all([
    db.from("exams").select("id, catalog_id, exam_catalog(*)").eq("id", examId).single(),
    db.rpc("effective_blueprint_for", { p_user: user.id, p_exam_id: examId }),
    db.from("user_exam_goal").select("target_score").eq("exam_id", examId).eq("user_id", user.id).maybeSingle(),
    db.from("user_exam_pool").select("*", { count: "exact", head: true }).eq("exam_id", examId).eq("user_id", user.id),
  ]);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const catalog = exam.exam_catalog as unknown as Record<string, unknown>;

  try {
    await consumeQuota(user.id, 1);
    const web = await webSearchAvailable();
    let system = systemPrompt(catalog, blueprint ?? [], goal?.target_score, poolCount ?? 0);
    if (!web)
      system +=
        "\n\nPENTING: Pencarian internet TIDAK tersedia. Jangan mengaku mencari di internet dan jangan memakai source \"web\". " +
        "Untuk blueprint dan nilai kelulusan, langsung tanya user (source \"user\") atau tawarkan AI yang menyusun (source \"ai\").";
    const raw = await complete({ system, messages: messages as ChatMessage[], webSearch: web });

    const notes: string[] = [];
    let jobId: string | null = null;
    for (const block of raw.matchAll(/```action\s*([\s\S]*?)```/g)) {
      const action = Action.safeParse(parseOrNull(block[1]));
      if (!action.success) {
        notes.push("One AI action was skipped because its format was invalid.");
        continue;
      }
      const a = action.data;
      if (a.type === "set_language") {
        // Shared per exam: only set when nobody has chosen it yet (the admin can change it later).
        await db.from("exam_catalog").update({ language: a.language }).eq("id", exam.catalog_id).is("language", null);
        notes.push(`Question language saved: ${a.language === "en" ? "English" : "Indonesian"}.`);
      } else if (a.type === "set_blueprint") {
        // Same hybrid rule as the Blueprint panel: default if none exists yet, otherwise personal.
        const res = await saveBlueprint(examId, normalizeBlueprint(a.topics), a.source, a.source_url ?? null);
        notes.push(
          res.error
            ? `Blueprint not saved: ${res.error}`
            : res.scope === "default"
              ? "Blueprint saved as the default for this exam."
              : "Blueprint saved as your personal blueprint.",
        );
      } else if (a.type === "set_pass_score") {
        await db
          .from("exam_catalog")
          .update({ pass_score: a.score, pass_score_source: a.source, pass_score_url: a.url ?? null })
          .eq("id", exam.catalog_id);
        notes.push(`Passing score saved: ${a.score}.`);
      } else if (a.type === "set_target") {
        await db.from("user_exam_goal").upsert({ user_id: user.id, exam_id: examId, target_score: a.score });
        notes.push(`Personal target saved: ${a.score}.`);
      } else if (a.type === "generate_questions" && !catalog.identity) {
        notes.push("Describe this exam in step 1 first, so new questions match the right certification.");
      } else if (a.type === "generate_questions") {
        const { data: job, error } = await db
          .from("ai_jobs")
          .insert({ user_id: user.id, exam_id: examId, requested: a.count })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        jobId = job.id;
        after(() => runJob(job.id));
        notes.push(`Preparing ${a.count} questions: the shared bank is checked first, the rest is generated by AI and then verified.`);
      }
    }

    const reply = raw.replace(/```action[\s\S]*?```/g, "").trim();
    return Response.json({ reply, notes, jobId });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Something went wrong while calling the AI.";
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
  bp: { topic: string; percentage: number; personal: boolean }[],
  target: number | undefined,
  poolCount: number,
) {
  const bpText = bp.length
    ? bp.map((b) => `- ${b.topic}: ${b.percentage}%${b.personal ? " (blueprint pribadi user)" : ""}`).join("\n")
    : "(belum ada)";
  return `Kamu asisten belajar di aplikasi Goukaku untuk ujian "${c.display_name}". Jawab ringkas dalam bahasa yang dipakai user.
Ujian yang dimaksud: ${describeExam(String(c.display_name), (c.identity as ExamIdentity | null) ?? null)}. Semua jawaban, tips, dan soal harus sesuai sertifikasi ini, bukan bidang lain dengan singkatan yang sama.

Kondisi ujian saat ini:
- Bahasa soal: ${c.language ?? "BELUM ditentukan"}
- Blueprint:\n${bpText}
- Nilai kelulusan: ${c.pass_score ?? "belum ada"}${c.pass_score_source ? ` (sumber ${c.pass_score_source})` : ""}
- Target pribadi user: ${target ?? "belum ada"}
- Soal di bank pribadi user: ${poolCount}

Aturan:
1. Bahasa: jika ujian umumnya berbahasa Inggris (misalnya TOEFL, IELTS), langsung set "en". Jika umumnya bahasa Indonesia, set "id". Jika campuran atau tidak jelas, TANYA user dulu.
2. Blueprint: arahkan user ke panel Blueprint di halaman ujian (tombol "Suggest with AI" atau "Set it myself"). Hanya simpan blueprint lewat aksi jika user secara eksplisit meminta dan menyebutkan topik serta persentasenya. Total persentase harus 100.
3. Nilai kelulusan: jika belum ada, cari di internet (source "web" + url). Jika tidak ketemu, tanya user (source "user").
4. Saat user minta soal (misalnya "tambahkan 60 soal"), pastikan bahasa dan blueprint sudah ada; jika belum, arahkan user menyelesaikan langkah setup di halaman ujian dulu.
5a. Saat menjelaskan topik lemah, gunakan pengetahuanmu tentang topik itu dan sarankan latihan; jangan mengarang data skor user.
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
