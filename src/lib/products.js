import { supabase } from './supabase';

const PAGE_SIZE = 1000;
const DEFAULT_CATALOG_PAGE_SIZE = 60;

function adapt(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: Number(row.price_ex_vat),
    image: row.image_url || '',
    stockOnHand: row.stock_on_hand ?? 0,
    categoryPath: row.category_path || [],
    tags: row.tags || [],
    badges: row.badges || [],
    isNew: row.is_new,
    isSpecial: row.is_special,
    specialVisibility: row.special_visibility || 'all',
    isArchived: row.is_archived,
    sortOrder: row.sort_order ?? 0,
    minQty: row.min_qty || 1,
    casePack: row.case_pack || '',
    marginCue: row.margin_cue || '',
    leadTime: row.lead_time || '',
    tradeNote: row.trade_note || '',
    inStock: (row.stock_on_hand ?? 1) > 0,
    createdAt: row.created_at,
  };
}

function applyCollectionFilter(query, collection) {
  if (collection === 'hot') return query.contains('badges', ['Hot seller']);
  if (collection === 'new') return query.eq('is_new', true);
  if (collection === 'clearance') return query.eq('is_special', true);
  if (collection === 'instock') return query.gt('stock_on_hand', 0);
  if (collection === 'soldout') return query.eq('stock_on_hand', 0);
  return query;
}

