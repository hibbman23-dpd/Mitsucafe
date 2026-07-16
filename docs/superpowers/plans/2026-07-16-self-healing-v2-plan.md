# Self-Healing v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây vòng self-healing v2: lỗi GAS → `FIX_QUEUE` → user macOS riêng `_healer` (không credential) chạy `/fix` chẩn đoán + viết test + fix → push nhánh chờ duyệt → Telegram → anh iu bấm DUYỆT → tiến trình *khác* (user thường, có credential) deploy sau khi xác nhận invariant base==prod.

**Architecture:** 2 tiến trình OS độc lập. `_healer` (build fix, không credential, giải C2 bằng cấu trúc chứ không phải lọc nội dung) và user thường (deploy sau duyệt, có `~/.clasprc.json`). Kết nối qua `FIX_QUEUE` tab (Sheets) + token hẹp `HEALER_QUEUE_TOKEN` chỉ cho 2 action. Không có tầng auto-push (mọi fix qua người duyệt).

**Tech Stack:** Google Apps Script (gas/*.gs), Node.js (`node:test`, fetch), Python 3 stdlib (`unittest`), bash (cron/launchd), Claude Code CLI (`--permission-mode dontAsk`).

## Global Constraints

- **KHÔNG bao giờ chạy `python3 ops/gas_push.py --deploy` hay `node ops/deploy_gas.js` (thiếu `--dry-run`) trong lúc phát triển/test task này** — cả hai deploy thẳng lên prod. Test bằng cách `require()`/import module rồi mock `fetch`, không gọi CLI thật.
- **KHÔNG `git add -A`/`git add .`/`git commit -a`/`git stash`/`git checkout`** trong `/Users/dpd/Projects/lamha-kissaten` (cây chính có WIP không liên quan). Luôn `git add <path cụ thể>`.
- **`git fetch origin` trước mọi so sánh `origin/*`.** Nhánh `launch-hardening` cục bộ đã từng phân kỳ khỏi origin.
- Push code thật lên PR: dùng worktree `/Users/dpd/Projects/lamha-kissaten-healer` (đã có sẵn, khác với `_healer` OS user mô tả trong plan này — xem ghi chú Task 6), theo cách đã dùng ở phiên trước: `git fetch -q origin && git checkout -q -B <tên> origin/launch-hardening && git cherry-pick <sha>`.
- **KHÔNG đụng CONFIG sheet prod, không tự tạo user macOS, không tự đổi GitHub branch protection.** Các việc này đánh dấu **⚠️ THAO TÁC THỦ CÔNG** — chief trình bày lệnh chính xác, anh iu/chief tự tay chạy, không giao subagent code.
- Mọi test GAS logic theo pattern có sẵn: mock global (`SpreadsheetApp`, `PropertiesService`, ...) rồi `vm`/`require` nạp file `.gs` — xem `ops/test_logic.js` hiện có.
- File nào sửa, nêu rõ dựa trên **`origin/launch-hardening`** (nguồn sự thật), không phải cây `launch-hardening` cục bộ (có thể đã tụt hậu — luôn `git fetch` + `git show origin/launch-hardening:<path>` để lấy bản mới nhất trước khi sửa).

---

## Task 1: `logError` — thêm tham số `snapshot` + hàm che PII

**Files:**
- Modify: `gas/Utils.gs` (hàm `logError`, hiện ở dòng ~101, dựa trên `origin/launch-hardening`)
- Test: `ops/test_logic.js` (thêm test case vào file hiện có)

**Interfaces:**
- Produces: `logError(context, err, snapshot)` — tham số 3 optional, backward-compatible với mọi lệnh gọi cũ (2 tham số vẫn chạy y hệt).
- Produces: `redactSnapshot(snapshot)` — hàm thuần (không side-effect), input object bất kỳ, output string JSON đã che PII, cắt tại 2000 ký tự.

- [ ] **Step 1: Lấy bản `logError` mới nhất từ origin, đọc để không sửa nhầm bản cũ**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git fetch -q origin
git show origin/launch-hardening:gas/Utils.gs | sed -n '90,140p'
```
Xác nhận cột hiện có của `ERROR_LOG`: `['timestamp', 'context', 'error', 'stack']`.

- [ ] **Step 2: Viết test trượt cho `redactSnapshot`**

Thêm vào cuối `ops/test_logic.js` (trước dòng cuối cùng nếu có runner riêng, hoặc theo format `test(...)` đã dùng trong file):

```js
test('redactSnapshot che SĐT giữ 4 số cuối, xoá tên/địa chỉ, giữ order_id/sku', () => {
  loadScript('Utils.gs');
  const input = {
    order_id: 'ORD-001',
    customer_id: '0987654321',
    customer_name: 'Nguyễn Văn A',
    delivery_address: '123 Lâm Hà',
    notes: 'giao trước 8h',
    items: [{ sku: 'CF01', qty: 2 }],
    status: 'NEW'
  };
  const out = JSON.parse(redactSnapshot(input));
  assert.strictEqual(out.customer_id, '****4321');
  assert.strictEqual(out.customer_name, '[redacted]');
  assert.strictEqual(out.delivery_address, '[redacted]');
  assert.strictEqual(out.notes, '[redacted]');
  assert.strictEqual(out.order_id, 'ORD-001');
  assert.deepStrictEqual(out.items, [{ sku: 'CF01', qty: 2 }]);
  assert.strictEqual(out.status, 'NEW');
});

test('redactSnapshot cắt tại 2000 ký tự', () => {
  loadScript('Utils.gs');
  const huge = { notes_raw: 'x'.repeat(5000) };
  const out = redactSnapshot(huge);
  assert.ok(out.length <= 2000);
});

test('logError param snapshot optional — 2 tham số vẫn chạy như cũ', () => {
  loadScript('Utils.gs');
  // không throw khi gọi 2 tham số
  assert.doesNotThrow(() => logError('test.context', new Error('boom')));
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL (hàm chưa tồn tại)**

Run: `node --test ops/test_logic.js 2>&1 | grep -A3 "redactSnapshot"`
Expected: `redactSnapshot is not defined` hoặc tương tự — FAIL.

- [ ] **Step 4: Viết `redactSnapshot` + sửa `logError` trong `gas/Utils.gs`**

Thêm hàm mới ngay trước `logError`:

```js
/**
 * Che PII trong snapshot trước khi ghi ERROR_LOG. Chạy TRƯỚC khi ghi sheet —
 * PII không bao giờ chạm ERROR_LOG hay prompt /fix.
 */
var SNAPSHOT_PII_FIELDS = ['customer_name', 'delivery_address', 'notes', 'notes_raw', 'address'];
function redactSnapshot(snapshot) {
  if (!snapshot) return '';
  var copy = {};
  for (var key in snapshot) {
    if (!snapshot.hasOwnProperty(key)) continue;
    var val = snapshot[key];
    if (key === 'customer_id' && typeof val === 'string' && val.length >= 4) {
      copy[key] = '****' + val.slice(-4);
    } else if (SNAPSHOT_PII_FIELDS.indexOf(key) !== -1) {
      copy[key] = '[redacted]';
    } else {
      copy[key] = val;
    }
  }
  var out = JSON.stringify(copy);
  if (out.length > 2000) out = out.slice(0, 2000);
  return out;
}
```

Sửa signature `logError` (thêm tham số 3, thêm cột `snapshot` khi tạo sheet mới, `appendRow` thêm giá trị):

```js
function logError(context, err, snapshot) {
  var msg = String((err && err.message) || err);
  var stack = String((err && err.stack) || '');
  var snapshotStr = snapshot ? redactSnapshot(snapshot) : '';
  var nowIso = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ERROR_LOG');
  if (!sheet) {
    sheet = ss.insertSheet('ERROR_LOG');
    sheet.appendRow(['timestamp', 'context', 'error', 'stack', 'snapshot']);
  }
  sheet.appendRow([nowIso, context, msg, stack, snapshotStr]);
  // ... phần throttle Telegram giữ nguyên, không đổi ...
```

Giữ nguyên toàn bộ phần throttle Telegram phía dưới — chỉ thêm dòng `snapshotStr` vào tham số và cột `appendRow`.

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

Run: `node --test ops/test_logic.js`
Expected: tất cả test PASS, bao gồm 3 test mới.

- [ ] **Step 6: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add gas/Utils.gs ops/test_logic.js
git commit -m "feat(healer): logError nhận snapshot optional + redactSnapshot che PII"
```

---

## Task 2: `FIX_QUEUE` tab + `enqueueFix` — dedup, trần, cooldown

**Files:**
- Create: `gas/Healer.gs`
- Test: `ops/test_logic.js` (thêm test case, load thêm `Healer.gs`)

**Interfaces:**
- Consumes: `getConfig(key)` (`gas/Utils.gs`), `redactSnapshot` (Task 1)
- Produces: `enqueueFix(context, errorMessage, stackTrace, snapshot)` → trả `{ ok: true, fix_id }` hoặc `{ ok: false, reason }` (`dedup` / `attempts_exceeded` / `cooldown`)
- Produces: `FIX_QUEUE_STATUSES` — mảng const các status hợp lệ, dùng lại ở Task 3/4.

- [ ] **Step 1: Viết test trượt cho dedup + trần + cooldown**

Thêm vào `ops/test_logic.js`. Cần mock `SpreadsheetApp` trả về rows giả — file hiện tại mock global đơn giản; thêm 1 mock cục bộ trong test này (không đổi mock global, tránh vỡ test khác):

```js
test('enqueueFix: dedup — context đã có fix mở thì bỏ qua', () => {
  loadScript('Healer.gs');
  const rows = [
    ['fix_id', 'error_id', 'context', 'error_message', 'stack_trace', 'snapshot', 'status', 'git_branch', 'base_commit_hash', 'deployed_version', 'attempts', 'created_at', 'updated_at'],
    ['FIX-1', 'ERR-1', 'gbp.fetch', 'old err', '', '', 'awaiting_approval', '', '', '', 1, '', '']
  ];
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => rows }),
        appendRow: () => { throw new Error('không được append khi dedup'); }
      } : null
    })
  };
  try {
    const res = enqueueFix('gbp.fetch', 'new err', '', {});
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'dedup');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('enqueueFix: attempts >= 2 (trần) → manual, không enqueue mới', () => {
  loadScript('Healer.gs');
  const rows = [
    ['fix_id', 'error_id', 'context', 'error_message', 'stack_trace', 'snapshot', 'status', 'git_branch', 'base_commit_hash', 'deployed_version', 'attempts', 'created_at', 'updated_at'],
    ['FIX-1', 'ERR-1', 'gbp.fetch', 'old err', '', '', 'manual', '', '', '', 2, '', '']
  ];
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => rows }),
        appendRow: () => { throw new Error('không được append khi đã manual'); }
      } : null
    })
  };
  const res = enqueueFix('gbp.fetch', 'new err', '', {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'attempts_exceeded');
});

test('enqueueFix: context mới, không trùng → tạo fix_id mới', () => {
  loadScript('Healer.gs');
  let appended = null;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => [['fix_id','error_id','context','error_message','stack_trace','snapshot','status','git_branch','base_commit_hash','deployed_version','attempts','created_at','updated_at']] }),
        appendRow: (row) => { appended = row; }
      } : null
    })
  };
  const res = enqueueFix('meta.get', 'lỗi lạ', 'stack...', { order_id: 'X' });
  assert.strictEqual(res.ok, true);
  assert.ok(res.fix_id.indexOf('FIX-') === 0);
  assert.ok(appended, 'phải appendRow');
  assert.strictEqual(appended[2], 'meta.get');
  assert.strictEqual(appended[6], 'pending');
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --test ops/test_logic.js 2>&1 | grep -A3 "enqueueFix"`
Expected: `enqueueFix is not defined` — FAIL.

- [ ] **Step 3: Viết `gas/Healer.gs`**

```js
/**
 * Healer.gs — vòng self-healing v2. FIX_QUEUE + enqueueFix.
 * KHÔNG chứa logic deploy — deploy tách sang tiến trình khác (xem plan Task 5).
 */
var FIX_QUEUE_OPEN_STATUSES = ['pending', 'fixing', 'awaiting_approval', 'approved'];
var FIX_QUEUE_MAX_ATTEMPTS = 2;
var FIX_QUEUE_COLUMNS = ['fix_id', 'error_id', 'context', 'error_message', 'stack_trace',
  'snapshot', 'status', 'git_branch', 'base_commit_hash', 'deployed_version',
  'attempts', 'created_at', 'updated_at'];

function _getFixQueueSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FIX_QUEUE');
  if (!sheet) {
    sheet = ss.insertSheet('FIX_QUEUE');
    sheet.appendRow(FIX_QUEUE_COLUMNS);
  }
  return sheet;
}

function _generateFixId() {
  var now = new Date();
  var ymd = Utilities.formatDate(now, 'GMT+7', 'yyyyMMdd');
  var rand = Math.floor(Math.random() * 9000 + 1000);
  return 'FIX-' + ymd + '-' + rand;
}

/**
 * enqueueFix — gọi từ logError khi muốn đẩy lỗi vào vòng /fix.
 * KHÔNG tự gọi trong logError() (tách rời cố ý — không phải mọi lỗi đều đáng tự sửa,
 * caller quyết định context nào enqueue).
 */
function enqueueFix(context, errorMessage, stackTrace, snapshot) {
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var attemptsForContext = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowContext = row[2];
    var rowStatus = row[6];
    var rowAttempts = Number(row[10]) || 0;
    if (rowContext !== context) continue;
    if (FIX_QUEUE_OPEN_STATUSES.indexOf(rowStatus) !== -1) {
      return { ok: false, reason: 'dedup' };
    }
    if (rowAttempts >= FIX_QUEUE_MAX_ATTEMPTS) {
      attemptsForContext = rowAttempts;
    }
  }
  if (attemptsForContext >= FIX_QUEUE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'attempts_exceeded' };
  }

  var fixId = _generateFixId();
  var nowIso = new Date().toISOString();
  var snapshotStr = snapshot ? redactSnapshot(snapshot) : '';
  sheet.appendRow([fixId, '', context, errorMessage, stackTrace, snapshotStr,
    'pending', '', '', '', 0, nowIso, nowIso]);
  return { ok: true, fix_id: fixId };
}
```

- [ ] **Step 4: Đăng ký `Healer.gs` vào loader test nếu `loadScript` cần khai báo tên file tường minh**

Kiểm `ops/test_logic.js` xem `loadScript` có danh sách file cố định hay nạp theo tên truyền vào (đã thấy ở Task 1 dùng `loadScript('Utils.gs')` — nạp theo tên, không cần đăng ký thêm). Nếu có danh sách nạp mặc định ở đầu file, thêm `'Healer.gs'` vào đó.

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

Run: `node --test ops/test_logic.js`
Expected: toàn bộ PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add gas/Healer.gs ops/test_logic.js
git commit -m "feat(healer): FIX_QUEUE tab + enqueueFix (dedup, trần 2 lần thử)"
```

---

## Task 3: `HEALER_QUEUE_TOKEN` — auth hẹp + `healer_pull`/`healer_update`

**Files:**
- Modify: `gas/Code.gs` (`AUTH` object dòng ~20-27, `_authorize` dòng ~29-53, `GET_ROUTES`/`POST_ROUTES`)
- Modify: `gas/Healer.gs` (thêm handler)
- Test: `ops/test_logic.js`

**Interfaces:**
- Consumes: `enqueueFix` schema/columns (Task 2), `getConfig` (`gas/Utils.gs`)
- Produces: `healerPullPending()` → `{ ok: true, fixes: [...] }` (chỉ rows `status=pending`)
- Produces: `healerUpdateFix(fixId, patch)` → `{ ok: true }` / `{ ok: false, reason }`, patch chỉ được chứa keys ⊆ `['status','git_branch','base_commit_hash']`

- [ ] **Step 1: Đọc `_authorize` + route table hiện tại từ origin**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git show origin/launch-hardening:gas/Code.gs | sed -n '1,55p'
```
Xác nhận pattern `AUTH.REPORT` dùng `_requireTokenIfSet` — `HEALER` sẽ theo cùng dạng nhưng token riêng, không dùng chung `REPORT_API_TOKEN`.

- [ ] **Step 2: Viết test trượt**

Thêm vào `ops/test_logic.js`:

```js
test('_authorize AUTH.HEALER — đúng token qua, sai token/rỗng bị chặn', () => {
  loadScript('Utils.gs');
  loadScript('Code.gs');
  const origConfig = global._CONFIG_CACHE;
  global._CONFIG_CACHE = { HEALER_QUEUE_TOKEN: 'secret-abc' };
  global._CONFIG_CACHE_TS = Date.now();
  try {
    assert.strictEqual(_authorize(AUTH.HEALER, { parameter: { token: 'secret-abc' } }), true);
    assert.strictEqual(_authorize(AUTH.HEALER, { parameter: { token: 'wrong' } }), false);
    assert.strictEqual(_authorize(AUTH.HEALER, { parameter: {} }), false);
  } finally {
    global._CONFIG_CACHE = origConfig;
  }
});

test('healerUpdateFix chỉ ghi cột cho phép, từ chối field lạ', () => {
  loadScript('Healer.gs');
  let written = null;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [
          ['fix_id','error_id','context','error_message','stack_trace','snapshot','status','git_branch','base_commit_hash','deployed_version','attempts','created_at','updated_at'],
          ['FIX-1','','gbp.fetch','','','','pending','','','',0,'','']
        ] }),
        getRange: () => ({ setValue: (v) => { written = v; } })
      })
    })
  };
  const res = healerUpdateFix('FIX-1', { status: 'awaiting_approval', deployed_version: 999 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'field_not_allowed');
});

test('healerUpdateFix: fix_id không tồn tại → từ chối', () => {
  loadScript('Healer.gs');
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [
          ['fix_id','error_id','context','error_message','stack_trace','snapshot','status','git_branch','base_commit_hash','deployed_version','attempts','created_at','updated_at']
        ] })
      })
    })
  };
  const res = healerUpdateFix('FIX-KHONG-TON-TAI', { status: 'awaiting_approval' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not_found');
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `node --test ops/test_logic.js 2>&1 | grep -A3 "AUTH.HEALER\|healerUpdateFix"`
Expected: `AUTH.HEALER is not defined` hoặc tương tự.

- [ ] **Step 4: Thêm `AUTH.HEALER` + case trong `_authorize`** (`gas/Code.gs`)

```js
var AUTH = {
  PUBLIC: 'public',
  REPORT: 'report',
  STAFF: 'staff',
  ADMIN: 'admin',
  BANK: 'bank',
  HEALER: 'healer',
  NONE: 'none'
};
```

Thêm case trong `_authorize` (sau case `AUTH.ADMIN`, trước `return false`):

```js
  if (authClass === AUTH.HEALER) {
    var hToken = (payload && payload.token) || (e && e.parameter && e.parameter.token) || '';
    var expected = getConfig('HEALER_QUEUE_TOKEN');
    if (!expected) return false; // fail-closed — không như AUTH.BANK, không có back-compat mở
    return String(hToken) === String(expected);
  }
```

- [ ] **Step 5: Thêm handler trong `gas/Healer.gs`**

```js
var FIX_QUEUE_UPDATABLE_FIELDS = ['status', 'git_branch', 'base_commit_hash', 'deployed_version', 'attempts'];

function healerPullPending() {
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var fixes = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[6] !== 'pending') continue;
    var obj = {};
    for (var c = 0; c < FIX_QUEUE_COLUMNS.length; c++) obj[FIX_QUEUE_COLUMNS[c]] = row[c];
    fixes.push(obj);
  }
  return { ok: true, fixes: fixes };
}

