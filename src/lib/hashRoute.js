/** Parse a storefront hash into path segments and query refinements. */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathStr = '', queryStr = ''] = raw.split('?');
  const segments = pathStr ? pathStr.split('/').filter(Boolean) : [];
  const routePrefix = '';
  const decode = (value) => {
    try { return decodeURIComponent(value).trim(); } catch { return value.trim(); }
  };
  const path = (routePrefix ? segments.slice(1) : segments).map(decode);
  const refinements = {};
  if (queryStr) {
    new URLSearchParams(queryStr).forEach((value, key) => { refinements[key] = value; });
  }
  return { path, refinements, routePrefix };
}

/** Build a storefront hash from path segments and query refinements. */
export function buildHash(path, refinements = {}, routePrefix = '') {
  const segments = routePrefix ? [routePrefix, ...path] : path;
  const pathStr = segments.join('/');
  const queryStr = new URLSearchParams(refinements).toString();
  return `#/${pathStr}${queryStr ? `?${queryStr}` : ''}`;
}
