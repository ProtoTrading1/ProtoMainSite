import { validateArchiveCheckoutConfig } from '../api/_archive-checkout-config.js';

// Public build identity only. Never serialize the environment or credentials.
export function archiveCheckoutPanelContext(env, proof) {
  try {
    validateArchiveCheckoutConfig(env, proof);
    return { environment: proof.environment, branch: proof.branch, scope: proof.scope, sha: proof.sha, deploymentId: proof.deploymentId, url: proof.url };
  } catch { return null; }
}
