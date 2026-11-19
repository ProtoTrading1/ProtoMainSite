import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchExtendedRange, hydrateInstoreCatalogue, instoreCatalogue, subscribeInstoreCatalogue } from '../lib/extendedRange';
import { instorePage } from '../../lib/instore-page.mjs';

const empty = { query: '', products: [], total: 0, loading: false, error: false };
const serverSnapshot = () => null;

// Main-search suggestions must adopt a hydrated/refreshed catalogue while a
// slow paged request is pending, just as the dedicated Instore page does.
export default function useInstoreSearch(value, { enabled = true, limit = 12 } = {}) {
  const query = String(value || '').trim();
  const active = enabled && query.length >= 2;
  const catalogue = useSyncExternalStore(subscribeInstoreCatalogue, instoreCatalogue, serverSnapshot);
  const [state, setState] = useState(empty);

  useEffect(() => {
    if (!active) { setState(empty); return undefined; }
    let cancelled = false;
    const controller = new AbortController();
    const apply = result => {
      if (!cancelled && !controller.signal.aborted) setState({
        query, products: (result.products || []).slice(0, limit),
        total: Number(result.total) || 0, loading: false, error: false,
      });
    };
    if (catalogue) {
      apply(instorePage(catalogue, { query, pageSize: limit }));
      return () => { cancelled = true; controller.abort(); };
    }
    setState({ ...empty, query, loading: true });
    // Hydrate now; a blocked browser store must not delay the paged fallback.
    void hydrateInstoreCatalogue().catch(() => {});
    const timer = window.setTimeout(async () => {
      try {
        const local = instoreCatalogue();
        apply(local ? instorePage(local, { query, pageSize: limit })
          : await fetchExtendedRange(query, { signal: controller.signal, page: 1 }));
      } catch {
        if (!cancelled && !controller.signal.aborted) setState({ ...empty, query, error: true });
      }
    }, 250);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [active, catalogue, limit, query]);

  // Do not expose another query's results between render and effect cleanup.
  return !active ? empty : state.query === query ? state : { ...empty, query, loading: true };
}
