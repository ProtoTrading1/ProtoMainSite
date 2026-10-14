import { validateArchiveTestConfig } from '../api/_archive-test-client.js';
import { writeFileSync } from 'node:fs';
import { verifyArchiveCheckoutSource } from './verify-archive-checkout-source.mjs';
import { ARCHIVE_CHECKOUT_SCOPE, validateArchiveCheckoutConfig } from '../api/_archive-checkout-config.js';
// Vercel runs this before building. Errors contain codes only, never values.
if (process.env.VERCEL === '1') validateArchiveTestConfig();
// A local build always removes proof. Only Vercel's verified source/deployment
// context may produce it; no credential or customer data enters this module.
let checkoutProof = null;
if (process.env.VERCEL === '1' && (process.env.ARCHIVE_TEST_CHECKOUT_SCOPE || process.env.VITE_ARCHIVE_TEST_CHECKOUT_SCOPE)) {
  checkoutProof = { sha: process.env.VERCEL_GIT_COMMIT_SHA, branch: process.env.VERCEL_GIT_COMMIT_REF, environment: process.env.VERCEL_ENV, url: process.env.VERCEL_URL, deploymentId: process.env.VERCEL_DEPLOYMENT_ID, scope: ARCHIVE_CHECKOUT_SCOPE };
  validateArchiveCheckoutConfig(process.env, checkoutProof);
  // Vercel metadata alone does not prove that the checked-out files match it.
  verifyArchiveCheckoutSource(checkoutProof.sha);
}
writeFileSync(new URL('../api/_archive-checkout-build-proof.js', import.meta.url), '// Generated only by the verified build; contains no credentials.\nexport default ' + JSON.stringify(checkoutProof) + ';\n');
const privateKey = process.env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith('VITE_') || !value) continue;
  let role;
  try { role = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* Public config need not be a JWT. */ }
  if (role === 'service_role' || value.startsWith('sb_secret_') || (privateKey && value === privateKey)) throw new Error('ARCHIVE_TEST_PUBLIC_CREDENTIAL_REJECTED');
}
console.log('Dedicated preview configuration/exposure checks passed');
