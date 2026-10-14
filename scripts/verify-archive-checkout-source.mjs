import { execFileSync } from 'node:child_process';

const baseline = 'f262b56e8765aa3485ed5faed288d03c43a23c3a';
// Capture output for comparisons only. Never forward Git errors or output.
function runGit(args) {
  try {
    return { ok: true, output: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) };
  } catch (error) {
    return { ok: false, status: Number.isInteger(error.status) ? error.status : null };
  }
}

export function verifyArchiveCheckoutSource(expectedSha, { run = runGit, report = console.log } = {}) {
  const available = run(['--version']);
  const shallow = run(['rev-parse', '--is-shallow-repository']);
  const object = run(['cat-file', '-e', baseline + '^{commit}']);
  const head = run(['rev-parse', 'HEAD']);
  const ancestry = run(['merge-base', '--is-ancestor', baseline, 'HEAD']);
  const status = run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const counts = status.ok ? { changed: 0, staged: 0, unstaged: 0, untracked: 0 } : null;
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
        // Porcelain -z includes a second path for renames/copies.
        if (/[RC]/.test(record.slice(0, 2))) i++;
      }
    }
  }
  report('ARCHIVE_CHECKOUT_SOURCE_DIAGNOSTICS ' + JSON.stringify({
    gitAvailable: available.ok,
    shallow: shallow.ok && ['true', 'false'].includes(shallow.output.trim()) ? shallow.output.trim() === 'true' : null,
    baselineObjectAvailable: object.ok ? true : [1, 128].includes(object.status) ? false : null,
    changedFileCounts: counts,
  }));
  const reject = code => { throw new Error(code); };
  if (!available.ok) reject('ARCHIVE_CHECKOUT_GIT_AVAILABILITY_COMMAND_FAILED');
  if (!head.ok) reject('ARCHIVE_CHECKOUT_HEAD_COMMAND_FAILED');
  if (head.output.trim() !== expectedSha) reject('ARCHIVE_CHECKOUT_HEAD_MISMATCH');
  if (!ancestry.ok) reject(ancestry.status === 1 ? 'ARCHIVE_CHECKOUT_ANCESTRY_REJECTED' : 'ARCHIVE_CHECKOUT_ANCESTRY_COMMAND_FAILED');
  if (!status.ok) reject('ARCHIVE_CHECKOUT_STATUS_COMMAND_FAILED');
  // Preserve the original fail-closed status gate, independent of counting.
  if (status.output.trim()) reject('ARCHIVE_CHECKOUT_DIRTY_WORKTREE');
}
