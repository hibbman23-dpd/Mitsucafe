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

---

## 4. Giao diện

Một trang duy nhất: `web/cham-cong.html` + `web/cham-cong.js`, do `print_server.py` serve
theo đúng pattern `kds.html` (đọc live từ đĩa, header `Cache-Control: no-cache, must-revalidate`
để điện thoại luôn lấy bản mới).

**Vào app:** QR sticker dán quầy → `http://192.168.1.19:5001/cham-cong.html`.
Bookmark hoặc "Thêm vào màn hình chính" nếu muốn icon — vẫn không phải cài đặt.

### 4.1 Màn nhân viên

- Lưới nút to, mỗi nút một tên nhân viên (`active = TRUE` trong STAFF).
- Chạm tên → bàn phím số, 4 ô PIN.
- Server tự quyết vào hay ra: đang có ca `OPEN` thì đây là ra ca, không có thì là vào ca.
  Nhân viên chỉ thấy **một** hành động, không bấm nhầm được.
- Phản hồi chữ lớn: `✅ Vào ca 07:02 · chào Sương` hoặc `✅ Ra ca 15:40 · hôm nay 8h38p`.
- Header: `Đang trong ca: 2` kèm chip tên.

### 4.2 Màn chủ

Nhập PIN của người `role = owner` trong STAFF → hiện thêm tab **Bảng công**.

- Chọn kỳ: Hôm nay / Tuần này / Tháng này / tuỳ chọn khoảng ngày.
- Bảng: `tên | số ca | tổng giờ`.
- Hàng đỏ = ca `UNCLOSED`. Chạm để nhập giờ ra thật + lý do.
- Mọi lần sửa ghi `edited_by`, `edited_at`, `edit_note`.

**Không có giờ nào tự sinh.** Ca hở thì hở tới khi chủ nhập tay. Số liệu không bao giờ là số đoán.

### 4.3 Cảnh báo

Cuối ngày gửi Telegram qua `sendTelegramAlert()` sẵn có: tổng giờ từng người + danh sách ca
chưa đóng. Đi kèm cron 15 phút hiện có trong `gas/OpsTriggers.gs`, không tạo trigger giờ cố định
(vi phạm guardrail trong `CLAUDE.md`).

---

## 5. Dữ liệu

### 5.1 SQLite — `print-server/attendance.db`

File riêng, không dùng chung `outbox.db` (khác vòng đời, khác backup, khác retention).
Một dòng cho một ca:

| cột | kiểu | ghi chú |
|---|---|---|
| `punch_id` | TEXT PK | `ATT-YYYYMMDD-XXXX` |
| `staff_id` | TEXT | khoá sang STAFF |
| `staff_name` | TEXT | snapshot lúc chấm, để đổi tên không làm sai lịch sử |
| `date` | TEXT | `YYYY-MM-DD` theo +07 |
| `clock_in_at` | TEXT | ISO +07 |
| `clock_out_at` | TEXT NULL | |
| `status` | TEXT | `OPEN` \| `CLOSED` \| `UNCLOSED` |
| `minutes_worked` | INTEGER NULL | tính lúc đóng ca |
| `edited_by` | TEXT NULL | `staff_id` của chủ |
| `edited_at` | TEXT NULL | |
| `edit_note` | TEXT NULL | |
| `synced_at` | TEXT NULL | `NULL` = chờ đẩy lên Sheets |
| `created_at` | TEXT | |

Chuyển trạng thái: `OPEN → CLOSED` (nhân viên bấm ra) · `OPEN → UNCLOSED` (job cuối ngày quét
ca còn mở sau giờ đóng quán) · `UNCLOSED → CLOSED` (chủ sửa, kèm audit).

Giờ đóng quán đọc từ CONFIG key `SHOP_CLOSE_TIME` (định dạng `HH:MM`, mặc định `22:00` nếu
thiếu). Job quét chạy sau mốc đó 60 phút. Giá trị này chỉ dùng để **đánh dấu** ca là `UNCLOSED`,
không bao giờ dùng làm giờ ra.

