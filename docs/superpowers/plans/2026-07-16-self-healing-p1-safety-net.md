# Self-Healing Plan 1 — Lưới an toàn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng xong lưới an toàn của hệ self-healing — vá bug rollback đang sống trong `deploy_gas.js`, và viết cổng `healer_gate.js` quyết định fix nào được tự push — **trước khi** bất kỳ dòng tự động hoá nào tồn tại.

**Architecture:** Ba mảnh độc lập, không mảnh nào tự chạy. (1) `deploy_gas.js` học cách lưu version cũ trước khi retarget và trỏ ngược lại khi smoke đỏ. (2) `ops/healer_gate.js` = hàm thuần + CLI mỏng, hai cổng AND: nhãn lỗi (`context` → file khai báo phải green) và file diff chạm (⊆ green list). (3) Git worktree riêng cho healer, không bao giờ chạm cây làm việc của user.

**Tech Stack:** Node 22.23 · CommonJS · `node:test` + `assert` · không thêm dependency · Apps Script REST API v1

**Spec:** `docs/superpowers/specs/2026-07-16-self-healing-design.md` — §6 (gate), §8 (worktree), §9.1 (rollback), §12.1 (bảng test gate)

---

## Global Constraints

- **Không thêm dependency.** Repo không có `package.json`. Mọi thứ chạy bằng stdlib Node 22 + `fetch` native.
- **CommonJS.** `require` / `module.exports`. Không `import`.
- **Test chạy bằng:** `node --test <file>`. Suite hiện có: `node --test ops/test_logic.js` → 8 pass. Không được làm đỏ suite này.
- **Comment tiếng Việt**, khớp giọng các file `ops/` sẵn có. Câu ngắn, giải thích *tại sao*, không thuật lại code.
- **Không có mảnh nào trong plan này tự chạy.** Không cron, không trigger, không sửa `dispatcher.sh`. Đó là Plan 2.
- **GREEN_LIST là hằng số hardcode trong `ops/healer_gate.js`** — không đọc từ CONFIG sheet, không đọc từ file ngoài. Lý do: cổng không được phép đổi bởi thứ mà healer ghi được.
- **Fail-closed tuyệt đối.** Mọi nhánh không chắc chắn trong gate → trả red. Không có đường nào mặc định green.
- **Nhánh làm việc:** `feat/healer-safety-net`, nhánh **từ `launch-hardening`**, PR về `launch-hardening`.
  KHÔNG nhánh từ `main` — plan này phụ thuộc code chỉ có trên `launch-hardening`: `ops/deploy_gas.js` trên `main` chưa có khối `authSmoke` (16 dòng khác, Task 2 trích đúng từng chữ bản `launch-hardening`), và `ops/test_logic.js` trên `main` thiếu 110 dòng (`16f1499`) nên mốc "8 pass" sai.
  KHÔNG commit thẳng lên `launch-hardening` — cây làm việc của user đang có ~40 file WIP. Làm trong worktree riêng.

- **Con số mốc đo trên `launch-hardening`:** `node --test ops/test_logic.js` → **8 pass, 0 fail**. Đo lại ở nền khác ra số khác thì dừng, đừng sửa con số trong plan cho khớp.

---

## File Structure

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `ops/deploy_gas.js` | sửa | Deploy + **rollback khi smoke đỏ** (mới). Thêm `module.exports` + guard `require.main`. |
| `ops/healer_gate.js` | tạo | Cổng quyết định green/red. Hàm thuần `gate()` + CLI wrapper. Không biết gì về Claude, Sheets, Telegram. |
| `ops/tests/deploy_rollback.test.js` | tạo | Test rollback bằng stub `globalThis.fetch`. |
| `ops/tests/healer_gate.test.js` | tạo | 14 dòng bảng test §12.1. |
| `.gitignore` | sửa | Thêm `ops/.healer-wt/`. |
| `ops/setup_healer_worktree.sh` | tạo | Dựng worktree 1 lần, idempotent. |

**Vì sao `healer_gate.js` tách riêng khỏi `deploy_gas.js`:** gate phải kiểm thử được mà không chạm mạng, và phải đọc được trong một lần nhìn. Deploy biết về API Google; gate biết về luật an toàn. Trộn vào nhau là mất cả hai.

**Lưu ý đường dẫn test:** `ops/tests/healer_gate.test.js` (test của chính cổng, người viết) **khác** `ops/tests/healer/<fix_id>.test.js` (test do healer sinh, Plan 2). Cổng phải xếp `ops/tests/healer_gate.test.js` là **red** — healer không được sửa test của cổng đang chặn nó. Task 5 kiểm điều này.

---

## Task 1: Mở nút test cho `deploy_gas.js`

Hiện `ops/deploy_gas.js` kết thúc bằng `main().catch(...)` chạy vô điều kiện và không export gì. `require('./deploy_gas.js')` trong test sẽ **deploy thật lên prod**. Phải chặn trước khi viết bất kỳ test nào.

**Files:**
- Modify: `ops/deploy_gas.js:94` (dòng cuối — `main().catch(...)`)

**Interfaces:**
- Consumes: không
- Produces: `module.exports = { deployBranch }` — Task 2 require vào. Chữ ký giữ nguyên: `deployBranch(name, cfg, accessToken, files, reportToken, dryRun)` → `Promise<void>`, throw `Error` khi hỏng.

- [ ] **Step 1: Viết test xác minh require KHÔNG chạy main()**

Tạo `ops/tests/deploy_rollback.test.js`:

```js
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
```

- [ ] **Step 2: Chạy test, xác minh nó TRƯỢT**

Run: `node --test ops/tests/deploy_rollback.test.js`
Expected: FAIL — `deployBranch` là `undefined` (chưa export). Có thể kèm lỗi từ `main()` tự chạy.

- [ ] **Step 3: Thêm export + guard**

Sửa dòng cuối `ops/deploy_gas.js`, thay:

```js
main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
```

thành:

```js
// Chỉ chạy khi gọi trực tiếp từ CLI. Khi bị require (test, healer) thì chỉ export —
// nếu không, require vào là deploy thật lên prod.
if (require.main === module) {
  main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
}

module.exports = { deployBranch };
```

