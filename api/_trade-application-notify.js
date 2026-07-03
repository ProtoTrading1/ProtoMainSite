const ADMIN_TRADE_RECEIVED_URL = process.env.ADMIN_TRADE_RECEIVED_URL
  || 'https://admin.proto.co.za/api/trade-application-received';

export function getTradeRegisterSecret() {
  return process.env.TRADE_REGISTER_SECRET
    || process.env.ORDER_NOTIFY_SECRET
    || '';
}

/** Notify admin portal to send the trade-application acknowledgment email (Brevo). */
export async function notifyTradeApplicationReceived({ email, name, businessName }) {
  const secret = getTradeRegisterSecret();
  if (!secret) {
    console.warn('trade-application-received: TRADE_REGISTER_SECRET / ORDER_NOTIFY_SECRET not set');
    return { ok: false, skipped: true };
  }

  try {
    const resp = await fetch(ADMIN_TRADE_RECEIVED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trade-register-secret': secret,
      },
      body: JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        name: String(name || '').trim(),
        businessName: String(businessName || '').trim(),
      }),
    });

    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('trade-application-received error:', resp.status, JSON.stringify(body));
      return { ok: false, status: resp.status, body };
    }

    return body;
  } catch (err) {
    console.error('trade-application-received error:', err.message);
    return { ok: false, error: err.message };
  }
}
