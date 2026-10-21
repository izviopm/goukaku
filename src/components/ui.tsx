import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, Sparkles, type LucideIcon } from "lucide-react";
import { AnimatedBar, Reveal } from "@/components/motion";

// Shared primitives per UI_RULES.md section 7. Icons: Lucide only.

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const variants = {
  primary: "bg-primary text-white hover:bg-primary-strong",
  accent: "bg-accent text-accent-foreground hover:bg-accent/85",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};
export type Variant = keyof typeof variants;

export const buttonClass = (variant: Variant = "primary", extra = "") =>
  `inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition duration-150 ease-out motion-safe:active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${focus} ${variants[variant]} ${extra}`;

export function Button({ variant, className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant, className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-xl border bg-card p-6 shadow-sm ${className}`} {...props} />;
}

export function Badge({ tone = "primary", children }: { tone?: "primary" | "accent"; children: ReactNode }) {
  const cls = tone === "accent" ? "bg-accent-soft text-accent-foreground" : "bg-primary-soft text-primary";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const inputClass = `w-full rounded-lg border bg-card px-3 py-2 text-base text-foreground min-h-11 sm:min-h-10 ${focus} aria-invalid:border-destructive`;

export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  );
}

export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-sm text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Ai-blue banner with the seigaiha pattern; the only place the pattern appears besides the header. */
export function Hero({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary to-primary-strong p-6 text-white shadow-sm sm:p-8">
      <div aria-hidden="true" className="pattern-seigaiha absolute inset-0 text-white" />
      <Reveal className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          {eyebrow && <p className="text-sm font-medium text-white/85">{eyebrow}</p>}
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {children && <div className="text-white/90">{children}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </Reveal>
    </section>
  );
}

type Tone = "primary" | "accent" | "muted" | "ai";

export function IconTile({ icon: Icon, tone = "primary" }: { icon: LucideIcon; tone?: Tone }) {
  const cls = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
    ai: "bg-ai-soft text-ai",
  }[tone];
  return (
    <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${cls}`}>
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

export function StatTile({ icon, label, value, tone, hint }: { icon: LucideIcon; label: string; value: ReactNode; tone?: Tone; hint?: string }) {
  return (
    <Card className="flex items-center gap-4">
      <IconTile icon={icon} tone={tone} />
      <div className="flex flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {hint && <span className="text-xs font-medium text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

/** The AI mark (UI_RULES 4, "Penanda AI"). `thinking` pulses only while a request is in flight. */
export function AiAvatar({ thinking = false, size = "md" }: { thinking?: boolean; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8" : "size-10";
  return (
    <span aria-hidden="true" className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-linear-to-br from-ai to-primary text-white shadow-sm`}>
      <Sparkles className={`${size === "sm" ? "size-4" : "size-5"} ${thinking ? "motion-safe:animate-pulse" : ""}`} />
    </span>
  );
}

export function SectionTitle({ icon, children, aside, tone }: { icon?: LucideIcon; children: ReactNode; aside?: ReactNode; tone?: Tone }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        {icon && <IconTile icon={icon} tone={tone} />}
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/50 px-6 py-10 text-center">
      <IconTile icon={icon} />
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Decorative bar; always pair it with the number in text. */
export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "accent" | "ai" }) {
  const cls = { primary: "bg-primary", success: "bg-success", accent: "bg-accent", ai: "bg-ai" }[tone];
  return (
    <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <AnimatedBar value={value} className={cls} />
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold sm:text-3xl">{children}</h1>
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  );
}
