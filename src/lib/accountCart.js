import { authHeaders, refreshAuthHeaders, captureAuthIdentity, bindInitialAuthIdentity, assertAuthIdentity } from './authHeaders';
import { boundedCartRequest } from './accountCartRequest.mjs';

async function requestAccountCart(method, body) {
  let identity = captureAuthIdentity();
  return boundedCartRequest(async (signal) => {
    const request = async (headers) => {
      assertAuthIdentity(identity);
      const response = await fetch('/api/account-cart', {
        method,
        headers,
        credentials: 'same-origin',
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    return data;
  });
}

export function cartFingerprint(items) {
  return JSON.stringify((Array.isArray(items) ? items : []).map((item) => [
    String(item?.product?.id || item?.product?.sku || item?.product?.code || ''),
    Number(item?.qty || 0),
    String(item?.preference || ''),
  ]));
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
