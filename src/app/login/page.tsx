"use client";

import { useActionState } from "react";
import { Reveal } from "@/components/motion";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { FocusFirstError } from "@/components/focus-error";
import { signIn, type LoginState } from "./actions";
import { HowItWorks } from "./how-it-works";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const err = (f: LoginState["field"]) => (state.field === f ? state.error : undefined);

  return (
    <main className="grid lg:min-h-dvh lg:grid-cols-2">
      {/* Phones: below the form. Desktop: left column. */}
      <section className="relative order-last overflow-hidden bg-linear-to-br from-primary to-primary-strong px-4 py-10 text-white sm:px-8 lg:order-first lg:flex lg:flex-col lg:justify-center lg:p-12">
        <div aria-hidden="true" className="pattern-seigaiha absolute inset-0 text-white" />
        <Reveal className="relative mx-auto flex w-full max-w-lg flex-col gap-8">
          <div className="hidden items-center gap-3 lg:flex">
            <span lang="ja" aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">
              合
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold">Goukaku</span>
              <span className="text-sm text-white/85">Practice until you pass</span>
            </span>
          </div>
          <HowItWorks />
          <p className="text-sm text-white/85">
            © 2026{" "}
            <a
              href="https://www.linkedin.com/in/izvio-prijaya-mumin-ba0463149/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              Izvio Prijaya Mumin
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            . All rights reserved.
          </p>
        </Reveal>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:py-16">
        <Reveal className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <span lang="ja" aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-sm lg:hidden">
              合
            </span>
            <h1 className="text-2xl font-bold sm:text-3xl">Sign in to Goukaku</h1>
            <p className="text-muted-foreground">Use the account your admin created for you.</p>
            <a
              href="#tour-title"
              className="text-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              New here? See how it works
            </a>
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
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>
        </Reveal>
      </section>
    </main>
  );
}
