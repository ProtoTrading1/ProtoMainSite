// Catalogue navigation only: never changes eligibility, prices, or stock.
// A finished object always takes priority over a material word in its description.
function normalize(value) {
  return String(value || '').toLowerCase().replace(/e\/rings?/g, 'earrings')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function classifyInstoreProduct(product = {}) {
  const text = normalize(product.originalDescription || product.title || product.name);
  const dept = normalize(product.department || product.category);
  const has = (expression) => expression.test(text);
  const result = (category, type, reason, reviewRequired = false) => ({ category, type, reason, reviewRequired });
  const isDept = (...values) => values.includes(dept);
  const jewellery = (reason) => result('Jewellery', 'finished-jewellery', reason);
  const component = (reason) => result('Beads & jewellery making', 'jewellery-component', reason);

  if (has(/^(?:gel |ballpoint )?pen\b/) && !has(/\bpen (?:holder|stand|refill)\b/)) return result('Stationery & art', 'general-product', 'pen object');
  if (has(/^(?:printed |leather |cotton )?(?:purse|wallet)s?\b/)) return result('Bags & wallets', 'general-product', 'purse/wallet object');
  if (has(/\bpendant (?:lamp|light)\b/)) return result('Home & kitchen', 'general-product', 'lighting object');
  if (has(/\bcurtain rings?\b/)) return result('Home & kitchen', 'general-product', 'curtain hardware');
  if (has(/\bkey\s*rings?\b/) && isDept('bead accessories', 'bead metal parts', 'finding good plating')) return component('loose keyring in component department');
  if (has(/\b(key\s*rings?|keychains?|keyring)\b/) || isDept('key rings')) return result('More finds', 'keyring', 'keyring object');
  if (has(/\b(display|diplay)\b/) || has(/\b(jewellery|jewelery|jewelry|bracelets?|bangles?|rings?|earrings?)\s+(?:watch\s+)?(boxes|box|stands?|trays?|tags?|cases?)\b/) || has(/\bring tags?\b/) || isDept('packaging goods', 'gift bags')) return result('More finds', 'packaging-display', 'packaging or display object');
  if (isDept('leather bag parts') || has(/\bbag (parts?|chain|clasp|handle)\b/)) return result('Crafts & DIY', 'bag-component', 'bag-making hardware');
  if (has(/\b(jump rings?|split rings?|memory wire|braiding board|earrings? (parts?|ends?|hooks?|backs?|findings?|posts?|clip on)|brooch pins?|bead ?caps?|tiger ?tail|crimps?|eye pins?|ball pins?|head pins?|exten[st]ion chain)\b/)) return component('explicit jewellery-making component phrase');
  if (has(/\bbracelet chain\b/) && isDept('bead accessories', 'bead metal parts')) return component('bracelet chain in component department');
  if (has(/\bearrings?\b/) && isDept('bead metal parts', 'bead accessories', 'finding good plating')) return component('earring object in component department');
  if (has(/\b(bracelets?|bangles?)\b/)) return result('Bracelets', 'finished-jewellery', 'finished bracelet or bangle');
  // Completed chain-and-pendant sets belong with ready-to-wear Jewellery.
  if (has(/\b(necklaces?|earrings?|brooch(?:es)?|chokers?|anklets?|ankle chain)\b/) || has(/\bchain (?:w|with) (?:pendant|map)\b/)) return jewellery('explicit finished jewellery object');
  // Positill has historical department labels that can place loose stones
  // beside stationery. Check after a finished-object phrase so a completed
  // semi-precious necklace or pair of earrings remains customer Jewellery.
  if (has(/\b(?:semi\s?precious|s\s?precious|gem\s?stones?)\b/)) return component('semi-precious stone or bead supply');
  if (has(/\b(clasps?|charms?|pendants?|beads?|findings?)\b/)) return component('loose jewellery-making object');
  if (has(/\blockets?\b/) || has(/\bchain\b/)) return result('Beads & jewellery making', 'ambiguous', 'loose jewellery component', true);
  if (has(/\brings?\b/) && isDept('fashion jewellery', 'fash jewel upper', 'pendnts braclts rngs')) return jewellery('ring in jewellery department');
  if (has(/\b(soft toys?|plush toys?|stuffed (?:toys?|animals?)|teddy bears?)\b/) && !has(/\b(container|blanket|pencil|case|bag|slipper|sock|hat|beanie|key|earring)\b/)) return result('Soft toys', 'soft-toy', 'explicit soft toy object');
  if (has(/\b(container|bowl|mug|spoon|plate|kitchen|towel|blanket)\b/) && !isDept('party accessories', 'party fancy dres')) return result('Home & kitchen', 'general-product', 'household object');
  if (has(/\b(sock|socks|beanie|beanies|legging|leggings|tight|tights|warmer|warmers|scarf|scarves)\b/)) return result('More finds', 'general-product', 'clothing');
  const departments = [['Beads & jewellery making', ['string beads', 'bead metal parts', 'bead accessories', 'wooden beads', 'beads seed acrylic', 'finding good plating']], ['Party items', ['party fancy dres', 'party accessories', 'halloween', 'occasions', 'xmas stocks']], ['Toys & games', ['toys games', 'motarro toys']], ['Hair accessories', ['hair accessories']], ['Bags & wallets', ['bags wallets', 'luggage']], ['Stationery & art', ['stationery art', 'arts', 'scrapbooking', 'stickers', 'motarro stationery', 'keep smiling', 'amazcolor']], ['Crafts & DIY', ['craft parts', 'crafts and allied', 'haberdashery', 'motarro craft', 'hardware etc', 'conan hardware']], ['Home & kitchen', ['household', 'candles', 'albums and frames', 'insence burners etc', 'electrical appliance']], ['Beauty', ['cosmetics skin care', 'hairdressing equpmnt']]];
  for (const [category, values] of departments) if (values.includes(dept)) return result(category, 'general-product', `controlled department: ${dept}`);
  if (isDept('soft toys')) return result('More finds', 'ambiguous', 'soft-toy department without explicit toy object', true);
  const nouns = [['Stationery & art', /\b(pens?|pencils?|notebooks?|stationery|stickers?|pencil case)\b/], ['Hair accessories', /\b(hair|scrunchies?|headbands?)\b/], ['Toys & games', /\b(toys?|dolls?|puzzles?|games?)\b/], ['Party items', /\b(party|balloons?|confetti|bunting)\b/], ['Bags & wallets', /\b(bags?|purses?|wallets?)\b/], ['Crafts & DIY', /\b(craft|diy|wool|ribbon)\b/], ['Beauty', /\b(lipstick|makeup|cosmetic|beauty)\b/]];
  for (const [category, expression] of nouns) if (has(expression)) return result(category, 'general-product', 'explicit product noun');
  return result('More finds', 'ambiguous', 'no reliable product type match', true);
}
