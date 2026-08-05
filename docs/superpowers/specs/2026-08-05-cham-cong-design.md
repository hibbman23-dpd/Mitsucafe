# Chấm công nhân viên qua LAN quán — Design

**Ngày:** 2026-08-05
**Trạng thái:** đã duyệt (brainstorming), chờ implementation plan

---

## 1. Mục tiêu

Nhân viên bấm vào ca / ra ca bằng điện thoại cá nhân khi đứng trong quán, không cài app.
Chủ xem bảng công và sửa giờ khi nhân viên quên bấm, cũng trên điện thoại, cũng không cài app.

**Trong phạm vi:** vào ca, ra ca, bảng công theo kỳ, chủ sửa giờ có audit, cảnh báo ca chưa đóng.

**Ngoài phạm vi (YAGNI):** tính lương, xin nghỉ, xếp lịch ca, chấm công GPS, selfie, nghỉ giữa ca,
đi trễ/vắng, chấm công nhiều chi nhánh.

**Thành công khi:** một ca làm bình thường đi từ vào ca đến bảng công của chủ mà không ai
phải mở Google Sheets, và mất internet không chặn được việc chấm công.

---

## 2. Kiến trúc — local-first

```
[Điện thoại nhân viên] --wifi quán--> [Mac Mini :5001 Flask]
                                          |
                                          |-- ghi ngay --> attendance.db (SQLite)
                                          |
                                          `-- worker nền --> GAS doPost --> Sheets ATTENDANCE
```

Nguồn ghi là SQLite tại quán. Sheets là bản sao để báo cáo và lưu trữ.
Chọn hướng này vì GAS đã có tiền sử 403 theo chu kỳ 7 ngày (`docs/system/offline-failover.md`)
và mạng quán có thể rớt; chấm công đứng đồng nghĩa với tranh cãi tiền lương.
Cùng pattern đã thắng ở in tem và thanh toán local-first (commit `170e0b3`).

Hai hướng đã loại:

- **GAS-first** (trang tĩnh gọi thẳng `doPost`): ít code nhất, nhưng phụ thuộc mạng + OAuth GAS.
- **Google Form + Sheets**: không viết code, nhưng mất realtime "ai đang trong ca", không chặn
  được bấm vào ca hai lần, chủ sửa giờ trên điện thoại rất cực.

---

## 3. Điều kiện tiên quyết

**IP tĩnh cho Mac Mini.** Hiện đang `192.168.1.19` nhưng chưa reserve trên router.
Phải đặt DHCP reservation **trước khi in QR sticker** — router cấp lại IP là QR chết,
cả quán mất đường chấm công.

Không dùng mDNS (`kissaten.local`) vì Android hỗ trợ không đồng đều.

**QR sticker phải in kèm dòng chữ nổi bật: "Bật Wifi quán trước khi quét".**
Quét bằng 4G thì `192.168.1.19` không tồn tại — trình duyệt xoay vô tận rồi báo lỗi khó hiểu,
nhân viên tưởng app hỏng. Dòng chữ này rẻ hơn mọi cách chữa phía phần mềm.

---

## 4. Giao diện

Một trang duy nhất: `web/cham-cong.html` + `web/cham-cong.js`, do `print_server.py` serve
theo đúng pattern `kds.html` (đọc live từ đĩa, header `Cache-Control: no-cache, must-revalidate`
để điện thoại luôn lấy bản mới).

**Vào app:** QR sticker dán quầy → `http://192.168.1.19:5001/cham-cong.html`.
Bookmark hoặc "Thêm vào màn hình chính" nếu muốn icon — vẫn không phải cài đặt.

### 4.1 Màn nhân viên

- Lưới nút to, mỗi nút một tên nhân viên (`active = TRUE` trong STAFF, cộng thêm người
  `active = FALSE` mà đang có ca chưa đóng — xem §9).
- Chạm tên → bàn phím số, 4 ô PIN. **Đủ 4 số là gửi luôn**, không có nút "Xác nhận".
- Server tự quyết vào hay ra (§7.1). Nhân viên chỉ thấy **một** hành động, không bấm nhầm được.
- Phản hồi chữ lớn: `✅ Vào ca 07:02 · chào Sương` hoặc `✅ Ra ca 15:40 · hôm nay 8h38p`.
- Hiện 3 giây rồi **tự xoá PIN, quay về lưới tên** — lúc giao ca có 2-3 người xếp hàng, người
  sau bấm được ngay không phải chạm thêm.
