# ONBOARDING — Việc bạn cần làm thủ công

Code đã có scaffold xong (Day 1–2). Để chạy được MVP, bạn cần làm 5 việc thủ công sau. Theo thứ tự ưu tiên:

---

## 🚨 LÀM NGAY HÔM NAY

### 1. Đăng ký Zalo OA → submit verification (3–7 ngày duyệt)

Đây là bước **chặn ngày khai trương** nếu bạn không làm sớm.

1. Vào https://oa.zalo.me/ → đăng ký Zalo Official Account
2. Loại: **Doanh nghiệp** (hoặc Hộ kinh doanh nếu chưa có ĐKKD)
3. Submit hồ sơ verify (cần CCCD + ảnh quán)
4. Chờ duyệt 3–7 ngày
5. Sau khi duyệt → vào **Quản lý OA → Cấu hình → Access Token** → lưu lại

> Token này sẽ paste vào CONFIG.ZALO_OA_TOKEN ở Phase 2.

### 2. Tạo Telegram Bot (20 phút — bắt buộc cho MVP)

1. Mở Telegram → tìm `@BotFather`
2. Gõ `/newbot` → đặt tên (ví dụ "Lâm Hà Kissaten Bot") → username (kissaten_lh_bot)
3. Lưu **TOKEN** mà BotFather trả về (`123456789:ABC...`)
4. Tìm bot vừa tạo, ấn **Start** để kích hoạt
5. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates` trên browser → tìm `chat.id` (số nguyên, có thể âm nếu là group)
6. Lưu cả TOKEN và CHAT_ID — sẽ paste vào CONFIG sheet

> Khuyên: tạo **group Telegram** "Kissaten Orders" → add bot vào group → tất cả nhân viên + chủ quán cùng nhận alert.

### 3. Lấy thông tin VietQR (5 phút)

Mở app banking → vào **Thông tin tài khoản** → chụp 3 thông tin:

```
VIETQR_BANK_CODE   = VCB / TCB / MBB / TPB / ACB / ...   (xem mã ngân hàng tại https://api.vietqr.io/v2/banks)
VIETQR_ACCOUNT     = 1234567890        (số tài khoản)
VIETQR_ACCT_NAME   = NGUYEN VAN A      (tên chủ TK, không dấu, viết hoa)
```

### 4. Chốt tên + địa chỉ + SĐT quán (30 phút)

Cần để in trên bill nhiệt + đăng ký Zalo OA + Google Business Profile.

```
CAFE_NAME    = Lâm Hà Kissaten   (hoặc tên chính thức bạn dùng)
CAFE_ADDRESS = <địa chỉ đầy đủ>
CAFE_PHONE   = <SĐT hotline>
```

### 5. Đăng ký Glide free (10 phút)

1. Vào https://www.glideapps.com/ → Sign up bằng Google account
2. **Free plan** đủ cho MVP — sẽ upgrade nếu cần khi vượt limit
3. Chưa cần tạo app — chờ Day 4 sẽ làm cùng

---

## 📋 TUẦN 1 (làm song song khi tôi build code)

### 6. Tạo Google Sheets "Kissaten DB"

1. Mở https://sheets.google.com → tạo Sheet mới, đặt tên **"Lâm Hà Kissaten DB"**
2. Mở **Extensions → Apps Script** (sẽ mở GAS editor bound với Sheet này)
3. Copy `Script ID` từ Project Settings → đưa lại cho tôi để cài clasp
4. Tab **Files** trong GAS → tôi sẽ push code từ `/gas` folder lên

> Tôi hướng dẫn chi tiết khi bạn đã có Sheet này.

### 7. Setup Mac Mini làm print server

```bash
# Trên Mac Mini
cd ~/Projects/lamha-kissaten
python3 -m pip install -r print-server/requirements.txt

# Test chạy thủ công trước
python3 print-server/print_server.py
# Kiểm tra: curl http://localhost:5000/health → phải trả {"ok": true}
```

Khi đã chạy được:

```bash
# Sửa <PATH-TO-PROJECT> trong file plist thành /Users/dpd/Projects/lamha-kissaten
# Rồi:
cp print-server/com.lamha.kissaten.printserver.plist ~/Library/LaunchAgents/
mkdir -p print-server/logs
launchctl load ~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist
```

System Settings cần bật:
- **General → Login Items** → đảm bảo print_server tự chạy
- **Energy** → Prevent sleep: ON
- **Software Update** → tắt Auto-update (tránh reboot bất ngờ)
- **Software Update → Advanced** → "Restart automatically if the computer freezes": ON

### 8. Kết nối Xprinter POS-58L qua LAN

1. Cắm dây Ethernet vào POS-58L → cùng router với Mac Mini
2. Bấm tổ hợp giữ nút FEED + cắm điện → in ra trang self-test có IP
3. Vào router admin → **DHCP Reservation** → cố định IP cho MAC address của máy in (ví dụ `192.168.1.50`)
4. Test ping: `ping 192.168.1.50` từ Mac Mini → OK
5. Cập nhật `print-server/com.lamha.kissaten.printserver.plist` → PRINTER_IP
6. Cập nhật CONFIG sheet → LABEL_PRINTER_IP

### 9. In QR sticker bàn (sau Day 7)

```bash
cd ~/Projects/lamha-kissaten/qr
python3 -m pip install -r requirements.txt
# Sau khi Glide app đã publish có URL:
python3 generate_qr.py --glide-url https://<your-app>.glide.page --tables <số-bàn-quán>
```

Lấy file `qr/labels/*.png` → in màu A6 → ép nhựa → dán mỗi bàn.

---

## 🎯 TUẦN 2–4 (chuẩn bị vận hành)

- [ ] Đặt mua cuộn giấy sticker 58mm cho POS-58L (5 cuộn) — Tiki / Shopee từ khoá "giấy in tem sticker 58mm"
- [ ] Đặt mua label die-cut 40×30mm cho XP-365B (3 cuộn) — nếu sẽ dùng
- [ ] Pin dự phòng tablet ≥10000mAh cho L4 cúp điện
- [ ] Soft launch beta 5–10 khách thân quen test trước
- [ ] Train nhân viên 1 buổi 2h (xem [staff-training.md](ops/staff-training.md))
- [ ] In SOP offline A5 ép nhựa, dán quầy
- [ ] Google Business Profile cho quán
- [ ] Facebook Page + Instagram Business + TikTok Business accounts

---

## 📞 Khi xong các bước trên — báo tôi để tiếp tục

Cụ thể, báo tôi khi đã có:

1. ✅ Google Sheets "Lâm Hà Kissaten DB" — gửi link
2. ✅ Telegram bot TOKEN + CHAT_ID
3. ✅ VietQR bank info
4. ✅ Tên + địa chỉ + SĐT quán chính thức
5. ✅ Mac Mini đã chạy được `print_server.py`
6. ✅ Xprinter POS-58L đã có IP cố định trong LAN

Khi đó tôi sẽ:
1. Hướng dẫn bạn cấu hình `.clasp.json` để push GAS code lên
2. Chạy `initAllSheets()` + `seedConfigDefaults()` + `seedMenuFromJson()` (1 lần)
3. Deploy GAS Web App → lấy URL
4. Test end-to-end: POST `seed/test_order_sample.json` → thấy đơn trong Sheets + Telegram + tem in ra
5. Bắt đầu Day 4: Glide app khách
