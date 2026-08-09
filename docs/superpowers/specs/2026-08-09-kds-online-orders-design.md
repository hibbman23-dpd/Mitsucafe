# Đơn online hiện lên KDS — thiết kế

**Ngày:** 2026-08-09
**Trạng thái:** chờ duyệt
**Phạm vi:** `gas/Code.gs`, `print-server/print_server.py`, `print-server/online_inbox.py`, `web/kds.html`

---

## 1. Vấn đề

Đơn từ mitsu.cafe được in tem tự động nhưng **không bao giờ hiện trên KDS**. Nhân viên chỉ biết có đơn khi nghe máy in kêu.

### Chẩn đoán

Hai đường độc lập, một đường sống một đường chết:

| Đường | Cơ chế | Trạng thái |
|---|---|---|
| In tem | `print_poller.py` poll GAS `?action=pending_labels` mỗi 4s → in | ✅ chạy |
| KDS inbox | `print_server.py` `INBOX.poll()` → GAS `pending_online_orders` → `GET /inbox` | ❌ chết |

Ba chốt chặn, mỗi chốt đủ để giết đường thứ hai:

1. `ONLINE_POLL` mặc định `"0"` ([print_server.py:2267](../../../print-server/print_server.py)) — vòng poll không bao giờ gọi `INBOX.poll()`. LaunchAgent đã cài không set biến này.
2. Action `pending_online_orders` **không tồn tại** trong `gas/*.gs`. Comment trong code tự thú: mailbox action "does not exist yet".
3. `_gas_fetch_online` nuốt mọi exception, trả `[]` — hỏng im lặng, không log.

Bằng chứng live: `GET /inbox` → `{"pending":[],"status":{"online":false,...}}`. `online:false` = chưa từng poll thành công.

Front-end KDS ([kds.html:1099-1199](../../../web/kds.html), [order-api.js:38](../../../web/order-api.js)) nối dây đúng. Lỗi hoàn toàn ở phía server.

### Lỗ nghiêm trọng trong code sẵn có

`POST /inbox/<id>/accept` gọi `GATEWAY.mint_order` ([print_server.py:452](../../../print-server/print_server.py)) — mint `order_id` local **mới** cho đơn đã có `order_id` trên Sheets. Bật cờ `ONLINE_POLL=1` mà không sửa chỗ này thì mỗi đơn online thành **hai đơn**: doanh thu đôi, tem loyalty đôi, mã trên tem khác mã trên màn hình.

---

## 2. Mô hình nghiệp vụ đã chốt

**Đơn online tự chạy vào KDS. Chặn là ngoại lệ.**

Lý do: tem đã in tự động lúc đơn ở trạng thái NEW, trước khi bất kỳ ai bấm gì. Bắt nhân viên "duyệt" một đơn mà tem đã nằm trong khay là trạng thái giả. Nhưng quyền từ chối vẫn cần thật — hết nguyên liệu, ngoài giờ, đơn ảo đều là chuyện có thật.

Hệ quả: **bỏ ngăn 📥 và nút "Nhận"**. Thay bằng banner thông báo + nút "Từ chối" trên thẻ đơn.

---

## 3. Ánh xạ ID

### 3.1 Một đơn = một `order_id`, GAS là nơi cấp

- Bỏ khái niệm `online_order_id` riêng. `online_order_id` ≡ `order_id` do GAS cấp (`ORD-20260809-4821`).
- KDS local import **nguyên** `order_id` + `short_code` của GAS vào SQLite `OrderStore`.
- `GATEWAY.mint_order` **không chạm** đường online. Cũng không ghi outbox `ingest_order` — đơn đã nằm trên Sheets, ingest lại là nhân đôi.

### 3.2 Vì sao bắt buộc dùng mã GAS

Tem in ra trước khi nhân viên thấy đơn, mang `short_code` GAS cấp. Mint mã local mới thì tem trong tay khách một mã, màn bếp một mã — gọi tên khách không khớp.

An toàn về va chạm: GAS ghi đè `short_code` client gửi bằng `buildShortCode()` ([Code.gs:826](../../../gas/Code.gs)), hàm này ăn watermark `sc_wm_<date>_<letter>` trong `ScriptProperties` ([Orders.gs:297](../../../gas/Orders.gs)). Block mã của gateway local xin qua `reserve_codes` cũng ăn đúng watermark đó ([gateway.py:134](../../../print-server/gateway.py)). Cùng một nguồn số → import thẳng mã GAS không đụng đơn tại quán.

### 3.3 Dấu "đã vào KDS" = `confirmed_at`

Không thêm cột mới vào ORDERS.

- Mailbox trả đơn thỏa: `channel != 'staff'` **và** `status == 'NEW'` **và** `confirmed_at` rỗng **và** tạo trong 4 giờ.
- Import xong → đẩy `update_status` → `CONFIRMED` → `confirmed_at` có giá trị → đơn rớt khỏi mailbox.

