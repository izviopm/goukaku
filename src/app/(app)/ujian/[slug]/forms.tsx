"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { saveGoal, type FormState } from "./actions";

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
