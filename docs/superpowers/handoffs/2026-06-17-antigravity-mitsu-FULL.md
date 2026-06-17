# BÀN GIAO TOÀN BỘ REBRAND MITSU → cho Antigravity

> Ngày: 2026-06-17 · Cho: **Antigravity** (agent ngoài, KHÔNG có ký ức phiên Claude Code).
> Đây là tài liệu DUY NHẤT cần để chạy toàn bộ rebrand. Làm theo thứ tự P1→P7.
> Thay cho file `2026-06-17-antigravity-mitsu-tasks.md` (đợt 1) — file này bao trùm tất cả.

---

## 0. ĐỌC TRƯỚC KHI LÀM

### 0.1 Bối cảnh
Quán cà phê & trà sữa mang đi ở Lâm Hà đổi thương hiệu từ **Kaeru** (mascot ếch, nền teal tối) sang **Mitsu 蜜** (ong/mật, quán junkissa Nhật, nền washi sáng + bản tối luxury). Repo: `lamha-kissaten`. Web tĩnh ở `web/`, **không có bundler** (HTML/CSS/JS thuần, version bằng query string).

### 0.2 File phải đọc trong repo (đã có sẵn)
- `docs/superpowers/specs/2026-06-17-mitsu-rebrand-overview.md` — bản đồ 6 mảng + bảng chia việc.
- `docs/superpowers/specs/2026-06-17-mitsu-foundation-design.md` — đặc tả nền tảng + hệ nhân vật + hợp đồng honeycomb-menu.
- `web/mitsu.css`, `web/mitsu-theme.js`, `web/mitsu-menu.js`, `web/mitsu-assets.svg` — **NỀN TẢNG đã làm xong, đã commit**. Dùng lại, đừng viết lại.
- `web/mitsu-menu-proto.html` — **PROTOTYPE MENU đã duyệt** (3D carousel + gallery honeycomb + viền hổ phách lấp lánh). Đây là **bản thiết kế chuẩn** cho P5. Mở bằng `python3 -m http.server` trong `web/` để xem.
- `web/mitsu-kit.html` — demo component nền tảng.
- Nguồn nội dung thương hiệu: `~/Downloads/mitsu/mitsu-brand-master.html` và `~/Downloads/mitsu/mitsu-content.json` (story, triết lý, slogan, menu, UX copy).

### 0.3 Hệ token (BẮT BUỘC dùng biến của `mitsu.css`, KHÔNG hardcode màu)
Biến: `--bg --surface --surface-2 --text --text-dim --text-muted --accent --accent-deep --seal --moss --line --line-soft --radius --radius-sm`.
Hai theme tự đổi qua `prefers-color-scheme` + thuộc tính `data-theme` trên `<html>`; nút `[data-theme-toggle]` (xử lý sẵn trong `mitsu-theme.js`) vòng Auto→Sáng→Tối.
- Sáng (washi): bg `#F2EBDD`, accent `#C68A3E`, seal `#B83A2E`, text `#1C1C1A`.
- Tối (luxury): bg `#16130E`, accent `#E0AC5E`, seal `#C9483B`, text `#F2EBDD`.

### 0.4 Font (đã `@import` trong `mitsu.css`)
Cormorant Garamond (display) · Be Vietnam Pro (body) · Noto Serif JP (kanji).

### 0.5 Thông tin thương hiệu (để thay chuỗi)
- Tên `Mitsu` · Kanji `蜜` · Mô tả `Cà phê · Trà sữa · Mang đi` · Slogan `Gom mật ngọt, Gắn yêu thương`
- Địa chỉ `Lâm Hà, Lâm Đồng` · `theme-color` PWA `#C68A3E` (thay `#2D5F6B`)
- Nhân vật: 4 con ong **Kin 勤 / Ritsu 律 / Sō 創 / Queen 女王**, mỗi con 6 biểu cảm (determined/joyful/surprised/sleepy/proud/goodbye). Thay bộ sticker ếch `stk-*`. **Ảnh hi-res chủ gửi sau** — giờ dùng placeholder (P1).

