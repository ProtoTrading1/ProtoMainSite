import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/danieljoffe/Desktop/Projects💻 /protoportal-main/.env.local', 'utf8');
const vars = Object.fromEntries(env.split('\n').filter(l=>l.includes('=')).map(l=>{const[k,...v]=l.split('=');return[k.trim(),v.join('=').trim()]}));
const sb = createClient(vars.VITE_STOCK_SUPABASE_URL, vars.VITE_STOCK_SUPABASE_KEY);

const KEYWORDS = [
  ['confectionery', ['COOKIE','NOUGAT','SWEET ','CANDY','CHOCOLATE','LOLLY','GUMMY','BISCUIT']],
  ['packaging', ['PVC PLASTIC RESEALABLE','ZIPLOCK','RESEALABLE PACKET','ORGANZA BAG','KRAFT BAG','GIFT BAG','BUBBLE WRAP','JEWELLERY DISPLAY TAG','MOTARRO FELT BAG']],
  ['beads-jewellery', ['WOOD PAINTED','WOOD RAW','SEEDBEAD','GLASS PEARL','GLASS CZECH','GLASS BEAD','CHANDELIER GLASS','NECKLACE','BRACELET','EARRING','PENDANT','BANGLE','BROOCH','METAL CLASP','CLASP','CRIMP','JUMP RING','METAL CHARM','JEWELLERY DISPLAY','FAUX SUEDE CORD','ELASTIC CORD','BEAD |','BEADS |','SEMI PRECIOUS','EARTH STONE','JEWELLERY TAG']],
  ['fashion-accessories', ['SCARVES','SCARF','SHAWL','LADIES BAG','HANDBAG','TOTE BAG','WALLET','COIN PURSE','LUGGAGE BAG','SUITCASE','FEDORA','BASEBALL CAP','BEANIE','HAIR CLIP','HAIR BAND','SCRUNCHIE','HEADBAND','SUNGLASSES','BAG STRAP','LADIES PURSE']],
  ['beauty-personal-care', ['SHAMPOO','CONDITIONER','BODY WASH','SHOWER GEL','HAND WASH','BODY LOTION','MOISTURISER','SUNSCREEN','LIP BALM','LIPSTICK','EYEBROW','EYESHADOW','FOUNDATION','MASCARA','MAKEUP','COSMETIC','NAIL POLISH','DEODORANT','PERFUME','PALETTE 0','MAKEUP BRUSH']],
  ['homeware-kitchen', ['CANDLE','VOTIVE','TEALIGHT','ROOM DEFUSER','ROOM DIFFUSER','BAKING SET','KITCHEN','PLACEMAT','TABLECLOTH','COASTER','GLASS JAR','LED LETTER LIGHT','MOTARRO LED','BATHROOM','SOAP DISPENSER','DISPLAY STAND','HOME DECOR']],
  ['toys-games-novelty', ['JENGA','PUZZLE','FIDGET','SPINNER','DIE CAST','DIECAST','TOY CAR','ACTION FIGURE','DOLL','BOARD GAME','CARD GAME','NOVELTY','KIDS COIN PURSE']],
  ['events-hospitality', ['PARASOL','GLOWSTICK','GLOW STICK','BALLOON','CONFETTI','STREAMER','PARTY','CHRISTMAS DECORATION','HOSPITALITY','AMENITY']],
  ['hardware', ['TAPE MEASURE','SCREWDRIVER','WRENCH','HAMMER','PLIERS','UTILITY KNIFE','SPRAY PAINT','BATTERY','ALKALINE','EARPHONE','EARBUDS','HEADPHONE','HOCO','USB CABLE','POWER BANK']],
  ['arts-crafts-stationery', ['CANVAS','SUPAWOOD','MDF','WOODEN CRAFT','ACRYLIC PAINT','METALLIC CRAFT PAINT','PALETTE KNIFE','AIR CLAY','EVA SPONGE','IRON ON PATCH','RIBBON','FLORIST RIBBON','BALLPOINT PEN','PENCIL','ERASER','NOTEBOOK','SKETCHBOOK','PENCIL BAG','PENCIL CASE','SCISSORS','GLUE','LAMINATING','FOLDBACK CLIP','STICKER','FLASH CARD','PAGE MARKER','PAINTING APRON','MOTARRO','PROTEA PENCIL']],
];

function cat(title) {
  const u = title.toUpperCase();
  for (const [c, kws] of KEYWORDS) for (const k of kws) if (u.includes(k.toUpperCase())) return c;
  return 'uncategorized';
}

const rows = [];
let from = 0;
while(true){
  const {data,error} = await sb.from('website_products').select('title').range(from, from+999);
  if(error) throw error;
  rows.push(...data);
  if(data.length < 1000) break;
  from += 1000;
}

const uncat = [...new Set(rows.filter(r => cat(r.title) === 'uncategorized').map(r => r.title))];

// Group by first word/token
const groups = {};
for (const t of uncat) {
  const key = t.split(/[\s|:]/)[0].trim();
  if (!groups[key]) groups[key] = [];
  groups[key].push(t);
}
const gs = Object.entries(groups).sort((a,b) => b[1].length - a[1].length).slice(0, 40);
console.log(`Total uncategorized unique titles: ${uncat.length}\n`);
console.log('Top uncategorized groups:');
for (const [k, titles] of gs) {
  console.log(`  ${titles.length.toString().padStart(4)}  ${k}`);
  // Show 2 examples
  for (const t of titles.slice(0, 2)) console.log(`           → ${t}`);
}
