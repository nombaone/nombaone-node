import { randomUUID } from 'node:crypto';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const generateIdempotencyKey = (): string => randomUUID();

/**
 * Merge header layers left-to-right. Later layers win; a `null` value deletes
 * the header entirely (lets callers strip an SDK default for one request).
 * Header names are case-insensitive, so everything is lowercased once here.
 */
export const mergeHeaders = (
  ...layers: Array<Record<string, string | null> | undefined>
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [name, value] of Object.entries(layer)) {
      const key = name.toLowerCase();
      if (value === null) {
        delete out[key];
      } else {
        out[key] = value;
      }
    }
  }
  return out;
};

/**
 * Parse a `Retry-After` header into milliseconds. Accepts delta-seconds or an
 * HTTP-date; returns null when absent/unparseable so the caller falls back to
 * its own backoff.
 */
export const retryAfterMs = (headers: Headers): number | null => {
  const raw = headers.get('retry-after');
  if (raw === null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
};

/**
 * Full-jitter exponential backoff: a random delay in
 * `[0, min(8s, 500ms · 2^attempt))`. Jitter prevents a fleet of retrying
 * clients from stampeding the API in lockstep.
 */
export const backoffMs = (attempt: number): number =>
  Math.random() * Math.min(8_000, 500 * 2 ** attempt);
