# KDS Local-First Printing — Implementation Plan

> **For agentic workers (Antigravity):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement **in phase order**; each phase ends green and is independently shippable behind flags. After all phases, hand back to Claude (chief) for the review checklist at the end.

**Goal:** Đơn tạo tại KDS/quầy in tem tức thì qua LAN (không chờ round-trip GAS), sync lên Google Sheets bất đồng bộ với exactly-once effect; đồng thời rút thao tác barista còn 1 nút [Xong] (+ toggle "Đang pha" ẩn, pickup 2 nút).

**Architecture:** KDS → route mới trong `print_server.py` (Mac Mini, LAN) mint id/code + in tem in-process + ghi outbox SQLite → syncer thread đẩy GAS `ingest_order` (idempotent append). GAS giữ vai event bus + database; `short_code` chuyển từ đếm-dòng sang watermark + block hi-lo để 2 nơi mint không đụng. Poller cũ giữ nguyên cho đơn remote/QR.

**Tech Stack:** Python 3 (Flask, stdlib `sqlite3`, `urllib`), Google Apps Script (.gs, PropertiesService, LockService), vanilla JS (`web/kds.html`). Test: Python `unittest` (stdlib), GAS qua `node:test` + `vm` (mẫu `ops/test_logic.js`), E2E qua browser preview.

## Global Constraints

Copy verbatim từ spec ([2026-07-22-kds-local-first-printing-design.md](../specs/2026-07-22-kds-local-first-printing-design.md)) + CLAUDE.md — áp cho MỌI task:

- GAS = event bus duy nhất · Google Sheets = database duy nhất · **không external DB**. Outbox SQLite trên Mac Mini là hàng đợi tạm (queue), KHÔNG phải database-of-record — được phép.
- ORDERS **append-only**. Chỉ ghi cột trạng thái/timestamp theo pattern sẵn có (`updateOrderStatus`, `markOrderPaid`). **KHÔNG bao giờ ghi đè `order_id` (primary key)**.
- `order_id` format: `ORD-YYYYMMDD-XXXX` (XXXX = 4 chữ số). `short_code` = `<letter><seq>` với letter ∈ {Q=dine_in, M=pickup/take_away, G=delivery}. Offline band = `<letter>X<seq>` (vd `QX1`).
- Token/secret **luôn đọc từ CONFIG (GAS) hoặc env (Python)** — không hardcode. Gateway dùng env `REPORT_API_TOKEN` (đã có trong `print_poller.py`).
- Deploy GAS: `python3 ops/gas_push.py` (clasp gãy trên máy này). `gas_push.py` đụng prod HEAD ngay cả khi không `--deploy` → mọi thay đổi GAS phải **backward-compatible** (18 cron + poller đang chạy HEAD).
- KHÔNG trigger < 15 phút. In tem tại CONFIRMED (gateway tạo đơn thẳng ở CONFIRMED).
- Tính tem loyalty theo GIÁ TRỊ ĐƠN net (đã có trong `_creditStampsForOrder`) — không đụng logic đó, chỉ đảm bảo gọi đúng 1 lần.
- Xưng hô trong doc/commit/code: trung tính tiếng Anh (feat/fix/...). Không đụng brand voice.

## File Structure

**Tạo mới:**
- `print-server/printlib.py` — thư viện render tem/receipt tách khỏi `print_poller.py` (DRY, import bởi poller + gateway + test). Một trách nhiệm: build ESC/POS + TSPL bytes.
- `print-server/gateway.py` — logic gateway: mint id/code, outbox SQLite, hi-lo block, syncer. KHÔNG chứa Flask route (route ở `print_server.py`). Một trách nhiệm: order intake + sync state.
- `print-server/test_printlib.py` — unittest cho printlib (smoke: build không ném, bytes > 0).
- `print-server/test_gateway.py` — unittest cho gateway (mint, dedup, hi-lo, outbox FIFO, offline band, midnight rollover).
- `gas/tests/` (nếu chưa có) — dùng chung harness `ops/test_logic.js`; thêm `ops/test_shortcode_watermark.js`, `ops/test_ingest_order.js`.

**Sửa:**
- `print-server/print_poller.py` — thay các builder bằng `from printlib import ...` (xoá bản trùng, giữ poll loops). `poll_labels_once` bỏ qua đơn có `label_printed_at` (đã set bởi gateway).
- `print-server/print_server.py` — thêm route: `POST /order`, `GET /order`, `POST /order/status`, `POST /order/mark_paid`; import gateway; đọc PRINT in-process qua printlib.
- `gas/Orders.gs` — `buildShortCode` → watermark; thêm `reserveShortCodes`, `ingestPreMintedOrder`; nới `VALID_TRANSITIONS`.
- `gas/Code.gs` — thêm POST route `ingest_order`, `reserve_codes`.
- `web/kds.html` — order submit box-first + confirm-before-fallback + Optimistic UI insert; nút [Xong]; pickup 2 nút; toggle "Đang pha" ẩn; route status/mark_paid qua gateway khi bật flag.

---

## PHASE 1 — Tách printlib (an toàn, không đổi hành vi)

Mục tiêu: `printlib.py` chứa mọi builder; poller import từ đó; hành vi in KHÔNG đổi. Đây là bước dọn nền, không rủi ro tiền/đơn.

### Task 1.1: Tạo printlib.py bằng cách di chuyển builder

**Files:**
- Create: `print-server/printlib.py`
- Modify: `print-server/print_poller.py` (xoá builder đã move, thêm import)
- Test: `print-server/test_printlib.py`

**Interfaces:**
- Produces (printlib công khai): `build_receipt(order: dict) -> bytes`, `build_receipt_raster(order) -> bytes`, `build_receipt_text(order) -> bytes`, `build_label_raster(order, item, cup_num, total_cups) -> bytes`, `build_label_tspl(order, item, cup_num, total_cups) -> bytes`, cùng helpers `_load_font`, `_loc_label`, `_mods_line`, `_format_time_only`, `_format_timestamp`, `_format_amount`, `_strip_viet`, `_img_to_raster_bytes`, và hằng `LABEL_DOTS_WIDTH`, `LABEL_DOTS_HEIGHT`, `RASTER_DOTS_WIDTH`, `_SZ_LBL_HDR`, `_SZ_LBL_ITEM`, `_SZ_LBL_MOD`, `_SZ_LBL_TIME`. (Giữ nguyên tên hàm/biến hiện có trong `print_poller.py` để không vỡ import ở `print_server.py`.)

- [ ] **Step 1: Viết test trước (mô tả hành vi cần giữ)**

Tạo `print-server/test_printlib.py`:
```python
import unittest
from printlib import build_receipt, build_label_tspl, build_label_raster

ORDER = {
    "order_id": "ORD-20260722-0001",
    "timestamp": "2026-07-22T08:10:00+07:00",
    "table_id": "03",
    "customer_name": "",
    "customer_id": "",
    "total": 66000,
    "payment": {"method": "cash"},
    "metadata": {"short_code": "Q07", "delivery_type": "dine_in", "notes": "it ngot"},
    "items": [{"name": "Bạc xỉu", "qty": 1, "price": 40000,
               "modifiers": {"sugar": "30%", "ice": "less"}}],
}
ITEM = ORDER["items"][0]

class TestPrintlib(unittest.TestCase):
    def test_receipt_returns_nonempty_bytes(self):
        out = build_receipt(ORDER)
        self.assertIsInstance(out, bytes)
        self.assertGreater(len(out), 0)

    def test_label_tspl_contains_shortcode_and_cut(self):
        out = build_label_tspl(ORDER, ITEM, 1, 2)
        self.assertIn(b"Q07", out)          # short_code có trên tem
        self.assertIn(b"PRINT 1", out)      # TSPL print command

    def test_label_raster_returns_bytes(self):
        out = build_label_raster(ORDER, ITEM, 1, 2)
        self.assertIsInstance(out, bytes)
        self.assertGreater(len(out), 0)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test — phải FAIL (chưa có printlib)**

Run: `cd print-server && python3 -m unittest test_printlib -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'printlib'`

- [ ] **Step 3: Tạo printlib.py**

Di chuyển (cut) toàn bộ khối builder từ `print_poller.py` sang `printlib.py`: từ dòng khai báo `# ── Config` các hằng RASTER/LABEL cần cho render (RASTER_DOTS_WIDTH, LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT, font sizes), qua `_ssl_ctx` KHÔNG cần (giữ ở poller), các hàm: `_load_font` + `_FONT_CANDIDATES`, `_format_amount`, `_format_timestamp`, `_payment_label`, `_mods_line`, `_loc_label`, `_img_to_raster_bytes`, `_get_logo`/`_LOGO_PATH`/`_logo_cache`, `_bee_height`, `_draw_bee`, `build_receipt_raster`, `_viet_cp1258`, `build_receipt_text`, `build_receipt`, `_strip_viet`, `_format_time_only`, `build_label_raster`, `build_label_tspl`. Thêm ở đầu file các import mà các hàm này dùng: `import os, logging, unicodedata`; PIL import giữ lazy trong hàm như hiện tại. Copy nguyên văn — KHÔNG đổi logic.

