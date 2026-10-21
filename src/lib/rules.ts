// Pure rules with no server/runtime imports, so they can be unit-tested with plain `node --test`.

export const LETTERS = ["A", "B", "C", "D", "E"];
export type QuestionInput = { body: string; options: string[]; answer?: string; explanation?: string; topic?: string };

export const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** PRD 5, step 1: option count, exactly one key, key exists among options. Returns an error or null. */
export function structureError(q: QuestionInput): string | null {
  if (!q.body?.trim()) return "The question text is empty";
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > LETTERS.length)
    return "A question needs 2 to 5 options";
  if (q.options.some((o) => typeof o !== "string" || !o.trim())) return "An option is empty";
  if (new Set(q.options.map(normalize)).size !== q.options.length) return "Two options are the same";
  const a = q.answer?.trim().toUpperCase();
  if (!a || !/^[A-E]$/.test(a)) return "The answer must be exactly one letter from A to E";
  if (LETTERS.indexOf(a) >= q.options.length) return "The answer is not one of the options";
  return null;
}

export function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Splits a total across blueprint topics by percentage (largest remainder), expanded to one topic per question. */
export function topicPlan(blueprint: { topic: string; percentage: number }[], total: number): string[] {
  if (!blueprint.length) return Array(total).fill("");
  const sum = blueprint.reduce((s, b) => s + Number(b.percentage), 0);
  const counts = blueprint.map((b) => {
    const exact = (Number(b.percentage) / sum) * total;
    return { topic: b.topic, exact, n: Math.floor(exact) };
  });
  let left = total - counts.reduce((s, c) => s + c.n, 0);
  for (const c of [...counts].sort((a, b) => b.exact - b.n - (a.exact - a.n))) {
    if (left-- <= 0) break;
    c.n++;
  }
  return counts.flatMap((c) => Array(c.n).fill(c.topic));
}

export type ModelSettings = { models: { id: string; name: string }[]; main: string; verifiers: string[] };

/** Admin model list: unique non-empty ids, main model in the list, 0 or at least 2 distinct verifiers from the list. */
export function modelSettingsError({ models, main, verifiers }: ModelSettings): string | null {
  if (!models.length) return "Add at least one model";
  if (models.some((m) => !m.id.trim())) return "A model ID is empty";
  const ids = models.map((m) => m.id.trim());
  if (new Set(ids).size !== ids.length) return "Two models have the same ID";
  if (!ids.includes(main)) return "Choose a main model from the list";
  if (verifiers.some((v) => !ids.includes(v))) return "Verifier models must come from the list";
  if (verifiers.length === 1 || new Set(verifiers).size !== verifiers.length) return "Choose at least 2 different verifier models";
  return null;
}

/** RFC 4180-style CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** CSV header: question, a, b, c, d, e, answer, explanation, topic (case-insensitive; e optional). */
export function questionsFromCsv(text: string): QuestionInput[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const qi = col("question");
  if (qi < 0) throw new Error('The CSV header has no "question" column');
  const opts = ["a", "b", "c", "d", "e"].map(col).filter((i) => i >= 0);
  return rows.map((r) => ({
    body: r[qi] ?? "",
    options: opts.map((i) => (r[i] ?? "").trim()).filter(Boolean),
    answer: r[col("answer")]?.trim(),
    explanation: r[col("explanation")]?.trim(),
    topic: r[col("topic")]?.trim(),
  }));
}

/** JSON: array of {question|body, options[], answer, explanation?, topic?}. */
export function questionsFromJson(text: string): QuestionInput[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("The JSON must be an array of questions");
  return data.map((q) => ({
    body: String(q.body ?? q.question ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    answer: q.answer == null ? undefined : String(q.answer),
    explanation: q.explanation == null ? undefined : String(q.explanation),
    topic: q.topic == null ? undefined : String(q.topic),
  }));
}
