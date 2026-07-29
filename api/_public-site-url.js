/**
 * The single source of truth for the public site URL used in OUTGOING EMAIL
 * LINKS (password reset, verification-style links, any "go to the portal" CTA).
 *
 * Proto is migrating the customer portal to https://proto.co.za, so that is the
 * default. Override with SITE_URL if the portal moves again — you should NOT
 * have to touch email code to repoint links.
 *
 * IMPORTANT: this is for LINKS the customer clicks. Image/asset URLs in emails
 * must keep pointing at a host that actually serves the file (see
 * PUBLIC_ASSET_URL below) or the logos break in the inbox.
 */
export const PUBLIC_SITE_URL = (process.env.SITE_URL || 'https://proto.co.za').replace(/\/$/, '');

/**
 * Host that serves the email image assets (logos). Kept separate from
 * PUBLIC_SITE_URL because an asset 404s if it is requested from a host that
 * doesn't have it. Point EMAIL_ASSET_URL at proto.co.za once the assets are
 * confirmed served from there.
 */
export const PUBLIC_ASSET_URL = (process.env.EMAIL_ASSET_URL || process.env.SITE_URL || 'https://site.proto.co.za').replace(/\/$/, '');
