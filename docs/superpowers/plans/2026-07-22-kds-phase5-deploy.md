# KDS Việc 1 (Deploy GAS) + Việc 2 (Phase 5 UX + Receipt Online) — Implementation Plan

> **For Antigravity (implementer) + Grok (đồng kiểm):** Thực hiện TỪNG task theo thứ tự. Mỗi task: làm → test → **Grok review diff** → sửa theo Grok → commit. KHÔNG gộp task, KHÔNG bỏ bước Grok. Checkbox `- [ ]` để track.

**Goal:** (1) Deploy GAS để POST auth + các route mới live (đơn ra mã Q thật, sync Sheets). (2) Rút thao tác barista: 1 nút [Xong] cho dine_in, 2 nút cho pickup, toggle "pha" ẩn; và receipt in local tức thì lúc [Xong] (cả online).

**Base:** nhánh `launch-hardening`, HEAD ≥ `620f9ef`. Repo: `/Users/dpd/Projects/lamha-kissaten`.

**Tech:** GAS (.gs) · Python Flask (`print-server/`) · vanilla JS (`web/kds.html`) · deploy `python3 ops/gas_push.py --deploy`.

## Global Constraints (áp cho MỌI task — copy verbatim)

- GAS = event bus · Google Sheets = database · ORDERS **append-only**, KHÔNG ghi đè `order_id`.
- Tiền + tem + financials cấp ở `markOrderPaid` (Orders.gs), idempotent guard `payment_status=PAID`. Nút [Xong] KHÔNG được cấp đôi tem/thu đôi tiền.
- `VALID_TRANSITIONS` đã cho `CONFIRMED→DELIVERED` (commit trước). KHÔNG mở transition khác.
- Double-receipt: khi gateway in receipt local, phải gửi GAS `receipt_printed_local=true` để `markOrderPaid(opts.skipReceipt)` KHÔNG in lần 2. (Cơ chế đã có sẵn — dùng đúng.)
- Token: query HOẶC body (đã fix `_authorize`). KHÔNG hardcode token vào source.
- `LOCAL_FIRST` chỉ bật khi `location.protocol==='http:'` (đã có). KDS phục vụ same-origin từ gateway `:5001`.
- Delivery (đơn remote) GIỮ flow cũ từng bước — KHÔNG đụng.
- Deploy prod: `ops/gas_push.py --deploy` retarget `/exec` (không `--deploy` thì `/exec` chạy version cũ, POST route mới KHÔNG live — xem memory project_gas_deploy_head_vs_version).

## File Structure

- Modify `web/kds.html` — tách helper gateway (gwMarkPaid/gwStatus), `actionButtons()`, `finishOrder`/`setReady`/`setMaking`, wire vào `renderOrders`.
- Modify `print-server/print_server.py` — `/order/mark_paid` in receipt local luôn (online+offline).
- Modify `print-server/gateway.py` — thêm `get_create_payload(order_id)` lấy items từ outbox.
- Modify `print-server/test_gateway.py` — test `get_create_payload`.
- Không đụng GAS code trong việc 2 (đã fix xong); việc 1 chỉ deploy + verify.

---

## TASK 0 (VIỆC 1) — Deploy GAS + verify E2E cloud

**Mục tiêu:** POST auth + reserve_codes/ingest_order/mark_paid/update_status live trên `/exec`; đơn mới ra mã **Q** (không QX) + sync Sheets.

- [ ] **Step 1: Đồng bộ nhánh**
Run: `cd /Users/dpd/Projects/lamha-kissaten && git checkout launch-hardening && git pull --ff-only && git rev-parse --short HEAD`
Expected: HEAD ≥ `620f9ef` (chứa fix SSL + `_authorize` query/body + POST routes update_status/mark_paid + markOrderPaid skipReceipt + ingest re-mint).

- [ ] **Step 2: Deploy GAS retarget /exec**
Run: `python3 ops/gas_push.py --deploy`
Expected: log báo tạo version mới + retarget deployment thành công, không lỗi.

