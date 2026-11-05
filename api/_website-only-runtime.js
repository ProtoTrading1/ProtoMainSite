// Server-side read-only provider. No database updates or storage mutations.
import manifest from './_website-only-manifest.json' with { type: 'json' };
import { createStockClient } from '../lib/stock-supabase.mjs';
import { getPortalAdminClient } from './_site-config.js';
import { createLiveReadOnlyEvidenceReader } from './_website-only-evidence.js';
import { createWebsiteOnlyProvider } from './_website-only-provider.js';

export function createRuntimeWebsiteOnlyProvider({stockClient, websiteClient, env=process.env, transport=(...args)=>globalThis.fetch(...args), now=Date.now}={}) {
  let provider;
  return async (options={}) => {
    if (!provider) {
      const stock = stockClient || createStockClient({legacyServiceRole:true});
      const website = websiteClient || getPortalAdminClient();
      const readEvidence = createLiveReadOnlyEvidenceReader({stockClient:stock, websiteClient:website, env, transport, now});
      const previewHost=String(env.VERCEL_URL||'');
      const origin=env.VERCEL_ENV==='preview' && /^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(previewHost)
        ? `https://${previewHost}` : 'https://www.proto.co.za';
      provider = createWebsiteOnlyProvider({manifest, readEvidence, origin, now, maxAgeMs:60_000});
    }
    return provider(options);
  };
}

export const runtimeWebsiteOnlyProvider = createRuntimeWebsiteOnlyProvider();
