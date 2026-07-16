/**
 * deploy_approved_fix.js — chạy SAU khi FIX_QUEUE.status=approved (anh iu bấm DUYỆT
 * trên Telegram). Việc của tiến trình user thường (có ~/.clasprc.json), KHÔNG chạy
 * trong _healer.
 *
 * Invariant base==prod: nếu origin/launch-hardening đã đổi từ lúc nhánh fix được tạo
 * (base_commit_hash), HUỶ — không merge/deploy mù. Lý do: PUT /content ghi đè trọn
 * gói, merge+deploy fix cũ trên base cũ có thể xoá mất commit người khác đẩy lên sau đó.
 */
const { execSync } = require('child_process');
const { deployBranch } = require('./deploy_gas.js');

function checkBaseInvariant(baseCommitHash, gitRevParse) {
  const revParse = gitRevParse || (() => execSync('git rev-parse origin/launch-hardening').toString().trim());
  const currentHead = revParse();
  if (currentHead === baseCommitHash) return { ok: true };
  return { ok: false, baseCommitHash, currentHead };
}

async function deployApprovedFix(fix, deps) {
  const checkInvariant = deps.checkBaseInvariant || checkBaseInvariant;
  const doDeployBranch = deps.deployBranch || deployBranch;
  const doExecGit = deps.execGit;

  const invariant = checkInvariant(fix.base_commit_hash);
  if (!invariant.ok) {
    return {
      ok: false,
      reason: 'base_mismatch',
      message: `prod đổi từ lúc tạo fix (base ${invariant.baseCommitHash}, hiện ${invariant.currentHead}) — cần kiểm tay trước khi deploy`
    };
  }

  await doExecGit(`git fetch origin && git checkout -B launch-hardening origin/launch-hardening && git merge --no-ff origin/${fix.git_branch}`);
  await doDeployBranch('launch-hardening', undefined, undefined, undefined, undefined, false);
  return { ok: true };
}

module.exports = { checkBaseInvariant, deployApprovedFix };
