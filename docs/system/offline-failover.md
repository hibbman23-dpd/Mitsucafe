# Offline & Failover (4 cấp)
> Tách từ CLAUDE.md §10. Index: ../../CLAUDE.md · Đọc khi xử lý SOP mất mạng / Mac crash / cúp điện.

## L1 — Mất mạng < 5 phút
```
Trigger: Router reset, chập chờn
Action:  Glide cache offline · Mac Mini queue in local · GAS auto-sync khi về
Fix:     Tự động — không cần can thiệp
```

## L2 — Mất mạng > 5 phút
```
Trigger: Cúp mạng, ISP lỗi
Action:  Chrome Form cache nhận đơn nội bộ
         In tem qua LAN (internet down nhưng LAN vẫn OK)
         Ghi tay giấy A5 nếu cần
Fix:     Sync Chrome Form → Sheets khi mạng về (< 5 phút)
```

## L3 — Mac Mini crash
```
Trigger: macOS crash, quá nhiệt
Action:  Tablet KDS thành thiết bị chính tạm
         In tem từ máy in cắm trực tiếp tablet (USB OTG)
         GAS vẫn online nếu mạng ổn (GAS = Google Cloud)
Fix:     Mac Mini auto-restart < 2 phút
Phòng:   Tắt auto-update macOS · Bật auto-restart after power failure
Long:    RPi 3+ thay Mac Mini (không bao giờ tự update)
```

## L4 — Cúp điện
```
Trigger: Mất điện hoàn toàn
Action:  Pin dự phòng cho tablet · Form giấy A5 laminated
         Gọi điện báo khách delivery đang chờ
Fix:     Nhập lại Sheets thủ công khi có điện
```

## L5 — GAS chết 403 (mạng SỐNG nhưng API bị Google chặn)
```
Trigger: KDS hiện "Google chặn API (GAS)" · đặt hàng online báo lỗi · tem không in
         (đã xảy ra 2026-07-02 và ~2026-07-10 — chu kỳ 7 ngày)
Gốc rễ:  Script gắn GCP project chuẩn (bật cho GBP/Analytics 2026-06-20) mà
         OAuth consent screen ở "Testing". Với OAuth external dùng scope không cơ bản,
         refresh token có hạn 7 ngày; grant owner của web app hết hạn → mọi request
         ẩn danh ăn trang 403 HTML (không phải lỗi code / deployment).
Detect:  ops/local/gas_health.py (launchd 15 phút) báo Telegram; hoặc
         curl '<GAS_URL>?action=ping' → HTML 403 thay vì JSON = dính.
Fix NGAY (5 phút, tài khoản Google chủ script):
  1. script.google.com → mở project Kissaten → Run 1 hàm bất kỳ → màn hình consent
     hiện ra → cấp lại quyền. KHÔNG cần redeploy (URL /exec giữ nguyên).
  2. Verify: curl '?action=ping' trả JSON {"ok":true,...}.
Fix TRIỆT ĐỂ (1 lần, hết tái phát):
  console.cloud.google.com (tài khoản chủ script) → chọn đúng GCP project đang gắn với
  Apps Script (Project Settings trong editor cho biết) → APIs & Services →
  OAuth consent screen → nếu chỉ dùng trong Google Workspace thì chọn audience Internal;
  nếu external thì đổi Publishing status "Testing" → PUBLISH APP ("In production").
  Sau đó re-auth 1 lần cuối (bước Fix NGAY) — grant từ đây không còn hết hạn 7 ngày.
Lưu ý:   Lần fix 2026-07-03 làm bằng redeploy trong editor — redeploy chỉ tình cờ
         ép re-auth (che triệu chứng), KHÔNG chữa gốc → 7 ngày sau chết lại.
```

## L6 — Mac Mini chết trong lúc chấm công (attendance)

```
Trigger: Máy chấm công (192.168.50.125:5001) không vào được — Mac Mini crash/mất điện
Action:  Nhân viên ghi giờ vào/ra ra GIẤY (giờ:phút, tên) như bình thường
Fix:     Máy sống lại → chủ mở tab Bảng công trên trang chấm công → Thêm ca tay
         (POST /attendance/create_manual) → nhập từng ca từ giấy → ghi
         note = "chấm giấy <ngày>" để phân biệt với ca bấm thật (cột source=owner_manual)
Chi tiết: docs/system/attendance.md
```

## SOP Offline (In laminated, dán tại quầy)
```
1. Mạng chết     → Chrome Form cache · In tem LAN
2. Không in được → Marker trên giấy A5 · Dán lên ly
3. Mạng về       → Sync Form → Sheets
4. Mac crash     → Tắt nguồn 10s → bật lại · Nhắn chủ qua Zalo
5. Tất cả crash  → Giấy A5 + bút · Gọi chủ ngay
```
