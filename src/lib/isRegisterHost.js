export function isRegisterHost() {
  if (import.meta.env.VITE_REGISTER_MODE === 'true') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'register.proto.co.za' || host.startsWith('protoportal-register-');
}