Đúng state machine trong CLAUDE.md (`NEW → CONFIRMED`), không phá luật append-only (chỉ ghi thêm cột trạng thái).

Với mô hình "đơn tự chạy", "máy kéo về" *chính là* xác nhận — không có nghĩa thứ hai nào bị mất khi gộp vào một mốc.

### 3.4 Dedupe hai lớp

| Lớp | Cơ chế |
|---|---|
| Local | `upsert_create` dùng `INSERT OR IGNORE` trên khoá chính `order_id` ([order_store.py:90](../../../print-server/order_store.py)) |
| GAS | `confirmed_at` đã set thì không trả lại |

Kịch bản xấu — import local xong, gọi GAS `CONFIRMED` thì rớt mạng:
đơn vẫn hiện trên KDS và làm bình thường → mailbox vẫn giữ đơn đó → poll kế tiếp import lại → lớp local chặn. Tự lành, không cần người can thiệp.

### 3.5 Đường tiền vẫn thông

`POST /order/mark_paid` lấy payload dựng bill từ `GATEWAY.get_create_payload(order_id)` (đọc outbox). Đơn online không có record outbox `ingest_order` → trả `None` → rơi xuống fallback `p.get("order")`, tức object đơn mà KDS gửi kèm ([print_server.py:1351](../../../print-server/print_server.py) ← [kds.html:2304](../../../web/kds.html)). Bill vẫn in.

Việc cần làm khi implement: đảm bảo object đơn từ `OrderStore` có đủ shape `build_receipt` cần — `items`, `total`, `metadata.short_code`, `payment.method`.

---

## 4. Thiết kế kỹ thuật

### 4.1 GAS — action `pending_online_orders`

Thêm vào bảng route trong `Code.gs`, `auth: AUTH.REPORT` (cùng tầng với `pending_labels`).

```js
'pending_online_orders': {
  auth: AUTH.REPORT,
  handler: function(e) {
    return { ok: true, orders: _getPendingOnlineOrders() };
  }
}
```

`_getPendingOnlineOrders()` theo khuôn `_getPendingLabelOrders()` ([Code.gs:926](../../../gas/Code.gs)): quét 300 dòng cuối, cutoff 4 giờ.

Chỉ số cột (0-based, theo `ORDERS_HEADERS`):

| Cột | Index | Dùng để |
|---|---|---|
| `order_id` | 0 | khoá |
| `timestamp` | 2 | cutoff 4h |
| `channel` | 3 | lọc `!== 'staff'` |
| `table_id` | 6 | |
| `customer_id` | 8 | SĐT để gọi khi từ chối |
| `items_json` | 9 | |
| `total` | 11 | |
| `status` | 12 | lọc `=== 'NEW'` |
| `confirmed_at` | 13 | lọc rỗng |
| `payment_status` | 19 | |
| `notes` | 23 | |
| `customer_name` | 24 | |
| `short_code` | 25 | |
| `delivery_type` | 26 | |

**Không tái dùng `_rowToOrderFull`.** Hàm đó mặc định `payment.status = 'PAID'` khi ô trống ([Code.gs:989](../../../gas/Code.gs)) — hợp lý cho receipt builder (chỉ gọi khi đơn đã DELIVERED) nhưng sai chết người cho đơn online chưa thu tiền. Viết `_rowToOnlineOrder(row)` riêng, `payment_status` map thẳng, ô trống → `'PENDING'`.

### 4.2 print_server — import thay vì mint

**`OnlineInbox`** đổi vai: từ "hộp chờ người duyệt" thành "bộ nhập tự động". Sau khi `poll()` lấy được danh sách:

1. Với mỗi đơn: `STORE.upsert_create({...})` với `order_id` + `short_code` GAS, `source="online"`.
2. Import thành công → `GATEWAY.enqueue("status", order_id, f"{order_id}:CONFIRMED", {...})` để syncer đẩy `CONFIRMED` lên GAS.
3. Đơn nào `upsert_create` báo đã tồn tại → bỏ qua bước 2 (đã enqueue lần trước).

`_pending` / `_accepted` / `accept()` trong `online_inbox.py` không còn ý nghĩa → gỡ. Gỡ luôn cả hai route `GET /inbox` và `POST /inbox/<id>/accept`.

Banner không cần API riêng. Đơn online sau khi import là đơn bình thường trong `OrderStore`, đã nằm sẵn trong danh sách `/orders` mà KDS poll. KDS nhận biết đơn mới bằng `source === 'online'` + `order_id` chưa có trong tập đã thấy phía client — đúng khuôn `__inboxSeen` sẵn có ([kds.html:1096](../../../web/kds.html)). Trạng thái "đã thấy" thuần client, không cần server nhớ.

**Bật cờ:** `ONLINE_POLL=1` + `ONLINE_POLL_SEC=15` vào `~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist`, rồi `launchctl kickstart -k`. Nhớ: `print_server.py` chạy code CŨ tới khi kickstart.

