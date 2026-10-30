"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { AiAvatar, ProgressBar } from "@/components/ui";

type Summary = { found?: number; withKey?: number; aiAnswered?: number; added?: number; existing?: number; skipped?: number };
type Job = { kind: "generate" | "upload" | "prepare"; requested: number; done: number; status: string; error: string | null; summary: Summary | null };

const RUNNING: Record<Job["kind"], string> = {
  upload: "AI is reading your file and checking answer keys",
  generate: "AI is writing questions and checking answer keys",
  prepare: "AI is preparing the missing questions",
};

function describe(job: Job) {
  const s = job.summary ?? {};
  if (job.kind === "upload")
    return `${s.found ?? 0} questions found: ${s.withKey ?? 0} with your answer key, ${s.aiAnswered ?? 0} answered by AI. ${s.added ?? 0} new added${s.existing ? `, ${s.existing} already in the bank` : ""}${s.skipped ? `, ${s.skipped} skipped (incomplete)` : ""}.`;
  return `${s.added ?? 0} new questions added. Only the ones that passed verification are used in practice.`;
}

/** Polls a background AI job, shows progress with the AI mark, and refreshes the page when it ends. */
export function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok || stop) return;
      const j: Job = await res.json();
      setJob(j);
      if (j.status === "done" || j.status === "failed") {
        stop = true;
        router.refresh();
      }
    };
    tick();
    const t = setInterval(() => !stop && tick(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [jobId, router]);

  if (!job) return null;
  const finished = job.status === "done" || job.status === "failed";
  return (
    <div aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-ai-border bg-ai-soft/60 p-3 text-sm">
      {job.status === "failed" ? (
        <p className="flex items-start gap-2 text-destructive">
          <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {job.error}
        </p>
      ) : job.status === "done" ? (
        <p className="flex items-start gap-2 text-success">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {describe(job)}
        </p>
      ) : (
        <p className="flex items-center gap-2 font-medium text-ai">
          <AiAvatar size="sm" thinking />
          {RUNNING[job.kind]}… {job.requested ? `${job.done}/${job.requested}` : ""}
        </p>
      )}
      {!finished && <ProgressBar value={job.requested ? (100 * job.done) / job.requested : 5} tone="ai" />}
      {!finished && (
        <p className="text-xs text-muted-foreground">
          {job.status === "queued" && job.done ? "Paused at the server time limit; continuing now. " : ""}
          You can refresh or leave this page. Long jobs continue in steps while this page is open, and pick up where they stopped when you come back.
        </p>
      )}
    </div>
  );
}
