import { waitUntil } from '@vercel/functions';

// The caller has already authenticated the customer and completed all live
// price, stock, image, hiding and duplicate checks. Persisting that same result
// as an optional read model must not hold the customer response open.
export function sendInstoreResponse(res, body, maintenance, { schedule = waitUntil, report = console.error } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  const response = res.status(200).json(body);
  if (maintenance) {
    const task = Promise.resolve().then(maintenance).catch(() => {
      report('instore background catalogue maintenance failed');
    });
    try {
      schedule(task);
    } catch {
      // The response is already complete. Never send another response or
      // retry a write if lifecycle registration is unavailable.
      report('instore background catalogue maintenance could not be registered');
    }
  }
  return response;
}
