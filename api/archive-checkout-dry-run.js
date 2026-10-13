import proof from './_archive-checkout-build-proof.js';
import { ARCHIVE_CHECKOUT_PORTAL, ARCHIVE_CHECKOUT_STOCK, ARCHIVE_CHECKOUT_OWNER, ARCHIVE_CHECKOUT_EMAIL, validateArchiveCheckoutConfig, validateArchiveCheckoutRequest, checkoutBlocked } from './_archive-checkout-config.js';
import { archiveMainMetadata } from './_archive-main-contract.js';
import { archiveInstoreMetadata } from './_archive-instore-contract.js';
import { normalizeUnitsOfIssue } from '../lib/selling-unit.mjs';

export function createArchiveCheckoutHandler({ env = process.env, buildProof = proof, transport = globalThis.fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { sku, qty } = validateArchiveCheckoutRequest(req);
      const identity = validateArchiveCheckoutConfig(env, buildProof);
      const authorization = req.headers?.authorization;
      if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) checkoutBlocked('ARCHIVE_CHECKOUT_UNAUTHORIZED', 401);
      // Routes, methods and payloads are constructed here, never supplied by a caller.
      const read = async (origin, path, { rpc = false, body } = {}) => {
        const key = origin === ARCHIVE_CHECKOUT_PORTAL ? env.VITE_SUPABASE_ANON_KEY : env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY;
        let response;
        try {
          response = await transport(origin + path, { method: rpc ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { apikey: key, Authorization: origin === ARCHIVE_CHECKOUT_PORTAL ? authorization : `Bearer ${key}`, ...(rpc ? { 'Content-Type': 'application/json' } : {}) }, ...(rpc ? { body: JSON.stringify(body) } : {}) });
        } catch { checkoutBlocked('ARCHIVE_CHECKOUT_READ_FAILED'); }
        if (response.redirected || response.status >= 300 && response.status < 400 || response.url && new URL(response.url).origin !== origin) checkoutBlocked('ARCHIVE_CHECKOUT_REDIRECT_REJECTED');
        if (!response.ok) checkoutBlocked(origin === ARCHIVE_CHECKOUT_PORTAL && path === '/auth/v1/user' ? 'ARCHIVE_CHECKOUT_UNAUTHORIZED' : 'ARCHIVE_CHECKOUT_READ_FAILED', origin === ARCHIVE_CHECKOUT_PORTAL && path === '/auth/v1/user' ? 401 : 503);
        try { return await response.json(); } catch { checkoutBlocked('ARCHIVE_CHECKOUT_READ_FAILED'); }
      };
      const user = await read(ARCHIVE_CHECKOUT_PORTAL, '/auth/v1/user');
      if (user?.id !== ARCHIVE_CHECKOUT_OWNER || user?.email !== ARCHIVE_CHECKOUT_EMAIL) checkoutBlocked('ARCHIVE_CHECKOUT_OWNER_REQUIRED', 403);
      const profiles = await read(ARCHIVE_CHECKOUT_PORTAL, `/rest/v1/customers?select=id,email,role,is_approved,trade_email_verification_required,trade_email_verified_at&id=eq.${ARCHIVE_CHECKOUT_OWNER}&limit=2`);
      const profile = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null;
      if (!profile || profile.id !== ARCHIVE_CHECKOUT_OWNER || profile.email !== ARCHIVE_CHECKOUT_EMAIL || profile.is_approved !== true || !['admin', 'customer'].includes(profile.role) || ![true, false].includes(profile.trade_email_verification_required) || profile.trade_email_verification_required === true && !profile.trade_email_verified_at) checkoutBlocked('ARCHIVE_CHECKOUT_PROFILE_REJECTED', 403);
      const main = sku === 'SYN-AR26-MAIN';
      const columns = main ? 'sku,barcode,price,units_of_issue,min_order_qty,available_stock,archive_review_request_id' : 'sku,barcode,price,available_stock,image_source_key,is_active,visibility_status,image_review_status';
      const rows = await read(ARCHIVE_CHECKOUT_STOCK, `/rest/v1/${main ? 'website_stock' : 'extended_range_items'}?select=${columns}&sku=eq.${sku}&limit=2`);
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!row || row.sku !== sku) checkoutBlocked('ARCHIVE_CHECKOUT_PRODUCT_REJECTED', 409);
      const metadataRows = await read(ARCHIVE_CHECKOUT_STOCK, `/rest/v1/rpc/${main ? 'archive_review_main_metadata' : 'archive_review_catalogue_metadata'}`, { rpc: true, body: { p_skus: [sku] } });
      if (!Array.isArray(metadataRows) || metadataRows.length !== 1 || metadataRows[0].sku !== sku) checkoutBlocked('ARCHIVE_CHECKOUT_PROVENANCE_REJECTED', 409);
      const raw = metadataRows[0];
      // The In-store RPC filters destination and exact request marker in SQL;
      // its existing schema does not emit destination/barcode. Never invent them.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.requestId || '') || !Number.isSafeInteger(raw.min_order_qty) || raw.min_order_qty < 1 || typeof raw.units_of_issue !== 'string' || normalizeUnitsOfIssue(raw.units_of_issue) !== raw.units_of_issue || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0 || raw.price_source !== 'positill_website_inclusive' || typeof row.barcode !== 'string' || !row.barcode.trim()) checkoutBlocked('ARCHIVE_CHECKOUT_PROVENANCE_REJECTED', 409);
      const metadata = main ? archiveMainMetadata({ ...row, archive_review_main: metadataRows[0] }) : archiveInstoreMetadata({ ...row, archive_review: metadataRows[0] });
      if (!metadata || !Number.isSafeInteger(row.available_stock) || row.available_stock < qty || qty < metadata.minQty || !main && (row.available_stock < 10 || row.is_active !== true || row.visibility_status !== 'search_only' || row.image_review_status !== 'verified')) checkoutBlocked('ARCHIVE_CHECKOUT_PRODUCT_REJECTED', 409);
      return res.status(200).json({ ok: true, mode: 'validation-only', sku, qty, price: metadata.price, unitsOfIssue: metadata.unitsOfIssue, sourceCommit: identity.sha, deploymentId: identity.deploymentId, writesPerformed: false });
    } catch (error) {
      return res.status(error.status || 503).json({ ok: false, code: error.code || 'ARCHIVE_CHECKOUT_VALIDATION_FAILED', writesPerformed: false });
    }
  };
}
export default createArchiveCheckoutHandler();