- [ ] **Step 3: Verify POST auth (reserve_codes) qua urllib thật (không curl -L — redirect làm mất body)**
Run:
```bash
cd /Users/dpd/Projects/lamha-kissaten/print-server && python3 - <<'PY'
import json, urllib.request
from gateway import _ssl_ctx
GURL="https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
TOK=json.load(open('../.claude/.dispatcher-auth.json'))['report_api_token']
for act,extra in [("reserve_codes",{"type":"dine_in","n":3}),
                  ("mark_paid",{"order_id":"ORD-NONEXISTENT"})]:
    body=json.dumps({"action":act,"token":TOK,**extra}).encode()
    req=urllib.request.Request(GURL,data=body,headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=20,context=_ssl_ctx()) as r:
        print(act, r.read().decode()[:150])
PY
```
Expected: `reserve_codes` trả `{"ok":true,"letter":"Q","from":...}` (KHÔNG `unauthorized`). `mark_paid` trả `{"ok":false,"error":"Order not found..."}` (đã qua auth, chỉ lỗi vì order giả — chứng tỏ POST auth OK).
**Nếu vẫn `unauthorized`** → deploy chưa retarget `/exec`; lặp lại Step 2 (đảm bảo `--deploy`), rồi Step 3.

- [ ] **Step 4: Restart print_server (nạp code mới) + reset emergency band**
Run:
```bash
cd /Users/dpd/Projects/lamha-kissaten
python3 -c "import sqlite3; c=sqlite3.connect('print-server/outbox.db'); c.execute('DELETE FROM code_blocks WHERE emergency=1'); c.commit(); print('emergency band reset')"
launchctl kickstart -k "gui/$(id -u)/com.lamha.kissaten.printserver"
sleep 4 && curl -s http://127.0.0.1:5001/health | head -c 120
```
Expected: health JSON, 2 máy in `online:true`.

- [ ] **Step 5: E2E create — đơn phải ra mã Q (không QX) + sync Sheets**
Run:
```bash
cd /Users/dpd/Projects/lamha-kissaten
IDEM="verify-$(date +%s)"
curl -s -w "\nTIME %{time_total}s\n" -X POST http://127.0.0.1:5001/order -H 'Content-Type: application/json' \
 -d '{"channel":"kds","customer_name":"TEST-DEPLOY","staff_id":"S001","items":[{"sku":"DR001","name":"CF test","qty":1,"price":30000,"modifiers":{}}],"total":30000,"payment":{"method":"cash"},"metadata":{"delivery_type":"dine_in","notes":"verify - huy sau","idempotency_key":"'$IDEM'"}}'
sleep 6
python3 -c "
import sqlite3; c=sqlite3.connect('print-server/outbox.db'); c.row_factory=sqlite3.Row
r=c.execute(\"SELECT order_id,short_code,synced_at,attempts,last_error FROM outbox WHERE idempotency_key=?\",('$IDEM',)).fetchone()
print('outbox:', dict(r) if r else 'NONE')
"
```
Expected: `short_code` bắt đầu **`Q`** (không `QX`) → reserve hi-lo hoạt động. Sau ~6s `synced_at` KHÁC None, `last_error` None → **đã sync lên Sheets**. `TIME` < 1s.
**Nếu QX** → reserve vẫn fail (xem Step 3). **Nếu synced_at None + last_error** → đọc lỗi, sửa trước khi tiếp.

- [ ] **Step 6: Dọn đơn test + Grok đồng kiểm Task 0**
Dọn: `python3 -c "import sqlite3; c=sqlite3.connect('print-server/outbox.db'); c.execute(\"DELETE FROM outbox WHERE payload LIKE '%TEST-DEPLOY%'\"); c.commit(); print('cleaned')"`
⚠️ Đơn test có thể đã lên Sheets — mở ORDERS, tìm `TEST-DEPLOY`, đổi status → `CANCELLED` (qua GAS GET `?action=update_status&order_id=...&status=CANCELLED&token=...`) để không tính doanh thu.
**Grok review:** đưa Grok output Step 3+5, hỏi: "POST auth OK chưa? mã Q hay QX? sync thành công? còn rủi ro deploy nào?". Sửa nếu Grok chỉ ra vấn đề. Task 0 KHÔNG có commit (chỉ deploy + verify).

