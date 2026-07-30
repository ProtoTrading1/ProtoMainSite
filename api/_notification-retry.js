export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([
  60_000,
  5 * 60_000,
  20 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
]);

export function retryDelayMs(attempt, retryAfterMs = null, random = Math.random) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(24 * 60 * 60_000, Math.max(1000, retryAfterMs));
  }
  const index = Math.max(0, Math.min(DEFAULT_RETRY_DELAYS_MS.length - 1, Number(attempt || 1) - 1));
  const base = DEFAULT_RETRY_DELAYS_MS[index];
  const jitter = Math.floor(base * 0.15 * Math.max(0, Math.min(1, random())));
  return base + jitter;
}

export function shouldRetryJob(job, error) {
  const attempts = Number(job?.attempt_count ?? job?.attempts ?? 0);
  const maxAttempts = Number(job?.max_attempts ?? job?.maxAttempts ?? 6);
  return Boolean(error?.retryable) && attempts < maxAttempts;
}
