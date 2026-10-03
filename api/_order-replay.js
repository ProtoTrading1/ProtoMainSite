import { createHash, randomUUID } from 'node:crypto';
import { normalizeItemPreference } from '../lib/item-preference.mjs';
import { normaliseStockQty, normaliseUnitPrice } from '../lib/order-stock-guard.mjs';

export class OrderReplayError extends Error {
  constructor(message, code = 'ORDER_REFERENCE_CONFLICT', status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// Hash the original customer intent, not today's freshly resolved prices or
// stock. Cosmetic browser titles/images/prices never become server authority.
export function checkoutRequestHash({ items, deliveryMethod, customerNotes, promoCode }) {
  if (!Array.isArray(items) || !items.length || items.length > 250) {
    throw new OrderReplayError('Invalid order lines.', 'INVALID_ORDER_ITEMS', 400);
  }
  const intent = {
    version: 1,
    deliveryMethod: clean(deliveryMethod),
    customerNotes: clean(customerNotes),
    promoCode: clean(promoCode).toUpperCase(),
    items: items.map((item) => {
      const product = item?.product || {};
      const qty = Number(item?.qty);
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100000) {
        throw new OrderReplayError('Invalid order quantity.', 'INVALID_ORDER_ITEMS', 400);
      }
      return {
        sku: clean(product.sku || product.id).toUpperCase(),
        barcode: clean(product.code || product.barcode),
        instore: product.isExtendedRange === true,
        qty,
        preference: normalizeItemPreference(item?.preference),
        snapshot: {
          unitPrice: normaliseUnitPrice(product.checkoutSnapshot?.unitPrice),
          stockQty: normaliseStockQty(product.checkoutSnapshot?.stockQty),
        },
      };
    }),
  };
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex');
}

export async function assertOrderReplaySchemaReady(portal) {
  const { data, error } = await portal.rpc('order_replay_schema_readiness');
  if (error || data?.contractVersion !== 1 || data?.ready !== true) {
    throw new OrderReplayError(
      'Ordering is temporarily unavailable while duplicate-order protection is restored. Your basket is safe — please try again shortly.',
      'ORDER_REPLAY_SCHEMA_NOT_READY', 503,
    );
  }
}

export function assertMatchingOrder(order, requestHash) {
  if (order.checkout_request_hash !== requestHash || order.checkout_notification_snapshot?.version !== 1) {
    throw new OrderReplayError('This checkout reference already belongs to a different or older order. Please review your orders before submitting again.');
  }
  return order;
}

export async function findMatchingOrder(portal, customerId, clientRef, requestHash) {
  const { data, error } = await portal.from('orders').select('*')
    .eq('customer_id', customerId).eq('client_ref', clientRef).maybeSingle();
  if (error) throw new OrderReplayError('Your previous checkout could not be verified. Please try again.', 'ORDER_REPLAY_LOOKUP_FAILED', 503);
  return data ? assertMatchingOrder(data, requestHash) : null;
}

// A durable channel claim precedes every side effect. A concurrent owner gets
// pending; a completed channel returns its stored result without sending again.
// Uncertain sends are retried only inside the provider's conservative window.
export async function deliverOrderChannel(portal, orderId, channel, send) {
  const worker = randomUUID();
  let claimResponse;
  try {
    claimResponse = await portal.rpc('claim_storefront_order_delivery', {
      p_order_id: orderId, p_channel: channel, p_worker: worker,
    });
  } catch {
    return { pending: true, error: 'Delivery safety checks are temporarily unavailable.' };
  }
  const { data: claim, error } = claimResponse;
  if (error || !claim) return { pending: true, error: 'Delivery safety checks are temporarily unavailable.' };
  if (!claim.claimed) return claim.result || { pending: true, error: claim.reason || 'Delivery is already being processed.' };
  let result;
  try {
    result = await send(claim.providerKey);
  } catch (error) {
    result = { ok: false, sent: false, error: error?.message || 'Delivery failed' };
  }
  // This channel includes the existing fulfilment handover. A stored PDF with
  // failed team delivery must remain retryable so handover runs after recovery.
  const succeeded = channel === 'pdf' ? result?.pdfStored === true && result?.ok === true : result?.ok === true || result?.sent === true;
  let completion;
  try {
    completion = await portal.rpc('finish_storefront_order_delivery', {
      p_order_id: orderId, p_channel: channel, p_worker: worker,
      p_succeeded: succeeded, p_result: result,
    });
  } catch {
    return { pending: true, error: 'Delivery acknowledgement is awaiting reconciliation.' };
  }
  const { data: recorded, error: recordError } = completion;
  // An accepted provider response with a failed DB acknowledgement remains an
  // uncertain lease. Do not mark it failed and allow an immediate second send.
  if (recordError || recorded !== true) return { pending: true, error: 'Delivery acknowledgement is awaiting reconciliation.' };
  return result;
}
