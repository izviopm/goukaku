"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Button, ErrorText } from "@/components/ui";

type State = { error?: string; message?: string };

/**
 * Form with a submit button and an announced success/error line (admin forms).
 * Submits through onSubmit instead of `action=` so React 19 does not auto-reset the form: an automatic
 * reset puts controlled selects/checkboxes back to their first-render values while React state keeps the
 * new ones, so the screen shows stale choices and the next save sends them. `resetOnSuccess` clears the
 * fields on purpose (for example after creating a user).
 */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-4",
  resetOnSuccess = false,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  submit: string;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.message) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
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
