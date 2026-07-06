// Error monitoring — no-op unless VITE_SENTRY_DSN is configured (Cursor
// Dashboard > Secrets, or .env locally). Keeps the bundle lean for anyone
// who hasn't set up a Sentry project yet, and never blocks app boot.
const dsn = import.meta.env.VITE_SENTRY_DSN;

let sentryPromise = null;

function loadSentry() {
  if (!dsn) return Promise.resolve(null);
  if (!sentryPromise) {
    sentryPromise = import('@sentry/react')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: import.meta.env.MODE,
          release: import.meta.env.VITE_APP_VERSION || undefined,
          tracesSampleRate: 0.1,
          // Portal already has its own retry/reload UX for chunk-load errors —
          // don't let Sentry double-report the same noisy event.
          ignoreErrors: [
            /mime type/i,
            /dynamically imported module/i,
            /module script failed/i,
          ],
        });
        return Sentry;
      })
      .catch((err) => {
        console.error('Sentry init failed:', err);
        return null;
      });
  }
  return sentryPromise;
}

export function initMonitoring() {
  if (!dsn) return;
  void loadSentry();
}

export function captureError(error, context) {
  if (!dsn) {
    console.error('[monitoring]', error, context);
    return;
  }
  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.captureException(error, context ? { extra: context } : undefined);
  });
}

export function setMonitoringUser(user) {
  if (!dsn) return;
  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.setUser(user ? { id: user.id, email: user.email } : null);
  });
}
