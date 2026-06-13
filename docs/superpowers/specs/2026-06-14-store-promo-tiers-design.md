# Khuyến mãi % toàn quán 5%/10% + điều khiển Dashboard/KDS + nút đăng MXH

> Spec · 2026-06-14 · Kissaten Ordering System
> Trạng thái: thiết kế đã duyệt. Tiếp theo: kế hoạch triển khai.

## 1. Mục tiêu

Tổng quát hoá "khuyến mãi giảm % toàn quán" (hiện hardcode 5%) thành **1 mức chọn: Tắt / 5% / 10%** (loại trừ nhau), điều khiển được từ **Dashboard** (owner) và **KDS** (nhân viên tại quầy), kèm **thời lượng tự hết hạn**. Thêm nút **"📣 Đăng tin lên MXH"** ở Dashboard: sinh nội dung quảng cáo theo brand voice qua hàng đợi lệnh, owner duyệt & đăng.

Tái dùng hạ tầng sẵn có: CONFIG sheet + GAS + `promo_info` + `COMMAND_QUEUE`. KHÔNG thêm database ngoài.

## 2. Quyết định đã chốt (qua brainstorm)

| Yếu tố | Chốt |
|--------|------|
| Mô hình | 1 mức store-wide: **Tắt / 5% / 10%** (loại trừ nhau) |
| Thời lượng | giữ model `set_promo` hiện tại: 60' / 120' / đến cuối ngày / tuỳ nhập (phút) → auto-hết hạn |
| Điều khiển | **Dashboard** (admin session) **và KDS** (report-token + thiết bị đã duyệt) — cả hai toàn quyền off/5/10 |
| Nút đăng MXH | chỉ ở **Dashboard**; đẩy lệnh `/post` vào `COMMAND_QUEUE` → trợ lý sinh nội dung từng nền → owner duyệt & đăng (KHÔNG tự đăng API) |
| Hiển thị giá | order.js áp `percent` lên toàn menu; signage ribbon + kaeru banner + order đọc `promo_info.percent` |

## 3. Dữ liệu (CONFIG sheet)

- **Thêm key `PROMO_PERCENT`** = `5` | `10` (mức hiện hành khi promo bật).
- Giữ nguyên `PROMO_5PERCENT_ACTIVE` | `PROMO_5PERCENT_START` | `PROMO_5PERCENT_END` | `PROMO_5PERCENT_MSG` (tránh đổi tên rộng; tên "5PERCENT" thành dấu tích lịch sử).
- Seed: thêm `PROMO_PERCENT: '5'` vào `gas/SeedSheets.gs`.

## 4. GAS

### 4.1 Helper chung — `gas/Code.gs` (hoặc `gas/Payment.gs`)
```
setStorePromo(percent, active, duration, msg) →
  nếu active: validate percent ∈ {5,10}; tính end theo duration (phút | 'end_of_day');
    setConfig PROMO_PERCENT, PROMO_5PERCENT_ACTIVE='true', START, END, MSG
  nếu tắt: PROMO_5PERCENT_ACTIVE='false', START='', END='' (giữ PROMO_PERCENT)
  trả { ok, percent, active, end }
```

### 4.2 Hai lối vào auth (dùng chung helper)
- **doGet `set_promo`** (đã có) — KDS/Mac Mini: `_requireTokenIfSet` + `isDeviceApproved`. **Bổ sung đọc `e.parameter.percent`** (mặc định 5) → gọi `setStorePromo`.
- **doPost `set_promo`** (MỚI) — Dashboard: `validateSessionToken(payload.token)` + `isDeviceApproved(payload.device_id)` → gọi `setStorePromo(payload.percent, payload.active, payload.duration, payload.message)`. Đặt trong nhánh doPost cùng các admin write khác.

### 4.3 `_getPromoInfoInternal` — đọc percent
Đổi `percent: 5` (hardcode) → `percent: parseInt(getConfig('PROMO_PERCENT') || '5', 10)`. Giữ logic active/start/end như cũ. → `promo_info` trả percent đúng.

### 4.4 Lệnh đăng MXH — `COMMAND_QUEUE`
Tái dùng `queueCommand` (đã có, gate admin session). Nút Dashboard gọi `apiPost({action:'queue_command', token, device_id, text})` với `text` dạng:
`/post khuyến mãi giảm <percent>% toàn quán đến <end HH:mm>, nội dung: "<msg>"` → trợ lý `/inbox` sinh bài từng nền.

## 5. order.js — tổng quát hoá %

