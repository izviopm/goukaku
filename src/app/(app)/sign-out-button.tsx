"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { LogOut } from "lucide-react";
import { spring } from "@/components/motion";
import { Button } from "@/components/ui";
import { signOut } from "./actions";

/** Header sign-out button that asks first. Native <dialog> gives the focus trap, Esc and inert page. */
export function SignOutButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    cancelRef.current?.focus(); // safe default: Enter right away keeps the user signed in
  }, [open]);

  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <LogOut aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Sign out</span>
        <span className="sr-only sm:hidden">Sign out</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="sign-out-title"
        aria-describedby="sign-out-desc"
        // Esc: play the exit animation instead of closing instantly; close() runs once it finishes.
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        className="m-0 size-full max-h-none max-w-none bg-transparent p-0 backdrop:bg-transparent"
      >
        <AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
          {open && (
            <div key="sheet" className="flex min-h-full items-center justify-center p-4">
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 bg-foreground/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                onClick={() => setOpen(false)}
              />
              <motion.div
                className="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center shadow-sm"
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
              >
                <motion.span
                  aria-hidden="true"
                  className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-foreground"
                  initial={{ scale: 0.6, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0, transition: { ...spring, delay: 0.06 } }}
                >
                  <LogOut className="size-5" />
                </motion.span>
                <h2 id="sign-out-title" className="text-lg font-semibold">
                  Sign out?
                </h2>
                <p id="sign-out-desc" className="text-sm text-muted-foreground">
                  You will need your email and password to sign in again.
                </p>
                <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button ref={cancelRef} type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <form action={signOut} className="w-full sm:w-auto">
                    <ConfirmButton />
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </dialog>
    </>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
