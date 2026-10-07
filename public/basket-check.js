const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_KEY = /^sb-[a-z0-9]{20}-auth-token$/;
const PREFIX = 'proto_pending_checkout_v1:';
const LIMIT = 2 * 1024 * 1024;
const messages = {
  signin: 'You are not signed in to Proto in this browser on this website. Open the normal Proto site in the same browser and sign in, then return here. Keep your basket and do not submit the order again. Signing in on a preview cannot recover a reference saved on the live website.',
  unavailable: 'This browser could not safely read the reference. Please tell Proto; keep your basket and avoid trying the order again.',
  session: 'This browser has no current session we can verify. Please tell Proto; this check cannot continue.',
  missing: 'No saved request reference was found for this verified account on this browser. This does not prove that an order was never received. Please tell Proto.',
  corrupt: 'The saved request could not be safely checked. Please tell Proto; keep your basket and avoid trying the order again.',
  changed: 'The session or saved request changed. The previous report has been hidden. Use Check reference to read it again.',
};
function fail(code) { throw new Error(code); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function parse(raw, limit, code) {
  if (typeof raw !== 'string' || raw.length > limit) fail(code);
  try { return JSON.parse(raw); } catch { fail(code); }
}
export function readSession(raw, now = Date.now()) {
  if (raw === null) fail('signin');
  const session = parse(raw, 65536, 'session');
  if (!record(session) || typeof session.access_token !== 'string'
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.access_token)
    || session.access_token.length > 16384 || !UUID.test(session.user?.id || '')
    || !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now) fail('session');
  return { token: session.access_token, customerId: session.user.id.toLowerCase(), expiresAt: session.expires_at * 1000 };
}
export function referenceReport(raw, customerId, hostname) {
  if (raw === null) fail('missing');
  const intent = parse(raw, LIMIT, 'corrupt');
  if (!UUID.test(customerId) || !record(intent) || intent.version !== 1 || intent.customerId !== customerId
    || !record(intent.payload) || typeof intent.payload.clientRef !== 'string' || !UUID.test(intent.payload.clientRef)
    || !Array.isArray(intent.payload.items) || intent.payload.items.length < 1 || intent.payload.items.length > 250
    || !Array.isArray(intent.items) || intent.items.length !== intent.payload.items.length
    || typeof intent.fingerprint !== 'string' || !intent.fingerprint || !Number.isFinite(intent.total) || intent.total < 0
    || !record(intent.options) || (intent.result != null && !record(intent.result))) fail('corrupt');
  return { hostname, clientRef: intent.payload.clientRef, version: 1, lineCount: intent.payload.items.length, hasResult: Boolean(intent.result) };
}

