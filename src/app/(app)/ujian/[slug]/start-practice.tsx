"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CircleCheck, Play, Sparkles, TriangleAlert } from "lucide-react";
import { FocusFirstError } from "@/components/focus-error";
import { JobProgress } from "@/components/job-progress";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import {
  getReadiness,
  startSimulation,
  type FormState,
  type Readiness,
} from "./actions";
import { prepareMissing } from "./question-actions";

const chip =
  "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipOn = "border-primary bg-primary text-white";
const chipOff = "bg-card text-foreground hover:bg-muted";

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
  const [state, action, pending] = useActionState<FormState, FormData>(
    startSimulation,
    {},
  );
  const [size, setSize] = useState(defaultSize);
  const [readiness, setReadiness] = useState(initial);
  const [checking, startCheck] = useTransition();
  const [preparing, startPrepare] = useTransition();
  const [job, setJob] = useState<{
    jobId?: string;
    error?: string;
    message?: string;
  }>({ jobId: activeJobId });
  // Focus practice: empty = the whole blueprint.
  const [focus, setFocus] = useState<string[]>([]);
  const allTopics = initial.map((r) => r.topic);
  const toggle = (t: string) =>
    setFocus((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  // Re-check per-topic availability when the size or focus changes (debounced).
  useEffect(() => {
    if (size === defaultSize && !focus.length && readiness === initial) return;
    const t = setTimeout(
      () =>
        startCheck(async () =>
          setReadiness(await getReadiness(examId, size, focus)),
        ),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, focus, examId]);

  const short = readiness.filter((r) => r.available < r.needed);
  const missing = short.reduce((s, r) => s + r.needed - r.available, 0);
  const err = state.field === "size" ? state.error : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FocusFirstError trigger={state} />
      <input type="hidden" name="examId" value={examId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Topics</legend>
        <p className="text-sm text-muted-foreground">
          Leave on All topics for a full run like the real exam, or pick one or
          more topics to drill.
        </p>
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto">
          <button
            type="button"
            aria-pressed={!focus.length}
            onClick={() => setFocus([])}
            className={`${chip} ${!focus.length ? chipOn : chipOff}`}
          >
            All topics ({allTopics.length})
          </button>
          {allTopics.map((t) => (
            <label
              key={t}
              className={`${chip} ${focus.includes(t) ? chipOn : chipOff} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}
            >
              <input
                type="checkbox"
                name="topics"
                value={t}
                checked={focus.includes(t)}
                onChange={() => toggle(t)}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id="size"
        label="Number of questions"
        help={
          focus.length
            ? "Split across the chosen topics by their blueprint share."
            : "The mix follows your blueprint exactly."
        }
        error={err}
      >
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

      <ul
        aria-live="polite"
        className={`flex flex-col gap-1.5 rounded-xl border p-3 text-sm ${checking ? "opacity-60" : ""}`}
      >
        {readiness.map((r) => {
          const ok = r.available >= r.needed;
          return (
            <li
              key={r.topic}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                {ok ? (
                  <CircleCheck
                    aria-hidden="true"
                    className="size-4 text-success"
                  />
                ) : (
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-4 text-accent-text"
                  />
                )}
                {r.topic}
              </span>
              <span
                className={`tabular-nums ${ok ? "text-muted-foreground" : "font-semibold text-accent-text"}`}
              >
                {r.needed} needed · {r.available} ready
              </span>
            </li>
          );
        })}
      </ul>

      {short.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl bg-accent-soft p-3 text-sm text-accent-foreground">
          <p>
            {missing} more verified question{missing === 1 ? "" : "s"} needed
            for {size} questions
            {focus.length ? " on these topics" : " to follow your blueprint"}.
            You can also pick a smaller number.
          </p>
          {/* Preparing fills the whole blueprint, so it is offered only for full runs. */}
          {!focus.length && (
            <Button
              type="button"
              variant="primary"
              className="self-start"
              disabled={preparing || !!(job.jobId && !job.error)}
              onClick={() =>
                startPrepare(async () =>
                  setJob(await prepareMissing(examId, size)),
                )
              }
            >
              <Sparkles aria-hidden="true" className="size-4" />
              {preparing
                ? "Starting…"
                : `Prepare ${missing} missing question${missing === 1 ? "" : "s"}`}
            </Button>
          )}
          {job.error && <ErrorText>{job.error}</ErrorText>}
          {job.message && <p>{job.message}</p>}
        </div>
      ) : null}
      {job.jobId && <JobProgress key={job.jobId} jobId={job.jobId} />}

      {format === "essay" && (
        <p className="text-sm text-muted-foreground">
          Each essay answer is graded by AI and uses one AI call from your daily
          limit.
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Feedback mode (cannot be changed after you start)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            [
              "instant",
              "Instant",
              format === "essay"
                ? "AI grades each answer right after you submit it"
                : "See right or wrong and the explanation after each answer",
            ],
            [
              "end",
              "At the end",
              format === "essay"
                ? "All answers are graded by AI when you submit"
                : "Everything is graded after you submit, like the real exam",
            ],
          ].map(([v, label, desc], i) => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-150 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input
                type="radio"
                name="mode"
                value={v}
                defaultChecked={i === 0}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted-foreground">
                  {desc}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending || short.length > 0 || checking}>
        <Play aria-hidden="true" className="size-4" />
        {pending ? "Preparing…" : "Start practice"}
      </Button>
      {state.error && state.field !== "size" && (
        <ErrorText>{state.error}</ErrorText>
      )}
    </form>
  );
}