---

## TASK 1 (VIỆC 2a) — Tách helper gateway trong kds.html

**Mục tiêu:** `markPaid`/`updateStatus`/`finishOrder` dùng chung 2 helper gateway-first thuần (không DOM), tránh lặp code + để `finishOrder` gọi lại.

**Files:** Modify `web/kds.html`.

**Interfaces (thêm mới):**
- `async gwStatus(orderId, status) -> {ok,...}` — POST gateway `/order/status` khi LOCAL_FIRST; lỗi/not-ok → fallback GAS GET `?action=update_status`. Throw nếu cả hai fail.
- `async gwMarkPaid(orderId, order) -> {ok, already_paid?}` — POST gateway `/order/mark_paid` (kèm `order` để in receipt local) khi LOCAL_FIRST; lỗi/not-ok → fallback GAS GET `?action=mark_paid`. Throw nếu cả hai fail.

- [ ] **Step 1: Thêm 2 helper (đặt ngay TRƯỚC `async function markPaid`)**
```javascript
async function gwStatus(orderId, status) {
  if (LOCAL_FIRST) {
    try {
      const r = await fetch(`${GATEWAY_URL}/order/status`, { method:'POST',
        headers:{'Content-Type':'application/json'}, body: JSON.stringify({ order_id: orderId, status }) });
      const d = await r.json(); if (d.ok) return d;
    } catch (_) {}
  }
  const r = await fetch(`${GAS_URL}?action=update_status&order_id=${encodeURIComponent(orderId)}&status=${status}${TQ}`);
  const d = await r.json(); if (!d.ok) throw new Error(d.error || 'status_failed'); return d;
}
async function gwMarkPaid(orderId, order) {
  if (LOCAL_FIRST) {
    try {
      const r = await fetch(`${GATEWAY_URL}/order/mark_paid`, { method:'POST',
        headers:{'Content-Type':'application/json'}, body: JSON.stringify({ order_id: orderId, order }) });
      const d = await r.json(); if (d.ok) return d;
    } catch (_) {}
  }
  const r = await fetch(`${GAS_URL}?action=mark_paid&order_id=${encodeURIComponent(orderId)}${TQ}`);
  const d = await r.json(); if (!d.ok) throw new Error(d.error || 'pay_failed'); return d;
}
```

- [ ] **Step 2: Refactor `markPaid` dùng gwMarkPaid** (giữ nguyên UX/DOM, chỉ thay phần fetch)
Trong `async function markPaid(orderId, total, shortCode, btn)`, thay TOÀN BỘ 2 khối try (gateway + GAS fallback) bằng:
```javascript
  try {
    const o = allOrders.find(x => x.order_id === orderId);
    const data = await gwMarkPaid(orderId, o);
    if (o) o.payment_status = 'PAID';
    renderOrders();
    if (!data.already_paid) speak(`Nhận tiền ${fmtSpeak(total)} đồng, đơn số ${shortCode || orderId}`);
  } catch(err) {
    btn.classList.remove('loading'); btn.disabled = false; btn.textContent = '💳 Đã thanh toán';
    alert('CHƯA ghi nhận thanh toán được (' + ((err && err.message) || 'mất kết nối') + ') — sổ sách KHÔNG có đơn này, bấm lại.');
  }
```

- [ ] **Step 3: Refactor `updateStatus` dùng gwStatus** (tương tự — thay 2 khối fetch bằng `const data = await gwStatus(orderId, newStatus);` rồi cập nhật `o.status`, `renderOrders()`; catch giữ nguyên alert cũ).

- [ ] **Step 4: Verify JS syntax**
Run: `cd /Users/dpd/Projects/lamha-kissaten && node -e "const fs=require('fs'),h=fs.readFileSync('web/kds.html','utf8'),m=h.match(/<script[^>]*>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script[^>]*>/g,'')).sort((a,b)=>b.length-a.length)[0]; require('fs').writeFileSync('/tmp/k.js',m); require('child_process').execSync('node --check /tmp/k.js'); console.log('JS OK')"`
Expected: `JS OK`.

