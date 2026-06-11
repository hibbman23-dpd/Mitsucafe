# Signage Display — Màn quảng cáo mặt tiền

> Spec · 2026-06-11 · Kissaten Ordering System
> Trạng thái: thiết kế đã duyệt (ngôn ngữ hình ảnh + 5 cảnh). Tiếp theo: kế hoạch triển khai.

## 1. Mục tiêu & bối cảnh

Một màn hình TV đặt ngang ở mặt tiền quán, chiếu ra đường cho khách qua lại thấy: món nổi bật, khuyến mãi, video story, combo, chương trình tích tem — nhằm **kéo người đi đường vào quán / quét QR đặt món**. Chạy ~16 tiếng/ngày, không người trông coi.

Tái dùng tối đa hạ tầng sẵn có (CLAUDE.md): GAS = event bus, Google Sheets = database, Cloudflare Worker serve `web/`. KHÔNG thêm database ngoài.

## 2. Quyết định đã chốt (qua brainstorm)

| Yếu tố | Chốt |
|--------|------|
| Hướng màn | Ngang 16:9 (TV treo tường) |
| Thiết bị chạy | Android TV box rời + trình duyệt kiosk |
| Khối nội dung | 8 khối, BỎ "review khách": Spotlight · Khuyến mãi live · Menu · Video story · QR góc · Tem · Đổi theo khung giờ · Combo |
| Ảnh món spotlight | Thẻ chữ + mascot trước (chừa ô `image` thay ảnh thật sau) |
| Điều khiển | Tab "Màn hình" trong Dashboard (GAS + CONFIG JSON) |
| Tem | **10 tem = 1 ly miễn phí** (khớp `docs/system/loyalty-stamps.md`) |
| Cảnh video | Video khung GIỮA, hai bên panel **sóng ukiyo-e + ly nước** (không full-bleed) |
| Thẩm mỹ | Ukiyo-e "tranh khắc gỗ chuyển động" — sáng/rực/chữ to (hướng 2), **cascade reveal** các thành phần hiện ra trước–sau |

## 3. Kiến trúc (Hướng A — trang riêng + cấu hình GAS)

```
[Android box + kiosk browser] → https://kaerukaphe.workers.dev/signage
        │ (poll 60s)
        ├── menu-data.js        (bundle sẵn, như index/kds)
        ├── ?action=promo_info  (đã có) → khuyến mãi + countdown
        └── ?action=signage_config (MỚI, public read) → khối bật/tắt, spotlight, combo, thông báo, daypart
                                   ▲ ghi bởi
[Dashboard tab "Màn hình"] → ?action=set_signage (MỚI, gated token+session như set_promo)
                                   ▼
[CONFIG sheet] key SIGNAGE_CONFIG = <chuỗi JSON>
```

- `web/signage.html` — trang display tự chứa (HTML/CSS/JS thuần, không framework). Worker serve tại `/signage` + `/signage.html`, **noindex**.
- Trang **public** (chỉ đọc dữ liệu marketing) → KHÔNG cần token, đơn giản hoá.
- CSP riêng trong `<meta>` (cho phép nhúng YouTube) — theo đúng pattern `kaeru.html`.
- Cấu hình lưu **1 ô JSON** ở CONFIG (key `SIGNAGE_CONFIG`), không tạo sheet mới.

### Schema `SIGNAGE_CONFIG` (JSON)
```json
{
  "blocks": { "spotlight": true, "promo": true, "menu": true, "video": true,
              "qr": true, "tem": true, "combo": true, "daypart": true },
  "featured": ["DR014", "DR003", "DR005"],
  "combos": [ { "items": ["DR005","BK001"], "price": 50000, "label": "" } ],
  "announcement": { "text": "", "active": false, "until": "" },
  "video": { "youtube_id": "AQBbF4V4wRg" },
  "rotateSeconds": 11,
  "updated_at": "2026-06-11T09:00:00Z"
}
```

