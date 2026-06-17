# Mảng 1 — Nền tảng thiết kế Mitsu (design system)

> Ngày: 2026-06-17 · Owner: Claude Code · Tài liệu cha: `2026-06-17-mitsu-rebrand-overview.md`
> Mục tiêu: lớp nền dùng chung cho mọi bề mặt. KHÔNG đụng menu thật, giá, hay logic đặt hàng.

---

## 1. Phạm vi

Mảng này chỉ tạo nền tảng, chưa áp lên trang thật:
- Lớp token CSS hai theme (sáng/tối) + cơ chế auto/manual.
- Bộ component lõi: wordmark, hanko, icon ba-ong, ô honeycomb.
- **Hợp đồng tương tác honeycomb-menu** (mảng 3 sẽ dùng lại).
- Một trang `mitsu-kit.html` demo nội bộ để xem & test cả hai theme (không deploy cho khách).

Không trong phạm vi: port nội dung trang thật, đổi `style.css` của app, mapping menu, đổi tên file/route.

---

## 2. File tạo mới

| File | Nội dung |
|---|---|
| `web/mitsu.css` | Token (2 theme) + base typography + class component (wordmark, hanko, honeycomb, loader, nút theme) |
| `web/mitsu-theme.js` | Đọc `prefers-color-scheme`, nút 3 trạng thái (Auto/Sáng/Tối), lưu `localStorage`, áp `data-theme` |
| `web/mitsu-assets.svg` | Sprite SVG: `#hanko`, `#three-bees` (dùng `<use>`); hoặc inline khi cần `currentColor` |
| `web/mitsu-kit.html` | Trang demo nội bộ: bày token, component, ô honeycomb, switch theme để duyệt |

Lý do file mới (không sửa `style.css` ngay): các bề mặt migrate dần ở mảng 2–5; tránh vỡ app đang chạy.

---

## 3. Hệ token

### 3.1 Biến ngữ nghĩa (component chỉ dùng nhóm này)
`--bg --surface --surface-2 --text --text-dim --text-muted --accent --accent-deep --seal --moss --line --line-soft --radius --radius-sm`

### 3.2 Hai theme (giá trị ở §1 bảng tổng thể)
- Mặc định (`:root`) = theme **sáng**.
- `:root[data-theme="dark"]` và `@media (prefers-color-scheme: dark)` (khi không có override) = theme **tối**.
- Cơ chế: `<html>` mang `data-theme="light|dark"` khi người dùng chọn tay; khi để "Auto" thì gỡ `data-theme` và để `@media` quyết.

```
:root { --bg:#F2EBDD; --surface:#EFE6D4; --text:#1C1C1A; --text-dim:#3A3833;
        --accent:#C68A3E; --accent-deep:#9C6A2C; --seal:#B83A2E; --moss:#6E7A4F;
        --line:rgba(28,28,26,.14); --line-soft:rgba(28,28,26,.08); }
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ /* dark values */ } }
:root[data-theme="dark"]{ --bg:#16130E; --surface:#221C14; --text:#F2EBDD;
        --text-dim:rgba(242,235,221,.62); --accent:#E0AC5E; --accent-deep:#C68A3E;
        --seal:#C9483B; --moss:#8A9568; --line:rgba(242,235,221,.12); --line-soft:rgba(242,235,221,.07); }
```
(Quy tắc brand: một bề mặt dùng tối đa 3/5 màu; hanko chỉ ở con dấu + số chi nhánh, không làm nền.)

### 3.3 Anti-flash
`mitsu-theme.js` chạy **đồng bộ trong `<head>`** (trước khi vẽ body) để set `data-theme` từ `localStorage`, tránh nhấp nháy theme khi tải.

---

## 4. Component lõi

| Component | Markup | Hành vi |
|---|---|---|
| Wordmark | `<span class="wm">mitsu<span class="dot">.</span></span>` | Cormorant 600; `.dot` màu `--accent` (giọt mật); tự đổi theo theme |
| Hanko 蜜 | `<svg class="hanko"><use href="#hanko"/></svg>` | Nền `--seal`, kanji cream, xoay -3°; dùng làm chữ ký |
| Icon ba-ong | `<svg class="bees"><use href="#three-bees"/></svg>` | 3 nét bay (tròn/vuông/xoáy) hội tụ về hanko; biến thể tĩnh + biến thể loader (animate stroke-dashoffset, tắt khi reduced-motion) |
| Loader | `.mitsu-loader` (icon ba-ong + chữ "Đang pha mật…") | Thay spinner mặc định |
| Nút theme | `<button class="theme-toggle">` | Vòng 3 trạng thái Auto→Sáng→Tối; icon `sun/moon/contrast`; cập nhật `aria-label` |
| Ô honeycomb | xem §5 | Khối dựng menu + lưới hình |