- [ ] **Step 5: Grok đồng kiểm + commit**
Grok review diff Task 1: "helper có đúng gateway-first + fallback GAS? markPaid/updateStatus còn hành vi cũ? có nuốt lỗi không?". Sửa theo Grok.
```bash
git add web/kds.html && git commit -m "refactor(kds): extract gwStatus/gwMarkPaid gateway helpers"
```

---

## TASK 2 (VIỆC 2b) — Phase 5 nút: [Xong] + pickup 2 nút + toggle pha ẩn

**Files:** Modify `web/kds.html` (`renderOrders` + thêm `actionButtons`/`finishOrder`/`setReady`/`setMaking`/`legacyStepButtons`).

**Quy tắc (đã chốt brainstorm):** dine_in = 1 nút [Xong] + toggle 🍵 ẩn. pickup/take_away = [🔔 Sẵn sàng] + [Xong] + toggle 🍵. delivery = flow cũ từng bước. [Xong] cash = mark_paid (tiền+tem+receipt local) **và** status DELIVERED; vietqr = chỉ DELIVERED.

- [ ] **Step 1: Thêm các hàm (đặt sau `gwMarkPaid`)**
```javascript
// Nút cũ từng-bước — CHỈ cho delivery (đơn remote), giữ nguyên hành vi.
function legacyStepButtons(o) {
  if (['NEW','CONFIRMED'].includes(o.status))
    return `<button class="btn-mark-paid" style="background:var(--accent);color:#fff;flex:1;" onclick="updateStatus('${esc(o.order_id)}','MAKING',this)">🍵 Bắt đầu pha</button>`;
  if (o.status === 'MAKING')
    return `<button class="btn-mark-paid" style="background:#4CAF50;color:#fff;flex:1;" onclick="updateStatus('${esc(o.order_id)}','READY',this)">✅ Pha xong</button>`;
  if (o.status === 'READY')
    return `<button class="btn-mark-paid" style="background:#2196F3;color:#fff;flex:1;" onclick="updateStatus('${esc(o.order_id)}','DELIVERING',this)">🛵 Giao đi</button>`;
  if (o.status === 'DELIVERING')
    return `<button class="btn-mark-paid" style="background:#2196F3;color:#fff;flex:1;" onclick="updateStatus('${esc(o.order_id)}','DELIVERED',this)">🚀 Đã giao</button>`;
  return '';
}
// Nút hành động Phase 5 theo delivery_type.
function actionButtons(o) {
  if (o.status === 'DELIVERED' || o.status === 'CANCELLED') return '';
  const dt = o.delivery_type || 'dine_in';
  if (dt === 'delivery') return legacyStepButtons(o);
  const xong = `<button class="btn-mark-paid" style="background:#4CAF50;color:#fff;flex:2;" onclick="finishOrder('${esc(o.order_id)}',this)">✅ Xong</button>`;
  const pha = (['NEW','CONFIRMED'].includes(o.status))
    ? `<button class="btn-sm" title="Đang pha" style="flex:0 0 auto;padding:8px 12px;opacity:.7;" onclick="setMaking('${esc(o.order_id)}',this)">🍵</button>` : '';
  if (dt === 'pickup' || dt === 'take_away') {
    const ready = (o.status !== 'READY')
      ? `<button class="btn-mark-paid" style="background:#2196F3;color:#fff;flex:1;" onclick="setReady('${esc(o.order_id)}',this)">🔔 Sẵn sàng</button>` : '';
    return ready + xong + pha;
  }
  return xong + pha;   // dine_in
}
// [Xong]: cash → thu tiền (receipt local) + DELIVERED; vietqr → DELIVERED (tiền chờ webhook).
async function finishOrder(orderId, btn) {
  const o = allOrders.find(x => x.order_id === orderId);
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang lưu...';
  const method = (o && o.payment_method) || (o && o.payment && o.payment.method) || 'cash';
  try {
    if (method === 'cash' && o && o.payment_status !== 'PAID') {
      const d = await gwMarkPaid(orderId, o);
      o.payment_status = 'PAID';
      if (!d.already_paid) speak(`Nhận tiền ${fmtSpeak(o.total)} đồng, đơn ${o.short_code || orderId}`);
    }
    await gwStatus(orderId, 'DELIVERED');
    if (o) o.status = 'DELIVERED';
    renderOrders();
  } catch (err) {
    btn.disabled = false; btn.textContent = old;
    alert('CHƯA đóng đơn được (' + ((err && err.message) || 'mất kết nối') + ') — bấm lại.');
  }
}
async function setReady(orderId, btn) { await _statusBtn(orderId, 'READY', btn); }
async function setMaking(orderId, btn) { await _statusBtn(orderId, 'MAKING', btn); }
async function _statusBtn(orderId, status, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = '...';
  try { await gwStatus(orderId, status); const o = allOrders.find(x => x.order_id === orderId);
        if (o) o.status = status; renderOrders(); }
  catch (_) { btn.disabled = false; btn.textContent = old; alert('Lỗi cập nhật — thử lại.'); }
}
```

