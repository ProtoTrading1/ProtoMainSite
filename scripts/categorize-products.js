/**
 * Categorizes all products in website_products based on their title.
 * Usage:
 *   node scripts/categorize-products.js           → dry run, shows counts
 *   node scripts/categorize-products.js --apply   → writes to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dir, '../.env.local'), 'utf8');
const envVars = Object.fromEntries(
  env.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim()];
  })
);

const SUPABASE_URL = envVars.VITE_STOCK_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_STOCK_SUPABASE_KEY;
const APPLY = process.argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Category rules — checked in order, first match wins ─────────────────────
// Each rule: { category: 'category-id', match: [keywords] }
// Keywords are checked against the uppercased product title.
// A rule matches if ANY of its keywords appear in the title.

const RULES = [
  // ── Confectionery ────────────────────────────────────────────────────────────
  {
    category: 'confectionery',
    match: ['COOKIE', 'NOUGAT', 'SWEET ', 'CANDY', 'CHOCOLATE', 'LOLLY', 'GUMMY', 'BISCUIT', 'DIPPER COOKIE', 'CHUNKY CHOC'],
  },

  // ── Packaging (check before beads — organza/paper bags = packaging) ──────────
  {
    category: 'packaging',
    match: [
      'PVC PLASTIC RESEALABLE', 'ZIPLOCK', 'ZIP LOCK', 'RESEALABLE PACKET',
      'ORGANZA BAG', 'KRAFT BAG', 'GIFT BAG', 'BOUTIQUE BAG', 'PAPER BAG',
      'PAPER SHOPPER BAG', 'BUBBLE WRAP', 'CELLOPHANE', 'DISPLAY POUCH',
      'JEWELLERY DISPLAY TAG', 'DISPLAY TAG',
      'POLYBAG', 'POLY BAG', 'SHRINK WRAP', 'ZIP POUCH',
      'MOTARRO FELT BAG',
    ],
  },

  // ── Beads, Jewellery & Accessories ──────────────────────────────────────────
  {
    category: 'beads-jewellery',
    match: [
      // Wood beads
      'WOOD PAINTED', 'WOOD RAW', 'WOOD BEAD', 'WOODEN BEAD',
      'WOOD COCO', 'WOOD DISC', 'WOOD OVAL', 'WOOD CYLINDER', 'WOOD FLAT',
      // Seed / glass / crystal beads
      'SEEDBEAD', 'SEED BEAD', 'GLASS PEARL', 'GLASS CZECH', 'GLASS BEAD',
      'GLASS CRACKLE', 'GLASS FIRE', 'GLASS LUSTRE',
      'CRYSTAL BEAD', 'CHANDELIER GLASS CRYSTAL', 'CHANDELIER GLASS',
      // Acrylic & plastic beads
      'ACRYLIC BEAD', 'PLASTIC CROW BEAD', 'PLASTIC LUSTRE', 'PLASTIC ROUND',
      'PLASTIC BEAD', 'CCB BEAD',
      // Metal beads
      'METAL-HOLLOW BEAD', 'METAL HOLLOW BEAD', 'METAL BEAD',
      'METAL DAIZY', 'SPACER BEAD',
      'METAL-ALUMINIUM', 'ALUMINIUM CONE', 'METAL CONE', 'CONE SHINY', 'CONE ANTIQUE',
      'METAL TUBE', 'METAL DISC', 'METAL OVAL',
      // Lava, stone, synthetic
      'LAVA BEAD', 'LAVA BEADS', 'SYNTHETIC AGED STONE', 'STONE CHIP',
      'SEMI PRECIOUS', 'STONE BEAD', 'SEMI-PRECIOUS',
      // Other bead types
      'BEAD |', 'BEADS |', '| BEAD', '| BEADS',
      'BEAD,', 'BEADS,', 'EARTH STONE BRACELET', 'EARTH STONE NECKLACE',
      'LOOSE BEAD', 'LOOSE BEADS',
      // Jewellery pieces
      'NECKLACE', 'BRACELET', 'EARRING', 'PENDANT', 'BANGLE', 'ANKLET',
      'BROOCH', 'CUFFLINK', 'LADIES WATCH', 'WATCH |',
      // Findings & components
      'BROOCH BACK', 'BROOCH PIN', 'METAL CLASP', 'BARREL CLASP', 'LOBSTER CLASP',
      'TOGGLE CLASP', 'MAGNETIC CLASP', 'CRIMP', 'JUMP RING', 'SPLIT RING',
      'EYE PIN', 'HEAD PIN', 'METAL FINDING', 'FINDINGS JUMPRING', 'FINDINGS ',
      'SPACER', 'METAL |',
      // Chains, wire, cord
      'FAUX SUEDE CORD', 'SUEDE CORD', 'IMITATION SUEDE CORD',
      'LEATHER CORD', 'WAXED CORD', 'ELASTIC CORD', 'ELASTIC CLEAR',
      'NYLON CORD', 'COTTON CORD', 'BEAD CORD', 'TIGER TAIL', 'MEMORY WIRE',
      'WIRE GALVINISED', 'WIRE COIL', 'NICKEL CHAIN', 'CHAIN DESIGN',
      'CHAIN LINK', 'CHAIN BL', 'JEWELLERY CHAIN', 'BALL CHAIN',
      'KISMET RAEESAH', 'KISMET ',
      // Metal charms
      'METAL CHARM', 'CHARM |', 'CHARM,',
      // Display hardware
      'JEWELLERY DISPLAY', 'JEWELLERY STAND', 'NECKLACE DISPLAY', 'EARRING DISPLAY',
      'JEWELLERY TAG',
    ],
  },

  // ── Fashion & Accessories ────────────────────────────────────────────────────
  {
    category: 'fashion-accessories',
    match: [
      // Bags
      'LADIES BAG', 'LADIES BACKPACK', 'HANDBAG', 'HAND BAG', 'TOTE BAG',
      'SHOULDER BAG', 'CLUTCH BAG', 'CROSSBODY', 'SATCHEL', 'BACKPACK',
      'LEATHER LUGGAGE BAG', 'LEATHER MACBOOK', 'LEATHER COVER',
      'TRAVEL BAG',
      // Wallets & purses
      'WALLET', 'PURSE |', 'COIN PURSE', 'CARD HOLDER', 'CARD WALLET',
      'LADIES PURSE', 'LADIES WALLET',
      // Luggage
      'LUGGAGE BAG', 'SUITCASE', 'TROLLEY BAG', 'CARRY ON',
      // Headwear
      'FEDORA HAT', 'BASEBALL CAP', 'BUCKET HAT', 'BEANIE', 'BERET',
      'FLOPPY HAT', 'COWBOY HAT', 'SUN HAT', 'VISOR', 'HAT:',
      'PANAMA HAT', 'STRAW HAT', 'TRILBY', 'KNITTED HAT', 'KNITTED BEANIE',
      'STRAW TYPE', 'WIDE BRIM HAT',
      // Hair accessories
      'HAIR CLIP', 'HAIR BAND', 'HAIR TIE', 'HAIR PIN', 'SCRUNCHIE',
      'HAIR CLAW', 'BARRETTE', 'HEADBAND', 'BOBBY PIN',
      // Eyewear
      'SUNGLASSES', 'READING GLASSES', 'EYEWEAR',
      // Scarves & wraps
      'SCARF', 'SCARVES', 'SHAWL', 'WRAP |',
      // Fabric / dress material
      'AFRICAN CHITENGE', 'DRESS MATERIAL',
      // Bag straps
      'BAG STRAP', 'ADJUSTABLE STRAP',
    ],
  },

  // ── Beauty & Personal Care ───────────────────────────────────────────────────
  {
    category: 'beauty-personal-care',
    match: [
      // Brands
      'MIJONA', 'OYA HANDMADE SOAP', 'OYA ROOM',
      // Haircare
      'SHAMPOO', 'CONDITIONER', 'HAIR MASK', 'HAIR TREATMENT', 'HAIR SERUM',
      'HAIR OIL', 'HAIR COLOUR', 'HAIR DYE',
      // Bath & shower
      'BODY WASH', 'SHOWER GEL', 'BATH SALT', 'BATH BOMB', 'BUBBLE BATH',
      'BATH OIL',
      // Soaps & hygiene
      'HANDMADE SOAP', 'HAND WASH', 'HAND SOAP', 'ANTIBACTERIAL',
      'SANITISER', 'SANITIZER',
      // Body care
      'BODY LOTION', 'BODY CREAM', 'BODY CREAMS', 'BODY BUTTER',
      'MOISTURISER', 'MOISTURIZER', 'BODY OIL', 'STRETCH MARK',
      // Sun care
      'SUNSCREEN', 'SUN BLOCK', 'SUN CREAM', 'SPF', 'AFTER SUN',
      // Lip care
      'LIP BALM', 'LIP GLOSS', 'LIP STICK', 'LIPSTICK', 'LIP LINER',
      // Cosmetics
      'EYEBROW', 'EYE SHADOW', 'EYESHADOW', 'FOUNDATION', 'CONCEALER',
      'BLUSH', 'BRONZER', 'MASCARA', 'EYELINER', 'SETTING POWDER',
      'MAKEUP BRUSH', 'COSMETIC', 'EYEBROWS PALETTE', 'PALETTE 0',
      'MAKEUP SET', 'NAIL POLISH', 'NAIL LACQUER',
      // Fragrance
      'PERFUME', 'COLOGNE', 'ANTI|PERSPIRANT', 'ANTI-PERSPIRANT',
      'DEODORANT', 'ANTIPERSPIRANT', 'BODY SPRAY',
      // Dental
      'TOOTHBRUSH', 'TOOTHPASTE', 'MOUTHWASH', 'DENTAL',
      // Tools
      'MAKEUP BRUSH SET', 'BEAUTY BLENDER', 'FACE MASK',
    ],
  },

  // ── Homeware & Kitchen ───────────────────────────────────────────────────────
  {
    category: 'homeware-kitchen',
    match: [
      // Homeware prefix
      'HOMEWARE:',
      // Candles
      'CANDLE', 'VOTIVE', 'TEALIGHT', 'TEA LIGHT', 'PILLAR CANDLE',
      'SCENTED CANDLE', 'CANDLE HOLDER', 'CANDLESTICK',
      // Diffusers
      'ROOM DEFUSER', 'ROOM DIFFUSER', 'REED DIFFUSER', 'AIR FRESHENER',
      'SCENT DIFFUSER',
      // Kitchen
      'BAKING SET', 'COOKWARE', 'KITCHEN', 'SPATULA', 'LADLE', 'WHISK',
      'SILICONE AND WOOD SPOON', 'SILICONE SPOON', 'SILICONE SPATULA',
      'CHOPPING BOARD', 'PEELER', 'GRATER', 'COLANDER', 'SIEVE',
      'MEASURING CUP', 'ROLLING PIN', 'CAKE TIN', 'BAKING TIN',
      'ENAMEL MUG', 'MUG |', 'CUP |',
      // Tableware
      'PLACEMAT', 'TABLECLOTH', 'TABLE RUNNER', 'NAPKIN RING', 'COASTER',
      'SERVING TRAY', 'SERVING BOARD',
      // Bathroom
      'BATHROOM', 'TOILET', 'SOAP DISPENSER', 'TOOTHBRUSH HOLDER',
      'BATH MAT', 'SHOWER CURTAIN', 'TOWEL RAIL',
      // Kids furniture
      'KIDS CHAIR', 'KIDS TABLE', 'KIDS STOOL',
      // Storage & jars
      'GLASS JAR', 'STORAGE JAR', 'MASON JAR', 'KILNER JAR',
      // Lighting
      'LED LETTER LIGHT', 'MOTARRO LED', 'FAIRY LIGHT', 'STRING LIGHT',
      'NIGHT LIGHT', 'TABLE LAMP', 'BEDSIDE LAMP',
      // Home décor
      'HOME DECOR', 'HOME DÉCOR', 'WALL ART', 'PICTURE FRAME', 'PHOTO FRAME',
      'VASE', 'CUSHION COVER', 'THROW PILLOW', 'ARTIFICIAL FLOWER',
      'METAL DISPLAY STAND', 'DISPLAY STAND',
      // Cleaning
      'MOP', 'BROOM', 'DUSTPAN', 'CLEANING',
    ],
  },

  // ── Toys, Games & Novelty ────────────────────────────────────────────────────
  {
    category: 'toys-games-novelty',
    match: [
      'JENGA', 'PUZZLE', 'WOODEN PEG PUZZLE', 'FIDGET', 'SPINNER',
      'POP IT', 'POP IT GAME',
      'DIE CAST', 'DIECAST', 'TOY CAR', 'REMOTE CONTROL', 'RC CAR',
      'BUILDING BLOCK', 'LEGO', 'ACTION FIGURE', 'DOLL', 'PLUSH',
      'STUFFED TOY', 'TEDDY', 'BOARD GAME', 'CARD GAME', 'PLAYING CARD',
      'CHESS', 'CHECKERS', 'DOMINOES', 'YO-YO', 'SLINKY', 'KITE',
      'FRISBEE', 'WATER GUN', 'BUBBLE MACHINE', 'BUBBLE WAND',
      'KIDS COIN PURSE', 'NOVELTY',
    ],
  },

  // ── Events, Parties & Hospitality ────────────────────────────────────────────
  {
    category: 'events-hospitality',
    match: [
      'PARASOL', 'GLOWSTICK', 'GLOW STICK', 'GLOW BRACE',
      'PARTY BALLOON', 'BALLOON', 'CONFETTI', 'STREAMER', 'PARTY POPPER',
      'PARTY SUPPLY', 'PARTY PACK', 'TABLE DECORATION', 'PARTY DECOR',
      'FESTIVE', 'CHRISTMAS DECORATION', 'HALLOWEEN', 'BIRTHDAY',
      'HOSPITALITY', 'HOTEL AMENITY', 'AMENITY', 'MINIATURE SHAMPOO',
      'MINI SOAP',
    ],
  },

  // ── Hardware ─────────────────────────────────────────────────────────────────
  {
    category: 'hardware',
    match: [
      'TAPE MEASURE', 'CONAN TAPE MEASURE', 'CONAN LEATHER HOLE PUNCH',
      'CONAN SPRAY GUN', 'CONAN ',
      'SCREWDRIVER', 'WRENCH', 'SPANNER', 'HAMMER', 'PLIERS', 'PLIER ',
      'CHISEL', 'WOOD CHISEL',
      'UTILITY KNIFE', 'STANLEY KNIFE', 'BOX CUTTER',
      'SHIFTER', 'ADJUSTABLE WRENCH', 'SHIFTING SPANNER',
      'AUTO LOCK BLADE', 'SNAP OFF BLADE', 'RETRACTABLE BLADE',
      'SPRAY PAINT', 'PAINT SPRAY',
      'BATTERY', 'ALKALINE', 'ALKALINE BATTERY', 'AA BATTERY', 'AAA BATTERY',
      'VINNIC ALKALINE',
      'EARPHONE', 'EARBUDS', 'HEADPHONE', 'HOCO', 'USB CABLE', 'CHARGING CABLE',
      'POWER BANK', 'ADAPTER', 'EXTENSION CORD',
    ],
  },

  // ── Arts, Crafts & Stationery ────────────────────────────────────────────────
  {
    category: 'arts-crafts-stationery',
    match: [
      // Canvas & surfaces
      'CANVAS', 'CANVAS PANEL', 'CANVAS BOARD', 'CANVAS FRAME',
      'SUPAWOOD', 'MDF', 'WOODEN CRAFT', 'CRAFT TRAY', 'WOODEN TRAY',
      // Paints
      'ACRYLIC PAINT', 'METALLIC CRAFT PAINT', 'CRAFT PAINT', 'FABRIC PAINT',
      'FINGER PAINT', 'WATERCOLOUR', 'WATER COLOUR', 'GOUACHE', 'OIL PAINT',
      // Art tools
      'PALETTE KNIFE', 'PAINT BRUSH', 'ART BRUSH', 'PAINTING BRUSH',
      'PALETTE', 'EASEL', 'ART SUPPLY',
      // Craft materials
      'AIR CLAY', 'POLYMER CLAY', 'MODELLING CLAY', 'CRAZY CRAFTY CLAY',
      'EVA SPONGE', 'FOAM SHEET', 'CRAFT FOAM',
      'GLITTER', 'SEQUIN',
      'IRON ON PATCH', 'IRON-ON PATCH', 'HEAT TRANSFER',
      // Stationery — pens
      'BALLPOINT PEN', 'BALL POINT PEN', 'FOUNTAIN PEN', 'ROLLERBALL',
      'FELT TIP PEN', 'MARKER PEN', 'HIGHLIGHTER', 'FINELINER', 'FIBREPENS',
      'SCHNEIDER',
      // Stationery — pencils & erasers
      'PENCIL', 'MECHANICAL PENCIL', 'COLOURED PENCIL', 'COLOUR PENCIL',
      'ERASER', 'RUBBER ERASER', 'SHARPENER',
      // Stationery — books
      'NOTEBOOK', 'SKETCHBOOK', 'DIARY', 'JOURNAL', 'NOTEPAD',
      'EXERCISE BOOK', 'COMPOSITION BOOK',
      // Stationery — bags & cases
      'PENCIL BAG', 'PENCIL CASE', 'PENCIL BOX',
      // Stationery — instruments & tools
      'RULER', 'SET SQUARE', 'PROTRACTOR', 'COMPASS SET', 'MATH SET',
      'SCISSORS', 'CRAFT SCISSORS',
      // Adhesives
      'GLUE', 'CRAFT GLUE', 'PVA', 'HOT GLUE', 'MARLIN 50G EASY STICK',
      'EASY STICK', 'PRESS STICK',
      // Tape & fixing
      'TAPE DISPENSER', 'STICKY TAPE', 'MASKING TAPE',
      // Stamps & stickers
      'STAMP PAD', 'INK PAD', 'STAMP SET', 'RUBBER STAMP',
      'STICKER', 'CRAFT STICKER', 'LABEL', 'WASHI TAPE',
      // Laminating & binding
      'LAMINATING', 'LAMINATOR', 'LAMINATING POUCH', 'BINDING',
      // Clips & fasteners
      'FOLDBACK CLIP', 'BULLDOG CLIP', 'BINDER CLIP', 'PAPER CLIP',
      'STAPLER', 'STAPLE',
      // Learning aids
      'FLASH CARD', 'FLASH CARDS', 'ACTIVITY CARD',
      'PAGE MARKER', 'BOOKMARK',
      // Aprons
      'PAINTING APRON', 'ART APRON',
      // Paper & card
      'COPY PAPER', 'ROTATRIM', 'BUTTERFLY 160G', 'A4 ROTATRIM',
      // Ribbons (craft use)
      'FLORIST RIBBON', 'SATIN RIBBON', 'ORGANZA RIBBON', 'PETERSHAM RIBBON',
      'VELVET RIBBON', 'GROSGRAIN RIBBON', 'LACE RIBBON',
      'RIBBON SATIN', 'RIBBON ORGANZA', 'RIBBON PETERSHAM',
      // MOTARRO brand (all craft/stationery)
      'MOTARRO',
      // Marlin brand (stationery)
      'MARLIN ',
      // Protea branded
      'PROTEA PENCIL',
    ],
  },
];

// ─── Categorize a single product name ────────────────────────────────────────

function categorize(title) {
  const upper = title.toUpperCase();
  for (const rule of RULES) {
    for (const keyword of rule.match) {
      if (upper.includes(keyword.toUpperCase())) {
        return rule.category;
      }
    }
  }
  return 'uncategorized';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFetching products from Supabase...`);

  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('website_products')
      .select('barcode, title, active')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`Fetched ${rows.length} products (all, including inactive)\n`);

  // Categorize
  const updates = rows.map(r => ({ barcode: r.barcode, title: r.title, category: categorize(r.title) }));

  // Summary
  const counts = {};
  for (const u of updates) counts[u.category] = (counts[u.category] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  console.log('Category assignment preview:');
  for (const [cat, count] of sorted) {
    console.log(`  ${count.toString().padStart(5)}  ${cat}`);
  }

  // Show uncategorized samples
  const uncat = updates.filter(u => u.category === 'uncategorized').slice(0, 20);
  if (uncat.length) {
    console.log(`\nSample uncategorized products (add keywords to the script to fix):`);
    for (const u of uncat) console.log(`  ${u.title}`);
  }

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write to Supabase');
    return;
  }

  // Write to Supabase in batches
  console.log('\nWriting categories to Supabase...');
  const BATCH = 200;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) {
      const { error } = await supabase
        .from('website_products')
        .update({ category: u.category })
        .eq('barcode', u.barcode);
      if (error) console.error(`  Error updating ${u.barcode}:`, error.message);
    }
    done += batch.length;
    process.stdout.write(`\r  ${done}/${updates.length} updated...`);
  }
  console.log(`\nDone. ${updates.length} products categorized.`);
  console.log('\nRun "node scripts/invalidate-cache.js" or wait 60s for the edge cache to refresh.');
}

main().catch(err => { console.error(err); process.exit(1); });
