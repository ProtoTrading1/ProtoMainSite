import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SITE_URL } from '../_public-site-url.js';

/**
 * Who is Fin talking to?
 *
 * The Messenger now loads for logged-out visitors as well, so "Intercom sent
 * this request" no longer implies "an approved trade customer asked". Anyone
 * on the landing page can open the chat, and Fin will happily call whatever
 * data connectors it is given — so the connector itself has to decide.
 *
 * The only identity worth trusting is the one Intercom marks as verified: the
 * `user_id` from the signed Messenger JWT (`intercom/jwt.js`), which surfaces
 * on the contact as `external_id`. Configure the connector to pass it:
 *
 *   /api/intercom/products/search?q={{input}}&user_id={{contact.external_id}}
 *
 * Email is deliberately NOT accepted as an identity. A lead can type any
 * address they like into the Messenger and Intercom records it unverified —
 * treating that as proof of a trade account would hand a stranger our prices
 * for the cost of guessing a customer's email.
 */

// The registration URL follows PUBLIC_SITE_URL, the same source the emailed
// "go to the portal" links use, so Fin cannot end up sending prospects to a
// host the portal has already moved off.
const SIGN_IN_REQUIRED = `This person is not signed in to a Proto Trading account, so stock levels and prices must not be shared. Tell them our range and pricing are for approved trade customers, and invite them to register at ${PUBLIC_SITE_URL}.`;

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Supabase auth ids are UUIDs. Anything else cannot match a customer row, and
// passing it to PostgREST just produces a 500 from a malformed uuid cast.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(res) {
  // 200, not 403: Fin relays a tool's message to the customer but treats an
  // error status as a broken tool and falls back to "something went wrong".
  // The point here is to have Fin say the right thing, not to look broken.
  res.status(200).json({
    products: [],
    count: 0,
    access: 'sign_in_required',
    message: SIGN_IN_REQUIRED,
  });
  return null;
}

/**
 * Resolve the Intercom contact to an approved customer, or answer the request
 * with the "ask them to register" payload and return null.
 */
export async function requireVerifiedTradeContact(req, res) {
  const userId = String(req.query?.user_id || req.query?.external_id || '').trim();
  if (!userId || !UUID.test(userId)) return refuse(res);

  let customer;
  try {
    const { data, error } = await getServiceClient()
      .from('customers')
      .select('id, role, is_approved')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    customer = data;
  } catch (err) {
    console.error('intercom contact lookup failed:', err?.message || err);
    // Fail closed. An unavailable database is not permission to hand out
    // trade prices to whoever is in the chat.
    res.status(503).json({ error: 'Account verification is temporarily unavailable' });
    return null;
  }

  if (!customer || (customer.role !== 'admin' && customer.is_approved !== true)) {
    return refuse(res);
  }

  return customer;
}

export const SIGN_IN_REQUIRED_MESSAGE = SIGN_IN_REQUIRED;
