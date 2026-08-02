import {
  Baby,
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
  'Art, craft & beads',
  'Stationery & educational products',
  'Gifts & novelty products',
  'Homeware & kitchenware',
  'Fashion & accessories',
  'Beauty & personal care',
  'Party, events & packaging',
  'Toys, baby & children',
  'Hardware',
  'Food & drinks',
  'Pet products',
  'Promotional products',
  'General merchandise / variety',
  'Other',
];

export const TRADING_CHANNELS = [
  'Physical retail store',
  'Online shop / e-commerce',
  'Market trader / spaza shop',
  'Wholesaler',
  'Importer / distributor',
  'School, church or institution',
  'Events / service business',
];

export const PRODUCT_CATEGORIES = BUSINESS_TYPES;

export const BUSINESS_TYPE_ICONS = {
  'Art, craft & beads': Palette,
  'Stationery & educational products': Pencil,
  'Gifts & novelty products': Gift,
  'Homeware & kitchenware': Home,
  'Fashion & accessories': Shirt,
  'Beauty & personal care': Pill,
  'Party, events & packaging': PartyPopper,
  'Toys, baby & children': Baby,
  Hardware: Home,
  'Food & drinks': ShoppingBasket,
  'Pet products': PackageOpen,
  'Promotional products': Megaphone,
  'General merchandise / variety': Tag,
  Other: Pencil,
};

export const TRADING_CHANNEL_ICONS = {
  'Physical retail store': ShoppingBag,
  'Online shop / e-commerce': ShoppingCart,
  'Market trader / spaza shop': ShoppingBasket,
  Wholesaler: Package,
  'Importer / distributor': Truck,
  'School, church or institution': GraduationCap,
  'Events / service business': PartyPopper,
};

/** Labels for register.proto.co.za only (standalone register host). */
export const REGISTER_BUSINESS_TYPES = BUSINESS_TYPES;

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
