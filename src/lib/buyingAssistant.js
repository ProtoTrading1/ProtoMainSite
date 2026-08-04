import { authHeaders } from './authHeaders';

const keyFor = (customerId) => `proto_buying_assistant_completed:${customerId}`;

export function hasCompletedBuyingAssistant(customerId) {
  if (!customerId) return true;
  try { return localStorage.getItem(keyFor(customerId)) === '1'; } catch { return false; }
}

export function rememberBuyingAssistantCompletion(customerId) {
  if (!customerId) return;
  try { localStorage.setItem(keyFor(customerId), '1'); } catch { /* browser storage is best-effort */ }
}

export async function fetchBuyingAssistantState() {
  const response = await fetch('/api/buying-assistant', { headers: await authHeaders(), cache: 'no-store' });
  if (!response.ok) return { available: false, completed: false };
  return response.json();
}

export async function completeBuyingAssistant(goal) {
  const response = await fetch('/api/buying-assistant', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ goal }),
  });
  return response.ok;
}
