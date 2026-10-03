import { lazy } from 'react';

const RETRY_KEY = 'proto-lazy-retry';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Unable to preload CSS') ||
    message.includes('Failed to load module script') ||
    message.includes('is not a valid JavaScript MIME type') ||
    message.includes('MIME type')
  );
}

export async function loadWithRetry(importer, key, browser = window) {
    try {
      const mod = await importer();
      try { browser.sessionStorage.removeItem(RETRY_KEY); } catch { /* Optional storage cannot fail a successful import. */ }
      return mod;
    } catch (error) {
      const shouldReload = isChunkLoadError(error);
      let retriedKey;
      try { retriedKey = browser.sessionStorage.getItem(RETRY_KEY); } catch { throw error; }
      if (shouldReload && retriedKey !== key) {
        try { browser.sessionStorage.setItem(RETRY_KEY, key); } catch { throw error; }
        browser.location.reload();
        return new Promise(() => {});
      }
      try { browser.sessionStorage.removeItem(RETRY_KEY); } catch { /* Preserve the original failure for recovery. */ }
      throw error;
    }
}

export default function lazyWithRetry(importer, key) {
  return lazy(() => loadWithRetry(importer, key));
}
