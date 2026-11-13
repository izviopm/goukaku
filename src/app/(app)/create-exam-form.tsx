"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { createExam, joinExam, type CreateExamState } from "./actions";

export type AvailableExam = { slug: string; display_name: string; scope: string | null };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="min-h-9 shrink-0 px-3 text-sm" disabled={pending}>
      <Plus aria-hidden="true" className="size-4" /> {pending ? "Adding…" : "Add"}
    </Button>
  );
}

export function CreateExamForm({ available = [] }: { available?: AvailableExam[] }) {
  const [state, action, pending] = useActionState<CreateExamState, FormData>(createExam, {});
  return (
    <div className="flex flex-col gap-6">
      {available.length > 0 && (
        <section aria-labelledby="available-title" className="flex flex-col gap-2">
          <h3 id="available-title" className="text-sm font-medium">
            Available exams
          </h3>
          <p className="text-sm text-muted-foreground">Pick yours from the list so you share the existing question bank.</p>
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-xl border">
            {available.map((e) => (
              <li key={e.slug}>
                <form action={joinExam} className="flex items-center justify-between gap-3 p-3">
                  <input type="hidden" name="slug" value={e.slug} />
                  <span className="min-w-0">
                    <span className="block font-medium">{e.display_name}</span>
                    {e.scope && <span className="block truncate text-sm text-muted-foreground">{e.scope}</span>}
                  </span>
                  <AddButton />
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={action} className="flex flex-col gap-4" noValidate>
        {available.length > 0 && <h3 className="text-sm font-medium">Not in the list? Create a new exam</h3>}
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
    </div>
  );
}