- [ ] **Step 4: Chạy test, xác minh XANH**

Run: `node --test ops/tests/deploy_rollback.test.js`
Expected: PASS — 1 test.

- [ ] **Step 5: Xác minh CLI vẫn chạy được (không được làm hỏng đường dùng thật)**

Run: `node ops/deploy_gas.js --dry-run`
Expected: in `Targets: lamha [DRY-RUN]` và `[dry-run] sẽ push + version + retarget + smoke-test (bỏ qua API).` rồi `✅ Done (1 branch).` — **không** gọi API.

- [ ] **Step 6: Commit**

```bash
git add ops/deploy_gas.js ops/tests/deploy_rollback.test.js
git commit -m "refactor(ops): deploy_gas.js export deployBranch + guard require.main

Trước đó main() chạy vô điều kiện ở dòng cuối và không export gì →
require file này trong test là deploy thật lên prod. Chặn trước khi viết
test rollback."
```

---

## Task 2: Rollback khi smoke đỏ

**Bug đang sống:** `ops/deploy_gas.js:104-118` retarget deployment sang version mới **rồi mới** smoke test. Smoke đỏ thì `throw` và bỏ đó — **prod nằm nguyên trên version hỏng**, và không chỗ nào lưu version cũ để lùi về.

**Files:**
- Modify: `ops/deploy_gas.js` — hàm `deployBranch`, giữa bước "2. Create version" và "3. Retarget deployment"
- Test: `ops/tests/deploy_rollback.test.js`

**Interfaces:**
- Consumes: `deployBranch(name, cfg, accessToken, files, reportToken, dryRun)` từ Task 1
- Produces: hành vi mới — smoke đỏ → retarget về version cũ → throw `Error` có chuỗi `ROLLBACK`. Plan 2 (`/fix` skill) bắt chuỗi này để đặt `FIX_QUEUE.status = rolled_back`.

- [ ] **Step 1: Viết test trượt**

Thêm vào `ops/tests/deploy_rollback.test.js` (dưới test của Task 1):

```js
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
```

- [ ] **Step 2: Chạy test, xác minh 3 test mới TRƯỢT**

Run: `node --test ops/tests/deploy_rollback.test.js`
Expected: 1 pass (test Task 1), 3 fail. Lỗi kiểu `retargets.length` là 1 thay vì 2, và không có call GET nào.

- [ ] **Step 3: Cài rollback**

Trong `ops/deploy_gas.js`, hàm `deployBranch`, **chèn** khối này ngay sau `console.log(\`  ✓ version #${versionNumber}\`);` và **trước** `// 3. Retarget deployment`:

```js
  // 2b. Đọc version deployment ĐANG trỏ tới, TRƯỚC khi retarget — để còn đường lùi.
  //     Phải lấy ở đây: sau khi retarget thì API trả về chính version mới, mất mốc cũ.
  let prevVersion = null;
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (r.status === 200) {
    prevVersion = ((await r.json()).deploymentConfig || {}).versionNumber ?? null;
    console.log(`  ✓ version đang chạy: #${prevVersion}`);
  } else {
    console.log(`  ⚠️  không đọc được version cũ (HTTP ${r.status}) — sẽ KHÔNG rollback được nếu smoke đỏ`);
  }
```

Rồi **thay** toàn bộ khối `// 4. Smoke test` (từ `const cb = ...` tới `console.log('  🎉 smoke OK');`) bằng:

```js
  // 4. Smoke test. Retarget đã xảy ra → prod ĐANG chạy version mới. Đỏ = phải lùi ngay.
  const retargetTo = async (v) => {
    const rr = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentConfig: { scriptId, versionNumber: v, manifestFileName: 'appsscript', description: `v${v} ${name}` } })
    });
    return rr.status === 200;
  };

  const runSmoke = async () => {
    const cb = Math.floor(Math.random() * 1e9);
    const smoke = await fetch(`https://script.google.com/macros/s/${deploymentId}/exec?action=ping&_cb=${cb}`);
    const body = await smoke.text();
    if (smoke.status !== 200 || body.indexOf('"ok":true') === -1) {
      return `public smoke failed: HTTP ${smoke.status} - ${body.slice(0, 120)}`;
    }
    if (reportToken) {
      const authSmoke = await fetch(`https://script.google.com/macros/s/${deploymentId}/exec?action=orders&token=${reportToken}&_cb=${cb}`);
      const authBody = await authSmoke.text();
      if (authSmoke.status !== 200 || authBody.indexOf('"ok":true') === -1) {
        return `auth smoke failed (token connectivity check): HTTP ${authSmoke.status} - ${authBody.slice(0, 120)}`;
      }
    }
    return null;
  };

  const smokeErr = await runSmoke();
  if (!smokeErr) { console.log('  🎉 smoke OK'); return; }

  // Smoke đỏ → prod đang hỏng. Lùi về version cũ trước, kể chuyện sau.
  console.error(`  ❌ ${smokeErr}`);
  if (prevVersion === null) {
    throw new Error(`[${name}] ROLLBACK BẤT KHẢ: ${smokeErr} — không biết version cũ, prod ĐANG HỎNG ở v${versionNumber}. Vào editor lùi tay NGAY.`);
  }
  console.error(`  ↩︎  đang lùi về v${prevVersion}…`);
  const backOk = await retargetTo(prevVersion);
  if (!backOk) {
    throw new Error(`[${name}] ROLLBACK THẤT BẠI: ${smokeErr} — retarget về v${prevVersion} không xong, prod ĐANG HỎNG ở v${versionNumber}. Vào editor lùi tay NGAY.`);
  }
  const afterErr = await runSmoke();
  if (afterErr) {
    throw new Error(`[${name}] ROLLBACK xong nhưng v${prevVersion} vẫn đỏ: ${afterErr} — prod HỎNG, cần người.`);
  }
  console.error(`  ✓ ROLLBACK thành công về v${prevVersion}. Prod đã sống. Version hỏng: v${versionNumber}.`);
  throw new Error(`[${name}] ROLLBACK: deploy v${versionNumber} smoke đỏ (${smokeErr}), đã lùi về v${prevVersion}. Prod ổn, fix cần người xem.`);