Mọi mốc thời gian dùng +07 cố định, theo đúng `_now_iso_server()` trong `print_server.py`.

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

**Chống dò PIN:** PIN 4 số chỉ có 10.000 tổ hợp, dò hết trong vài giây nếu để tự do.
Sai 5 lần trong 1 phút với cùng `staff_id` → khoá `staff_id` đó 5 phút. Đếm ở phía server.

**Mức bảo vệ này đủ vì:** server chỉ nghe trong LAN quán, và dữ liệu là giờ công — không đụng
tiền, không đụng đơn hàng, không đụng thông tin khách. Rủi ro còn lại là nhân viên biết PIN của
nhau chấm hộ, nhưng chỉ hộ được khi đang đứng trong quán; chủ chấp nhận rủi ro này.

---

## 7. API

Tất cả trên `print_server.py`, LAN-only.

| method | path | mô tả |
|---|---|---|
| `GET` | `/cham-cong.html` | serve trang, no-cache |
| `GET` | `/attendance/staff` | danh sách nhân viên `active` (id, tên, role) — không kèm PIN |
| `POST` | `/attendance/punch` | `{staff_id, pin}` → server quyết vào/ra, trả `{action, at, minutes}` |
| `GET` | `/attendance/today` | ai đang trong ca + ca hôm nay |
| `GET` | `/attendance/report?from=&to=` | bảng công, cần PIN chủ |
| `POST` | `/attendance/fix` | `{punch_id, clock_in_at?, clock_out_at?, note, owner_pin}` |

PIN chủ gửi trong body POST hoặc header `X-Owner-Pin` — **không bao giờ** đặt trong query string
(query string lọt vào access log và lịch sử trình duyệt). Vì vậy `/attendance/report` nhận PIN
qua header, các tham số `from`/`to` mới nằm ở query.

GAS thêm `gas/Attendance.gs`: `ensureAttendanceSheet()` + `attendanceUpsert(payload)`,
đăng ký route trong `gas/Code.gs` với `auth: AUTH.STAFF`.

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
| Sai PIN quá 5 lần/phút | khoá `staff_id` 5 phút, hiện đếm ngược |
| Bấm vào ca khi đã có ca `OPEN` | không tạo ca mới — hiểu là ra ca |
| Bấm ra ca ngay sau khi vào (<1 phút) | hỏi xác nhận trước khi đóng, tránh chạm nhầm |
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
- ca vào lúc 23:50 thuộc về ngày vào, không bị cắt lúc nửa đêm

`test_attendance_routes.py`
- PIN sai trả lỗi chung, không lộ thông tin
- rate limit bật sau 5 lần sai, mở lại sau 5 phút
- `/attendance/report` từ chối khi không có PIN chủ
- `/attendance/staff` không bao giờ trả về PIN hay hash

`test_attendance_sync.py`
- chỉ đẩy dòng `synced_at IS NULL`
- gọi lại hai lần cùng `punch_id` không sinh hai dòng Sheets
- GAS lỗi → dòng vẫn ở trạng thái chờ, retry lần sau
- cache STAFF ghi ra đĩa ở quyền `600`, không chứa PIN thô

---

## 11. File

**Mới:** `print-server/attendance_store.py` · `print-server/attendance_sync.py` ·
`print-server/test_attendance_store.py` · `print-server/test_attendance_routes.py` ·
`print-server/test_attendance_sync.py` · `web/cham-cong.html` · `web/cham-cong.js` ·
`gas/Attendance.gs` · `docs/system/attendance.md`

**Sửa:** `print-server/print_server.py` (6 route) · `gas/Code.gs` (đăng ký route) ·
`gas/OpsTriggers.gs` (cảnh báo Telegram) · `docs/system/sheets-schema.md` (tab ATTENDANCE) ·
`CLAUDE.md` (thêm dòng index)
