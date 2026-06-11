import categories from '../data/categories.json';
import { labelToSlug } from './taxonomy';
import { invalidateAdminCache, invalidateProductCache } from './products';
import { supabaseStock } from './supabaseStock';

let _cache = null;

const CATEGORY_ICONS = {
  'Arts, Crafts & Stationery': 'PenTool',
  'Beads, Jewellery & Accessories': 'Scissors',
  'Beauty & Personal Care': 'Smile',
  'Events & Parties': 'Gift',
  'Fashion & Accessories': 'Shirt',
  'Food & Drinks': 'Cookie',
  Hardware: 'Wrench',
  'Homeware & Kitchen': 'Home',
  Motarro: 'Gem',
  Packaging: 'Package',
  Textiles: 'Wind',
  'Toys, Games & Kids': 'ToyBrick',
};

export const MAIN_CATEGORY_ICON_OPTIONS = [
  'PenTool', 'Scissors', 'Smile', 'Gift', 'Shirt', 'Cookie',
  'Wrench', 'Home', 'Gem', 'Package', 'Wind', 'ToyBrick',
];

function jsonFallback() {
  return categories.map((item, i) => ({
    id: item.id,
    label: item.label,
    icon: CATEGORY_ICONS[item.label] || 'Package',
    sort_order: i + 1,
  }));
}

export function invalidateTaxonomyCache() {
  _cache = null;
}

export async function fetchMainCategories() {
  if (_cache) return _cache;
  try {
    const { data, error } = await supabaseStock
      .from('main_categories')
      .select('id, label, icon, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (data?.length) {
      _cache = data;
      return data;
    }
  } catch {
    // Table may not exist until migration 012 is applied.
  }
  _cache = jsonFallback();
  return _cache;
}

export async function createMainCategory(label, icon = 'Package') {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Category name is required');
  const id = labelToSlug(trimmed);
  if (!id) throw new Error('Invalid category name');

  const { data: existing } = await supabaseStock
    .from('main_categories')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) throw new Error('A category with this name already exists');

  const { data: last } = await supabaseStock
    .from('main_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabaseStock
    .from('main_categories')
    .insert({ id, label: trimmed, icon, sort_order });
  if (error) throw error;
  invalidateTaxonomyCache();
  return { id, label: trimmed, icon, sort_order };
}

export async function renameMainCategory(id, newLabel) {
  const trimmed = newLabel.trim();
  if (!trimmed) throw new Error('Category name is required');

  const { data: row, error: fetchErr } = await supabaseStock
    .from('main_categories')
    .select('label')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const oldLabel = row.label;
  if (oldLabel === trimmed) return;

  const { error: updErr } = await supabaseStock
    .from('main_categories')
    .update({ label: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw updErr;

  const { error: stockErr } = await supabaseStock
    .from('website_stock')
    .update({ category: trimmed })
    .eq('category', oldLabel);
  if (stockErr) throw stockErr;

  const { error: archErr } = await supabaseStock
    .from('archived_products')
    .update({ category: trimmed })
    .eq('category', oldLabel);
  if (archErr) throw archErr;

  invalidateTaxonomyCache();
  invalidateProductCache();
  invalidateAdminCache();
}
