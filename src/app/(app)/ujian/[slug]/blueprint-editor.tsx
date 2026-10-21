"use client";

import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, ExternalLink, FileText, PencilLine, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { easeOut } from "@/components/motion";
import { AiAvatar, Badge, Button, ErrorText, inputClass } from "@/components/ui";
import type { BlueprintRow } from "@/lib/rules";
import { blueprintFromSyllabus, resetBlueprint, saveBlueprint, saveDefaultBlueprint, suggestBlueprint, type Source } from "./blueprint-actions";

type Row = BlueprintRow & { key: number };
type Props = {
  examId: string;
  initial: BlueprintRow[];
  /** "user": hybrid save from the exam page. "admin": edits the shared default. */
  mode?: "user" | "admin";
  personal?: boolean;
  hasDefault?: boolean;
  sourceUrl?: string | null;
  topicSuggestions?: string[];
};

export function BlueprintEditor({ examId, initial, mode = "user", personal = false, hasDefault = false, sourceUrl = null, topicSuggestions = [] }: Props) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, key: i })));
  const nextKey = useRef(initial.length);
  const [editing, setEditing] = useState(initial.length > 0 || mode === "admin");
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  const [source, setSource] = useState<Source>("user");
  const [url, setUrl] = useState<string | null>(sourceUrl);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [thinking, startSuggest] = useTransition();
  const [saving, startSave] = useTransition();
  const listId = `topics-${examId}-${mode}`;

  const total = Math.round(rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0) * 100) / 100;
  const add = () => setRows((rs) => [...rs, { key: nextKey.current++, topic: "", percentage: 0 }]);
  const update = (key: number, patch: Partial<BlueprintRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function suggest() {
    setError("");
    setMessage("");
    setEditing(true);
    startSuggest(async () => {
      const res = await suggestBlueprint(examId);
      if (res.error || !res.rows) return setError(res.error ?? "No suggestion");
      setRows(res.rows.map((r) => ({ ...r, key: nextKey.current++ })));
      setSource(res.source ?? "ai");
      setUrl(res.sourceUrl ?? null);
      setMessage(res.source === "web" ? "Draft from the official exam guide. Review it, then save." : "Draft suggested by AI. Review it, then save.");
    });
  }

  function readSyllabus(form: FormData) {
    setError("");
    setMessage("");
    startSuggest(async () => {
      const res = await blueprintFromSyllabus(examId, form);
      if (res.error || !res.rows) return setError(res.error ?? "No topics found");
      setRows(res.rows.map((r) => ({ ...r, key: nextKey.current++ })));
      setSource("user");
      setUrl(null);
      setSyllabusOpen(false);
      setEditing(true);
      setMessage("Draft built from your syllabus. Review it, then save.");
    });
  }

  function save() {
    setError("");
    setMessage("");
    const payload = rows.map(({ topic, percentage }) => ({ topic, percentage: Number(percentage) }));
    startSave(async () => {
      const res = mode === "admin" ? await saveDefaultBlueprint(examId, payload, source, url) : await saveBlueprint(examId, payload, source, url);
      if (res.error) return setError(res.error);
      setMessage(
        mode === "admin"
          ? "Default blueprint saved."
          : res.scope === "default"
            ? "Saved. This is now the default blueprint for everyone studying this exam."
            : "Saved as your personal blueprint. Other learners are not affected.",
      );
    });
  }

  function reset() {
    setError("");
    startSave(async () => {
      const res = await resetBlueprint(examId);
      if (res.error) return setError(res.error);
      setMessage("Back on the default blueprint.");
      setEditing(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "user" && (initial.length > 0 || personal) && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={personal ? "accent" : "primary"}>{personal ? "Your personal blueprint" : "Using the default blueprint"}</Badge>
          {personal && hasDefault && (
            <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={reset} disabled={saving}>
              <RotateCcw aria-hidden="true" className="size-3.5" /> Reset to default
            </Button>
          )}
        </div>
      )}

      {syllabusOpen && !thinking ? (
        <form action={readSyllabus} className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
          <h3 className="font-semibold">Use my syllabus</h3>
          <p className="text-sm text-muted-foreground">Paste the official syllabus or exam guide, or upload it. The AI turns its topics and weights into a draft.</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`syllabus-text-${mode}`} className="text-sm font-medium">
              Syllabus text
            </label>
            <textarea id={`syllabus-text-${mode}`} name="text" rows={5} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`syllabus-file-${mode}`} className="text-sm font-medium">
              Or a file (PDF, DOCX, TXT)
            </label>
            <input id={`syllabus-file-${mode}`} name="file" type="file" accept=".pdf,.docx,.txt" className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <Sparkles aria-hidden="true" className="size-4" /> Read syllabus
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSyllabusOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : !editing && !thinking ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <button
            type="button"
            onClick={suggest}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-ai-border bg-ai-soft/60 p-4 text-left transition-colors duration-150 hover:bg-ai-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AiAvatar size="sm" />
            <span className="font-semibold">Suggest with AI</span>
            <span className="text-sm text-muted-foreground">The AI looks for the official topic breakdown, or proposes one. You can edit it before saving.</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSource("user");
              setUrl(null);
              if (!rows.length) add();
            }}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              <PencilLine aria-hidden="true" className="size-4" />
            </span>
            <span className="font-semibold">Set it myself</span>
            <span className="text-sm text-muted-foreground">Type the topics and how much of the exam each one covers.</span>
          </button>
          <button
            type="button"
            onClick={() => setSyllabusOpen(true)}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            <span className="font-semibold">Use my syllabus</span>
            <span className="text-sm text-muted-foreground">Paste or upload the official syllabus. Most accurate for local certifications.</span>
          </button>
        </div>
      ) : (
        <>
          <AnimatePresence>
            {thinking && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: easeOut }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="flex items-center gap-3 rounded-xl bg-ai-soft p-3 text-sm font-medium text-ai"
              >
                <AiAvatar size="sm" thinking /> AI is working on your blueprint…
              </motion.p>
            )}
          </AnimatePresence>

          <datalist id={listId}>
            {topicSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`bp-topic-${mode}-${r.key}`} className={i === 0 ? "text-sm font-medium" : "sr-only"}>
                    Topic
                  </label>
                  <input
                    id={`bp-topic-${mode}-${r.key}`}
                    list={listId}
                    value={r.topic}
                    onChange={(e) => update(r.key, { topic: e.target.value })}
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`bp-pct-${mode}-${r.key}`} className={i === 0 ? "text-sm font-medium" : "sr-only"}>
                    Percent
                  </label>
                  <input
                    id={`bp-pct-${mode}-${r.key}`}
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={r.percentage || ""}
                    onChange={(e) => update(r.key, { percentage: Number(e.target.value) })}
                    className={`${inputClass} tabular-nums`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2"
                  aria-label={`Remove topic ${r.topic || i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={add}>
                <Plus aria-hidden="true" className="size-4" /> Add topic
              </Button>
              <Button type="button" variant="ghost" onClick={suggest} disabled={thinking} className="text-ai">
                <Sparkles aria-hidden="true" className="size-4" /> {rows.length ? "Ask AI again" : "Suggest with AI"}
              </Button>
            </div>
            <span
              aria-live="polite"
              className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${total === 100 ? "bg-success/10 text-success" : "bg-accent-soft text-accent-foreground"}`}
            >
              Total {total}%{total !== 100 && " · must be 100%"}
            </span>
          </div>

          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline underline-offset-2">
              <ExternalLink aria-hidden="true" className="size-3.5" /> Source
            </a>
          )}

          {mode === "user" && (
            <p className="text-sm text-muted-foreground">
              {hasDefault
                ? "Saving creates your personal blueprint. Other learners keep using the default."
                : "This exam has no blueprint yet, so yours becomes the default for everyone studying it."}
            </p>
          )}

          <Button type="button" onClick={save} disabled={saving || thinking || !rows.length} className="self-start">
            {saving ? "Saving…" : "Save blueprint"}
          </Button>
        </>
      )}

      <div aria-live="polite">
        {message && (
          <p className="flex items-start gap-2 text-sm text-success">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </div>
  );
}
