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

- Mailbox trả đơn thỏa: `channel != 'staff'` **và** `status == 'NEW'` **và** `confirmed_at` rỗng **và** tạo từ 00:00 hôm nay (ICT) trở đi.
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

### 3.6 Ánh xạ trường hiển thị — SĐT khách

Bảng `orders` trong SQLite ([order_store.py:31](../../../print-server/order_store.py)) **không có** cột `customer_id` hay `customer_name`. Thẻ đơn KDS lại đọc thẳng `o.customer_name` / `o.customer_id` ([kds.html:2007](../../../web/kds.html)), mà `GET /orders` trả nguyên `_row_to_dict` không qua mapper nào ([print_server.py:1097](../../../print-server/print_server.py) → [kds.html:2252](../../../web/kds.html)).

Hệ quả: mọi đơn local-first hiện nay đều hiện "Khách vãng lai". Với đơn tại quán thì không sao. Với đơn online thì hỏng thiết kế — mục 5 dựa vào việc nhân viên **gọi điện** cho khách khi từ chối, không có SĐT thì không gọi được.

**Cách vá — không đổi schema.** `_row_to_dict` đã trả sẵn `bill_meta` (parse từ `bill_meta_json`, [order_store.py:64](../../../print-server/order_store.py)).

- Lúc import: nhét `customer_name` + `customer_id` vào `bill_meta`.
- Thẻ KDS: đọc `o.customer_name || o.bill_meta?.customer_name`, tương tự cho `customer_id`.

Thêm cột vào SQLite sẽ đụng mọi đường ghi đơn; đọc `bill_meta` chỉ đụng một chỗ render.

Trường khác cần lưu ý: `items_summary` KDS tự tính lấy khi thiếu ([kds.html:1973](../../../web/kds.html)) — không phải lo. `payment_status` `/orders` không trả, `normalizePaid` map từ cột `paid` — cũng không phải lo. `timestamp` thì thiếu thật; thẻ đơn online dùng `created_at`.

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

`_getPendingOnlineOrders()` theo khuôn `_getPendingLabelOrders()` ([Code.gs:926](../../../gas/Code.gs)): quét 300 dòng cuối.

**Cutoff = 00:00 hôm nay theo giờ ICT**, không phải 4 giờ. Khách đặt 5:30 sáng, nhân viên mở KDS lúc 9:45 → mốc 4 giờ làm đơn biến mất vĩnh viễn. Rớt mạng quá 4 tiếng cũng mất đơn. Đơn trong ngày phải thấy được hết.

Chỉ số cột (0-based, theo `ORDERS_HEADERS`):

| Cột | Index | Dùng để |
|---|---|---|
| `order_id` | 0 | khoá |
| `timestamp` | 2 | cutoff đầu ngày + `created_at` cho thẻ đơn |
| `channel` | 3 | lọc `!== 'staff'` |
| `table_id` | 6 | |
| `customer_id` | 8 | SĐT để gọi khi từ chối |
| `items_json` | 9 | |
| `total` | 11 | |
| `status` | 12 | lọc `=== 'NEW'` |
| `confirmed_at` | 13 | lọc rỗng |
| `payment_status` | 19 | |
| `label_printed_at` | 20 | cờ ⚠️ CHƯA IN TEM (mục 4.1b) |
| `notes` | 23 | |
| `customer_name` | 24 | |
| `short_code` | 25 | |
| `delivery_type` | 26 | |

**Không tái dùng `_rowToOrderFull`.** Hàm đó mặc định `payment.status = 'PAID'` khi ô trống ([Code.gs:989](../../../gas/Code.gs)) — hợp lý cho receipt builder (chỉ gọi khi đơn đã DELIVERED) nhưng sai chết người cho đơn online chưa thu tiền.

Viết `_rowToOnlineOrder(row)` riêng, trả đúng shape này:

