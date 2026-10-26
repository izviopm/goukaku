"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { createExam, type CreateExamState } from "./actions";

export function CreateExamForm() {
  const [state, action, pending] = useActionState<CreateExamState, FormData>(createExam, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={state} />
      <Field id="exam-certification" label="Certification" help='For example "CGI". The same certification and module always lead to the same question bank.' error={state.error}>
        <input
          id="exam-certification"
          name="certification"
          required
          className={inputClass}
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "exam-certification-error" : "exam-certification-help"}
        />
      </Field>
      <Field id="exam-module" label="Module / subject" help='For example "002 Pengantar Hukum Asuransi". Type "General" when the exam has no module.'>
        <input id="exam-module" name="module" required className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        <Plus aria-hidden="true" className="size-4" />
        {pending ? "Creating…" : "Create exam"}
      </Button>
    </form>
  );
}
