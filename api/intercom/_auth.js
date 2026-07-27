import { timingSafeEqual } from 'crypto';

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Shared secret for Intercom Data Connector / Fin — never expose in frontend. */
export function requireIntercomSecret(req, res) {
  const expected = process.env.INTERCOM_API_SECRET;
  if (!expected) {
    res.status(503).json({ error: 'INTERCOM_API_SECRET is not configured on this deployment' });
    return false;
  }
  const provided = String(req.headers['x-intercom-secret'] || '').trim();
  if (!constantTimeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorised' });
    return false;
  }
  return true;
}
