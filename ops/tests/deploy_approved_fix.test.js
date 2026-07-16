const test = require('node:test');
const assert = require('assert');

test('checkBaseInvariant: base khớp origin/launch-hardening → ok:true', () => {
  const { checkBaseInvariant } = require('../deploy_approved_fix.js');
  const fakeGitRevParse = () => 'abc123';
  const res = checkBaseInvariant('abc123', fakeGitRevParse);
  assert.strictEqual(res.ok, true);
});

test('checkBaseInvariant: base lệch origin/launch-hardening → ok:false, kèm 2 sha', () => {
  const { checkBaseInvariant } = require('../deploy_approved_fix.js');
  const fakeGitRevParse = () => 'def456';
  const res = checkBaseInvariant('abc123', fakeGitRevParse);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.baseCommitHash, 'abc123');
  assert.strictEqual(res.currentHead, 'def456');
});

test('deployApprovedFix: invariant lệch → KHÔNG gọi deployBranch, trả reason', async () => {
  const { deployApprovedFix } = require('../deploy_approved_fix.js');
  let deployCalled = false;
  const res = await deployApprovedFix(
    { fix_id: 'FIX-1', base_commit_hash: 'abc123', git_branch: 'fix/ERR-1' },
    {
      deployBranch: async () => { deployCalled = true; },
      checkBaseInvariant: () => ({ ok: false, baseCommitHash: 'abc123', currentHead: 'def456' }),
      execGit: async () => {}
    }
  );
  assert.strictEqual(deployCalled, false);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'base_mismatch');
});

test('deployApprovedFix: invariant khớp → merge + deployBranch được gọi', async () => {
  const { deployApprovedFix } = require('../deploy_approved_fix.js');
  const calls = [];
  const res = await deployApprovedFix(
    { fix_id: 'FIX-1', base_commit_hash: 'abc123', git_branch: 'fix/ERR-1' },
    {
      deployBranch: async (...args) => { calls.push(['deployBranch', ...args]); },
      checkBaseInvariant: () => ({ ok: true }),
      execGit: async (cmd) => { calls.push(['execGit', cmd]); }
    }
  );
  assert.strictEqual(res.ok, true);
  assert.ok(calls.some(c => c[0] === 'deployBranch'));
  assert.ok(calls.some(c => c[0] === 'execGit' && c[1].indexOf('merge') !== -1));
});
