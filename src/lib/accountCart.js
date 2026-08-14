import { authHeaders } from './authHeaders';

async function requestAccountCart(method, body, path = '/api/account-cart') {
  const headers = await authHeaders();
  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Account basket could not be saved');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function cartFingerprint(items) {
  return JSON.stringify((Array.isArray(items) ? items : []).map((item) => [
    String(item?.product?.id || item?.product?.sku || item?.product?.code || ''),
    Number(item?.qty || 0),
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

export function restoreArchivedAccountCart() {
  return requestAccountCart('POST', undefined, '/api/account-cart-restore');
}
