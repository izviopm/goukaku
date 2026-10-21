"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, SendHorizontal, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { JobProgress } from "@/components/job-progress";
import { easeOut, spring } from "@/components/motion";
import { AiAvatar, Button, ErrorText, inputClass } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What is the passing score?", "Give me study tips", "Explain my weakest topic", "Add 20 practice questions"];

/** Turns bare URLs in AI replies into links so cited sources are clickable. */
function Linkify({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-medium text-ai underline underline-offset-2">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function Chat({ examId }: { examId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  // Focus the message box when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    // Return focus to the launcher once it is back on screen.
    setTimeout(() => launcherRef.current?.focus(), 200);
  }

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId, messages: next.slice(-20) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMessages([...next, { role: "assistant", content: data.reply || "(saved)" }]);
      setNotes(data.notes ?? []);
      if (data.jobId) setJobId(data.jobId);
      if (data.notes?.length) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}
            transition={spring}
            whileTap={{ scale: 0.94 }}
            aria-label="Open AI assistant"
            className="fixed right-4 bottom-4 z-30 inline-flex min-h-14 cursor-pointer items-center gap-2 rounded-full bg-linear-to-br from-ai to-primary py-2 pr-5 pl-2 font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-6 sm:bottom-6"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-white/15">
              <Sparkles aria-hidden="true" className={`size-5 ${busy ? "motion-safe:animate-pulse" : ""}`} />
            </span>
            Ask AI
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-labelledby="ai-title"
            onKeyDown={(e) => e.key === "Escape" && close()}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0, transition: spring }}
            exit={{ opacity: 0, x: 32, transition: { duration: 0.15 } }}
            className="fixed inset-0 z-40 flex flex-col overflow-hidden border-ai-border bg-card shadow-sm sm:inset-y-4 sm:right-4 sm:left-auto sm:w-md sm:rounded-2xl sm:border"
          >
      <header className="flex items-center gap-3 bg-linear-to-r from-ai-soft to-primary-soft px-4 py-4 sm:px-6">
        <AiAvatar thinking={busy} />
        <div className="min-w-0 flex-1">
          <h2 id="ai-title" className="text-lg font-semibold">
            AI assistant
          </h2>
          <p className="text-sm text-muted-foreground">Exam tips, passing scores, and more questions.</p>
        </div>
        <Button type="button" variant="ghost" className="px-2" aria-label="Close AI assistant" onClick={close}>
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="m-auto flex flex-col items-center gap-4 text-center">
            <AiAvatar />
            <p className="font-semibold">How can I help you prepare?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-11 cursor-pointer rounded-full border border-ai-border bg-card px-4 text-sm font-medium text-ai transition-colors duration-150 ease-out hover:bg-ai-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 16, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={spring}
              className="max-w-4/5 origin-bottom-right self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-white"
            >
              <span className="sr-only">You: </span>
              {m.content}
            </motion.div>
          ) : (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={spring}
              className="flex max-w-11/12 origin-top-left items-start gap-3 self-start"
            >
              <AiAvatar size="sm" />
              <div className="min-w-0 whitespace-pre-wrap rounded-2xl rounded-tl-md border border-ai-border/70 bg-ai-soft px-4 py-3">
                <span className="sr-only">AI: </span>
                <Linkify text={m.content} />
              </div>
            </motion.div>
          ),
        )}

        <AnimatePresence>
          {busy && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={easeOut}
              className="flex items-center gap-3 self-start"
            >
              <AiAvatar size="sm" thinking />
              <p className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-ai-soft px-4 py-3 text-sm font-medium text-ai">
                AI is thinking
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="size-1.5 rounded-full bg-ai"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 px-4 empty:hidden sm:px-6">
        {notes.map((n, i) => (
          <p key={i} className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            {n}
          </p>
        ))}
        {jobId && <JobProgress key={jobId} jobId={jobId} />}
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex items-end gap-2 border-t bg-muted/40 p-3 sm:p-4"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="chat-input" className="text-sm font-medium">
            Message
          </label>
          <input
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={4000}
            placeholder="Ask anything about this exam"
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="size-11 px-0 sm:size-10">
          <SendHorizontal aria-hidden="true" className="size-5" />
        </Button>
      </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