## 4. Ngôn ngữ hình ảnh (đã dựng & duyệt)

Bản dựng tham chiếu: `web/_signage_preview.html` (draft, sẽ thành cơ sở của `signage.html`).

- **Bảng màu:** nền chàm `#0D3340`→`#07232C`, vầng dương coral-vàng, coral `#FF5E40`, vàng `#FFD071/#E0A93F`, kem `#FCF7EC`, rêu `#8AA14F`, triện son `#E0402C`.
- **Font:** Noto Serif JP (tiêu đề/giá), IM Fell English SC (latin nhấn), Lora (thân/ý). Google Fonts (đã preload ở các trang khác).
- **Khung cố định (luôn hiện):** thanh brand (茶 + tên + trạng thái mở cửa + đồng hồ) · viền vàng đôi · vầng dương + vòng tròn · QR rail góc phải · ribbon khuyến mãi (khi có) · chấm tiến trình.
- **Cascade reveal:** mỗi cảnh vào sân khấu chạy chuỗi hiện theo lớp nền→ly→chữ→giá *bật*→QR (`@keyframes rise/pop/fadein`, stagger bằng `--d` delay), giữ yên rồi chuyển cảnh.

## 5. Các cảnh (5 + overlay)

1. **Spotlight** — xoay qua `featured[]`: ly vẽ SVG (hoặc `image` nếu có) + triện "推" + tên JP + tên VN khổ lớn (nhấn vàng) + story + thẻ giá coral nghiêng + size hint. Sóng Hokusai trôi đáy.
2. **Video** — khung 16:9 giữa (YouTube `youtube_id`, **tắt tiếng**, hết clip → qua cảnh); hai panel sóng ukiyo-e + 2 ly nước (tên + giá). QR rail ẩn ở cảnh này (đã có panel).
3. **Menu** — "お品書き / Thực đơn hôm nay", 3 cột nhóm từ `menu-data.js` (triện kanji + item + dòng kẻ chấm + giá vàng). Phân trang nhóm nếu quá nhiều.
4. **Combo** — badge "本日のセット", 2 ly/món (giá gạch) ＋ ＝ thẻ giá combo coral + "tiết kiệm Xđ". Từ `combos[]`.
5. **Tem** — "Đủ **10 tem** = 1 ly miễn phí", thẻ 10 ô (đã tích = coral 茶, ô 10 = vàng 無 reward), hướng dẫn.
- **Overlay luôn-trên (không phải cảnh):** ribbon khuyến mãi + countdown (từ `promo_info`), QR đặt món. **Thông báo đột xuất** (`announcement.active`) chen 1 cảnh ưu tiên cao.

## 6. Rotation engine & daypart

- `buildQueue(config, now)` → mảng cảnh đang bật, có trọng số theo khung giờ khi `daypart=true`: sáng (≤11h) ưu tiên cà phê/menu, trưa-chiều (11–18h) ưu tiên trà sữa/khuyến mãi, tối (>18h) ưu tiên video/ambiance.
- Cycle index mỗi `rotateSeconds` (mặc định 11), chuyển cảnh bằng crossfade opacity (nhẹ, đỡ tải GPU box rẻ).
- Cảnh video: tạm dừng auto-advance tới khi hết clip (hoặc tối đa ~60s).
- `announcement.active` → chèn đầu hàng đợi mỗi vòng.

## 7. Luồng dữ liệu & chống lỗi

- **Mở trang:** render ngay từ `menu-data.js` + cấu hình cache `localStorage` (tức thì, offline-safe).
- **Poll** `signage_config` + `promo_info` mỗi 60s → cập nhật state + cache lại localStorage.
- **Countdown** khuyến mãi: tick mỗi giây từ `promo.end` đã cache.
- **Resilience:** GAS/mạng chết → dùng cache + menu bundled (không bao giờ trắng màn). Thiếu `image` → thẻ chữ. JSON rỗng/hỏng → mặc định an toàn (tất cả khối bật, featured = các món role hero/signature). Hàng đợi rỗng → slide brand + QR. Video lỗi/không mạng → bỏ qua cảnh video. **Tự `location.reload()` lúc ~4:00 sáng** + khi sự kiện `online` sau gián đoạn dài (chống rò bộ nhớ/đơ 24/7).