- [ ] **Step 2: Wire vào `renderOrders`** — thay khối `statusAction`/`payAction`/`footer` (từ `let statusAction = '';` tới hết `const footer = ...`) bằng:
```javascript
    const isPaid2 = o.payment_status === 'PAID';
    const acts = actionButtons(o);
    // Nút thanh toán riêng CHỈ khi chưa PAID và KHÔNG phải [Xong]-cash-flow (dine_in/pickup đã gộp vào Xong).
    const dt2 = o.delivery_type || 'dine_in';
    const needsSeparatePay = (dt2 === 'delivery') && !isPaid2 && o.status !== 'CANCELLED';
    const payAction = needsSeparatePay ? `
        <button class="btn-mark-paid" style="flex:1;" onclick="markPaid('${esc(o.order_id)}',${o.total},'${esc(o.short_code)}',this)">💳 Đã thanh toán</button>` : '';
    const footer = (acts || payAction) ? `
      <div class="card-footer" style="display:flex; gap:8px; flex-wrap:wrap;">
        ${acts}
        ${payAction}
      </div>` : '';
```
Lưu ý: dine_in/pickup gộp thu tiền vào [Xong] (cash). Nếu vietqr dine_in/pickup: [Xong] chỉ DELIVERED, tiền về qua webhook — không cần nút thanh toán tay (đúng hiện trạng). Delivery giữ nút thanh toán riêng.

- [ ] **Step 3: Verify JS syntax** (lệnh như Task 1 Step 4). Expected `JS OK`.

- [ ] **Step 4: Verify trực quan qua browser (KDS thật trên :5001)**
- preview: mở `http://localhost:5001/kds.html`, đợi load.
- Kiểm bằng read_page/screenshot: đơn dine_in hiện **1 nút [✅ Xong]** + toggle 🍵; đơn pickup hiện **[🔔 Sẵn sàng] + [✅ Xong]**. KHÔNG tạo đơn thật để bấm (tránh thu tiền thật) — chỉ xác nhận render.

- [ ] **Step 5: Grok đồng kiểm + commit**
Grok review: "actionButtons đúng theo dt? finishOrder cash gọi mark_paid+DELIVERED đúng 1 lần idempotent? vietqr không thu tay? delivery giữ flow cũ? có double-pay/double-stamp không?". Sửa theo Grok.
```bash
git add web/kds.html && git commit -m "feat(kds): Phase 5 one-tap [Xong], pickup ready button, hidden making toggle"
```

---

## TASK 3 (VIỆC 2c) — Receipt online tức thì (gateway in local từ outbox)

**Vấn đề:** board order KHÔNG có `items` array (chỉ `items_summary`) → không build_receipt từ `o`. Đơn local-first có `items` trong outbox payload → gateway lấy từ đó. Đơn remote (không có trong outbox) → giữ GAS→poller.

**Files:** Modify `print-server/gateway.py` (+ `get_create_payload`), `print-server/print_server.py` (`/order/mark_paid`), `print-server/test_gateway.py`.