- Header: `Đang trong ca: 2` kèm chip tên. Poll `GET /attendance/today` mỗi 20 giây,
  **chỉ khi** `document.visibilityState === 'visible'` (tab ẩn thì ngừng, đỡ tốn pin).
- Mọi lỗi mạng (`fetch` reject, `navigator.onLine === false`) → banner đỏ chiếm hết đầu trang:
  `Mất kết nối máy quán — kiểm tra Wifi`. Không im lặng nuốt lỗi: nhân viên phải biết ngay
  là **chưa** chấm được.

### 4.2 Màn chủ

Nhập PIN của người `role = owner` trong STAFF → hiện thêm tab **Bảng công**.

- Chọn kỳ: Hôm nay / Tuần này / Tháng này / tuỳ chọn khoảng ngày.
- Bảng: `tên | số ca | tổng giờ`.
- Hàng đỏ = ca `UNCLOSED`. Chạm để nhập giờ ra thật + lý do.
- Nút **Thêm ca tay** cho trường hợp nhân viên quên bấm cả vào lẫn ra (§7).
- Mọi lần sửa hoặc thêm tay đều ghi `edited_by`, `edited_at`, `edit_note`, `source`.

**Không có giờ nào tự sinh.** Ca hở thì hở tới khi chủ nhập tay. Số liệu không bao giờ là số đoán.

### 4.3 Cảnh báo cuối ngày

Số liệu lấy từ **SQLite trên Mac Mini**, không lấy từ Sheets — Sheets có thể đang chờ sync,
báo cáo dựng từ đó sẽ thiếu giờ của người vừa bấm.

Đường đi: worker Python gom số liệu từ SQLite → dựng đoạn text → POST sang GAS route
`attendance_alert` → GAS gọi `sendTelegramAlert()` ([Notify.gs:5](../../../gas/Notify.gs)).
Không gửi thẳng Telegram từ Python: token nằm ở CONFIG sheet, guardrail `CLAUDE.md` cấm token
trong code. GAS chết thì mất tin cảnh báo — chấp nhận, đây không phải đường sống của việc chấm công.

Nội dung: tổng giờ từng người + danh sách ca chưa đóng.

---

## 5. Dữ liệu

### 5.1 SQLite — `print-server/attendance.db`

File riêng, không dùng chung `outbox.db` (khác vòng đời, khác backup, khác retention).
Một dòng cho một ca:

| cột | kiểu | ghi chú |
|---|---|---|
| `punch_id` | TEXT PK | `ATT-YYYYMMDD-HHMMSS-XXXXXXXX`, 8 hex ngẫu nhiên. 4 hex chỉ có 65.536 giá trị nên trùng rất sớm. Không dùng số thứ tự tăng dần — hai request cùng giây sẽ tranh nhau cùng một số. |
| `staff_id` | TEXT | khoá sang STAFF |
| `staff_name` | TEXT | snapshot lúc chấm, để đổi tên không làm sai lịch sử |
| `date` | TEXT | `YYYY-MM-DD` theo +07 |
| `clock_in_at` | TEXT | ISO +07 |
| `clock_out_at` | TEXT NULL | |
| `status` | TEXT | `OPEN` \| `CLOSED` \| `UNCLOSED` |
| `minutes_worked` | INTEGER NULL | tính lúc đóng ca |
| `source` | TEXT | `staff` \| `owner_manual` |
| `edited_by` | TEXT NULL | `staff_id` của chủ |
| `edited_at` | TEXT NULL | |
| `edit_note` | TEXT NULL | |
| `punch_in_nonce` | TEXT NULL | khoá chống trùng của lần bấm vào (§7.2) |
| `punch_out_nonce` | TEXT NULL | khoá chống trùng của lần bấm ra |
| `synced_at` | TEXT NULL | `NULL` = chờ đẩy lên Sheets |
| `created_at` | TEXT | |

Chuyển trạng thái: `OPEN → CLOSED` (nhân viên bấm ra) · `OPEN → UNCLOSED` (job quét sáng hôm sau)
· `UNCLOSED → CLOSED` (nhân viên bấm ra muộn, hoặc chủ sửa — cả hai đều ghi audit).

### 5.1.1 Job quét ca hở — chạy 04:00 sáng hôm sau, không chạy tối