- [ ] **Step 4: Sửa print_poller.py import từ printlib**

Trong `print_poller.py`, xoá các hàm đã move, thêm sau phần config:
```python
from printlib import (
    build_receipt, build_label_tspl,
    LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT,
)
```
Giữ lại trong poller: `_ssl_ctx`, `_get_json`, `_post_bytes`, `poll_labels_once`, `poll_once`, `main`, và các env config poller dùng.

- [ ] **Step 5: Sửa print_server.py import từ printlib**

Trong `print_server.py`, các chỗ `from print_poller import build_label_tspl` (dòng ~353, ~541, ~893, ~906) đổi thành `from printlib import build_label_tspl` (và các symbol khác đang import từ print_poller: `LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT, _load_font, _SZ_LBL_*, _loc_label, _mods_line, _format_time_only` → import từ `printlib`). Đảm bảo printlib export đủ các symbol này.

- [ ] **Step 6: Chạy test — phải PASS**

Run: `cd print-server && python3 -m unittest test_printlib -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Smoke poller + server import không vỡ**

Run: `cd print-server && python3 -c "import print_poller, print_server; print('imports OK')"`
Expected: in `imports OK`, không traceback.

- [ ] **Step 8: Commit**

```bash
git add print-server/printlib.py print-server/print_poller.py print-server/print_server.py print-server/test_printlib.py
git commit -m "refactor(print): extract printlib from print_poller (no behavior change)"
```

---

## PHASE 2 — GAS: watermark + reserve_codes + ingest_order

Mục tiêu: GAS sẵn sàng nhận đơn pre-minted + cấp block hi-lo, `short_code` chuyển sang watermark. Deploy xong **chưa ai gọi** → không phá luồng hiện tại (backward-compatible).

### Task 2.1: buildShortCode chuyển sang watermark (init từ MAX)

**Files:**
- Modify: `gas/Orders.gs` (`buildShortCode`, thêm helper `_shortCodeWatermarkKey`, `_currentDateStr`, `_seedWatermarkFromMax`)
- Test: `ops/test_shortcode_watermark.js`

**Interfaces:**
- Produces: `buildShortCode(deliveryType: string) -> string` (giữ chữ ký cũ, giá trị vẫn `<letter><seq>`); `_nextShortCodeSeq(letter: string) -> number` (dưới LockService caller); `_letterFor(deliveryType) -> 'Q'|'M'|'G'`.
- Consumes: `PropertiesService.getScriptProperties()`, `LockService` (caller doPost đã giữ lock).

Watermark key: `sc_wm_<YYYYMMDD>_<letter>` trong ScriptProperties. Giá trị = seq cao nhất đã cấp hôm nay cho letter đó. Nếu key trống → seed = `MAX(seq)` của các short_code cùng letter+ngày trong ORDERS (KHÔNG `COUNT`), để đơn huỷ/xoá không làm tụt số.

- [ ] **Step 1: Viết test**

Tạo `ops/test_shortcode_watermark.js` (theo mẫu load VM của `ops/test_logic.js` — copy phần mock `SpreadsheetApp`, `PropertiesService`, `Utilities`, `LockService`; PropertiesService phải là store thật trong bộ nhớ, không trả cứng '1'):
```javascript
const test = require('node:test');
const assert = require('assert');
const { loadGas } = require('./gas_test_harness'); // helper tạo ở step 3

test('buildShortCode tăng seq đơn điệu cho cùng letter', () => {
  const ctx = loadGas(['Orders.gs'], { ordersRows: [], props: {} });
  const a = ctx.buildShortCode('dine_in');   // Q + seq
  const b = ctx.buildShortCode('dine_in');
  assert.strictEqual(a, 'Q01');
  assert.strictEqual(b, 'Q02');
});

test('seed watermark từ MAX(seq) khi có đơn cũ, không tụt số dù thiếu dòng', () => {
  // ORDERS đã có Q05 (các Q01..Q04 bị huỷ/xoá) → tiếp theo phải là Q06
  const ctx = loadGas(['Orders.gs'], {
    ordersRows: [ mkRow({ order_id: 'ORD-20260722-1000', short_code: 'Q05', dtype: 'dine_in' }) ],
    props: {},
    today: '20260722',
  });
  assert.strictEqual(ctx.buildShortCode('dine_in'), 'Q06');
});

test('letter đúng theo delivery_type', () => {
  const ctx = loadGas(['Orders.gs'], { ordersRows: [], props: {} });
  assert.ok(ctx.buildShortCode('delivery').startsWith('G'));
  assert.ok(ctx.buildShortCode('take_away').startsWith('M'));
});
```
(Chi tiết `mkRow`/`loadGas`/`gas_test_harness` ở Task 2.0 bên dưới.)

- [ ] **Step 0 (Task 2.0 — làm TRƯỚC 2.1): Test harness dùng lại được**

**Files:** Create `ops/gas_test_harness.js`

Trích logic load `.gs` qua `vm` từ `ops/test_logic.js` thành helper tái dùng, với ScriptProperties là store bộ nhớ thật và ORDERS sheet mock đọc từ `opts.ordersRows`:
```javascript
const fs = require('fs'); const path = require('path'); const vm = require('vm');
// Cột ORDERS (0-based) theo gas/Orders.gs headers:
// 0 order_id ... 12 status,13 confirmed_at ...18 delivered_at,19 payment_status,
// 25 customer_name, 26 short_code, 27 delivery_type, 28 idempotency_key
function mkRow(o) {
  const r = new Array(29).fill('');
  r[0]=o.order_id||''; r[12]=o.status||'NEW'; r[19]=o.payment_status||'';
  r[25]=o.customer_name||''; r[26]=o.short_code||''; r[27]=o.dtype||''; r[28]=o.idem||'';
  return r;
}
function loadGas(files, opts) {
  opts = opts || {}; const props = opts.props || {};
  const rows = opts.ordersRows || [];
  const today = opts.today || '20260722';
  const sandbox = {
    console,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? String(props[k]) : null),
      setProperty: (k,v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; },
    })},
    LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){}, tryLock(){return true;} }) },
    Utilities: { formatDate: () => today, newBlob: (b)=>({getBytes:()=>b}) },
    Logger: { log(){} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (name) => ({
      getName: () => name,
      getLastRow: () => rows.length + 1,
      getLastColumn: () => 29,
      appendRow: (r) => { rows.push(r); },
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => {
          const out = [];
          for (let i = 0; i < (nRows||1); i++) {
            const src = rows[(row-2)+i] || new Array(29).fill('');
            out.push(src.slice((col-1), (col-1)+(nCols||1)));
          }
          return out;
        },
        setValue: (v) => { /* track if needed */ },
      }),
      getDataRange: () => ({ getValues: () => [['key','value']] }),
    }) }) },
  };
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  ctx._rows = rows; ctx._props = props;
  return ctx;
}
module.exports = { loadGas, mkRow };
```
Run: `node -e "require('./ops/gas_test_harness')" ` → không lỗi.

- [ ] **Step 2: Chạy test — FAIL**

Run: `node --test ops/test_shortcode_watermark.js`
Expected: FAIL — `buildShortCode` cũ đếm dòng, `Q01`/`Q06` không khớp (hoặc ném vì mock khác).

- [ ] **Step 3: Viết implementation trong Orders.gs**

Thay thân `buildShortCode` (Orders.gs:223) bằng watermark:
```javascript
function _letterFor(deliveryType) {
  return deliveryType === 'delivery' ? 'G' : (deliveryType === 'dine_in' ? 'Q' : 'M');
}
function _currentDateStr() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
}
function _shortCodeWmKey(dateStr, letter) { return 'sc_wm_' + dateStr + '_' + letter; }

// Seed watermark = MAX(seq) của short_code cùng letter+ngày trong ORDERS (không COUNT).
function _seedWatermarkFromMax(dateStr, letter) {
  var sheet = _ordersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var ids  = sheet.getRange(2, 1, lastRow - 1, 1).getValues();          // col A order_id
  var codes = sheet.getRange(2, 27, lastRow - 1, 1).getValues();        // col AA short_code (idx 26 → col 27)
  var prefix = 'ORD-' + dateStr + '-';
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).indexOf(prefix) !== 0) continue;
    var code = String(codes[i][0] || '');
    // Bỏ qua offline band (letter + 'X' + seq) khi seed watermark thường.
    var m = code.match(new RegExp('^' + letter + '(\\d+)$'));
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return max;
}

// Cấp seq kế cho letter (caller phải giữ LockService). Trả số nguyên >=1.
function _nextShortCodeSeq(letter) {
  var dateStr = _currentDateStr();
  var props = PropertiesService.getScriptProperties();
  var key = _shortCodeWmKey(dateStr, letter);
  var cur = props.getProperty(key);
  var wm = (cur === null) ? _seedWatermarkFromMax(dateStr, letter) : parseInt(cur, 10);
  wm = wm + 1;
  props.setProperty(key, String(wm));
  return wm;
}

