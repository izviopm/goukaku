"use client";

import { useActionState } from "react";
import { CircleCheck, Play } from "lucide-react";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { saveGoal, startSimulation, type FormState } from "./actions";

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

export function GoalForm({
  examId,
  language,
  target,
  examSize,
  officialPass,
  submitLabel = "Save",
}: {
  examId: string;
  language: "en" | "id" | null;
  target: number | null;
  examSize: number | null;
  officialPass: number | null;
  submitLabel?: string;
}) {
  const f = useForm(saveGoal);
  return (
    <form action={f.action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={f.state.error} />
      <input type="hidden" name="examId" value={examId} />
      {language ? (
        <p className="text-sm">
          <span className="font-medium">Question language:</span> {language === "en" ? "English" : "Indonesian"}
          <span className="text-muted-foreground"> · shared by everyone studying this exam</span>
        </p>
      ) : (
        <Field id="language" label="Question language" help="Shared by everyone studying this exam." error={f.err("language")}>
          <select id="language" name="language" defaultValue="" className={inputClass} {...f.aria("language")}>
            <option value="" disabled>
              Choose…
            </option>
            <option value="en">English</option>
            <option value="id">Indonesian</option>
          </select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="target"
          label="Target score (optional)"
          help={officialPass != null ? `Official passing score: ${officialPass}. Leave empty to use it.` : "Your personal passing score, 0–100."}
          error={f.err("target")}
        >
          <input id="target" name="target" type="number" min={0} max={100} step="0.1" defaultValue={target ?? ""} className={inputClass} {...f.aria("target")} />
        </Field>
        <Field id="examSize" label="Questions in the real exam (optional)" help="Used as the default practice length." error={f.err("examSize")}>
          <input id="examSize" name="examSize" type="number" min={1} max={500} defaultValue={examSize ?? ""} className={inputClass} {...f.aria("examSize")} />
        </Field>
      </div>
      <Button type="submit" disabled={f.pending} className="self-start">
        {f.pending ? "Saving…" : submitLabel}
      </Button>
      <Status state={f.state} />
    </form>
  );
}