```json
{
  "order_id": "ORD-20260809-4821",
  "short_code": "M07",
  "created_at": "2026-08-09T09:12:33.000Z",
  "channel": "web",
  "customer_id": "0901234567",
  "customer_name": "Nguyễn Văn A",
  "delivery_type": "pickup",
  "table_id": "",
  "items": [{ "sku": "DR001", "name": "Cà phê sữa", "qty": 2, "price": 30000 }],
  "total": 60000,
  "payment_status": "PENDING",
  "notes": "ít đường",
  "label_printed_at": ""
}
```

`payment_status` map thẳng từ cột 19, ô trống → `'PENDING'` (không bao giờ `'PAID'`).

**`label_printed_at` phải có trong payload.** Lý do ở mục 4.1b.

### 4.1b Đơn quá 4 giờ sẽ không có tem

Nới cutoff của mailbox lên đầu ngày mở ra một trạng thái mới: đơn **hiện trên KDS nhưng chưa từng in tem**.

`_getPendingLabelOrders()` vẫn giữ cutoff 4 giờ ([Code.gs:930](../../../gas/Code.gs)). Đơn quá 4 tiếng thì poller bỏ qua vĩnh viễn, tem không bao giờ ra. Trước đây không ai thấy nên không sao; giờ đơn hiện lên bảng mà không có tem trong khay là nhân viên pha xong không biết dán gì.

Xử lý: `label_printed_at` rỗng → banner hiện cờ đỏ `⚠️ CHƯA IN TEM` kèm nút `🖨️ In tem`, gọi `POST /enqueue/labels` với chính order đó.

**Không nới cutoff của `_getPendingLabelOrders`.** Nới là mở cửa cho đơn cũ bị in lại hàng loạt sau một lần Mac Mini nằm lâu. Để nhân viên bấm tay, có kiểm soát.

### 4.2 print_server — import thay vì mint

**`OnlineInbox`** đổi vai: từ "hộp chờ người duyệt" thành "bộ nhập tự động". Sau khi `poll()` lấy được danh sách:

1. `STORE.get(order_id)` — đã có thì bỏ qua toàn bộ (đã import lần trước).
2. `STORE.upsert_create({...})` với `order_id` + `short_code` GAS, `source="online"`, `bill_meta` chứa `customer_name` + `customer_id`.
3. **`STORE.apply_status(order_id, "CONFIRMED")`.** `upsert_create` hardcode `status="NEW"` ([order_store.py:95](../../../print-server/order_store.py)) — thiếu bước này thì GAS đã `CONFIRMED` mà local vẫn `NEW`, hai bên lệch trạng thái.
4. `GATEWAY.enqueue("status", order_id, f"{order_id}:CONFIRMED", {...})` để syncer đẩy `CONFIRMED` lên GAS.

Bước 1 phải là `STORE.get` chứ không dựa vào `upsert_create` — hàm đó luôn trả `self.get(oid)`, không phân biệt được vừa chèn hay đã có sẵn ([order_store.py:100](../../../print-server/order_store.py)). Không kiểm trước thì mỗi vòng poll enqueue thêm một op `CONFIRMED` thừa.

`_pending` / `_accepted` / `accept()` trong `online_inbox.py` không còn ý nghĩa → gỡ. Gỡ luôn cả hai route `GET /inbox` và `POST /inbox/<id>/accept`.

Banner không cần API riêng. Đơn online sau khi import là đơn bình thường trong `OrderStore`, đã nằm sẵn trong danh sách `/orders` mà KDS poll. KDS nhận biết đơn mới bằng `source === 'online'` + `order_id` chưa có trong tập đã thấy phía client — đúng khuôn `__inboxSeen` sẵn có ([kds.html:1096](../../../web/kds.html)). Trạng thái "đã thấy" thuần client, không cần server nhớ.

**Bật cờ:** đổi mặc định trong code `os.getenv("ONLINE_POLL", "0")` → `"1"` ([print_server.py:2267](../../../print-server/print_server.py)). Action GAS deploy cùng đợt này nên lý do "on-by-default sẽ lỗi mỗi 15 giây" trong comment cũ không còn đúng. Đặt mặc định trong code thì `git pull` + restart là chạy, không phụ thuộc ai đó nhớ sửa plist. Nhánh `PRINT_ENGINE=noop` vẫn return sớm nên test không đẻ thread.

