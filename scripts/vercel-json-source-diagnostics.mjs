import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

// Fixed file only. Capture bytes internally; never emit contents or Git errors.
function git(args) {
  try { return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
}
function hash(bytes) { return bytes === null ? null : createHash('sha256').update(bytes).digest('hex'); }
function json(bytes) {
  if (bytes === null) return { ok: false };
  try { return { ok: true, value: JSON.parse(bytes.toString('utf8')) }; }
  catch { return { ok: false }; }
}

export function vercelJsonSourceDiagnostics(expectedSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) return null;
  const expected = git(['show', expectedSha + ':vercel.json']);
  const tree = git(['ls-tree', '-z', expectedSha, '--', 'vercel.json']);
  const index = git(['ls-files', '--stage', '-z', '--', 'vercel.json']);
  const coreFileModeValue = git(['config', '--bool', 'core.filemode'])?.toString('utf8').trim();
  const coreFileMode = ['true', 'false'].includes(coreFileModeValue) ? coreFileModeValue === 'true' : null;
  const expectedMode = tree?.toString('utf8').match(/^(100644|100755) blob [a-f0-9]{40}\tvercel\.json\0$/)?.[1] ?? null;
  const indexMode = index?.toString('utf8').match(/^(100644|100755) [a-f0-9]{40} 0\tvercel\.json\0$/)?.[1] ?? null;
  let worktree = null;
  let fileMode = null;
  let worktreeGitMode = null;
  try {
    const stat = lstatSync('vercel.json');
    // Do not follow a symlink or read a special file.
    if (stat.isFile()) {
      fileMode = (stat.mode & 0o777).toString(8).padStart(3, '0');
      worktreeGitMode = stat.mode & 0o100 ? '100755' : '100644';
      worktree = readFileSync('vercel.json');
    }
  } catch { /* Missing/unreadable files stay unknown; existing guards decide admission. */ }
  const expectedJson = json(expected);
  const worktreeJson = json(worktree);
  return {
    expectedBytes: expected?.length ?? null,
    worktreeBytes: worktree?.length ?? null,
    expectedSha256: hash(expected),
    worktreeSha256: hash(worktree),
    bytesEqual: expected !== null && worktree !== null ? expected.equals(worktree) : null,
    expectedMode, indexMode, fileMode, worktreeGitMode, coreFileMode,
    indexModeEqual: expectedMode !== null && indexMode !== null ? expectedMode === indexMode : null,
    worktreeModeEqual: expectedMode !== null && worktreeGitMode !== null ? expectedMode === worktreeGitMode : null,
    expectedJsonValid: expectedJson.ok,
    worktreeJsonValid: worktreeJson.ok,
    jsonSemanticallyEqual: expectedJson.ok && worktreeJson.ok ? isDeepStrictEqual(expectedJson.value, worktreeJson.value) : null,
  };
}
