"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Send } from "lucide-react";
import { Badge, Button, Card, ErrorText } from "@/components/ui";
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
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const item = items[i];
  const answered = items.filter((x) => x.userAnswer).length;
  const locked = mode === "instant" && !!item.feedback;

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Moshi: {examName}
        </h1>
        <Badge>Mode {mode === "instant" ? "langsung" : "di akhir"}</Badge>
      </div>
      {shortBy > 0 && (
        <p className="rounded-lg bg-accent-soft px-4 py-2 text-sm text-accent-foreground">
          Soal terverifikasi kurang {shortBy}. Simulasi memakai {items.length} soal. Minta AI menambah soal lewat chat di halaman ujian.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Soal {i + 1} dari {items.length} · {answered} terjawab
      </p>

      <Card className="flex flex-col gap-4">
        {item.topic && <Badge>{item.topic}</Badge>}
        <p className="max-w-[70ch] whitespace-pre-wrap text-base">{item.body}</p>
        <div role="radiogroup" aria-label={`Pilihan jawaban soal ${i + 1}`} className="flex flex-col gap-2">
          {item.options.map((opt, k) => {
            const letter = LETTERS[k];
            const selected = item.userAnswer === letter;
            const fb = item.feedback;
            const isKey = fb?.answer === letter;
            const wrongPick = fb && selected && !fb.is_correct;
            const tone = isKey ? "border-success bg-success/10" : wrongPick ? "border-accent-text bg-accent-soft" : selected ? "border-primary bg-primary-soft" : "hover:bg-muted";
            return (
              <button
                key={letter}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked || pending}
                onClick={() => choose(letter)}
                className={`flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed ${tone}`}
              >
                <span className="font-semibold">{letter}.</span>
                <span className="flex-1">{opt}</span>
                {isKey && (
                  <span className="flex items-center gap-1 text-sm font-medium text-success">
                    <CircleCheck aria-hidden="true" className="size-4" /> Kunci
                  </span>
                )}
                {wrongPick && (
                  <span className="flex items-center gap-1 text-sm font-medium text-accent-text">
                    <CircleX aria-hidden="true" className="size-4" /> Pilihanmu
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {item.feedback && (
            <div className={`flex flex-col gap-2 rounded-lg p-4 motion-safe:animate-[fadein_200ms_ease-out] ${item.feedback.is_correct ? "bg-success/10" : "bg-accent-soft"}`}>
              <p className={`flex items-center gap-2 font-semibold ${item.feedback.is_correct ? "text-success" : "text-accent-foreground"}`}>
                {item.feedback.is_correct ? <CircleCheck aria-hidden="true" className="size-5" /> : <CircleX aria-hidden="true" className="size-5" />}
                {item.feedback.is_correct ? "Benar" : `Salah. Kunci: ${item.feedback.answer}`}
              </p>
              {item.feedback.explanation && <p className="max-w-[70ch] text-sm">{item.feedback.explanation}</p>}
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        {item.feedback && <ReportQuestion key={item.id} questionId={item.questionId} />}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setI(i - 1)} disabled={i === 0}>
            <ChevronLeft aria-hidden="true" className="size-4" /> Sebelumnya
          </Button>
          <Button variant="outline" onClick={() => setI(i + 1)} disabled={i === items.length - 1}>
            Berikutnya <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => end("abandoned")} disabled={pending}>
            Tinggalkan
          </Button>
          <Button onClick={() => end("finished")} disabled={pending}>
            <Send aria-hidden="true" className="size-4" /> {answered < items.length ? `Submit (${items.length - answered} belum dijawab)` : "Submit"}
          </Button>
        </div>
      </div>

      <nav aria-label="Lompat ke soal" className="flex flex-wrap gap-1">
        {items.map((x, k) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setI(k)}
            aria-current={k === i ? "step" : undefined}
            aria-label={`Soal ${k + 1}${x.userAnswer ? ", terjawab" : ""}`}
            className={`size-11 cursor-pointer rounded-md border text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-10 ${k === i ? "border-primary bg-primary text-white" : x.userAnswer ? "bg-primary-soft" : "bg-card hover:bg-muted"}`}
          >
            {k + 1}
          </button>
        ))}
      </nav>
    </div>
  );
}
