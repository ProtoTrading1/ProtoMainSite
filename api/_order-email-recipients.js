const DEFAULT_NOTIFY_EMAILS = [
  'george@proto.co.za',
  'online@proto.co.za',
  'danieljoffeinfo@gmail.com',
];

const REQUIRED_ORDER_EMAIL = 'online@proto.co.za';

export function resolveOrderNotifyRecipients(
  raw = process.env.ORDER_NOTIFY_EMAILS || process.env.ORDER_TO_EMAIL || '',
) {
  const extra = raw
    ? raw.split(',').map((part) => part.trim()).filter(Boolean)
    : [];

  // Every order must reach the whole team. Configuration may ADD recipients but
  // can never drop one of the required addresses — previously an
  // ORDER_NOTIFY_EMAILS value replaced the defaults entirely, so george@ and
  // danieljoffeinfo@ could silently stop receiving orders.
  return [...new Set(
    [...DEFAULT_NOTIFY_EMAILS, ...extra, REQUIRED_ORDER_EMAIL].map((email) => email.toLowerCase()),
  )];
}
