import { execFileSync } from 'node:child_process';
import { vercelJsonSourceDiagnostics } from './vercel-json-source-diagnostics.mjs';

const baseline = 'f262b56e8765aa3485ed5faed288d03c43a23c3a';
// Capture output for comparisons only. Never forward Git errors or output.
function runGit(args) {
  try {
    return { ok: true, output: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) };
  } catch (error) {
    return { ok: false, status: Number.isInteger(error.status) ? error.status : null };
  }
}

export function verifyArchiveCheckoutSource(expectedSha, { run = runGit, report = console.log, inspectVercelJson = vercelJsonSourceDiagnostics } = {}) {
  const available = run(['--version']);
  const shallow = run(['rev-parse', '--is-shallow-repository']);
  const object = run(['cat-file', '-e', baseline + '^{commit}']);
  const head = run(['rev-parse', 'HEAD']);
  const ancestry = run(['merge-base', '--is-ancestor', baseline, 'HEAD']);
  const status = run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const tree = run(['ls-tree', '-r', '--name-only', '-z', expectedSha]);
  const allowlist = tree.ok ? new Set(tree.output.split('\0')) : new Set();
  const filenames = new Set();
  const counts = status.ok ? { changed: 0, staged: 0, unstaged: 0, untracked: 0 } : null;
  const categories = status.ok ? { proofFileChanged: false, packageManifestChanged: false, lockfileChanged: false, otherFileCount: 0 } : null;
  if (counts) {
    const records = status.output.split('\0');
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;
      counts.changed++;
      if (record.startsWith('??')) counts.untracked++;
      else {
        if (record[0] !== ' ') counts.staged++;
        if (record[1] !== ' ') counts.unstaged++;
      }
      const paths = [record.slice(3)];
      // Porcelain -z includes a second path for renames/copies. Classify
      // both sides; only committed, safe repository-relative tracked names
      // may be reported. Untracked paths never enter filename diagnostics.
      if (!record.startsWith('??') && /[RC]/.test(record.slice(0, 2))) paths.push(records[++i]);
      let other = false;
      for (const path of paths) {
        if (!record.startsWith('??') && allowlist.has(path) && /^[A-Za-z0-9._ /-]+$/.test(path) && !path.startsWith('/') && path.split('/').every(part => part.trim() && part !== '.' && part !== '..')) filenames.add(path);
        if (path === 'api/_archive-checkout-build-proof.js') categories.proofFileChanged = true;
        else if (path === 'package.json') categories.packageManifestChanged = true;
        else if (path === 'package-lock.json') categories.lockfileChanged = true;
        else other = true;
      }
      if (other) categories.otherFileCount++;
    }
  }
  report('ARCHIVE_CHECKOUT_SOURCE_DIAGNOSTICS ' + JSON.stringify({
    gitAvailable: available.ok,
    shallow: shallow.ok && ['true', 'false'].includes(shallow.output.trim()) ? shallow.output.trim() === 'true' : null,
    baselineObjectAvailable: object.ok ? true : [1, 128].includes(object.status) ? false : null,
    changedFileCounts: counts,
    changedFileCategories: categories,
    changedTrackedFilenames: status.ok && tree.ok && available.ok && head.ok && head.output.trim() === expectedSha && ancestry.ok ? [...filenames].sort() : null,
    vercelJson: status.ok && tree.ok && available.ok && head.ok && head.output.trim() === expectedSha && ancestry.ok ? inspectVercelJson(expectedSha) : null,
  }));
  const reject = code => { throw new Error(code); };
  if (!available.ok) reject('ARCHIVE_CHECKOUT_GIT_AVAILABILITY_COMMAND_FAILED');
  if (!head.ok) reject('ARCHIVE_CHECKOUT_HEAD_COMMAND_FAILED');
  if (head.output.trim() !== expectedSha) reject('ARCHIVE_CHECKOUT_HEAD_MISMATCH');
  if (!ancestry.ok) reject(ancestry.status === 1 ? 'ARCHIVE_CHECKOUT_ANCESTRY_REJECTED' : 'ARCHIVE_CHECKOUT_ANCESTRY_COMMAND_FAILED');
  if (!status.ok) reject('ARCHIVE_CHECKOUT_STATUS_COMMAND_FAILED');
  if (!tree.ok) reject('ARCHIVE_CHECKOUT_TREE_COMMAND_FAILED');
  // Preserve the original fail-closed status gate, independent of counting.
  if (status.output.trim()) reject('ARCHIVE_CHECKOUT_DIRTY_WORKTREE');
}
