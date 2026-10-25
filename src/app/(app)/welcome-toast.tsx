"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, X } from "lucide-react";
import { spring } from "@/components/motion";

const SECONDS = 4;

/** "Signed in" toast, shown once when signIn redirects with ?welcome=1. */
export function WelcomeToast({ name }: { name: string }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(() => params.get("welcome") === "1");

  useEffect(() => {
    if (!open) return;
    // Drop the flag so a refresh or Back does not greet again.
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", url);
    const t = setTimeout(() => setOpen(false), SECONDS * 1000);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div role="status" className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:top-6">
      <AnimatePresence>
        {open && (
          <motion.div
            className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-sm"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.16 } }}
          >
            <motion.span
              aria-hidden="true"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0, transition: { ...spring, delay: 0.1 } }}
            >
              <CircleCheck className="size-5" />
            </motion.span>
            <div className="flex min-w-0 flex-1 flex-col pt-0.5">
              <p className="truncate font-semibold">Welcome back, {name}</p>
              <p className="text-sm text-muted-foreground">You are signed in.</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setOpen(false)}
              className="-m-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            {/* Time left before auto-dismiss; scaleX keeps it transform-only. */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1 origin-left bg-success"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: SECONDS, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
