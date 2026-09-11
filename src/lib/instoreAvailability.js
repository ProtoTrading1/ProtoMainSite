// Explicit storefront and preview hosts; unknown hosts remain closed.
export function isInstoreAvailable(hostname = '') {
  return ['proto.co.za', 'www.proto.co.za', 'prototrading.co.za', 'www.prototrading.co.za', 'register.proto.co.za', 'localhost', '127.0.0.1'].includes(hostname) || hostname.endsWith('.vercel.app');
}
export const instoreAvailable = typeof window !== 'undefined' && isInstoreAvailable(window.location.hostname);
