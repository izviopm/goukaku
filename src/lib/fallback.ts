// Pure model-fallback helpers (no server imports, so `node --test` can run them).

export type Failure = { model: string; error: string };

/** Most verifier models asked per answer-key check; models further down the list are backups. */
export const MAX_VERIFIERS = 3;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class AllFailedError extends Error {
  failed: Failure[];
  constructor(failed: Failure[]) {
    super(failed.map((f) => `${f.model}: ${f.error}`).join("; ") || "No models configured");
    this.failed = failed;
  }
}

/** Tries models in order until one succeeds. A fatal error (bad key, quota) stops immediately. */
export async function firstSuccess<T>(models: string[], run: (model: string) => Promise<T>, isFatal: (e: unknown) => boolean) {
  const failed: Failure[] = [];
  for (const model of models) {
    try {
      return { model, value: await run(model), failed };
    } catch (e) {
      if (isFatal(e)) throw e;
      failed.push({ model, error: message(e) });
    }
  }
  throw new AllFailedError(failed);
}

/**
 * Collects up to `n` successful results from an ordered pool: runs the first `n` in parallel,
 * then tops up from the remaining (backup) models only for the ones that failed.
 */
export async function upToN<T>(pool: string[], n: number, run: (model: string) => Promise<T>, isFatal: (e: unknown) => boolean) {
  const ok: { model: string; value: T }[] = [];
  const failed: Failure[] = [];
  let next = 0;
  while (ok.length < n && next < pool.length) {
    const batch = pool.slice(next, next + n - ok.length);
    next += batch.length;
    const settled = await Promise.allSettled(batch.map(run));
    for (const [i, s] of settled.entries()) {
      if (s.status === "fulfilled") ok.push({ model: batch[i], value: s.value });
      else if (isFatal(s.reason)) throw s.reason;
      else failed.push({ model: batch[i], error: message(s.reason) });
    }
  }
  return { ok, failed };
}
