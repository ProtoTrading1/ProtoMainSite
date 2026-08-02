import {
  Baby,
  BookOpen,
  Church,
  Gem,
  Gift,
  GraduationCap,
  Home,
  Megaphone,
  Package,
  PackageOpen,
  Palette,
  PartyPopper,
  Pencil,
  Pill,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Tag,
  Truck,
} from 'lucide-react';

export const BUSINESS_TYPES = [
  'Retail store',
  'Online shop / e-commerce',
  'Wholesaler',
  'Importer / distributor',
  'Craft & hobby shop',
  'Gift & novelty store',
  'Pharmacy / health & beauty',
  'Hardware & home store',
  'Stationery & office supply',
  "Baby & children's store",
  'Fashion & clothing boutique',
  'Dollar / variety store',
  'Market trader / spaza shop',
  'School or institution',
  'Events, parties & décor',
  'Craft & bead shop',
  'Packaging supplier',
  'Educational supplier',
  'Religious / church store',
  'Promotional products',
  'Other',
];

export const BUSINESS_TYPE_ICONS = {
  'Retail store': ShoppingBag,
  'Online shop / e-commerce': ShoppingCart,
  Wholesaler: Package,
  'Importer / distributor': Truck,
  'Craft & hobby shop': Palette,
  'Gift & novelty store': Gift,
  'Pharmacy / health & beauty': Pill,
  'Hardware & home store': Home,
  'Stationery & office supply': Pencil,
  "Baby & children's store": Baby,
  'Fashion & clothing boutique': Shirt,
  'Dollar / variety store': Tag,
  'Market trader / spaza shop': ShoppingBasket,
  'School or institution': GraduationCap,
  'Events, parties & décor': PartyPopper,
  'Craft & bead shop': Gem,
  'Packaging supplier': PackageOpen,
  'Educational supplier': BookOpen,
  'Religious / church store': Church,
  'Promotional products': Megaphone,
  Other: Pencil,
};

/** Labels for register.proto.co.za only (standalone register host). */
export const REGISTER_BUSINESS_TYPES = BUSINESS_TYPES.map((type) => {
  if (type === 'Dollar / variety store') return 'General Dealer';
  if (type === 'Religious / church store') return 'Religious institution';
  return type;
});

export const REGISTER_BUSINESS_TYPE_ICONS = Object.fromEntries(
  REGISTER_BUSINESS_TYPES.map((type, index) => [type, BUSINESS_TYPE_ICONS[BUSINESS_TYPES[index]]]),
);

export const MONTHLY_SPEND_BANDS = [
  'R0 – R5,000',
  'R5,000 – R10,000',
  'R10,000 – R25,000',
  'R25,000 – R50,000',
  'R50,000+',
];