Bản thiết kế đầu đặt job lúc `SHOP_CLOSE_TIME + 60 phút` (23:00). Sai, và sai kiểu nguy hiểm:

> Nhân viên làm ca tối 18:00–23:30. Lúc 23:00 job đổi ca họ thành `UNCLOSED`.
> 23:30 họ bấm Ra ca, server không thấy ca `OPEN` nào → **mở một ca mới**.
> Bảng công ra hai ca rác, giờ công sai.

Sửa hai vế, phải có đủ cả hai:

1. **Job quét chạy 04:00 sáng hôm sau**, đánh dấu `UNCLOSED` cho các ca `OPEN` có `clock_in_at`
   trước 04:00 hôm nay. Ca đêm 21:00–02:00 không bị đụng tới.
2. **Bấm ra ca khớp cả ca `UNCLOSED`**, không chỉ `OPEN`. Chỉ dời giờ job thôi không đủ: ca nào
   chạy qua mốc 04:00 vẫn dính đúng cái bẫy trên. Ca `UNCLOSED` được nhân viên tự đóng thì ghi
   `edit_note = 'nhân viên bấm ra muộn'`, giữ nguyên `source = staff`.

Phạm vi tìm ca để đóng là **24 giờ gần nhất tính theo `clock_in_at`**, không phải "cùng `date`".
Ca đêm vào 21:00 ngày 05 ra 02:00 ngày 06 mang `date = 05` trong khi hôm nay đã là 06 — lọc theo
`date = hôm nay` sẽ không thấy nó và lại mở ca mới, đúng cái bẫy đang chữa. Cửa sổ 24 giờ cũng
chặn việc một ca `UNCLOSED` từ tuần trước bị đóng nhầm bởi lần bấm hôm nay.

`SHOP_CLOSE_TIME` không còn dùng cho việc này. Bỏ khỏi thiết kế — không thêm CONFIG key thừa.

### 5.1.2 Giờ luôn do server cấp

`clock_in_at` và `clock_out_at` **luôn** sinh từ đồng hồ server (`_now_iso_server()`, +07 cố định).
Không bao giờ nhận mốc giờ từ điện thoại. Điện thoại lệch giờ, hoặc ai đó chỉnh giờ máy để ăn
gian, đều không ảnh hưởng — bảng công là căn cứ trả lương, nó không được phụ thuộc vào đồng hồ
của người được trả lương.

Ngoại lệ duy nhất: hai API của chủ (`/attendance/fix`, `/attendance/create_manual`) nhận mốc giờ
do chủ nhập tay, và mọi dòng đi qua đó đều mang dấu vết audit.

### 5.2 Sheets — tab `ATTENDANCE`

Cùng bộ cột. Upsert theo `punch_id`, không append trùng.
`ORDERS` append-only là quy tắc riêng của `ORDERS`; các tab khác (`CUSTOMERS`, `INVENTORY`)
đã update in-place từ trước, `ATTENDANCE` theo lệ đó. Audit của việc sửa nằm ngay trên dòng
(`edited_by` / `edited_at` / `edit_note`).

### 5.3 Sync

Worker nền đẩy các dòng `synced_at IS NULL` lên GAS, có retry.
Idempotent theo `punch_id` — chạy lại mười lần vẫn ra một dòng trên Sheets.

---

## 6. PIN và bảo mật

PIN gốc nằm ở cột `pin` của sheet STAFF. Mất mạng thì không đọc Sheets được, nên server giữ
cache nhân viên trên đĩa.

**Bắt buộc:**

- Cache lưu PIN đã băm **SHA-256 + salt riêng của máy**. Không ghi PIN thô xuống đĩa, không ghi
  PIN vào log, không trả PIN qua bất kỳ response nào.
- File cache đặt quyền `600`. (Repo từng có lỗ creds `644` — đã vá, đừng lặp lại.)
- Cache làm mới sau mỗi lần sync STAFF thành công.

### 6.1 Chống dò PIN — hai tầng

PIN 4 số chỉ có 10.000 tổ hợp, dò hết trong vài giây nếu để tự do. Đếm toàn bộ ở phía server:

1. **Theo `staff_id`:** sai 5 lần trong 1 phút → khoá `staff_id` đó 5 phút.
2. **Theo IP:** sai tổng cộng 15 lần trong 1 phút trên **bất kỳ** nhân viên nào → khoá IP đó
   10 phút.

