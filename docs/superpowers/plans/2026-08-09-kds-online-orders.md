# Đơn online hiện lên KDS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn từ mitsu.cafe tự hiện lên bảng KDS kèm banner báo, giữ nguyên `order_id`/`short_code` do GAS cấp, và nhân viên có nút từ chối.

**Architecture:** GAS mở một action mailbox mới trả đơn online chưa vào KDS. `print_server` poll mailbox rồi **import** thẳng vào SQLite `OrderStore` (không mint ID mới), sau đó đẩy `CONFIRMED` lên GAS qua outbox — chính mốc `confirmed_at` đó làm dấu "đã vào KDS" nên đơn rớt khỏi mailbox. KDS đọc đơn online như mọi đơn khác qua `GET /orders`, chỉ thêm banner góc phải và nút Từ chối.

**Tech Stack:** Google Apps Script (V8), Python 3.14 + Flask, SQLite (WAL), vanilla JS.

**Spec:** [docs/superpowers/specs/2026-08-09-kds-online-orders-design.md](../specs/2026-08-09-kds-online-orders-design.md)

## Global Constraints

- `order_id` và `short_code` của đơn online **luôn** là giá trị GAS cấp. Không bao giờ gọi `GATEWAY.mint_order` trên đường online.
- Đơn online **không** ghi outbox `ingest_order` — đơn đã nằm trên Sheets.
- Trạng thái từ chối là `CANCELLED`, không phải `VOIDED`.
- Sheets ORDERS append-only: chỉ ghi thêm cột trạng thái, không xoá dòng.
- Không thêm cột mới vào ORDERS và không thêm cột mới vào bảng `orders` SQLite.
- Test Python: `cd print-server && python3 -m unittest <module> -v`
- Test JS: `cd web && node --test <file>.test.js`
- GAS không có test runner. Kiểm bằng curl smoke sau deploy (Task 8).
- Deploy GAS: `python3 ops/gas_push.py --deploy`. ⚠️ `gas_push.py` đụng prod HEAD kể cả khi không có `--deploy` — 18 cron chạy HEAD. Đẩy ngoài giờ cao điểm.
- `print_server.py` chạy code CŨ tới khi `launchctl kickstart -k`. `kds.html` thì serve live từ đĩa.

---

### Task 1: GAS — mailbox `pending_online_orders`

**Files:**
- Modify: `gas/Code.gs` (thêm `_rowToOnlineOrder` + `_getPendingOnlineOrders` cạnh `_getPendingLabelOrders` ở dòng ~926; thêm route vào **bảng POST** cạnh `'ingest_order'` ở dòng ~693)

**Interfaces:**
- Produces: POST action `pending_online_orders` → `{ ok: true, orders: [<online order>] }`, mỗi phần tử đúng shape trong Step 3.

⚠️ Route phải vào **bảng POST** (bảng có handler nhận `p`, quanh dòng 693), **không** phải bảng GET (handler nhận `e`, quanh dòng 262). `GATEWAY._post_to_gas` gửi POST — đặt nhầm bảng là action không tồn tại.

- [ ] **Step 1: Thêm `_rowToOnlineOrder` vào `gas/Code.gs`**

Đặt ngay dưới `_rowToOrderFull` (kết thúc quanh dòng 998).

```js
/**
 * Order object cho KDS inbox. KHÔNG tái dùng _rowToOrderFull: hàm đó mặc định
 * payment.status='PAID' khi ô trống — đúng cho receipt builder (chỉ chạy lúc
 * DELIVERED) nhưng sai chết người cho đơn online chưa thu tiền.
 */
function _rowToOnlineOrder(row) {
  return {
    order_id:         row[0],
    created_at:       row[2] ? new Date(row[2]).toISOString() : '',
    channel:          row[3] || '',
    table_id:         row[6] || '',
    customer_id:      row[8] || '',
    items:            row[9] ? JSON.parse(row[9]) : [],
    total:            Number(row[11]) || 0,
    payment_status:   row[19] || 'PENDING',
    label_printed_at: row[20] || '',
    notes:            row[23] || '',
    customer_name:    row[24] || '',
    short_code:       row[25] || '',
    delivery_type:    row[26] || 'pickup'
  };
}
```

- [ ] **Step 2: Thêm `_getPendingOnlineOrders` ngay dưới nó**

```js
/**
 * Đơn online chưa vào KDS: channel != 'staff', status NEW, confirmed_at rỗng,
 * tạo trong ngày hôm nay theo giờ ICT.
 *
 * Cutoff là NGÀY chứ không phải 4 giờ như _getPendingLabelOrders: khách đặt
 * 5:30 sáng mà 9:45 nhân viên mới mở KDS thì mốc 4 giờ làm mất đơn vĩnh viễn.
 */
function _getPendingOnlineOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS');
  if (!sheet) return [];
  var data = getLastRows(sheet, 300);
  var todayIct = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if (String(row[3]) === 'staff') continue;   // col D = channel
    if (String(row[12]) !== 'NEW') continue;    // col M = status
    if (row[13]) continue;                      // col N = confirmed_at
    var ts = row[2];                            // col C = timestamp
    if (!ts) continue;
    if (Utilities.formatDate(new Date(ts), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') !== todayIct) continue;
    result.push(_rowToOnlineOrder(row));
  }
  return result;
}
```

- [ ] **Step 3: Đăng ký route vào bảng POST**

Trong `gas/Code.gs`, ngay trước entry `'ingest_order'` (dòng ~693):

```js
  'pending_online_orders': {
    auth: AUTH.REPORT,
    handler: function(p) {
      return { ok: true, orders: _getPendingOnlineOrders() };
    }
  },
```

- [ ] **Step 4: Kiểm cú pháp**