`ONLINE_POLL_SEC` giữ mặc định, hạ xuống `15`.

### 4.2b Tách hai tín hiệu: "GAS có sống" vs "action inbox có chạy"

`_gas_fetch_online` hiện nuốt mọi lỗi và trả `[]`. `OnlineInbox.poll()` thấy không exception liền set `self._online = True` ([online_inbox.py:21](../../../print-server/online_inbox.py)) — token sai hay GAS 500 vẫn báo "đang kết nối".

Nhưng vá bằng cách raise mọi lỗi thì hỏng kiểu khác: `_online` còn nuôi **badge cloud trên KDS** ([kds.html:1207](../../../web/kds.html) → `GET /cloud/status`). Action inbox lỗi mà badge nhảy `🟡 Offline (local)` là báo động giả — nhân viên tưởng mất mạng trong khi GAS vẫn thu tiền bình thường.

Tách đôi:

| Loại lỗi | `_online` | Hành vi |
|---|---|---|
| Transport (timeout, DNS, SSL, JSON hỏng) | `False` | GAS thật sự không với tới → badge đỏ đúng |
| HTTP 200 nhưng `ok:false` (sai token, thiếu action) | `True` | GAS sống. `log.error` nội dung lỗi, coi như 0 đơn, thêm trường `inbox_error` vào `/cloud/status` |

`_post_to_gas` không tự raise khi `ok:false` — nó trả nguyên dict ([gateway.py:283](../../../print-server/gateway.py)) — nên `_gas_fetch_online` phải tự kiểm `d.get("ok")`.

**Phát hiện phụ:** vì `INBOX.poll()` chưa từng chạy, `_online` đứng nguyên `False` từ lúc khởi động. Badge cloud trên KDS ở quán đang hiện `🟡 Offline (local)` **vĩnh viễn** dù GAS vẫn tốt. Đó là triệu chứng thứ hai của cùng gốc rễ này, sửa xong là hết.

### 4.3 print_server — route từ chối

`POST /order/<order_id>/reject`, body `{"reason": "out_of_stock" | "after_hours" | "fake"}`.

1. Ghi local: `status='CANCELLED'` **kèm** `void_reason=reason`, `voided_by='kds'`. Thêm một method mỏng vào `OrderStore` gọi `_apply(order_id, "status='CANCELLED', void_reason=?, voided_by=?", ...)`.
2. `GATEWAY.enqueue("status", order_id, f"{order_id}:CANCELLED", {"action": "update_status", "order_id": order_id, "status": "CANCELLED", "reject_reason": reason})`
3. Trả ngay, không chờ GAS — local-first, đúng khuôn `POST /order/status` ([print_server.py:1341](../../../print-server/print_server.py)).

**Không dùng `STORE.void_order()`.** Hàm sẵn có đó set `status='VOIDED'` ([order_store.py:242](../../../print-server/order_store.py)), mà `VOIDED` không nằm trong `VALID_STATUS` của GAS ([Orders.gs:19](../../../gas/Orders.gs)) và cũng không lọt bộ lọc `unsynced_finalized` (`paid=1 OR status='CANCELLED'`, [order_store.py:249](../../../print-server/order_store.py)). Dùng nó là đơn bị từ chối kẹt lại local, không lên Sheets, đối soát cuối ngày lệch. Tái dùng hai cột `void_reason`/`voided_by` thì được — chỉ đừng tái dùng cái status.

Mất mạng vẫn hủy được trên máy; syncer đẩy lên Sheets sau.

