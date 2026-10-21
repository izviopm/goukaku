"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { MAX_VERIFIERS } from "@/lib/fallback";

type Row = { key: number; id: string; name: string };
type Props = {
  provider: string;
  baseUrl: string;
  hasKey: boolean;
  models: { id: string; name: string }[];
  main: string;
  verifiers: string[];
};

const PROVIDERS = [
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["gemini", "Gemini"],
  ["openai_compatible", "OpenAI-compatible (OpenRouter, Groq, etc.)"],
];

const label = (r: Row) => (r.name ? `${r.name} (${r.id})` : r.id);

export function AiSettingsFields(props: Props) {
  const [provider, setProvider] = useState(props.provider);
  // Index keys for the initial rows keep server and client markup identical.
  const [rows, setRows] = useState<Row[]>(() =>
    props.models.length ? props.models.map((m, i) => ({ key: i, id: m.id, name: m.name })) : [{ key: 0, id: "", name: "" }],
  );
  const nextKey = useRef(Math.max(props.models.length, 1));
  const [main, setMain] = useState(props.main);
  const [verifiers, setVerifiers] = useState<string[]>(props.verifiers);

  const valid = rows.filter((r) => r.id.trim());
  const update = (key: number, patch: Partial<Row>) => {
    const old = rows.find((r) => r.key === key)?.id.trim();
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    // Renaming an id carries the main/verifier selection along with it.
    if (patch.id !== undefined && old) {
      const next = patch.id.trim();
      setVerifiers((v) => v.map((x) => (x === old ? next : x)).filter(Boolean));
      if (main === old) setMain(next);
    }
  };
  const toggle = (id: string) => setVerifiers((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const move = (index: number, by: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  // Same ordering the server stores: list order decides which verifiers are used and which are backups.
  const checkedInOrder = valid.map((r) => r.id.trim()).filter((id) => verifiers.includes(id));

  return (
    <>
      <Field id="provider" label="Provider">
        <select id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass}>
          {PROVIDERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      {provider === "openai_compatible" && (
        <Field id="baseUrl" label="Base URL" help="An OpenAI-compatible API address, usually ending in /v1. For example https://openrouter.ai/api/v1">
          <input id="baseUrl" name="baseUrl" type="url" defaultValue={props.baseUrl} placeholder="https://openrouter.ai/api/v1" className={inputClass} aria-describedby="baseUrl-help" />
        </Field>
      )}

      <Field id="apiKey" label="API key" help={props.hasKey ? "Stored encrypted in Vault. Leave empty to keep it." : "No API key yet."}>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" className={inputClass} aria-describedby="apiKey-help" />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Models</legend>
        <p className="-mt-1 text-sm text-muted-foreground">Order is priority. If a model is down, the next one in this list takes over.</p>
        <input type="hidden" name="models" value={JSON.stringify(valid.map(({ id, name }) => ({ id: id.trim(), name: name.trim() })))} />
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field id={`model-id-${r.key}`} label="Model ID">
              <input
                id={`model-id-${r.key}`}
                value={r.id}
                onChange={(e) => update(r.key, { id: e.target.value })}
                placeholder="anthropic/claude-sonnet-5-5"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <Field id={`model-name-${r.key}`} label="Display name">
                <input
                  id={`model-name-${r.key}`}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  placeholder="Claude Sonnet"
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="col-start-2 row-start-1 flex sm:col-start-auto sm:row-start-auto">
              <Button type="button" variant="ghost" className="px-2" aria-label={`Move ${r.name || r.id || i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp aria-hidden="true" className="size-4" />
              </Button>
              <Button type="button" variant="ghost" className="px-2" aria-label={`Move ${r.name || r.id || i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-2"
                aria-label={`Remove model ${r.name || r.id || i + 1}`}
                disabled={rows.length === 1}
                onClick={() => {
                  setRows((rs) => rs.filter((x) => x.key !== r.key));
                  setVerifiers((v) => v.filter((x) => x !== r.id.trim()));
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, id: "", name: "" }])}>
          <Plus aria-hidden="true" className="size-4" />
          Add model
        </Button>
      </fieldset>

      <Field
        id="main"
        label="Main model"
        help="Used for chat, generating questions, and answering questions from PDFs. If it is down, the other models are tried in list order."
      >
        <select id="main" name="main" value={main} onChange={(e) => setMain(e.target.value)} className={inputClass} aria-describedby="main-help">
          <option value="">Choose a model…</option>
          {valid.map((r) => (
            <option key={r.key} value={r.id.trim()}>
              {label(r)}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Verifier models</legend>
        <p className="text-sm text-muted-foreground">
          Pick at least 2. They answer each question without seeing the key. To save tokens, only the first {MAX_VERIFIERS} checked (in list order) are
          used; the rest are backups for when one is down.
        </p>
        {valid.length === 0 && <p className="text-sm text-muted-foreground">Add a model first.</p>}
        {valid.map((r) => {
          const id = r.id.trim();
          const rank = checkedInOrder.indexOf(id);
          return (
            <label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="checkbox" name="verifiers" value={id} checked={rank >= 0} onChange={() => toggle(id)} className="size-4 accent-primary" />
              <span className="flex-1">{label(r)}</span>
              {rank >= 0 && <Badge tone={rank < MAX_VERIFIERS ? "primary" : "accent"}>{rank < MAX_VERIFIERS ? "Used" : "Backup"}</Badge>}
            </label>
          );
        })}
      </fieldset>
    </>
  );
}
