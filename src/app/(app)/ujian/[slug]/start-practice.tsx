"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CircleCheck, Play, Sparkles, TriangleAlert } from "lucide-react";
import { FocusFirstError } from "@/components/focus-error";
import { JobProgress } from "@/components/job-progress";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { getReadiness, startSimulation, type FormState, type Readiness } from "./actions";
import { prepareMissing } from "./question-actions";

export function StartPractice({
  examId,
  defaultSize,
  initial,
  format,
  activeJobId,
}: {
  examId: string;
  defaultSize: number;
  initial: Readiness[];
  format: "mcq" | "essay";
  activeJobId?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(startSimulation, {});
  const [size, setSize] = useState(defaultSize);
  const [readiness, setReadiness] = useState(initial);
  const [checking, startCheck] = useTransition();
  const [preparing, startPrepare] = useTransition();
  const [job, setJob] = useState<{ jobId?: string; error?: string; message?: string }>({ jobId: activeJobId });

  // Re-check per-topic availability when the size changes (debounced).
  useEffect(() => {
    if (size === defaultSize && readiness === initial) return;
    const t = setTimeout(() => startCheck(async () => setReadiness(await getReadiness(examId, size))), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, examId]);

  const short = readiness.filter((r) => r.available < r.needed);
  const missing = short.reduce((s, r) => s + r.needed - r.available, 0);
  const err = state.field === "size" ? state.error : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={state} />
      <input type="hidden" name="examId" value={examId} />
      <Field id="size" label="Number of questions" help="The mix follows your blueprint exactly." error={err}>
        <input
          id="size"
          name="size"
          type="number"
          min={1}
          max={200}
          value={size || ""}
          onChange={(e) => setSize(Number(e.target.value))}
          className={inputClass}
          aria-invalid={!!err}
          aria-describedby={err ? "size-error" : "size-help"}
        />
      </Field>

      <ul aria-live="polite" className={`flex flex-col gap-1.5 rounded-xl border p-3 text-sm ${checking ? "opacity-60" : ""}`}>
        {readiness.map((r) => {
          const ok = r.available >= r.needed;
          return (
            <li key={r.topic} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {ok ? <CircleCheck aria-hidden="true" className="size-4 text-success" /> : <TriangleAlert aria-hidden="true" className="size-4 text-accent-text" />}
                {r.topic}
              </span>
              <span className={`tabular-nums ${ok ? "text-muted-foreground" : "font-semibold text-accent-text"}`}>
                {r.needed} needed · {r.available} ready
              </span>
            </li>
          );
        })}
      </ul>

      {short.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl bg-accent-soft p-3 text-sm text-accent-foreground">
          <p>
            {missing} more verified question{missing === 1 ? "" : "s"} needed to follow your blueprint for {size} questions. You can also pick a smaller number.
          </p>
          <Button
            type="button"
            variant="primary"
            className="self-start"
            disabled={preparing || !!(job.jobId && !job.error)}
            onClick={() => startPrepare(async () => setJob(await prepareMissing(examId, size)))}
          >
            <Sparkles aria-hidden="true" className="size-4" />
            {preparing ? "Starting…" : `Prepare ${missing} missing question${missing === 1 ? "" : "s"}`}
          </Button>
          {job.error && <ErrorText>{job.error}</ErrorText>}
          {job.message && <p>{job.message}</p>}
        </div>
      ) : null}
      {job.jobId && <JobProgress key={job.jobId} jobId={job.jobId} />}

      {format === "essay" && <p className="text-sm text-muted-foreground">Each essay answer is graded by AI and uses one AI call from your daily limit.</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Feedback mode (cannot be changed after you start)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            [
              "instant",
              "Instant",
              format === "essay" ? "AI grades each answer right after you submit it" : "See right or wrong and the explanation after each answer",
            ],
            [
              "end",
              "At the end",
              format === "essay" ? "All answers are graded by AI when you submit" : "Everything is graded after you submit, like the real exam",
            ],
          ].map(([v, label, desc], i) => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-150 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input type="radio" name="mode" value={v} defaultChecked={i === 0} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending || short.length > 0 || checking}>
        <Play aria-hidden="true" className="size-4" />
        {pending ? "Preparing…" : "Start practice"}
      </Button>
      {state.error && state.field !== "size" && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
