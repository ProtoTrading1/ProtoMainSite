import { validateArchiveTestConfig } from '../api/_archive-test-client.js';
// Vercel runs this before building. Errors contain codes only, never values.
if (process.env.VERCEL === '1') validateArchiveTestConfig();
const privateKey = process.env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith('VITE_') || !value) continue;
  let role;
  try { role = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* Public config need not be a JWT. */ }
  if (role === 'service_role' || value.startsWith('sb_secret_') || (privateKey && value === privateKey)) throw new Error('ARCHIVE_TEST_PUBLIC_CREDENTIAL_REJECTED');
}
console.log('Dedicated preview configuration/exposure checks passed');
