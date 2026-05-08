import { useMemo } from 'react';

/**
 * useProductFilter
 *
 * Filters a product list by category path + active refinements.
 *
 * path        - current nav path e.g. ['bags-luggage', 'handbags']
 * refinements - active filter params e.g. { colour: 'Black', inStock: 'true' }
 *
 * Products must have:
 *   categoryPath  string[]  e.g. ['bags-luggage', 'handbags', 'leather-bags']
 *   colour?       string
 *   size?         string
 *   style?        string
 *   inStock?      boolean
 *   isNew?        boolean
 */
export function useProductFilter(products, path, refinements) {
  return useMemo(() => {
    let result = products;

    // ── Category path filter (prefix match) ──────────────────────────────────
    if (path && path.length > 0) {
      result = result.filter(p => {
        const cp = p.categoryPath || [];
        // Product path must start with every segment in the nav path
        return path.every((seg, i) => cp[i] === seg);
      });
    }

    // ── Refinement filters ────────────────────────────────────────────────────
    if (refinements) {
      if (refinements.colour) {
        result = result.filter(p =>
          p.colour && p.colour.toLowerCase() === refinements.colour.toLowerCase()
        );
      }
      if (refinements.size) {
        result = result.filter(p =>
          p.size && p.size.toLowerCase() === refinements.size.toLowerCase()
        );
      }
      if (refinements.style) {
        result = result.filter(p =>
          p.style && p.style.toLowerCase() === refinements.style.toLowerCase()
        );
      }
      if (refinements.inStock === 'true') {
        result = result.filter(p => p.inStock === true);
      }
      if (refinements.newStock === 'true') {
        result = result.filter(p => p.isNew === true);
      }
    }

    return result;
  }, [products, path, refinements]);
}

/**
 * Derive category counts from the product list.
 * Returns a map of categoryId → count (prefix match at any depth).
 *
 * Usage: const counts = useCategoryCounts(products)
 *        counts['bags-luggage']  // → number of products in that branch
 */
export function useCategoryCounts(products) {
  return useMemo(() => {
    const counts = { '': products.length };
    for (const p of products) {
      const cp = p.categoryPath || [];
      cp.forEach((seg, i) => {
        const key = cp.slice(0, i + 1).join('/');
        counts[key] = (counts[key] || 0) + 1;
      });
    }
    return counts;
  }, [products]);
}
