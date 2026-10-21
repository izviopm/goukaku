/** Per-topic correctness from answered simulation items (topic read from the snapshot). */
export function topicStats(items: { is_correct: boolean | null; snapshot: unknown }[]) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const it of items) {
    const topic = ((it.snapshot as { topic?: string })?.topic || "No topic").trim();
    const s = map.get(topic) ?? { correct: 0, total: 0 };
    s.total++;
    if (it.is_correct) s.correct++;
    map.set(topic, s);
  }
  return [...map.entries()]
    .map(([topic, s]) => ({ topic, ...s, pct: Math.round((100 * s.correct) / s.total) }))
    .sort((a, b) => a.pct - b.pct);
}
