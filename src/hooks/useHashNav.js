import { useCallback, useState, useEffect, useRef } from 'react';
import { scrollToTop } from '../lib/scrollToTop';

/** Parse window.location.hash into path + refinements */
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathStr = '', queryStr = ''] = raw.split('?');
  const segments = pathStr ? pathStr.split('/').filter(Boolean) : [];
  const routePrefix = '';
  const decode = (s) => { try { return decodeURIComponent(s).trim(); } catch { return s.trim(); } };
  const path = (routePrefix ? segments.slice(1) : segments).map(decode);
  const refinements = {};
  if (queryStr) {
    new URLSearchParams(queryStr).forEach((v, k) => { refinements[k] = v; });
  }
  return { path, refinements, routePrefix };
}

/** Build a hash string from path + refinements */
function buildHash(path, refinements = {}, routePrefix = '') {
  const segments = routePrefix ? [routePrefix, ...path] : path;
  const pathStr = segments.join('/');
  const queryStr = new URLSearchParams(refinements).toString();
  return `#/${pathStr}${queryStr ? '?' + queryStr : ''}`;
}

/**
 * useHashNav — zero-dependency URL state for category navigation.
 *
 * Returns:
 *   path        string[]   current category path segments, e.g. ['bags-luggage', 'handbags']
 *   refinements object     active filter params, e.g. { colour: 'Black' }
 *   navigate    fn         navigate(newPath, newRefinements?) → updates hash
 *   back        fn         go up one level (clears refinements first if any)
 *   setRefinement fn       toggle a single refinement key/value
 *   reset       fn         go back to root
 */
export function useHashNav() {
  const [state, setState] = useState(parseHash);
  const shouldScrollOnHashChangeRef = useRef(true);

  useEffect(() => {
    const handler = () => {
      if (shouldScrollOnHashChangeRef.current) {
        scrollToTop();
      }
      shouldScrollOnHashChangeRef.current = true;
      setState(parseHash());
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((newPath, newRefinements = {}, options = {}) => {
    const shouldScroll = options.scroll !== false;
    const nextHash = buildHash(newPath, newRefinements, state.routePrefix);
    if (window.location.hash === nextHash) {
      if (shouldScroll) scrollToTop();
      shouldScrollOnHashChangeRef.current = true;
      setState(parseHash());
      return;
    }
    shouldScrollOnHashChangeRef.current = shouldScroll;
    if (options.replace) {
      window.history.replaceState(null, '', nextHash);
      if (shouldScroll) scrollToTop();
      shouldScrollOnHashChangeRef.current = true;
      setState(parseHash());
      return;
    }
    window.location.hash = nextHash;
  }, [state.routePrefix]);

  const back = () => {
    const { path, refinements } = state;
    // If refinements are active, clear them first before going up
    if (Object.keys(refinements).length > 0) {
      navigate(path, {}, { scroll: false });
    } else {
      navigate(path.slice(0, -1));
    }
  };

  const setRefinement = (key, value) => {
    const { path, refinements } = state;
    const next = { ...refinements };
    if (!value || next[key] === value) {
      delete next[key]; // toggle off
    } else {
      next[key] = value;
    }
    navigate(path, next, { scroll: false });
  };

  const reset = () => navigate([]);

  return { ...state, navigate, back, setRefinement, reset };
}

/** Utility: find a node in the category tree by path array */
export function findNodeByPath(categories, path) {
  if (!path || path.length === 0) return null;
  const node = categories.find(c => c.id === path[0]);
  if (!node) return null;
  if (path.length === 1) return node;
  return findNodeByPath(node.children || [], path.slice(1));
}

/** Utility: build breadcrumb trail — array of { id, label, path } */
export function buildBreadcrumb(categories, path) {
  const crumbs = [];
  let current = categories;
  for (let i = 0; i < path.length; i++) {
    const node = current.find(c => c.id === path[i]);
    if (!node) break;
    crumbs.push({ id: node.id, label: node.label, path: path.slice(0, i + 1) });
    current = node.children || [];
  }
  return crumbs;
}
