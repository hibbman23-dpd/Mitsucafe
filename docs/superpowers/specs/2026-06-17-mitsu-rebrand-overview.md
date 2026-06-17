# Rebrand Kaeru → Mitsu 蜜 — Bản kế hoạch tổng thể

> Ngày: 2026-06-17 · Nhánh khởi đầu: `signage-studio` (nên tách nhánh `mitsu-rebrand`)
> Nguồn định hướng: `~/Downloads/mitsu/mitsu-brand-master.html` + `mitsu-content.json`
> Tài liệu này = bản đồ chương trình + **bảng chia việc Claude Code ↔ Antigravity**.
> Spec chi tiết từng mảng nằm ở file riêng (mảng 1: `2026-06-17-mitsu-foundation-design.md`).

---

## 0. Bối cảnh & quyết định đã chốt

Đổi thương hiệu **toàn diện** từ Kaeru (ếch, nền teal tối) sang **Mitsu 蜜** (ong/mật, junkissa Nhật, nền washi sáng + bản tối luxury).

Quyết định đã chốt với chủ:
- **Phạm vi**: tất cả bề mặt (landing, app đặt hàng, signage, nội bộ) + đổi tên file/route/domain/social.
- **Menu**: GIỮ 27 món + giá hiện có; xếp lại vào 4 nhóm theo tính cách ong (Kin 勤 / Ritsu 律 / Sō 創 / Kashi 菓). KHÔNG thay catalog, KHÔNG đổi schema đặt hàng.
- **Hiển thị menu**: mỗi món là một dòng chữ (tên · giá · chevron); bấm/kéo mở **ô honeycomb (lục giác)** chứa ảnh + mô tả. Ảnh dùng **placeholder tạm, thay dần**.
- **Theme**: nền sáng washi (mặc định) + **bản tối luxury** tự thiết kế từ bảng màu Mitsu; **auto theo `prefers-color-scheme`** + nút chỉnh tay (Auto / Sáng / Tối).
- **Cách tiếp cận**: A — dựng nền tảng thiết kế trước, rồi áp từng bề mặt.
- **Mascot**: ếch + sticker cảm xúc nghỉ hưu → hanko 蜜 + icon ba-ong-một-tâm + bộ sticker "sưu tầm ba con ong".

Ngoài phạm vi web (track riêng, không trong kế hoạch này): logic loyalty backend GAS (mua-10-tặng-1, gom-3-ong), trademark "Mitsu", quay short film, packaging mật ong.

---

## 1. Bảng màu & token (chốt)

| Vai trò | Sáng (washi) | Tối (luxury) | Ghi chú |
|---|---|---|---|
| `--bg` nền | `#F2EBDD` | `#16130E` | tối: sumi sâu hơn #1C1C1A để tạo chiều sâu |
| `--surface` | `#EFE6D4` | `#221C14` | thẻ, ô honeycomb |
| `--text` | `#1C1C1A` | `#F2EBDD` | |
| `--text-dim` | `#3A3833` | `rgba(242,235,221,.62)` | |
| `--accent` hổ phách | `#C68A3E` | `#E0AC5E` | tối: nâng sáng để phát quang |
| `--seal` hanko | `#B83A2E` | `#C9483B` | tối: đỏ dịu cho dễ đọc |
| `--moss` | `#6E7A4F` | `#8A9568` | |
| `--line` | `rgba(28,28,26,.14)` | `rgba(242,235,221,.12)` | |

Font: **Cormorant Garamond** (display) · **Be Vietnam Pro** (body VI) · **Noto Serif JP** (kanji). Giữ Google Fonts như hiện tại (đã có trong CSP); cân nhắc self-host ở mảng 6.

---

## 2. Sáu mảng & thứ tự phụ thuộc

```
[Mảng 1] Nền tảng thiết kế  ──khóa──►  song song: [2] Landing  [4] Signage  [5] Nội bộ
   (tokens, theme, component,                              │
    hợp đồng honeycomb-menu)                               ▼
                              ────────────────►  [3] App đặt hàng (cần hợp đồng honeycomb khóa)
                                                           │
                                                           ▼
                                          [6] Đổi tên/route/domain/social + deploy (cuối)
```

- **Mảng 1 phải xong và khóa trước.** Sau đó 2/4/5 chạy song song được. Mảng 3 cần hợp đồng honeycomb-menu (định trong mảng 1) đã khóa. Mảng 6 làm cuối.

---

## 3. Bảng chia việc — Claude Code ↔ Antigravity

Ký hiệu owner: **CC** = Claude Code giữ · **AG** = giao Antigravity · **AG→CC** = Antigravity làm, Claude review (việc đụng deploy/đơn hàng).

