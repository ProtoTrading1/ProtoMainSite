import {
  Cookie, Gem, Gift, Home, Layers, Package, PenTool, Shirt, Smile, ToyBrick, Wrench,
} from 'lucide-react';

// Maps the icon name string from categories.json → Lucide component
// Scissors (beads) overridden to Gem; Wind (textiles) overridden to Layers
export const LUCIDE_ICON_MAP = {
  PenTool,
  Scissors: Gem,
  Smile,
  Gift,
  Shirt,
  Cookie,
  Wrench,
  Home,
  Package,
  Wind: Layers,
  ToyBrick,
  Gem,
  Layers,
};

export const DEPT_COLORS = {
  'arts-crafts-stationery': '#7C3AED',
  'beads-jewellery': '#DB2777',
  'beauty-personal-care': '#059669',
  'events-parties': '#D97706',
  'fashion-accessories': '#2563EB',
  'food-drinks': '#EA580C',
  'hardware': '#475569',
  'homeware-kitchen': '#16A34A',
  'packaging': '#0891B2',
  'textiles': '#9333EA',
  'toys-games-kids': '#DC2626',
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
