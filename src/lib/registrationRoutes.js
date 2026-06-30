/**
 * Standalone trade registration at /pre-register (share via site.proto.co.za redirect).
 * Main site and /register are unchanged.
 */
export const REGISTRATION_REDIRECT_HOSTS = ['site.proto.co.za', 'www.site.proto.co.za'];

export function isRegistrationRedirectHost() {
  if (typeof window === 'undefined') return false;
  return REGISTRATION_REDIRECT_HOSTS.includes(window.location.hostname.toLowerCase());
}

export function isStandaloneRegisterPath(pathname) {
  return pathname === '/pre-register';
}

export function getPortalUrl() {
  return (import.meta.env.VITE_PORTAL_URL || 'https://protoportal-main.vercel.app').replace(/\/$/, '');
}
