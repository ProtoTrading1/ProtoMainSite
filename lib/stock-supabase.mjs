import { createClient } from '@supabase/supabase-js';

const own = (object, name) => Object.prototype.hasOwnProperty.call(object, name);
export const STOCK_PROJECT_URL = 'https://yiqsvwajozafvalwcero.supabase.co';

// Server-only: never import this module into src/ or expose these values to Vite.
export function resolveStockCredentials(env = process.env, { legacyServiceRole = false } = {}) {
  const modern = own(env, 'STOCK_SUPABASE_KEY');
  let url;
  let key;
  if (modern) {
    url = own(env, 'STOCK_SUPABASE_POOLER_URL') ? env.STOCK_SUPABASE_POOLER_URL : env.STOCK_SUPABASE_URL;
    key = env.STOCK_SUPABASE_KEY;
    if (typeof key !== 'string' || !key.trim() || key !== key.trim() || /\s/.test(key)) throw new Error('Invalid server stock credential');
    if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key) && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid server stock credential format');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid server stock URL'); }
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== '/' || typeof url !== 'string' || url !== url.trim() || !/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url)) throw new Error('Invalid server stock URL');
    if (!key.startsWith('sb_secret_')) {
      let claims;
      try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('Invalid server stock JWT claims'); }
      if (claims?.role !== 'service_role' || claims?.ref !== parsed.hostname.split('.')[0]) throw new Error('Server stock JWT project or role mismatch');
    }
    url = parsed.origin;
    if (env.VERCEL_ENV === 'production' && url !== STOCK_PROJECT_URL) throw new Error('Production stock project mismatch');
  } else {
    // Retain each consumer's existing legacy fallback until its replacement is approved.
    url = env.VITE_STOCK_SUPABASE_URL;
    key = legacyServiceRole ? String(env.STOCK_SUPABASE_SERVICE_ROLE_KEY || '').trim() : env.VITE_STOCK_SUPABASE_KEY;
    if (legacyServiceRole) url = String(url || '').trim();
  }
  if (!url || !key) throw new Error(legacyServiceRole ? 'Instore Products stock source is not configured' : 'Stock source is not configured');
  return { url, key };
}

export function stockFetch(key, fetchImpl = (...args) => globalThis.fetch(...args)) {
  return (input, init = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    // Secret API keys belong in apikey; a genuine caller JWT must be preserved.
    if (key.startsWith('sb_secret_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
    return fetchImpl(input, { ...init, headers });
  };
}

export function createStockClient({ env = process.env, legacyServiceRole = false, optional = false, fetchImpl, factory = createClient } = {}) {
  if (optional && !own(env, 'STOCK_SUPABASE_KEY') && (!env.VITE_STOCK_SUPABASE_URL || !env.VITE_STOCK_SUPABASE_KEY)) return null;
  const { url, key } = resolveStockCredentials(env, { legacyServiceRole });
  return factory(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: stockFetch(key, fetchImpl) } });
}
