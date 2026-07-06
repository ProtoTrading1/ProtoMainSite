const ADMIN_PORTAL_URL = (process.env.ADMIN_PORTAL_URL || 'https://admin.proto.co.za').replace(/\/$/, '');

export function getTradeRegisterSecret() {
  return process.env.TRADE_REGISTER_SECRET
    || process.env.ORDER_NOTIFY_SECRET
    || '';
}

function adminHeaders(secret) {
  return {
    'Content-Type': 'application/json',
    'x-trade-register-secret': secret,
  };
}

async function postAdmin(path, payload) {
  const secret = getTradeRegisterSecret();
  if (!secret) {
    console.warn(`admin notify ${path}: TRADE_REGISTER_SECRET / ORDER_NOTIFY_SECRET not set`);
    return { ok: false, skipped: true };
  }

  try {
    const resp = await fetch(`${ADMIN_PORTAL_URL}${path}`, {
      method: 'POST',
      headers: adminHeaders(secret),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`admin notify ${path} error:`, resp.status, JSON.stringify(body));
      return { ok: false, status: resp.status, body };
    }
    return body;
  } catch (err) {
    console.error(`admin notify ${path} error:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** Notify admin portal to send the trade-application acknowledgment email (Brevo). */
export async function notifyTradeApplicationReceived({ email, name, businessName }) {
  return postAdmin('/api/trade-application-received', {
    email: String(email || '').trim().toLowerCase(),
    name: String(name || '').trim(),
    businessName: String(businessName || '').trim(),
  });
}

/** Notify admin portal to send the customer password reset email (Brevo Outgoing template). */
export async function notifyCustomerPasswordResetEmail({ email, resetLink, name }) {
  return postAdmin('/api/customer-password-reset-email', {
    email: String(email || '').trim().toLowerCase(),
    resetLink: String(resetLink || '').trim(),
    name: String(name || '').trim(),
  });
}

export function getPasswordResetBaseUrl(req) {
  const origin = String(req?.headers?.origin || req?.headers?.referer || '').toLowerCase();
  if (origin.includes('register.proto.co.za') || origin.includes('protoportal-register-')) {
    return (process.env.REGISTER_PORTAL_URL || 'https://register.proto.co.za').replace(/\/$/, '');
  }
  return (process.env.SITE_URL || 'https://site.proto.co.za').replace(/\/$/, '');
}