**Interfaces:**
- `Gateway.get_create_payload(order_id: str) -> dict | None` — trả payload đơn create (có items/total) từ outbox op `ingest_order`; None nếu không có (đơn remote).

- [ ] **Step 1: Test trước (gateway)** — thêm vào `test_gateway.py`:
```python
    def test_get_create_payload_returns_items(self):
        self.gw.mint_order({"items":[{"name":"CF","qty":1,"price":30000,"modifiers":{}}],
              "total":30000,"metadata":{"delivery_type":"dine_in"},"idempotency_key":"rp1"})
        oid = self.gw.get_by_key("rp1")["order_id"]
        pl = self.gw.get_create_payload(oid)
        self.assertIsNotNone(pl); self.assertEqual(pl["items"][0]["name"], "CF")
        self.assertIsNone(self.gw.get_create_payload("ORD-REMOTE-9"))  # đơn không do gateway tạo
```
Run: `cd print-server && python3 -m unittest test_gateway -v 2>&1 | grep -E "get_create_payload|FAIL"` → FAIL (chưa có method).

- [ ] **Step 2: Implement `get_create_payload` trong gateway.py** (đặt cạnh `get_by_key`):
```python
    def get_create_payload(self, order_id):
        row = self._conn.execute(
            "SELECT payload FROM outbox WHERE op='ingest_order' AND order_id=? LIMIT 1",
            (order_id,)).fetchone()
        return json.loads(row["payload"]) if row else None
```
Run test lại → PASS.

- [ ] **Step 3: `/order/mark_paid` in receipt local LUÔN (online+offline)** — thay thân route:
```python
@app.post("/order/mark_paid")
def order_mark_paid():
    p = request.get_json(force=True, silent=True) or {}
    order_id = p.get("order_id")
    # Dựng order cho receipt: ưu tiên outbox (đơn local-first có items+total); else dùng p['order'] KDS gửi.
    recp = GATEWAY.get_create_payload(order_id) or p.get("order")
    receipt_printed = False
    if recp and recp.get("items"):
        try:
            _print_receipt_bytes(build_receipt(recp)); receipt_printed = True
        except Exception as exc:
            log.error("local receipt failed: %s", exc)
    try:
        d = _gas_post({"action": "mark_paid", "order_id": order_id,
                       "receipt_printed_local": receipt_printed})
        if d.get("ok"):
            return jsonify({**d, "receipt_printed_local": receipt_printed}), 200
    except Exception:
        pass
    GATEWAY.enqueue("mark_paid", order_id, f"{order_id}:paid",
                    {"action": "mark_paid", "order_id": order_id, "receipt_printed_local": receipt_printed})
    return jsonify({"ok": True, "queued_offline": True, "receipt_printed_local": receipt_printed}), 200
```
Lưu ý: `build_receipt` cần `total` + `payment.method` — outbox payload có `total` (KDS gửi) + `payment`. Nếu thiếu `payment`, receipt vẫn in (mục TT hiện mặc định). KHÔNG chặn.

- [ ] **Step 4: Regression toàn bộ**
Run: `cd /Users/dpd/Projects/lamha-kissaten/print-server && python3 -m unittest discover 2>&1 | grep -E "Ran|OK|FAILED"`
Expected: OK (đủ số test, +1 mới).

- [ ] **Step 5: Grok đồng kiểm + commit**
Grok review: "receipt in local đúng nguồn items (outbox trước, p.order sau)? online KHÔNG in đôi (receipt_printed_local=true → GAS skipReceipt)? đơn remote không lỗi (get_create_payload=None → fallback GAS)? build_receipt thiếu field có vỡ không?". Sửa theo Grok.
```bash
git add print-server/gateway.py print-server/print_server.py print-server/test_gateway.py
git commit -m "feat(gateway): mark_paid prints receipt locally from outbox (instant, online+offline)"
```

---

## TASK 4 — E2E tổng + Grok đồng kiểm cuối + đo timing

- [ ] **Step 1: Restart print_server** (nạp code Task 3): `launchctl kickstart -k "gui/$(id -u)/com.lamha.kissaten.printserver" && sleep 4 && curl -s http://127.0.0.1:5001/health | head -c 80`

