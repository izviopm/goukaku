"use client";

import { useActionState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { signIn, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const err = (f: LoginState["field"]) => (state.field === f ? state.error : undefined);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <p className="text-3xl font-bold text-primary" lang="ja">
          合格
        </p>
        <h1 className="text-2xl font-bold">Goukaku</h1>
        <p className="text-muted-foreground">Masuk untuk mulai renshuu. Akun dibuat oleh admin.</p>
      </div>
      <Card>
        <form action={action} className="flex flex-col gap-4" noValidate>
          <FocusFirstError trigger={state} />
          <Field id="email" label="Email" error={err("email")}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className={inputClass}
              aria-invalid={!!err("email")}
              aria-describedby={err("email") ? "email-error" : undefined}
            />
          </Field>
          <Field id="password" label="Password" error={err("password")}>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
              aria-invalid={!!err("password")}
              aria-describedby={err("password") ? "password-error" : undefined}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Memproses…" : "Masuk"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
