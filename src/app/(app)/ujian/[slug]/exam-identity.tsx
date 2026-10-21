"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, SendHorizontal } from "lucide-react";
import { easeOut, spring } from "@/components/motion";
import { AiAvatar, Button, ErrorText, inputClass } from "@/components/ui";
import type { ChatMessage } from "@/lib/ai";
import type { ExamIdentity } from "@/lib/exam-context";
import { clarifyExam, confirmIdentity } from "./identity-actions";

/** Read-only card once the exam is identified (shared by everyone studying it). */
export function IdentityCard({ identity }: { identity: ExamIdentity }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ai-border bg-ai-soft/50 p-4">
      <p className="font-semibold">
        {identity.full_name}
        {identity.issuer && <span className="font-normal text-muted-foreground"> · {identity.issuer}</span>}
      </p>
      {(identity.scope || identity.country) && (
        <p className="text-sm">{[identity.scope, identity.country].filter(Boolean).join(" · ")}</p>
      )}
      <p className="text-sm text-muted-foreground">{identity.summary}</p>
    </div>
  );
}

/**
 * "What is this exam?" conversation: the AI asks until it knows the exact certification, then proposes
 * an identity card. Confirming saves it for everyone studying this exam and feeds every AI prompt.
 */
export function ExamIdentityChat({ examId, examName }: { examId: string; examName: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<ExamIdentity | null>(null);
  const [error, setError] = useState("");
  const [thinking, startThinking] = useTransition();
  const [saving, startSaving] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, proposal]);

  function send(text: string) {
    text = text.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setProposal(null);
    setError("");
    startThinking(async () => {
      const res = await clarifyExam(examId, next);
      if (res.error) return setError(res.error);
      if (res.message) setMessages([...next, { role: "assistant", content: res.message }]);
      if (res.identity) setProposal(res.identity);
    });
  }

  function confirm() {
    if (!proposal) return;
    startSaving(async () => {
      const res = await confirmIdentity(examId, proposal);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        &quot;{examName}&quot; can mean different things. Tell the AI exactly which certification, issuer, and module or level you are preparing for. It asks follow-up
        questions until it is sure, and every question it writes will match.
      </p>

      {(messages.length > 0 || thinking) && (
        <div ref={scrollRef} aria-live="polite" className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl border bg-muted/30 p-3">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={spring}
                className="max-w-4/5 self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-white"
              >
                <span className="sr-only">You: </span>
                {m.content}
              </motion.p>
            ) : (
              <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={spring} className="flex max-w-11/12 items-start gap-2 self-start">
                <AiAvatar size="sm" />
                <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-ai-border/70 bg-ai-soft px-3 py-2 text-sm">
                  <span className="sr-only">AI: </span>
                  {m.content}
                </p>
              </motion.div>
            ),
          )}
          {thinking && (
            <p className="flex items-center gap-2 self-start text-sm font-medium text-ai">
              <AiAvatar size="sm" thinking /> AI is checking…
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {proposal && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: easeOut }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
            <p className="text-sm font-medium">Is this your exam?</p>
            <IdentityCard identity={proposal} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirm} disabled={saving}>
                <CircleCheck aria-hidden="true" className="size-4" /> {saving ? "Saving…" : "Yes, that is it"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setProposal(null);
                  inputRef.current?.focus();
                }}
              >
                Not quite
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!proposal && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="identity-input" className="text-sm font-medium">
            {messages.length ? "Your answer" : "What exam are you preparing for?"}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              id="identity-input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={messages.length ? "" : 'For example: "CGI (Certified General Insurance) from AAUI, module 002"'}
              className={inputClass}
              maxLength={2000}
            />
            <Button type="submit" disabled={thinking || !input.trim()} aria-label="Send" className="size-11 shrink-0 px-0 sm:size-10">
              <SendHorizontal aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </form>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
