"use client";

import { useActionState } from "react";
import { CircleCheck, FileSpreadsheet, FileText, Play, Upload } from "lucide-react";
import { Button, ErrorText, Field, IconTile, inputClass } from "@/components/ui";
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
      <Field id="size" label="Number of questions" help={`${ready} verified questions in your bank. If that is not enough, more are pulled from the shared bank.`} error={f.err("size")}>
        <input id="size" name="size" type="number" min={1} max={200} defaultValue={Math.min(20, Math.max(ready, 1))} className={inputClass} {...f.aria("size")} />
      </Field>
      <fieldset className="flex flex-col gap-2" {...f.aria("mode")}>
        <legend className="mb-1 text-sm font-medium">Feedback mode (cannot be changed after you start)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["instant", "Instant", "See right or wrong and the explanation after each answer"],
            ["end", "At the end", "Everything is graded after you submit, like the real exam"],
          ].map(([v, label, desc], i) => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-150 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input type="radio" name="mode" value={v} defaultChecked={i === 0} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
              </span>
            </label>
          ))}
        </div>
        {f.err("mode") && <ErrorText id="mode-error">{f.err("mode")}</ErrorText>}
      </fieldset>
      <Button type="submit" disabled={f.pending}>
        <Play aria-hidden="true" className="size-4" />
        {f.pending ? "Preparing…" : "Start"}
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
      <Field id="target" label="Target score (0–100)" help="Used as your personal passing score. Leave empty to use the official one." error={f.err("target")}>
        <input id="target" name="target" type="number" min={0} max={100} step="0.1" defaultValue={current ?? ""} className={inputClass} {...f.aria("target")} />
      </Field>
      <Button type="submit" variant="outline" disabled={f.pending}>
        Save target
      </Button>
      <Status state={f.state} />
    </form>
  );
}

export function UploadForms({ examId }: { examId: string }) {
  const a = useForm(uploadWithAnswers);
  const b = useForm(uploadWithoutAnswers);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={a.action} className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4 sm:p-6" noValidate>
        <FocusFirstError trigger={a.state.error} />
        <input type="hidden" name="examId" value={examId} />
        <div className="flex items-center gap-3">
          <IconTile icon={FileSpreadsheet} />
          <div>
            <h3 className="font-semibold">Questions with answers</h3>
            <p className="text-sm text-muted-foreground">Your answer key is checked before use.</p>
          </div>
        </div>
        <Field
          id="file"
          label="CSV or JSON file"
          help="CSV columns: question, a, b, c, d, (e), answer, explanation, topic. JSON: an array of {question, options[], answer, explanation, topic}."
          error={a.err("file")}
        >
          <input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" className={inputClass} {...a.aria("file")} />
        </Field>
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer font-medium">Or add one question manually</summary>
          <div className="mt-4 flex flex-col gap-3">
            <Field id="body" label="Question" error={a.err("body")}>
              <textarea id="body" name="body" rows={3} className={inputClass} {...a.aria("body")} />
            </Field>
            {["A", "B", "C", "D", "E"].map((l) => (
              <Field key={l} id={`opt${l}`} label={`Option ${l}${l === "E" ? " (optional)" : ""}`}>
                <input id={`opt${l}`} name={`opt${l}`} className={inputClass} />
              </Field>
            ))}
            <Field id="answer" label="Correct answer">
              <select id="answer" name="answer" className={inputClass} defaultValue="A">
                {["A", "B", "C", "D", "E"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field id="explanation" label="Explanation">
              <textarea id="explanation" name="explanation" rows={2} className={inputClass} />
            </Field>
            <Field id="topic" label="Topic">
              <input id="topic" name="topic" className={inputClass} />
            </Field>
          </div>
        </details>
        <Button type="submit" disabled={a.pending}>
          <Upload aria-hidden="true" className="size-4" />
          {a.pending ? "Saving and verifying…" : "Save questions"}
        </Button>
        <Status state={a.state} />
      </form>

      <form action={b.action} className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4 sm:p-6" noValidate>
        <FocusFirstError trigger={b.state.error} />
        <input type="hidden" name="examId" value={examId} />
        <div className="flex items-center gap-3">
          <IconTile icon={FileText} tone="accent" />
          <div>
            <h3 className="font-semibold">Questions without answers</h3>
            <p className="text-sm text-muted-foreground">The AI answers them, then other models verify the key.</p>
          </div>
        </div>
        <Field id="file-b" label="PDF or text file" help="Scanned PDFs (images without text) are not supported yet." error={b.err("file-b")}>
          <input id="file-b" name="file" type="file" accept=".pdf,.txt,application/pdf,text/plain" className={inputClass} {...b.aria("file-b")} />
        </Field>
        <Button type="submit" variant="accent" disabled={b.pending}>
          <Upload aria-hidden="true" className="size-4" />
          {b.pending ? "AI is reading the file…" : "Process with AI"}
        </Button>
        <Status state={b.state} />
      </form>
    </div>
  );
}
