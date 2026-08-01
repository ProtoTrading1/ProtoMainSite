# Order delivery safety rollout

This change has two independent safety layers:

1. Checkout fails closed unless `orders.client_ref` exists and is protected by
   a unique index. It never retries an insert after deleting the idempotency key.
2. A durable delivery-job ledger is available for a future worker, but is inert
   by default and has no historical backfill path.

## Required release order

1. Review `migrations/058_order_delivery_safety.sql` and apply it to the portal
   Supabase project. Applying it creates no jobs and sends nothing.
2. Call `order_delivery_schema_readiness()` with the server-side service role.
   Confirm `ready: true`, `clientRefColumn: true`, `clientRefUnique: true`, and
   `queueReady: true`.
3. Deploy the storefront code with `ORDER_DELIVERY_QUEUE_ENABLED` unset/false.
   Checkout idempotency is then fail-closed; notification behaviour is unchanged.
4. Build and preview a separately reviewed worker/admin contract. The worker
   must reconstruct delivery data from the stored order, use a provider
   idempotency key based on order and channel, call the lease completion/failure
   RPCs, alert on `dead`, and expose queue health in admin.
5. Record an activation timestamp after the worker is ready. Set all three:
   `ORDER_DELIVERY_QUEUE_ENABLED=true`,
   `ORDER_DELIVERY_QUEUE_WORKER_READY=true`, and
   `ORDER_DELIVERY_QUEUE_ACTIVATION_AT=<ISO timestamp>`.

## Non-negotiable boundaries

- Never enqueue by scanning `orders`.
- Never use a timestamp earlier than the controlled activation time.
- Never process a job whose order predates the activation time.
- Keep the unique `(order_id, channel)` constraint and provider idempotency key.
- Treat eight failed attempts as dead-letter state and alert a human.
- Do not delete successful/dead jobs; they are the audit trail.
- Roll back by disabling `ORDER_DELIVERY_QUEUE_ENABLED`; do not drop the ledger.

## Current gate

The repository intentionally contains no cron route and no delivery worker.
Until the admin/worker implementation has been previewed and both worker gates
are enabled, failed deliveries continue to appear in the existing notification
audit and require the existing manual resend path.
