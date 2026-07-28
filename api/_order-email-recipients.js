const DEFAULT_NOTIFY_EMAILS = [
  'george@proto.co.za',
  'online@proto.co.za',
  'danieljoffeinfo@gmail.com',
];

const REQUIRED_ORDER_EMAIL = 'online@proto.co.za';

export function resolveOrderNotifyRecipients(
  raw = process.env.ORDER_NOTIFY_EMAILS || process.env.ORDER_TO_EMAIL || '',
) {
  const emails = raw
    ? raw.split(',').map((part) => part.trim()).filter(Boolean)
    : DEFAULT_NOTIFY_EMAILS;

  // Configuration may customize the additional recipients, but the shared
  // operational mailbox must always receive every order.
  return [...new Set([...emails, REQUIRED_ORDER_EMAIL].map((email) => email.toLowerCase()))];
}
