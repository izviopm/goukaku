"use client";

import { useActionState } from "react";
import { CircleCheck, FileUp, PencilLine, Sparkles } from "lucide-react";
import { FocusFirstError } from "@/components/focus-error";
import { JobProgress } from "@/components/job-progress";
import { Button, ErrorText, Field, IconTile, inputClass } from "@/components/ui";
import { addManualQuestion, generateQuestions, uploadFile, type JobState } from "./question-actions";

function useJobForm(fn: (prev: JobState, form: FormData) => Promise<JobState>) {
  const [state, action, pending] = useActionState<JobState, FormData>(fn, {});
  const err = (f: string) => (state.field === f ? state.error : undefined);
  const aria = (f: string) => ({ "aria-invalid": !!err(f), "aria-describedby": err(f) ? `${f}-error` : `${f}-help` });
  return { state, action, pending, err, aria };
}

const cardClass = "flex flex-col gap-4 rounded-xl border bg-muted/40 p-4 sm:p-5";

export function AddQuestions({ examId, topics, format }: { examId: string; topics: string[]; format: "mcq" | "essay" }) {
  const up = useJobForm(uploadFile);
  const gen = useJobForm(generateQuestions);
  const man = useJobForm(addManualQuestion);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <form action={up.action} className={cardClass} noValidate>
          <FocusFirstError trigger={up.state.error} />
          <input type="hidden" name="examId" value={examId} />
          <div className="flex items-center gap-3">
            <IconTile icon={FileUp} />
            <div>
              <h3 className="font-semibold">Upload a file</h3>
              <p className="text-sm text-muted-foreground">
                {format === "essay"
                  ? "With or without a reference answer. The AI writes the reference answer and grading criteria when missing."
                  : "With or without answers. The AI keeps your answer key and answers the rest."}
              </p>
            </div>
          </div>
          <Field
            id="upload"
            label="CSV, JSON, PDF, DOCX, or TXT"
            help={
              format === "essay"
                ? "CSV columns: question, answer (reference), rubric (separate criteria with |), explanation, topic. Scanned PDFs are not supported yet."
                : "CSV columns: question, a, b, c, d, (e), answer, explanation, topic. Scanned PDFs are not supported yet."
            }
            error={up.err("upload")}
          >
            <input id="upload" name="file" type="file" accept=".csv,.json,.pdf,.docx,.txt" className={inputClass} {...up.aria("upload")} />
          </Field>
          <Button type="submit" disabled={up.pending} className="self-start">
            {up.pending ? "Uploading…" : "Upload"}
          </Button>
          {up.state.jobId && <JobProgress key={up.state.jobId} jobId={up.state.jobId} />}
        </form>

        <form action={gen.action} className={`${cardClass} border-ai-border bg-ai-soft/40`} noValidate>
          <FocusFirstError trigger={gen.state.error} />
          <input type="hidden" name="examId" value={examId} />
          <div className="flex items-center gap-3">
            <IconTile icon={Sparkles} tone="ai" />
            <div>
              <h3 className="font-semibold">Generate with AI</h3>
              <p className="text-sm text-muted-foreground">
                {format === "essay"
                  ? "New essay questions with a reference answer and grading criteria, split by your blueprint."
                  : "New questions split by your blueprint, each answer key checked by other models."}
              </p>
            </div>
          </div>
          <Field id="count" label="How many questions" help="Between 1 and 100." error={gen.err("count")}>
            <input id="count" name="count" type="number" min={1} max={100} defaultValue={20} className={inputClass} {...gen.aria("count")} />
          </Field>
          <Button type="submit" disabled={gen.pending} className="self-start">
            <Sparkles aria-hidden="true" className="size-4" />
            {gen.pending ? "Starting…" : "Generate"}
          </Button>
          {gen.state.jobId && <JobProgress key={gen.state.jobId} jobId={gen.state.jobId} />}
        </form>
      </div>

      <details className="rounded-xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 font-medium">
          <PencilLine aria-hidden="true" className="size-4 text-primary" /> Add one question manually
        </summary>
        <form action={man.action} className="flex flex-col gap-3 border-t p-4" noValidate>
          <FocusFirstError trigger={man.state.error} />
          <input type="hidden" name="examId" value={examId} />
          <Field id="body" label="Question" error={man.err("body")}>
            <textarea id="body" name="body" rows={3} className={inputClass} {...man.aria("body")} />
          </Field>
          {format === "essay" ? (
            <div className="grid gap-3">
              <Field id="reference" label="Reference answer" help="What a full-credit answer should contain. Not shown during practice.">
                <textarea id="reference" name="reference" rows={4} className={inputClass} />
              </Field>
              <Field id="rubric" label="Grading criteria" help="One criterion per line, up to 10. The AI grades against these.">
                <textarea id="rubric" name="rubric" rows={3} className={inputClass} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {["A", "B", "C", "D", "E"].map((l) => (
                <Field key={l} id={`opt${l}`} label={`Option ${l}${l === "E" ? " (optional)" : ""}`}>
                  <input id={`opt${l}`} name={`opt${l}`} className={inputClass} />
                </Field>
              ))}
              <Field id="answer" label="Correct answer">
                <select id="answer" name="answer" className={inputClass} defaultValue="A">
                  {["A", "B", "C", "D", "E"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <Field id="topic" label="Topic" help="Pick one of your blueprint topics so it counts in practice." error={man.err("topic")}>
            <input id="topic" name="topic" list="manual-topics" className={inputClass} autoComplete="off" {...man.aria("topic")} />
          </Field>
          <datalist id="manual-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Field id="explanation" label="Explanation (optional)">
            <textarea id="explanation" name="explanation" rows={2} className={inputClass} />
          </Field>
          <Button type="submit" disabled={man.pending} className="self-start">
            {man.pending ? "Saving…" : "Save question"}
          </Button>
          <div aria-live="polite">
            {man.state.message && (
              <p className="flex items-center gap-1 text-sm text-success">
                <CircleCheck aria-hidden="true" className="size-4" /> {man.state.message}
              </p>
            )}
            {man.state.error && !man.state.field && <ErrorText>{man.state.error}</ErrorText>}
          </div>
        </form>
      </details>
    </div>
  );
}