**Phía GAS phải lưu vết lý do.** `updateOrderStatus` hiện chỉ đổi cột status ([Orders.gs:412](../../../gas/Orders.gs)) — chủ quán mở Sheets sẽ thấy `CANCELLED` mà không biết vì sao. Handler POST `update_status` nhận nguyên payload `p` ([Code.gs:704](../../../gas/Code.gs)) nên đọc được `p.reject_reason`: có thì nối vào cột `notes` (index 23) dạng `[Từ chối: hết món]`, giữ nguyên nội dung notes cũ.

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
| Cờ đỏ | `label_printed_at` rỗng → `⚠️ CHƯA IN TEM` + nút `🖨️ In tem` (mục 4.1b) |

Toast 3 giây không dùng được ở đây — nhân viên đang cắm mặt vào máy pha thì thông báo đã biến mất.

**Chống dội banner khi F5.** Tập "đã thấy" nằm trong RAM trình duyệt. Không chặn thì mỗi lần reload KDS, hoặc mở KDS trên màn thứ hai, mọi đơn online trong ngày đều bị coi là mới → banner đổ hàng loạt, chuông kêu dồn.

Dùng lại đúng khuôn bảng đơn đang chạy: cờ `firstLoad` + `seenOrderIds` ([kds.html:2224-2230](../../../web/kds.html)). Lần `loadOrders()` đầu sau khi mở trang:

- Đánh dấu tất cả đơn online hiện có là đã thấy.
- **Không** phát chuông.
- Chỉ dựng banner cho đơn có `created_at` trong vòng 5 phút — đơn vừa vào lúc nhân viên đang reload thì không được nuốt mất.

Không cần `localStorage`: nhân viên hiếm khi reload, mà tập trong RAM sống đúng bằng phiên làm việc.

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
| Unit — GAS | `_getPendingOnlineOrders` lọc đúng 4 điều kiện; đơn `channel='staff'` không lọt; `payment_status` trống → `'PENDING'` chứ không phải `'PAID'`; cutoff nhận đơn 05:30 khi chạy lúc 09:45 |
| Unit — GAS | `update_status` có `reject_reason` → nối vào `notes`, không xoá notes cũ |
| Unit — Python | import giữ nguyên `order_id`/`short_code` GAS; đơn sau import có `status='CONFIRMED'` local; poll hai lần chỉ ra một dòng **và chỉ một op outbox** |
| Unit — Python | `_gas_fetch_online`: `ok:false` → `_online` vẫn `True` + có `inbox_error`; timeout → `_online` `False` |
| Unit — Python | `/order/<id>/reject` ghi `status='CANCELLED'` + `void_reason`, **không** ra `VOIDED` |
| Tích hợp | GAS `CONFIRMED` thất bại → đơn vẫn trên KDS, poll lại không nhân đôi |
| Tích hợp | `mark_paid` trên đơn online (không có outbox record) vẫn in được bill qua fallback |
| Tích hợp | Đơn bị từ chối lọt `unsynced_finalized` → lên được Sheets |
| E2E | Đặt đơn thật trên mitsu.cafe → tem in ra **và** banner hiện **và** mã trên tem khớp mã trên màn hình **và** thẻ đơn hiện đúng SĐT khách |
| E2E | F5 trang KDS khi đang có 5 đơn online → không chuông, không banner dội |
| Hồi quy | Đơn tại quán (`source='staff'`) không bị ảnh hưởng; `short_code` không nhảy số |
| Hồi quy | Badge cloud chuyển `🟢 Online` sau khi poll chạy |

---

## 7. Việc phải làm bằng tay sau khi merge

1. **Deploy GAS TRƯỚC:** `python3 ops/gas_push.py --deploy`. Phải đi trước bước 2 — `ONLINE_POLL` giờ mặc định bật, restart server trước khi GAS có action là log đỏ mỗi 15 giây.
2. `launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver`
   `print_server.py` chạy code CŨ tới khi kickstart — khác `kds.html` đọc thẳng từ đĩa.
3. Xác nhận badge cloud trên KDS chuyển `🟢 Online`.
4. Đặt một đơn thật trên mitsu.cafe, xác nhận tem + banner + mã khớp + SĐT hiện đúng.

Không còn bước sửa `.plist` bằng tay (mục 4.2).
