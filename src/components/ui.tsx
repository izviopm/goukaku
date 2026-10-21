import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert } from "lucide-react";

// Shared primitives per UI_RULES.md section 7. Icons: Lucide only.

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const variants = {
  primary: "bg-primary text-white hover:bg-primary/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/85",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};
export type Variant = keyof typeof variants;

export const buttonClass = (variant: Variant = "primary", extra = "") =>
  `inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed ${focus} ${variants[variant]} ${extra}`;

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

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold sm:text-3xl">{children}</h1>
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  );
}