### 0.6 GUARDRAILS — KHÔNG ĐƯỢC
- ❌ KHÔNG đổi **logic/giá/schema đặt hàng**. Không đổi cấu trúc `MENU_DATA` trong `web/menu-data.js` (giữ `sku`, `price_m`, `price_l`, `customizations`…). Chỉ được **thêm trường phân loại nhóm** nếu cần (xem P5).
- ❌ KHÔNG sửa logic giỏ hàng / gửi đơn trong `web/order.js`. Chỉ thay **tầng render menu**.
- ❌ KHÔNG phá test: `web/signage.test.js`, `web/mitsu-theme.test.js`, `web/mitsu-menu.test.js` phải còn pass (`node --test web/*.test.js`).
- ❌ KHÔNG xoá vội asset cũ ở P1–P6; việc gỡ ếch gom vào P7.
- ❌ KHÔNG hardcode token/key/`location_id`.

### 0.7 Cách verify mỗi phần
Mở file HTML qua `python3 -m http.server 8082 --directory web` → `localhost:8082/<file>`. Kiểm **cả theme sáng và tối** (đổi màu hệ thống máy, hoặc thêm `data-theme="dark"`/`"light"` vào `<html>`). Console không lỗi. Chức năng cũ còn nguyên.

### 0.8 GIAO THỨC "NẾU KẸT" (quan trọng — chủ sắp hết quota)
Nếu một việc **rủi ro vỡ luồng đặt hàng, vỡ deploy/route/QR**, hoặc bạn **không chắc**: **DỪNG việc đó, ghi chú lại trong `docs/superpowers/handoffs/AG-NOTES.md`** (tạo file, ghi: việc gì, kẹt ở đâu, đã thử gì) rồi **bỏ qua, làm việc khác**. Chủ sẽ cùng Claude xử nốt tuần sau. **Thà bỏ sót còn hơn làm hỏng** phần đang chạy thật.

---

## THỨ TỰ LÀM (theo rủi ro tăng dần)
P1 Assets → P2 Nội bộ → P3 Meta/SEO → P4 Landing → **P5 Menu (lõi)** → P6 Signage → **P7 Rename/Deploy (rủi ro nhất, làm cuối)**.
P1–P4 độc lập, làm song song được. P5 là trọng tâm. P7 chỉ làm khi P1–P6 xong & ổn.

---

## P1 — Bộ asset placeholder (nhân vật + pattern) · rủi ro: thấp
**Tạo:** `web/img/mitsu/`
- 24 ảnh `char-{kin|ritsu|so|queen}-{determined|joyful|surprised|sleepy|proud|goodbye}.webp` (~600×800, nền `#F2EBDD`, kanji nhân vật lớn + nhãn biểu cảm, viền `#C68A3E`). Placeholder tạm.
- `pattern-seigaiha.svg`, `pattern-coffee.svg` (tile, nền trong suốt, tông accent/moss).
**Done:** đủ 24+2 file đúng tên; mở thử 1 ảnh không vỡ tỉ lệ.

---

## P2 — Reskin màn hình nội bộ · rủi ro: thấp
**Sửa:** `web/dashboard.html`, `web/kds.html`, `web/camera.html`
- Link `mitsu.css`, thêm `class="mitsu"` ở body (hoặc map biến màu nội bộ sang token Mitsu).
- Thay màu Kaeru (`#2D5F6B`,`#1C3A42`,`#DB4E37`,`#F5F0E8`…) → token Mitsu. Thay chữ "Kaeru/KaeruKàphê" → "Mitsu 蜜"; logo dùng `<span class="wm">mitsu<span class="dot">.</span></span>` hoặc `<svg class="hanko"><use href="mitsu-assets.svg#hanko"/></svg>`.
**Don't:** không đổi JS/logic/cấu trúc bảng.
**Done:** 3 màn hình mang màu+chữ Mitsu, chức năng nguyên, không lỗi console, đọc được ở cả 2 theme.

