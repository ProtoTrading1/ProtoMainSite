const PROVIDER_TIMEOUT_MS = 12000;

export class NotificationProviderError extends Error {
  constructor(message, {
    code = 'provider_error',
    httpStatus = null,
    retryable = false,
    retryAfterMs = null,
  } = {}) {
    super(message);
    this.name = 'NotificationProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export function classifyProviderFailure(status) {
  const httpStatus = Number(status);
  const retryable = httpStatus === 408
    || httpStatus === 425
    || httpStatus === 429
    || httpStatus >= 500;
  const configuration = httpStatus === 401 || httpStatus === 403;
  return {
    retryable,
    code: configuration
      ? 'provider_configuration'
      : retryable
        ? 'provider_transient'
        : 'provider_rejected',
  };
}

function safeProviderMessage(json, status) {
  const value = json?.message || json?.error || json?.info || json?.description;
  const text = String(value || `Provider request failed (${status})`)
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
  return text;
}

async function providerFetch(url, init, timeoutMs = PROVIDER_TIMEOUT_MS) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(Math.max(1000, Math.min(PROVIDER_TIMEOUT_MS, timeoutMs))),
    });
  } catch (error) {
    throw new NotificationProviderError(
      error?.name === 'TimeoutError' ? 'Provider request timed out' : 'Provider service is unreachable',
      { code: 'provider_unreachable', retryable: true },
    );
  }
}

async function responseJson(response) {
  return response.json().catch(() => ({}));
}

function jobPayload(job) {
  const payload = job?.payload ?? job?.payload_json ?? {};
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

async function sendBrevoJob(job, options) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new NotificationProviderError('Brevo is not configured', {
      code: 'provider_configuration',
      retryable: false,
    });
  }

  const payload = jobPayload(job);
  const to = payload.to
    || (Array.isArray(payload.recipients)
      ? payload.recipients.map((email) => ({ email }))
      : payload.recipient ? { email: payload.recipient } : null);
  const htmlContent = payload.htmlContent || payload.html;
  if (!to || !payload.subject || !htmlContent) {
    throw new NotificationProviderError('Email job payload is incomplete', {
      code: 'invalid_job_payload',
      retryable: false,
    });
  }
  const body = {
    sender: payload.sender || {
      name: process.env.BREVO_SENDER_NAME || 'Proto Trading',
      email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
    },
    to: Array.isArray(to) ? to : [to],
    subject: payload.subject,
    htmlContent,
    ...(payload.textContent ? { textContent: payload.textContent } : {}),
    ...(Array.isArray(payload.attachment) ? { attachment: payload.attachment } : {}),
    headers: {
      ...(payload.headers || {}),
      'Idempotency-Key': String(job.idempotency_key || job.idempotencyKey || job.id),
    },
  };

  const response = await providerFetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  }, options?.timeoutMs);
  const json = await responseJson(response);
  if (!response.ok) {
    const failure = classifyProviderFailure(response.status);
    throw new NotificationProviderError(safeProviderMessage(json, response.status), {
      ...failure,
      httpStatus: response.status,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
  return {
    state: 'accepted',
    provider: 'brevo',
    providerMessageId: json.messageId || json.message_id || null,
    httpStatus: response.status,
  };
}

export async function deliverNotificationJob(job, options = {}) {
  const channel = String(job?.channel || '').toLowerCase();
  if (channel === 'internal_email' || channel === 'customer_email') return sendBrevoJob(job, options);
  throw new NotificationProviderError(`Unsupported notification channel: ${channel || 'missing'}`, {
    code: 'invalid_job_payload',
    retryable: false,
  });
}
