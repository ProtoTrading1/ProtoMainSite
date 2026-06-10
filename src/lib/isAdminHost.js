/**
 * True when this build is served from the standalone admin deployment
 * (protoportal-admin.vercel.app), not the public trade portal.
 */
export function isAdminHost() {
  if (import.meta.env.VITE_ADMIN_MODE === 'true') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'protoportal-admin.vercel.app' || host.startsWith('protoportal-admin-');
}