---

## P3 — Meta / SEO / PWA / đổi chuỗi thương hiệu · rủi ro: thấp
**Sửa:** `web/index.html`, `web/manifest.json`, `web/sitemap.xml`, `web/robots.txt` (phần meta của `kaeru.html` gộp vào P4)
- `<title>`, `description`, `og:*`, `twitter:*`, `apple-mobile-web-app-title` → tên/slogan/mô tả §0.5.
- `theme-color` `#2D5F6B`→`#C68A3E`. `manifest.json`: `name/short_name/theme_color`, `background_color` `#F2EBDD`.
**Don't:** KHÔNG đổi tên file/route ở đây (để P7). Không đụng layout.
**Done:** xem nguồn index: title/OG/theme-color/manifest đều "Mitsu"; route cũ chạy; không lỗi.

---

## P4 — Rebrand trang giới thiệu (landing) · rủi ro: trung bình
**Sửa:** `web/kaeru.html` (giữ tên file; rename ở P7) — và `web/kaeru.css`, `web/kaeru.js` nếu cần.
- Dựng lại nội dung theo `~/Downloads/mitsu/mitsu-brand-master.html`: câu chuyện ba con ong, Tam Mật (3 nhân vật + Queen), triết lý 3 trụ (巣/蜜/絆), nhận diện, trải nghiệm, slogan. Lấy text từ `mitsu-content.json`.
- Dùng `mitsu.css` (token + component). Nhân vật: dùng `.mitsu-char` + ảnh placeholder P1. Logo: wordmark + hanko + huy hiệu `#badge`.
- Phần "thực đơn trưng bày": dùng **kiểu danh sách + honeycomb như prototype** (`mitsu-menu-proto.html`) — chỉ trưng bày, không cần nối giỏ.
- Cập nhật JSON-LD (`@type CafeOrCoffeeShop`) name → "Mitsu", giữ địa chỉ/giờ.
- Gỡ mascot ếch khỏi nội dung hiển thị (file ảnh ếch để P7 mới xoá).
**Don't:** không đổi tên file/route.
**Done:** landing kể đúng câu chuyện Mitsu, đẹp ở 2 theme, không lỗi console.

---

## P5 — TÍCH HỢP MENU MỚI VÀO APP ĐẶT HÀNG (LÕI) · rủi ro: CAO
> Đây là phần quan trọng & dễ vỡ nhất. Bản thiết kế chuẩn = `web/mitsu-menu-proto.html`. Mục tiêu: thay **tầng hiển thị menu** trong app đặt hàng bằng thiết kế prototype, **giữ nguyên** giỏ hàng/giá/customization/gửi đơn.

**File:** `web/order.js` (render menu + add-to-cart), `web/style.css` (recolor sang token Mitsu), `web/index.html` (link `mitsu.css`).
**Việc:**
1. Recolor `style.css`: thay token màu Kaeru → token Mitsu (giữ layout/flow).
2. Đổi **7 nhóm cũ → 4 nhóm ong** Kin/Ritsu/Sō/Kashi. Dùng `CATEGORIES` mới (giữ `id` ổn định) và thêm trường `bee_group` cho mỗi món **HOẶC** dùng bảng map dưới. KHÔNG đổi `sku/price`.
3. Render menu = **danh sách dòng-chữ theo nhóm** (như prototype) + tuỳ chọn **gallery honeycomb**. Bấm món → **3D carousel** giữa màn (lấy CSS/JS từ prototype). Nút "Thêm vào giỏ" trong carousel gọi đúng hàm add-to-cart hiện có của `order.js` với `sku` tương ứng (giữ customization sugar/ice/topping).
4. Ảnh món: dùng placeholder honeycomb (gradient + tên) như prototype cho tới khi có ảnh thật (đặt tại `web/img/mitsu/drink-<sku>.webp`, lazy-load).