## 8. Tab "Màn hình" trong Dashboard

Thêm tab vào `dashboard.html` (theo pattern tab sẵn có):
- Bật/tắt từng khối (8 switch).
- Chọn món spotlight (multi-select từ MENU_DATA).
- Soạn combo (chọn 2+ item + nhập giá + nhãn).
- Ô thông báo đột xuất (text + bật/tắt + tuỳ chọn tự hết hạn `until`).
- Số giây xoay · bật/tắt daypart · `youtube_id`.
- Nút **Lưu** → `set_signage` (gửi `token` + `device_id` + session, theo đúng pattern `set_promo`).
- Nút **Xem trước** mở `/signage` tab mới.

## 9. Endpoint GAS mới (Code.gs)

- `?action=signage_config` (public): đọc `CONFIG.SIGNAGE_CONFIG`, trả JSON đã parse; nếu rỗng → trả default. Không gate.
- `?action=set_signage` (admin): `_requireTokenIfSet` + `validateSessionToken` (như `set_promo`); validate + ghi `CONFIG.SIGNAGE_CONFIG`; cập nhật `updated_at`; `logError` khi lỗi.
- Cập nhật `Admin.gs` CONFIG keys whitelist nếu cần (`SIGNAGE_CONFIG`).

## 10. Cấu hình phần cứng (runbook ngắn — `docs/system/signage-hardware.md`)

- **Android box:** cài *Fully Kiosk Browser*; Start URL = `https://kaerukaphe.workers.dev/signage`; bật: Start on Boot, Keep Screen On, Auto-Reload on disconnect, Relaunch on crash, ẩn thanh điều hướng/địa chỉ; Screensaver = off.
- **TV:** bật HDMI-CEC (tự lên nguồn + đúng input khi box bật), tắt screensaver/sleep của TV; độ sáng tối đa cho ban ngày.
- **Điện:** tuỳ chọn ổ cắm hẹn giờ tắt sau giờ đóng cửa / bật trước giờ mở.
- **Mạng:** wifi; trang offline-tolerant nên gián đoạn ngắn không sao.

## 11. Kiểm thử

- Local `web/` ở 1280×720 + thu nhỏ tỉ lệ; ép từng cảnh qua `?s=`; verify cascade reveal, đếm ngược, fallback offline (chặn mạng), thiếu `image` → thẻ chữ.
- `curl ?action=signage_config` → JSON; `?action=set_signage` không token → từ chối, có token → ghi & đọc lại khớp.
- Smoke trên thiết bị thật: kiosk tự mở sau reboot, video tắt tiếng autoplay, reload 4h sáng.

## 12. Ngoài phạm vi / giai đoạn sau

- Ảnh chụp món thật (thay dần ô `image`).
- Khối "review khách" (đã bỏ ở đợt này).
- Cloudflare Access cho trang control (việc khác, đang chờ bật Zero Trust — không liên quan signage public).
- Nhiều màn / nhiều chi nhánh (config theo `location_id`) — sau.

## 13. Đơn vị triển khai (gợi ý chia nhỏ)

1. `signage.html` khung + design system + 5 cảnh tĩnh (từ draft) + cascade.
2. Rotation engine + daypart + overlay promo/QR/announcement.
3. Lớp dữ liệu: menu-data + poll promo_info + cache localStorage + resilience + auto-reload.
4. GAS: `signage_config` + `set_signage` + default + CONFIG key.
5. Dashboard tab "Màn hình".
6. Worker: route/noindex `/signage` (kiểm tra CSP nhúng YouTube).
7. Runbook phần cứng + kiểm thử thiết bị thật.
