import { lazy } from 'react';

const RETRY_KEY = 'proto-lazy-retry';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Unable to preload CSS') ||
    message.includes('Failed to load module script')
  );
}

export default function lazyWithRetry(importer, key) {
  return lazy(async () => {
    try {
      const mod = await importer();
      window.sessionStorage.removeItem(RETRY_KEY);
      return mod;
    } catch (error) {
      const shouldReload = isChunkLoadError(error);
      const retriedKey = window.sessionStorage.getItem(RETRY_KEY);
      if (shouldReload && retriedKey !== key) {
        window.sessionStorage.setItem(RETRY_KEY, key);
        window.location.reload();
        return new Promise(() => {});
      }
      window.sessionStorage.removeItem(RETRY_KEY);
      throw error;
    }
  });
}