function buildShortCode(deliveryType) {
  var letter = _letterFor(deliveryType);
  var seq = _nextShortCodeSeq(letter);
  return letter + (seq < 10 ? '0' + seq : String(seq));
}
```
Lưu ý: ScriptProperties chỉ giữ watermark ngày hiện tại; ngày mới key mới → tự reset. Không cần cron dọn (key cũ vô hại, tùy chọn dọn ở Task 2.4).

- [ ] **Step 4: Chạy test — PASS**

Run: `node --test ops/test_shortcode_watermark.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add gas/Orders.gs ops/gas_test_harness.js ops/test_shortcode_watermark.js
git commit -m "feat(gas): short_code via monotonic watermark seeded from MAX (not row count)"
```

### Task 2.2: reserveShortCodes (block hi-lo)

**Files:**
- Modify: `gas/Orders.gs` (thêm `reserveShortCodes`), `gas/Code.gs` (thêm POST route `reserve_codes`)
- Test: `ops/test_shortcode_watermark.js` (thêm case)

**Interfaces:**
- Produces: `reserveShortCodes(deliveryType: string, n: number) -> { letter, date, from, to }`. `from = watermark+1`, `to = watermark+n`, đẩy watermark += n. Caller (route) giữ LockService.
- POST route `reserve_codes` (AUTH.REPORT): body `{ action:'reserve_codes', type:'dine_in'|'take_away'|'delivery', n:Number, token }` → trả `{ ok, letter, date, from, to }`.

- [ ] **Step 1: Viết test**

Thêm vào `ops/test_shortcode_watermark.js`:
```javascript
test('reserveShortCodes cấp dải liên tục và đẩy watermark; mint thường tiếp sau dải', () => {
  const ctx = loadGas(['Orders.gs'], { ordersRows: [], props: {} });
  const blk = ctx.reserveShortCodes('dine_in', 20);   // giữ Q01..Q20
  assert.deepStrictEqual([blk.letter, blk.from, blk.to], ['Q', 1, 20]);
  // Đơn GAS-origin kế phải là Q21 (không đụng dải box)
  assert.strictEqual(ctx.buildShortCode('dine_in'), 'Q21');
});
```

- [ ] **Step 2: Chạy test — FAIL** (`reserveShortCodes is not a function`)

Run: `node --test ops/test_shortcode_watermark.js`

- [ ] **Step 3: Implementation**

Trong `gas/Orders.gs`:
```javascript
// Cấp N mã liên tục cho box (hi-lo). Caller phải giữ LockService.
function reserveShortCodes(deliveryType, n) {
  n = Math.max(1, parseInt(n, 10) || 1);
  var letter = _letterFor(deliveryType);
  var dateStr = _currentDateStr();
  var props = PropertiesService.getScriptProperties();
  var key = _shortCodeWmKey(dateStr, letter);
  var cur = props.getProperty(key);
  var wm = (cur === null) ? _seedWatermarkFromMax(dateStr, letter) : parseInt(cur, 10);
  var from = wm + 1, to = wm + n;
  props.setProperty(key, String(to));
  return { letter: letter, date: dateStr, from: from, to: to };
}
```
Trong `gas/Code.gs`, thêm vào object `POST_ROUTES` (cạnh `mark_paid`):
```javascript
'reserve_codes': {
  auth: AUTH.REPORT,
  handler: function(p) {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var blk = reserveShortCodes(p.type || 'dine_in', p.n || 20);
      return { ok: true, letter: blk.letter, date: blk.date, from: blk.from, to: blk.to };
    } finally { lock.releaseLock(); }
  }
},
```

- [ ] **Step 4: Chạy test — PASS**

Run: `node --test ops/test_shortcode_watermark.js`

- [ ] **Step 5: Commit**

```bash
git add gas/Orders.gs gas/Code.gs ops/test_shortcode_watermark.js
git commit -m "feat(gas): reserve_codes endpoint for hi-lo short_code block reservation"
```

### Task 2.3: ingest_order (append đơn pre-minted, idempotent, first-writer-wins)

**Files:**
- Modify: `gas/Orders.gs` (thêm `ingestPreMintedOrder`), `gas/Code.gs` (thêm POST route `ingest_order`)
- Test: `ops/test_ingest_order.js`

**Interfaces:**
- Produces: `ingestPreMintedOrder(payload) -> { ok, order_id, short_code, deduped }`. `payload` = KDS order payload gốc (items/channel/...) + `gateway_order_id`, `gateway_short_code`, `printed_at`, `idempotency_key`. Hàm: dedup theo `idempotency_key` rồi `order_id` (first-writer-wins → nếu tồn tại trả `{deduped:true}`, KHÔNG append/ghi đè); nếu chưa có: `validateOrderPayload(payload)` để tính giá đúng, **override** `order_id`, `short_code`, `status='CONFIRMED'`, `confirmed_at=now`, `label_printed_at=printed_at`; `appendOrderToSheet`; gửi Telegram alert.
- POST route `ingest_order` (AUTH.REPORT).

- [ ] **Step 1: Viết test**

Tạo `ops/test_ingest_order.js`:
```javascript
const test = require('node:test');
const assert = require('assert');
const { loadGas, mkRow } = require('./gas_test_harness');

function basePayload() {
  return {
    action: 'ingest_order',
    channel: 'kds', staff_id: 'S001',
    items: [{ sku: 'DR001', name: 'Bạc xỉu', qty: 1, price: 40000, modifiers: {} }],
    payment: { method: 'cash' },
    metadata: { delivery_type: 'dine_in', notes: '' },
    idempotency_key: 'idem-abc',
    gateway_order_id: 'ORD-20260722-4242',
    gateway_short_code: 'Q21',
    printed_at: '2026-07-22T08:10:05+07:00',
  };
}

test('ingest append 1 dòng với id/short_code từ gateway, status CONFIRMED, label_printed_at set', () => {
  const ctx = loadGas(['Utils.gs','Orders.gs','Notify.gs','Code.gs'], { ordersRows: [], props: {} });
  const r = ctx.ingestPreMintedOrder(basePayload());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.order_id, 'ORD-20260722-4242');
  assert.strictEqual(r.short_code, 'Q21');
  assert.strictEqual(ctx._rows.length, 1);
  const row = ctx._rows[0];
  assert.strictEqual(row[0], 'ORD-20260722-4242');   // order_id
  assert.strictEqual(row[12], 'CONFIRMED');          // status
  assert.notStrictEqual(row[22], '');                // label_printed_at (col 23 idx22) đã set
});

test('ingest lần 2 cùng idempotency_key → deduped, KHÔNG append thêm, KHÔNG ghi đè', () => {
  const ctx = loadGas(['Utils.gs','Orders.gs','Notify.gs','Code.gs'], {
    ordersRows: [ mkRow({ order_id: 'ORD-20260722-9999', idem: 'idem-abc', short_code: 'Q05', status: 'DELIVERED' }) ],
    props: {},
  });
  const r = ctx.ingestPreMintedOrder(basePayload());
  assert.strictEqual(r.deduped, true);
  assert.strictEqual(ctx._rows.length, 1);           // vẫn 1 dòng
  assert.strictEqual(ctx._rows[0][0], 'ORD-20260722-9999');  // PK KHÔNG đổi
});
```
(Nếu `validateOrderPayload`/`sendTelegramAlert` gọi API ngoài, mock trong harness: thêm `UrlFetchApp: { fetch: () => ({ getContentText: () => '{}' }) }` và stub `getConfig` trả '' cho token Telegram để `sendTelegramAlert` no-op. Bổ sung vào `gas_test_harness.js` sandbox.)

- [ ] **Step 2: Chạy test — FAIL**

Run: `node --test ops/test_ingest_order.js`

- [ ] **Step 3: Implementation**

Trong `gas/Orders.gs`:
```javascript
function ingestPreMintedOrder(p) {
  var key = p.idempotency_key || (p.metadata && p.metadata.idempotency_key) || '';
  if (key) {
    var existing = findOrderIdByIdempotencyKey(key);
    if (existing) return { ok: true, order_id: existing, deduped: true };
  }
  // Dedup theo order_id (first-writer-wins) — không append/ghi đè nếu đã có.
  if (p.gateway_order_id && _findOrderRow(p.gateway_order_id)) {
    return { ok: true, order_id: p.gateway_order_id, deduped: true };
  }
  var order = validateOrderPayload(p);         // tính subtotal/total/promo chuẩn ở GAS
  order.order_id = p.gateway_order_id || order.order_id;
  order.metadata.short_code = p.gateway_short_code || order.metadata.short_code;
  order.status = 'CONFIRMED';
  order.confirmed_at = new Date().toISOString();
  order.label_printed_at = p.printed_at || new Date().toISOString();
  order.idempotency_key = key;
  appendOrderToSheet(order);
  // Ghi confirmed_at + label_printed_at vào đúng cột (appendOrderToSheet để trống các timestamp).
  var row = _findOrderRow(order.order_id);
  if (row) {
    var sheet = _ordersSheet();
    sheet.getRange(row.rowIndex, 14).setValue(order.confirmed_at);      // confirmed_at
    sheet.getRange(row.rowIndex, 23).setValue(order.label_printed_at);  // label_printed_at
  }
  try { sendTelegramAlert(buildTelegramOrderSummary(order)); }
  catch (tgErr) { logError('ingest.telegram', tgErr); }
  return { ok: true, order_id: order.order_id, short_code: order.metadata.short_code, deduped: false };
}
```
Trong `gas/Code.gs` `POST_ROUTES`:
```javascript
'ingest_order': {
  auth: AUTH.REPORT,
  handler: function(p) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return ingestPreMintedOrder(p); }
    finally { lock.releaseLock(); }
  }
},
```
Kiểm cột: `appendOrderToSheet` ghi `label_printed_at` là 1 trong 3 ô trống (index sau payment_status). Xác nhận col 23 = label_printed_at theo header `gas/Orders.gs:11-12` (`... 'payment_status', 'label_printed_at', 'invoice_url', 'printed_at' ...`). confirmed_at = col 14 theo `_getStatusTimestampColumn`.

- [ ] **Step 4: Chạy test — PASS**

Run: `node --test ops/test_ingest_order.js`

- [ ] **Step 5: Deploy GAS + smoke thật**

Run: `python3 ops/gas_push.py`
Rồi (thay `<URL>` + `<TOKEN>` thật):
```bash
curl -s -X POST '<GAS_URL>' -H 'Content-Type: application/json' \
  -d '{"action":"reserve_codes","type":"dine_in","n":5,"token":"<TOKEN>"}'
