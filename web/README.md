# Lâm Hà Kissaten — Web Ordering App
Static HTML · Không cần server · Không quota

## Cấu trúc

```
web/
├── index.html        Shell HTML
├── style.css         UI (mobile-first, kissaten aesthetic)
├── order.js          App logic (cart + GAS webhook)
├── menu-data.js      27 món (embedded, offline-ready)
├── manifest.json     PWA manifest (Add to Home Screen)
├── sw.js             Service Worker (offline cache)
└── tools/
    └── gen_menu_data.py  Tạo lại menu-data.js khi menu đổi
```

## Tính năng

- ✅ Menu 27 món, group theo danh mục, filter category
- ✅ Item detail: chọn Size / Đường / Đá / Topping / Số lượng
- ✅ Giỏ hàng: localStorage (persistent qua reload)
- ✅ Checkout: tên + SĐT + ghi chú + mã bàn
- ✅ POST tới GAS (no-cors, không quota Glide)
- ✅ Offline: Service Worker cache menu + shell
- ✅ PWA: installable trên iPhone/Android
- ✅ URL param `?t=03` → tự điền TABLE_03

## Chạy local (test)

```bash
cd ~/Projects/lamha-kissaten/web
python3 -m http.server 8080
# Mở: http://localhost:8080
# Test QR bàn: http://localhost:8080?t=03
```

## Deploy lên GitHub Pages (miễn phí)

### Lần đầu

```bash
# 1. Tạo repo trên GitHub (tên: kissaten-order)
# 2. Vào Settings → Pages → Source: "Deploy from branch" → branch: main, folder: /web

# Push code lên
cd ~/Projects/lamha-kissaten
git add web/
git commit -m "feat: add static web ordering app"
git push
```

URL sau deploy: `https://<username>.github.io/kissaten-order/`

### QR bàn (sau khi deploy)

```
Bàn 01: https://<username>.github.io/kissaten-order/?t=01
Bàn 02: https://<username>.github.io/kissaten-order/?t=02
...
Bàn 12: https://<username>.github.io/kissaten-order/?t=12
```

Day 7 sẽ dùng `qr/generate_qr.py` để in sticker QR.

### Cập nhật menu sau khi có ảnh / thay giá

```bash
# Sửa giá/ảnh trong seed/menu_items.json, rồi:
python3 web/tools/gen_menu_data.py
git add web/menu-data.js
git commit -m "update menu"
git push
# → GitHub Pages tự deploy trong < 2 phút
```

## Điền VietQR (khi có bank info — Day 6)

Mở `web/order.js`, dòng đầu, sửa:

```javascript
const VIETQR = {
  bank: 'VCB',               // mã ngân hàng
  acct: '1234567890',        // số tài khoản
  name: 'NGUYEN VAN A',      // tên chủ TK (viết hoa không dấu)
};
```

Commit + push → QR hiện tự động trên Success screen.

## Cập nhật GAS URL (nếu redeploy GAS)

```javascript
// web/order.js dòng đầu:
const GAS_URL = 'https://script.google.com/macros/s/NEW_ID/exec';
```

## Lưu ý kỹ thuật

**Tại sao no-cors?**
GAS Web App không trả CORS headers → không thể dùng `fetch` bình thường từ browser.
`mode: 'no-cors'` với body dạng plain text → GAS nhận được đơn, xử lý, gửi Telegram.
Nhược điểm: không đọc được order_id từ response → hiện "Đơn đã gửi" thay vì "ORD-XXXX".

**Offline hoạt động thế nào?**
Service Worker cache index.html, style.css, order.js, menu-data.js.
Mất mạng → vẫn xem được menu. Đặt hàng → fetch sẽ fail → hiện nút "Thử lại".

**Quota?**
Không có. Static file + Service Worker. Miễn phí vĩnh viễn trên GitHub Pages.
GAS miễn phí cho 1000 calls/ngày (giới hạn ổn cho quán nhỏ).
