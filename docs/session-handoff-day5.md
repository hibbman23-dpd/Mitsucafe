# Handoff — Day 5: Flask Print Server (Mac Mini + Xprinter POS-58L)
# Lâm Hà Kissaten · Cập nhật: 2026-05-19

## Day 4 đã hoàn thành ✅

| Hạng mục | Trạng thái |
|---|---|
| GAS `Code.gs` thêm `doGet?action=menu` endpoint | Pushed, **chưa redeploy** (xem §Pending) |
| GAS `SeedSheets.gs` thêm CART tab + `initCartSheet()` | Pushed |
| `glide/cart_to_items_json.js` — JS column code cho Glide | Done |
| `glide/webhook_body_template.txt` — body cho Trigger Webhook | Done |
| `docs/glide-setup.md` — hướng dẫn từng bước (Free plan) | Done |
| `seed/test_glide_payload.json` + `ops/smoke_test_glide.sh` | Done; POST verified `ORD-20260519-9075` |
| Glide app thực tế đã build trong UI | **User tự làm theo glide-setup.md** |

### Pending action items (user thao tác)

1. **Apps Script editor**: Run `initCartSheet()` → tạo tab CART
2. **Apps Script editor**: Deploy → Manage Deployments → Edit current → Version: **New version** → Deploy
   - Sau đó `?action=menu` mới live. Test: `curl -sSL "$GAS_URL?action=menu" | jq .count` phải trả 27.
3. **Glide editor**: làm theo `docs/glide-setup.md` §1–§6 (~45–60 phút)
4. **Smoke test cuối Day 4**: gửi 1 đơn thật từ Glide preview → kiểm Telegram + ORDERS row

---

## Mục tiêu Day 5 — Flask Print Server

In tem dán ly khi `updateOrderStatus(order_id, "CONFIRMED")`.

### Hardware checklist

| Item | Trạng thái cần | Note |
|---|---|---|
| Mac Mini M4 | Power on 24/7, sleep OFF, login auto | CLAUDE.md §4 |
| Xprinter POS-58L | Cắm USB Mac Mini HOẶC trên LAN cùng router | Test in self-test page bằng cách giữ feed button |
| LAN/Wifi | Mac Mini + máy in cùng subnet (vd 192.168.1.x) | Set static DHCP cho IP máy in |
| Giấy thermal 58mm | 1 cuộn dự phòng | Roll cuộn vào khay đúng chiều |

### Files cần build

```
print-server/
├── print_server.py        Flask app, POST /print → TCP 9100
├── requirements.txt       flask, python-escpos (optional cho USB)
├── README.md              Setup + login items + test
└── com.lhk.printserver.plist   launchd plist cho auto-start (alt: Login Items)
```

### Endpoint spec

```
POST http://{MAC_MINI_LAN_IP}:5000/print
  Content-Type: application/octet-stream
  Body: ESC/POS raw bytes (do GAS build trong buildLabelEscPos)
  Response: {"ok": true, "bytes_sent": N} or {"ok": false, "error": "..."}

GET  http://{MAC_MINI_LAN_IP}:5000/health
  Response: {"ok": true, "printer_ip": "...", "printer_reachable": true|false}
```

### GAS side đã sẵn sàng

`gas/LabelPrint.gs` đã có:
- `printOrderLabels(order)` — tách items, mỗi qty → 1 tem
- `buildLabelEscPos(order, item)` — string ESC/POS 58mm
- `sendToPrinter(escposData)` — POST `http://{LABEL_PRINTER_IP}:{PRINT_SERVER_PORT}/print`

→ Day 5 chỉ cần dựng Flask receiver + điền CONFIG:
- `LABEL_PRINTER_IP` = IP Mac Mini (không phải IP máy in! Flask chạy trên Mac Mini, nó forward TCP tới máy in)
- `PRINT_SERVER_PORT` = `5000`

### Build steps Day 5