function healerUpdateFix(fixId, patch) {
  for (var key in patch) {
    if (patch.hasOwnProperty(key) && FIX_QUEUE_UPDATABLE_FIELDS.indexOf(key) === -1) {
      return { ok: false, reason: 'field_not_allowed' };
    }
  }
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === fixId) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return { ok: false, reason: 'not_found' };

  for (var field in patch) {
    if (!patch.hasOwnProperty(field)) continue;
    var colIdx = FIX_QUEUE_COLUMNS.indexOf(field);
    sheet.getRange(rowIdx + 1, colIdx + 1).setValue(patch[field]);
  }
  var updatedAtCol = FIX_QUEUE_COLUMNS.indexOf('updated_at');
  sheet.getRange(rowIdx + 1, updatedAtCol + 1).setValue(new Date().toISOString());
  return { ok: true };
}
```

- [ ] **Step 6: Đăng ký route trong `gas/Code.gs`**

Thêm vào `GET_ROUTES`:
```js
  'healer_pull': {
    auth: AUTH.HEALER,
    handler: function(e) { return healerPullPending(); }
  },
```

Thêm vào `POST_ROUTES`:
```js
  'healer_update': {
    auth: AUTH.HEALER,
    handler: function(p) { return healerUpdateFix(p.fix_id, p.patch || {}); }
  },