function applySearchFilter(query, searchQuery) {
  const q = searchQuery?.trim();
  if (!q) return query;
  const safe = q.replace(/[%',()]/g, ' ').trim();
  if (!safe) return query;
  return query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`);
}

function applyPathFilter(query, path) {
  if (!Array.isArray(path) || path.length === 0) return query;
  return query.contains('category_path', path);
}

function applySort(query, sort) {
  if (sort === 'price-low') return query.order('price_ex_vat', { ascending: true }).order('sort_order', { ascending: true });
  if (sort === 'price-high') return query.order('price_ex_vat', { ascending: false }).order('sort_order', { ascending: true });
  if (sort === 'newest' || sort === 'latest') return query.order('created_at', { ascending: false });
  if (sort === 'code') return query.order('code', { ascending: true });
  if (sort === 'stock') return query.order('stock_on_hand', { ascending: false });
  return query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
}

async function fetchAllProductRows({ archived = null } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (archived !== null) query = query.eq('is_archived', archived);

    const { data, error } = await query;
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function fetchProducts() {
  const data = await fetchAllProductRows({ archived: false });
  return data.map(adapt);
}

export async function fetchProductPage({
  page = 1,
  pageSize = DEFAULT_CATALOG_PAGE_SIZE,
  searchQuery = '',
  categoryPath = [],
  collection = 'all',
  sort = 'featured',
} = {}) {
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('is_archived', false)
    .range(from, to);

  query = applyCollectionFilter(query, collection);
  query = applyPathFilter(query, categoryPath);
  query = applySearchFilter(query, searchQuery);
  query = applySort(query, sort);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    products: (data || []).map(adapt),
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > to + 1,
  };
}

export async function fetchCategoryCounts({ collection = 'all' } = {}) {
  const entries = [['', []]];
  for (const category of (await import('../data/categories.json')).default) {
    entries.push([category.id, [category.id]]);
    for (const child of category.children || []) {
      entries.push([[category.id, child.id].join('/'), [category.id, child.id]]);
    }
  }

  const results = await Promise.all(entries.map(async ([key, path]) => {
    let query = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false);
    query = applyCollectionFilter(query, collection);
    query = applyPathFilter(query, path);
    const { count, error } = await query;
    if (error) throw error;
    return [key, count || 0];
  }));

  return Object.fromEntries(results);
}

export async function fetchAllProductsAdmin() {
  const data = await fetchAllProductRows();
  return data.map(adapt);
}

export async function fetchAdminProductsPage({
  page = 1,
  pageSize = 50,
  searchQuery = '',
  mainCategory = 'all',
  includeArchived = false,
} = {}) {
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!includeArchived) query = query.eq('is_archived', false);
  if (mainCategory !== 'all') query = query.contains('category_path', [mainCategory]);
  query = applySearchFilter(query, searchQuery);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data || []).map(adapt), total: count || 0, page, pageSize };
}

export async function fetchProductsByMainCategory(mainCategory, { limit = 300 } = {}) {
  let query = supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (mainCategory && mainCategory !== 'all') query = query.contains('category_path', [mainCategory]);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(adapt);
}

export async function createProduct(fields) {
  const { data, error } = await supabase
    .from('products')
    .insert([toRow(fields)])
    .select()
    .single();
  if (error) throw error;
  return adapt(data);
}

export async function updateProduct(id, fields) {
  const { data, error } = await supabase
    .from('products')
    .update(toRow(fields))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return adapt(data);
}

export async function archiveProduct(id, archive = true) {
  const { error } = await supabase
    .from('products')
    .update({ is_archived: archive })
    .eq('id', id);
  if (error) throw error;
}

export async function setSpecial(id, isSpecial, visibility = 'all') {
  const { error } = await supabase
    .from('products')
    .update({ is_special: isSpecial, special_visibility: visibility })
    .eq('id', id);
  if (error) throw error;
}

export async function updateSortOrder(id, sortOrder) {
  const { error } = await supabase
    .from('products')
    .update({ sort_order: sortOrder })
    .eq('id', id);
  if (error) throw error;
}

export async function bulkUpsertProducts(rows) {
  const mapped = rows.map(toRow);
  const { data, error } = await supabase
    .from('products')
    .upsert(mapped, { onConflict: 'code' })
    .select();
  if (error) throw error;
  return (data || []).map(adapt);
}

export async function exportProductsCsv() {
  return fetchAllProductRows();
}

function toRow(f) {
  const row = {};
  if (f.code            !== undefined) row.code             = f.code;
  if (f.name            !== undefined) row.name             = f.name;
  if (f.price           !== undefined) row.price_ex_vat     = f.price;
  if (f.price_ex_vat    !== undefined) row.price_ex_vat     = f.price_ex_vat;
  if (f.image           !== undefined) row.image_url        = f.image;
  if (f.image_url       !== undefined) row.image_url        = f.image_url;
  if (f.stockOnHand     !== undefined) row.stock_on_hand    = f.stockOnHand;
  if (f.stock_on_hand   !== undefined) row.stock_on_hand    = f.stock_on_hand;
  if (f.categoryPath    !== undefined) row.category_path    = f.categoryPath;
  if (f.category_path   !== undefined) row.category_path    = f.category_path;
  if (f.tags            !== undefined) row.tags             = f.tags;
  if (f.badges          !== undefined) row.badges           = f.badges;
  if (f.isArchived      !== undefined) row.is_archived      = f.isArchived;
  if (f.is_archived     !== undefined) row.is_archived      = f.is_archived;
  if (f.isNew           !== undefined) row.is_new           = f.isNew;
  if (f.is_new          !== undefined) row.is_new           = f.is_new;
  if (f.isSpecial       !== undefined) row.is_special       = f.isSpecial;
  if (f.is_special      !== undefined) row.is_special       = f.is_special;
  if (f.specialVisibility !== undefined) row.special_visibility = f.specialVisibility;
  if (f.special_visibility !== undefined) row.special_visibility = f.special_visibility;
  if (f.sortOrder       !== undefined) row.sort_order       = f.sortOrder;
  if (f.sort_order      !== undefined) row.sort_order       = f.sort_order;
  if (f.minQty          !== undefined) row.min_qty          = f.minQty;
  if (f.min_qty         !== undefined) row.min_qty          = f.min_qty;
  if (f.casePack        !== undefined) row.case_pack        = f.casePack;
  if (f.case_pack       !== undefined) row.case_pack        = f.case_pack;
  if (f.marginCue       !== undefined) row.margin_cue       = f.marginCue;
  if (f.margin_cue      !== undefined) row.margin_cue       = f.margin_cue;
  if (f.leadTime        !== undefined) row.lead_time        = f.leadTime;
  if (f.lead_time       !== undefined) row.lead_time        = f.lead_time;
  if (f.tradeNote       !== undefined) row.trade_note       = f.tradeNote;
  if (f.trade_note      !== undefined) row.trade_note       = f.trade_note;
  return row;
}
