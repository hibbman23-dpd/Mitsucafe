# Chấm công nhân viên (LAN)

> Tách từ CLAUDE.md §0. Index: ../../CLAUDE.md · Đọc khi sửa attendance_store/auth/sync, tab ATTENDANCE, hoặc trang cham-cong.
> Spec gốc: `docs/superpowers/specs/2026-08-05-cham-cong-design.md` — vài chi tiết đã đổi khi build, file này mô tả bản THẬT đang chạy.

## Luồng

```
[Điện thoại nhân viên] --wifi quán--> [Mac Mini :5001 Flask]
                                          |-- ghi ngay --> attendance.db (SQLite)
                                          `-- worker 30s --> GAS --> sheet ATTENDANCE
```

Nguồn ghi là SQLite tại quán (`print-server/attendance.db`, **RIÊNG** với `outbox.db` —
outbox có `purge_synced(days=7)`, còn bảng công là căn cứ trả lương phải giữ nhiều tháng,
không được gộp chung). Sheet ATTENDANCE là bản sao để báo cáo. Mất mạng vẫn chấm công được.

## Vào app

`http://192.168.1.19:5001/cham-cong.html` — QR sticker dán quầy.
IP phải là DHCP reservation trên router; router cấp lại IP là QR chết.

## Trạng thái ca

Bốn trạng thái, không phải ba:

| trạng thái | nghĩa |
|---|---|
| `OPEN` | đang trong ca |
| `CLOSED` | xong, đã biết số giờ |
| `UNCLOSED` | job quét 04:00 gắn cờ, nhân viên **chưa** nói gì |
| `AWAIT_OWNER` | nhân viên **đã** xác nhận ca đó kết thúc, chờ chủ nhập giờ |

| từ | sang | ai |
|---|---|---|
| — | `OPEN` | nhân viên bấm vào ca |
| `OPEN` | `CLOSED` | nhân viên bấm ra ca |
| `OPEN` | `UNCLOSED` | job quét 04:00 |
| `UNCLOSED` | `AWAIT_OWNER` | nhân viên chọn "Ra ca hôm qua" |
| `UNCLOSED` / `AWAIT_OWNER` | `CLOSED` | chủ nhập giờ ra |

### Vì sao cần `AWAIT_OWNER` — đừng gộp lại thành ba

Khi ca hôm trước bị gắn cờ `UNCLOSED`, nhân viên chạm tên thì server **không đoán**: nó hỏi
"Ra ca hôm qua" hay "Vào ca mới". Chọn "Ra ca hôm qua" thì server ghi nhận nhưng **không bịa
giờ ra** — chủ nhập.

Bản đầu để nguyên `UNCLOSED` sau khi xác nhận. Hỏng hai đường, cả hai đều làm trả lương sai:

1. Ca đó vẫn bị truy vấn tìm-ca khớp lại, nên chiều hôm đó nhân viên tới làm ca mới thì **bị hỏi
   lại y hệt câu cũ**; xác nhận lần nữa là không có ca nào mở, họ làm nguyên ca chiều mà hệ
   thống không ghi gì.
2. Xác nhận sau khi ca đã quá cửa sổ 24 giờ thì rơi xuống nhánh mở ca mới — server **mở một ca
   lúc đó**, màn hình báo "✅ Vào ca". Sáng sau job quét gắn cờ ca ma đó, chủ nhập giờ và trả
   tiền cho việc không ai làm.

`AWAIT_OWNER` cắt cả hai: truy vấn tìm-ca không khớp nó nữa (nhân viên vào ca mới bình thường),
job quét không đụng nó, nhưng nó **vẫn nằm trong danh sách "ca chưa đóng"** của chủ vì tiền
công đó vẫn còn nợ. Tổng giờ (`by_staff`) chỉ đếm `CLOSED`, nên không bao giờ có giờ ma.

Đồng hồ máy bị chỉnh lùi cũng cho ra `AWAIT_OWNER` chứ không phải `CLOSED` 0 phút — cùng
nguyên tắc: máy không đoán, đưa chủ quyết.

## Job quét chạy 04:00 sáng — đừng đổi về buổi tối

Bản thiết kế đầu đặt job lúc đóng quán + 60 phút (từng có `SHOP_CLOSE_TIME`; ý tưởng đó đã
bị bỏ khi build, đừng thêm lại). Sai ở chỗ: ca tối 18:00–23:30 sẽ bị đánh dấu `UNCLOSED` lúc
quán vừa đóng cửa — tức là **giữa lúc nhân viên vẫn đang làm việc, chưa kịp bấm ra**. Rồi
23:30 nhân viên bấm ra ca thật, nhưng nếu logic đóng ca chỉ tìm ca `OPEN` thì nó không thấy gì
(ca đã bị đổi sang `UNCLOSED`) và **mở luôn một ca mới** — bảng công ra hai ca rác cho một ca
làm việc thật.

