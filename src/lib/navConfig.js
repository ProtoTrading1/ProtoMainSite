import {
  Brush, Gem, PartyPopper, Shirt, UtensilsCrossed, Hammer, Box, Scissors, Gamepad2, FlaskConical, Apple,
} from 'lucide-react';
import categories from '../data/categories.json';

// Maps the icon name string from categories.json → Lucide component.
// (lucide-react in this project doesn't ship every name, so we remap to ones it has.)
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
  Gem,                      // motarro
  Brush,
};

const BRAND_RED = '#7F1D1D';

// All department styling/labels are now derived from categories.json so the
// site, admin, and nav can never drift from the imported taxonomy.
export const DEPT_COLORS = Object.fromEntries(categories.map((c) => [c.id, BRAND_RED]));

export const DEPT_DESCRIPTIONS = Object.fromEntries(
  categories.map((c) => [c.id, c.description || ''])
);

// Quick-link shortcuts per department: up to the first 5 subcategories.
export const USE_CASES = Object.fromEntries(
  categories.map((c) => [
    c.id,
    (c.children || []).slice(0, 5).map((child) => ({
      label: child.label,
      path: [c.id, child.id],
    })),
  ])
);
