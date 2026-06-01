// Theme card configuration per department.
// Each card drives a visual merchandising tile on the L1 category landing page.
// path: navigation destination. badge: null | 'Hot' | 'Popular' | 'Best Seller' | 'Seasonal'
export const DEPT_THEME_CARDS = {
  'arts-crafts-stationery': [
    { id: 'back-to-school', title: 'Back To School', subtitle: 'Stationery, craft supplies and classroom essentials', badge: 'Seasonal', path: ['arts-crafts-stationery', 'school-essentials'] },
    { id: 'craft-projects', title: 'Craft Projects', subtitle: 'Paint, brushes and creative art supplies', badge: null, path: ['arts-crafts-stationery', 'paint-brushes'] },
    { id: 'writing-stationery', title: 'Writing & Stationery', subtitle: 'Notebooks, pens, markers and desk supplies', badge: 'Popular', path: ['arts-crafts-stationery', 'notebooks-paper'] },
    { id: 'art-room', title: 'Art Room Essentials', subtitle: 'Wholesale supplies for schools and educators', badge: null, path: ['arts-crafts-stationery', 'school-essentials'] },
  ],
  'beads-jewellery': [
    { id: 'jewellery-making', title: 'Jewellery Making', subtitle: 'Beads, findings, stringing materials and tools', badge: 'Best Seller', path: ['beads-jewellery', 'jewellery-tools'] },
    { id: 'seed-bead-projects', title: 'Seed Bead Projects', subtitle: 'Opaque, transparent and mixed seed beads', badge: null, path: ['beads-jewellery', 'seed-beads'] },
    { id: 'glass-crystal', title: 'Glass & Crystal', subtitle: 'Faceted, Czech and pearlised glass beads', badge: 'Popular', path: ['beads-jewellery', 'glass-beads'] },
    { id: 'charms-pendants', title: 'Charms & Pendants', subtitle: 'Metal charms and decorative pendants wholesale', badge: null, path: ['beads-jewellery', 'pendants-charms'] },
  ],
  'beauty-personal-care': [
    { id: 'makeup-wholesale', title: 'Makeup Wholesale', subtitle: 'Cosmetics, tools and beauty lines for retail', badge: 'Hot', path: ['beauty-personal-care', 'cosmetics'] },
    { id: 'hair-care', title: 'Hair Care Range', subtitle: 'Combs, tools and styling accessories wholesale', badge: null, path: ['beauty-personal-care', 'hair-care'] },
    { id: 'beauty-tools', title: 'Beauty Tools', subtitle: 'Brushes, sponges and professional tools', badge: 'Popular', path: ['beauty-personal-care', 'beauty-tools'] },
    { id: 'skin-body', title: 'Skin & Body Care', subtitle: 'Creams, lotions and face care wholesale', badge: null, path: ['beauty-personal-care', 'skin-body-care'] },
  ],
  'events-parties': [
    { id: 'party-essentials', title: 'Party Essentials', subtitle: 'Décor, balloons and event supplies wholesale', badge: 'Popular', path: ['events-parties', 'party-decor'] },
    { id: 'costume-dress-up', title: 'Costume & Dress-Up', subtitle: 'Masks, glasses and novelty accessories', badge: null, path: ['events-parties', 'costume-novelty'] },
    { id: 'seasonal-festive', title: 'Seasonal Events', subtitle: 'Holiday and seasonal event collections', badge: 'Seasonal', path: ['events-parties'] },
    { id: 'kids-party', title: "Kids' Party", subtitle: 'Fun décor and supplies for children\'s parties', badge: null, path: ['events-parties', 'party-decor'] },
  ],
  'fashion-accessories': [
    { id: 'bags-wallets', title: 'Bags & Wallets', subtitle: 'Ladies wallets, coin purses and card holders', badge: 'Best Seller', path: ['fashion-accessories', 'wallets-purses'] },
    { id: 'scarves-wraps', title: 'Scarves & Wraps', subtitle: 'Fashion and printed scarves for retail', badge: null, path: ['fashion-accessories', 'scarves-wraps'] },
    { id: 'sun-shades', title: 'Sun & Shades', subtitle: 'Sunglasses and eyewear accessories wholesale', badge: 'Popular', path: ['fashion-accessories', 'sunglasses-accessories'] },
    { id: 'fashion-retail', title: 'Fashion Wholesale', subtitle: 'Accessories for gift shops and boutiques', badge: null, path: ['fashion-accessories'] },
  ],
  'food-drinks': [
    { id: 'snacks-treats', title: 'Snacks & Treats', subtitle: 'Biscuits, crackers and confectionery wholesale', badge: 'Popular', path: ['food-drinks', 'snacks'] },
    { id: 'drinks-coffee', title: 'Drinks & Coffee', subtitle: 'Beverages and hot drink wholesale lines', badge: null, path: ['food-drinks', 'drinks-coffee'] },
    { id: 'pantry-staples', title: 'Pantry Staples', subtitle: 'Condiments, spices and pantry essentials', badge: null, path: ['food-drinks', 'pantry-spices'] },
    { id: 'retail-sweets', title: 'Retail Confectionery', subtitle: 'Pocket-friendly sweets for retail display', badge: 'Hot', path: ['food-drinks'] },
  ],
  'hardware': [
    { id: 'hand-tools', title: 'Hand Tools', subtitle: 'Screwdrivers, pliers and measuring tools', badge: 'Popular', path: ['hardware', 'tools'] },
    { id: 'electrical', title: 'Electrical Accessories', subtitle: 'Cables, batteries and electrical supplies', badge: null, path: ['hardware', 'electrical-accessories'] },
    { id: 'trade-essentials', title: 'Trade Essentials', subtitle: 'Quality tools and hardware for resale', badge: null, path: ['hardware'] },
  ],
  'homeware-kitchen': [
    { id: 'kitchen-tools', title: 'Kitchen Tools', subtitle: 'Utensils, gadgets and kitchen accessories', badge: 'Popular', path: ['homeware-kitchen', 'kitchen-tools'] },
    { id: 'home-decor', title: 'Home Décor', subtitle: 'Mats, decor and household essentials', badge: null, path: ['homeware-kitchen', 'decor-household'] },
    { id: 'home-retail', title: 'Home Retail Lines', subtitle: 'Homeware collections for independent retailers', badge: 'Hot', path: ['homeware-kitchen'] },
  ],
  'packaging': [
    { id: 'gift-packaging', title: 'Gift Packaging', subtitle: 'Bags, ribbon, tags and boxes for retail gifting', badge: 'Best Seller', path: ['packaging', 'gift-boxes'] },
    { id: 'retail-display', title: 'Retail Display', subtitle: 'Display cards, hang tabs and packaging', badge: null, path: ['packaging', 'display-packaging'] },
    { id: 'florist-packaging', title: 'Florist & Events', subtitle: 'Premium packaging for florists and events', badge: 'Popular', path: ['packaging'] },
    { id: 'wholesale-boxes', title: 'Wholesale Boxes', subtitle: 'Paper boxes and window boxes for gifting', badge: null, path: ['packaging', 'gift-boxes'] },
  ],
  'textiles': [
    { id: 'fabric-felt', title: 'Fabric & Felt', subtitle: 'Lace, fabric pieces and textile supplies', badge: 'Popular', path: ['textiles', 'fabric-felt'] },
    { id: 'sewing-accessories', title: 'Sewing Supplies', subtitle: 'Measuring tape and sewing accessories', badge: null, path: ['textiles', 'sewing-accessories'] },
    { id: 'ribbons-trims', title: 'Ribbons & Trims', subtitle: 'Decorative ribbon and textile trim wholesale', badge: null, path: ['textiles'] },
  ],
  'toys-games-kids': [
    { id: 'pocket-money', title: 'Pocket Money Toys', subtitle: 'Novelty toys for retail display and gifting', badge: 'Best Seller', path: ['toys-games-kids', 'pocket-money-toys'] },
    { id: 'kids-play', title: 'Kids Play', subtitle: 'Educational and entertainment toys wholesale', badge: 'Popular', path: ['toys-games-kids'] },
    { id: 'novelty-fun', title: 'Novelty & Fun', subtitle: 'Pocket-friendly novelty items for shops', badge: 'Hot', path: ['toys-games-kids'] },
  ],
};
