/**
 * True when served from the trade sign-up domain only (site.proto.co.za).
 * That host must never expose the catalogue, landing page, or portal.
 */
const DEFAULT_PREREGISTER_HOSTS = ['site.proto.co.za', 'www.site.proto.co.za'];

export function isPreRegisterHost() {
  if (import.meta.env.VITE_PREREGISTER_MODE === 'true') return true;
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  const fromEnv = (import.meta.env.VITE_PREREGISTER_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const hosts = new Set([...DEFAULT_PREREGISTER_HOSTS, ...fromEnv].map((h) => h.toLowerCase()));
  return hosts.has(host.toLowerCase());
}

export function getPortalUrl() {
  return (import.meta.env.VITE_PORTAL_URL || 'https://protoportal-main.vercel.app').replace(/\/$/, '');
}
