// Customer language shared by the main catalogue and Instore Products.
// These are equivalence families, not recommendations: every variant remains
// subject to the catalogue's existing visibility, stock, price and image gates.
const SEARCH_FAMILIES = [
  ['soft toy', ['soft toys', 'softtoy', 'softies', 'plush', 'plush toy', 'plush toys', 'pluch', 'plsh', 'teddy', 'teddies', 'tedi', 'stuffed animal', 'stuffed animals', 'stuffed toy', 'stuffed toys', 'cuddly toy', 'cuddly toys', 'cudly toy']],
  ['wallet', ['wallets', 'purse', 'purses']],
  ['handbag', ['hand bag', 'hand bags', 'handbags']],
  ['mobile phone', ['cell phone', 'cell phones', 'cellphone', 'cellphones', 'smartphone', 'smartphones']],
  ['stationery', ['stationary']],
  ['jewellery', ['jewelry']],
  ['earring back', ['earring backs', 'butterfly back', 'butterfly backs']],
  ['gift bag', ['gift bags', 'paper bag', 'paper bags', 'carrier bag', 'carrier bags']],
  ['hair clip', ['hair clips', 'hairpin', 'hairpins', 'barrette', 'barrettes']],
  ['hair tie', ['hair ties', 'ponytail holder', 'ponytail holders']],
  ['scrunchie', ['scrunchies']],
  ['notebook', ['notebooks', 'notepad', 'notepads']],
  ['colouring', ['coloring']],
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePhrase(value, from, to) {
  return value.replace(new RegExp(`(?:^|\\s)${escaped(from)}(?=\\s|$)`, 'g'), (match) => {
    const leadingSpace = match.startsWith(' ') ? ' ' : '';
    return `${leadingSpace}${to}`;
  }).replace(/\s+/g, ' ').trim();
}

export function searchQueryVariants(value, limit = 12) {
  const query = normalize(value);
  if (!query) return [];
  const variants = [query];
  for (const [canonical, aliases] of SEARCH_FAMILIES) {
    const family = [canonical, ...aliases].map(normalize).sort((a, b) => b.length - a.length);
    const matched = family.find((phrase) => new RegExp(`(?:^|\\s)${escaped(phrase)}(?:\\s|$)`).test(` ${query} `));
    if (!matched) continue;
    for (const phrase of family) variants.push(replacePhrase(query, matched, phrase));
    // One customer phrase should expand within its own product family. Avoid
    // a combinatorial cross-product if a query happens to mention two ranges.
    break;
  }
  return [...new Set(variants)].slice(0, Math.max(1, limit));
}

export function firstRelatedSearchTerm(value) {
  const variants = searchQueryVariants(value);
  return variants.find((variant) => variant !== normalize(value)) || null;
}
