import { useEffect, useState } from 'react';
import {
  bundledCategories,
  getActiveTaxonomy,
  setActiveTaxonomy,
  subscribeTaxonomy,
} from './taxonomy';

let _fetchPromise = null;
let _hasFetched = false;

// Re-pull the taxonomy periodically (and on window focus) so admin edits
// — rename / reorder / add / delete — appear on the storefront without a
// full page reload. The portal is a live mirror of the admin dashboard.
const REVALIDATE_MS = 60 * 1000;

async function fetchLiveTaxonomy() {
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('/api/taxonomy', { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`taxonomy ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const next = Array.isArray(json?.categories) ? json.categories : null;
      // setActiveTaxonomy notifies subscribers, so a poll that finds changed
      // categories live-updates every mounted nav/sidebar.
      if (next?.length) setActiveTaxonomy(next);
      _hasFetched = true;
      return next || getActiveTaxonomy();
    })
    .catch(() => {
      _hasFetched = true;
      return getActiveTaxonomy();
    })
    .finally(() => {
      _fetchPromise = null;
    });
  return _fetchPromise;
}

/** Force a re-pull now (used by the poll + on window focus). */
export function refreshLiveTaxonomy() {
  _fetchPromise = null;
  return fetchLiveTaxonomy();
}

/**
 * React hook: returns the active category tree, fetches the live taxonomy
 * from /api/taxonomy, and keeps it fresh via a poll + on-focus revalidate so
 * the storefront mirrors admin category edits live.
 */
export function useLiveTaxonomy() {
  const [tree, setTree] = useState(() => getActiveTaxonomy() || bundledCategories);

  useEffect(() => {
    const unsubscribe = subscribeTaxonomy((next) => setTree(next));
    if (!_hasFetched) {
      void fetchLiveTaxonomy().then((next) => { if (next) setTree(next); });
    } else {
      setTree(getActiveTaxonomy());
    }

    const interval = setInterval(() => { void refreshLiveTaxonomy(); }, REVALIDATE_MS);
    const onFocus = () => { void refreshLiveTaxonomy(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return tree;
}