Run: `cd /Users/dpd/Projects/lamha-kissaten && node --check gas/Code.gs`
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
git add gas/Code.gs
git commit -m "feat(gas): action pending_online_orders cho KDS inbox"
```

---

### Task 2: GAS — lưu lý do từ chối vào `notes`

**Files:**
- Modify: `gas/Code.gs` (handler POST `'update_status'`, dòng ~704)
- Modify: `gas/Orders.gs` (thêm `_appendRejectReasonToNotes` cuối file)

**Interfaces:**
- Consumes: không.
- Produces: POST `update_status` chấp nhận thêm field tuỳ chọn `reject_reason` ∈ `{"out_of_stock","after_hours","fake"}`.

- [ ] **Step 1: Thêm helper vào `gas/Orders.gs`**

Đặt cuối file.

```js
var REJECT_REASON_VI = {
  out_of_stock: 'hết món',
  after_hours:  'ngoài giờ',
  fake:         'đơn ảo'
};

/**
 * Nối lý do từ chối vào cột notes (index 23 → col 24). updateOrderStatus chỉ đổi
 * cột status, chủ quán mở Sheets sẽ thấy CANCELLED mà không biết vì sao.
 * Idempotent: gọi lại cùng lý do không nối thêm lần nữa (syncer có thể retry).
 */
function _appendRejectReasonToNotes(orderId, reason) {
  var row = _findOrderRow(orderId);
  if (!row) return;
  var tag = '[Từ chối: ' + (REJECT_REASON_VI[reason] || reason) + ']';
  var cur = String(row.data[23] || '');
  if (cur.indexOf(tag) !== -1) return;
  _ordersSheet().getRange(row.rowIndex, 24).setValue(cur ? cur + ' ' + tag : tag);
}
```

- [ ] **Step 2: Gọi nó trong handler POST `update_status`**

Thay thân handler POST `'update_status'` (dòng ~704, handler nhận `p` — **không** đụng bản GET ở dòng ~180):

```js
  'update_status': {
    auth: AUTH.REPORT,
    handler: function(p) {
      if (!p.order_id || !p.status) return { ok: false, error: 'missing params' };
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        updateOrderStatus(p.order_id, p.status);
        if (p.reject_reason) _appendRejectReasonToNotes(p.order_id, p.reject_reason);
        return { ok: true, order_id: p.order_id, status: p.status };
      } finally { lock.releaseLock(); }
    }
  },
