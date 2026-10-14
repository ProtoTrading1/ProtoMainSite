import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyArchiveCheckoutSource } from '../scripts/verify-archive-checkout-source.mjs';

const sha = 'a'.repeat(40);
function fixture(overrides = {}) {
  const logs = [];
  const calls = [];
  const outputs = { '--version': 'git version private-sentinel', 'rev-parse --is-shallow-repository': 'false\n', 'cat-file': '', 'rev-parse HEAD': sha + '\n', 'merge-base': '', status: '', 'ls-tree': 'api/_archive-checkout-build-proof.js\0package.json\0package-lock.json\0src/known.js\0src/known file.js\0' };
  const run = args => {
    calls.push(args);
    const key = args[0] === 'rev-parse' ? args.join(' ') : args[0];
    return overrides[key] || { ok: true, output: outputs[key] };
  };
  return { logs, calls, check: () => verifyArchiveCheckoutSource(sha, { run, report: line => logs.push(line), inspectVercelJson: () => null }) };
}
test('clean checkout passes all original gates and reports no changed filenames', () => {
  const f = fixture();
  f.check();
  assert.deepEqual(JSON.parse(f.logs[0].split(' ').slice(1).join(' ')), { gitAvailable: true, shallow: false, baselineObjectAvailable: true, changedFileCounts: { changed: 0, staged: 0, unstaged: 0, untracked: 0 }, changedFileCategories: { proofFileChanged: false, packageManifestChanged: false, lockfileChanged: false, otherFileCount: 0 }, changedTrackedFilenames: [], vercelJson: null });
  assert.deepEqual(f.calls[4], ['merge-base', '--is-ancestor', 'f262b56e8765aa3485ed5faed288d03c43a23c3a', 'HEAD']);
  assert.deepEqual(f.calls[5], ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  assert.ok(!f.logs.join('').includes('private-sentinel'));
});
test('availability, HEAD, ancestry and status failures have distinct safe codes', () => {
  for (const [key, value, code] of [
    ['--version', { ok: false, status: null }, 'GIT_AVAILABILITY_COMMAND_FAILED'],
    ['rev-parse HEAD', { ok: false, status: 128 }, 'HEAD_COMMAND_FAILED'],
    ['rev-parse HEAD', { ok: true, output: 'private-sentinel' }, 'HEAD_MISMATCH'],
    ['merge-base', { ok: false, status: 1 }, 'ANCESTRY_REJECTED'],
    ['merge-base', { ok: false, status: 128 }, 'ANCESTRY_COMMAND_FAILED'],
    ['merge-base', { ok: false, status: null }, 'ANCESTRY_COMMAND_FAILED'],
    ['status', { ok: false, status: 128 }, 'STATUS_COMMAND_FAILED'],
    ['status', { ok: true, output: '?? private-sentinel\0' }, 'DIRTY_WORKTREE'],
  ]) {
    const f = fixture({ [key]: value });
    assert.throws(f.check, { message: 'ARCHIVE_CHECKOUT_' + code });
    assert.equal(f.logs.length, 1);
    assert.ok(!f.logs.join('').includes('private-sentinel'));
  }
});
test('shallow/missing/unknown diagnostics never substitute for ancestry or clean tree', () => {
  const f = fixture({ 'rev-parse --is-shallow-repository': { ok: true, output: 'true' }, 'cat-file': { ok: false, status: 128 }, 'merge-base': { ok: false, status: 128 } });
  assert.throws(f.check, /ANCESTRY_COMMAND_FAILED/);
  assert.ok(f.logs[0].includes('"shallow":true,"baselineObjectAvailable":false'));
  const unknown = fixture({ 'rev-parse --is-shallow-repository': { ok: false, status: 128 }, 'cat-file': { ok: false, status: null }, status: { ok: false, status: 128 } });
  assert.throws(unknown.check, /STATUS_COMMAND_FAILED/);
  assert.ok(unknown.logs[0].includes('"shallow":null,"baselineObjectAvailable":null,"changedFileCounts":null'));
});
test('NUL-delimited changed-file counts handle renames, copies, spaces and newlines without paths', () => {
  const f = fixture({ status: { ok: true, output: 'R  private-sentinel target\0private-sentinel source\0C  copy\0source\0 M line\nbreak\0MM both\0?? untracked\0' } });
  assert.throws(f.check, /DIRTY_WORKTREE/);
  assert.ok(f.logs[0].includes('"changed":5,"staged":3,"unstaged":2,"untracked":1'));
  assert.ok(!f.logs[0].includes('private-sentinel'));
});
test('actual Git failures expose no stderr or paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'archive-source-diagnostics-'));
  const cwd = process.cwd();
  const logs = [];
  try {
    process.chdir(directory);
    assert.throws(() => verifyArchiveCheckoutSource(sha, { report: line => logs.push(line) }), { message: 'ARCHIVE_CHECKOUT_HEAD_COMMAND_FAILED' });
    assert.ok(logs[0].includes('"gitAvailable":true'));
    assert.ok(!logs.join('').includes(directory));
    assert.ok(!logs.join('').includes('fatal'));
  } finally {
    process.chdir(cwd);
    rmSync(directory, { recursive: true });
  }
});
test('fixed categories never admit a dirty tree and unknown paths remain suppressed', () => {
  for (const [path, key] of [['api/_archive-checkout-build-proof.js', 'proofFileChanged'], ['package.json', 'packageManifestChanged'], ['package-lock.json', 'lockfileChanged'], ['private-sentinel/unknown\nfile', 'otherFileCount']]) {
    const f = fixture({ status: { ok: true, output: ' M ' + path + '\0' } });
    assert.throws(f.check, /ARCHIVE_CHECKOUT_DIRTY_WORKTREE/);
    const categories = JSON.parse(f.logs[0].slice(f.logs[0].indexOf(' ') + 1)).changedFileCategories;
    const expected = { proofFileChanged: false, packageManifestChanged: false, lockfileChanged: false, otherFileCount: 0 };
    expected[key] = key === 'otherFileCount' ? 1 : true;
    assert.deepEqual(categories, expected);
    assert.ok(key === 'otherFileCount' ? !f.logs[0].includes(path) : f.logs[0].includes(path));
  }
  const failed = fixture({ status: { ok: false, status: 128 } });
  assert.throws(failed.check, /STATUS_COMMAND_FAILED/);
  assert.ok(failed.logs[0].includes('"changedFileCategories":null'));
});
test('filename diagnostics use only the verified committed tree, never unknown or untracked paths', () => {
  const f = fixture({ status: { ok: true, output: ' M src/known.js\0?? package.json\0 M private-sentinel\0 M src/known file.js\0R  unknown-target\0package-lock.json\0C  src/known.js\0unknown-source\0' } });
  assert.throws(f.check, /DIRTY_WORKTREE/);
  const diagnostics = JSON.parse(f.logs[0].slice(f.logs[0].indexOf(' ') + 1));
  assert.deepEqual(diagnostics.changedTrackedFilenames, ['package-lock.json', 'src/known file.js', 'src/known.js']);
  assert.ok(!f.logs[0].includes('private-sentinel'));
  assert.ok(!f.logs[0].includes('unknown-target'));
  assert.ok(!f.logs[0].includes('unknown-source'));
  assert.deepEqual(f.calls[6], ['ls-tree', '-r', '--name-only', '-z', sha]);
});
test('unsafe names cannot be logged even if listed in a tree, and tree failures stay closed', () => {
  for (const path of ['/private-sentinel', '../private-sentinel', 'src/../private-sentinel', 'src/./private-sentinel', 'src//private-sentinel', 'src/private-sentinel\nvalue', 'src/private-sentinel\\value']) {
    const f = fixture({ 'ls-tree': { ok: true, output: path + '\0' }, status: { ok: true, output: ' M ' + path + '\0' } });
    assert.throws(f.check, /DIRTY_WORKTREE/);
    assert.ok(!f.logs[0].includes('private-sentinel'));
  }
  const failed = fixture({ 'ls-tree': { ok: false, status: 128 } });
  assert.throws(failed.check, /TREE_COMMAND_FAILED/);
  assert.ok(failed.logs[0].includes('"changedTrackedFilenames":null'));
});
test('HEAD mismatch and ancestry rejection suppress filenames while preserving their original gates', () => {
  for (const patch of [{ 'rev-parse HEAD': { ok: true, output: 'wrong' } }, { 'merge-base': { ok: false, status: 1 } }]) {
    const f = fixture({ ...patch, status: { ok: true, output: ' M src/known.js\0' } });
    assert.throws(f.check, /HEAD_MISMATCH|ANCESTRY_REJECTED/);
    assert.ok(f.logs[0].includes('"changedTrackedFilenames":null'));
    assert.ok(!f.logs[0].includes('src/known.js'));
  }
});
test('category classification handles both rename/copy sides and counts other records once', () => {
  const f = fixture({ status: { ok: true, output: 'R  private-sentinel\0api/_archive-checkout-build-proof.js\0C  package-lock.json\0private-sentinel source\0?? package.json\0 M nested/package.json\0 M second-private-sentinel\0' } });
  assert.throws(f.check, /DIRTY_WORKTREE/);
  const diagnostics = JSON.parse(f.logs[0].slice(f.logs[0].indexOf(' ') + 1));
  assert.deepEqual(diagnostics.changedFileCounts, { changed: 5, staged: 2, unstaged: 2, untracked: 1 });
  assert.deepEqual(diagnostics.changedFileCategories, { proofFileChanged: true, packageManifestChanged: true, lockfileChanged: true, otherFileCount: 4 });
  assert.ok(!f.logs[0].includes('private-sentinel'));
  assert.ok(!f.logs[0].includes('nested/package.json'));
});
