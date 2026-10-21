"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { Button, ErrorText, inputClass } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };
type Job = { requested: number; done: number; status: string; error: string | null };

export function Chat({ examId }: { examId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [messages]);

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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
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
      if (!res.ok) throw new Error(data.error ?? "Gagal");
      setMessages([...next, { role: "assistant", content: data.reply || "(tersimpan)" }]);
      setNotes(data.notes ?? []);
      if (data.jobId) setJobId(data.jobId);
      if (data.notes?.length) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2 ${m.role === "user" ? "self-end bg-primary-soft" : "self-start bg-muted"}`}
          >
            <span className="sr-only">{m.role === "user" ? "Kamu: " : "AI: "}</span>
            {m.content}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">AI sedang berpikir…</p>}
        <div ref={endRef} />
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {notes.map((n, i) => (
          <p key={i} className="text-success">{n}</p>
        ))}
        {job && (
          <p className={job.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
            {job.status === "failed"
              ? `Pembuatan soal berhenti di ${job.done}/${job.requested}: ${job.error}`
              : job.status === "done"
                ? `Selesai: ${job.done}/${job.requested} soal masuk bank pribadi. Soal baru dipakai setelah terverifikasi.`
                : `Menyiapkan soal… ${job.done}/${job.requested}`}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      <form onSubmit={send} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="chat-input" className="text-sm font-medium">
            Pesan
          </label>
          <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} className={inputClass} autoComplete="off" />
        </div>
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Kirim pesan">
          <SendHorizontal aria-hidden="true" className="size-5" />
        </Button>
      </form>
    </div>
  );
}