```

- [ ] **Step 3: Kiểm cú pháp**

Run: `cd /Users/dpd/Projects/lamha-kissaten && node --check gas/Code.gs && node --check gas/Orders.gs`
Expected: không in gì (exit 0).

- [ ] **Step 4: Commit**

```bash
git add gas/Code.gs gas/Orders.gs
git commit -m "feat(gas): ghi lý do từ chối đơn vào cột notes"
```

---

### Task 3: `OrderStore.reject_order`

**Files:**
- Modify: `print-server/order_store.py` (thêm method ngay dưới `void_order`, dòng ~242)
- Test: `print-server/test_order_store.py`

**Interfaces:**
- Produces: `OrderStore.reject_order(order_id, reason, staff="kds") -> dict | None` — set `status='CANCELLED'`, `void_reason=reason`, `voided_by=staff`; trả dict đơn, `None` nếu không tìm thấy.

- [ ] **Step 1: Viết test trượt**

Thêm class mới vào cuối `print-server/test_order_store.py`. Dùng helper `_store()` và `_order()` đã có sẵn ở đầu file đó (các class khác trong file đặt store vào `self.s` — giữ đúng tên đó).

```python
class TestRejectOrder(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create(_order("ORD-20260809-4821", short_code="M07"))

    def test_reject_order_sets_cancelled_not_voided(self):
        o = self.s.reject_order("ORD-20260809-4821", "out_of_stock", "kds")
        self.assertEqual(o["status"], "CANCELLED")   # KHÔNG phải VOIDED
        self.assertEqual(o["void_reason"], "out_of_stock")
        self.assertEqual(o["voided_by"], "kds")

    def test_rejected_order_reaches_unsynced_finalized(self):
        # unsynced_finalized lọc `paid=1 OR status='CANCELLED'` — VOIDED sẽ rớt,
        # đơn từ chối kẹt local, đối soát cuối ngày lệch.
        self.s.reject_order("ORD-20260809-4821", "fake", "kds")
        ids = [o["order_id"] for o in self.s.unsynced_finalized()]
        self.assertIn("ORD-20260809-4821", ids)

    def test_reject_order_missing_returns_none(self):
        self.assertIsNone(self.s.reject_order("ORD-NOPE", "fake", "kds"))
```

Nếu chữ ký `_order()` trong file đó không nhận `short_code=`, gọi `_order("ORD-20260809-4821")` không tham số thứ hai.

- [ ] **Step 2: Chạy test cho chắc là trượt**

Run: `cd print-server && python3 -m unittest test_order_store -v`
Expected: FAIL — `AttributeError: 'OrderStore' object has no attribute 'reject_order'`

- [ ] **Step 3: Viết implementation**

Thêm vào `print-server/order_store.py` ngay dưới `void_order`:

```python
    def reject_order(self, order_id, reason, staff="kds"):
        """Từ chối đơn online. Dùng CANCELLED chứ KHÔNG dùng void_order():
        void_order set status='VOIDED', mà VOIDED nằm ngoài VALID_STATUS của GAS
        lẫn bộ lọc unsynced_finalized (paid=1 OR status='CANCELLED') — đơn sẽ kẹt
        lại local, không lên Sheets. Hai cột void_reason/voided_by thì tái dùng được."""
        return self._apply(order_id, "status='CANCELLED', void_reason=?, voided_by=?",
                           (reason, staff))
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `cd print-server && python3 -m unittest test_order_store -v`
Expected: OK, không test nào trượt.

- [ ] **Step 5: Commit**

```bash
git add print-server/order_store.py print-server/test_order_store.py
git commit -m "feat(store): reject_order dùng CANCELLED + giữ lý do"
```

---

### Task 4: `OnlineInbox` đổi vai — hộp chờ duyệt thành bộ nhập tự động

**Files:**
- Modify: `print-server/online_inbox.py` (viết lại toàn bộ)
- Test: `print-server/test_online_inbox.py` (viết lại toàn bộ)

**Interfaces:**
- Consumes: `OrderStore.get`, `OrderStore.upsert_create`, `OrderStore.apply_status` (có sẵn).
- Produces:
  - `class InboxActionError(Exception)` — GAS với tới được nhưng action lỗi.
  - `OnlineInbox(store, fetch_fn, on_import=None)`; `on_import` là callable nhận `order_id`, gọi đúng một lần cho mỗi đơn mới import.
  - `OnlineInbox.poll() -> {"online": bool, "inbox_error": str}`
  - `OnlineInbox.status() -> {"online": bool, "inbox_error": str}`
  - Bỏ hẳn `pending()`, `accept()`, và khoá `pending_count`.

- [ ] **Step 1: Viết lại `print-server/test_online_inbox.py` — test trượt**

Thay toàn bộ nội dung file:

```python
import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
from online_inbox import OnlineInbox, InboxActionError


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _order(oid="ORD-20260809-4821"):
    return {
        "order_id": oid, "short_code": "M07", "delivery_type": "pickup",
        "table_id": "", "customer_id": "0901234567", "customer_name": "Nguyễn Văn A",
        "items": [{"sku": "DR001", "name": "Cà phê sữa", "qty": 2, "price": 30000}],
        "total": 60000, "payment_status": "PENDING", "notes": "ít đường",
        "created_at": "2026-08-09T02:12:33.000Z", "label_printed_at": "",
    }


class TestOnlineInboxImport(unittest.TestCase):
    def test_import_keeps_gas_order_id_and_short_code(self):
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        o = store.get("ORD-20260809-4821")
        self.assertIsNotNone(o)
        self.assertEqual(o["short_code"], "M07")
        self.assertEqual(o["source"], "online")

    def test_import_sets_status_confirmed_locally(self):
        # upsert_create hardcode status="NEW"; thiếu apply_status thì GAS CONFIRMED
        # mà local NEW — hai bên lệch trạng thái.
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        self.assertEqual(store.get("ORD-20260809-4821")["status"], "CONFIRMED")

    def test_import_puts_customer_into_bill_meta(self):
        # bảng orders không có cột customer_id/customer_name — thẻ KDS đọc qua bill_meta.
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        bm = store.get("ORD-20260809-4821")["bill_meta"]
        self.assertEqual(bm["customer_id"], "0901234567")
        self.assertEqual(bm["customer_name"], "Nguyễn Văn A")

    def test_repoll_same_order_imports_once_and_calls_on_import_once(self):
        store = _store()
        seen = []
        inbox = OnlineInbox(store, fetch_fn=lambda: [_order()], on_import=seen.append)
        inbox.poll(); inbox.poll(); inbox.poll()
        self.assertEqual(seen, ["ORD-20260809-4821"])
        rows = store.list_orders()
        self.assertEqual(len([r for r in rows if r["order_id"] == "ORD-20260809-4821"]), 1)


class TestOnlineInboxSignals(unittest.TestCase):
    def test_transport_failure_flags_offline(self):
        def boom():
            raise ConnectionError("no internet")
        st = OnlineInbox(_store(), fetch_fn=boom).poll()
        self.assertFalse(st["online"])
        self.assertIn("no internet", st["inbox_error"])

    def test_action_failure_keeps_online_true(self):
        # _online nuôi badge cloud trên KDS. Action inbox hỏng mà badge nhảy
        # "Offline (local)" là báo động giả — GAS vẫn thu tiền bình thường.
        def boom():
            raise InboxActionError("unauthorized")
        st = OnlineInbox(_store(), fetch_fn=boom).poll()
        self.assertTrue(st["online"])
        self.assertIn("unauthorized", st["inbox_error"])

    def test_success_clears_previous_error(self):
        feed = {"fail": True}

        def fetch():
            if feed["fail"]:
                raise InboxActionError("unauthorized")
            return []
        inbox = OnlineInbox(_store(), fetch_fn=fetch)
        inbox.poll()
        feed["fail"] = False
        st = inbox.poll()
        self.assertTrue(st["online"])
        self.assertEqual(st["inbox_error"], "")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test cho chắc là trượt**

Run: `cd print-server && python3 -m unittest test_online_inbox -v`
Expected: FAIL — `ImportError: cannot import name 'InboxActionError' from 'online_inbox'`

- [ ] **Step 3: Viết lại `print-server/online_inbox.py`**

Thay toàn bộ nội dung file:

```python
"""online_inbox.py — kéo đơn mitsu.cafe từ GAS mailbox và NHẬP THẲNG vào
OrderStore. Không còn hộp chờ duyệt: đơn tự lên KDS, nhân viên chặn bằng nút
Từ chối (mô hình "đơn tự chạy, chặn là ngoại lệ" — tem đã in trước khi có ai
bấm gì nên "chờ duyệt" là trạng thái giả).

Giữ nguyên order_id + short_code do GAS cấp: tem trong tay khách mang mã đó,
mint mã mới là màn bếp một mã, tem một mã, và doanh thu bị nhân đôi.

Dedupe hai lớp: store.get() ở đây, và confirmed_at bên GAS làm đơn rớt khỏi
mailbox. Đứt đường nào cũng không nhân đôi.
"""
import logging
import threading

log = logging.getLogger("online-inbox")


class InboxActionError(Exception):
    """GAS với tới được nhưng action hỏng (sai token, thiếu action, lỗi handler).

    Tách khỏi lỗi transport vì cờ `online` còn nuôi badge cloud trên KDS: gộp
    hai loại lỗi là nhân viên thấy "Offline (local)" trong khi GAS vẫn sống.
    """


class OnlineInbox:
    def __init__(self, store, fetch_fn, on_import=None):
        self.store = store
        self.fetch_fn = fetch_fn
        self.on_import = on_import      # callback(order_id) — đẩy CONFIRMED lên GAS
        self._online = False
        self._error = ""
        self._lock = threading.Lock()

    def poll(self):
        try:
            payloads = self.fetch_fn() or []
        except InboxActionError as exc:
            log.error("inbox action failed (GAS reachable): %s", exc)
            self._set(online=True, error=str(exc))
            return self.status()
        except Exception as exc:
            log.error("inbox fetch failed (transport): %s", exc)
            self._set(online=False, error=str(exc))
            return self.status()

        self._set(online=True, error="")
        for p in payloads:
            try:
                self._import_one(p)
            except Exception as exc:
                log.error("inbox import failed for %s: %s", p.get("order_id"), exc)
        return self.status()

    def _import_one(self, p):
        """Trả True nếu vừa nhập mới. Phải hỏi store.get() TRƯỚC: upsert_create
        luôn trả self.get(oid), không phân biệt vừa chèn hay đã có sẵn — không
        kiểm trước thì mỗi vòng poll đẻ thêm một op CONFIRMED thừa trong outbox."""
        oid = p.get("order_id")
        if not oid or self.store.get(oid):
            return False
        self.store.upsert_create({
            "order_id": oid,
            "short_code": p.get("short_code", ""),
            "delivery_type": p.get("delivery_type", "pickup"),
            "table_id": p.get("table_id", ""),
            "source": "online",
            "items": p.get("items", []),
            "customer_note": p.get("notes", ""),
            "total": p.get("total"),
            "bill_meta": {
                "customer_name":    p.get("customer_name", ""),
                "customer_id":      p.get("customer_id", ""),
                "created_at":       p.get("created_at", ""),
                "label_printed_at": p.get("label_printed_at", ""),
                "payment_status":   p.get("payment_status", "PENDING"),
            },
        })
        self.store.apply_status(oid, "CONFIRMED")
        if self.on_import:
            self.on_import(oid)
        return True

    def _set(self, online, error):
        with self._lock:
            self._online = online
            self._error = error

    def status(self):
        with self._lock:
            return {"online": self._online, "inbox_error": self._error}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `cd print-server && python3 -m unittest test_online_inbox -v`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add print-server/online_inbox.py print-server/test_online_inbox.py
git commit -m "feat(inbox): import đơn online thẳng vào OrderStore, giữ ID GAS"
```

---

### Task 5: `print_server` — nối dây, gỡ route cũ, bật cờ

**Files:**
- Modify: `print-server/print_server.py` (khối `_gas_fetch_online` + `INBOX` + routes dòng ~429-474; `_poll_loop` dòng ~2260-2271; thêm route reject cạnh `/order/<order_id>/void` dòng ~1180)
- Test: `print-server/test_routes_orderstore.py`

**Interfaces:**
- Consumes: `InboxActionError`, `OnlineInbox(store, fetch_fn, on_import)` từ Task 4; `STORE.reject_order` từ Task 3.
- Produces:
  - `POST /order/<order_id>/reject` body `{"reason": "out_of_stock"|"after_hours"|"fake", "staff": "..."}` → `{"ok": true, "order": {...}}`; `400 bad_reason`; `404 not found`.
  - `GET /cloud/status` → `{"ok": true, "online": bool, "inbox_error": str}`
  - Gỡ `GET /inbox` và `POST /inbox/<id>/accept`.

- [ ] **Step 1: Viết test trượt**

Trong `print-server/test_routes_orderstore.py`, **thay toàn bộ class `TestInboxRoutes`** (dòng ~232-257, gồm cả helper `STORE_source_of` ngay dưới nó) bằng class dưới đây. Class cũ đụng `print_server.INBOX._pending` trong `setUp` — thuộc tính đó biến mất ở Task 4, để nguyên là mọi test trong class crash.

Cũng sửa dòng 28 trong `RouteTestBase.setUp` nếu cần: `OnlineInbox(print_server.STORE, fetch_fn=lambda: [])` vẫn hợp lệ với chữ ký mới (`on_import` mặc định `None`) — không phải đổi.

```python
class TestOnlineOrderRoutes(RouteTestBase):
    def _seed_online(self, oid="ORD-9", short_code="M09"):
        print_server.STORE.upsert_create({
            "order_id": oid, "short_code": short_code, "source": "online",
            "delivery_type": "pickup",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            "bill_meta": {"customer_name": "Anh A", "customer_id": "0901234567"},
        })

    def test_reject_online_order_cancels_and_queues_gas(self):
        self._seed_online()
        r = self.c.post("/order/ORD-9/reject", json={"reason": "out_of_stock"})
        d = r.get_json()
        self.assertTrue(d["ok"])
        self.assertEqual(d["order"]["status"], "CANCELLED")
        self.assertEqual(d["order"]["void_reason"], "out_of_stock")
        ops = print_server.GATEWAY.unsynced()
        self.assertTrue(any(json.loads(o["payload"]).get("reject_reason") == "out_of_stock"
                            for o in ops))

    def test_reject_rejects_unknown_reason(self):
        self._seed_online("ORD-10", "M10")
        r = self.c.post("/order/ORD-10/reject", json={"reason": "vì tôi thích"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(print_server.STORE.get("ORD-10")["status"], "NEW")

    def test_reject_missing_order_404(self):
        r = self.c.post("/order/ORD-NOPE/reject", json={"reason": "fake"})
        self.assertEqual(r.status_code, 404)

    def test_inbox_routes_are_gone(self):
        self.assertEqual(self.c.get("/inbox").status_code, 404)
        self.assertEqual(self.c.post("/inbox/OL1/accept", json={}).status_code, 404)

    def test_cloud_status_exposes_inbox_error(self):
        d = self.c.get("/cloud/status").get_json()
        self.assertTrue(d["ok"])
        self.assertIn("online", d)
        self.assertIn("inbox_error", d)

    def test_mark_paid_on_imported_order_still_builds_receipt(self):
        # Đơn online KHÔNG có outbox ingest_order (đơn đã nằm trên Sheets), nên
        # get_create_payload trả None. mark_paid phải rơi xuống fallback p["order"]
        # mà KDS gửi kèm — hỏng chỗ này là thu tiền xong không có bill.
        self._seed_online("ORD-11", "M11")
        self.assertIsNone(print_server.GATEWAY.get_create_payload("ORD-11"))
        o = print_server.STORE.get("ORD-11")
        r = self.c.post("/order/mark_paid", json={
            "order_id": "ORD-11",
            "order": {"order_id": "ORD-11", "items": o["items"],
                      "metadata": {"short_code": "M11"},
                      "payment": {"method": "cash"}},
        })
        d = r.get_json()
        self.assertTrue(d["ok"])
        self.assertEqual(print_server.STORE.get("ORD-11")["paid"], 1)
```

Nếu file chưa `import json`, thêm vào đầu file.

`test_mark_paid_on_imported_order_still_builds_receipt` chạy dưới `PRINT_ENGINE` mặc định của test — không đụng máy in thật. Nếu môi trường test không set `PRINT_ENGINE`, thêm `os.environ["PRINT_ENGINE"] = "noop"` vào đầu file như các test khác trong repo đang làm.

- [ ] **Step 2: Chạy test cho chắc là trượt**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: FAIL — `/order/ORD-9/reject` trả 404 (route chưa có), và `test_inbox_routes_are_gone` trả 200.

- [ ] **Step 3: Thay khối inbox trong `print_server.py`**

Thay toàn bộ đoạn từ `from online_inbox import OnlineInbox` tới hết route `/cloud/status` (dòng ~430-474):

```python
from online_inbox import OnlineInbox, InboxActionError


def _gas_fetch_online():
    """Kéo đơn online từ GAS mailbox.

    _post_to_gas KHÔNG raise khi GAS trả ok:false — nó trả nguyên dict. Phải tự
    kiểm, và raise InboxActionError để phân biệt với lỗi transport: cờ `online`
    còn nuôi badge cloud trên KDS, gộp hai loại là báo động giả mất mạng."""
    d = GATEWAY._post_to_gas({"action": "pending_online_orders"})
    if not isinstance(d, dict) or not d.get("ok"):
        raise InboxActionError(str((d or {}).get("error", "malformed response")))
    return d.get("orders", [])


def _confirm_on_gas(order_id):
    """Đẩy NEW→CONFIRMED lên GAS. confirmed_at chính là dấu 'đã vào KDS' —
    có nó thì đơn rớt khỏi mailbox. Local-first: chỉ ghi outbox, syncer đẩy sau."""
    GATEWAY.enqueue("status", order_id, f"{order_id}:CONFIRMED",
                    {"action": "update_status", "order_id": order_id, "status": "CONFIRMED"})


INBOX = OnlineInbox(STORE,
                    fetch_fn=(lambda: []) if os.getenv("PRINT_ENGINE") == "noop"
                    else _gas_fetch_online,
                    on_import=_confirm_on_gas)


@app.get("/cloud/status")
def cloud_status():
    return jsonify({"ok": True, **INBOX.status()}), 200
```

Hai route `/inbox` và `/inbox/<online_order_id>/accept` bị xoá cùng đoạn này — banner KDS đọc đơn online từ `GET /orders` như mọi đơn khác, không cần API riêng.

- [ ] **Step 4: Thêm route reject**

Trong `print_server.py`, ngay dưới route `/order/<order_id>/void` (kết thúc dòng ~1189):

```python
_REJECT_REASONS = ("out_of_stock", "after_hours", "fake")


@app.post("/order/<order_id>/reject")
def order_reject(order_id):
    """Từ chối đơn online. Không cần PIN quản lý như /void: đơn chưa thu tiền
    (web order gửi payment.status=PENDING, khách trả tại quán) nên từ chối không
    đụng tiền — bắt PIN chỉ làm chậm lúc quán đông."""
    p = request.get_json(force=True, silent=True) or {}
    reason = str(p.get("reason") or "")
    if reason not in _REJECT_REASONS:
        return jsonify({"ok": False, "error": "bad_reason"}), 400
    o = STORE.reject_order(order_id, reason, p.get("staff", "kds"))
    if o is None:
        return jsonify({"ok": False, "error": "not found"}), 404
    GATEWAY.enqueue("status", order_id, f"{order_id}:CANCELLED",
                    {"action": "update_status", "order_id": order_id,
                     "status": "CANCELLED", "reject_reason": reason})
    return jsonify({"ok": True, "order": o}), 200
```

- [ ] **Step 5: Bật `ONLINE_POLL` mặc định**

Trong `_poll_loop` (dòng ~2260), thay khối comment + điều kiện:

```python
    def _poll_loop():
        while True:
            try:
                # Mặc định BẬT: action pending_online_orders deploy cùng đợt này.
                # Đặt mặc định trong code để `git pull` + kickstart là chạy, không
                # phụ thuộc ai đó nhớ sửa plist LaunchAgent bằng tay.
                if os.getenv("ONLINE_POLL", "1") == "1":
                    INBOX.poll()
            except Exception as e:
                log.error("inbox poll error: %s", e)
            time.sleep(int(os.getenv("ONLINE_POLL_SEC", "15")))
```

- [ ] **Step 6: Chạy test cho chắc là xanh**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: OK.

- [ ] **Step 7: Chạy toàn bộ test Python để bắt hồi quy**

Run: `cd print-server && python3 -m unittest discover -p "test_*.py" 2>&1 | tail -20`
Expected: OK. Nếu có test cũ gọi `/inbox` hoặc `INBOX.pending()`/`INBOX.accept()`, xoá test đó — chức năng đã bị gỡ có chủ ý.

- [ ] **Step 8: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(server): import đơn online tự động, route từ chối, bỏ inbox chờ duyệt"
```

---

### Task 6: KDS — đọc SĐT khách từ `bill_meta`

**Files:**
- Modify: `web/kds.html` (thẻ đơn, dòng ~2007)

**Interfaces:**
- Produces: helper `onlineField(o, key)` dùng lại ở Task 7.

Tách khỏi Task 7 vì đây là sửa hồi quy độc lập: thẻ đơn hiện SĐT đúng, kiểm được ngay, không phụ thuộc banner.

- [ ] **Step 1: Thêm helper**

Trong `web/kds.html`, đặt ngay trên hàm render thẻ đơn (trước dòng ~1973):

```javascript
// Bảng orders trong SQLite không có cột customer_id/customer_name — chúng nằm
// trong bill_meta. GET /orders trả nguyên _row_to_dict, không qua mapper nào.
function onlineField(o, key) {
  return (o && o[key]) || (o && o.bill_meta && o.bill_meta[key]) || '';
}
```

- [ ] **Step 2: Dùng helper trong thẻ đơn**

Thay dòng ~2007:

```javascript
            ${onlineField(o,'customer_name') ? esc(onlineField(o,'customer_name'))+' · ' : ''}${esc(onlineField(o,'customer_id')) || 'Khách vãng lai'}<br>
```

- [ ] **Step 3: Kiểm cú pháp**

Run: `cd /Users/dpd/Projects/lamha-kissaten/web && node -e "const h=require('fs').readFileSync('kds.html','utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('syntax ok')"`
Expected: `syntax ok`

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "fix(kds): thẻ đơn đọc tên + SĐT khách từ bill_meta"
```

---

### Task 7: KDS — banner góc phải + nút Từ chối + In lại tem

**Files:**
- Modify: `web/order-api.js` (dòng 37-39)
- Modify: `web/kds.html` (gỡ khối inbox dòng ~1095-1199 và nút `#inbox-btn` dòng ~502; thêm banner + CSS; móc vào `loadOrders` dòng ~2224)

**Interfaces:**
- Consumes: `POST /order/<id>/reject` (Task 5), `POST /enqueue/labels` (có sẵn, [print_server.py:584](../../../print-server/print_server.py)), `onlineField` (Task 6).
- Produces: `api().rejectOrder(id, reason)`, `api().reprintLabels(order)`.

- [ ] **Step 1: Sửa `web/order-api.js`**

Thay hai dòng 38-39:

```javascript
    rejectOrder: (id, reason) => call('/order/' + encodeURIComponent(id) + '/reject', 'POST', { reason }),
    reprintLabels: (order) => call('/enqueue/labels', 'POST', order),
```

Xoá dòng `inbox:` và `acceptOnline:`.

- [ ] **Step 2: Gỡ khối inbox cũ trong `kds.html`**

Xoá: nút `#inbox-btn` (dòng ~502), và cả khối từ `// ─── ONLINE INBOX` tới hết `acceptOnlineOrder` (dòng ~1095-1199), giữ lại `__inboxSeen` đổi tên thành `__onlineSeen` cho banner mới.

- [ ] **Step 3: Thêm CSS banner**

Đặt cạnh `@keyframes agePulse` (dòng ~135):

```css
    #online-banners { position: fixed; top: 74px; right: 14px; z-index: 900;
                      display: flex; flex-direction: column; gap: 10px; width: 400px; max-width: 92vw; }
    .online-banner  { background: var(--accent); color: #fff; border: 3px solid #fff;
                      border-radius: 14px; padding: 14px 16px; box-shadow: 0 8px 28px rgba(0,0,0,.45);
                      animation: agePulse 1.1s ease-in-out infinite; }
    .online-banner .ob-title { font-size: 1.4rem; font-weight: 800; letter-spacing: .5px; }
    .online-banner .ob-code  { font-size: 2.1rem; font-weight: 900; line-height: 1.1; }
    .online-banner .ob-line  { font-size: .95rem; margin-top: 4px; }
    .online-banner .ob-warn  { background: #B71C1C; border-radius: 8px; padding: 4px 8px;
                               font-weight: 800; margin-top: 8px; display: inline-block; }
    .online-banner button    { margin-top: 10px; width: 100%; padding: 10px; font-size: 1rem;
                               font-weight: 700; border: none; border-radius: 10px; cursor: pointer; }
    .online-banner .ob-seen  { background: #fff; color: #111; }
    .online-banner .ob-print { background: #FFC107; color: #111; margin-top: 6px; }
    .online-banner .ob-more  { text-align: center; font-weight: 700; padding: 8px; }
```

- [ ] **Step 4: Thêm logic banner**

Đặt vào chỗ khối inbox cũ vừa xoá:

```javascript
// ─── BANNER ĐƠN ONLINE ────────────────────────────────────────────────────────
// Đơn online tự vào bảng (print_server import từ GAS mailbox). Banner chỉ để
// nhân viên đang đứng máy pha nhìn thấy — KHÔNG tự tắt như toast 3 giây.
let __onlineSeen = new Set();
let __onlineBanners = [];
const ONLINE_FRESH_MS = 5 * 60 * 1000;

function scanOnlineOrders(orders, isFirstLoad) {
  const fresh = [];
  for (const o of orders) {
    if (o.source !== 'online') continue;
    if (__onlineSeen.has(o.order_id)) continue;
    __onlineSeen.add(o.order_id);
    if (['CANCELLED', 'VOIDED', 'DELIVERED'].includes(o.status)) continue;
    // Lần load đầu (F5, hoặc mở KDS ở màn thứ hai): mọi đơn trong ngày đều "chưa
    // thấy" → không chặn là banner đổ hàng loạt + chuông kêu dồn. Chỉ nhận đơn
    // vừa vào trong 5 phút, để đơn đến đúng lúc reload không bị nuốt mất.
    const createdAt = onlineField(o, 'created_at') || o.created_at;
    const age = createdAt ? (Date.now() - new Date(createdAt).getTime()) : 0;
    if (isFirstLoad && age > ONLINE_FRESH_MS) continue;
    fresh.push(o);
  }
  if (!fresh.length) return;
  __onlineBanners = [...__onlineBanners, ...fresh];
  renderOnlineBanners();
  if (!isFirstLoad) {
    const late = fresh.some(o => {
      const c = onlineField(o, 'created_at') || o.created_at;
      return c && checkout.isLate(c, new Date().toISOString());
    });
    if (late) playLateOrderChime(); else playNewOrderChime();
  }
}

function renderOnlineBanners() {
  let host = document.getElementById('online-banners');
  if (!host) {
    host = document.createElement('div');
    host.id = 'online-banners';
    document.body.appendChild(host);
  }
  const show = __onlineBanners.slice(0, 3);
  const extra = __onlineBanners.length - show.length;
  host.innerHTML = show.map(o => {
    const noLabel = !onlineField(o, 'label_printed_at');
    return `
      <div class="online-banner">
        <div class="ob-title">🛵 ĐƠN ONLINE MỚI</div>
        <div class="ob-code">${esc(o.short_code) || '—'}</div>
        <div class="ob-line">${esc(onlineField(o,'customer_name')) || 'Khách online'} · ${esc(onlineField(o,'customer_id')) || 'không có SĐT'}</div>
        <div class="ob-line">${esc(formatItemsSummary(o.items || []))}</div>
        <div class="ob-line"><strong>${fmt(o.total || 0)}</strong></div>
        ${noLabel ? '<div class="ob-warn">⚠️ CHƯA IN TEM</div>' : ''}
        <button class="ob-seen" onclick="dismissOnlineBanner('${esc(o.order_id)}')">Đã thấy</button>
        ${noLabel ? `<button class="ob-print" onclick="reprintOnlineLabel('${esc(o.order_id)}', this)">🖨️ In tem</button>` : ''}
      </div>`;
  }).join('') + (extra > 0
    ? `<div class="online-banner ob-more">+${extra} đơn nữa</div>` : '');
}

function dismissOnlineBanner(orderId) {
  __onlineBanners = __onlineBanners.filter(o => o.order_id !== orderId);
  renderOnlineBanners();
}

async function reprintOnlineLabel(orderId, btn) {
  const o = allOrders.find(x => x.order_id === orderId);
  if (!o) return;
  btn.disabled = true; btn.textContent = 'Đang in...';
  try {
    const r = await api().reprintLabels({
      order_id: o.order_id, items: o.items || [],
      metadata: { short_code: o.short_code, delivery_type: o.delivery_type },
    });
    btn.textContent = (r.status === 200 && r.body && r.body.ok) ? '✅ Đã gửi máy in' : '❌ Lỗi — bấm lại';
    if (!(r.status === 200 && r.body && r.body.ok)) btn.disabled = false;
  } catch (_) {
    btn.textContent = '❌ Lỗi — bấm lại'; btn.disabled = false;
  }
}

async function rejectOnlineOrder(orderId) {
  const map = { '1': 'out_of_stock', '2': 'after_hours', '3': 'fake' };
  const pick = prompt('Lý do từ chối đơn ' + orderId + ':\n1 = Hết món\n2 = Ngoài giờ\n3 = Đơn ảo');
  const reason = map[String(pick || '').trim()];
  if (!reason) return;
  try {
    const r = await api().rejectOrder(orderId, reason);
    if (r.status === 200 && r.body && r.body.ok) {
      dismissOnlineBanner(orderId);
      const o = allOrders.find(x => x.order_id === orderId);
      if (o) o.status = 'CANCELLED';
      setLocalOverride(orderId, { status: 'CANCELLED' });
      renderOrders();
      toast('Đã từ chối đơn ' + orderId);
    } else {
      alert('Không từ chối được: ' + ((r.body && r.body.error) || 'mất kết nối'));
    }
  } catch (err) {
    alert('Không từ chối được: ' + ((err && err.message) || 'mất kết nối'));
  }
}
```

Hàm dùng lại từ `kds.html` sẵn có: `fmt(n)` (dòng 972, định dạng tiền), `formatItemsSummary` (dòng 801), `setLocalOverride` (dòng 2203), `toast` (dòng 2414), `checkout.isLate`, `playNewOrderChime`, `playLateOrderChime`, `esc`. Không viết lại hàm nào trong số này.

- [ ] **Step 5: Móc vào `loadOrders`**

Trong `loadOrders()`, ngay sau dòng `firstLoad = false;` (dòng ~2230), chèn:

```javascript
  scanOnlineOrders(data.orders, wasFirstLoad);
```

và ngay trên `const fresh = data.orders.filter(...)` (dòng ~2224) chèn:

```javascript
  const wasFirstLoad = firstLoad;
```

- [ ] **Step 6: Thêm nút Từ chối vào thẻ đơn**

Trong hàm dựng nút hành động của thẻ đơn (cạnh nút `💳 Đã thanh toán`, dòng ~1990), thêm:

```javascript
        ${o.source === 'online' && o.payment_status !== 'PAID' && !['CANCELLED','VOIDED','DELIVERED'].includes(o.status)
          ? `<button class="btn-mark-paid" style="background:#B71C1C;color:#fff;flex:0 0 auto;" onclick="rejectOnlineOrder('${esc(o.order_id)}')">✕ Từ chối</button>` : ''}
```

- [ ] **Step 7: Kiểm cú pháp**

Run: `cd /Users/dpd/Projects/lamha-kissaten/web && node -e "const h=require('fs').readFileSync('kds.html','utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('syntax ok')"`
Expected: `syntax ok`

- [ ] **Step 8: Chạy test JS hiện có để bắt hồi quy**

Run: `cd /Users/dpd/Projects/lamha-kissaten/web && node --test checkout.test.js order-api.test.js`
Expected: `# fail 0`. Nếu `order-api.test.js` có test cho `inbox`/`acceptOnline`, xoá — endpoint đã bị gỡ có chủ ý.

- [ ] **Step 9: Commit**

```bash
git add web/kds.html web/order-api.js
git commit -m "feat(kds): banner đơn online góc phải + nút Từ chối + in lại tem"
```

---

### Task 8: Deploy + nghiệm thu thật

**Files:** không sửa code. Chỉ chạy và xác nhận.

⚠️ Bước 2 khởi động lại print server đang phục vụ quán. Làm ngoài giờ cao điểm.

- [ ] **Step 1: Deploy GAS TRƯỚC**

Phải đi trước restart server: `ONLINE_POLL` giờ mặc định bật, server mới mà GAS chưa có action là log đỏ mỗi 15 giây.

Run: `cd /Users/dpd/Projects/lamha-kissaten && python3 ops/gas_push.py --deploy`
Expected: in ra version mới + deployment đã retarget.

- [ ] **Step 2: Smoke test action GAS**

Lấy token thật từ LaunchAgent đã cài (đừng dùng giá trị placeholder trong repo):

```bash
TOKEN=$(plutil -extract EnvironmentVariables.REPORT_API_TOKEN raw ~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist) && \
URL=$(plutil -extract EnvironmentVariables.GAS_WEBAPP_URL raw ~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist) && \
curl -sL -X POST "$URL" -H 'Content-Type: application/json' -d "{\"action\":\"pending_online_orders\",\"token\":\"$TOKEN\"}"
```

Expected: `{"ok":true,"orders":[...]}`. Nếu `ok:false` thì dừng — đừng restart server.

- [ ] **Step 3: Restart print server**

Run: `launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver`
Expected: không lỗi. `print_server.py` chạy code CŨ tới khi kickstart.

- [ ] **Step 4: Xác nhận poll đã sống**

Run: `sleep 20 && curl -s http://127.0.0.1:5001/cloud/status`
Expected: `{"ok":true,"online":true,"inbox_error":""}`

`online:true` là bằng chứng poll chạy thật — trước khi sửa nó kẹt `false` vĩnh viễn nên badge cloud trên KDS luôn hiện `🟡 Offline (local)`.

- [ ] **Step 5: Xác nhận badge trên KDS**

Mở KDS, nhìn badge cloud.
Expected: `🟢 Online`.

- [ ] **Step 6: Đặt một đơn thật trên mitsu.cafe**

Xác nhận đủ 5 điều:
1. Tem in ra.
2. Banner đơn online hiện góc phải, không tự tắt.
3. `short_code` trên banner **khớp** mã trên tem.
4. Thẻ đơn trên bảng hiện đúng tên + SĐT khách.
5. Trên Google Sheets, đơn đó có `confirmed_at` và `status=CONFIRMED`.

- [ ] **Step 7: Thử từ chối một đơn test**

Bấm `✕ Từ chối` → chọn `1` (Hết món). Xác nhận:
1. Thẻ biến khỏi bảng.
2. Sau ~10 giây, trên Sheets đơn đó `status=CANCELLED` và cột `notes` có `[Từ chối: hết món]`.

- [ ] **Step 8: Xác nhận F5 không dội banner**

Trong lúc bảng đang có đơn online cũ hơn 5 phút, bấm F5 trang KDS.
Expected: không chuông, không banner.

- [ ] **Step 9: Commit ghi chú vận hành nếu có phát sinh**

Nếu bước nào lệch so với plan, ghi lại vào spec rồi commit. Không lệch thì bỏ qua bước này.

---

## Ghi chú cho người thực thi

**Vì sao không mint ID mới.** Tem in tự động lúc đơn ở trạng thái NEW, trước khi bất kỳ ai bấm gì, và mang `short_code` GAS cấp. Mint mã local mới là tem trong tay khách một mã, màn bếp một mã — và đơn bị đếm hai lần vào doanh thu lẫn tem loyalty. Đây là lỗi có sẵn trong `POST /inbox/<id>/accept` mà Task 5 gỡ đi.

**Vì sao mã GAS không đụng mã đơn tại quán.** `buildShortCode()` bên GAS và block mã mà gateway local xin qua `reserve_codes` cùng ăn watermark `sc_wm_<date>_<letter>` trong ScriptProperties. Một nguồn số duy nhất.

**Vì sao đơn từ chối phải là CANCELLED.** `unsynced_finalized` lọc `paid=1 OR status='CANCELLED'`. Dùng `VOIDED` là đơn kẹt local, không lên Sheets, đối soát cuối ngày lệch.
