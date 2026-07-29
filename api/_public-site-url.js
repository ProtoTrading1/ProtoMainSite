/**
 * The single source of truth for the public site URL used in OUTGOING EMAIL
 * LINKS (password reset, verification-style links, any "go to the portal" CTA).
 *
 * Proto is migrating the customer portal to https://proto.co.za, so that is the
 * default — and deliberately NOT derived from the legacy SITE_URL variable,
 * which is set to https://site.proto.co.za in production. Inheriting it would
 * have quietly kept every emailed link on the old host no matter what this file
 * said. Override with EMAIL_LINK_URL if the portal moves again; you should not
 * have to touch email code to repoint links.
 *
 * IMPORTANT: this is for LINKS the customer clicks. Image/asset URLs in emails
 * must keep pointing at a host that actually serves the file (see
 * PUBLIC_ASSET_URL below) or the logos break in the inbox.
 */
export const PUBLIC_SITE_URL = (process.env.EMAIL_LINK_URL || 'https://proto.co.za').replace(/\/$/, '');

/**
 * Host that serves the email image assets (logos). Follows SITE_URL — the host
 * that actually runs the app — because an asset 404s if it is requested from a
 * host that doesn't have it. Point EMAIL_ASSET_URL at proto.co.za once the
 * assets are confirmed served from there.
 */
export const PUBLIC_ASSET_URL = (process.env.EMAIL_ASSET_URL || process.env.SITE_URL || 'https://site.proto.co.za').replace(/\/$/, '');