Cách chữa có hai vế, cả hai đều bắt buộc, gỡ một vế là tái phát bug:

1. **Job quét chạy lúc 04:00 sáng hôm sau**, không phải giờ đóng quán. Ca đêm dài nhất của
   quán cũng đã kết thúc từ lâu trước 04:00, nên tại thời điểm quét không còn ca thật nào
   đang mở nữa — chỉ còn ca bị bỏ quên thật sự. (`AttendanceStore.sweep_unclosed`,
   `print-server/attendance_store.py`.)
2. **Khi bấm ra ca, tìm ca để đóng theo cửa sổ 24 giờ trên `clock_in_at`**, không lọc theo
   cột `date`. Ca vào lúc 21:00 ngày 05 và ra lúc 02:00 ngày 06 mang `date = 05`, nhưng lúc
   bấm ra thì "hôm nay" đã là 06 — lọc theo `date` sẽ không tìm thấy ca đó nữa và lại mở ca
   mới. Cửa sổ 24h theo giờ vào ca né được lỗi này, đồng thời tự nhiên chặn luôn việc một ca
   `UNCLOSED` từ nhiều ngày trước bị đóng nhầm bởi một lượt bấm không liên quan.
   (`AttendanceStore._open_shift`, cùng file.)

Nếu sau này có ai đọc riêng "job chạy 04:00" và nghĩ "sao không chạy ngay lúc đóng quán cho
gọn" — đây chính là lý do đã thử và đã rớt. Đừng "tối ưu" lại nó.

Marker `last_daily_run` (bảng `attendance_meta`, key duy nhất) ghi xuống SQLite chứ không giữ
trong biến RAM: `print_server.py` restart thường xuyên (mỗi lần đổi code cần
`launchctl kickstart -k`), nếu chỉ giữ trong RAM thì restart sau 04:00 sẽ chạy lại job và gửi
trùng cảnh báo Telegram cuối ngày cho chủ lần thứ hai.

## API — 9 route

| method | path | ghi chú |
|---|---|---|
| `GET` | `/cham-cong.html` | serve trang chấm công (static, `WEB_DIR`) |
| `GET` | `/cham-cong.js` | serve script trang (static, `WEB_DIR`) |
| `GET` | `/attendance/staff` | danh sách nhân viên hiện được bấm — không trả PIN, không trả hash |
| `POST` | `/attendance/punch` | `{staff_id, pin, nonce, confirm_quick_out?}` — server tự quyết vào/ra |
| `GET` | `/attendance/today` | ai đang trong ca (chỉ status `OPEN`) |
| `POST` | `/attendance/owner_login` | `{staff_id, pin}` → `{session_token, expires_at}`, TTL 15 phút |
| `GET` | `/attendance/report?from=&to=` | cần header `X-Owner-Session` |
| `POST` | `/attendance/fix` | cần header `X-Owner-Session` — sửa giờ vào/ra một ca |
| `POST` | `/attendance/create_manual` | cần header `X-Owner-Session` — tạo ca tay (chấm giấy) |

```bash
curl -s localhost:5001/attendance/today | python3 -m json.tool
```

```bash
curl -s -X POST localhost:5001/attendance/punch -H 'Content-Type: application/json' \
  -d '{"staff_id":"S001","pin":"1234","nonce":"test-1"}'
```

### Phiên của chủ — token, không phải PIN mỗi request

`/attendance/report`, `/attendance/fix`, `/attendance/create_manual` **không** nhận PIN trực
tiếp. Chủ gọi `/attendance/owner_login` một lần bằng `{staff_id, pin}`, nhận về
`session_token` sống 15 phút (`OwnerSessions`, `print-server/attendance_auth.py`), rồi gắn
token đó vào header `X-Owner-Session` cho các lần gọi sau. PIN không bao giờ rời server sau
bước login; lộ token chỉ lộ trong 15 phút TTL, không lộ PIN gốc.

### Chống dò PIN — 2 tầng + báo chủ

`RateLimiter` áp cho cả `staff_id` (5 lần sai/phút) và IP (15 lần sai/phút, chặn script xoay
`staff_id`). Vượt 30 lần sai/phút toàn hệ thống → bắn Telegram cảnh báo cho chủ qua GAS relay.
Mọi kiểu sai (PIN sai, staff_id không tồn tại, nhân viên inactive) trả cùng một thông báo
chung "PIN không đúng" — không tiết lộ tên nào có tồn tại.

