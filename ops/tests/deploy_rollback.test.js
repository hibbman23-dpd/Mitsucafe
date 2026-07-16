const test = require('node:test');
const assert = require('assert');

test('require deploy_gas.js không tự chạy main()', () => {
  // Nếu main() chạy, nó đọc ~/.clasprc.json rồi gọi API thật.
  // Chặn bằng cách bắt fetch: require xong mà fetch bị gọi = hỏng.
  let fetchCalled = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('main() đã chạy khi require'); };
  try {
    const mod = require('../deploy_gas.js');
    assert.strictEqual(fetchCalled, false, 'require không được gọi fetch');
    assert.strictEqual(typeof mod.deployBranch, 'function', 'phải export deployBranch');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── Helper: giả lập Response của fetch ──────────────────────────────
function jsonRes(status, obj) {
  const s = JSON.stringify(obj);
  return { status, json: async () => obj, text: async () => s };
}
function textRes(status, body) {
  return { status, json: async () => JSON.parse(body), text: async () => body };
}

/**
 * Stub fetch cho deployBranch.
 * opts.smokeOk        — smoke lần đầu (sau khi retarget version MỚI) xanh hay đỏ
 * opts.prevVersion    — version deployment đang trỏ tới trước khi deploy
 * opts.newVersion     — version mới tạo ra
 * Trả về mảng calls đã ghi để assert thứ tự.
 */
function stubFetch(opts) {
  const calls = [];
  let smokeCount = 0;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });

    if (url.includes('/content') && method === 'PUT') return jsonRes(200, {});
    if (url.includes('/versions') && method === 'POST') return jsonRes(200, { versionNumber: opts.newVersion });
    if (url.includes('/deployments/') && method === 'GET')
      return jsonRes(200, { deploymentConfig: { versionNumber: opts.prevVersion } });
    if (url.includes('/deployments/') && method === 'PUT') return jsonRes(200, {});
    if (url.includes('/exec')) {
      smokeCount++;
      // Smoke đầu = kiểm version mới. Smoke sau (nếu có) = kiểm sau khi lùi, luôn xanh.
      const ok = smokeCount === 1 ? opts.smokeOk : true;
      return ok ? textRes(200, '{"ok":true}') : textRes(500, 'Script error: boom');
    }
    throw new Error('fetch ngoài dự kiến: ' + url);
  };
  return calls;
}

const CFG = { scriptId: 'SCRIPT_X', deploymentId: 'DEPLOY_Y', location_id: 'LH01' };

test('smoke xanh → KHÔNG rollback, retarget đúng 1 lần sang version mới', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: true, prevVersion: 41, newVersion: 42 });
    await deployBranch('lamha', CFG, 'TOKEN', [], '', false);

    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 1, 'chỉ được retarget 1 lần');
    assert.strictEqual(retargets[0].body.deploymentConfig.versionNumber, 42);
  } finally { globalThis.fetch = realFetch; }
});

test('smoke đỏ → retarget lùi về version cũ RỒI mới throw', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: false, prevVersion: 41, newVersion: 42 });

    await assert.rejects(
      () => deployBranch('lamha', CFG, 'TOKEN', [], '', false),
      err => err.message.includes('ROLLBACK'),
      'lỗi ném ra phải nêu rõ ROLLBACK để /fix bắt được'
    );

    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 2, 'phải retarget 2 lần: sang mới rồi lùi về cũ');
    assert.strictEqual(retargets[0].body.deploymentConfig.versionNumber, 42, 'lần 1 sang version mới');
    assert.strictEqual(retargets[1].body.deploymentConfig.versionNumber, 41, 'lần 2 LÙI VỀ version cũ');
  } finally { globalThis.fetch = realFetch; }
});

test('đọc version cũ TRƯỚC khi retarget — không thì lấy nhầm chính version mới', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: true, prevVersion: 41, newVersion: 42 });
    await deployBranch('lamha', CFG, 'TOKEN', [], '', false);

    const iGet = calls.findIndex(c => c.url.includes('/deployments/') && c.method === 'GET');
    const iPut = calls.findIndex(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.ok(iGet !== -1, 'phải GET deployment để biết version đang chạy');
    assert.ok(iGet < iPut, 'GET version cũ phải xảy ra TRƯỚC PUT retarget');
  } finally { globalThis.fetch = realFetch; }
});