```
Expected: JSON `{"ok":true,"letter":"Q","from":N,"to":N+4,...}`.

- [ ] **Step 6: Commit**

```bash
git add gas/Orders.gs gas/Code.gs ops/test_ingest_order.js ops/gas_test_harness.js
git commit -m "feat(gas): ingest_order endpoint — append pre-minted order idempotently (first-writer-wins)"
```

### Task 2.4: Nới VALID_TRANSITIONS cho CONFIRMED→DELIVERED

**Files:**
- Modify: `gas/Orders.gs:21` (VALID_TRANSITIONS)
- Test: `ops/test_transitions.js`

**Interfaces:** Consumes `isValidTransition(from, to)`. Chỉ thêm `DELIVERED` vào danh sách hợp lệ của `CONFIRMED`. KHÔNG mở transition khác.

- [ ] **Step 1: Viết test**

`ops/test_transitions.js`:
```javascript
const test = require('node:test'); const assert = require('assert');
const { loadGas } = require('./gas_test_harness');
test('CONFIRMED→DELIVERED hợp lệ (đường [Xong]); DELIVERED→* vẫn cấm', () => {
  const ctx = loadGas(['Orders.gs'], {});
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','DELIVERED'), true);
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','MAKING'), true);   // giữ cũ
  assert.strictEqual(ctx.isValidTransition('DELIVERED','MAKING'), false);  // không mở ngược
  assert.strictEqual(ctx.isValidTransition('NEW','DELIVERED'), false);     // không mở tắt từ NEW
});
```

- [ ] **Step 2: Chạy — FAIL** (`CONFIRMED→DELIVERED` hiện false)

Run: `node --test ops/test_transitions.js`

- [ ] **Step 3: Sửa** `gas/Orders.gs:23`:
```javascript
  'CONFIRMED':  ['MAKING', 'DELIVERED', 'CANCELLED'],
```

- [ ] **Step 4: Chạy — PASS.** Run: `node --test ops/test_transitions.js`

- [ ] **Step 5: Commit**
```bash
git add gas/Orders.gs ops/test_transitions.js
git commit -m "feat(gas): allow CONFIRMED->DELIVERED transition for one-tap [Xong]"
```

---

## PHASE 3 — KDS Gateway (Mac Mini, LAN)

Mục tiêu: `print_server.py` nhận `/order`, mint id/code, in tem in-process, ghi outbox, syncer đẩy GAS. Đây là phần rủi ro cao nhất — TDD chặt.

### Task 3.1: Outbox SQLite + code_blocks (mint + dedup + FIFO)

**Files:**
- Create: `print-server/gateway.py`
- Test: `print-server/test_gateway.py`

**Interfaces (gateway.py công khai):**
- `class Gateway(db_path, gas_url, token, reserve_fn=None)` — `reserve_fn(delivery_type, n) -> dict{letter,date,from,to}` (inject để test; mặc định gọi GAS).
- `Gateway.mint_order(payload: dict) -> dict` — trả `{order_id, short_code, idempotency_key, deduped: bool}`. Dedup theo `idempotency_key`. Mint `order_id` = `ORD-<today>-<rand4>`; `short_code` từ block hi-lo (xin thêm khi cạn); offline band khi `reserve_fn` ném.
- `Gateway.enqueue(op: str, order_id, idempotency_key, payload: dict, short_code=None, printed_at=None)` — insert outbox.
- `Gateway.get_by_key(idempotency_key) -> dict|None` — cho confirm-before-fallback.
- `Gateway.unsynced() -> list[dict]` — op chưa sync theo `seq`, tôn trọng FIFO (status/mark_paid của 1 order chỉ trả sau khi ingest_order của order đó đã synced).
- `Gateway.mark_synced(seq)`.

- [ ] **Step 1: Viết test**

`print-server/test_gateway.py`:
```python
import os, tempfile, unittest
from gateway import Gateway

def fake_reserve(dtype, n):
    fake_reserve.calls += 1
    start = fake_reserve.next
    fake_reserve.next += n
    return {"letter": "Q", "date": "20260722", "from": start, "to": start + n - 1}
fake_reserve.calls = 0; fake_reserve.next = 1

def payload(idem="idem-1"):
    return {"channel": "kds", "items": [{"name": "Bạc xỉu", "qty": 1,
            "modifiers": {}}], "metadata": {"delivery_type": "dine_in"},
            "idempotency_key": idem}

