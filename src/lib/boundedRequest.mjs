// Bound both the connection and response consumption. A late result cannot
// resolve the caller after timeout/cancellation, even if fetch ignores abort.
export async function boundedRequest(run, {
  timeoutMs = 15000,
  signal,
  timeoutMessage = 'The connection timed out. Please try again.',
} = {}) {
  const controller = new AbortController();
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    controller.abort();
    rejectCancellation(new DOMException('Request cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => {
    controller.abort();
    const error = new Error(timeoutMessage);
    error.code = 'request_timeout';
    rejectCancellation(error);
  }, timeoutMs);
  try {
    return await Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        return run(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
