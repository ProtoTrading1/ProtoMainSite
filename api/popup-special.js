import { readSiteConfigJson } from './_site-config.js';

const FILE = 'popup-special.json';
const DEFAULTS = { active: false, imageUrl: '', title: '', updatedAt: '' };

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