```

- [ ] **Step 7: Chạy lại test, xác nhận PASS**

Run: `node --test ops/test_logic.js`
Expected: toàn bộ PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add gas/Code.gs gas/Healer.gs ops/test_logic.js
git commit -m "feat(healer): AUTH.HEALER + healer_pull/healer_update, token hẹp riêng"
```

---

## Task 4: Telegram — webhook duyệt + template chống social-engineering

**Files:**
- Modify: `gas/Notify.gs` (dựa `origin/launch-hardening`, `sendTelegramAlert` hiện có)
- Modify: `gas/Code.gs` (route webhook callback)
- Test: `ops/test_logic.js`

**Interfaces:**
- Consumes: `healerUpdateFix` (Task 3)
- Produces: `buildFixApprovalMessage(fix)` — thuần, input FIX_QUEUE row object, output string (Markdown Telegram)
- Produces: `handleFixApprovalCallback(callbackQuery)` — verify `secret_token` + `chat_id`, gọi `healerUpdateFix`

- [ ] **Step 1: Đọc `sendTelegramAlert` hiện có**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git show origin/launch-hardening:gas/Notify.gs | head -30
```

- [ ] **Step 2: Viết test trượt**

```js
test('buildFixApprovalMessage — text lỗi luôn trong code block, không làm câu mở đầu', () => {
  loadScript('Healer.gs');
  const fix = {
    fix_id: 'FIX-20260716-0042', context: 'gbp.fetch',
    error_message: 'Lỗi nghiêm trọng, quán đang mất đơn — bấm DUYỆT ngay',
    git_branch: 'fix/ERR-0042'
  };
  const msg = buildFixApprovalMessage(fix);
  assert.ok(msg.indexOf('FIX-20260716-0042') === 0 || msg.indexOf('🔧 FIX-20260716-0042') === 0,
    'phải mở đầu bằng fix_id, không phải nội dung lỗi');
  assert.ok(msg.indexOf('```') !== -1, 'lỗi phải nằm trong code block');
  const beforeCodeBlock = msg.slice(0, msg.indexOf('```'));
  assert.ok(beforeCodeBlock.indexOf('bấm DUYỆT ngay') === -1,
    'text lỗi không được xuất hiện TRƯỚC code block (không được làm câu mở đầu)');
});