Chỉ có tầng 1 là thủng: script chạy vòng `staff_id` (thử `1234` cho từng người, rồi `1235`...)
không bao giờ chạm ngưỡng 5-lần-một-người, mà vẫn bắn được vài trăm lần một phút.

IP không phải rào chắn tuyệt đối — máy trong LAN tự đổi IP được. Nên thêm tầng phát hiện:
tổng số lần sai toàn hệ thống vượt 30 trong 1 phút → bắn Telegram cho chủ. Chặn thì chỉ làm
chậm, biết mới xử được.

### 6.2 Phiên của chủ — cấp token, không giữ PIN

Chủ nhập PIN đúng → server sinh token phiên ngẫu nhiên (32 byte, `secrets.token_urlsafe`),
giữ trong bộ nhớ server, **TTL 15 phút**. Client giữ token trong `sessionStorage` (tự mất khi
đóng tab), gửi kèm header `X-Owner-Session` ở mọi API của chủ.

**Không lưu PIN vào `sessionStorage` hay `localStorage`.** PIN đặt trong web storage là PIN bất
kỳ script nào chạy trên trang cũng đọc được, và nó dùng lại được vô hạn cho tới khi chủ đổi tay.
Token lộ thì chỉ lộ 15 phút. Chênh lệch thiệt hại là lý do duy nhất cần cân nhắc ở đây.

Frontend tự về màn nhân viên sau **10 phút không thao tác** (không phải 5 — chủ soi bảng công
tháng ngồi đọc quá 5 phút là chuyện thường, đá ra giữa chừng chỉ làm chủ ngại dùng).

### 6.3 Mức bảo vệ này đủ vì

Server chỉ nghe trong LAN quán, và dữ liệu là giờ công — không đụng tiền, không đụng đơn hàng,
không đụng thông tin khách. Rủi ro còn lại là nhân viên biết PIN của nhau chấm hộ, nhưng chỉ hộ
được khi đang đứng trong quán; chủ chấp nhận rủi ro này.

---

## 7. API

Tất cả trên `print_server.py`, LAN-only.

| method | path | mô tả |
|---|---|---|
| `GET` | `/cham-cong.html` | serve trang, no-cache |
| `GET` | `/attendance/staff` | danh sách nhân viên hiện được (§9) — không kèm PIN, không kèm hash |
| `POST` | `/attendance/punch` | `{staff_id, pin, nonce, confirm_quick_out?}` → server quyết vào/ra |
| `GET` | `/attendance/today` | ai đang trong ca + ca hôm nay |
| `POST` | `/attendance/owner_login` | `{pin}` → `{session_token, expires_at}` |
| `GET` | `/attendance/report?from=&to=` | bảng công — cần `X-Owner-Session` |
| `POST` | `/attendance/fix` | `{punch_id, clock_in_at?, clock_out_at?, note}` — cần `X-Owner-Session` |
| `POST` | `/attendance/create_manual` | `{staff_id, clock_in_at, clock_out_at, note}` — cần `X-Owner-Session` |

PIN và token **không bao giờ** đặt trong query string (query string lọt vào access log và lịch sử
trình duyệt). PIN đi trong body POST, token đi trong header `X-Owner-Session`; chỉ `from`/`to`
mới nằm ở query.

### 7.1 `/attendance/punch` quyết vào hay ra

Lấy ca gần nhất của `staff_id` có `status IN (OPEN, UNCLOSED)` và `clock_in_at` trong **24 giờ
gần nhất** (§5.1.1). Có thì **ra ca** (`UNCLOSED` thì ghi thêm `edit_note`), không có thì **vào ca**.

### 7.2 Chống bấm trùng

Hai nguyên nhân khác nhau, cần hai cơ chế khác nhau:

**Request lặp** (mạng lag, client tự retry, chạm đúp): client sinh `nonce` ngẫu nhiên **một lần
cho một lần chạm**, gửi kèm. Server lưu nonce vào `punch_in_nonce` / `punch_out_nonce`. Gặp lại
nonce đã có → trả về **kết quả của lần gốc** (`đã vào ca 07:00`), không tạo gì mới.

Ở đây `nonce` hơn hẳn việc chỉ chặn theo thời gian: khi request đầu thành công nhưng client hết
giờ chờ, cách chặn-theo-thời-gian trả về *lỗi* trong khi ca **đã** mở — nhân viên tưởng hỏng,
bấm lại, rối thêm. Repo đã dùng đúng ý này cho đơn hàng (`idempotency_key`, `gas/Code.gs:797`).