**BẢN ĐỒ XẾP MÓN (nháp — chủ chỉnh tag dễ, đừng coi là cố định):**
| Nhóm | SKU |
|---|---|
| **Kin 勤** (cà phê & trà sữa mỗi ngày) | DR001 đen đá, DR002 sữa đá phin, DR003 Bạc xỉu, DR004 cà phê dừa, DR010 trà sữa truyền thống, DR011 trà sữa Ô Long, DR012 trân châu đường đen, DR013 trà sữa nhài |
| **Ritsu 律** (specialty & trà thuần) | DR007 Americano, DR008 Latte, DR009 Cappuccino/Macchiato, DR021 Hojicha Latte, DR022 Matcha Latte |
| **Sō 創** (sáng tạo / mật / theo mùa) | DR005 cà phê muối, DR006 kem trứng, DR014 trà đào cam sả, DR015 trà sen vàng, DR016 trà vải, DR017 trà chanh giã tay, DR018 freeze trà xanh, DR019 cookies&cream đá xay, DR020 matcha đá xay, DR023 Yuzu Honey Tea |
| **Kashi 菓** (ăn kèm) | BK001 croissant, BK002 tiramisu, BK003 bánh mì pate, BK004 wagashi |

**Don't:** KHÔNG đổi hàm giỏ hàng / tính tiền / gửi đơn / event payload. Nếu nối "Thêm vào giỏ" mà phải đụng logic lõi → **DỪNG, ghi AG-NOTES, để Claude làm tuần sau** (xem §0.8).
**Done:** đặt thử 1 món qua carousel → vào giỏ đúng sku/giá/topping; menu đủ 27 món trong 4 nhóm; 2 theme ok; test cũ còn pass.

---

## P6 — Reskin Signage · rủi ro: trung bình
**File:** `web/signage.html` (+ CSS của nó). **CHÚ Ý:** chủ đang làm dở signage ở nhánh này — chỉ **đổi màu/logo/font sang token Mitsu**, KHÔNG đổi `web/signage.js` và KHÔNG phá `web/signage.test.js`.
**Done:** signage hiển thị màu Mitsu + logo; `node --test web/signage.test.js` còn pass; scene/logic nguyên.

---

## P7 — Đổi tên file / route / domain / social + gỡ asset ếch · rủi ro: CAO NHẤT — LÀM CUỐI
> Đụng deploy/QR đã in/SEO. **Nếu không chắc, để NGUYÊN và ghi AG-NOTES — chủ + Claude review tuần sau.**
- Đổi tên `kaeru.html`→ (vd) `mitsu.html`/`landing.html`; route `/kaeru`→`/mitsu`. **Bắt buộc thêm redirect 301 từ route cũ** (worker config / `_redirects`) để không vỡ QR & link cũ.
- Cập nhật mọi `<link>`/`<a>`/`fetch` trỏ tên cũ. Cập nhật CSP nếu đổi origin.
- Xoá asset ếch (`kaeru-mascot.*`, `stk-*`, `icon*` cũ) sau khi chắc không còn tham chiếu; thay icon/manifest bằng huy hiệu Mitsu.
- Domain (mitsu.coffee) + social handle: việc ngoài code (DNS/đăng ký) — chỉ ghi chú, không tự làm.
**Done (nếu làm):** route cũ 301 sang route mới; không còn tham chiếu tên/asset ếch; deploy thử chạy. **Nếu rủi ro → bỏ, ghi AG-NOTES.**

---

## Tóm tắt commit
Mỗi P commit riêng, tiền tố `feat(mitsu):` / `assets(mitsu):` / `chore(mitsu):`. Sau mỗi P chạy `node --test web/*.test.js` bảo đảm xanh.
Việc đang giữ cho Claude (tuần sau, nếu AG dừng): nối giỏ hàng phức tạp ở P5, và toàn bộ P7 nếu rủi ro.
