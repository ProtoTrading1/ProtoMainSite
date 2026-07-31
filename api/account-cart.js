import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';

const MAX_LINES = 250;
const MAX_QTY = 9999;
const MAX_IDENTIFIER_LENGTH = 160;
const MIN_ACTIVITY_AT = Date.UTC(2000, 0, 1);
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const CART_COLUMNS = 'items, activity_at, revision';

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifierText(value, fieldName) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) {
    throw inputError(`Basket product ${fieldName} must be text`);
  }
  const result = String(value).trim();
  if (!result) return '';
  if (result.length > MAX_IDENTIFIER_LENGTH) {
    throw inputError(`Basket product ${fieldName} is too long`);
  }
  return result;
}

function productIdentifiers(item) {
  if (!isObject(item) || !isObject(item.product)) {
    throw inputError('Every basket line must contain a product');
  }
  const id = identifierText(item.product.id, 'id');
  const sku = identifierText(item.product.sku, 'sku');
  const code = identifierText(item.product.code, 'code');
  const primary = id || sku || code;
  if (!primary) throw inputError('Every basket line must contain a product identifier');
  return { id, sku, code, primary };
}

export function canonicalItemKey(item) {
  try {
    return productIdentifiers(item).primary.toUpperCase();
  } catch {
    return '';
  }
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).slice(0, max);
}