class TestGateway(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        fake_reserve.calls = 0; fake_reserve.next = 1
        self.gw = Gateway(self.tmp, "http://gas", "tok", reserve_fn=fake_reserve, today="20260722")
    def tearDown(self):
        if os.path.exists(self.tmp): os.remove(self.tmp)

    def test_mint_assigns_orderid_and_shortcode(self):
        r = self.gw.mint_order(payload())
        self.assertTrue(r["order_id"].startswith("ORD-20260722-"))
        self.assertEqual(r["short_code"], "Q1")
        self.assertFalse(r["deduped"])

    def test_mint_dedup_same_key_returns_same_order(self):
        a = self.gw.mint_order(payload("k"))
        b = self.gw.mint_order(payload("k"))
        self.assertTrue(b["deduped"])
        self.assertEqual(a["order_id"], b["order_id"])
        self.assertEqual(a["short_code"], b["short_code"])

    def test_block_exhaustion_requests_new_block(self):
        # block size mặc định 20 → mint 21 đơn phải gọi reserve 2 lần
        for i in range(21):
            self.gw.mint_order(payload(f"k{i}"))
        self.assertEqual(fake_reserve.calls, 2)

    def test_offline_band_when_reserve_fails(self):
        def boom(dtype, n): raise RuntimeError("GAS down")
        gw = Gateway(tempfile.mktemp(suffix=".db"), "http://gas", "tok",
                     reserve_fn=boom, today="20260722")
        r = gw.mint_order(payload("kk"))
        self.assertIn("X", r["short_code"])       # offline band QX*
        self.assertTrue(r["short_code"].startswith("QX"))

    def test_get_by_key(self):
        a = self.gw.mint_order(payload("kx"))
        self.gw.enqueue("ingest_order", a["order_id"], "kx", payload("kx"),
                        short_code=a["short_code"], printed_at="t")
        got = self.gw.get_by_key("kx")
        self.assertEqual(got["order_id"], a["order_id"])

    def test_fifo_status_not_before_create(self):
        a = self.gw.mint_order(payload("kf"))
        self.gw.enqueue("ingest_order", a["order_id"], "kf", payload("kf"), a["short_code"], "t")
        self.gw.enqueue("mark_paid", a["order_id"], "kf-paid", {"order_id": a["order_id"]})
        pend = self.gw.unsynced()
        # ingest_order phải đứng trước mark_paid cùng order
        ops = [p["op"] for p in pend]
        self.assertEqual(ops[0], "ingest_order")
        # đánh dấu ingest synced → mark_paid mới xuất hiện đủ điều kiện
        self.gw.mark_synced(pend[0]["seq"])
        pend2 = self.gw.unsynced()
        self.assertTrue(any(p["op"] == "mark_paid" for p in pend2))

    def test_midnight_rollover_flushes_old_block(self):
        self.gw.mint_order(payload("d1"))          # Q1 ngày 20260722
        self.gw.today = "20260723"                 # sang ngày mới
        fake_reserve.next = 1
        r = self.gw.mint_order(payload("d2"))
        self.assertEqual(r["short_code"], "Q1")    # reset theo ngày, xin block mới
        self.assertEqual(fake_reserve.calls, 2)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy — FAIL** (`No module named 'gateway'`)

Run: `cd print-server && python3 -m unittest test_gateway -v`

- [ ] **Step 3: Viết gateway.py**

```python
"""gateway.py — KDS local-first order intake: mint id/code, outbox, hi-lo blocks, sync state."""
import json, random, sqlite3, threading, urllib.request, urllib.error, ssl
from datetime import datetime, timezone, timedelta

BLOCK_SIZE = 20
_VN = timezone(timedelta(hours=7))

def _today_str():
    return datetime.now(_VN).strftime("%Y%m%d")

def _now_iso():
    return datetime.now(_VN).isoformat()

def _letter_for(dtype):
    return "G" if dtype == "delivery" else ("Q" if dtype == "dine_in" else "M")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL, order_id TEXT NOT NULL, idempotency_key TEXT,
  payload TEXT NOT NULL, short_code TEXT, printed_at TEXT,
  synced_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_key ON outbox(op, idempotency_key);
CREATE TABLE IF NOT EXISTS code_blocks (
  date TEXT, letter TEXT, next_seq INTEGER, block_to INTEGER, emergency INTEGER DEFAULT 0,
  PRIMARY KEY (date, letter, emergency)
);
"""

class Gateway:
    def __init__(self, db_path, gas_url, token, reserve_fn=None, today=None):
        self.db_path = db_path
        self.gas_url = gas_url
        self.token = token
        self._reserve_fn = reserve_fn or self._reserve_via_gas
        self._today_override = today
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    @property
    def today(self):
        return self._today_override or _today_str()
    @today.setter
    def today(self, v):
        self._today_override = v

    # ── minting ────────────────────────────────────────────────
    def _gen_order_id(self):
        return "ORD-%s-%04d" % (self.today, random.randint(1000, 9999))

    def _reserve_via_gas(self, dtype, n):
        body = json.dumps({"action": "reserve_codes", "type": dtype, "n": n,
                           "token": self.token}).encode()
        req = urllib.request.Request(self.gas_url, data=body,
              headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=8, context=ssl.create_default_context()) as r:
            d = json.loads(r.read().decode())
        if not d.get("ok"):
            raise RuntimeError("reserve failed: %s" % d)
        return d

    def _get_block(self, letter, dtype):
        """Trả (next_seq, block_to, emergency_bool). Xin block mới khi cạn/đổi ngày; offline band khi GAS ném."""
        cur = self._conn.execute(
            "SELECT next_seq, block_to, emergency FROM code_blocks WHERE date=? AND letter=? AND emergency=0",
            (self.today, letter)).fetchone()
        if cur and cur["next_seq"] <= cur["block_to"]:
            return cur["next_seq"], cur["block_to"], False
        # cần block mới (chưa có hôm nay, hoặc cạn)
        try:
            blk = self._reserve_fn(dtype, BLOCK_SIZE)
            self._conn.execute(
                "INSERT OR REPLACE INTO code_blocks(date,letter,next_seq,block_to,emergency) VALUES(?,?,?,?,0)",
                (self.today, letter, blk["from"], blk["to"]))
            self._conn.commit()
            return blk["from"], blk["to"], False
        except Exception:
            # offline band: đếm riêng, không đụng GAS
            row = self._conn.execute(
                "SELECT next_seq FROM code_blocks WHERE date=? AND letter=? AND emergency=1",
                (self.today, letter)).fetchone()
            nxt = (row["next_seq"] if row else 1)
            return nxt, 10**9, True

    def mint_order(self, payload):
        key = payload.get("idempotency_key") or (payload.get("metadata") or {}).get("idempotency_key") or ""
        with self._lock:
            if key:
                ex = self.get_by_key(key)
                if ex:
                    return {"order_id": ex["order_id"], "short_code": ex["short_code"],
                            "idempotency_key": key, "deduped": True}
            dtype = (payload.get("metadata") or {}).get("delivery_type", "dine_in")
            letter = _letter_for(dtype)
            seq, block_to, emergency = self._get_block(letter, dtype)
            if emergency:
                short_code = "%sX%d" % (letter, seq)
                self._conn.execute(
                    "INSERT OR REPLACE INTO code_blocks(date,letter,next_seq,block_to,emergency) VALUES(?,?,?,?,1)",
                    (self.today, letter, seq + 1, 10**9))
            else:
                short_code = "%s%02d" % (letter, seq) if seq < 100 else "%s%d" % (letter, seq)
                self._conn.execute(
                    "UPDATE code_blocks SET next_seq=? WHERE date=? AND letter=? AND emergency=0",
                    (seq + 1, self.today, letter))
            self._conn.commit()
            return {"order_id": self._gen_order_id(), "short_code": short_code,
                    "idempotency_key": key, "deduped": False}

    # ── outbox ─────────────────────────────────────────────────
    def enqueue(self, op, order_id, idempotency_key, payload, short_code=None, printed_at=None):
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO outbox(op,order_id,idempotency_key,payload,short_code,printed_at) "
                "VALUES(?,?,?,?,?,?)",
                (op, order_id, idempotency_key, json.dumps(payload), short_code, printed_at))
            self._conn.commit()

    def get_by_key(self, idempotency_key):
        row = self._conn.execute(
            "SELECT order_id, short_code FROM outbox WHERE op='ingest_order' AND idempotency_key=?",
            (idempotency_key,)).fetchone()
        return dict(row) if row else None

    def unsynced(self):
        rows = self._conn.execute(
            "SELECT * FROM outbox WHERE synced_at IS NULL ORDER BY seq ASC").fetchall()
        synced_creates = set(r["order_id"] for r in self._conn.execute(
            "SELECT order_id FROM outbox WHERE op='ingest_order' AND synced_at IS NOT NULL").fetchall())
        out = []
        for r in rows:
            if r["op"] != "ingest_order" and r["order_id"] not in synced_creates:
                # status/mark_paid chưa được sync trước khi create của nó lên GAS
                if not any(x["order_id"] == r["order_id"] and x["op"] == "ingest_order"
                           and x["synced_at"] is None for x in rows if x["seq"] < r["seq"]):
                    # nếu create của order này KHÔNG còn pending trước nó và cũng chưa synced → chờ
                    pass
                # đơn giản: chỉ cho qua nếu create đã synced
                if r["order_id"] not in synced_creates:
                    continue
            out.append(dict(r))
        return out

    def mark_synced(self, seq):
        with self._lock:
            self._conn.execute("UPDATE outbox SET synced_at=? WHERE seq=?", (_now_iso(), seq))
            self._conn.commit()

    def mark_error(self, seq, err):
        with self._lock:
            self._conn.execute(
                "UPDATE outbox SET attempts=attempts+1, last_error=? WHERE seq=?", (str(err)[:400], seq))
            self._conn.commit()
```
Lưu ý FIFO: `unsynced()` chỉ cho op `status`/`mark_paid` đi qua khi op `ingest_order` cùng `order_id` đã `synced_at`. Rút gọn logic để test `test_fifo_status_not_before_create` xanh (bỏ nhánh `pass` thừa nếu cần, giữ điều kiện `r["order_id"] not in synced_creates: continue`).

- [ ] **Step 4: Chạy — PASS** (7 tests)

Run: `cd print-server && python3 -m unittest test_gateway -v`
Nếu `test_fifo` hoặc `test_midnight` đỏ → chỉnh `unsynced()`/`_get_block` cho đúng, chạy lại tới xanh.

- [ ] **Step 5: Commit**
```bash
git add print-server/gateway.py print-server/test_gateway.py
git commit -m "feat(gateway): SQLite outbox + hi-lo minting + offline band + FIFO sync ordering"
```

### Task 3.2: Flask routes trong print_server.py + in tem in-process

**Files:**
- Modify: `print-server/print_server.py` (import gateway + printlib; thêm routes; khởi tạo Gateway singleton; syncer thread)
- Test: `print-server/test_routes.py`

**Interfaces:**
- `POST /order` body = KDS payload JSON → `{ok, order_id, short_code, printed, warning?}`. In tem từng ly (build_label_tspl), set printed_at, enqueue op `ingest_order` với payload + gateway_order_id/short_code/printed_at.
- `GET /order?key=<k>` → `{ok, found, order_id?, short_code?}`.
- `POST /order/status` body `{order_id, status}` → online đẩy GAS `update_status`, offline enqueue op `status`.
- `POST /order/mark_paid` body `{order_id, total?, order?}` → online GAS `mark_paid`; offline in receipt local (build_receipt) + enqueue op `mark_paid`.

- [ ] **Step 1: Viết test** (dùng Flask test client, monkeypatch gửi máy in + GAS)

`print-server/test_routes.py`:
```python
import json, os, tempfile, unittest
import print_server

class TestRoutes(unittest.TestCase):
    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        # Ép gateway dùng DB tạm + reserve giả + không gọi máy in thật
        self._db = tempfile.mktemp(suffix=".db")
        from gateway import Gateway
        def fake_reserve(dtype, n): return {"letter": "Q", "date": "20260722", "from": 1, "to": n}
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=fake_reserve, today="20260722")
        self._printed = []
        print_server._print_label_bytes = lambda data: self._printed.append(data) or len(data)
    def tearDown(self):
        if os.path.exists(self._db): os.remove(self._db)

    def test_post_order_prints_and_returns_code(self):
        body = {"channel":"kds","items":[{"name":"Bạc xỉu","qty":2,"modifiers":{}}],
                "metadata":{"delivery_type":"dine_in"},"idempotency_key":"r1"}
        r = self.c.post("/order", json=body)
        d = r.get_json()
        self.assertTrue(d["ok"]); self.assertTrue(d["printed"])
        self.assertEqual(d["short_code"], "Q01")
        self.assertEqual(len(self._printed), 2)     # qty=2 → 2 tem

    def test_get_order_by_key(self):
        body = {"items":[{"name":"X","qty":1,"modifiers":{}}],
                "metadata":{"delivery_type":"dine_in"},"idempotency_key":"r2"}
        self.c.post("/order", json=body)
        r = self.c.get("/order?key=r2")
        d = r.get_json()
        self.assertTrue(d["found"]); self.assertTrue(d["order_id"].startswith("ORD-"))

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd print-server && python3 -m unittest test_routes -v`

- [ ] **Step 3: Implementation trong print_server.py**

Sau phần import + `app = Flask(__name__)`, thêm:
```python
import json, threading, urllib.request, ssl
from gateway import Gateway
from printlib import build_label_tspl, build_receipt

GATEWAY = Gateway(
    os.getenv("GATEWAY_DB", os.path.join(os.path.dirname(__file__), "outbox.db")),
    os.getenv("GAS_WEBAPP_URL", ""),
    os.getenv("REPORT_API_TOKEN", ""),
)

def _print_label_bytes(data: bytes) -> int:
    """In 1 tem TSPL qua đường label sẵn có (_label_send)."""
    return _label_send(data)["bytes"]

def _print_receipt_bytes(data: bytes) -> int:
    return _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
                 RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data,
                 usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID,
                 usb_ep=RECEIPT_USB_EP, cups_printer=RECEIPT_CUPS_PRINTER)

def _gas_post(payload: dict, timeout=8) -> dict:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(GATEWAY.gas_url, data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
        return json.loads(r.read().decode())
```
Routes (thêm cạnh `/print/label`):
```python
@app.post("/order")
def order_create():
    payload = request.get_json(force=True, silent=True) or {}
    minted = GATEWAY.mint_order(payload)
    order_id, short_code = minted["order_id"], minted["short_code"]
    if minted["deduped"]:
        return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                        "printed": True, "deduped": True}), 200
    # Build order dict cho tem
    order = {
        "order_id": order_id,
        "timestamp": payload.get("timestamp") or _now_iso_server(),
        "table_id": payload.get("table_id", ""),
        "customer_name": payload.get("customer_name", ""),
        "customer_id": payload.get("customer_id", ""),
        "metadata": {"short_code": short_code,
                     "delivery_type": (payload.get("metadata") or {}).get("delivery_type", "dine_in"),
                     "notes": (payload.get("metadata") or {}).get("notes", "")},
        "items": payload.get("items", []),
    }
    # Expand theo qty → in từng ly
    cups = []
    for it in order["items"]:
        for _ in range(max(1, int(it.get("qty", 1)))):
            cups.append(it)
    printed_ok, warning = True, None
    printed_at = _now_iso_server()
    for i, item in enumerate(cups, start=1):
        try:
            _print_label_bytes(build_label_tspl(order, item, i, len(cups)))
        except Exception as exc:
            log.error("label print failed %s: %s", order_id, exc)
            printed_ok, warning = False, "print_failed"
    # enqueue ingest bất kể in được không (không nuốt đơn)
    ing = dict(payload)
    ing["gateway_order_id"] = order_id
    ing["gateway_short_code"] = short_code
    ing["printed_at"] = printed_at
    GATEWAY.enqueue("ingest_order", order_id, minted["idempotency_key"], ing,
                    short_code=short_code, printed_at=printed_at)
    return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                    "printed": printed_ok, "warning": warning}), 200

@app.get("/order")
def order_lookup():
    key = request.args.get("key", "")
    found = GATEWAY.get_by_key(key) if key else None
    if not found:
        return jsonify({"ok": True, "found": False}), 200
    return jsonify({"ok": True, "found": True, **found}), 200

@app.post("/order/status")
def order_status():
    p = request.get_json(force=True, silent=True) or {}
    order_id, status = p.get("order_id"), p.get("status")
    try:
        d = _gas_post({"action": "update_status", "order_id": order_id,
                       "status": status, "token": GATEWAY.token})
        return jsonify(d), 200
    except Exception as exc:
        GATEWAY.enqueue("status", order_id, f"{order_id}:{status}",
                        {"action": "update_status", "order_id": order_id, "status": status})
        return jsonify({"ok": True, "queued_offline": True}), 200

@app.post("/order/mark_paid")
def order_mark_paid():
    p = request.get_json(force=True, silent=True) or {}
    order_id = p.get("order_id")
    try:
        d = _gas_post({"action": "mark_paid", "order_id": order_id, "token": GATEWAY.token})
        return jsonify(d), 200
    except Exception:
        # offline: in receipt local nếu có order snapshot, rồi enqueue
        if p.get("order"):
            try: _print_receipt_bytes(build_receipt(p["order"]))
            except Exception as exc: log.error("offline receipt failed: %s", exc)
        GATEWAY.enqueue("mark_paid", order_id, f"{order_id}:paid",
                        {"action": "mark_paid", "order_id": order_id})
        return jsonify({"ok": True, "queued_offline": True}), 200
```
Thêm helper `_now_iso_server`:
```python
def _now_iso_server():
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=7))).isoformat()
```

- [ ] **Step 4: Chạy — PASS**

Run: `cd print-server && python3 -m unittest test_routes -v`

- [ ] **Step 5: Commit**
```bash
git add print-server/print_server.py print-server/test_routes.py
git commit -m "feat(gateway): /order, /order/status, /order/mark_paid routes with local-first print"
```

### Task 3.3: Syncer thread + poller bỏ qua đơn đã có label_printed_at

**Files:**
- Modify: `print-server/print_server.py` (khởi động syncer thread), `print-server/print_poller.py` (`poll_labels_once` skip khi `label_printed_at` set — xác nhận GAS `pending_labels` đã lọc; nếu chưa, lọc phía poller)
- Test: `print-server/test_syncer.py`

**Interfaces:** `GATEWAY.sync_once() -> int` (số op đẩy thành công). Syncer thread gọi `sync_once` mỗi `SYNC_INTERVAL` giây (default 3), backoff khi lỗi.

- [ ] **Step 1: Viết test** (monkeypatch `_gas_post` để giả ack)

`print-server/test_syncer.py`:
```python
import os, tempfile, unittest
from gateway import Gateway

class TestSyncer(unittest.TestCase):
    def setUp(self):
        self._db = tempfile.mktemp(suffix=".db")
        def fake_reserve(dtype, n): return {"letter":"Q","date":"20260722","from":1,"to":n}
        self.gw = Gateway(self._db, "http://gas", "tok", reserve_fn=fake_reserve, today="20260722")
        self.sent = []
        self.gw._poster = lambda payload: (self.sent.append(payload) or {"ok": True})
    def tearDown(self):
        if os.path.exists(self._db): os.remove(self._db)

    def test_sync_once_pushes_and_marks(self):
        m = self.gw.mint_order({"items":[{"name":"X","qty":1,"modifiers":{}}],
              "metadata":{"delivery_type":"dine_in"},"idempotency_key":"s1"})
        self.gw.enqueue("ingest_order", m["order_id"], "s1",
                        {"gateway_order_id": m["order_id"]}, m["short_code"], "t")
        n = self.gw.sync_once()
        self.assertEqual(n, 1)
        self.assertEqual(self.gw.unsynced(), [])   # đã synced hết

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy — FAIL** (`sync_once`/`_poster` chưa có)

Run: `cd print-server && python3 -m unittest test_syncer -v`

- [ ] **Step 3: Implementation trong gateway.py**

Thêm vào `Gateway.__init__`: `self._poster = None`. Thêm method:
```python
def _post_to_gas(self, payload):
    if self._poster:  # test hook
        return self._poster(payload)
    body = json.dumps({**payload, "token": self.token}).encode()
    req = urllib.request.Request(self.gas_url, data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10, context=ssl.create_default_context()) as r:
        return json.loads(r.read().decode())

def sync_once(self):
    n = 0
    for op in self.unsynced():
        payload = json.loads(op["payload"])
        payload["action"] = {"ingest_order":"ingest_order","status":"update_status",
                             "mark_paid":"mark_paid"}[op["op"]]
        try:
            d = self._post_to_gas(payload)
            if d.get("ok"):
                self.mark_synced(op["seq"]); n += 1
            else:
                self.mark_error(op["seq"], d.get("error", "not ok"))
        except Exception as exc:
            self.mark_error(op["seq"], exc)
            break   # dừng vòng khi GAS lỗi, thử lại sau
    return n
```
Trong `print_server.py`, sau khi tạo GATEWAY, khởi động thread (chỉ khi chạy như main, không khi TESTING):
```python
def _syncer_loop():
    import time
    interval = float(os.getenv("SYNC_INTERVAL", "3"))
    while True:
        try:
            done = GATEWAY.sync_once()
        except Exception as exc:
            log.error("syncer error: %s", exc); done = 0
        time.sleep(interval if done else min(30, interval * 2))

if os.getenv("GATEWAY_SYNC", "1") == "1" and __name__ != "__main__":
    pass  # thread start ở khối __main__ để test không chạy nền
```
Trong khối `if __name__ == "__main__":` (cuối file), trước `app.run`:
```python
    if os.getenv("GATEWAY_SYNC", "1") == "1":
        threading.Thread(target=_syncer_loop, daemon=True).start()
        log.info("gateway syncer thread started")
```

- [ ] **Step 4: poller skip đơn đã in tem**

Trong `print_poller.py` `poll_labels_once`, sau khi lấy `orders`, lọc bỏ đơn đã có `label_printed_at` (phòng khi GAS `pending_labels` chưa lọc): thêm đầu vòng `for order in orders:`:
```python
        if order.get("label_printed_at"):
            continue   # gateway đã in local, đừng in đôi
```
Xác nhận GAS `_getPendingLabelOrders` (Code.gs) đã lọc `label_printed_at` trống — nếu đã lọc thì đoạn này là double-guard vô hại.

- [ ] **Step 5: Chạy — PASS**

Run: `cd print-server && python3 -m unittest test_syncer test_gateway test_routes test_printlib -v`
Expected: tất cả PASS.

- [ ] **Step 6: Commit**
```bash
git add print-server/gateway.py print-server/print_server.py print-server/print_poller.py print-server/test_syncer.py
git commit -m "feat(gateway): background syncer thread + poller skips gateway-printed labels"
```

### Task 3.4: launchd env cho gateway (không tạo service mới)

**Files:**
- Modify: `print-server/com.lamha.kissaten.printpoller.plist` (hoặc plist của print_server nếu tách) — thêm env `GAS_WEBAPP_URL`, `REPORT_API_TOKEN`, `GATEWAY_DB`, `SYNC_INTERVAL`. Nếu print_server chưa có plist riêng, tạo `print-server/com.lamha.kissaten.printserver.plist` theo mẫu poller.

- [ ] **Step 1:** Kiểm plist hiện có: `cat print-server/com.lamha.kissaten.printpoller.plist`. Xác định print_server chạy bằng gì (launchd item nào). Nếu chung 1 plist → thêm EnvironmentVariables. Nếu print_server khởi động tay → tạo plist mới bằng cách copy poller plist, đổi `Label`, `ProgramArguments` trỏ `print_server.py`, thêm block:
```xml
<key>EnvironmentVariables</key>
<dict>
  <key>GAS_WEBAPP_URL</key><string>PLACEHOLDER_SET_ON_MAC</string>
  <key>REPORT_API_TOKEN</key><string>PLACEHOLDER_SET_ON_MAC</string>
  <key>GATEWAY_DB</key><string>/Users/&lt;user&gt;/print-server/outbox.db</string>
  <key>SYNC_INTERVAL</key><string>3</string>
</dict>
```
(Giá trị token thật KHÔNG commit — chủ quán điền trên Mac. Ghi rõ trong `print-server/README.md`.)

- [ ] **Step 2: Commit**
```bash
git add print-server/*.plist print-server/README.md
git commit -m "chore(gateway): launchd env vars for gateway (secrets set on-device)"
```

---

## PHASE 4 — KDS frontend: box-first + confirm-before-fallback + Optimistic UI

Mục tiêu: `web/kds.html` gửi đơn tới gateway trước, confirm trước khi fallback GAS, chèn ticket lên board 0ms. Sau flag `LOCAL_FIRST`.

### Task 4.1: Cấu hình flag + endpoint gateway trong kds.html

**Files:** Modify `web/kds.html` (khối config đầu `<script>`, cạnh `GAS_URL` dòng 449)

- [ ] **Step 1:** Thêm sau `GAS_URL`:
```javascript
const LOCAL_FIRST   = true;                         // bật local-first; false = hành vi cũ
const GATEWAY_URL   = 'http://' + location.hostname.replace(/:.*/, '') + ':5001';
// Ghi chú: KDS mở trên LAN cùng Mac Mini → hostname là IP LAN của Mac Mini,
// hoặc hardcode 'http://192.168.1.50:5001' nếu KDS phục vụ từ nơi khác.
function uuid() { return (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2)); }
```
Không có test unit JS ở repo cho kds.html → xác minh bằng E2E ở Task 4.4. Commit gộp với 4.2.

### Task 4.2: submitOrder box-first + confirm-before-fallback

**Files:** Modify `web/kds.html` — hàm submit đơn hiện tại (POST `GAS_URL` ~dòng 1276).

**Interfaces:** `submitOrder(payload) -> {order_id, short_code}` (throw nếu cả box lẫn GAS fail). Client sinh `idempotency_key` 1 lần, gắn vào `payload.metadata.idempotency_key`.

- [ ] **Step 1:** Thay thân submit hiện tại bằng:
```javascript
async function submitOrder(payload) {
  payload.metadata = payload.metadata || {};
  if (!payload.metadata.idempotency_key) payload.metadata.idempotency_key = uuid();
  const key = payload.metadata.idempotency_key;

  if (LOCAL_FIRST) {
    try {
      const res = await fetch(`${GATEWAY_URL}/order`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) return { order_id: d.order_id, short_code: d.short_code, warning: d.warning };
      throw new Error(d.error || 'gateway_not_ok');
    } catch (err) {
      // Phân biệt: response timeout (box có thể sống) vs connection refused (box chết)
      // fetch không cho biết rõ → confirm-before-fallback: hỏi lại box theo key.
      try {
        const c = await fetch(`${GATEWAY_URL}/order?key=${encodeURIComponent(key)}`,
                              { cache: 'no-store' });
        const cd = await c.json();
        if (cd.found) return { order_id: cd.order_id, short_code: cd.short_code };
      } catch (_) { /* box thật sự không reach → fallback GAS */ }
    }
  }
  // Fallback GAS (box tắt hẳn, hoặc LOCAL_FIRST=false)
  const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || 'gas_error');
  return { order_id: d.order_id, short_code: d.short_code };
}
```

- [ ] **Step 2:** Chỗ gọi submit cũ (nút "đặt đơn") gọi `submitOrder(payload)` và dùng `{order_id, short_code}` trả về. Nếu `warning === 'print_failed'` → hiện nút "In lại tem" (gọi `fetch(GATEWAY_URL + '/order', ...)` lại với cùng key → gateway dedup, chỉ in lại nếu bạn thêm endpoint reprint; tối giản: `alert('Tem chưa in ra — kiểm tra máy in')`).

- [ ] **Step 3: Commit**
```bash
git add web/kds.html
git commit -m "feat(kds): box-first order submit with confirm-before-fallback (idempotency key)"
```

### Task 4.3: Optimistic UI insert

**Files:** Modify `web/kds.html` — sau khi `submitOrder` trả về, chèn đơn vào `allOrders` + `renderOrders()`; `loadOrders` dedup theo `order_id`.

- [ ] **Step 1:** Sau khi tạo đơn thành công, build 1 order object tối thiểu khớp shape board dùng và:
```javascript
function optimisticInsert(payload, minted) {
  const o = {
    order_id: minted.order_id,
    status: 'CONFIRMED',
    payment_status: 'PENDING',
    total: payload.total || 0,
    items: payload.items || [],
    table_id: payload.table_id || '',
    customer_name: payload.customer_name || '',
    metadata: { short_code: minted.short_code,
                delivery_type: (payload.metadata||{}).delivery_type || 'dine_in',
                notes: (payload.metadata||{}).notes || '' },
    timestamp: new Date().toISOString(),
    _optimistic: true,
  };
  if (!allOrders.find(x => x.order_id === o.order_id)) { allOrders.unshift(o); seenOrderIds.add(o.order_id); }
  renderOrders();
}
```
Gọi `optimisticInsert(payload, minted)` ngay sau `submitOrder`.

- [ ] **Step 2:** `loadOrders` dedup: sau `allOrders = data.orders;` thay bằng merge giữ đơn optimistic chưa xuất hiện từ GAS:
```javascript
  const serverIds = new Set(data.orders.map(o => o.order_id));
  const stillPending = allOrders.filter(o => o._optimistic && !serverIds.has(o.order_id));
  allOrders = [...stillPending, ...data.orders];
