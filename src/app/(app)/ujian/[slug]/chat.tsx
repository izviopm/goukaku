"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, SendHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { easeOut, spring } from "@/components/motion";
import { AiAvatar, Button, ErrorText, inputClass, ProgressBar } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };
type Job = { requested: number; done: number; status: string; error: string | null };

const SUGGESTIONS = ["Find the exam blueprint", "What is the passing score?", "Add 20 practice questions", "Give me study tips"];

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
  const [job, setJob] = useState<Job | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Poll the generation job until it finishes, then refresh the page counts.
  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const j: Job = await res.json();
      setJob(j);
      if (j.status === "done" || j.status === "failed") {
        clearInterval(t);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [jobId, router]);

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
    <section aria-labelledby="ai-title" className="overflow-hidden rounded-2xl border border-ai-border bg-card shadow-sm">
      <header className="flex items-center gap-3 bg-linear-to-r from-ai-soft to-primary-soft px-4 py-4 sm:px-6">
        <AiAvatar thinking={busy} />
        <div className="min-w-0">
          <h2 id="ai-title" className="text-lg font-semibold">
            AI assistant
          </h2>
          <p className="text-sm text-muted-foreground">Questions, blueprints, passing scores, and study tips.</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex max-h-96 min-h-64 flex-col gap-4 overflow-y-auto px-4 py-6 sm:max-h-128 sm:px-6" aria-live="polite">
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
        {job && (
          <div className="flex flex-col gap-2 rounded-lg border border-ai-border bg-ai-soft/60 p-3 text-sm">
            <p className={job.status === "failed" ? "text-destructive" : "font-medium text-ai"}>
              {job.status === "failed"
                ? `Question generation stopped at ${job.done}/${job.requested}: ${job.error}`
                : job.status === "done"
                  ? `Done: ${job.done}/${job.requested} questions added to your bank. New questions are used once verified.`
                  : `Preparing questions… ${job.done}/${job.requested}`}
            </p>
            <ProgressBar value={(100 * job.done) / job.requested} tone="ai" />
          </div>
        )}
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
    </section>
  );
}
