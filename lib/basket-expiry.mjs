export const INITIAL_BASKET_DAYS = 7;
export const EXTENSION_DAYS = 3;
export const THREE_DAY_MS = 3 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_MS = INITIAL_BASKET_DAYS * ONE_DAY_MS;

function timestamp(value) {
  if (!value) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function iso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function hasItems(items) {
  return Array.isArray(items) && items.length > 0;
}

export function basketLifecycle(row = {}, now = Date.now()) {
  const activityMs = Number.isFinite(Number(row.activity_at)) ? Number(row.activity_at) : null;
  const startedMs = timestamp(row.started_at) ?? activityMs ?? timestamp(row.updated_at) ?? now;
  const expiresMs = timestamp(row.expires_at) ?? (startedMs + INITIAL_MS);
  const remainingMs = expiresMs - now;

  return {
    startedAt: iso(startedMs),
    expiresAt: iso(expiresMs),
    remainingMs,
    expired: hasItems(row.items) && remainingMs <= 0,
    extensionUsed: row.extension_used === true,
    reminder3dSent: Boolean(row.reminder_3d_sent_at),
    reminder1dSent: Boolean(row.reminder_1d_sent_at),
  };
}

/**
 * A new basket receives seven days. A genuine change made inside the final
 * three days grants one extension to three days from that change. Opening the
 * site does not call this function and therefore never extends the basket.
 */
export function nextBasketLifecycle(currentRow, nextItems, now = Date.now()) {
  if (!hasItems(nextItems)) {
    return {
      started_at: null,
      expires_at: null,
      extension_used: false,
      reminder_3d_sent_at: null,
      reminder_1d_sent_at: null,
    };
  }

  if (!currentRow || !hasItems(currentRow.items) || !currentRow.started_at) {
    return {
      started_at: iso(now),
      expires_at: iso(now + INITIAL_MS),
      extension_used: false,
      reminder_3d_sent_at: null,
      reminder_1d_sent_at: null,
      archived_items: [],
      archived_at: null,
    };
  }

  const current = basketLifecycle(currentRow, now);
  if (!current.extensionUsed && current.remainingMs <= THREE_DAY_MS && current.remainingMs > 0) {
    return {
      started_at: current.startedAt,
      expires_at: iso(now + EXTENSION_DAYS * ONE_DAY_MS),
      extension_used: true,
      reminder_3d_sent_at: currentRow.reminder_3d_sent_at || null,
      reminder_1d_sent_at: null,
    };
  }

  return {
    started_at: current.startedAt,
    expires_at: current.expiresAt,
    extension_used: current.extensionUsed,
    reminder_3d_sent_at: currentRow.reminder_3d_sent_at || null,
    reminder_1d_sent_at: currentRow.reminder_1d_sent_at || null,
  };
}

export function reminderDue(row, now = Date.now()) {
  if (!hasItems(row?.items)) return null;
  const state = basketLifecycle(row, now);
  if (state.remainingMs <= 0) return 'expired';
  if (state.remainingMs <= ONE_DAY_MS && !state.reminder1dSent) return '1d';
  if (state.remainingMs <= THREE_DAY_MS && !state.reminder3dSent) return '3d';
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value) {
  return `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function basketSummary(items = []) {
  return items.reduce((summary, line) => {
    const qty = Number(line?.qty || 0);
    const price = Number(line?.product?.price || 0);
    return {
      lines: summary.lines + 1,
      units: summary.units + qty,
      value: summary.value + qty * price,
    };
  }, { lines: 0, units: 0, value: 0 });
}

export function buildBasketReminderEmail({ customerName, items, kind, expiresAt, basketUrl }) {
  const firstName = String(customerName || 'there').trim().split(/\s+/)[0] || 'there';
  const isTomorrow = kind === '1d';
  const daysText = isTomorrow ? 'tomorrow' : 'in 3 days';
  const summary = basketSummary(items);
  const expiry = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(expiresAt));
  const previewLines = items.slice(0, 5).map((line) => {
    const name = line?.product?.name || line?.product?.sku || 'Product';
    const sku = line?.product?.sku || line?.product?.code || '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:14px;line-height:1.5;"><strong>${escapeHtml(name)}</strong>${sku ? `<br/><span style="color:#777777;font-size:12px;">${escapeHtml(sku)}</span>` : ''}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:14px;font-weight:700;">${Number(line?.qty || 0)}</td></tr>`;
  }).join('');
  const more = items.length > 5
    ? `<p style="margin:12px 0 0;color:#6b7280;font-size:12px;">Plus ${items.length - 5} more product${items.length - 5 === 1 ? '' : 's'}.</p>`
    : '';

  const subject = isTomorrow
    ? 'Your Proto Trading basket expires tomorrow'
    : 'Your Proto Trading basket expires in 3 days';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="x-apple-disable-message-reformatting"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your saved wholesale basket expires ${daysText}. Complete it before it is archived.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f4f6;border-collapse:collapse;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:30px 32px 28px;background:#111111;">
  <p style="margin:0 0 20px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:.4px;">PROTO <span style="color:#ef2b2d;">TRADING</span><span style="display:block;margin-top:6px;color:#b8b8b8;font-size:10px;font-weight:700;letter-spacing:3px;">ONLINE</span></p>
  <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.25;font-weight:900;">Your basket expires ${daysText}</h1>
</td></tr>
<tr><td style="padding:36px 34px 32px;background:#ffffff;">
  <p style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:700;">Hi ${escapeHtml(firstName)},</p>
  <p style="margin:0 0 22px;color:#4b5563;font-size:15px;line-height:1.7;">You still have products saved in your Proto Trading basket. Complete your order before <strong>${escapeHtml(expiry)}</strong> to keep everything together.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fff7f7;border:1px solid #fecaca;border-left:4px solid #c40000;border-radius:8px;"><tr><td style="padding:16px 18px;">
    <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.65;"><strong>${summary.lines} product line${summary.lines === 1 ? '' : 's'} · ${summary.units} unit${summary.units === 1 ? '' : 's'} · ${money(summary.value)} incl. VAT</strong></p>
  </td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;border-collapse:collapse;">${previewLines}</table>${more}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="${escapeHtml(basketUrl)}" style="display:inline-block;padding:15px 34px;background:#c40000;border-radius:8px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;">Return to my basket</a></td></tr></table>
  <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.7;">A saved basket does not reserve stock or guarantee prices. Final stock, pricing and availability are confirmed when your order is submitted and quoted.</p>
</td></tr>
<tr><td align="center" style="padding:24px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;"><p style="margin:0 0 7px;color:#111827;font-size:15px;font-weight:800;">Proto Trading Online</p><p style="margin:0;color:#6b7280;font-size:12px;line-height:1.7;"><a href="tel:+27214615883" style="color:#9f1239;text-decoration:none;font-weight:700;">+27 21 461 5883</a> &nbsp;·&nbsp; <a href="mailto:online@proto.co.za" style="color:#9f1239;text-decoration:none;font-weight:700;">online@proto.co.za</a></p></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, summary };
}
