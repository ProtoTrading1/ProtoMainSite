import { escapeHtml } from './_escape-html.js';
import { resolveOrderNotifyRecipients } from './_order-email-recipients.js';
import {
  loadOrderForPdf,
} from './_order-pdf.js';
import { createNotificationQueue } from './_order-notification-queue.js';
import { getPortalAdminClient } from './_site-config.js';

const MAX_EMAIL_LINES = 250;

function clean(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function safeOrderEmailHtml({ order, customer, items, audience }) {
  const orderNumber = clean(order?.order_number, order?.id || 'Order');
  const customerName = clean(customer?.name || customer?.business_name, 'Trade customer');
  const rows = items.slice(0, MAX_EMAIL_LINES).map((item, index) => {
    const qty = Number(item?.finalQty ?? item?.qty ?? 0);
    return `<tr><td>${index + 1}</td><td>${escapeHtml(item?.code || item?.productId || '—')}</td><td>${escapeHtml(item?.name || 'Product')}</td><td>${escapeHtml(qty)}</td></tr>`;
  }).join('');
  const heading = audience === 'customer'
    ? `We received your order ${escapeHtml(orderNumber)}`
    : `New order ${escapeHtml(orderNumber)}`;
  return `<!doctype html><html><body><h2>${heading}</h2><p>Customer: <strong>${escapeHtml(customerName)}</strong></p><p>${items.length} product line${items.length === 1 ? '' : 's'}. The order PDF will be attached by the notification worker.</p><table><thead><tr><th>#</th><th>Code</th><th>Product</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export function buildOrderNotificationJobSpecs({
  order,
  customer,
  items,
  internalRecipients = resolveOrderNotifyRecipients(),
}) {
  if (!order?.id) throw new Error('A saved order is required');
  const orderId = String(order.id);
  const orderNumber = clean(order.order_number, orderId);
  const customerName = clean(customer?.name || customer?.business_name, 'Customer');
  const customerEmail = clean(customer?.email).toLowerCase();
  const recipients = [...new Set(internalRecipients.map((email) => clean(email).toLowerCase()).filter(Boolean))].sort();
  const basePayload = { orderId, orderNumber };
  const jobs = [{
    channel: 'pdf',
    recipient: 'system',
    recipientName: 'Order PDF',
    maxAttempts: 3,
    payload: basePayload,
  }];

  if (recipients.length) {
    jobs.push({
      channel: 'internal_email',
      recipient: recipients.join(','),
      recipientName: 'Proto Trading Orders',
      payload: {
        ...basePayload,
        to: recipients.map((email) => ({ email, name: 'Proto Trading Orders' })),
        subject: `New order ${orderNumber} — ${customerName}`,
        htmlContent: safeOrderEmailHtml({ order, customer, items, audience: 'internal' }),
        requiresPdf: true,
      },
    });
  }

  if (customerEmail) {
    jobs.push({
      channel: 'customer_email',
      recipient: customerEmail,
      recipientName: customerName,
      payload: {
        ...basePayload,
        to: { email: customerEmail, name: customerName },
        subject: `We received your Proto Trading order ${orderNumber}`,
        htmlContent: safeOrderEmailHtml({ order, customer, items, audience: 'customer' }),
        requiresPdf: true,
      },
    });
  }

  return jobs;
}

export async function enqueueOrderNotificationJobs(orderId) {
  if (!orderId) throw new Error('orderId is required');
  const { order, customer, items } = await loadOrderForPdf(String(orderId));
  const specs = buildOrderNotificationJobSpecs({
    order,
    customer,
    items,
    internalRecipients: resolveOrderNotifyRecipients(),
  });
  const queue = createNotificationQueue(getPortalAdminClient());
  return queue.enqueueNotificationBatch({
    orderId: String(orderId),
    jobs: specs,
  });
}