function cleanNumber(value, { minimum = Number.NEGATIVE_INFINITY, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum ? numeric : fallback;
}

function sanitizeProduct(product, identifiers) {
  const primary = identifiers.primary;
  return {
    id: identifiers.id || primary,
    sku: identifiers.sku || primary,
    code: identifiers.code || primary,
    name: cleanText(product.name, 500),
    price: cleanNumber(product.price, { minimum: 0, fallback: 0 }),
    image: cleanText(product.image, 1500),
    localImage: cleanText(product.localImage, 1500),
    barcode: cleanText(product.barcode, 160),
    stockOnHand: cleanNumber(product.stockOnHand),
    stockQty: cleanNumber(product.stockQty),
    inStock: product.inStock !== false,
    toOrder: product.toOrder === true,
    to_order: product.to_order === true,
  };
}

function validateItems(value) {
  if (!Array.isArray(value)) throw inputError('Basket items must be an array');
  if (value.length > MAX_LINES) {
    throw inputError(`A basket can contain at most ${MAX_LINES} product lines`, 413);
  }

  const seen = new Set();
  return value.map((raw) => {
    const identifiers = productIdentifiers(raw);
    const key = identifiers.primary.toUpperCase();
    if (seen.has(key)) throw inputError(`Duplicate basket product: ${identifiers.primary}`);
    seen.add(key);

    if (!Number.isSafeInteger(raw.qty) || raw.qty < 1 || raw.qty > MAX_QTY) {
      throw inputError(`Basket quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    return { product: sanitizeProduct(raw.product, identifiers), qty: raw.qty };
  });
}

function validateRevision(value, required) {
  if (!required && value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw inputError('Basket revision must be a non-negative whole number');
  }
  return value;
}

function validateActivityAt(value, { required, now }) {
  if ((value === undefined || value === null) && !required) return null;
  if (!Number.isSafeInteger(value)
    || value < MIN_ACTIVITY_AT
    || value > now + MAX_CLOCK_SKEW_MS) {
    throw inputError('Basket activity time is invalid');
  }
  return value;
}

export function parseCartMutation(body, { method = 'PUT', now = Date.now() } = {}) {
  if (!isObject(body)) throw inputError('A JSON basket payload is required');
  if (!Number.isSafeInteger(now) || now < MIN_ACTIVITY_AT) {
    throw new TypeError('A valid current time is required');
  }

  if (method === 'DELETE') {
    return {
      mode: 'clear',
      items: [],
      revision: validateRevision(body.revision, true),
      activityAt: validateActivityAt(body.activityAt, { required: true, now }),
    };
  }
  if (method !== 'PUT') throw new TypeError('Unsupported basket mutation method');
  if (body.mode !== 'merge' && body.mode !== 'save') {
    throw inputError('Basket mode must be merge or save');
  }

  const items = validateItems(body.items);
  return {
    mode: body.mode,
    items,
    revision: validateRevision(body.revision, body.mode === 'save'),
    activityAt: validateActivityAt(body.activityAt, {
      required: body.mode === 'save' || items.length > 0,
      now,
    }),
  };
}

function storedActivityAt(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= MIN_ACTIVITY_AT ? numeric : null;
}

export function cartPayload(row) {
  return {
    items: row?.items === undefined || row?.items === null ? [] : validateItems(row.items),
    activityAt: storedActivityAt(row?.activity_at),
    revision: Number.isSafeInteger(Number(row?.revision)) && Number(row?.revision) >= 0
      ? Number(row.revision)
      : 0,
  };
}

export function resolveWholeCart(currentRow, incomingItems, incomingActivityAt) {
  const current = cartPayload(currentRow);
  if (!currentRow) return { items: incomingItems, activityAt: incomingActivityAt, changed: true };

  const incomingIsNewer = incomingActivityAt !== null
    && (current.activityAt === null || incomingActivityAt > current.activityAt);
  if (!incomingIsNewer) {
    return { items: current.items, activityAt: current.activityAt, changed: false };
  }
  return { items: incomingItems, activityAt: incomingActivityAt, changed: true };
}

function logDataError(operation, error) {
  console.error(`account-cart ${operation} failed:`, error?.code || error?.message || 'unknown error');
}

async function loadCurrentCart(supabase, customerId) {
  return supabase.from('customer_account_carts')
    .select(CART_COLUMNS).eq('customer_id', customerId).maybeSingle();
}

async function sendFreshConflict(supabase, customerId, res) {
  const { data, error } = await loadCurrentCart(supabase, customerId);
  if (error) {
    logDataError('conflict reload', error);
    return res.status(503).json({ error: 'Account basket is temporarily unavailable' });
  }
  return res.status(409).json({
    error: 'A newer account basket is available',
    ...cartPayload(data),
  });
}

async function writeSnapshot({
  supabase,
  customerId,
  currentRow,
  expectedRevision,
  items,
  activityAt,
  res,
}) {
  const nextRevision = expectedRevision + 1;
  const values = {
    items,
    activity_at: activityAt,
    revision: nextRevision,
    updated_at: new Date().toISOString(),
  };

  if (!currentRow) {
    const { data, error } = await supabase.from('customer_account_carts').insert({
      customer_id: customerId,
      ...values,
    }).select(CART_COLUMNS).single();
    if (!error) return res.status(200).json(cartPayload(data));
    if (error.code === '23505') return sendFreshConflict(supabase, customerId, res);
    logDataError('insert', error);
    return res.status(503).json({ error: 'Account basket could not be saved' });
  }

  const { data, error } = await supabase.from('customer_account_carts')
    .update(values)
    .eq('customer_id', customerId)
    .eq('revision', expectedRevision)
    .select(CART_COLUMNS)
    .maybeSingle();
  if (error) {
    logDataError('update', error);
    return res.status(503).json({ error: 'Account basket could not be saved' });
  }
  if (!data) return sendFreshConflict(supabase, customerId, res);
  return res.status(200).json(cartPayload(data));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');

  const approved = await requireApprovedCustomer(req, res);
  if (!approved) return;
  const customerId = approved.user.id;
  const supabase = serviceClient();

  if (req.method === 'GET') {
    const { data, error } = await loadCurrentCart(supabase, customerId);
    if (error) {
      logDataError('load', error);
      return res.status(503).json({ error: 'Account basket could not be loaded' });
    }
    return res.status(200).json(cartPayload(data));
  }

  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let mutation;
  try {
    mutation = parseCartMutation(req.body, { method: req.method });
  } catch (error) {
    return res.status(error?.status || 400).json({ error: error?.message || 'Invalid basket payload' });
  }

  const { data: current, error: readError } = await loadCurrentCart(supabase, customerId);
  if (readError) {
    logDataError('load before save', readError);
    return res.status(503).json({ error: 'Account basket could not be loaded' });
  }
  const currentPayload = cartPayload(current);

  if (mutation.mode !== 'merge' && mutation.revision !== currentPayload.revision) {
    return res.status(409).json({
      error: 'A newer account basket is available',
      ...currentPayload,
    });
  }

  const resolved = mutation.mode === 'merge'
    ? resolveWholeCart(current, mutation.items, mutation.activityAt)
    : { items: mutation.items, activityAt: mutation.activityAt, changed: true };
  if (!resolved.changed) return res.status(200).json(currentPayload);

  return writeSnapshot({
    supabase,
    customerId,
    currentRow: current,
    expectedRevision: currentPayload.revision,
    items: resolved.items,
    activityAt: resolved.activityAt,
    res,
  });
}
