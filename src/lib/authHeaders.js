import { supabase } from './supabase';

export async function authHeaders(sessionOrToken = null, extraHeaders = {}) {
  const tokenFromArg = typeof sessionOrToken === 'string'
    ? sessionOrToken
    : sessionOrToken?.access_token;

  if (tokenFromArg) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFromArg}`, ...extraHeaders };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders };
}

export async function authenticatedGetJson(url, { cache = 'no-store', signal = null, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const request = async (refresh = false) => {
    const result = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const token = result.data?.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return fetch(url, {
      cache,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
  };

  try {
    let response = await request(false);
    if (response.status === 401 && !controller.signal.aborted) response = await request(true);
    return { response, data: await response.json() };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