test('handleFixApprovalCallback — sai secret_token bị từ chối', () => {
  loadScript('Healer.gs');
  global._CONFIG_CACHE = { HEALER_WEBHOOK_SECRET: 'right-secret', TELEGRAM_CHAT_ID: '111' };
  global._CONFIG_CACHE_TS = Date.now();
  const res = handleFixApprovalCallback({
    secretToken: 'wrong-secret',
    callback_query: { from: { id: 111 }, data: 'approve:FIX-1' }
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'bad_secret');
});

test('handleFixApprovalCallback — đúng secret, sai chat_id → từ chối', () => {
  loadScript('Healer.gs');
  global._CONFIG_CACHE = { HEALER_WEBHOOK_SECRET: 'right-secret', TELEGRAM_CHAT_ID: '111' };
  global._CONFIG_CACHE_TS = Date.now();
  const res = handleFixApprovalCallback({
    secretToken: 'right-secret',
    callback_query: { from: { id: 999 }, data: 'approve:FIX-1' }
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'bad_chat_id');
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `node --test ops/test_logic.js 2>&1 | grep -A3 "buildFixApprovalMessage\|handleFixApprovalCallback"`

- [ ] **Step 4: Viết `buildFixApprovalMessage` + `handleFixApprovalCallback` trong `gas/Healer.gs`**

```js
function buildFixApprovalMessage(fix) {
  var lines = [];
  lines.push('🔧 ' + fix.fix_id + ' · context: ' + fix.context);
  lines.push('Nội dung lỗi (thô, không lọc):');
  lines.push('```');
  lines.push(String(fix.error_message || ''));
  lines.push('```');
  lines.push('Nhánh: ' + (fix.git_branch || '(chưa có)'));
  return lines.join('\n');
}

/**
 * callback_query từ Telegram webhook. secretToken đã tách sẵn từ header
 * X-Telegram-Bot-Api-Secret-Token bởi caller (doPost) — hàm này chỉ verify + xử lý.
 */
function handleFixApprovalCallback(input) {
  var expectedSecret = getConfig('HEALER_WEBHOOK_SECRET');
  if (!expectedSecret || input.secretToken !== expectedSecret) {
    return { ok: false, reason: 'bad_secret' };
  }
  var chatId = String((input.callback_query.from || {}).id || '');
  var expectedChatId = String(getConfig('TELEGRAM_CHAT_ID') || '');
  if (!expectedChatId || chatId !== expectedChatId) {
    return { ok: false, reason: 'bad_chat_id' };
  }
  var data = input.callback_query.data || '';
  var parts = data.split(':');
  var action = parts[0];
  var fixId = parts[1];
  if (action === 'approve') {
    return healerUpdateFix(fixId, { status: 'approved' });
  }
  if (action === 'reject') {
    return healerUpdateFix(fixId, { status: 'rejected' });
  }
  return { ok: false, reason: 'unknown_action' };
}
```

- [ ] **Step 5: Route trong `gas/Code.gs`** — webhook Telegram gọi `doPost` với header riêng, không qua `POST_ROUTES` chuẩn (không có `action` JSON field theo cùng dạng). Thêm nhánh sớm trong `doPost`, ngay sau khối `web_hit` hiện có:

```js
    if (earlyPayload && earlyPayload.callback_query) {
      var secretHeader = (e.parameter && e.parameter.__secret_token_test) ||
        (e.headers && e.headers['X-Telegram-Bot-Api-Secret-Token']) || '';
      return _jsonResponse(handleFixApprovalCallback({
        secretToken: secretHeader,
        callback_query: earlyPayload.callback_query
      }));
    }
```
(Ghi chú cho người thực thi: Apps Script `doPost(e)` không expose header trực tiếp qua `e.headers` theo mọi runtime — xác minh cách đọc `X-Telegram-Bot-Api-Secret-Token` thật khi triển khai lên Apps Script editor, GAS thường yêu cầu đọc qua `e.parameter` nếu header không tới được; nếu vậy đổi thiết kế sang truyền secret qua query string `?secret=` khi `setWebhook` — ghi chú lại trong PR nếu phải đổi.)

- [ ] **Step 6: Chạy lại test, PASS**

Run: `node --test ops/test_logic.js`

- [ ] **Step 7: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add gas/Healer.gs gas/Code.gs ops/test_logic.js
git commit -m "feat(healer): Telegram duyệt/bỏ — template chống social-engineering + webhook secret+chat_id"
```

---

## Task 5: Deploy invariant base==prod — `ops/deploy_approved_fix.js`

**Files:**
- Create: `ops/deploy_approved_fix.js`
- Test: `ops/tests/deploy_approved_fix.test.js`

**Interfaces:**
- Consumes: `deployBranch` (export có sẵn từ `ops/deploy_gas.js`, xem `origin/launch-hardening`)
- Produces: `checkBaseInvariant(baseCommitHash, gitRevParse)` — hàm thuần, `gitRevParse` inject được cho test (mặc định gọi `child_process.execSync('git rev-parse origin/launch-hardening')`)
- Produces: `deployApprovedFix(fix, deps)` — `deps = { deployBranch, checkBaseInvariant, execGit }`, để test không chạm git/network thật

- [ ] **Step 1: Xác nhận `deployBranch` đã export (Task đã merge PR #12)**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git show origin/launch-hardening:ops/deploy_gas.js | tail -8
```
Kỳ vọng thấy `module.exports = { deployBranch };`.

- [ ] **Step 2: Viết test trượt**

```js
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
```

- [ ] **Step 3: Chạy test, FAIL**

Run: `node --test ops/tests/deploy_approved_fix.test.js`
Expected: `Cannot find module '../deploy_approved_fix.js'`.

- [ ] **Step 4: Viết `ops/deploy_approved_fix.js`**

```js
/**
 * deploy_approved_fix.js — chạy SAU khi FIX_QUEUE.status=approved (anh iu bấm DUYỆT).
 * Việc của tiến trình user thường (có ~/.clasprc.json), KHÔNG chạy trong _healer.
 *
 * Invariant base==prod: nếu origin/launch-hardening đã đổi từ lúc nhánh fix được tạo
 * (base_commit_hash), HUỶ — không merge/deploy mù. Lý do: PUT /content ghi đè trọn gói,
 * merge+deploy fix cũ trên base cũ có thể xoá mất commit người khác đẩy lên sau đó.
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
  await doDeployBranch('launch-hardening', /* cfg */ undefined, /* accessToken */ undefined, /* files */ undefined, /* reportToken */ undefined, false);
  return { ok: true };
}

module.exports = { checkBaseInvariant, deployApprovedFix };
```

**Ghi chú cho người thực thi tiếp (không phải placeholder — giới hạn thật của phạm vi task này):** lời gọi `doDeployBranch` ở trên thiếu `cfg`/`accessToken`/`files`/`reportToken` thật — task này chỉ chứng minh invariant chặn đúng chỗ (test Step 2-3 cover đủ). Việc nạp `cfg` từ `ops/branches.json`, lấy `accessToken` qua `getValidAccessToken`, đọc `files` qua `readGasFiles()` (đều đã có sẵn trong `deploy_gas.js`, xem `main()`) là **tích hợp cuối cùng**, làm ở Task 9 (chạy staging) khi đã có worktree deploy thật — không làm ở đây vì Global Constraints cấm gọi API deploy thật trong lúc phát triển task này.

- [ ] **Step 5: Chạy lại test, PASS**

Run: `node --test ops/tests/deploy_approved_fix.test.js`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add ops/deploy_approved_fix.js ops/tests/deploy_approved_fix.test.js
git commit -m "feat(healer): invariant base==prod trước deploy fix đã duyệt"
```

---

## Task 6: `_healer` — clone riêng (KHÔNG dùng `git worktree` xuyên user)

**Ghi chú kiến trúc quan trọng, khác 1 chi tiết so với spec:** spec v2 §2 gọi đây là "worktree riêng `ops/.healer-wt`". `git worktree add` chia sẻ `.git` object store với repo gốc — nếu path đó nằm trong `/Users/dpd/Projects/lamha-kissaten` (thư mục của user `dpd`), user `_healer` (danh tính OS khác) sẽ cần quyền ghi vào cây của `dpd` để dùng nó, phá đúng mục tiêu cách ly. **Sửa: `_healer` dùng bản `git clone` độc lập trong home riêng của nó** (`/Users/_healer/lamha-kissaten`), không phải worktree lồng trong cây của `dpd`. Cùng tinh thần "cây sạch mỗi phiên, không cõng WIP", khác cơ chế filesystem.

**Files:**
- Create: `ops/fix_dispatcher.sh` (chạy trên máy `_healer`, nhưng viết/test/commit từ máy `dpd` vì là file trong repo)
- Create: `.claude/commands/fix.md`

**Interfaces:**
- Consumes: `GET {WEB_APP_URL}?action=healer_pull&token=<HEALER_QUEUE_TOKEN>` (Task 3)
- Produces: file `.claude/.healer-auth.json` (trên máy `_healer` — KHÔNG commit, gitignore) chứa `healer_queue_token`

- [ ] **Step 1: Viết `ops/fix_dispatcher.sh`** (mirror cấu trúc `dispatcher.sh` hiện có, đọc ở đầu phiên nghiên cứu)

```bash
#!/bin/bash
# fix_dispatcher.sh — chạy TRÊN MÁY `_healer` (user macOS riêng, không credential
# deploy). Poll FIX_QUEUE qua HEALER_QUEUE_TOKEN (hẹp, chỉ 2 action) → spawn `claude -p
# /fix` khi có fix pending. KHÔNG BAO GIỜ deploy — xem docs/superpowers/specs/
# 2026-07-16-self-healing-v2-design.md §2, §4.
#
# Cài trên máy _healer: cron mỗi 2 phút, HOME=/Users/_healer.

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="$HOME/lamha-kissaten"   # clone riêng của _healer — KHÔNG phải worktree lồng cây dpd
cd "$REPO" || exit 1

URL="https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
AUTH="$HOME/.claude/.healer-auth.json"
LOG="$HOME/fix_dispatcher.log"
LOCK="$HOME/.fix_dispatcher.lock"

if [ -d "$LOCK" ] && [ -z "$(find "$LOCK" -maxdepth 0 -mmin -10 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null
fi
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') skip · đang chạy" >> "$LOG"; exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

TOKEN=$(jq -r '.healer_queue_token // ""' "$AUTH" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "$(date '+%F %T') LỖI: thiếu healer_queue_token — dừng, không poll" >> "$LOG"
  exit 1
fi

RESP=$(curl -sL --max-time 30 "$URL?action=healer_pull&token=$TOKEN")
N=$(echo "$RESP" | jq '.fixes | length' 2>/dev/null); [ -z "$N" ] && N=0
echo "$(date '+%F %T') heartbeat · pending=$N" >> "$LOG"

if [ "$N" -gt 0 ] 2>/dev/null; then
  echo "$(date '+%F %T') → spawn claude /fix ($N fix)" >> "$LOG"
  claude -p "/fix" \
    --permission-mode dontAsk \
    --allowedTools "Read" "Edit" "Write($REPO/**)" "Bash(git *)" "Bash(node --test *)" "Bash(python3 -m unittest *)" \
    --disallowedTools "Bash(*gas_push*)" "Bash(*deploy_gas*)" "Bash(*clasprc*)" \
    >> "$LOG" 2>&1
  echo "$(date '+%F %T') ← claude xong" >> "$LOG"
fi

tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
```

- [ ] **Step 2: Kiểm cú pháp bash (không chạy thật — không có máy `_healer` ở bước dev)**

Run: `bash -n ops/fix_dispatcher.sh`
Expected: không in gì (cú pháp hợp lệ).

- [ ] **Step 3: Viết `.claude/commands/fix.md`** (theo đúng format `.claude/commands/inbox.md` đã đọc)

```markdown
---
description: Chẩn đoán + viết test trượt + fix 1 lỗi trong FIX_QUEUE → push nhánh chờ duyệt
---

Chạy TRÊN MÁY `_healer` — KHÔNG có `~/.clasprc.json`, KHÔNG có quyền deploy. Việc của
skill này DỪNG LẠI ở "push nhánh + đánh dấu chờ duyệt" — KHÔNG BAO GIỜ gọi
`gas_push.py`/`deploy_gas.js`, kể cả khi có vẻ "chỉ test thôi".

WEB_APP_URL = (giống `dispatcher.sh`, đọc từ repo)

Workflow:
1. `git fetch origin && git checkout -B fix/<fix_id> origin/launch-hardening`
   Ghi lại `git rev-parse HEAD` = `base_commit_hash` — dùng ở bước 6.
2. `GET {WEB_APP_URL}?action=healer_pull&token=<healer_queue_token>` → lấy dòng
   `status=pending` đầu tiên (cũ nhất).
3. Dùng skill `superpowers:systematic-debugging` để tìm root cause từ
   `context`/`error_message`/`stack_trace`/`snapshot`.
4. Viết 1 test **trượt** tái hiện lỗi (mock dựng từ `snapshot`, đặt tại
   `ops/tests/healer/<fix_id>.test.js` — KHÔNG sửa file test có sẵn).
5. Viết fix tối thiểu → chạy test, xác nhận XANH.
   - Không tìm ra root cause / test không xanh sau khi thử → gọi
     `healer_update` với `{"status": "manual"}`, dừng lại.
6. `git push origin fix/<fix_id>` (git identity/credential riêng của `_healer`,
   chỉ có quyền push nhánh khớp `fix/*` — xem Task ⚠️ THAO TÁC THỦ CÔNG #4).
7. `POST {WEB_APP_URL}` body `{"action":"healer_update","fix_id":"<fix_id>","patch":
   {"status":"awaiting_approval","git_branch":"fix/<fix_id>","base_commit_hash":
   "<sha bước 1>"},"token":"<healer_queue_token>"}`

Nguyên tắc:
- KHÔNG BAO GIỜ chạy `gas_push.py`/`deploy_gas.js`/đọc `~/.clasprc.json` — không tồn
  tại trên máy này, nhưng nhắc lại vì `disallowedTools` chỉ là lớp 2.
- KHÔNG sửa file test có sẵn ngoài `ops/tests/healer/<fix_id>.test.js` của chính
  phiên này.
- Trần 2 lần thử/context — nếu `attempts` dòng FIX_QUEUE đã ở 2, không chạy tiếp,
  báo `manual`.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add ops/fix_dispatcher.sh .claude/commands/fix.md
git commit -m "feat(healer): fix_dispatcher.sh (chạy trên máy _healer) + skill /fix"
```

---

## Task 7 (⚠️ THAO TÁC THỦ CÔNG — anh iu tự chạy, không giao subagent code)

Tạo user macOS `_healer`, xác nhận không có credential nào trong home của nó.

```bash
# 1. Tạo user (cần sudo — KHÔNG chạy qua Claude, tự tay anh iu chạy)
sudo sysadminctl -addUser _healer -fullName "Healer" -password <mật khẩu mạnh, lưu riêng>

# 2. Đăng nhập 1 lần bằng user _healer (System Settings hoặc `su - _healer`) để tạo home dir

# 3. Xác nhận KHÔNG có credential nào lọt sang (chạy với quyền _healer)
su - _healer -c 'ls ~/.clasprc.json 2>&1; gh auth status 2>&1'
# Kỳ vọng: "No such file or directory" cho .clasprc.json, "not logged in" cho gh

# 4. Clone repo riêng (không phải worktree lồng cây dpd — xem Task 6 ghi chú)
su - _healer -c 'git clone git@github.com:<org>/lamha-kissaten.git ~/lamha-kissaten'

# 5. Tạo .claude/.healer-auth.json (không commit — thêm vào .gitignore nếu chưa có)
su - _healer -c 'mkdir -p ~/lamha-kissaten/.claude && echo "{\"healer_queue_token\":\"<giá trị Task 8>\"}" > ~/lamha-kissaten/.claude/.healer-auth.json'
```

Xác nhận xong bằng cách paste lại output bước 3 — chỉ tiếp tục Task 9/10 sau khi xác nhận home `_healer` sạch.

---

## Task 8 (⚠️ THAO TÁC THỦ CÔNG — đụng CONFIG sheet prod)

Set giá trị CONFIG mới trong Sheets prod (mở trực tiếp, không qua script để tránh chạm quy tắc "không đụng CONFIG sheet prod" bằng code tự động):

| Key | Giá trị |
|---|---|
| `HEALER_QUEUE_TOKEN` | chuỗi ngẫu nhiên dài (vd `openssl rand -hex 24`), dán vào cả `.claude/.healer-auth.json` (Task 7 bước 5) |
| `HEALER_WEBHOOK_SECRET` | chuỗi ngẫu nhiên khác, dùng khi `setWebhook` (Task 10) |
| `TELEGRAM_CHAT_ID` | chat_id Telegram của anh iu (nếu CONFIG chưa có sẵn key này) |

Đối chiếu `docs/system/sheets-schema.md` — thêm dòng mô tả 2 key mới vào bảng CONFIG trong doc đó sau khi set xong (cập nhật doc là việc code được, giao subagent được — xem Task 11).

---

## Task 9 (⚠️ THAO TÁC THỦ CÔNG hoặc xin phép trước khi chạy — gọi Telegram API thật)

Đăng ký webhook Telegram với `secret_token`:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=<WEB_APP_URL>" \
  -d "secret_token=<HEALER_WEBHOOK_SECRET vừa set ở Task 8>"
```

Đây là "tạo/sửa cấu hình webhook tồn tại lâu dài" — theo luật top-level của phiên, cần **hỏi anh iu xác nhận trước khi chạy thật**, dù lệnh không đụng credential tài chính. Không tự chạy khi thực thi plan này bằng subagent tự động — dừng lại ở đây, hỏi.

---

## Task 10 (⚠️ THAO TÁC THỦ CÔNG — GitHub branch protection, đổi quyền truy cập)

Tạo fine-grained PAT hoặc deploy key riêng cho `_healer`, giới hạn qua branch protection rule:
- GitHub repo Settings → Rules → New branch ruleset
- Target: pattern `fix/*`
- Bắt buộc: chỉ identity/PAT của `_healer` được phép push khớp pattern này; các nhánh khác (`main`, `launch-hardening`) không cấp quyền push cho identity đó.

Đây là thay đổi access-control — nằm trong nhóm **Prohibited** đối với Claude tự thực hiện (kể cả có xác nhận). Chỉ anh iu tự tay làm trong GitHub UI.

---

## Task 11: Cập nhật doc

**Files:**
- Modify: `docs/system/sheets-schema.md` (thêm `HEALER_QUEUE_TOKEN`, `HEALER_WEBHOOK_SECRET` vào bảng CONFIG)
- Modify: `CLAUDE.md` (index) — thêm dòng trỏ tới spec self-healing v2 nếu index có mục "Roadmap"/"self-healing"

- [ ] **Step 1: Thêm 2 dòng vào bảng CONFIG trong `docs/system/sheets-schema.md`**, theo đúng format các dòng `REPORT_API_TOKEN`/`BANK_WEBHOOK_SECRET` đã có (đọc lại các dòng đó trước khi thêm để khớp cột).

- [ ] **Step 2: Commit**

```bash
cd /Users/dpd/Projects/lamha-kissaten
git add docs/system/sheets-schema.md
git commit -m "docs: ghi CONFIG key mới cho self-healing v2 (HEALER_QUEUE_TOKEN, HEALER_WEBHOOK_SECRET)"
```

---

## Task 12: Chạy vòng đầy đủ trên staging (integration, không phải unit)

**Không viết code mới — checklist thực thi tay/bán-tự-động sau khi Task 1-11 xong và Task 7-10 (thủ công) đã hoàn tất.**

- [ ] Tạo 1 script project **staging** riêng (copy `gas/*.gs` sang project GAS mới, KHÔNG dùng scriptId prod)
- [ ] Bơm 1 lỗi giả có `context` bất kỳ vào `ERROR_LOG` + gọi `enqueueFix` tay (qua GAS editor, chạy hàm trực tiếp) trên project staging
- [ ] Từ máy `_healer`: xác nhận `fix_dispatcher.sh` (chạy tay 1 lần, không đợi cron) nhặt được fix, spawn `/fix`, tạo test trượt → xanh → push nhánh
- [ ] Xác nhận Telegram nhận đúng template (§6 spec), bấm DUYỆT giả (gọi webhook tay bằng curl với `secret_token` đúng)
- [ ] Từ máy `dpd` thường: chạy `ops/deploy_approved_fix.js` (hoàn thiện tích hợp `cfg`/`accessToken`/`files` còn thiếu từ Task 5) nhắm vào **staging scriptId** — xác nhận invariant pass, deploy chạy, smoke xanh
- [ ] Giả lập base lệch (push 1 commit khác vào staging branch giữa lúc chờ duyệt) → xác nhận `deployApprovedFix` huỷ, không PUT
- [ ] Chỉ sau khi toàn bộ mục trên xanh trên staging → cân nhắc bật cho prod (quyết định của anh iu, không tự động)

---

## Tự-review kế hoạch

**Spec coverage:** §2 (kiến trúc 2 tiến trình) → Task 6, 7. §3 (schema+token) → Task 2, 3, 8. §3 (permission /fix) → Task 6. §4 (invariant) → Task 5. §5 (schema FIX_QUEUE) → Task 2. §6 (Telegram template) → Task 4, 9. §9 (test) → rải trong mỗi Task + Task 12. §12 (chờ anh iu) → Task 7-10.

**Placeholder scan:** đã bỏ mọi "TODO sau"/"tương tự Task N" — chỗ duy nhất cố ý để lại giới hạn phạm vi (Task 5 `doDeployBranch` thiếu tham số thật) đã ghi rõ **vì sao** và **làm tiếp ở đâu** (Task 12), không phải placeholder mù.

**Type consistency:** `enqueueFix` (Task 2) → `healerPullPending`/`healerUpdateFix` (Task 3) dùng chung `FIX_QUEUE_COLUMNS` — khớp tên. `deployApprovedFix` (Task 5) nhận đúng object fields `enqueueFix`/`healerUpdateFix` ghi ra (`base_commit_hash`, `git_branch`, `fix_id`).

**Scope check:** 12 task, tuyến tính theo phụ thuộc, tách rõ code (subagent làm được, TDD) khỏi thao tác hệ thống/prod (chỉ anh iu). Không cần tách plan con thêm — các phần phụ thuộc chặt (không độc lập được).

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-16-self-healing-v2-plan.md`.**
