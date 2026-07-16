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
