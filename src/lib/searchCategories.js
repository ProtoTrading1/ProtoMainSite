import { parseSearchQuery, searchQueryVariants } from '../../lib/search-language.mjs';
import { isIdentifierQuery } from './identifierNormalize.js';

const words = (value) => String(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(Boolean).map((word) => word.length > 3 ? word.replace(/s$/, '') : word);

/** Category navigation, not a promise of product availability or filter counts. */
export function matchSearchCategories(categories, query, limit = 6) {
  if (!query.trim() || isIdentifierQuery(query)) return [];
  const intent = parseSearchQuery(query);
  // A broad category is not a match for a concrete colour/size request.
  if (intent.colours.length || intent.sizes.length || intent.measurements.length) return [];
  const variants = searchQueryVariants(query).map(words).filter((tokens) => tokens.length);
  const seen = new Set();
  return categories.map((cat) => {
    const labelWords = words(cat.label);
    const score = Math.max(0, ...variants.map((tokens) => {
      // Every remaining product qualifier must match; "plush pen" must not
      // suggest Soft Toys merely because it shares one word with a family.
      if (!tokens.every((token) => labelWords.some((word) => word.startsWith(token)))) return 0;
      return 100 + tokens.length * 10 - labelWords.length;
    }));
    return { cat, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.cat.label.localeCompare(b.cat.label))
    .filter(({ cat }) => {
      const key = cat.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit).map(({ cat }) => cat);
}
