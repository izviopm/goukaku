"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Send } from "lucide-react";
import { easeOut, spring } from "@/components/motion";
import { Badge, Button, Card, ErrorText, ProgressBar } from "@/components/ui";
import { ReportQuestion } from "@/components/report";
import { LETTERS } from "@/lib/rules";
import { answerItem, endSimulation, saveEssay, submitEssay, type Feedback } from "../actions";

export type RunnerItem = {
  id: string;
  questionId: string | null;
  type: "mcq" | "essay";
  body: string;
  options: string[];
  rubric?: string[];
  topic: string | null;
  userAnswer: string | null;
  feedback?: Feedback;
};

export function Runner({ simId, examName, mode, items: initial }: { simId: string; examName: string; mode: "instant" | "end"; items: RunnerItem[] }) {
  const [items, setItems] = useState(initial);
  const [i, setI] = useState(() => Math.max(0, initial.findIndex((x) => !x.userAnswer)));
  const [dir, setDir] = useState(1);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [finishing, setFinishing] = useState(false);
  const [grading, setGrading] = useState<{ done: number; total: number } | null>(null);
  const item = items[i];
  const answered = items.filter((x) => x.userAnswer?.trim()).length;
  const locked = mode === "instant" && !!item.feedback;

  const update = (id: string, patch: Partial<RunnerItem>) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  function go(next: number) {
    setDir(next > i ? 1 : -1);
    setI(next);
  }

  function choose(letter: string) {
    if (locked || pending || item.type !== "mcq") return;
    setError("");
    const prev = items;
    setItems(items.map((x, k) => (k === i ? { ...x, userAnswer: letter } : x)));
    start(async () => {
      const res = await answerItem(item.id, letter);
      if (res.error) {
        setItems(prev);
        setError(res.error);
      } else if (res.feedback) update(item.id, { feedback: res.feedback });
    });
  }

  function saveText(id: string, text: string) {
    start(async () => {
      const res = await saveEssay(id, text);
      if (res.error) setError(res.error);
    });
  }

  function submitCurrentEssay() {
    if (locked || pending || finishing) return;
    const text = item.userAnswer ?? "";
    if (!text.trim()) {
      setError("Write your answer first.");
      return;
    }
    setError("");
    start(async () => {
      const res = await submitEssay(item.id, text);
      if (res.error) setError(res.error);
      else if (res.grade) update(item.id, { feedback: res.grade });
    });
  }

  async function finish(status: "finished" | "abandoned") {
    if (pending || finishing) return;
    setFinishing(true);
    setError("");
    try {
      // Save every essay first, then grade: a quota stop mid-way keeps all text and the simulation open.
      const todo = items.filter((x) => x.type === "essay" && x.userAnswer?.trim() && !x.feedback);
      for (const x of todo) {
        const res = await saveEssay(x.id, x.userAnswer!);
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      if (status === "finished") {
        for (const [n, x] of todo.entries()) {
          setGrading({ done: n, total: todo.length });
          const res = await submitEssay(x.id, x.userAnswer!);
          if (res.error) {
            setError(res.error);
            return;
          }
          if (res.grade) update(x.id, { feedback: res.grade });
        }
      }
    } catch {
      setError("Could not finish the practice exam.");
      return;
    } finally {
      setFinishing(false);
      setGrading(null);
    }
    // Outside the try: a server action redirect must reach the router, not this catch.
    const res = await endSimulation(simId, status);
    if (res?.error) setError(res.error);
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
        {grading && (
          <p role="status" className="text-sm text-muted-foreground">
            Grading essay {Math.min(grading.done + 1, grading.total)} of {grading.total} with AI…
          </p>
        )}
      </div>

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
            {item.type === "mcq" ? (
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
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor={`essay-${item.id}`} className="text-sm font-medium">
                  Your answer
                </label>
                <textarea
                  id={`essay-${item.id}`}
                  value={item.userAnswer ?? ""}
                  onChange={(e) => update(item.id, { userAnswer: e.target.value })}
                  onBlur={(e) => {
                    if (mode === "end" && e.target.value.trim()) saveText(item.id, e.target.value);
                  }}
                  disabled={locked || pending || finishing}
                  maxLength={5000}
                  rows={8}
                  className="w-full rounded-xl border bg-card p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                  aria-describedby={`essay-count-${item.id}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span id={`essay-count-${item.id}`} className="tabular-nums">
                    {(item.userAnswer ?? "").length} / 5,000
                  </span>
                  {mode === "instant" && !item.feedback && (
                    <Button type="button" onClick={submitCurrentEssay} disabled={pending || finishing || !(item.userAnswer ?? "").trim()}>
                      {pending ? "Grading…" : "Submit answer"}
                    </Button>
                  )}
                </div>
                {item.rubric?.length ? <p className="text-xs text-muted-foreground">Graded on: {item.rubric.join(" · ")}</p> : null}
              </div>
            )}

            <div aria-live="polite">
              <AnimatePresence>
                {item.feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={spring}
                    className={`flex flex-col gap-2 rounded-xl p-4 ${item.feedback.is_correct ? "bg-success/10" : "bg-accent-soft"}`}
                  >
                    {item.type === "essay" ? (
                      <>
                        <p className={`flex items-center gap-2 font-semibold ${item.feedback.is_correct ? "text-success" : "text-accent-foreground"}`}>
                          {item.feedback.is_correct ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
                          AI score {item.feedback.score}/100 · {item.feedback.is_correct ? "passing" : "below 60"}
                        </p>
                        {item.feedback.feedback && <p className="max-w-prose whitespace-pre-wrap text-sm">{item.feedback.feedback}</p>}
                      </>
                    ) : (
                      <>
                        <p className={`flex items-center gap-2 font-semibold ${item.feedback.is_correct ? "text-success" : "text-accent-foreground"}`}>
                          {item.feedback.is_correct ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
                          {item.feedback.is_correct ? "Correct" : `Wrong. The answer is ${item.feedback.answer}`}
                        </p>
                        {item.feedback.explanation && <p className="max-w-prose text-sm">{item.feedback.explanation}</p>}
                      </>
                    )}
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
            <Button variant="ghost" onClick={() => finish("abandoned")} disabled={pending || finishing}>
              Leave
            </Button>
            <Button onClick={() => finish("finished")} disabled={pending || finishing}>
              <Send aria-hidden="true" className="size-4" />
              {finishing ? "Saving…" : answered < items.length ? `Submit (${items.length - answered} left)` : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
