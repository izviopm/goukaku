"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Send } from "lucide-react";
import { easeOut, spring } from "@/components/motion";
import { Badge, Button, Card, ErrorText, ProgressBar } from "@/components/ui";
import { ReportQuestion } from "@/components/report";
import { LETTERS } from "@/lib/rules";
import { answerItem, endSimulation, type Feedback } from "../actions";

export type RunnerItem = {
  id: string;
  questionId: string | null;
  body: string;
  options: string[];
  topic: string | null;
  userAnswer: string | null;
  feedback?: Feedback;
};

export function Runner({ simId, examName, mode, items: initial, shortBy }: { simId: string; examName: string; mode: "instant" | "end"; items: RunnerItem[]; shortBy: number }) {
  const [items, setItems] = useState(initial);
  const [i, setI] = useState(() => Math.max(0, initial.findIndex((x) => !x.userAnswer)));
  const [dir, setDir] = useState(1);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const item = items[i];
  const answered = items.filter((x) => x.userAnswer).length;
  const locked = mode === "instant" && !!item.feedback;

  function go(next: number) {
    setDir(next > i ? 1 : -1);
    setI(next);
  }

  function choose(letter: string) {
    if (locked || pending) return;
    setError("");
    const prev = items;
    setItems(items.map((x, k) => (k === i ? { ...x, userAnswer: letter } : x)));
    start(async () => {
      const res = await answerItem(item.id, letter);
      if (res.error) {
        setItems(prev);
        setError(res.error);
      } else if (res.feedback) setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, feedback: res.feedback } : x)));
    });
  }

  function end(status: "finished" | "abandoned") {
    start(async () => {
      const res = await endSimulation(simId, status);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-36 sm:pb-0">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{examName}</h1>
          <Badge>{mode === "instant" ? "Instant feedback" : "Feedback at the end"}</Badge>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Question <span className="font-semibold text-foreground tabular-nums">{i + 1}</span> of {items.length}
          </span>
          <span className="tabular-nums">{answered} answered</span>
        </div>
        <ProgressBar value={(100 * answered) / items.length} />
      </div>

      {shortBy > 0 && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-foreground">
          {shortBy} verified questions short, so this run uses {items.length}. Ask the AI assistant on the exam page for more questions.
        </p>
      )}

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={item.id}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0, transition: easeOut }}
          exit={{ opacity: 0, x: dir * -24, transition: { duration: 0.14 } }}
        >
          <Card className="flex flex-col gap-4">
            {item.topic && (
              <span className="self-start">
                <Badge>{item.topic}</Badge>
              </span>
            )}
            <p className="max-w-prose whitespace-pre-wrap text-base sm:text-lg">{item.body}</p>
            <div role="radiogroup" aria-label={`Answer choices for question ${i + 1}`} className="flex flex-col gap-2">
              {item.options.map((opt, k) => {
                const letter = LETTERS[k];
                const selected = item.userAnswer === letter;
                const fb = item.feedback;
                const isKey = fb?.answer === letter;
                const wrongPick = fb && selected && !fb.is_correct;
                const tone = isKey
                  ? "border-success bg-success/10"
                  : wrongPick
                    ? "border-accent-text bg-accent-soft"
                    : selected
                      ? "border-primary bg-primary-soft"
                      : "hover:border-primary/40 hover:bg-muted";
                return (
                  <motion.button
                    key={letter}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={locked || pending}
                    onClick={() => choose(letter)}
                    whileTap={locked ? undefined : { scale: 0.98 }}
                    animate={isKey ? { scale: [1, 1.02, 1] } : wrongPick ? { x: [0, -6, 6, -3, 0] } : undefined}
                    transition={{ duration: 0.35 }}
                    className={`flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed sm:p-4 ${tone}`}
                  >
                    <span
                      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${selected ? "bg-primary text-white" : "bg-muted text-foreground"}`}
                    >
                      {letter}
                    </span>
                    <span className="flex-1 pt-0.5">{opt}</span>
                    {isKey && (
                      <span className="flex items-center gap-1 pt-0.5 text-sm font-medium text-success">
                        <CircleCheck aria-hidden="true" className="size-4" /> Correct answer
                      </span>
                    )}
                    {wrongPick && (
                      <span className="flex items-center gap-1 pt-0.5 text-sm font-medium text-accent-text">
                        <CircleX aria-hidden="true" className="size-4" /> Your answer
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            <div aria-live="polite">
              <AnimatePresence>
                {item.feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={spring}
                    className={`flex flex-col gap-2 rounded-xl p-4 ${item.feedback.is_correct ? "bg-success/10" : "bg-accent-soft"}`}
                  >
                    <p className={`flex items-center gap-2 font-semibold ${item.feedback.is_correct ? "text-success" : "text-accent-foreground"}`}>
                      {item.feedback.is_correct ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
                      {item.feedback.is_correct ? "Correct" : `Wrong. The answer is ${item.feedback.answer}`}
                    </p>
                    {item.feedback.explanation && <p className="max-w-prose text-sm">{item.feedback.explanation}</p>}
                  </motion.div>
                )}
              </AnimatePresence>
              {error && <ErrorText>{error}</ErrorText>}
            </div>
            {item.feedback && <ReportQuestion key={item.id} questionId={item.questionId} />}
          </Card>
        </motion.div>
      </AnimatePresence>

      <nav aria-label="Jump to question" className="flex flex-wrap gap-1.5">
        {items.map((x, k) => (
          <button
            key={x.id}
            type="button"
            onClick={() => go(k)}
            aria-current={k === i ? "step" : undefined}
            aria-label={`Question ${k + 1}${x.userAnswer ? ", answered" : ""}`}
            className={`size-11 cursor-pointer rounded-lg border text-sm font-medium tabular-nums transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:scale-95 sm:size-10 ${
              k === i ? "border-primary bg-primary text-white" : x.userAnswer ? "border-primary/30 bg-primary-soft text-primary" : "bg-card hover:bg-muted"
            }`}
          >
            {k + 1}
          </button>
        ))}
      </nav>

      {/* On phones the actions stay docked at the bottom, within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 p-3 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}>
              <ChevronLeft aria-hidden="true" className="size-4" /> Previous
            </Button>
            <Button variant="outline" onClick={() => go(i + 1)} disabled={i === items.length - 1}>
              Next <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex">
            <Button variant="ghost" onClick={() => end("abandoned")} disabled={pending}>
              Leave
            </Button>
            <Button onClick={() => end("finished")} disabled={pending}>
              <Send aria-hidden="true" className="size-4" />
              {answered < items.length ? `Submit (${items.length - answered} left)` : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
