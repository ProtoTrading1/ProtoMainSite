import { authHeaders, refreshAuthHeaders } from './authHeaders';
import { boundedCartRequest } from './accountCartRequest.mjs';

async function requestAccountCart(method, body) {
  return boundedCartRequest(async (signal) => {
    const request = (headers) => fetch('/api/account-cart', {
      method,
      headers,
      credentials: 'same-origin',
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    let response = await request(await authHeaders());
    if (response.status === 401) {
      response = await request(await refreshAuthHeaders());
    }
    const data = await response.json().catch(() => ({}));
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
