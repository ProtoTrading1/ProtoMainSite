async function authenticateSession(req, res) {
  const { requireAuth } = await import('./_auth.js');
  return requireAuth(req, res);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Supabase's default storage key is derived from its configured project host.
// Custom hosts are deliberately unsupported: guessing a key could bind the
// helper to another project's session.
export function basketSessionStorageKey(configuredUrl) {
  if (typeof configuredUrl !== 'string' || !configuredUrl.trim()) return null;
  try {
    const url = new URL(configuredUrl);
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    if (!match || url.protocol !== 'https:' || url.username || url.password
      || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return `sb-${match[1]}-auth-token`;
  } catch {
    return null;
  }
}

export function createBasketCheckSessionHandler({
  authenticate = authenticateSession,
  environment = process.env,
} = {}) {
  return async function basketCheckSession(req, res) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const query = req.query || {};
    if (Object.keys(query).some(key => key !== 'mode')
      || !['config', 'identity'].includes(query.mode)
      || (req.body != null && (typeof req.body !== 'object' || Object.keys(req.body).length > 0))) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const sessionStorageKey = basketSessionStorageKey(environment.VITE_SUPABASE_URL);
    if (!sessionStorageKey) {
      return res.status(503).json({ error: 'Session configuration unavailable' });
    }
    if (query.mode === 'config') return res.status(200).json({ version: 1, sessionStorageKey });
    try {
      const user = await authenticate(req, res);
      if (!user) return;
      if (typeof user.id !== 'string' || !UUID.test(user.id)) {
        return res.status(401).json({ error: 'Unable to verify this session' });
      }
      return res.status(200).json({ version: 1, customerId: user.id.toLowerCase(), sessionStorageKey });
    } catch {
      return res.status(503).json({ error: 'Session verification unavailable' });
    }
  };
}

export default createBasketCheckSessionHandler();
