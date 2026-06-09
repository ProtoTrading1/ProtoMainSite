import { readSiteConfigJson } from './_site-config.js';

const FILE = 'banner.json';
const DEFAULTS = {
  title: 'Built for retailers who need stock that moves.',
  body: 'Browse core wholesale lines, build a quote-ready basket, and send a clean request to the Proto Trading sales team for stock, VAT, and delivery confirmation.',
  imageUrl: '/campaign-hero-v2.png?v=2',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const data = await readSiteConfigJson(FILE, DEFAULTS);
    return res.status(200).json({ ...DEFAULTS, ...data });
  } catch {
    return res.status(200).json(DEFAULTS);
  }
}
