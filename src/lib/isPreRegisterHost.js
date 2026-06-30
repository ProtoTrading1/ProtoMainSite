/**
 * Trade sign-up only host (register.proto.co.za). Must never expose the main site.
 * Main site lives at site.proto.co.za — do not add it here.
 */
const DEFAULT_PREREGISTER_HOSTS = ['register.proto.co.za', 'www.register.proto.co.za'];

export function isPreRegisterHost() {
  if (import.meta.env.VITE_PREREGISTER_MODE === 'true') return true;
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname.toLowerCase();
  const fromEnv = (import.meta.env.VITE_PREREGISTER_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const hosts = new Set([...DEFAULT_PREREGISTER_HOSTS, ...fromEnv]);
  return hosts.has(host);
}

export function getPortalUrl() {
  return (import.meta.env.VITE_PORTAL_URL || 'https://site.proto.co.za').replace(/\/$/, '');
}
