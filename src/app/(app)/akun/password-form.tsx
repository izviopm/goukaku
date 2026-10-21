"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  const formRef = useRef<HTMLFormElement>(null);
  const err = (f: PasswordState["field"]) => (state.field === f ? state.error : undefined);
  const aria = (f: NonNullable<PasswordState["field"]>) => ({
    "aria-invalid": !!err(f),
    "aria-describedby": err(f) ? `${f}-error` : `${f}-help`,
  });

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={state.error ? state : null} />
      <Field id="current" label="Current password" error={err("current")}>
        <input id="current" name="current" type="password" autoComplete="current-password" required className={inputClass} {...aria("current")} />
      </Field>
      <Field id="password" label="New password" help="At least 8 characters." error={err("password")}>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} {...aria("password")} />
      </Field>
      <Field id="confirm" label="Repeat new password" error={err("confirm")}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} {...aria("confirm")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
      <div aria-live="polite">
        {state.message && (
          <p className="flex items-center gap-1 text-sm text-success">
            <CircleCheck aria-hidden="true" className="size-4" />
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