| # | Mảng / việc | Owner | Vì sao | Phụ thuộc |
|---|---|---|---|---|
| 1 | **Nền tảng**: `mitsu.css` (token 2 theme), `mitsu-theme.js`, asset SVG (hanko, ba-ong), bộ component, **hợp đồng honeycomb-menu** | **CC** | Mọi thứ phụ thuộc; quyết định kiến trúc; phải khóa trước | — |
| 2a | **Landing**: port nội dung brand-master vào cấu trúc mới dùng `mitsu.css` (story, tam mật, triết lý, nhận diện, trải nghiệm) | **AG** | Brand-master gần như template sẵn; tự chứa; kiểm chứng bằng mắt | M1 |
| 2b | Landing: tinh chỉnh giọng văn + bố cục hero, micro-interaction | CC | Phần "hồn" thương hiệu, cần phán đoán | M1, 2a |
| 3a | **App đặt hàng — mapping menu**: xếp 27 SKU vào Kin/Ritsu/Sō/Kashi (đề xuất + chốt với chủ) | **CC** | Phán đoán biên tập; ảnh hưởng trải nghiệm | M1 |
| 3b | App: tích hợp honeycomb-menu vào `order.js` (dòng-chữ → mở ô hex), giữ logic giỏ/đặt hàng | **CC** | Đụng luồng ra đơn thật — rủi ro cao | M1, 3a |
| 3c | App: recolor `style.css` từ token Kaeru → token Mitsu (quét cơ học theo bảng map biến) | **AG** | Cơ học, theo bảng map rõ; CC review | M1 |
| 3d | App: thay copy UX (welcome, giỏ trống, xác nhận đơn…) theo `ordering_ux_copy` | AG | Tra-thay chuỗi rõ ràng | M1 |
| 4 | **Signage**: reskin `signage.html`/`signage.js` sang token Mitsu + logo | **AG** | Tự chứa; bạn đang làm dở, dễ bàn giao spec | M1 |
| 5 | **Nội bộ**: reskin `dashboard.html` / `kds.html` / `camera.html` (màu + logo + tên) | **AG** | Cơ học, ít cần brand đẹp, kiểm chứng độc lập | M1 |
| 6a | Meta/SEO/PWA: `<title>`, OG, `theme-color`, `manifest.json`, `sitemap.xml`, `robots.txt`, JSON-LD | AG | Tra-thay chuỗi cơ học | M2–M5 |
| 6b | Gỡ asset Kaeru (mascot ếch, sticker `stk-*`), thêm asset Mitsu placeholder | AG | Cơ học | M1 |
| 6c | Tạo ảnh placeholder honeycomb cho 27 món | AG | Sinh hàng loạt, lặp | M1 |
| 6d | Đổi tên file + worker route + redirect 301 + CSP | **AG→CC** | Đụng deploy/QR đã in — Claude review trước khi merge | tất cả |
| 6e | Domain (mitsu.coffee) + social handle | AG→CC | Ngoài code (DNS/đăng ký); Claude hướng dẫn | 6d |

**Quy tắc bàn giao cho AG**: mỗi việc AG nhận một "thẻ bàn giao" gồm: token contract (`mitsu.css` đã khóa), danh sách biến map cũ→mới, file đụng tới, tiêu chí xong, và "KHÔNG đụng schema/giá/logic đặt hàng". CC review output AG ở 3c và 6d trước khi merge để bảo đảm tuân thủ token.

---

## 4. Thứ tự thực thi đề xuất

1. **CC** làm Mảng 1, commit, khóa `mitsu.css` + hợp đồng honeycomb (spec riêng).
2. Bàn giao song song: **AG** nhận 2a, 4, 5, 6c (đều chỉ cần M1).
3. **CC** làm 3a→3b (đụng đơn hàng), song song AG làm 3c/3d rồi CC ghép.
4. CC làm 2b (tinh chỉnh landing) khi 2a về.
5. Gom tất cả → **AG→CC** làm 6a/6b rồi 6d/6e (deploy) cuối cùng, CC review.

---

## 5. Rủi ro

- **Lệch token** nếu AG không bám `mitsu.css`. Giảm thiểu: khóa M1 trước, CC review 3c/6d.
- **Vỡ đơn hàng** ở 3b. Giảm thiểu: CC giữ, không đổi schema/giá, test luồng đặt trước khi merge.
- **Vỡ QR/SEO** ở 6d. Giảm thiểu: redirect 301, giữ route cũ một thời gian, CC review.
- **Hai theme lệch** (chữ tối đọc không ra). Giảm thiểu: token ngữ nghĩa, kiểm cả hai theme mỗi bề mặt.
