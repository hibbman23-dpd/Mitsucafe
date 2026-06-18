# Thẻ bàn giao Antigravity — Rebrand Mitsu (đợt 1)

> Ngày: 2026-06-17 · Cho: Antigravity (agent ngoài, KHÔNG có context phiên Claude Code)
> Repo: `lamha-kissaten` · Thư mục web tĩnh: `web/` · Không có bundler (file HTML/CSS/JS thuần)
> Nền tảng đã có sẵn: `web/mitsu.css`, `web/mitsu-theme.js`, `web/mitsu-menu.js`, `web/mitsu-assets.svg` (đã commit). Mọi việc dưới đây **dựa trên các file này**.

---

## 0. LUẬT CHUNG (đọc trước mọi thẻ)

**Bối cảnh:** Quán cà phê & trà sữa ở Lâm Hà đang đổi thương hiệu từ **Kaeru** (ếch, nền teal tối) sang **Mitsu 蜜** (ong/mật, junkissa Nhật, nền washi sáng + bản tối luxury).

**Hệ token (chỉ dùng biến CSS từ `mitsu.css`, KHÔNG hardcode màu cũ):**
`--bg --surface --surface-2 --text --text-dim --text-muted --accent --accent-deep --seal --moss --line --line-soft`
Hai theme (sáng/tối) tự đổi qua `prefers-color-scheme` + `data-theme`. Đừng tự định nghĩa lại màu — chỉ tham chiếu biến.

**Font:** Cormorant Garamond (display) · Be Vietnam Pro (body) · Noto Serif JP (kanji). Đã `@import` trong `mitsu.css`.

**Thông tin thương hiệu (để thay chuỗi):**
- Tên: `Mitsu` · Kanji: `蜜` · Mô tả: `Cà phê · Trà sữa · Mang đi`
- Slogan: `Gom mật ngọt, Gắn yêu thương`
- Địa chỉ: `Lâm Hà, Lâm Đồng`
- Màu chủ đạo cho `theme-color` PWA: `#C68A3E` (thay `#2D5F6B` cũ)

**KHÔNG ĐƯỢC (guardrails):**
- ❌ KHÔNG đổi schema/giá/logic đặt hàng. KHÔNG sửa `web/menu-data.js`, `web/order.js`, `web/signage.js`, `web/signage.html`.
- ❌ KHÔNG làm phần **menu/thực đơn** (cách hiển thị món đang được thiết kế lại — sẽ giao sau).
- ❌ KHÔNG xoá file asset cũ (mascot ếch, `stk-*`) — chỉ thêm cái mới; việc gỡ làm ở đợt sau.
- ❌ KHÔNG đụng `web/style.css` (CSS app đặt hàng — đợt sau, dính menu).
- ❌ KHÔNG hardcode `location_id`, token, khoá.

**Cách verify:** mở file HTML trong trình duyệt, kiểm cả theme sáng và tối (đổi màu hệ thống máy hoặc thêm `data-theme="dark"` vào `<html>`), không lỗi console.

---

## ✅ THẺ A — Bộ ảnh placeholder nhân vật + pattern

**Mục tiêu:** tạo asset tạm để giao diện không trống; ảnh hi-res chủ gửi sau sẽ thay theo đúng tên file.

**Tạo mới:**
- `web/img/mitsu/char-{kin|ritsu|so|queen}-{determined|joyful|surprised|sleepy|proud|goodbye}.webp` → **24 file** (4 nhân vật × 6 biểu cảm).
  - Nội dung placeholder: nền washi `#F2EBDD`, kanji nhân vật lớn (勤/律/創/女王) + nhãn biểu cảm tiếng Anh nhỏ, viền `#C68A3E`. Kích thước ~600×800 (tỉ lệ 3:4).
- `web/img/mitsu/pattern-seigaiha.svg` — hoạ tiết sóng 青海波, nét `#C68A3E`/`--line`, nền trong suốt, tile lặp được.
- `web/img/mitsu/pattern-coffee.svg` — hoa & quả cà phê, tông `#6E7A4F`/`#C68A3E`, nền trong suốt.

**Done:** đủ 24 ảnh + 2 SVG đúng tên; mở thử 1 ảnh không vỡ tỉ lệ 3:4.

