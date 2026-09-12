const SESSION_KEY = 'proto_journey_session';

let memorySessionId = null;

function randomSessionId() {
  const source = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  return typeof source?.randomUUID === 'function' ? source.randomUUID() : null;
}

/** Return one UUID for this tab, without making storage failures fatal. */
export function journeySessionId() {
  if (memorySessionId) return memorySessionId;

  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      memorySessionId = stored;
      return stored;
    }
    const created = randomSessionId();
    if (!created) return null;
    try { window.sessionStorage.setItem(SESSION_KEY, created); } catch { /* blocked storage */ }
    memorySessionId = created;
    return created;
  } catch {
    memorySessionId = randomSessionId();
    return memorySessionId;
  }
}