```

- [ ] **Step 4: Chạy test, xác minh XANH**

Run: `node --test ops/tests/deploy_rollback.test.js`
Expected: PASS — 4 test.

- [ ] **Step 5: Xác minh suite cũ không đỏ**

Run: `node --test ops/test_logic.js`
Expected: `# pass 8` · `# fail 0`

- [ ] **Step 6: Xác minh dry-run vẫn sạch**

Run: `node ops/deploy_gas.js --dry-run`
Expected: `✅ Done (1 branch).`, không gọi API.

- [ ] **Step 7: Commit**

```bash
git add ops/deploy_gas.js ops/tests/deploy_rollback.test.js
git commit -m "fix(ops): deploy_gas.js lùi về version cũ khi smoke test đỏ

Trước: retarget deployment sang version mới RỒI mới smoke; smoke đỏ thì
throw và bỏ đó → prod nằm nguyên trên version hỏng, không lưu mốc để lùi.

Giờ: GET deployment lấy versionNumber đang chạy TRƯỚC khi retarget; smoke
đỏ thì retarget lùi + smoke lại + throw kèm chuỗi ROLLBACK. Không đọc được
version cũ thì nói thẳng 'ROLLBACK BẤT KHẢ, vào editor lùi tay NGAY' thay
vì im lặng.

Bug này có sẵn, độc lập với self-healing — nhưng healer sẽ deploy lúc không
ai ngồi đó nên phải vá trước.

Spec: docs/superpowers/specs/2026-07-16-self-healing-design.md §9.1"
```

---

## Task 3: Gate — cổng B (file diff chạm)

Cổng B: `git diff --name-only` phải ⊆ GREEN_LIST. Làm cổng B trước vì nó thuần, không đọc file nào.

**Files:**
- Create: `ops/healer_gate.js`
- Test: `ops/tests/healer_gate.test.js`

**Interfaces:**
- Consumes: không
- Produces:
  - `GREEN_LIST: string[]` — 11 đường dẫn, hằng số
  - `checkFiles(changedFiles: string[], fixId: string) -> { ok: boolean, reason: string }`
  - `reason` rỗng khi `ok === true`; khi red thì là chuỗi người đọc được nêu file vi phạm đầu tiên.

- [ ] **Step 1: Viết test trượt**

Tạo `ops/tests/healer_gate.test.js`:

```js
const test = require('node:test');
const assert = require('assert');
const { checkFiles, GREEN_LIST } = require('../healer_gate.js');

const FIX_ID = 'FIX-20260716-0001';

test('GREEN_LIST đúng 11 file trong spec §6', () => {
  assert.strictEqual(GREEN_LIST.length, 11);
  for (const f of GREEN_LIST) assert.ok(f.startsWith('gas/') && f.endsWith('.gs'), f);
});

test('§12.1 #1 — chỉ chạm file green → green', () => {
  const r = checkFiles(['gas/GbpPerf.gs'], FIX_ID);
  assert.strictEqual(r.ok, true, r.reason);
});

test('§12.1 #2 — chạm file đỏ → red', () => {
  const r = checkFiles(['gas/Payment.gs'], FIX_ID);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /Payment\.gs/);
});

test('§12.1 #3 — một file đỏ lẫn trong đám xanh → red cả', () => {
  const r = checkFiles(['gas/GbpPerf.gs', 'gas/Payment.gs'], FIX_ID);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /Payment\.gs/);
});

test('§12.1 #7 — file .gs MỚI không có trong green list → red', () => {
  const r = checkFiles(['gas/Foo.gs'], FIX_ID);
  assert.strictEqual(r.ok, false, 'file mới phải mặc định đỏ');
});

test('§12.1 #8 — chạm chính gate → red (healer không sửa cổng của mình)', () => {
  const r = checkFiles(['ops/healer_gate.js'], FIX_ID);
  assert.strictEqual(r.ok, false);
});

test('§12.1 #9 — chạm appsscript.json → red (manifest + OAuth scopes)', () => {
  const r = checkFiles(['gas/appsscript.json'], FIX_ID);
  assert.strictEqual(r.ok, false);
});

test('§12.1 #14 — diff rỗng → red (không fix thì không deploy)', () => {
  const r = checkFiles([], FIX_ID);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /rỗng|trống/i);
});

test('10 file Grok bỏ sót đều đỏ — default-deny bắt được mà không cần ai nhớ', () => {
  for (const f of ['Archive', 'Branches', 'CameraAI', 'Financials', 'LabelPrint',
                   'Menu', 'Meta', 'Notify', 'Waste', 'Zalo']) {
    const r = checkFiles([`gas/${f}.gs`], FIX_ID);
    assert.strictEqual(r.ok, false, `gas/${f}.gs phải đỏ`);
  }
});
```

- [ ] **Step 2: Chạy test, xác minh TRƯỢT**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: FAIL — `Cannot find module '../healer_gate.js'`

- [ ] **Step 3: Viết `ops/healer_gate.js` — phần cổng B**

