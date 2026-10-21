"use client";

import { useActionState } from "react";
import { CircleCheck, Play, Upload } from "lucide-react";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { saveGoal, startSimulation, uploadWithAnswers, uploadWithoutAnswers, type FormState } from "./actions";

function useForm(fn: (prev: FormState, form: FormData) => Promise<FormState>) {
  const [state, action, pending] = useActionState<FormState, FormData>(fn, {});
  const err = (f: string) => (state.field === f ? state.error : undefined);
  const aria = (f: string) => ({ "aria-invalid": !!err(f), "aria-describedby": err(f) ? `${f}-error` : undefined });
  return { state, action, pending, err, aria };
}

function Status({ state }: { state: FormState }) {
  return (
    <div aria-live="polite">
      {state.message && (
        <p className="flex items-start gap-1 text-sm text-success">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}
      {state.error && !state.field && <ErrorText>{state.error}</ErrorText>}
    </div>
  );
}

export function StartSimulationForm({ examId, ready }: { examId: string; ready: number }) {
  const f = useForm(startSimulation);
  return (
    <form action={f.action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={f.state} />
      <input type="hidden" name="examId" value={examId} />
      <Field id="size" label="Jumlah soal" help={`${ready} soal terverifikasi di bank pribadimu. Jika kurang, diambil dari bank bersama.`} error={f.err("size")}>
        <input id="size" name="size" type="number" min={1} max={200} defaultValue={Math.min(20, Math.max(ready, 1))} className={inputClass} {...f.aria("size")} />
      </Field>
      <fieldset className="flex flex-col gap-2" {...f.aria("mode")}>
        <legend className="text-sm font-medium">Mode umpan balik (tidak bisa diganti setelah mulai)</legend>
        {[
          ["instant", "Langsung", "Benar/salah dan penjelasan tampil setelah tiap jawaban"],
          ["end", "Di akhir", "Semua dinilai setelah submit, seperti ujian asli"],
        ].map(([v, label, desc], i) => (
          <label key={v} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
            <input type="radio" name="mode" value={v} defaultChecked={i === 0} className="mt-1 size-4 accent-primary" />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
          </label>
        ))}
        {f.err("mode") && <ErrorText id="mode-error">{f.err("mode")}</ErrorText>}
      </fieldset>
      <Button type="submit" disabled={f.pending}>
        <Play aria-hidden="true" className="size-4" />
        {f.pending ? "Menyiapkan…" : "Mulai"}
      </Button>
    </form>
  );
}

export function GoalForm({ examId, current }: { examId: string; current: number | null }) {
  const f = useForm(saveGoal);
  return (
    <form action={f.action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={f.state.error} />
      <input type="hidden" name="examId" value={examId} />
      <Field id="target" label="Target skor (0–100)" help="Dipakai sebagai nilai lulus pribadi. Kosongkan untuk memakai nilai resmi." error={f.err("target")}>
        <input id="target" name="target" type="number" min={0} max={100} step="0.1" defaultValue={current ?? ""} className={inputClass} {...f.aria("target")} />
      </Field>
      <Button type="submit" variant="outline" disabled={f.pending}>
        Simpan target
      </Button>
      <Status state={f.state} />
    </form>
  );
}

export function UploadForms({ examId }: { examId: string }) {
  const a = useForm(uploadWithAnswers);
  const b = useForm(uploadWithoutAnswers);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={a.action} className="flex flex-col gap-4" noValidate>
        <FocusFirstError trigger={a.state.error} />
        <input type="hidden" name="examId" value={examId} />
        <h3 className="font-semibold">Soal dengan jawaban</h3>
        <Field
          id="file"
          label="File CSV atau JSON"
          help="CSV: kolom question, a, b, c, d, (e), answer, explanation, topic. JSON: array {question, options[], answer, explanation, topic}."
          error={a.err("file")}
        >
          <input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" className={inputClass} {...a.aria("file")} />
        </Field>
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Atau isi satu soal manual</summary>
          <div className="mt-4 flex flex-col gap-3">
            <Field id="body" label="Soal" error={a.err("body")}>
              <textarea id="body" name="body" rows={3} className={inputClass} {...a.aria("body")} />
            </Field>
            {["A", "B", "C", "D", "E"].map((l) => (
              <Field key={l} id={`opt${l}`} label={`Opsi ${l}${l === "E" ? " (opsional)" : ""}`}>
                <input id={`opt${l}`} name={`opt${l}`} className={inputClass} />
              </Field>
            ))}
            <Field id="answer" label="Kunci jawaban">
              <select id="answer" name="answer" className={inputClass} defaultValue="A">
                {["A", "B", "C", "D", "E"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field id="explanation" label="Penjelasan">
              <textarea id="explanation" name="explanation" rows={2} className={inputClass} />
            </Field>
            <Field id="topic" label="Topik">
              <input id="topic" name="topic" className={inputClass} />
            </Field>
          </div>
        </details>
        <Button type="submit" disabled={a.pending}>
          <Upload aria-hidden="true" className="size-4" />
          {a.pending ? "Menyimpan dan memverifikasi…" : "Simpan soal"}
        </Button>
        <Status state={a.state} />
      </form>

      <form action={b.action} className="flex flex-col gap-4" noValidate>
        <FocusFirstError trigger={b.state.error} />
        <input type="hidden" name="examId" value={examId} />
        <h3 className="font-semibold">Soal tanpa jawaban</h3>
        <Field id="file-b" label="File PDF atau teks" help="AI mengekstrak soal dan menjawabnya, lalu kunci diverifikasi model lain." error={b.err("file-b")}>
          <input id="file-b" name="file" type="file" accept=".pdf,.txt,application/pdf,text/plain" className={inputClass} {...b.aria("file-b")} />
        </Field>
        <Button type="submit" variant="accent" disabled={b.pending}>
          <Upload aria-hidden="true" className="size-4" />
          {b.pending ? "AI sedang membaca file…" : "Proses dengan AI"}
        </Button>
        <Status state={b.state} />
      </form>
    </div>
  );
}
