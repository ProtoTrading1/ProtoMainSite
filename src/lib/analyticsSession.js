const KEY = 'proto_journey_session';
let fallback;
export function analyticsSessionId() {
  try {
    const stored = globalThis.sessionStorage?.getItem(KEY);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored || '')) return stored;
    fallback ||= globalThis.crypto.randomUUID();
    globalThis.sessionStorage?.setItem(KEY, fallback);
    return fallback;
  } catch { return fallback ||= globalThis.crypto.randomUUID(); }
}
