// Server-side read-only provider. No database updates or storage mutations.
import manifest from './_website-only-manifest.json' with { type: 'json' };
import { createStockClient } from '../lib/stock-supabase.mjs';
import { getPortalAdminClient } from './_site-config.js';
import { createLiveReadOnlyEvidenceReader } from './_website-only-evidence.js';
import { createWebsiteOnlyProvider } from './_website-only-provider.js';

export function createRuntimeWebsiteOnlyProvider({stockClient, websiteClient, env=process.env, transport=(...args)=>globalThis.fetch(...args), now=Date.now}={}) {
  const providers=new Map();
  return async (options={}) => {
    const deploymentHost=String(env.VERCEL_URL||'');
    const deploymentOrigin=/^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(deploymentHost)?`https://${deploymentHost}`:null;
    const requestedOrigin=options.origin;
    const origin=requestedOrigin==='https://www.proto.co.za'||(deploymentOrigin && requestedOrigin===deploymentOrigin)
      ? requestedOrigin : (env.VERCEL_ENV==='preview'&&deploymentOrigin ? deploymentOrigin : 'https://www.proto.co.za');
    let provider=providers.get(origin);
    if (!provider) {
      const stock = stockClient || createStockClient({legacyServiceRole:true});
      const website = websiteClient || getPortalAdminClient();
      const readEvidence = createLiveReadOnlyEvidenceReader({stockClient:stock, websiteClient:website, env, transport, now});
      provider = createWebsiteOnlyProvider({manifest, readEvidence, origin, now, maxAgeMs:60_000});
      providers.set(origin,provider);
    }
    return provider(options);
  };
}

// A staged production deployment must serve its own assets; custom-domain
// requests use the public domain. Never trust an arbitrary Host header.
export function websiteOnlyRequestOrigin(req,env=process.env) {
  const host=String(req?.headers?.host||'').toLowerCase().split(':')[0];
  const deploymentHost=String(env.VERCEL_URL||'').toLowerCase();
  if(host===deploymentHost && /^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(host)) return `https://${host}`;
  return 'https://www.proto.co.za';
}

export const runtimeWebsiteOnlyProvider = createRuntimeWebsiteOnlyProvider();