1. **Kiểm IP**: trên Mac Mini chạy `ifconfig en0 | grep 'inet '` → ghi `MAC_MINI_LAN_IP`
2. **Kiểm máy in IP**: nếu LAN → router admin, gán static. Nếu USB → không cần IP, dùng `python-escpos` USB direct
3. **Tạo `print-server/print_server.py`**:
   - Mode A (LAN printer): socket → TCP 9100
   - Mode B (USB printer): `from escpos.printer import Usb; Usb(0x0FE6, 0x811E)`
   - Quyết định mode dựa kết quả bước 2
4. **`requirements.txt`**: `flask>=3.0\npython-escpos>=3.0  # nếu USB`
5. **Test local trên Mac Mini**:
   ```bash
   pip install -r print-server/requirements.txt
   python3 print-server/print_server.py
   curl -X POST http://localhost:5000/print \
     -H "Content-Type: application/octet-stream" \
     --data-binary $'\x1B@\x1Ba\x01TEST PRINT\n\n\n\x1DV\x42\x00'
   ```
6. **Login Items**: System Settings → General → Login Items → "+ Add" → chọn script wrapper `.command`
7. **CONFIG sheet**: `setConfig('LABEL_PRINTER_IP', '<MAC_MINI_LAN_IP>')`
8. **GAS test**: ở editor chạy `updateOrderStatus('ORD-20260519-9075','CONFIRMED')` → tem ra giấy

### Edge cases cần handle trong Flask

- Printer offline / timeout → return 503 + log → GAS sẽ retry? (no, GAS chỉ log)
- Bytes > 4KB → batch send
- Concurrent requests → lock socket
- UTF-8 tiếng Việt → ESC/POS code page chuyển: `ESC t 17` cho Vietnamese (xem datasheet POS-58L)
- Bold/large headers → `ESC ! 0x30` size 2x

### Risk: ký tự tiếng Việt

POS-58L mặc định không support UTF-8. Cần:
- Hoặc preprocess: bỏ dấu (cà phê → ca phe) trong `buildLabelEscPos`
- Hoặc dùng bitmap mode (chậm hơn, mỗi tem ~1s)

**Khuyến nghị Day 5**: bỏ dấu cho launch, optimize bitmap sau khi có thời gian.

---

## CONFIG còn placeholder

Cập nhật trước Day 5–7:

| Key | Hiện tại | Cần |
|---|---|---|
| `LABEL_PRINTER_IP` | `192.168.1.50` | IP thực Mac Mini |
| `VIETQR_BANK_CODE` | placeholder | VCB / TCB / MB... |
| `VIETQR_ACCOUNT` | placeholder | Số tài khoản |
| `VIETQR_ACCT_NAME` | placeholder | Tên chủ TK |
| `CAFE_NAME` | placeholder | "Lâm Hà Kissaten" |
| `CAFE_ADDRESS` | placeholder | Địa chỉ thật |
| `CAFE_PHONE` | placeholder | SĐT quán |

---

## Sau Day 5 — Day 6 & 7

| Day | Task |
|---|---|
| Day 6 | VietQR generation trong Glide Success screen + state machine manual UI (cho nhân viên đổi CONFIRMED → MAKING → READY → DELIVERED) |
| Day 7 | `qr/generate_qr.py` — sinh QR sticker từng bàn, smoke test 10 đơn liên tiếp + ép nhựa SOP offline |

---

## Snapshot URL/IDs (không đổi từ Day 4)

| Item | Value |
|---|---|
| GAS Web App URL | `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec` |
| Script ID | `1nIdKqCQWD-BYGxin50Zf6L0aH41gu402nhM5SqkoaNvWvb4zV4wWhk4q` |
| Telegram Bot | KaeruKaphe · Chat ID `8813631255` |
| clasp push cmd | `cd ~/Projects/lamha-kissaten/gas && PATH="/opt/homebrew/bin:$PATH" clasp push` |
| Smoke test | `bash ops/smoke_test_glide.sh` |

---

*Handoff Day 5 · viết 2026-05-19 cuối Day 4*
