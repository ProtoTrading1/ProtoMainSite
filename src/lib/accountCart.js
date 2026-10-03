import { authHeaders, refreshAuthHeaders, captureAuthIdentity, bindInitialAuthIdentity, assertAuthIdentity } from './authHeaders';
import { boundedCartRequest } from './accountCartRequest.mjs';
import { basketLineKey, mergeBasketLines } from '../../lib/basket-lines.mjs';

async function requestAccountCart(method, body) {
  let identity = captureAuthIdentity();
  const payload = body?.items ? { ...body, items: mergeBasketLines(body.items) } : body;
  return boundedCartRequest(async (signal) => {
    const request = async (headers) => {
      assertAuthIdentity(identity);
      const response = await fetch('/api/account-cart', {
        method,
        headers,
        credentials: 'same-origin',
        signal,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      assertAuthIdentity(identity);
      return response;
    };

    const firstHeaders = await authHeaders();
    identity = bindInitialAuthIdentity(identity, firstHeaders);
    let response = await request(firstHeaders);
    if (response.status === 401) {
      assertAuthIdentity(identity);
      response = await request(await refreshAuthHeaders({}, identity));
    }
    const data = await response.json().catch(() => ({}));
    assertAuthIdentity(identity);
    if (!response.ok) {
      const error = new Error(data.error || 'Account basket could not be saved');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.revision)) {
      throw new Error('Account basket response could not be confirmed');
    }
    return { ...data, items: mergeBasketLines(data.items) };
  });
}

export function cartFingerprint(items) {
  return JSON.stringify(mergeBasketLines(items).map((item) => [basketLineKey(item), Number(item.qty || 0)]));
}

export function getAccountCart() {
  return requestAccountCart('GET');
}

export function mergeAccountCart(items, activityAt) {
  return requestAccountCart('PUT', { items, activityAt, mode: 'merge' });
}

export function saveAccountCart(items, activityAt, revision) {
  return requestAccountCart('PUT', { items, activityAt, revision, mode: 'save' });
}

export function clearAccountCart(revision, activityAt) {
  return requestAccountCart('DELETE', { revision, activityAt });
}
