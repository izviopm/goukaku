"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { reportQuestion } from "@/app/(app)/simulasi/actions";
import { Button, ErrorText, inputClass } from "@/components/ui";

export function ReportQuestion({ questionId }: { questionId: string | null }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<{ error?: string; ok?: boolean }>({});
  const [busy, setBusy] = useState(false);
  if (!questionId) return null;
  if (state.ok) return <p className="text-sm text-muted-foreground" aria-live="polite">Terima kasih, laporan dikirim dan soal akan diverifikasi ulang.</p>;

  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Flag aria-hidden="true" className="size-4" />
        Laporkan soal
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <label htmlFor={`reason-${questionId}`} className="font-medium">
          Alasan
        </label>
        <textarea id={`reason-${questionId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} className={inputClass} />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            setState(await reportQuestion(questionId, reason));
            setBusy(false);
          }}
        >
          Kirim laporan
        </Button>
        <div aria-live="polite">{state.error && <ErrorText>{state.error}</ErrorText>}</div>
      </div>
    </details>
  );
}