```

- [ ] **Step 3: Commit**
```bash
git add web/kds.html
git commit -m "feat(kds): optimistic UI insert — ticket appears 0ms, dedup on GAS refresh"
```

### Task 4.4: E2E verify (browser preview)

- [ ] **Step 1:** Khởi động print_server local (env test) + phục vụ web/. Dùng preview_start cho web, và chạy gateway với reserve giả nếu GAS chưa sẵn. Tạo 1 đơn dine_in trên KDS.
- [ ] **Step 2:** Xác nhận: ticket nảy lên board tức thì; `GATEWAY/order` trả `short_code` Q**; outbox có 1 dòng `ingest_order`; sau syncer, đơn xuất hiện trong `?action=orders` và board KHÔNG nhân đôi.
- [ ] **Step 3:** Không commit (chỉ verify). Ghi kết quả cho chief.

---

## PHASE 5 — Status UX: 1 nút [Xong] + toggle "pha" ẩn + pickup 2 nút

Mục tiêu: rút nút bấm. auto-CONFIRMED đã có (gateway tạo đơn ở CONFIRMED). Route status/mark_paid qua gateway (offline-capable).

### Task 5.1: Render nút theo delivery_type

**Files:** Modify `web/kds.html` — hàm render card đơn (khối `renderOrders`/template quanh dòng 800-823 + `markPaid`/`updateStatus`).

**Quy tắc nút** (đơn CONFIRMED/MAKING, chưa DELIVERED):
- dine_in: 1 nút chính **[Xong]** → `finishOrder(orderId)`. Toggle "Đang pha" ẩn (icon nhỏ) → `setMaking(orderId)`.
- pickup/take_away: nút **[Sẵn sàng]** → `setReady(orderId)` (hiện khi chưa READY); rồi **[Xong]**.
- delivery: giữ nguyên flow cũ (không đụng — đơn remote).

- [ ] **Step 1:** Trong template card, thay khối nút hành động bằng:
```javascript
function actionButtons(o) {
  const dt = (o.metadata||{}).delivery_type || 'dine_in';
  if (dt === 'delivery') return legacyDeliveryButtons(o);   // giữ nguyên cũ
  const paidBtn = `<button class="btn-primary" onclick="finishOrder('${o.order_id}', this)">✅ Xong</button>`;
  const makingToggle = (o.status === 'CONFIRMED')
    ? `<button class="btn-ghost btn-sm" title="Đang pha" onclick="setMaking('${o.order_id}', this)">☕</button>` : '';
  if (dt === 'take_away' || dt === 'pickup') {
    const readyBtn = (o.status !== 'READY')
      ? `<button class="btn-secondary" onclick="setReady('${o.order_id}', this)">🔔 Sẵn sàng</button>` : '';
    return readyBtn + paidBtn + makingToggle;
  }
  return paidBtn + makingToggle;   // dine_in
}
```
Chèn `${actionButtons(o)}` vào template thay các nút cũ.

- [ ] **Step 2: Commit** (gộp với 5.2).

### Task 5.2: finishOrder / setReady / setMaking (route qua gateway)

**Files:** Modify `web/kds.html`.

**Interfaces:**
- `finishOrder(orderId, btn)` — cash: gọi gateway `/order/mark_paid` (in receipt + PAID + tem) rồi `/order/status`=DELIVERED; vietqr: chỉ `/order/status`=DELIVERED. Cập nhật `o.status`, `o.payment_status` optimistic.
- `setReady(orderId, btn)` — `/order/status`=READY.
- `setMaking(orderId, btn)` — `/order/status`=MAKING.

- [ ] **Step 1:** Thêm helper gọi gateway (fallback GAS như submitOrder):
```javascript
async function gatewayPost(path, body) {
  if (LOCAL_FIRST) {
    try {
      const r = await fetch(`${GATEWAY_URL}${path}`, { method:'POST',
        headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json(); if (d.ok) return d;
    } catch (_) { /* rơi xuống GAS */ }
  }
  // fallback GAS trực tiếp (đường cũ)
  const qs = path === '/order/mark_paid'
    ? `?action=mark_paid&order_id=${encodeURIComponent(body.order_id)}${TQ}`
    : `?action=update_status&order_id=${encodeURIComponent(body.order_id)}&status=${body.status}${TQ}`;
  const r = await fetch(`${GAS_URL}${qs}`); const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'error'); return d;
}

async function finishOrder(orderId, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang lưu...';
  const o = allOrders.find(x => x.order_id === orderId);
  const method = (o && o.payment && o.payment.method) || (o && o.payment_method) || 'cash';
  try {
    if (method === 'cash') {
      await gatewayPost('/order/mark_paid', { order_id: orderId, order: o, total: o && o.total });
      if (o) o.payment_status = 'PAID';
    }
    await gatewayPost('/order/status', { order_id: orderId, status: 'DELIVERED' });
    if (o) o.status = 'DELIVERED';
    renderOrders();
  } catch (err) {
    btn.disabled = false; btn.textContent = old;
    alert('Chưa đóng đơn được (' + ((err&&err.message)||'mất kết nối') + ') — bấm lại.');
  }
}
async function setReady(orderId, btn) { await _statusBtn(orderId, 'READY', btn); }
async function setMaking(orderId, btn) { await _statusBtn(orderId, 'MAKING', btn); }
async function _statusBtn(orderId, status, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = '...';
  try { await gatewayPost('/order/status', { order_id: orderId, status });
        const o = allOrders.find(x => x.order_id === orderId); if (o) o.status = status; renderOrders(); }
  catch (_) { btn.disabled = false; btn.textContent = old; alert('Lỗi — thử lại.'); }
}
```

- [ ] **Step 2: E2E verify:** dine_in cash → 1 nút [Xong] → PAID+DELIVERED+receipt+tem đúng 1 lần; bấm [Xong] lần 2 → không cấp tem/tiền lần 2 (GAS `markOrderPaid` guard). pickup → [Sẵn sàng] ping Zalo rồi [Xong]. Rớt internet (tắt GAS URL): [Xong] vẫn in receipt local + queue.

- [ ] **Step 3: Commit**
```bash
git add web/kds.html
git commit -m "feat(kds): one-tap [Xong] (cash=paid+delivered), pickup ready button, hidden making toggle, offline via gateway"
```

---

## REVIEW CHECKLIST (Claude / chief — chạy sau khi Antigravity xong)

Đọc diff toàn bộ + chạy gate 4 lớp. Xác minh từng dòng, đừng tin báo cáo agent (agent từng báo sai).

1. **Bán kính §10 spec — mỗi mục có test xanh?**
   - [ ] VALID_TRANSITIONS: `CONFIRMED→DELIVERED` mở, `DELIVERED→*` + `NEW→DELIVERED` vẫn cấm (test_transitions).
   - [ ] Double-receipt: [Xong] cash chạy `mark_paid` (receipt) + `status=DELIVERED` (side-effect cũng gọi `printThermalReceipt`) → verify `printed_at` dedup thật, chỉ 1 receipt. **Đọc `printThermalReceipt` + `_getPendingPrintOrders` để chắc chắn dedup theo `printed_at`.**
   - [ ] Watermark: seed từ MAX; đơn CANCELLED không tụt số (test_shortcode_watermark).
   - [ ] Poller không in đôi: đơn gateway có `label_printed_at` → poller skip; đơn remote (label_printed_at trống) → poller vẫn in.
   - [ ] Financials: `markOrderPaid` → `computeDailyMetrics` gọi đúng 1 lần cho [Xong] cash.
   - [ ] Cash recon (`CashRecon.gs`/`chot-ca`): đơn cash PAID vào recon; nếu op mark_paid còn trong outbox (offline) → recon chờ outbox cạn. **Kiểm không lệch két.**
   - [ ] Zalo: dine_in KHÔNG ping MAKING/READY; pickup ping READY 1 lần.
   - [ ] Free-drink pending count (`Orders.gs:524`): [Xong]=PAID đổi tập UNPAID đúng; **giao với lỗi double-spend ly free đang treo (task_d28049e3) — kiểm kỹ không cấp/ trừ đôi**.
   - [ ] Idempotency đầu-cuối: box retry + fallback GAS + double-submit → 1 row, 1 tem loyalty, 1 receipt.
   - [ ] Fallback L3: tắt gateway → KDS confirm fail → POST GAS; đơn không mint 2 lần (idempotency_key).
2. **Gate 4 lớp:**
   - [ ] Unit: `cd print-server && python3 -m unittest discover -v` xanh; `node --test ops/test_shortcode_watermark.js ops/test_ingest_order.js ops/test_transitions.js` xanh.
   - [ ] Syntax: `python3 -c "import print_server, print_poller, printlib, gateway"`; GAS deploy `python3 ops/gas_push.py` không lỗi.
   - [ ] API smoke: `reserve_codes` trả dải; `ingest_order` 2 lần cùng key → 1 row; `mark_paid` 2 lần → tem 1 lần.
   - [ ] E2E: KDS tạo → tem in + ticket 0ms → Sheets có đơn → [Xong] → đúng side-effect; pickup ping; offline [Xong] in receipt local.
3. **Regression đơn remote:** đặt 1 đơn QR/remote qua GAS như cũ → poller in tem, flow không đổi.
4. **Rollback:** đặt `LOCAL_FIRST=false` trong kds.html → hành vi cũ 100%. Xác nhận.

## Self-review (đã chạy khi viết plan)

- Spec coverage: §3 topology→Phase 3/4; §5a fallback→Task 4.2; §5c Optimistic→Task 4.3; §6 hi-lo+watermark+midnight→Task 2.1/2.2/3.1; §7 status UX→Phase 5; §8 [Xong]→Task 5.2; §9 GAS changes→Phase 2; §10 blast radius→Review checklist; §11 failure modes→test_gateway offline/midnight + Task 4.2; §12 tests→mọi Task + checklist. Không thấy gap.
- Placeholder: các giá trị token/URL là PLACEHOLDER cố ý (secret set on-device) — đã ghi rõ; không phải placeholder logic.
- Type consistency: `mint_order`/`enqueue`/`get_by_key`/`unsynced`/`sync_once` dùng nhất quán giữa gateway.py + routes + syncer; `reserveShortCodes`/`ingestPreMintedOrder`/`buildShortCode` khớp giữa Orders.gs + Code.gs + test.
