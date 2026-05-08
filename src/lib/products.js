import { supabase } from './supabase';

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

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(adapt);
}

export async function fetchAllProductsAdmin() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
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
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
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
