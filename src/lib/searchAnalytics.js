// Search event logging for the trade portal — fire-and-forget via /api/search-analytics.

const STOPWORDS = new Set(['a', 'an', 'the', 'for', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with']);

function getSessionId() {
  try {
    let sid = sessionStorage.getItem('proto_search_session');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('proto_search_session', sid);
    }
    return sid;
  } catch {
    return crypto.randomUUID();
  }
}

async function postAnalytics(payload) {
  try {
    const res = await fetch('/api/search-analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[searchAnalytics] request failed silently:', err);
    return null;
  }
}

export function normalizeSearchTerm(term) {
  return String(term || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ');
}

export async function logSearch({
  searchTerm,
  resultsFound,
  customerId = null,
  customerEmail = null,
  filtersApplied = [],
  refinementOfSearchId = null,
}) {
  const json = await postAnalytics({
    action: 'log',
    searchTerm,
    normalizedSearchTerm: normalizeSearchTerm(searchTerm),
    resultsFound,
    sessionId: getSessionId(),
    customerId,
    customerEmail,
    filtersApplied,
    refinementOfSearchId,
  });
  return json?.id ?? null;
}

export async function logSearchClick({ searchRowId, clickedSku, position, searchedAt }) {
  if (!searchRowId) return;
  const ms = searchedAt ? Date.now() - new Date(searchedAt).getTime() : null;
  await postAnalytics({
    action: 'click',
    searchRowId,
    clickedSku,
    position: position ?? null,
    timeToClickMs: ms,
  });
}

export async function logSearchCartAdd(searchRowId) {
  if (!searchRowId) return;
  await postAnalytics({ action: 'cart', searchRowId });
}

export async function logSearchOrder({ searchRowId, orderNumber, orderValue }) {
  if (!searchRowId) return;
  await postAnalytics({
    action: 'order',
    searchRowId,
    orderNumber,
    orderValue,
  });
}
