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
 * opts.smokeOk            — smoke lần đầu (sau khi retarget version MỚI) xanh hay đỏ
 * opts.prevVersion        — version deployment đang trỏ tới trước khi deploy
 * opts.newVersion         — version mới tạo ra
 * opts.getDeploymentFails — GET deployment (đọc version cũ) trả lỗi HTTP thay vì 200
 * opts.rollbackPutFails   — PUT retarget LẦN 2 (lùi về version cũ) trả lỗi HTTP thay vì 200
 * opts.postRollbackSmokeOk — smoke SAU khi lùi xanh hay đỏ (mặc định true = xanh)
 * opts.oldFiles            — files trả về bởi GET content?versionNumber=prevVersion
 *                             (mặc định 1 file giả lập nội dung version cũ)
 * opts.contentRestoreGetFails — GET content?versionNumber=... (đọc nội dung version cũ
 *                             để khôi phục HEAD) trả lỗi HTTP thay vì 200
 * Trả về mảng calls đã ghi để assert thứ tự.
 */
function stubFetch(opts) {
  const calls = [];
  let smokeCount = 0;
  let putCount = 0;
  const oldFiles = opts.oldFiles || [{ name: 'Code', type: 'SERVER_JS', source: `// nội dung v${opts.prevVersion}` }];
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });

    // Phải check TRƯỚC nhánh '/content' PUT chung vì URL này cũng chứa '/content'.
    if (url.includes('/content?versionNumber=') && method === 'GET') {
      if (opts.contentRestoreGetFails) return textRes(500, 'GET content lỗi: boom đọc nội dung version cũ');
      return jsonRes(200, { files: oldFiles });
    }
    if (url.includes('/content') && method === 'PUT') return jsonRes(200, {});
    if (url.includes('/versions') && method === 'POST') return jsonRes(200, { versionNumber: opts.newVersion });
    if (url.includes('/deployments/') && method === 'GET') {
      if (opts.getDeploymentFails) return textRes(500, 'GET deployment lỗi: boom đọc version cũ');
      return jsonRes(200, { deploymentConfig: { versionNumber: opts.prevVersion } });
    }
    if (url.includes('/deployments/') && method === 'PUT') {
      putCount++;
      // PUT #1 = retarget sang version mới. PUT #2 (nếu có) = lùi (rollback).
      if (putCount === 2 && opts.rollbackPutFails) return textRes(403, 'PUT rollback lỗi: permission denied');
      return jsonRes(200, {});
    }
    if (url.includes('/exec')) {
      smokeCount++;
      // Smoke đầu = kiểm version mới. Smoke sau (nếu có) = kiểm sau khi lùi.
      const ok = smokeCount === 1 ? opts.smokeOk : (opts.postRollbackSmokeOk !== undefined ? opts.postRollbackSmokeOk : true);
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

test('GET deployment lỗi → hủy TRƯỚC khi retarget; message phải nói đúng: HEAD đã bị đụng, /exec thì chưa (KHÔNG được claim "prod chưa bị đụng")', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: true, prevVersion: 41, newVersion: 42, getDeploymentFails: true });

    await assert.rejects(
      () => deployBranch('lamha', CFG, 'TOKEN', [], '', false),
      err => {
        assert.ok(!err.message.includes('ROLLBACK'), `lỗi không được chứa ROLLBACK — chưa deploy gì để mà lùi. Got: ${err.message}`);
        // Bug cũ: message nói "prod chưa bị đụng tới" — SAI, vì PUT /content (bước 1)
        // đã ghi đè HEAD trước khi tới đây. Message mới phải không còn claim sai này,
        // và phải nói rõ /exec (cái thực sự chưa đổi) khác với HEAD (đã đổi).
        assert.ok(!err.message.includes('prod chưa bị đụng'), `không được claim "prod chưa bị đụng" — HEAD đã bị ghi đè rồi. Got: ${err.message}`);
        assert.ok(err.message.includes('HEAD'), `phải nói rõ HEAD đã bị ghi đè. Got: ${err.message}`);
        assert.ok(err.message.includes('/exec'), `phải nói rõ /exec (cái chưa đổi) tách biệt với HEAD. Got: ${err.message}`);
        return true;
      }
    );

    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 0, 'không được retarget khi chưa đọc được version cũ — /exec phải nguyên vẹn');
  } finally { globalThis.fetch = realFetch; }
});

test('rollback retarget TỰ NÓ thất bại → lỗi ROLLBACK THẤT BẠI kèm HTTP status + body', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    stubFetch({ smokeOk: false, prevVersion: 41, newVersion: 42, rollbackPutFails: true });

    await assert.rejects(
      () => deployBranch('lamha', CFG, 'TOKEN', [], '', false),
      err => {
        assert.ok(err.message.includes('ROLLBACK THẤT BẠI'), `phải nêu ROLLBACK THẤT BẠI. Got: ${err.message}`);
        assert.ok(err.message.includes('403'), `phải kèm HTTP status của lần retarget lùi thất bại. Got: ${err.message}`);
        assert.ok(err.message.includes('permission denied'), `phải kèm response body để debug. Got: ${err.message}`);
        return true;
      }
    );
  } finally { globalThis.fetch = realFetch; }
});

