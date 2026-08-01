export const ORDER_DELIVERY_CONTRACT_VERSION = 1;

const DELIVERY_CHANNELS = new Set(['team_email', 'customer_email', 'pdf']);

function truthy(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function clean(value) {
  return String(value ?? '').trim();
}

export class OrderDeliverySchemaError extends Error {
  constructor(message = 'Order capture safety checks are unavailable.') {
    super(message);
    this.name = 'OrderDeliverySchemaError';
    this.code = 'ORDER_CAPTURE_SCHEMA_NOT_READY';
    this.status = 503;
  }
}

export function isMissingClientRefSchema(error) {
  const message = clean(error?.message).toLowerCase();
  return message.includes('client_ref') && (
    error?.code === 'PGRST204'
    || error?.code === '42703'
    || message.includes('column')
    || message.includes('schema cache')
  );
}

export async function readOrderDeliveryReadiness(supabase) {
  try {
    const { data, error } = await supabase.rpc('order_delivery_schema_readiness');
    if (error) {
      return {
        ready: false,
        queueReady: false,
        contractVersion: 0,
        reason: clean(error.message) || 'Schema readiness contract is unavailable',
      };
    }

    const value = Array.isArray(data) ? data[0] : data;
    const contractVersion = Number(value?.contractVersion ?? value?.contract_version ?? 0);
    return {
      ready: value?.ready === true && contractVersion >= ORDER_DELIVERY_CONTRACT_VERSION,
      queueReady: value?.queueReady === true || value?.queue_ready === true,
      contractVersion,
      clientRefColumn: value?.clientRefColumn === true || value?.client_ref_column === true,
      clientRefUnique: value?.clientRefUnique === true || value?.client_ref_unique === true,
      reason: clean(value?.reason),
    };
  } catch (error) {
    return {
      ready: false,
      queueReady: false,
      contractVersion: 0,
      reason: clean(error?.message) || 'Schema readiness contract failed',
    };
  }
}

export async function assertOrderCaptureSchemaReady(supabase) {
  const readiness = await readOrderDeliveryReadiness(supabase);
  if (!readiness.ready) {
    throw new OrderDeliverySchemaError(
      'Ordering is temporarily unavailable while a safety check is completed. Your basket is safe — please try again shortly.',
    );
  }
  return readiness;
}

export function durableQueueGate(env = process.env) {
  const requested = truthy(env.ORDER_DELIVERY_QUEUE_ENABLED);
  const workerReady = truthy(env.ORDER_DELIVERY_QUEUE_WORKER_READY);
  const activationAt = Date.parse(clean(env.ORDER_DELIVERY_QUEUE_ACTIVATION_AT));
  const activationValid = Number.isFinite(activationAt);

  return {
    requested,
    workerReady,
    activationAt: activationValid ? new Date(activationAt).toISOString() : null,
    enabled: requested && workerReady && activationValid,
    reason: !requested
      ? 'disabled'
      : !workerReady
        ? 'worker-not-ready'
        : !activationValid
          ? 'activation-time-missing'
          : null,
  };
}

/**
 * Queue only failures from the order currently being submitted. There is no
 * table scan or historical backfill path here, and the activation timestamp is
 * a second guard against replaying orders that predate a controlled rollout.
 */
export async function enqueueFailedOrderDeliveries({
  supabase,
  orderId,
  orderCreatedAt,
  failures = [],
  env = process.env,
}) {
  const gate = durableQueueGate(env);
  if (!gate.enabled) return { queued: false, count: 0, reason: gate.reason };

  const createdAtMs = Date.parse(clean(orderCreatedAt));
  const activationMs = Date.parse(gate.activationAt);
  if (!Number.isFinite(createdAtMs) || createdAtMs < activationMs) {
    return { queued: false, count: 0, reason: 'order-before-activation' };
  }

  const uniqueChannels = [...new Set(failures
    .map((failure) => clean(failure?.channel))
    .filter((channel) => DELIVERY_CHANNELS.has(channel)))];
  if (!uniqueChannels.length) return { queued: false, count: 0, reason: 'no-failures' };

  const rows = uniqueChannels.map((channel) => ({
    order_id: clean(orderId),
    order_created_at: new Date(createdAtMs).toISOString(),
    channel,
    source: 'storefront-v2',
  }));
  const { error } = await supabase
    .from('order_delivery_jobs')
    .upsert(rows, { onConflict: 'order_id,channel', ignoreDuplicates: true });
  if (error) throw error;

  return { queued: true, count: rows.length, reason: null };
}