**Ra ca quá sớm** (chạm nhầm người, đổi ý): bấm ra khi ca mới mở dưới 3 phút → server trả
`QUICK_PUNCH_CONFIRM`, chưa đóng ca. Frontend hỏi lại `Mới vào ca 2 phút trước. Ra ca luôn?`.
Chỉ khi client gửi `confirm_quick_out: true` mới đóng.

Không chặn cứng: có lúc nhân viên chấm nhầm tên đồng nghiệp và cần đóng lại ngay.

### 7.3 GAS

`gas/Attendance.gs`: `ensureAttendanceSheet()` · `attendanceUpsert(payload)` ·
`attendanceAlert(payload)` (nhận text từ worker, gọi `sendTelegramAlert`).
Đăng ký route trong `gas/Code.gs` với `auth: AUTH.STAFF`.

---

## 8. Ranh giới module

- `attendance_store.py` — chỉ đụng SQLite. Vào ca, ra ca, truy vấn, sửa. Không biết HTTP, không
  biết Sheets. Test được độc lập với một file db tạm.
- `attendance_sync.py` — chỉ đẩy dòng chưa sync lên GAS + làm mới cache STAFF. Không biết HTTP
  route, không tự quyết nghiệp vụ.
- Route trong `print_server.py` — chỉ parse request, kiểm PIN, gọi store, trả JSON.
- `cham-cong.js` — chỉ vẽ UI và gọi API.

Kiểm tra ranh giới: đổi ruột `attendance_store.py` sang Postgres thì route không phải sửa;
tắt hẳn sync thì chấm công vẫn chạy.

---

## 9. Xử lý lỗi

| tình huống | hành vi |
|---|---|
| PIN sai | thông báo chung "PIN không đúng", không tiết lộ tên có tồn tại hay không |
| Sai PIN quá 5 lần/phút / cùng người | khoá `staff_id` 5 phút, hiện đếm ngược |
| Sai PIN quá 15 lần/phút / cùng IP | khoá IP 10 phút |
| Sai PIN quá 30 lần/phút toàn hệ thống | Telegram cho chủ |
| Bấm vào ca khi đã có ca `OPEN` | không tạo ca mới — hiểu là ra ca |
| Bấm lại cùng `nonce` | trả kết quả lần gốc, không tạo gì mới |
| Bấm ra ca dưới 3 phút sau khi vào | `QUICK_PUNCH_CONFIRM`, chờ `confirm_quick_out` |
| Ca `UNCLOSED` mà nhân viên bấm ra | đóng ca đó, ghi `edit_note = 'nhân viên bấm ra muộn'` |
| Điện thoại lệch giờ | không ảnh hưởng — mốc giờ do server cấp (§5.1.2) |
| Nhân viên nghỉ việc (`active = FALSE`) còn ca chưa đóng | vẫn hiện trên lưới tên và **bấm ra được**; chỉ chặn vào ca mới. Không thì ca treo vĩnh viễn, chủ phải sửa tay |
| Chủ đổi PIN nhân viên trên sheet STAFF | có hiệu lực sau lần sync STAFF kế tiếp; PIN cũ còn dùng được tới lúc đó |
| Token phiên chủ hết hạn giữa chừng | trả `401`, frontend hiện lại ô nhập PIN, không mất bộ lọc đang chọn |
| GAS chết / mất mạng | chấm vẫn thành công, dòng nằm chờ `synced_at IS NULL` |
| Mac Mini chết | không chấm được — fallback giấy, ghi vào SOP `docs/system/offline-failover.md` |
| Đổi ngày lúc nửa đêm | ca thuộc `date` của `clock_in_at`, không tách đôi |

---

## 10. Test

Theo pattern `print-server/test_*.py` sẵn có (pytest).

`test_attendance_store.py`
- vào ca rồi ra ca, `minutes_worked` đúng
- bấm hai lần liên tiếp không tạo hai ca `OPEN`
- ca `UNCLOSED` không cộng vào tổng giờ
- chủ sửa giờ ra → `status` thành `CLOSED`, ghi đủ `edited_by`/`edited_at`/`edit_note`
- chủ tạo ca tay → dòng mới có `source = owner_manual` + đủ audit
- ca vào lúc 23:50 thuộc về ngày vào, không bị cắt lúc nửa đêm
- **ca đêm 21:00–02:00: job 04:00 không đụng tới, bấm ra lúc 02:00 đóng đúng ca cũ**
- **ca đã `UNCLOSED`: bấm ra vẫn đóng ca đó, không mở ca mới** (hồi quy của bug §5.1.1)
- 1000 lần sinh `punch_id` liên tiếp không trùng nhau