test('rollback thành công nhưng version cũ vẫn đỏ → lỗi nêu rõ prod vẫn hỏng', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: false, prevVersion: 41, newVersion: 42, postRollbackSmokeOk: false });

    await assert.rejects(
      () => deployBranch('lamha', CFG, 'TOKEN', [], '', false),
      err => {
        assert.ok(err.message.includes('vẫn đỏ'), `phải nêu rõ lùi xong nhưng version cũ vẫn đỏ. Got: ${err.message}`);
        assert.ok(!err.message.includes('THẤT BẠI'), 'đây là rollback THÀNH CÔNG (retarget OK) nhưng version cũ tự nó hỏng — khác case retarget thất bại');
        return true;
      }
    );

    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 2, 'phải retarget đủ 2 lần: sang mới rồi lùi về cũ (lùi có thành công)');
  } finally { globalThis.fetch = realFetch; }
});

test('smoke đỏ → rollback phải FETCH nội dung version cũ VÀ PUT lại HEAD, không chỉ retarget /exec', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const oldFiles = [{ name: 'Code', type: 'SERVER_JS', source: '// nội dung THẬT của v41' }];
    const calls = stubFetch({ smokeOk: false, prevVersion: 41, newVersion: 42, oldFiles });
    await assert.rejects(() => deployBranch('lamha', CFG, 'TOKEN', [], '', false), /ROLLBACK/);

    const contentGets = calls.filter(c => c.url.includes('/content?versionNumber=41') && c.method === 'GET');
    assert.strictEqual(contentGets.length, 1, 'phải GET content?versionNumber=41 để lấy nội dung version cũ');

    // '/content' PUT xảy ra 2 lần: lần 1 = push code mới (bước 1, luôn xảy ra), lần 2 =
    // khôi phục HEAD lúc rollback. Assert đúng payload của lần 2, không chỉ đếm số lần gọi.
    const contentPuts = calls.filter(c => c.url.includes('/content') && !c.url.includes('versionNumber') && c.method === 'PUT');
    assert.strictEqual(contentPuts.length, 2, 'phải PUT /content 2 lần: push ban đầu + khôi phục lúc rollback');
    assert.deepStrictEqual(contentPuts[1].body.files, oldFiles, 'PUT khôi phục phải gửi ĐÚNG files của version cũ lấy từ GET, không phải files mới');

    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 2, 'retarget 2 lần: sang version mới rồi lùi về cũ (như mọi ca smoke đỏ)');
  } finally { globalThis.fetch = realFetch; }
});

test('rollback: fetch nội dung version cũ THẤT BẠI → không PUT khôi phục HEAD được, nhưng vẫn retarget /exec, và báo lỗi to rõ HEAD không cứu được', async () => {
  const { deployBranch } = require('../deploy_gas.js');
  const realFetch = globalThis.fetch;
  try {
    const calls = stubFetch({ smokeOk: false, prevVersion: 41, newVersion: 42, contentRestoreGetFails: true });

    await assert.rejects(
      () => deployBranch('lamha', CFG, 'TOKEN', [], '', false),
      err => {
        assert.ok(err.message.includes('ROLLBACK'), `phải vẫn nêu ROLLBACK — /exec vẫn được lùi dù HEAD không cứu được. Got: ${err.message}`);
        assert.ok(err.message.includes('HEAD'), `phải nêu rõ HEAD không khôi phục được. Got: ${err.message}`);
        assert.ok(err.message.includes('KHÔNG') || err.message.includes('không'), `phải nói rõ đây là thất bại, không được im lặng bỏ qua. Got: ${err.message}`);
        assert.ok(err.message.includes('boom đọc nội dung version cũ') || err.message.includes('500'), `phải kèm chi tiết lỗi GET content để debug. Got: ${err.message}`);
        return true;
      }
    );

    // Vẫn phải cố retarget /exec dù HEAD không cứu được — không được để 1 thất bại
    // chặn luôn nỗ lực cứu cái còn lại.
    const retargets = calls.filter(c => c.url.includes('/deployments/') && c.method === 'PUT');
    assert.strictEqual(retargets.length, 2, 'vẫn phải retarget /exec (sang mới rồi lùi về cũ) dù không khôi phục được HEAD');

    // Không được có PUT /content khôi phục (chỉ có PUT push ban đầu) vì GET đã lỗi.
    const contentPuts = calls.filter(c => c.url.includes('/content') && !c.url.includes('versionNumber') && c.method === 'PUT');
    assert.strictEqual(contentPuts.length, 1, 'GET nội dung version cũ lỗi thì không được PUT khôi phục (không có gì để PUT)');
  } finally { globalThis.fetch = realFetch; }
});
