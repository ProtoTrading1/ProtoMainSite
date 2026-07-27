import { createClient } from '@supabase/supabase-js';

/**
 * Fixed-window rate limiting for auth-abuse protection.
 *
 * Primary path is durable: an atomic Postgres RPC (`check_rate_limit`, migration
 * 029) shared across serverless instances. If that RPC/table is unavailable
 * (e.g. the migration has not been applied yet) it falls back to a per-instance
 * in-memory counter so there is still a backstop — weaker, but strictly better
 * than nothing. Unexpected errors fail OPEN (allow) so a limiter outage can
 * never lock a legitimate customer out of account recovery.
 */

const memBuckets = new Map();

function memoryCheck(bucket, max, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${bucket}:${windowStart}`;
  const count = (memBuckets.get(key) || 0) + 1;
  memBuckets.set(key, count);
  if (memBuckets.size > 5000) {
    for (const k of memBuckets.keys()) {
      if (Number(k.slice(k.lastIndexOf(':') + 1)) < windowStart) memBuckets.delete(k);
    }
  }
  const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
  return { allowed: count <= max, count, retryAfter, degraded: true };
}

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * @param {{ bucket: string, max: number, windowSeconds: number, supabase?: any }} opts
 * @returns {Promise<{ allowed: boolean, count?: number, retryAfter?: number, degraded: boolean }>}
 */
export async function checkRateLimit({ bucket, max, windowSeconds, supabase }) {
  const client = supabase || getServiceClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('check_rate_limit', {
        p_bucket: bucket,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      if (!error && data) {
        return {
          allowed: Boolean(data.allowed),
          count: data.count,
          retryAfter: data.retry_after,
          degraded: false,
        };
      }
    } catch {
      /* fall through to in-memory backstop */
    }
  }
  return memoryCheck(bucket, max, windowSeconds);
}

/** Trusted client IP for keying rate limits (behind Vercel's proxy).
 * The LEFTMOST x-forwarded-for entry is client-supplied and spoofable, so an
 * attacker could rotate it to get a fresh bucket every request. Prefer the
 * proxy-set headers (x-real-ip / x-vercel-forwarded-for) and, only as a last
 * resort, the CLOSEST (rightmost) x-forwarded-for hop rather than the leftmost. */
export function clientIp(req) {
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const vercelIp = String(req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (vercelIp) return vercelIp;
  const xffChain = String(req.headers['x-forwarded-for'] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (xffChain.length) return xffChain[xffChain.length - 1];
  return req.socket?.remoteAddress || 'unknown';
}