Lục giác honeycomb (flat-top): `clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)`.

---

## 5. Hợp đồng tương tác honeycomb-menu (mảng 3 dùng lại)

Mục tiêu: danh sách menu "sạch" dạng dòng chữ; mở ra ô honeycomb có ảnh + mô tả khi tương tác.

### 5.1 Markup chuẩn
```
<ul class="hc-menu">
  <li class="hc-item">
    <button class="hc-line" aria-expanded="false" aria-controls="d-DR005">
      <span class="hc-name">Cà phê muối</span>
      <span class="hc-dots"></span>
      <span class="hc-price">30k</span>
      <i class="hc-chev" aria-hidden="true"></i>
    </button>
    <div class="hc-detail" id="d-DR005" hidden>
      <div class="hc-cell"><img loading="lazy" alt="Cà phê muối" src="…placeholder…"></div>
      <p class="hc-desc">…mô tả / story…</p>
    </div>
  </li>
</ul>
```

### 5.2 Hành vi
- Bấm `.hc-line` → toggle `.hc-detail` (`hidden` ↔ hiện), đổi `aria-expanded`, xoay chevron.
- Chỉ một item mở mỗi nhóm (accordion) — hoặc cho mở nhiều: **chốt = accordion một-mở** (gọn cho mobile).
- Mở/đóng có chuyển động trượt nhẹ; `@media (prefers-reduced-motion)` → bỏ animation, đổi tức thì.
- Ảnh `loading="lazy"`; chưa có ảnh thật → ô hex hiện placeholder (icon `--accent` trên `--surface`).
- Bàn phím: `.hc-line` là `<button>` thật → Enter/Space mở; focus ring `--accent`.

### 5.3 Ràng buộc cho mảng 3
- Component không biết gì về giá/SKU; mảng 3 bơm dữ liệu từ `MENU_DATA` vào markup này.
- Không đổi cấu trúc `MENU_DATA`; chỉ đọc `name`, `price_m`, `story` (nếu có) + `subcategory` để xếp nhóm.

---

## 6. Trang demo `mitsu-kit.html`

Trang nội bộ (không cho khách) để duyệt nền tảng: bày swatch hai theme, typography scale, wordmark/hanko/bees, loader, và một `hc-menu` mẫu vài món giả. Có nút theme để test auto/manual + reduced-motion. Đây là "bằng chứng" để duyệt M1 trước khi áp lên trang thật.

---

## 7. Tiêu chí hoàn thành (Definition of Done)

- [ ] `mitsu.css` định nghĩa đủ token cho cả hai theme; component render đúng ở cả sáng/tối.
- [ ] `mitsu-theme.js` auto theo OS; nút 3 trạng thái hoạt động; lưu `localStorage`; không nhấp nháy khi tải.
- [ ] Hanko + icon ba-ong render từ sprite; loader chạy & tắt khi reduced-motion.
- [ ] `hc-menu` mẫu: bấm mở/đóng đúng, accordion một-mở, aria + bàn phím + reduced-motion đạt.
- [ ] Tương phản chữ đạt WCAG AA ở cả hai theme (kiểm `--text`/`--text-dim` trên `--bg`/`--surface`).
- [ ] `mitsu-kit.html` mở được, đổi theme mượt; không lỗi console.
- [ ] Không file nào của app đặt hàng/landing bị sửa trong mảng này.

---

## 8. Câu hỏi mở (chốt khi review)

1. Accordion **một-mở** mỗi nhóm — OK chứ? (đề xuất: có, gọn mobile)
2. Self-host font hay giữ Google Fonts? (đề xuất: giữ Google Fonts ở M1, tính self-host ở M6)
3. Nút theme 3 trạng thái (Auto/Sáng/Tối) hay chỉ 2 (Sáng/Tối)? (đề xuất: 3, vì bạn muốn auto theo máy)
