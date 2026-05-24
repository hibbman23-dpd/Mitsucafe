# Handoff — Web PWA Ordering App
# Lâm Hà Kissaten · Cập nhật: 2026-05-21

## Quyết định kiến trúc quan trọng

**Glide đã bị loại bỏ hoàn toàn.**
Lý do: Glide Free = 500 Updates/tháng ≈ 3–4 đơn/ngày. Quán dự kiến >30 đơn/ngày → không đủ.
Thay thế: Static HTML+CSS+JS PWA, deploy GitHub Pages, không quota, miễn phí vĩnh viễn.

---

## Trạng thái hiện tại ✅

### GAS (Google Apps Script)

| Hạng mục | Trạng thái |
|---|---|
| `doPost()` — nhận đơn, validate, ghi ORDERS, gửi Telegram | ✅ Hoạt động |
| `doGet(?action=menu)` — trả 27 món JSON | ✅ Deployment @3 live |
| `initCartSheet()` trong SeedSheets.gs | ⏳ Chưa chạy (không quan trọng — web app không dùng CART tab) |

**GAS URL**: `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec`
**Script ID**: `1nIdKqCQWD-BYGxin50Zf6L0aH41gu402nhM5SqkoaNvWvb4zV4wWhk4q`
**clasp push**: `cd ~/Projects/lamha-kissaten/gas && PATH="/opt/homebrew/bin:$PATH" clasp push`
**clasp redeploy**: `clasp deploy -i "AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i" -d "vX - mô tả"`

### Web PWA (`web/`)

| File | Trạng thái |
|---|---|
| `index.html` | ✅ PWA meta, apple-touch-icon, link manifest |
| `style.css` | ✅ ~370 dòng, mobile-first, kissaten aesthetic |
| `order.js` | ✅ ~647 dòng, cart + submit + screens |
| `menu-data.js` | ✅ 27 món, 7 categories, auto-generated |
| `manifest.json` | ✅ standalone PWA, theme #2c1810 |
| `sw.js` | ✅ Service Worker, offline cache shell files |
| `tools/gen_menu_data.py` | ✅ Regenerate menu-data.js từ seed/menu_items.json |

**Test local**: `python3 -m http.server 8081` trong `web/`, mở `http://localhost:8081/?t=03`
(Server chạy background, PID trong `/tmp/lhk_server.pid`)

### Kiến trúc order.js

```
State: { screen, sheet, activeCat, selItem, selOpts, tableId, cart, lastOrder, submitting }
Cart: localStorage key 'lhk_cart'
Screens: menu | checkout | success
Sheets (bottom overlay): item (detail/options) | cart (review)
Events: delegation trên document, data-action attributes
Submit: fetch(GAS_URL, { method:'POST', mode:'no-cors', body: JSON.stringify(payload) })
        → text/plain, no preflight, no CORS issue
        → response opaque → hiện "Đơn đã gửi" thay vì ORD-XXXX
URL param: ?t=03 → TABLE_03
```

---

## Việc tiếp theo

### 1. Cải thiện thiết kế UI (next session — ưu tiên cao)

User muốn redesign trang đặt hàng. Hiện tại aesthetic đã đúng (warm brown/cream/amber) nhưng cần polish thêm về:
- Layout menu grid
- Item detail bottom sheet
- Cart/checkout flow
- Typography & spacing

Khi redesign: **giữ nguyên toàn bộ logic trong order.js**, chỉ sửa style.css (và HTML structure trong order.js nếu cần).

### 2. VietQR (Day 6)

Điền vào `web/order.js` dòng đầu:
```javascript
const VIETQR = {
  bank: 'VCB',        // mã ngân hàng
  acct: '1234567890', // số tài khoản
  name: 'NGUYEN VAN A',
};
```
→ QR tự động hiện trên Success screen.

### 3. Deploy GitHub Pages

```bash
# Lần đầu: tạo repo 'kissaten-order' trên GitHub
# Settings → Pages → Source: main branch, folder /web
cd ~/Projects/lamha-kissaten
git add web/
git commit -m "feat: web PWA ordering app"
git push
# URL: https://<username>.github.io/kissaten-order/
```

### 4. QR bàn (sau GitHub Pages)

```
Bàn 01: https://<username>.github.io/kissaten-order/?t=01
...
Bàn 12: https://<username>.github.io/kissaten-order/?t=12
```
Chạy `qr/generate_qr.py` để in sticker (Day 7).

### 5. Flask Print Server (Day 5 — vẫn cần)

Xem `docs/session-handoff-day5.md` §Build steps Day 5.
Tóm tắt: `print-server/print_server.py` Flask → TCP 9100 → Xprinter POS-58L.
CONFIG sheet: `LABEL_PRINTER_IP` = IP Mac Mini, `PRINT_SERVER_PORT` = 5000.

---

## CONFIG sheet còn placeholder

| Key | Cần điền |
|---|---|
| `LABEL_PRINTER_IP` | IP thực Mac Mini trên LAN |
| `VIETQR_BANK_CODE` | VCB / TCB / MB... |
| `VIETQR_ACCOUNT` | Số tài khoản |
| `VIETQR_ACCT_NAME` | Tên chủ TK (viết hoa không dấu) |
| `CAFE_NAME` | Lâm Hà Kissaten |
| `CAFE_ADDRESS` | Địa chỉ thật |
| `CAFE_PHONE` | SĐT quán |

---

## Snapshot IDs (không đổi)

| Item | Value |
|---|---|
| GAS Web App URL | `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec` |
| Script ID | `1nIdKqCQWD-BYGxin50Zf6L0aH41gu402nhM5SqkoaNvWvb4zV4wWhk4q` |
| Telegram Bot | KaeruKaphe · Chat ID `8813631255` |

---

*Handoff Web PWA · viết 2026-05-21*
