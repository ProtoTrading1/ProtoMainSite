import { useEffect, useState } from 'react';
import {
  bundledCategories,
  getActiveTaxonomy,
  setActiveTaxonomy,
  subscribeTaxonomy,
} from './taxonomy';

let _fetchPromise = null;
let _hasFetched = false;

async function fetchLiveTaxonomy() {
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('/api/taxonomy', { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`taxonomy ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const next = Array.isArray(json?.categories) ? json.categories : null;
      if (next?.length) setActiveTaxonomy(next);
      _hasFetched = true;
      return next || getActiveTaxonomy();
    })
    .catch(() => {
      _hasFetched = true;
      return getActiveTaxonomy();
    })
    .finally(() => {
      // Keep the resolved promise so repeat callers reuse the result, but
      // clear after a short window so manual refreshes can re-fetch.
      setTimeout(() => { _fetchPromise = null; }, 5 * 60 * 1000);
    });
  return _fetchPromise;
}

export function refreshLiveTaxonomy() {
  _fetchPromise = null;
  _hasFetched = false;
  return fetchLiveTaxonomy();
}

/**
 * React hook: returns the active category tree and triggers a one-time
 * fetch of the live taxonomy from /api/taxonomy. Re-renders consumers when
 * the active tree changes (e.g. after the live fetch resolves).
 */
export function useLiveTaxonomy() {
  const [tree, setTree] = useState(() => getActiveTaxonomy() || bundledCategories);

  useEffect(() => {
    const unsubscribe = subscribeTaxonomy((next) => setTree(next));
    if (!_hasFetched) {
      void fetchLiveTaxonomy().then((next) => {
        if (next) setTree(next);
      });
    } else {
      setTree(getActiveTaxonomy());
    }
    return unsubscribe;
  }, []);

  return tree;
}
