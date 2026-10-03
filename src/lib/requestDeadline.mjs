export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function withDeadline(operation, { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, message = 'The connection is taking too long. Please try again.', onTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      const error = new Error(message);
      error.name = 'RequestTimeoutError';
      error.code = 'REQUEST_TIMEOUT';
      finish(reject, error);
      try { onTimeout?.(); } catch { /* Timeout remains the original failure. */ }
    }, Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
    Promise.resolve().then(() => typeof operation === 'function' ? operation() : operation)
      .then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function boundedRequest(url, options, settings, consume) {
  const controller = new AbortController();
  const parentSignal = options?.signal;
  const abort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  return withDeadline(async () => {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return consume ? consume(response) : response;
  }, { ...settings, onTimeout: () => controller.abort() })
    .finally(() => parentSignal?.removeEventListener('abort', abort));
}

export function requestWithDeadline(url, options = {}, settings = {}) {
  return boundedRequest(url, options, settings);
}

// The deadline includes response-body reading, not just receipt of headers.
export function requestJson(url, options = {}, settings = {}) {
  return boundedRequest(url, options, settings, async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error || 'The request could not be completed. Please try again.');
      error.status = response.status;
      error.code = data?.code || null;
      error.recovery = data?.recovery || null;
      error.changes = Array.isArray(data?.changes) ? data.changes : [];
      error.data = data;
      throw error;
    }
    if (data === null) {
      const error = new Error('The site returned an incomplete response. Please try again.');
      error.code = 'INVALID_RESPONSE';
      throw error;
    }
    return data;
  });
}
