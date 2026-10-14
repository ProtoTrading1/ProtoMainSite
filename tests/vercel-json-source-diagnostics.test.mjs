import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vercelJsonSourceDiagnostics } from '../scripts/vercel-json-source-diagnostics.mjs';
import { verifyArchiveCheckoutSource } from '../scripts/verify-archive-checkout-source.mjs';

function fixture(check) {
  const directory = mkdtempSync(join(tmpdir(), 'vercel-json-diagnostic-'));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    git(['init', '-q']);
    git(['config', 'core.filemode', 'true']);
    writeFileSync('vercel.json', '{"private-sentinel":{"a":1,"b":[true,false]}}\n');
    chmodSync('vercel.json', 0o644);
    git(['add', 'vercel.json']);
    git(['-c', 'user.name=Diagnostic Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    check(git(['rev-parse', 'HEAD']).trim(), git);
  } finally { process.chdir(previous); rmSync(directory, { recursive: true, force: true }); }
}

test('exact bytes, hash, modes and parsed JSON match without exposing contents', () => fixture(sha => {
  const d = vercelJsonSourceDiagnostics(sha);
  assert.equal(d.bytesEqual, true);
  assert.match(d.expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(d.expectedSha256, d.worktreeSha256);
  assert.equal(d.expectedBytes, d.worktreeBytes);
  assert.equal(d.expectedMode, '100644');
  assert.equal(d.indexModeEqual, true);
  assert.equal(d.worktreeModeEqual, true);
  assert.equal(d.fileMode, '644');
  assert.equal(d.coreFileMode, true);
  assert.equal(d.jsonSemanticallyEqual, true);
  assert.ok(!JSON.stringify(d).includes('private-sentinel'));
}));
test('formatting and object-key order differ in bytes but preserve parsed JSON', () => fixture(sha => {
  writeFileSync('vercel.json', '{\n "private-sentinel": {"b": [true, false], "a": 1}\n}\n');
  const d = vercelJsonSourceDiagnostics(sha);
  assert.equal(d.bytesEqual, false);
  assert.notEqual(d.expectedSha256, d.worktreeSha256);
  assert.equal(d.jsonSemanticallyEqual, true);
  assert.equal(d.worktreeModeEqual, true);
}));
test('permission-only changes preserve bytes and JSON while separating index/file modes', () => fixture((sha, git) => {
  chmodSync('vercel.json', 0o755);
  const d = vercelJsonSourceDiagnostics(sha);
  assert.equal(d.bytesEqual, true);
  assert.equal(d.jsonSemanticallyEqual, true);
  assert.equal(d.indexModeEqual, true);
  assert.equal(d.worktreeModeEqual, false);
  assert.equal(d.fileMode, '755');
  git(['add', 'vercel.json']);
  assert.equal(vercelJsonSourceDiagnostics(sha).indexModeEqual, false);
}));
test('JSON value and array order changes are semantically different', () => fixture(sha => {
  for (const value of ['{"private-sentinel":{"a":2,"b":[true,false]}}', '{"private-sentinel":{"a":1,"b":[false,true]}}']) {
    writeFileSync('vercel.json', value);
    assert.equal(vercelJsonSourceDiagnostics(sha).jsonSemanticallyEqual, false);
  }
}));
test('invalid, missing and symlinked worktree files stay unknown without reading a target', () => fixture(sha => {
  writeFileSync('vercel.json', 'private-sentinel invalid JSON');
  assert.equal(vercelJsonSourceDiagnostics(sha).worktreeJsonValid, false);
  assert.equal(vercelJsonSourceDiagnostics(sha).jsonSemanticallyEqual, null);
  rmSync('vercel.json');
  assert.equal(vercelJsonSourceDiagnostics(sha).worktreeSha256, null);
  writeFileSync('private-target', 'private-sentinel');
  symlinkSync('private-target', 'vercel.json');
  const d = vercelJsonSourceDiagnostics(sha);
  assert.equal(d.worktreeBytes, null);
  assert.equal(d.fileMode, null);
  assert.ok(!JSON.stringify(d).includes('private-sentinel'));
}));
test('Git lookup failure and invalid SHA expose no Git errors or contents', () => fixture(() => {
  assert.equal(vercelJsonSourceDiagnostics('private-sentinel'), null);
  const d = vercelJsonSourceDiagnostics('a'.repeat(40));
  assert.equal(d.expectedSha256, null);
  assert.equal(d.expectedMode, null);
  assert.equal(d.bytesEqual, null);
  assert.equal(d.jsonSemanticallyEqual, null);
  assert.ok(!JSON.stringify(d).includes('fatal'));
}));
test('source diagnostics suppress inspection on unverified identity and retain dirty rejection', () => {
  const sha = 'a'.repeat(40);
  for (const failure of ['HEAD', 'ancestry', 'tree', 'status', 'availability', null]) {
    let inspected = 0;
    const logs = [];
    const run = args => {
      if (failure === 'availability' && args[0] === '--version' || failure === 'ancestry' && args[0] === 'merge-base' || failure === 'tree' && args[0] === 'ls-tree' || failure === 'status' && args[0] === 'status') return { ok: false, status: 128 };
      if (args.join(' ') === 'rev-parse HEAD') return { ok: true, output: failure === 'HEAD' ? 'wrong' : sha };
      return { ok: true, output: args[0] === 'status' ? ' M vercel.json\0' : '' };
    };
    assert.throws(() => verifyArchiveCheckoutSource(sha, { run, report: line => logs.push(line), inspectVercelJson: () => { inspected++; return { bytesEqual: false }; } }), /ARCHIVE_CHECKOUT_/);
    assert.equal(inspected, failure === null ? 1 : 0);
    if (failure === null) assert.ok(logs[0].includes('"bytesEqual":false'));
  }
});
test('all pre-existing rejection gates are byte-identical to the restored revision', () => {
  const prior = execFileSync('git', ['show', '8da4118a91d460b5b366dc401beaeae8e82f4ffc:scripts/verify-archive-checkout-source.mjs'], { encoding: 'utf8' });
  const current = readFileSync('scripts/verify-archive-checkout-source.mjs', 'utf8');
  assert.equal(current.slice(current.indexOf('  const reject =')), prior.slice(prior.indexOf('  const reject =')));
});