```js
/**
 * healer_gate.js — cổng quyết định một auto-fix được tự push hay phải người duyệt.
 *
 * Hai cổng, AND, cả hai đều cơ học. KHÔNG có model nào phán ở đây — gate mềm
 * thì model tự thuyết phục mình rằng "chạm Payment.gs nhỏ thôi".
 *   Cổng A — nhãn lỗi: context của logError phải khai báo trong file green.
 *   Cổng B — file diff chạm: mọi file trong diff phải ⊆ GREEN_LIST.
 *
 * ⚠️ GREEN_LIST KHÔNG phải ranh giới bảo mật (spec §10.2). Mọi .gs chung 1
 *    runtime và đọc được CONFIG — backdoor trong Insight.gs vẫn lấy hết token.
 *    Cổng này chỉ chặn TAI NẠN. Chống kẻ tấn công = xác thực ingest, chỗ khác.
 *
 * Fail-closed: mọi nhánh không chắc chắn → red.
 * Spec: docs/superpowers/specs/2026-07-16-self-healing-design.md §6
 */

// Danh sách ĐÓNG. Mọi thứ khác đỏ, kể cả file mới. Hardcode ở đây, KHÔNG đọc từ
// CONFIG sheet hay file ngoài — cổng không được đổi bởi thứ mà healer ghi được.
// Suy từ code (spec §6): mỗi file dưới đây thoả cả 3 điều kiện — không đọc
// *_TOKEN/*_SECRET · không GHI vào ORDERS/CUSTOMERS/PROMOTIONS · thao tác huỷ
// chỉ trên tab của chính nó và tab đó kéo lại được từ nguồn ngoài.
const GREEN_LIST = [
  'gas/Insight.gs',
  'gas/Reviews.gs',
  'gas/Marketing.gs',     // đụng ORDERS ở :143 và :423 nhưng CHỈ ĐỌC — đã kiểm
  'gas/WebHits.gs',       // clearContent trên tab WEB_HITS của mình, re-pull được từ GA4
  'gas/WebTraffic.gs',    // clearContent trên tab của mình, re-pull được từ GA4
  'gas/GbpPerf.gs',
  'gas/RFM.gs',
  'gas/Maintenance.gs',   // lịch bảo trì thiết bị, KHÔNG phải dọn dữ liệu
  'gas/Dashboard.gs',
  'gas/Signage.gs',
  'gas/TikTokScrape.gs',
];

/**
 * Cổng B — mọi file trong diff phải green.
 * @param {string[]} changedFiles - đường dẫn từ gốc repo, như `git diff --name-only` trả về
 * @param {string} fixId - id phiên fix, dùng cho ngoại lệ test (Task 5)
 * @returns {{ok: boolean, reason: string}}
 */
function checkFiles(changedFiles, fixId) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { ok: false, reason: 'diff rỗng — không có fix thì không deploy' };
  }
  for (const f of changedFiles) {
    if (GREEN_LIST.includes(f)) continue;
    return { ok: false, reason: `file ngoài green list: ${f}` };
  }
  return { ok: true, reason: '' };
}

module.exports = { GREEN_LIST, checkFiles };
```

- [ ] **Step 4: Chạy test, xác minh XANH**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: PASS — 9 test.

- [ ] **Step 5: Commit**

```bash
git add ops/healer_gate.js ops/tests/healer_gate.test.js
git commit -m "feat(ops): healer_gate cổng B — file diff chạm phải ⊆ green list

GREEN_LIST 11 file, danh sách ĐÓNG, hardcode. Mọi thứ khác đỏ kể cả file
mới — default-deny. Test phủ 10 file từng bị bỏ sót khi phân loại tay.

Spec §6"
```

---

## Task 4: Gate — cổng A (nhãn lỗi → file khai báo)

`context` trong `logError` là **tên hàm** (`gbp.fetch`, `markOrderPaid.loyalty`, `doPost.telegram`), không phải tên file. Nên không liệt kê tay danh sách context — nó trôi lệch mỗi lần đổi code. Gate tự grep ra file khai báo.

**Files:**
- Modify: `ops/healer_gate.js` — thêm `contextToFiles`, `checkContext`, `gate`
- Test: `ops/tests/healer_gate.test.js`

**Interfaces:**
- Consumes: `GREEN_LIST`, `checkFiles` từ Task 3
- Produces:
  - `contextToFiles(context: string, gasDir: string) -> string[]` — đường dẫn tương đối gốc repo (`gas/X.gs`), rỗng nếu không tra ra
  - `checkContext(context: string, gasDir: string) -> { ok, reason }`
  - `gate({ context, changedFiles, fixId, gasDir }) -> { ok, reason }` — A **AND** B

- [ ] **Step 1: Viết test trượt**

Thêm vào `ops/tests/healer_gate.test.js`:

```js
const path = require('path');
const { contextToFiles, checkContext, gate } = require('../healer_gate.js');

const GAS_DIR = path.join(__dirname, '../../gas');

test('contextToFiles tra ra file khai báo context', () => {
  // gbp.fetch khai báo trong gas/GbpPerf.gs
  assert.deepStrictEqual(contextToFiles('gbp.fetch', GAS_DIR), ['gas/GbpPerf.gs']);
});

test('§12.1 #5 — context dính khoảng trắng đuôi phải trim, không được crash', () => {
  // Code thật có logError('meta.get ', ...) — dấu cách cuối là thật, không phải lỗi đánh máy.
  const files = contextToFiles('meta.get ', GAS_DIR);
  assert.deepStrictEqual(files, ['gas/Meta.gs'], 'trim rồi mới tra');
  // và tra bằng bản đã trim cũng phải ra kết quả y hệt
  assert.deepStrictEqual(contextToFiles('meta.get', GAS_DIR), ['gas/Meta.gs']);
});

test('§12.1 #6 — context không tra ra file → red (fail-closed)', () => {
  assert.deepStrictEqual(contextToFiles('khong.ton.tai', GAS_DIR), []);
  const r = checkContext('khong.ton.tai', GAS_DIR);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /không tra ra|không tìm thấy/i);
});

test('§12.1 #4 — context ở file đỏ → red dù diff sạch', () => {
  // markOrderPaid.loyalty khai báo trong gas/Orders.gs (đỏ)
  const r = gate({ context: 'markOrderPaid.loyalty', changedFiles: ['gas/Insight.gs'], fixId: FIX_ID, gasDir: GAS_DIR });
  assert.strictEqual(r.ok, false, 'cổng A phải chặn dù cổng B sạch');
  assert.match(r.reason, /Orders\.gs/);
});

test('§12.1 #5b — meta.get (file đỏ) + diff sạch → red', () => {
  const r = gate({ context: 'meta.get ', changedFiles: ['gas/Insight.gs'], fixId: FIX_ID, gasDir: GAS_DIR });
  assert.strictEqual(r.ok, false);
});

test('context ở NHIỀU file, một trong đó đỏ → red', () => {
  const files = contextToFiles('doPost', GAS_DIR);
  assert.ok(files.length >= 1);
  const r = checkContext('doPost', GAS_DIR);
  assert.strictEqual(r.ok, false, 'doPost ở Code.gs — đỏ');
});

test('§12.1 #1 đầy đủ — cổng A xanh AND cổng B xanh → green', () => {
  const r = gate({ context: 'gbp.fetch', changedFiles: ['gas/GbpPerf.gs'], fixId: FIX_ID, gasDir: GAS_DIR });
  assert.strictEqual(r.ok, true, r.reason);
});

test('§12.1 #2 đầy đủ — cổng A xanh nhưng cổng B đỏ → red', () => {
  const r = gate({ context: 'gbp.fetch', changedFiles: ['gas/Payment.gs'], fixId: FIX_ID, gasDir: GAS_DIR });
  assert.strictEqual(r.ok, false);
});
```