## `punch_id`

Định dạng thật: `ATT-YYYYMMDD-HHMMSS-XXXXXXXX` — **8 ký tự hex** (`secrets.token_hex(4)`),
không phải 4 như một số bản nháp đầu ghi. Sinh trong `attendance_store.new_punch_id()`.

## Bảng SQLite `attendance` — có 3 cột nội bộ KHÔNG lên Sheets

Ngoài các cột đồng bộ với tab ATTENDANCE (xem `docs/system/sheets-schema.md`), bảng SQLite
còn giữ:

- `punch_in_nonce`, `punch_out_nonce` — chống double-submit khi điện thoại gửi lại request
  (mất mạng giữa chừng, người dùng bấm 2 lần). Có unique index riêng cho mỗi cột.
- `synced_at` — NULL nghĩa là dòng chưa đẩy lên Sheets; worker 30s lọc theo cột này.

Cả ba đều là chi tiết vận hành nội bộ của Mac Mini, không có ý nghĩa gì phía báo cáo, nên
`AttendanceSync.push_once()` chủ động loại bỏ chúng khỏi payload trước khi gửi GAS — payload
lên Sheets khớp đúng `ATTENDANCE_HEADERS` trong `gas/Attendance.gs`, không hơn không kém.

## Bảng SQLite `attendance_meta`

Bảng key-value một cột `key`/`value`, hiện chỉ giữ marker `last_daily_run` (xem mục job quét
04:00 ở trên). Tồn tại vì lý do bền vững qua restart — không được thay bằng biến toàn cục
trong process Flask.

## Đổi PIN nhân viên

Sửa cột `pin` trên sheet STAFF. Có hiệu lực sau tối đa 10 phút (chu kỳ `refresh_staff()` của
`AttendanceSync`, chạy trong vòng lặp nền `_attendance_loop`). PIN thô không bao giờ nằm trên
đĩa Mac Mini — chỉ có SHA-256 + salt riêng của máy trong `staff_cache.json` (quyền `0600`).

> ## ⚠️ Cột `pin` trên sheet STAFF PHẢI để định dạng TEXT, không phải Number
>
> Google Sheets tự động cắt số 0 ở đầu khi cột là định dạng Number/Automatic: PIN `0345` bị
> lưu thành `345`. Từ lúc đó hash không còn khớp nữa và nhân viên đó bị khoá khỏi máy chấm
> công — không có thông báo lỗi nào giải thích tại sao, vì `/attendance/punch` cố tình trả
> lỗi chung "PIN không đúng" cho mọi trường hợp sai (xem mục chống dò PIN ở trên).
>
> Khi tạo hoặc sửa cột `pin` trên sheet STAFF: chọn cột → **Format → Number → Plain text**
> (hoặc gõ PIN có dấu `'` ở đầu, ví dụ `'0345`) TRƯỚC khi nhập bất kỳ PIN nào có số 0 đứng đầu.

## Mac Mini chết

Nhân viên ghi giờ vào/ra ra giấy. Máy sống lại, chủ mở tab Bảng công → **Thêm ca tay**
(`POST /attendance/create_manual`), nhập từng ca, ghi `note = "chấm giấy <ngày>"`.
Xem thêm `offline-failover.md`.

## Test

Chạy từ `print-server/`, chỉ 4 file attendance, **không bao giờ** `unittest discover`:

```bash
PRINT_ENGINE=noop ATTENDANCE_DB=/tmp/att.db ATTENDANCE_STAFF_CACHE=/tmp/att.json \
  python3 -m unittest test_attendance_store test_attendance_auth test_attendance_routes test_attendance_sync
```

> ## ⚠️ CẤM chạy `python3 -m unittest discover` trong `print-server/`
>
> `test_routes_spool.py` set `PRINT_ENGINE=legacy` ngay lúc import module — đè lên bất kỳ biến
> môi trường nào truyền từ ngoài vào — và `test_routes.py` gọi `lpr` **không mock**. Chạy
> `discover` (hoặc bất kỳ cách nào load toàn bộ test suite của `print-server/`) nghĩa là suite
> in thẳng ra máy in nhiệt thật của quán. Chuyện này đã xảy ra **hai lần**; lần gần nhất bơm
> 47 job rác vào máy in giữa ca phục vụ khách. Luôn liệt kê đích danh 4 file attendance như
> lệnh ở trên — không dùng `discover`, không dùng pytest (máy chưa cài).
