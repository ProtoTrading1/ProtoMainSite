export function readOnlyBrowserFetch(transport, { origin, authOrigin, checkoutScope }) {
  return (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, origin);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const localRead = url.origin === origin && ['GET', 'HEAD'].includes(method);
    const userRead = url.origin === authOrigin && method === 'GET' && url.pathname === '/auth/v1/user';
    const grant = url.searchParams.get('grant_type');
    const login = url.origin === authOrigin && method === 'POST' && url.pathname === '/auth/v1/token' && ['password', 'refresh_token'].includes(grant);
    const checkout = checkoutScope === 'archive-checkout-dry-run-v1'
      && authOrigin === 'https://kyodrsqnmihwoplkhwwf.supabase.co'
      && url.origin === origin && method === 'POST'
      && url.pathname === '/api/archive-checkout-dry-run'
      && !url.href.includes('?') && !url.hash;
    if (url.username || url.password || (!localRead && !userRead && !login && !checkout)) return Promise.reject(new Error('ARCHIVE_TEST_BROWSER_READ_ONLY'));
    return transport(input, { ...init, redirect: 'error' });
  };
}
