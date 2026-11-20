// Synthetic contract data. Names/codes model the supplied brief; no row proves
// live catalogue presence, eligibility, stock or historical result counts.
const product = (sku, name, extra = {}) => ({ id: sku, sku, websiteSku: sku, code: sku, name, title: name,
  barcode: `fixture-${sku}`, price: 100, stockOnHand: 10, stockQty: 10, inStock: true, minQty: 1, categoryPath: [], ...extra });
export const novemberProducts = [
  product('KEY', 'Metal Keyrings'), product('CLIP', 'Hair Clip'), product('SQU', 'Animal Squishy'),
  product('SQZ', 'Squeezy Ball'), product('FIX-004', 'Pocket Diary 2027'), product('INC', 'Stick Incense'),
  product('NOTE', 'Notebook A5'), product('FESTIVE', 'Christmas Decoration'), product('JOURNAL', 'Journal'),
  product('MARKER', 'Marker Pen'), product('NAPKIN', 'Paper Napkin'), product('SERV', 'Serviette'),
  product('GLASS', 'Drinking Glasses'), product('SUN', 'Sunglasses'),
  product('MP130-1', 'MOTARRO STRETCH CANVAS 6×6CM'), product('mp1301', 'Identifier Collision'),
  product('MI07B', 'Model MI07B'), product('R21', 'Model R21'), product('R24', 'Model R24'),
  product('8616300009B', 'Variant Code'),
  ...['IVR', 'PEA', 'PNK', 'TUR'].map(colour => product(`FIX-${colour}`, `2027 Diary ${colour}`, { barcode: '8621100236', stockOnHand: 20, stockQty: 20 })),
  product('WRONG', 'Unrelated', { barcode: '8621100237' }),
  product('BRUSH', 'Barber Brush'), product('FEATHER', 'Feather Bag'),
];
export const novemberCases = [
  ['key rings', ['KEY']], ['keyring', ['KEY']], ['clip', ['CLIP']], ['clips', ['CLIP']],
  ['squishies', ['SQU', 'SQZ']], ['squi', ['SQU']], ['squee', ['SQZ']],
  ['dia', ['FIX-004', 'FIX-IVR', 'FIX-PEA', 'FIX-PNK', 'FIX-TUR']], ['incen', ['INC']], ['note book', ['NOTE']],
  ['xmas', ['FESTIVE']], ['journal', ['JOURNAL', 'NOTE', 'FIX-004', 'FIX-IVR', 'FIX-PEA', 'FIX-PNK', 'FIX-TUR']],
  ['koki', ['MARKER']], ['serviette', ['SERV', 'NAPKIN']], ['glasses', ['GLASS']],
  ['2027', ['FIX-004', 'FIX-IVR', 'FIX-PEA', 'FIX-PNK', 'FIX-TUR']], ['MP130-1', ['MP130-1', 'mp1301']], ['mp1301', ['MP130-1', 'mp1301']],
  ['MI07B', ['MI07B']], ['R21', ['R21']], ['R24', ['R24']], ['8616300009B', ['8616300009B']],
  ['8621100236', ['FIX-IVR', 'FIX-PEA', 'FIX-PNK', 'FIX-TUR']], ['chritms', ['FESTIVE']],
];
export const novemberNegatives = ['bluetooth', 'dala', 'resin', 'crochet', 'socks', 'mosaic', 'lego', 'velcro', 'gem', 'enamel', 'fairy lights', 'tissue paper', 'table cloth', 'single blankets', '8640000272', 'kbr', 'blush', 'leather bag', 'MI07C', '8621100238'];

// Current existence/channel/quantity/price reported by parent from catalogue
// evidence. These fixture titles are descriptive labels, not copied records.
export const novemberInstoreOnly = [
  product('78437', 'Crochet Kit 78437', { stockQty: 9, stockOnHand: 9 }),
  product('78445', 'Crochet Kit 78445', { stockQty: 2, stockOnHand: 2 }),
  product('8640000178', 'Tablecloth', { stockQty: 803, stockOnHand: 803, price: 8.5 }),
  product('8640000272', 'Search-only In-store Item', { stockQty: 144, stockOnHand: 144, price: 12.5 }),
].map(row => ({ ...row, isExtendedRange: true, searchOnly: true }));