- [ ] **Step 2: E2E dine_in cash (đo order→tem→receipt)** — tạo 1 đơn test dine_in cash qua `http://localhost:5001/kds.html` (giao diện) HOẶC curl `/order`, ghi `order_id/short_code` + thời gian tem ra. Rồi bấm **[Xong]** (hoặc curl `/order/mark_paid` với `order_id`) → xác nhận: **receipt in local tức thì**, GAS `mark_paid` trả ok, `payment_status=PAID`, status `DELIVERED`, **tem loyalty cấp đúng 1 lần** (kiểm CUSTOMERS/stamp), **receipt KHÔNG in lần 2** (poller pending_print không nhặt vì printed_at đã set). Đo: order→response, [Xong]→receipt.

- [ ] **Step 3: E2E pickup** — tạo đơn pickup → xác nhận 2 nút; bấm [🔔 Sẵn sàng] → Zalo ping (nếu có customer_id); [Xong] → như trên.

- [ ] **Step 4: Regression đơn remote** — 1 đơn delivery qua GAS (không qua gateway) → poller vẫn in tem + flow từng bước không đổi.

- [ ] **Step 5: Dọn đơn test** — xoá outbox test + CANCELLED các đơn test trên Sheets (như Task 0 Step 6).

- [ ] **Step 6: Grok đồng kiểm CUỐI (toàn bộ diff việc 2)** — đưa Grok diff `git diff 620f9ef..HEAD -- web/kds.html print-server/` + checklist:
  - [ ] [Xong] cash không thu đôi tiền / cấp đôi tem (idempotent guard PAID).
  - [ ] Không double-receipt (local + poller).
  - [ ] pickup giữ ping READY; dine_in không ping thừa.
  - [ ] delivery flow cũ nguyên vẹn.
  - [ ] Free-drink pending count (Orders.gs:524) đúng khi [Xong]=PAID; giao lỗi double-spend ly free treo (task_d28049e3).
  - [ ] Cash recon (chot-ca) nhận đơn cash PAID; op mark_paid offline chờ outbox cạn.
  - [ ] JS syntax OK, không lỗi console khi mở KDS.
  Sửa mọi finding Grok. Nếu Grok + Antigravity bất đồng → ghi lại, để chief (Claude) phân xử, KHÔNG tự quyết chỗ đụng tiền.

- [ ] **Step 7: Báo cáo cho chief (Claude)** — tóm: deploy OK chưa, mã Q/sync OK chưa, Phase 5 render đúng chưa, timing order→tem + [Xong]→receipt, mọi finding Grok + cách xử lý. Chief verify điểm nghi vấn trước khi coi là xong.

---

## Self-review (đã chạy khi viết plan)

- **Coverage:** Việc 1 deploy → Task 0 (kèm verify POST auth + mã Q + sync — bắt đúng 2 bug E2E trước). Việc 2 UX → Task 1-2 (1 nút [Xong], pickup 2 nút, toggle pha, delivery giữ cũ). Receipt online → Task 3 (outbox items + skipReceipt chống double). Grok đồng kiểm → mỗi task + Task 4 cuối. E2E + timing → Task 4.
- **Placeholder:** URL/token là giá trị thật/đường dẫn thật, không TBD.
- **Type consistency:** `gwStatus`/`gwMarkPaid`/`finishOrder`/`actionButtons`/`legacyStepButtons`/`get_create_payload` dùng nhất quán giữa các task. `receipt_printed_local` khớp print_server↔GAS markOrderPaid(opts.skipReceipt) đã có.
- **Đã verify (bỏ nghi vấn):** KDS submit payload ([kds.html:1462-1480](../../web/kds.html)) đã có `items` (sku/name/qty/price/modifiers) + `total` + `payment.method` → outbox payload đủ cho `build_receipt`. Task 3 chạy đúng, không cần thêm field.
- **Rủi ro còn lại (ghi cho implementer):** reserve hi-lo gọi inline trong mint → đơn đầu mỗi block-20 chờ ~2-3s (prefetch async là nâng cấp tương lai, KHÔNG làm trong plan này).
