"use client";

import { useActionState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Button, ErrorText } from "@/components/ui";

type State = { error?: string; message?: string };

/** Form with a submit button and an announced success/error line (admin forms). */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-4",
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  submit: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submit}
        </Button>
        <div aria-live="polite" className="text-sm">
          {state.message && (
            <span className="flex items-center gap-1 text-success">
              <CircleCheck aria-hidden="true" className="size-4" />
              {state.message}
            </span>
          )}
          {state.error && <ErrorText>{state.error}</ErrorText>}
        </div>
      </div>
    </form>
  );
}
