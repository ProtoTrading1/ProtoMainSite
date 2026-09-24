import { discoveryTiles } from '../lib/instore-discovery.mjs';
import {
  catalogueTtlMs, claimCatalogueRefresh, readCatalogueState,
  releaseCatalogueRefresh, writeCatalogueSnapshot,
} from './_instore-catalogue.js';
import { loadLiveInstoreCatalogue, stockClient } from './extended-range.js';

// Keeps the stored Instore read model warm so a customer request reads one
// page instead of rebuilding the collection. Nothing here decides what is
// sellable: it runs the same live read the customer API runs and stores its
// result. Missing this run only makes the next customer request do the work.
//
// Register as a Vercel cron and/or call it after an Instore change:
//   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
//     https://proto.co.za/api/instore-catalogue-refresh
function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  // Fail closed: without a configured secret this endpoint is unavailable.
  if (!secret) return false;
  const header = String(req.headers?.authorization || '').trim();
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  return bearer === secret || String(req.headers?.['x-cron-secret'] || '').trim() === secret;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const force = String(req.query?.force || '') === '1';
  let client;
  try {
    client = stockClient();
  } catch (error) {
    console.error('instore catalogue refresh not configured:', error?.message || error);
    return res.status(503).json({ error: 'Instore Products stock source is not configured' });
  }

  try {
    const claimed = await claimCatalogueRefresh(client, { staleBeforeMs: force ? 0 : catalogueTtlMs() });
    if (!claimed) {
      const state = await readCatalogueState(client);
      return res.status(200).json({
        ok: true, refreshed: false, reason: 'already fresh or a refresh is in progress',
        refreshedAt: state?.refreshed_at || null, productCount: state?.product_count || 0,
      });
    }
    const live = await loadLiveInstoreCatalogue(client, { includeStaged: false });
    const { productCount, state } = await writeCatalogueSnapshot(client, {
      ...live, tiles: discoveryTiles(live.products),
    });
    return res.status(200).json({
      ok: true, refreshed: true, productCount,
      refreshedAt: state?.refreshed_at || null, tiles: (state?.tiles || []).length,
    });
  } catch (error) {
    console.error('instore catalogue refresh failed:', error?.message || error);
    await releaseCatalogueRefresh(client, error?.message || 'refresh failed');
    return res.status(503).json({ error: 'The Instore catalogue could not be refreshed.' });
  }
}