- [ ] **Step 2: Chạy test, xác minh TRƯỢT**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: FAIL — `contextToFiles is not a function`

- [ ] **Step 3: Cài cổng A**

Thêm vào `ops/healer_gate.js`, **trước** `module.exports`:

```js
const fs = require('fs');
const path = require('path');

/**
 * Tra file nào khai báo `logError('<context>'`.
 *
 * Vì sao grep thay vì liệt kê tay: context là TÊN HÀM (gbp.fetch,
 * markOrderPaid.loyalty), không phải tên file. Danh sách tay sẽ trôi lệch mỗi
 * lần đổi code; grep thì tự đúng.
 *
 * Chỉ bắt được context là chuỗi hằng. logError(bienSo, e) sẽ không tra ra →
 * trả [] → cổng A đỏ. Đúng ý: fail-closed.
 *
 * @returns {string[]} đường dẫn kiểu 'gas/X.gs', đã khử trùng, rỗng nếu không thấy
 */
function contextToFiles(context, gasDir) {
  const want = String(context == null ? '' : context).trim();
  if (!want) return [];

  const hits = new Set();
  for (const name of fs.readdirSync(gasDir)) {
    if (!name.endsWith('.gs')) continue;
    const src = fs.readFileSync(path.join(gasDir, name), 'utf8');
    // Bắt cả nháy đơn lẫn nháy kép. Chuỗi trong code có thể dính khoảng trắng
    // đuôi (logError('meta.get ', ...) là thật) → trim cả hai phía rồi mới so.
    const re = /logError\(\s*(['"])([^'"]*)\1/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[2].trim() === want) { hits.add('gas/' + name); break; }
    }
  }
  return [...hits].sort();
}

/**
 * Cổng A — file khai báo context phải green. Nhiều file thì TẤT CẢ phải green.
 */
function checkContext(context, gasDir) {
  const files = contextToFiles(context, gasDir);
  if (files.length === 0) {
    return { ok: false, reason: `context '${String(context).trim()}' không tra ra file khai báo — fail-closed` };
  }
  for (const f of files) {
    if (!GREEN_LIST.includes(f)) {
      return { ok: false, reason: `context '${String(context).trim()}' khai báo ở file ngoài green list: ${f}` };
    }
  }
  return { ok: true, reason: '' };
}

/**
 * Cổng A AND cổng B. Đây là hàm duy nhất bên ngoài nên gọi.
 */
function gate({ context, changedFiles, fixId, gasDir }) {
  const a = checkContext(context, gasDir);
  if (!a.ok) return { ok: false, reason: 'cổng A — ' + a.reason };
  const b = checkFiles(changedFiles, fixId);
  if (!b.ok) return { ok: false, reason: 'cổng B — ' + b.reason };
  return { ok: true, reason: '' };
}
```

Và đổi dòng export cuối file thành:

```js
module.exports = { GREEN_LIST, checkFiles, contextToFiles, checkContext, gate };
```

- [ ] **Step 4: Chạy test, xác minh XANH**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: PASS — 17 test.

- [ ] **Step 5: Kiểm tay bằng context thật, xác minh khớp code hiện tại**

Run:
```bash
node -e "
const p=require('path'), g=require('./ops/healer_gate.js'), D=p.join(process.cwd(),'gas');
for (const c of ['gbp.fetch','reviews.criticalRating','markOrderPaid.loyalty','doPost','meta.get ','_runStateSideEffects '])
  console.log(JSON.stringify(c).padEnd(28), '→', JSON.stringify(g.contextToFiles(c, D)));
"
```
Expected: `gbp.fetch` → `["gas/GbpPerf.gs"]` · `reviews.criticalRating` → `["gas/Reviews.gs"]` · `markOrderPaid.loyalty` → `["gas/Orders.gs"]` · `doPost` → `["gas/Code.gs"]` · `meta.get ` → `["gas/Meta.gs"]` · `_runStateSideEffects ` → mảng không rỗng.

Nếu bất kỳ dòng nào ra `[]`, regex sai — sửa `contextToFiles` rồi chạy lại, **không** nới GREEN_LIST.

- [ ] **Step 6: Commit**

```bash
git add ops/healer_gate.js ops/tests/healer_gate.test.js
git commit -m "feat(ops): healer_gate cổng A — context phải khai báo trong file green

context của logError là tên hàm (gbp.fetch, markOrderPaid.loyalty), không
phải tên file → gate grep ra file khai báo thay vì liệt kê tay (danh sách
tay sẽ trôi lệch khi đổi code).

Trim hai đầu trước khi so: code thật đang có logError('meta.get ', ...) và
logError('_runStateSideEffects ', ...) dính khoảng trắng đuôi — so khớp
chính xác sẽ trượt câm.

Context không tra ra file (vd truyền biến) → đỏ. Fail-closed.

Spec §6.0"
```

---

## Task 5: Gate — ngoại lệ test chỉ-thêm-mới

Spec D6 bắt mỗi fix kèm 1 test trượt-trước-fix, nhưng `ops/` là đỏ. Ngoại lệ hẹp: healer chỉ được **tạo mới** đúng `ops/tests/healer/<fix_id>.test.js` của chính phiên nó. Không sửa, không xoá test cũ — nếu không nó gỡ được chính cái lưới đang chặn nó.

**Files:**
- Modify: `ops/healer_gate.js` — `checkFiles`
- Test: `ops/tests/healer_gate.test.js`

**Interfaces:**
- Consumes: `checkFiles(changedFiles, fixId)` từ Task 3
- Produces: chữ ký `checkFiles` **đổi** — thêm tham số 3:
  `checkFiles(changedFiles: string[], fixId: string, deletedOrModified: string[] = []) -> { ok, reason }`
  `deletedOrModified` = file đã tồn tại từ trước mà diff sửa/xoá (`git diff --name-only --diff-filter=MD`). Plan 2 truyền vào từ `/fix`. `gate()` nhận thêm khoá `deletedOrModified` và chuyển tiếp.

- [ ] **Step 1: Viết test trượt**

Thêm vào `ops/tests/healer_gate.test.js`:

```js
test('§12.1 #10 — file test mới khớp fix_id phiên này → green', () => {
  const r = checkFiles(['gas/GbpPerf.gs', `ops/tests/healer/${FIX_ID}.test.js`], FIX_ID);
  assert.strictEqual(r.ok, true, r.reason);
});

test('§12.1 #11 — file test mang fix_id phiên KHÁC → red', () => {
  const r = checkFiles(['gas/GbpPerf.gs', 'ops/tests/healer/FIX-20260101-9999.test.js'], FIX_ID);
  assert.strictEqual(r.ok, false, 'chỉ được tạo test của chính mình');
});

test('§12.1 #12 — sửa test cũ ops/test_logic.js → red', () => {
  const r = checkFiles(['gas/GbpPerf.gs', 'ops/test_logic.js'], FIX_ID);
  assert.strictEqual(r.ok, false);
});

test('§12.1 #13 — xoá/sửa test healer cũ → red (không gỡ được lưới của mình)', () => {
  const r = checkFiles(
    ['gas/GbpPerf.gs', `ops/tests/healer/${FIX_ID}.test.js`],
    FIX_ID,
    [`ops/tests/healer/${FIX_ID}.test.js`]   // file này ĐÃ tồn tại từ trước → bị sửa, không phải tạo mới
  );
  assert.strictEqual(r.ok, false, 'ngoại lệ chỉ cho TẠO MỚI');
  assert.match(r.reason, /sửa|xoá|đã tồn tại/i);
});

test('test của chính cổng KHÔNG được hưởng ngoại lệ → red', () => {
  const r = checkFiles(['gas/GbpPerf.gs', 'ops/tests/healer_gate.test.js'], FIX_ID);
  assert.strictEqual(r.ok, false, 'healer không sửa test của cổng đang chặn nó');
});

test('ngoại lệ không mở đường cho file thường trong ops/tests/healer/', () => {
  const r = checkFiles(['gas/GbpPerf.gs', `ops/tests/healer/${FIX_ID}.js`], FIX_ID);
  assert.strictEqual(r.ok, false, 'phải đúng đuôi .test.js');
});

test('chỉ có test mới, không có fix → red (diff phải chứa fix thật)', () => {
  const r = checkFiles([`ops/tests/healer/${FIX_ID}.test.js`], FIX_ID);
  assert.strictEqual(r.ok, false, 'test không kèm fix thì không deploy');
});
```

- [ ] **Step 2: Chạy test, xác minh TRƯỢT**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: FAIL — test §12.1 #10 đỏ vì `checkFiles` chưa biết ngoại lệ.

- [ ] **Step 3: Cài ngoại lệ**

Thay toàn bộ hàm `checkFiles` trong `ops/healer_gate.js` bằng:

```js
/**
 * Đường dẫn DUY NHẤT healer được tạo file ngoài GREEN_LIST.
 * Chỉ TẠO MỚI, đúng fix_id của phiên đang chạy. Không sửa, không xoá.
 * Vì sao chặt: cho healer sửa test cũ = cho nó gỡ chính cái lưới đang chặn nó.
 */
function isOwnNewTestFile(f, fixId) {
  return f === `ops/tests/healer/${fixId}.test.js`;
}

/**
 * Cổng B — mọi file trong diff phải green, trừ đúng 1 ngoại lệ test (spec §6.1).
 * @param {string[]} changedFiles - `git diff --name-only`
 * @param {string} fixId
 * @param {string[]} deletedOrModified - `git diff --name-only --diff-filter=MD`,
 *   tức file ĐÃ tồn tại từ trước mà diff này sửa hoặc xoá
 */
function checkFiles(changedFiles, fixId, deletedOrModified = []) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { ok: false, reason: 'diff rỗng — không có fix thì không deploy' };
  }
  const touchedGas = [];
  for (const f of changedFiles) {
    if (GREEN_LIST.includes(f)) { touchedGas.push(f); continue; }
    if (isOwnNewTestFile(f, fixId)) {
      if (deletedOrModified.includes(f)) {
        return { ok: false, reason: `${f} đã tồn tại từ trước — ngoại lệ test chỉ cho TẠO MỚI, không cho sửa/xoá` };
      }
      continue;
    }
    return { ok: false, reason: `file ngoài green list: ${f}` };
  }
  if (touchedGas.length === 0) {
    return { ok: false, reason: 'diff chỉ có test, không có fix — không deploy' };
  }
  return { ok: true, reason: '' };
}
```

Và trong `gate()`, chuyển tiếp tham số mới — thay dòng `const b = checkFiles(changedFiles, fixId);` bằng:

```js
  const b = checkFiles(changedFiles, fixId, deletedOrModified);
```

và đổi chữ ký `gate` thành:

```js
function gate({ context, changedFiles, fixId, gasDir, deletedOrModified = [] }) {
```

- [ ] **Step 4: Chạy test, xác minh XANH**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: PASS — 24 test.

- [ ] **Step 5: Chạy toàn bộ test, xác minh không đỏ chỗ nào**

Run: `node --test ops/test_logic.js ops/tests/healer_gate.test.js ops/tests/deploy_rollback.test.js`
Expected: `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add ops/healer_gate.js ops/tests/healer_gate.test.js
git commit -m "feat(ops): healer_gate ngoại lệ test — chỉ tạo mới ops/tests/healer/<fix_id>.test.js

Spec D6 bắt mỗi fix kèm 1 test trượt-trước-fix, nhưng ops/ là đỏ. Ngoại lệ
hẹp nhất có thể: healer chỉ tạo MỚI đúng file test mang fix_id của phiên nó.
Sửa/xoá test cũ (kể cả test healer cũ, kể cả test của chính cổng) → đỏ.

Cho healer sửa test cũ = cho nó gỡ chính cái lưới đang chặn nó.

Diff chỉ có test mà không có fix cũng đỏ.

Spec §6.1"
```

---

## Task 6: CLI của gate + worktree

Gói lại thành thứ Plan 2 gọi được: CLI đọc `git diff` thật, và worktree riêng để healer không chạm cây làm việc của user.

**Files:**
- Modify: `ops/healer_gate.js` — thêm CLI ở cuối
- Create: `ops/setup_healer_worktree.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `gate()` từ Task 4/5
- Produces:
  - CLI: `node ops/healer_gate.js --context=<ctx> --fix-id=<id> [--base=origin/main] [--repo=<path>]` → exit 0 green / exit 1 red, in lý do ra stdout. Plan 2 (`/fix`) gọi đúng dạng này.
  - `ops/.healer-wt/` — worktree bám `origin/main`, gitignore

- [ ] **Step 1: Thêm CLI vào cuối `ops/healer_gate.js`**

Chèn **trước** `module.exports`:

```js
// ── CLI ────────────────────────────────────────────────────────────────
// node ops/healer_gate.js --context=gbp.fetch --fix-id=FIX-20260716-0001
// exit 0 = green (được tự push) · exit 1 = red (phải người duyệt)
function _cli() {
  const { execFileSync } = require('child_process');
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  const base = args.base || 'origin/main';
  const repo = args.repo || process.cwd();
  const gasDir = path.join(repo, 'gas');

  if (!args.context || !args['fix-id']) {
    console.log('RED · thiếu --context hoặc --fix-id');
    process.exit(1);
  }

  const git = (a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);

  let changedFiles, deletedOrModified;
  try {
    changedFiles = git(['diff', '--name-only', `${base}...HEAD`]);
    deletedOrModified = git(['diff', '--name-only', '--diff-filter=MD', `${base}...HEAD`]);
  } catch (e) {
    // Không đọc được diff thì không biết fix chạm gì → đỏ. Fail-closed.
    console.log('RED · không đọc được git diff: ' + (e.message || e));
    process.exit(1);
  }

  const r = gate({ context: args.context, changedFiles, fixId: args['fix-id'], gasDir, deletedOrModified });
  console.log((r.ok ? 'GREEN · ' : 'RED · ') + (r.reason || `${changedFiles.length} file, tất cả green`));
  process.exit(r.ok ? 0 : 1);
}

if (require.main === module) _cli();
```

- [ ] **Step 2: Xác minh CLI red khi thiếu tham số**

Run: `node ops/healer_gate.js; echo "exit=$?"`
Expected: `RED · thiếu --context hoặc --fix-id` và `exit=1`

- [ ] **Step 3: Xác minh CLI red với context ở file đỏ**

Run: `node ops/healer_gate.js --context=markOrderPaid.loyalty --fix-id=FIX-20260716-0001; echo "exit=$?"`
Expected: dòng bắt đầu `RED · cổng A —` nêu `gas/Orders.gs`, và `exit=1`

- [ ] **Step 4: Xác minh require CLI không tự chạy**

Run: `node --test ops/tests/healer_gate.test.js`
Expected: PASS — 24 test (guard `require.main` giữ CLI im khi bị require)

- [ ] **Step 5: Viết `ops/setup_healer_worktree.sh`**

```bash
#!/bin/bash
# setup_healer_worktree.sh — dựng worktree riêng cho healer. Chạy 1 lần, idempotent.
#
# Vì sao cần: dispatcher.sh có `cd "$(dirname "$0")/.."` → chạy trong CÂY LÀM VIỆC
# CỦA USER, nơi thường xuyên có vài chục file WIP chưa commit. Cho healer
# `git checkout -b` + commit ở đó = nó cõng WIP của user lên prod, hoặc chết vì
# conflict, hoặc user checkout giữa chừng và healer deploy nửa vời.
#
# Branch-per-fix KHÔNG đủ — nó chỉ tách các fix với nhau, không tách healer với người.
#
# Spec: docs/superpowers/specs/2026-07-16-self-healing-design.md §8

set -euo pipefail
cd "$(dirname "$0")/.."
WT="ops/.healer-wt"

if [ -d "$WT" ] && git worktree list --porcelain | grep -q "worktree $(pwd)/$WT"; then
  echo "✓ worktree đã có: $WT"
else
  git fetch origin main
  git worktree add --detach "$WT" origin/main
  echo "✓ đã tạo worktree: $WT (detached ở origin/main)"
fi

git -C "$WT" status --short
echo "✓ cây của user KHÔNG bị chạm — healer chỉ làm việc trong $WT"
```

- [ ] **Step 6: Thêm gitignore**

Thêm vào cuối `.gitignore`:

```
# Worktree riêng của healer (spec self-healing §8) — không bao giờ commit
ops/.healer-wt/
```

- [ ] **Step 7: Chạy setup, xác minh worktree sống và cây user sạch**

Run:
```bash
BEFORE=$(git status --porcelain | wc -l)
bash ops/setup_healer_worktree.sh
AFTER=$(git status --porcelain | wc -l)
echo "file bẩn trước=$BEFORE sau=$AFTER (phải bằng nhau)"
git worktree list
```
Expected: `✓ đã tạo worktree` · `git worktree list` hiện 2 dòng, dòng thứ 2 là `ops/.healer-wt` detached · **`BEFORE` bằng `AFTER`** — cây user không đổi.

- [ ] **Step 8: Xác minh idempotent**

Run: `bash ops/setup_healer_worktree.sh`
Expected: `✓ worktree đã có: ops/.healer-wt` — không lỗi, không tạo lại.

- [ ] **Step 9: Xác minh gate chạy được TRONG worktree (đường Plan 2 sẽ dùng)**

Run: `node ops/healer_gate.js --context=gbp.fetch --fix-id=FIX-20260716-0001 --repo="$(pwd)/ops/.healer-wt"; echo "exit=$?"`
Expected: `RED · cổng B — diff rỗng — không có fix thì không deploy` và `exit=1` — worktree đang ở đúng `origin/main` nên diff rỗng. **Red ở đây là kết quả ĐÚNG.**

- [ ] **Step 10: Commit**

```bash
git add ops/healer_gate.js ops/setup_healer_worktree.sh .gitignore
git commit -m "feat(ops): CLI cho healer_gate + worktree riêng cho healer

CLI: node ops/healer_gate.js --context=X --fix-id=Y [--repo=path]
     exit 0 green, exit 1 red. Đọc git diff không được → red (fail-closed).

Worktree: dispatcher.sh chạy trong cây làm việc của user (thường có vài chục
file WIP). Healer commit ở đó = cõng WIP của user lên prod. ops/.healer-wt
bám origin/main, gitignore, dựng bằng setup_healer_worktree.sh (idempotent).

Branch-per-fix không đủ — chỉ tách fix với fix, không tách healer với người.

Spec §8"
```

---

## Task 7: Chốt sổ — lưới xanh toàn tập

Không code mới. Xác minh cả ba mảnh khớp nhau và Plan 2 có nền để đứng.

**Files:** không đổi file nào

- [ ] **Step 1: Chạy toàn bộ test**

Run: `node --test ops/test_logic.js ops/tests/healer_gate.test.js ops/tests/deploy_rollback.test.js`
Expected: `# pass 36` · `# fail 0`

Cộng lại: 8 (suite cũ) + 24 gate (9 Task 3 + 8 Task 4 + 7 Task 5) + 4 rollback (1 Task 1 + 3 Task 2) = **36**. Lệch số này = có test bị bỏ quên hoặc viết trùng — đừng bỏ qua.

- [ ] **Step 2: Đối chiếu bảng test spec §12.1 — 14 dòng, dòng nào cũng phải có test**

Đọc `docs/superpowers/specs/2026-07-16-self-healing-design.md` §12.1, đánh dấu từng dòng vào test tương ứng trong `ops/tests/healer_gate.test.js`. Dòng nào chưa có test → **viết ngay, đừng để sang Plan 2**.

- [ ] **Step 3: Xác minh gate không đọc gì ngoài repo**

Run: `grep -nE "getConfig|CONFIG|process\.env|readFileSync\(.*\.\./\.\." ops/healer_gate.js || echo "✓ sạch"`
Expected: `✓ sạch` — gate chỉ đọc `gas/*.gs` và `git diff`. Nếu có dòng nào hiện ra, gate đang đọc thứ healer ghi được → **hỏng cả mô hình**, sửa ngay.

- [ ] **Step 4: Xác minh không có gì tự chạy**

Run: `grep -rn "healer_gate\|healer-wt" ops/dispatcher.sh gas/*.gs 2>/dev/null || echo "✓ chưa nối vào tự động hoá — đúng ý Plan 1"`
Expected: `✓ chưa nối vào tự động hoá` — Plan 1 chỉ dựng lưới, Plan 2 mới nối dây.

- [ ] **Step 5: Mở PR**

```bash
git push -u origin feat/healer-safety-net
gh pr create --title "feat(ops): lưới an toàn self-healing (Plan 1/3)" --body "$(cat <<'EOF'
Plan 1/3 của hệ self-healing. **Chưa có gì tự chạy** — plan này chỉ dựng lưới.

## Ship được ngay, độc lập với self-healing

`ops/deploy_gas.js` có bug đang sống: retarget deployment sang version mới **rồi mới** smoke test; smoke đỏ thì `throw` và bỏ đó → **prod nằm nguyên trên version hỏng**, không lưu mốc nào để lùi. Giờ nó GET version đang chạy trước khi retarget, smoke đỏ thì lùi + smoke lại + throw kèm chuỗi `ROLLBACK`.

## Cổng an toàn

`ops/healer_gate.js` — hai cổng AND, cả hai cơ học, không model nào phán:
- **Cổng A** — `context` của `logError` phải khai báo trong file green. Context là *tên hàm* nên gate grep ra file thay vì liệt kê tay. Trim hai đầu (code thật có `logError('meta.get ', …)` dính khoảng trắng).
- **Cổng B** — mọi file trong diff ⊆ GREEN_LIST (11 file). Default-deny: file mới cũng đỏ.
- Ngoại lệ duy nhất: healer tạo mới `ops/tests/healer/<fix_id>.test.js` của chính nó. Không sửa/xoá test cũ.

⚠️ GREEN_LIST **không phải ranh giới bảo mật** — mọi `.gs` chung runtime + đọc được CONFIG. Cổng chặn *tai nạn*, không chặn kẻ tấn công. Chống tấn công = xác thực ingest, chỗ khác (spec §10.2).

## Worktree

`dispatcher.sh` chạy trong cây làm việc của user (thường vài chục file WIP). `ops/.healer-wt` bám `origin/main` để healer không bao giờ chạm cây đó.

## Test

`node --test ops/test_logic.js ops/tests/healer_gate.test.js ops/tests/deploy_rollback.test.js` → 32 pass, 0 fail. Bảng test gate phủ đủ 14 dòng spec §12.1.

Spec: `docs/superpowers/specs/2026-07-16-self-healing-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Sau Plan 1

**Plan 2 — Vòng fix tầng xanh:** `FIX_QUEUE` tab · `enqueueFix` (dedup theo context, trần 2 attempts, cooldown 3 deploy/giờ) · `logError` param snapshot + che PII · skill `/fix` chạy trong worktree · `dispatcher.sh` route fix. Xong Plan 2 thì tầng xanh tự sửa, tầng đỏ đậu ở `awaiting_approval`.

**Đếm version GAS (spec §9.2) → giao Plan 2, không phải Plan 1.** Ghi rõ ra đây vì §14 của spec không xếp chỗ cho nó — dễ rơi. Nội dung: `versions.list` đếm số version, chạm ngưỡng (CONFIG, khởi điểm 150) → `sendTelegramAlert`. Để Plan 2 vì nó cần CONFIG sheet + Telegram, cả hai đều ở phía GAS; `deploy_gas.js` phía node không với tới. (Nhắc lại: **không dọn được** version — Apps Script API không có `versions.delete`. Chỉ đếm và kêu.)

**Plan 3 — Duyệt qua Telegram:** webhook + `HEALER_WEBHOOK_SECRET` + verify `chat_id` chủ + nút inline `[DUYỆT]` `[BỎ]` + đường `approved` → deploy.

**Chưa làm ở cả 3:** `web:*` (spec §11), Mac Mini python, auto-fix đa chi nhánh.