export function mountBasketCheck({ document, window, fetch, storage, clipboard, now = Date.now }) {
  const elements = Object.fromEntries(['check-button', 'status', 'report', 'consent', 'copy-button', 'copy-status'].map(id => [id, document.getElementById(id)]));
  let generation = 0;
  let active = null;
  let controller = null;
  let destroyed = false;
  function reset(message) {
    generation += 1;
    controller?.abort();
    controller = null;
    active = null;
    elements.report.textContent = '';
    elements.report.hidden = true;
    elements.consent.checked = false;
    elements.consent.disabled = true;
    elements['copy-button'].disabled = true;
    elements['copy-status'].textContent = '';
    elements.status.textContent = message;
    elements['check-button'].disabled = destroyed;
  }
  function unchanged(snapshot) {
    try {
      return Boolean(snapshot && snapshot.expiresAt > now()
        && storage.getItem(snapshot.key) === snapshot.sessionRaw
        && storage.getItem(snapshot.journalKey) === snapshot.journalRaw);
    } catch { return false; }
  }
  async function request(mode, token, signal) {
    const response = await fetch(`/api/basket-check-session?mode=${mode}`, {
      // Preserve this origin's existing deployment-authentication cookies.
      // Customer identity still requires the explicit verified Bearer token.
      method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) fail(response.status === 401 ? 'session' : 'unavailable');
    const data = parse(await response.text(), 4096, 'unavailable');
    if (!record(data) || data.version !== 1 || !SESSION_KEY.test(data.sessionStorageKey || '')) fail('unavailable');
    return data;
  }
  async function check() {
    reset('Checking the saved reference on this browser…');
    const epoch = generation;
    elements['check-button'].disabled = true;
    const operation = new AbortController();
    controller = operation;
    const signal = operation.signal;
    const timeout = window.setTimeout(() => operation.abort(), 10000);
    try {
      if (window.top !== window.self || !['https:', 'http:'].includes(window.location.protocol)
        || (window.location.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(window.location.hostname))) fail('unavailable');
      const config = await request('config', null, signal);
      if (epoch !== generation) return;
      const key = config.sessionStorageKey;
      const sessionRaw = storage.getItem(key);
      const session = readSession(sessionRaw, now());
      const identity = await request('identity', session.token, signal);
      if (epoch !== generation) return;
      if (identity.sessionStorageKey !== key || identity.customerId !== session.customerId) fail('session');
      const journalKey = `${PREFIX}${identity.customerId}`;
      const journalRaw = storage.getItem(journalKey);
      const report = referenceReport(journalRaw, identity.customerId, window.location.hostname);
      const snapshot = { key, sessionRaw, journalKey, journalRaw, expiresAt: session.expiresAt, report };
      if (!unchanged(snapshot)) fail('changed');
      active = snapshot;
      elements.report.textContent = JSON.stringify(report, null, 2);
      elements.report.hidden = false;
      elements.consent.disabled = false;
      elements.status.textContent = 'Reference found. Review the report below. It does not confirm order acceptance or delivery.';
    } catch (error) {
      if (epoch === generation) reset(messages[error.message] || messages.unavailable);
    } finally {
      window.clearTimeout(timeout);
      if (epoch === generation) {
        controller = null;
        elements['check-button'].disabled = false;
      }
    }
  }
  function consent() {
    if (!unchanged(active)) { if (active) reset(messages.changed); return; }
    elements['copy-button'].disabled = !elements.consent.checked;
  }
  async function copy() {
    if (!active || !elements.consent.checked) return;
    if (!unchanged(active)) { reset(messages.changed); return; }
    const snapshot = active;
    const epoch = generation;
    elements['copy-button'].disabled = true;
    try {
      // Clipboard access starts synchronously inside the customer's click.
      // The session was verified on preview and is fenced against local changes.
      if (!clipboard?.writeText) fail('clipboard');
      await clipboard.writeText(JSON.stringify(snapshot.report, null, 2));
      if (epoch !== generation) return;
      if (!unchanged(snapshot)) { reset(messages.changed); return; }
      elements['copy-status'].textContent = 'Copied. You can now paste this reference report into your message to Proto.';
    } catch {
      if (epoch === generation) elements['copy-status'].textContent = 'Copy is unavailable in this browser. You can select the report above and copy it manually.';
    } finally {
      if (epoch === generation) elements['copy-button'].disabled = !elements.consent.checked;
    }
  }
  function monitor() { if (active && !unchanged(active)) reset(messages.changed); }
  function storageChanged(event) {
    if (active && (event.key === null || event.key === active.key || event.key === active.journalKey)) reset(messages.changed);
    else if (controller) reset(messages.changed);
  }
  function visibility() { if (document.hidden) reset(messages.changed); else monitor(); }
  function destroy() {
    destroyed = true;
    reset('This check has closed.');
    window.clearInterval(interval);
  }
  elements['check-button'].addEventListener('click', check);
  elements.consent.addEventListener('change', consent);
  elements['copy-button'].addEventListener('click', copy);
  window.addEventListener('storage', storageChanged);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', destroy, { once: true });
  const interval = window.setInterval(monitor, 500);
  reset('Use Check reference to read this browser’s saved request.');
  return { check, copy, monitor, destroy };
}

if (typeof document !== 'undefined' && document.getElementById('check-button')) {
  let storage;
  try { storage = window.localStorage; } catch { /* Checking will fail closed. */ }
  mountBasketCheck({ document, window, fetch: window.fetch.bind(window), storage, clipboard: navigator.clipboard });
}