---

## ✅ THẺ B — Reskin màn hình nội bộ (dashboard / KDS / camera)

**Mục tiêu:** đồng bộ màu/logo/tên sang Mitsu cho 3 màn hình vận hành nội bộ. CHỈ đổi giao diện (màu, font, logo, tiêu đề), KHÔNG đổi chức năng/logic/dữ liệu.

**Sửa:** `web/dashboard.html`, `web/kds.html`, `web/camera.html`
- Thêm `<link rel="stylesheet" href="mitsu.css">` và `class="mitsu"` ở `<body>` (hoặc map biến màu nội bộ sang token Mitsu).
- Thay mọi màu teal/coral Kaeru (`#2D5F6B`, `#1C3A42`, `#DB4E37`, `#F5F0E8`…) bằng token Mitsu tương ứng (`--bg`, `--surface`, `--accent`, `--seal`, `--text`…).
- Thay chữ "Kaeru/KaeruKàphê" hiển thị → "Mitsu 蜜". Logo: dùng wordmark `<span class="wm">mitsu<span class="dot">.</span></span>` hoặc `<svg class="hanko"><use href="mitsu-assets.svg#hanko"/></svg>`.
- Bảo đảm đọc được ở cả theme sáng/tối.

**Don't:** không đổi JS, không đổi cấu trúc bảng/luồng, không đụng menu.

**Done:** 3 màn hình mở ra mang màu Mitsu, chữ Mitsu, không lỗi console, chức năng cũ giữ nguyên; kiểm cả 2 theme.

---

## ✅ THẺ C — Meta / SEO / PWA / đổi chuỗi thương hiệu

**Mục tiêu:** đổi mọi metadata + chuỗi thương hiệu hiển thị từ Kaeru → Mitsu. KHÔNG đụng layout/menu/logic.

**Sửa:** `web/index.html`, `web/kaeru.html`, `web/manifest.json`, `web/sitemap.xml`, `web/robots.txt`
- `<title>`, `<meta name="description">`, toàn bộ `og:*`, `twitter:*`, `apple-mobile-web-app-title` → dùng tên/slogan/mô tả ở §0.
- `<meta name="theme-color">`: `#2D5F6B` → `#C68A3E`.
- `manifest.json`: `name`, `short_name`, `theme_color`, `background_color` → Mitsu (background `#F2EBDD`).
- JSON-LD trong `kaeru.html` (`@type CafeOrCoffeeShop`): `name` "Kaeru Bubble Tea" → "Mitsu", giữ địa chỉ/giờ mở cửa.
- `og:image` tạm giữ ảnh cũ (ảnh mới ở đợt asset) — chỉ đổi text.

**Don't:** KHÔNG đổi tên file hay route (vd không đổi `kaeru.html` → tên khác); việc rename + redirect làm ở đợt sau, có Claude review. Không đụng nội dung thân trang (phần landing làm ở thẻ D).

**Done:** mở index + kaeru, xem nguồn: title/OG/theme-color/manifest đều "Mitsu"; không lỗi console; route cũ vẫn chạy.

---

## ⏸️ ĐANG GIỮ (chưa giao — chờ chốt thêm)

| Việc | Vì sao giữ |
|---|---|
| Thiết kế & tích hợp **menu honeycomb** vào app đặt hàng | Cách hiển thị menu đang được thiết kế lại (chủ sẽ chốt sau) |
| Ảnh honeycomb từng món (27 món) | Phụ thuộc thiết kế menu cuối |
| Recolor `web/style.css` (CSS app đặt hàng) | Dính phần menu + luồng đơn — Claude giữ |
| Reskin **Signage** (`signage.html/js`) | Chủ đang làm dở nhánh `signage-studio` — tránh đụng nhau |
| Đổi tên file / route / domain / social + xoá asset ếch | Đụng deploy/QR/SEO — Antigravity làm, **Claude review** trước merge |

---

## Thứ tự đề xuất cho Antigravity
Làm song song được: **A**, **B**, **C** (độc lập nhau). Mỗi thẻ commit riêng, message tiền tố `feat(mitsu):` hoặc `assets(mitsu):`.