Đổi `applyPromo5Percent(active)` (hardcode `* 0.95`) → `applyPromoPercent(active)`:
```
const factor = (active && activePromo) ? (1 - (activePromo.percent || 5)/100) : 1;
MENU_DATA.forEach(item => {
  if (active) { item.price_m = Math.round(item.price_m_old * factor);
                if (item.price_l_old) item.price_l = Math.round(item.price_l_old * factor); }
  else        { item.price_m = item.price_m_old;
                if (item.price_l_old) item.price_l = item.price_l_old; }
});
```
Cập nhật mọi nơi gọi `applyPromo5Percent` → `applyPromoPercent`. Banner promo + strikethrough đã generic (đọc activePromo) → không đổi. Bump `order.js?v=`.

## 6. Hiển thị — đọc percent

- **signage** (`web/signage.js` `applyPromo`/ribbon): hiện ribbon dùng `'十 '+message`; đảm bảo message/percent phản ánh `promo.percent` (nếu cần hiện "−X%", lấy từ `promo.percent`).
- **kaeru.html** banner + **order.js** banner: đọc `activePromo.message`/`percent` — đảm bảo không ghi cứng "5%". Sửa text mặc định MSG nếu nó kẹp "5%".
- `_getPromoInfoInternal` default MSG: đổi sang trung tính ("Giảm giá toàn menu!") để không mâu thuẫn khi 10%.

## 7. Dashboard — control mới

Thêm 1 mini-panel "Giảm giá toàn quán" trong tab "🏷️ Khuyến mãi" (`web/dashboard.html`):
- 3 nút trạng thái: **Tắt** / **5%** / **10%** (hiện mức đang chạy).
- Chọn thời lượng: 60' / 120' / đến cuối ngày / tuỳ nhập (phút).
- Ô lời nhắn (mặc định theo mức).
- Nút **Lưu** → `apiPost({action:'set_promo', token:tk(), device_id, percent, active, duration, message})`.
- Nút **📣 Đăng tin lên MXH** → `apiPost({action:'queue_command', ...})` với text /post (mục 4.4); báo "Đã đẩy vào hàng đợi trợ lý".
- Khi mở tab: load `promo_info` → hiển thị trạng thái hiện tại + đếm ngược hết hạn.

## 8. KDS — control nhanh

Thêm thanh/nút gọn trong header KDS (`web/kds.html`):
- Nút mở 1 sheet nhỏ: **Tắt / 5% / 10%** + thời lượng (60'/120'/cuối ngày).
- Gọi doGet `set_promo` với `token=REPORT_TOKEN` + `device_id` (đã có sẵn trên KDS) + `percent` + `active` + `duration`.
- Hiển thị mức đang chạy (badge nhỏ) đọc từ `promo_info` (KDS có thể đã poll; nếu chưa, fetch khi mở sheet).

## 9. Chống lỗi / bảo mật

- Validate `percent ∈ {5,10}` ở GAS (từ chối giá trị khác → tránh giảm giá sai).
- Dashboard set_promo gate session+device; KDS set_promo gate report-token+device (nhất quán pattern hiện có). `queue_command` gate session (chỉ owner đăng MXH).
- `logError` mọi nhánh. Promo tự hết hạn theo END (order.js đã tự tắt khi quá END — mục `applyPromoPercent(false)` ở countdown).

## 10. Kiểm thử

- GAS (manual editor + curl): `set_promo&percent=10&active=true&duration=60&token=&device_id=` → `promo_info` trả `percent:10, active:true`. doPost set_promo thiếu session → từ chối.
- order.js (preview): giả lập `promo_info` percent=10 → giá toàn menu `* 0.90`, strikethrough đúng; percent=5 → `* 0.95`; tắt → giá gốc.
- signage/kaeru: ribbon/banner hiện đúng mức.
- Dashboard: 3 nút + thời lượng + Lưu (cần GAS deploy + session để test thật); nút Đăng MXH đẩy command (kiểm tra COMMAND_QUEUE có dòng /post).
- KDS: bật 10% từ KDS → `promo_info` đổi → order/signage cập nhật.

## 11. Ngoài phạm vi (spec riêng sau)

- **(B) Signage customization studio**: KHÔNG chỉ video — **mọi slide/cảnh đều tuỳ chỉnh được trong giới hạn** (chọn món/ảnh/chữ/thứ tự/thời lượng từng cảnh, nhiều video story…) qua **giao diện dễ dùng cho người không rành công nghệ**. Brainstorm + spec riêng.
- Tự đăng MXH qua API (FB/IG/Zalo) — dự án riêng.
- Ghi log promo activation vào PROMOTIONS để đo ROI — cân nhắc sau.

## 12. Đơn vị triển khai (gợi ý)

1. GAS: `setStorePromo` helper + `PROMO_PERCENT` + `_getPromoInfoInternal` percent + doGet set_promo nhận percent + doPost set_promo (session) + seed.
2. order.js: `applyPromoPercent` tổng quát + đổi text MSG mặc định + bump version.
3. Dashboard: mini-panel control + nút Đăng MXH.
4. KDS: thanh control nhanh + badge trạng thái.
5. Kiểm thử + verify hiển thị signage/kaeru/order theo 5% và 10%.
