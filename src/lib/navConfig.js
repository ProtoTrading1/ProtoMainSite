import {
  Brush, Gem, PartyPopper, Shirt, UtensilsCrossed, Hammer, Box, Scissors, Gamepad2, FlaskConical, Apple,
} from 'lucide-react';

// Maps the icon name string from categories.json → Lucide component
export const LUCIDE_ICON_MAP = {
  PenTool: Brush,           // arts & crafts → paint brush
  Scissors: Gem,            // beads & jewellery → gem stone
  Smile: FlaskConical,      // beauty & personal care → flask/cosmetics
  Gift: PartyPopper,        // events & parties → party popper
  Shirt,                    // fashion & accessories
  Cookie: Apple,            // food & drinks → apple
  Wrench: Hammer,           // hardware → hammer
  Home: UtensilsCrossed,    // homeware & kitchen → crossed utensils
  Package: Box,             // packaging → open box
  Wind: Scissors,           // textiles → scissors (fabric cutting)
  ToyBrick: Gamepad2,       // toys & games → gamepad
  Gem,
  Brush,
};

const BRAND_RED = '#7F1D1D';

export const DEPT_COLORS = {
  'arts-crafts-stationery': BRAND_RED,
  'beads-jewellery': BRAND_RED,
  'beauty-personal-care': BRAND_RED,
  'events-parties': BRAND_RED,
  'fashion-accessories': BRAND_RED,
  'food-drinks': BRAND_RED,
  'hardware': BRAND_RED,
  'homeware-kitchen': BRAND_RED,
  'packaging': BRAND_RED,
  'textiles': BRAND_RED,
  'toys-games-kids': BRAND_RED,
};

export const DEPT_DESCRIPTIONS = {
  'arts-crafts-stationery': 'Creative tools, stationery, and arts supplies for retailers and educators.',
  'beads-jewellery': 'Wholesale beads, cord, findings, and jewellery-making supplies.',
  'beauty-personal-care': 'Cosmetics, beauty tools, hair care, and personal care wholesale lines.',
  'events-parties': 'Party supplies, decorations, costumes, and seasonal event essentials.',
  'fashion-accessories': 'Bags, wallets, scarves, sunglasses, and fashion wholesale.',
  'food-drinks': 'Snacks, beverages, confectionery, and pantry staples.',
  'hardware': 'Tools, electrical accessories, and general hardware lines.',
  'homeware-kitchen': 'Kitchen tools, home decor, and household essentials.',
  'packaging': 'Gift packaging, retail bags, display solutions, and storage.',
  'textiles': 'Fabrics, ribbons, lace, sewing accessories, and textile supplies.',
  'toys-games-kids': 'Toys, games, novelties, and pocket-money lines for retail.',
};

export const USE_CASES = {
  'arts-crafts-stationery': [
    { label: 'Notebooks & Paper', path: ['arts-crafts-stationery', 'notebooks-paper'] },
    { label: 'Paint & Brushes', path: ['arts-crafts-stationery', 'paint-brushes'] },
    { label: 'Pens & Markers', path: ['arts-crafts-stationery', 'pens-markers-pencils'] },
    { label: 'School Supplies', path: ['arts-crafts-stationery', 'school-essentials'] },
  ],
  'beads-jewellery': [
    { label: 'Seed Bead Projects', path: ['beads-jewellery', 'seed-beads'] },
    { label: 'Glass Beads', path: ['beads-jewellery', 'glass-beads'] },
    { label: 'Acrylic Beads', path: ['beads-jewellery', 'acrylic-plastic-beads'] },
    { label: 'Pendants & Charms', path: ['beads-jewellery', 'pendants-charms'] },
    { label: 'Elastic & Cord', path: ['beads-jewellery', 'elastic-cord-wire'] },
  ],
  'beauty-personal-care': [
    { label: 'Cosmetics', path: ['beauty-personal-care', 'cosmetics'] },
    { label: 'Beauty Tools', path: ['beauty-personal-care', 'beauty-tools'] },
    { label: 'Hair Care', path: ['beauty-personal-care', 'hair-care'] },
    { label: 'Skin & Body', path: ['beauty-personal-care', 'skin-body-care'] },
    { label: 'Travel Toiletry', path: ['beauty-personal-care', 'travel-toiletry'] },
  ],
  'events-parties': [
    { label: 'Party Decor', path: ['events-parties', 'party-decor'] },
    { label: 'Costume & Novelty', path: ['events-parties', 'costume-novelty'] },
  ],
  'fashion-accessories': [
    { label: 'Wallets & Purses', path: ['fashion-accessories', 'wallets-purses'] },
    { label: 'Scarves & Wraps', path: ['fashion-accessories', 'scarves-wraps'] },
    { label: 'Sunglasses', path: ['fashion-accessories', 'sunglasses-accessories'] },
  ],
  'food-drinks': [
    { label: 'Snacks', path: ['food-drinks', 'snacks'] },
    { label: 'Drinks & Coffee', path: ['food-drinks', 'drinks-coffee'] },
    { label: 'Pantry & Spices', path: ['food-drinks', 'pantry-spices'] },
  ],
  'hardware': [
    { label: 'Tools', path: ['hardware', 'tools'] },
    { label: 'Electrical', path: ['hardware', 'electrical-accessories'] },
  ],
  'homeware-kitchen': [
    { label: 'Kitchen Tools', path: ['homeware-kitchen', 'kitchen-tools'] },
    { label: 'Home Decor', path: ['homeware-kitchen', 'decor-household'] },
  ],
  'packaging': [
    { label: 'Gift Boxes', path: ['packaging', 'gift-boxes'] },
    { label: 'Display Packaging', path: ['packaging', 'display-packaging'] },
  ],
  'textiles': [
    { label: 'Fabric & Felt', path: ['textiles', 'fabric-felt'] },
    { label: 'Sewing Supplies', path: ['textiles', 'sewing-accessories'] },
  ],
  'toys-games-kids': [
    { label: 'Pocket Money Toys', path: ['toys-games-kids', 'pocket-money-toys'] },
  ],
};
