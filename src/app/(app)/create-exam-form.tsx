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
      <Field id="exam-name" label="Nama ujian" help='Contoh: "CGI" atau "TOEFL". Nama yang sama menuju bank yang sama.' error={state.error}>
        <input
          id="exam-name"
          name="name"
          required
          className={inputClass}
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "exam-name-error" : "exam-name-help"}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        <Plus aria-hidden="true" className="size-4" />
        {pending ? "Membuat…" : "Buat ujian"}
      </Button>
    </form>
  );
}
