// Temporary production hold while staged pricing is reconciled.
export function isInstoreAvailable(hostname = '') {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.vercel.app');
}
export const instoreAvailable = typeof window !== 'undefined' && isInstoreAvailable(window.location.hostname);