`test_attendance_routes.py`
- PIN sai trả lỗi chung, không lộ thông tin
- rate limit theo `staff_id` bật sau 5 lần sai, mở lại sau 5 phút
- rate limit theo IP bật sau 15 lần sai rải trên nhiều `staff_id` (script xoay vòng)
- gửi lại cùng `nonce` trả đúng kết quả lần gốc, DB không thêm dòng
- bấm ra sau 1 phút → `QUICK_PUNCH_CONFIRM`; gửi lại kèm `confirm_quick_out` → đóng ca
- `/attendance/report` từ chối khi thiếu `X-Owner-Session`
- token phiên chủ hết hạn sau TTL → `401`
- PIN nhân viên thường không mở được API của chủ
- `/attendance/staff` không bao giờ trả về PIN hay hash
- server bỏ qua `clock_in_at` nếu client cố gửi kèm ở `/attendance/punch`
- nhân viên `active = FALSE` còn ca mở: bấm ra được, bấm vào ca mới bị từ chối

`test_attendance_sync.py`
- chỉ đẩy dòng `synced_at IS NULL`
- gọi lại hai lần cùng `punch_id` không sinh hai dòng Sheets
- GAS lỗi → dòng vẫn ở trạng thái chờ, retry lần sau
- cache STAFF ghi ra đĩa ở quyền `600`, không chứa PIN thô
- job 04:00 chỉ đánh dấu `UNCLOSED` cho ca vào trước 04:00 hôm nay
- text cảnh báo cuối ngày dựng từ SQLite, khớp số liệu kể cả khi Sheets đang lag

---

## 11. File

**Mới:** `print-server/attendance_store.py` · `print-server/attendance_sync.py` ·
`print-server/test_attendance_store.py` · `print-server/test_attendance_routes.py` ·
`print-server/test_attendance_sync.py` · `web/cham-cong.html` · `web/cham-cong.js` ·
`gas/Attendance.gs` · `docs/system/attendance.md`

**Sửa:** `print-server/print_server.py` (8 route) · `gas/Code.gs` (đăng ký route) ·
`docs/system/sheets-schema.md` (tab ATTENDANCE) · `docs/system/offline-failover.md` (SOP giấy khi
Mac Mini chết) · `CLAUDE.md` (thêm dòng index)

Job 04:00 và cảnh báo cuối ngày chạy trong `attendance_sync.py` trên Mac Mini (launchd, cùng
pattern `com.lamha.kissaten.printpoller.plist`), **không** thêm trigger GAS.

---

## 12. Nhật ký thay đổi

**2026-08-05 — vòng review của Antigravity.** Nhận: job quét ca hở dời sang 04:00 + bấm ra khớp
ca `UNCLOSED` (§5.1.1, bug thật) · API tạo ca tay (§7) · IP rate limit (§6.1) · cảnh báo wifi trên
QR (§3) · auto-submit / auto-reset / poll 20s (§4.1) · `punch_id` dùng hex ngẫu nhiên (§5.1) ·
cảnh báo cuối ngày dựng từ SQLite (§4.3).

Nhận vấn đề nhưng đổi cách chữa:

- **Chống bấm trùng:** đề xuất gốc là chặn cứng 3 phút. Giữ mốc 3 phút làm bước xác nhận, nhưng
  thêm `nonce` — chặn-theo-thời-gian trả *lỗi* cho một request đã thành công, `nonce` trả đúng
  kết quả gốc (§7.2).
- **Phiên của chủ:** đề xuất gốc là lưu `owner_pin` vào `sessionStorage`. Thay bằng token phiên
  TTL 15 phút; PIN không bao giờ vào web storage (§6.2). Timeout để 10 phút thay vì 5.
- **Telegram:** worker Python không gửi thẳng được — token nằm ở CONFIG sheet, guardrail cấm token
  trong code. Worker dựng text từ SQLite rồi nhờ GAS gửi (§4.3).

Tự bổ sung, ngoài phạm vi review: mốc giờ luôn do server cấp (§5.1.2) · nhân viên `active = FALSE`
còn ca mở vẫn bấm ra được (§9).
