"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { AIError, complete, consumeQuota, extractJson } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { saveQuestions, solve, verifyQuestions } from "@/lib/questions";
import { chunk, questionsFromCsv, questionsFromJson, structureError, type QuestionInput } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/server";

export type FormState = { error?: string; field?: string; message?: string };

const SIM_ERRORS: Record<string, string> = {
  NO_QUESTIONS: "Belum ada soal terverifikasi yang bisa dipakai. Tambah soal dulu, atau tunggu verifikasi selesai.",
  BAD_SIZE: "Jumlah soal 1–200.",
  BAD_MODE: "Pilih mode umpan balik.",
};

export async function startSimulation(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getUser();
  const size = Number(form.get("size"));
  const mode = String(form.get("mode") ?? "");
  if (!Number.isInteger(size) || size < 1 || size > 200) return { error: SIM_ERRORS.BAD_SIZE, field: "size" };
  if (mode !== "instant" && mode !== "end") return { error: SIM_ERRORS.BAD_MODE, field: "mode" };

  const { data, error } = await supabase.rpc("start_simulation", { p_exam_id: String(form.get("examId")), p_size: size, p_mode: mode });
  if (error) {
    const code = Object.keys(SIM_ERRORS).find((k) => error.message.includes(k));
    return { error: code ? SIM_ERRORS[code] : error.message, field: "size" };
  }
  redirect(`/simulasi/${data.id}${data.size < data.requested ? `?kurang=${data.requested - data.size}` : ""}`);
}

/** Path A: questions with answers, from a CSV/JSON file or the manual form. */
export async function uploadWithAnswers(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const file = form.get("file");
  let items: QuestionInput[];

  try {
    if (file instanceof File && file.size > 0) {
      const text = await file.text();
      items = file.name.toLowerCase().endsWith(".json") ? questionsFromJson(text) : questionsFromCsv(text);
    } else {
      const options = ["A", "B", "C", "D", "E"].map((l) => String(form.get(`opt${l}`) ?? "").trim()).filter(Boolean);
      items = [
        {
          body: String(form.get("body") ?? ""),
          options,
          answer: String(form.get("answer") ?? ""),
          explanation: String(form.get("explanation") ?? ""),
          topic: String(form.get("topic") ?? ""),
        },
      ];
    }
  } catch (e) {
    return { error: `File tidak bisa dibaca: ${e instanceof Error ? e.message : e}`, field: "file" };
  }

  if (!items.length) return { error: "Tidak ada soal ditemukan", field: "file" };
  if (items.length > 500) return { error: "Maksimal 500 soal per upload", field: "file" };
  const bad = items.map((q, i) => [i + 1, structureError(q)] as const).filter(([, e]) => e);
  if (bad.length)
    return {
      error: `Perbaiki dulu: ${bad.slice(0, 5).map(([n, e]) => `soal ${n}: ${e}`).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} lainnya)` : ""}`,
      field: file instanceof File && file.size > 0 ? "file" : "body",
    };

  return finish(user.id, examId, items, "user_upload");
}

/** Path B: questions without answers from PDF/text; AI extracts and answers, then the usual verification runs. */
export async function uploadWithoutAnswers(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  const examId = String(form.get("examId"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file PDF atau teks", field: "file-b" };

  let text: string;
  try {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      text = (await extractText(pdf, { mergePages: true })).text;
    } else text = await file.text();
  } catch {
    return { error: "File tidak bisa dibaca", field: "file-b" };
  }
  text = text.trim();
  if (!text) return { error: "File tidak berisi teks (PDF hasil scan belum didukung)", field: "file-b" };
  if (text.length > 60000) return { error: "Teks terlalu panjang (maks sekitar 60.000 karakter). Pecah file-nya.", field: "file-b" };

  try {
    const pieces = text.match(/[\s\S]{1,12000}/g) ?? [];
    const items: QuestionInput[] = [];
    for (const piece of pieces) {
      await consumeQuota(user.id, 1);
      const reply = await complete({
        system:
          "Ekstrak setiap soal pilihan ganda dari teks berikut apa adanya, tanpa mengubah isi soal dan opsi. " +
          'Balas HANYA JSON array: [{"body": "...", "options": ["..."], "topic": "..."}]. Abaikan teks yang bukan soal.',
        messages: [{ role: "user", content: piece }],
      });
      items.push(...extractJson<QuestionInput[]>(reply).filter((q) => q?.body && Array.isArray(q.options)));
    }
    if (!items.length) return { error: "AI tidak menemukan soal pilihan ganda di file ini", field: "file-b" };

    // The answering model fills in the key; independent verifier models then blind-solve it.
    for (const batch of chunk(items)) {
      const answers = await solve(user.id, batch);
      batch.forEach((q, i) => Object.assign(q, answers[i]));
    }
    return finish(user.id, examId, items.filter((q) => !structureError(q)), "user_pdf_ai_answered");
  } catch (e) {
    return { error: e instanceof AIError ? e.message : "Gagal memproses file dengan AI", field: "file-b" };
  }
}

async function finish(userId: string, examId: string, items: QuestionInput[], origin: "user_upload" | "user_pdf_ai_answered"): Promise<FormState> {
  try {
    const { newIds, existing } = await saveQuestions(examId, userId, items, origin);
    let note = "";
    try {
      await verifyQuestions(userId, newIds);
    } catch (e) {
      note = ` Verifikasi tertunda: ${e instanceof Error ? e.message : e}`;
    }
    revalidatePath("/ujian/[slug]", "page");
    return { message: `${newIds.length} soal baru masuk bank, ${existing} sudah ada sebelumnya (dipakai ulang).${note}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menyimpan", field: "file" };
  }
}

export async function confirmBlueprint(form: FormData) {
  const user = await getUser();
  await createAdminClient()
    .from("exam_blueprints")
    .update({ confirmed_by: user.id })
    .eq("exam_id", String(form.get("examId")))
    .is("confirmed_by", null);
  revalidatePath("/ujian/[slug]", "page");
}

export async function saveGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, id } = await getUser();
  const raw = String(form.get("target") ?? "").trim();
  const examId = String(form.get("examId"));
  if (raw === "") {
    await supabase.from("user_exam_goal").delete().eq("user_id", id).eq("exam_id", examId);
    revalidatePath("/ujian/[slug]", "page");
    return { message: "Target dihapus" };
  }
  const target = Number(raw);
  if (!Number.isFinite(target) || target < 0 || target > 100) return { error: "Target 0–100", field: "target" };
  const { error } = await supabase.from("user_exam_goal").upsert({ user_id: id, exam_id: examId, target_score: target });
  if (error) return { error: error.message, field: "target" };
  revalidatePath("/ujian/[slug]", "page");
  return { message: "Target disimpan" };
}