**Bỏ nuốt lỗi:** `_gas_fetch_online` phải `log.error` kèm nội dung lỗi trước khi trả `[]`. Hỏng im lặng chính là lý do bug này sống lâu.

### 4.3 print_server — route từ chối

`POST /order/<order_id>/reject`, body `{"reason": "out_of_stock" | "after_hours" | "fake"}`.

1. `STORE.apply_status(order_id, "CANCELLED")`
2. `GATEWAY.enqueue("status", order_id, f"{order_id}:CANCELLED", {"action": "update_status", "order_id": order_id, "status": "CANCELLED", "reject_reason": reason})`
3. Trả ngay, không chờ GAS — local-first, đúng khuôn `POST /order/status` ([print_server.py:1341](../../../print-server/print_server.py)).

Mất mạng vẫn hủy được trên máy; syncer đẩy lên Sheets sau.

### 4.4 KDS — banner góc phải

Bỏ `openInboxList` / `renderInboxList` / `renderInboxItemCard` / `acceptOnlineOrder` / nút `#inbox-btn`.

Thay bằng banner thông báo:

| Thuộc tính | Giá trị |
|---|---|
| Vị trí | `position: fixed`, góc phải trên, dưới header |
| Kích thước | rộng ~400px, tiêu đề ~1.4rem — đọc được từ chỗ máy pha |
| Nội dung | `🛵 ĐƠN ONLINE MỚI` · `short_code` cỡ lớn · tên khách · tóm tắt món · tổng tiền · SĐT |
| Tự tắt | **Không.** Nằm đó tới khi bấm `Đã thấy` |
| Hiệu ứng | viền nhấp nháy tới lúc bấm — tái dùng `@keyframes agePulse` ([kds.html:135](../../../web/kds.html)) |
| Nhiều đơn | xếp chồng tối đa 3, dư gộp thành `+N đơn nữa` |
| Chuông | `playNewOrderChime()`; đơn đã trễ dùng `playLateOrderChime()` ([kds.html:1076](../../../web/kds.html)) |

Toast 3 giây không dùng được ở đây — nhân viên đang cắm mặt vào máy pha thì thông báo đã biến mất.

### 4.5 KDS — nút Từ chối

Trên thẻ đơn ở bảng KDS, chỉ hiện khi `source === 'online'` và đơn chưa PAID.

Bấm → hỏi lý do bằng 3 nút nhanh: **Hết món** / **Ngoài giờ** / **Đơn ảo** → gọi `POST /order/<id>/reject` → thẻ biến khỏi bảng.

Thẻ đơn online hiện `customer_id` (SĐT) cỡ to để nhân viên gọi khách.

---

## 5. Quyết định có chủ ý

**Không tự động báo khách khi từ chối.** Web order gửi `payment.status = 'PENDING'` ([order.js:2011](../../../web/order.js)) — khách trả tại quán, nên từ chối không đụng tiền, không có hoàn tiền để làm sai. Còn việc báo: khách chưa follow Zalo OA thì không nhận được tin, mà nhận được cũng bực. Gọi điện chắc ăn hơn. Tự động hoá để v2.

**Tem đã in thì vứt.** Cái giá của việc in trước khi có người duyệt. Đổi lại đơn không bao giờ kẹt chờ người bấm.

**Không thêm cột vào ORDERS.** `confirmed_at` gánh được nghĩa "đã vào KDS" mà không mất thông tin nào.

---

## 6. Kiểm thử

| Tầng | Kiểm |
|---|---|
| Unit — GAS | `_getPendingOnlineOrders` lọc đúng 4 điều kiện; đơn `channel='staff'` không lọt; `payment_status` trống → `'PENDING'` chứ không phải `'PAID'` |
| Unit — Python | import giữ nguyên `order_id`/`short_code` GAS; poll hai lần chỉ ra một dòng; `/order/<id>/reject` ghi outbox đúng payload |
| Tích hợp | GAS `CONFIRMED` thất bại → đơn vẫn trên KDS, poll lại không nhân đôi |
| Tích hợp | `mark_paid` trên đơn online (không có outbox record) vẫn in được bill qua fallback |
| E2E | Đặt đơn thật trên mitsu.cafe → tem in ra **và** banner hiện **và** mã trên tem khớp mã trên màn hình |
| Hồi quy | Đơn tại quán (`source='staff'`) không bị ảnh hưởng; `short_code` không nhảy số |

---

## 7. Việc phải làm bằng tay sau khi merge

1. Deploy GAS: `python3 ops/gas_push.py --deploy`
2. Thêm `ONLINE_POLL=1` + `ONLINE_POLL_SEC=15` vào `~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist`
3. `launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver`
4. Đặt một đơn thật trên mitsu.cafe, xác nhận tem + banner + mã khớp
