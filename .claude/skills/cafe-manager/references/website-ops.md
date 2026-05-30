# Reference — Website Operations (kaeru.html + index.html)

> Mục tiêu: gợi ý sửa landing dựa trên metrics, không rewrite tự do.

## Cấu trúc 2 trang web

| Trang | Vai trò | Path | Vùng dễ sửa |
|---|---|---|---|
| `kaeru.html` | Landing branding/story | [web/kaeru.html](../../../../web/kaeru.html) | Hero (line ~1019), Story (~1067), Menu (~1101), Stickers (~1230), Merch (~1538), Footer (~1623) |
| `index.html` | Order PWA (Glide-style) | [web/index.html](../../../../web/index.html) | (App shell — sửa cẩn thận) |

Promo banner dynamic ở kaeru.html line ~973-976, controlled bởi `Promo.gs` GAS endpoint.

## Khi nào sửa kaeru.html

Trigger sửa landing:
1. **Launch món mới** → update Menu section (line 1109-1211)
2. **Promo có sẵn** → đã tự update banner qua `checkPromo()` JS, không cần sửa
3. **Đổi hero copy** → update `<h1 class="hero-h1">` line ~1021
4. **Update phone/address** → 3 chỗ: schema.org (line 36), footer (line ~1683), maps link (line ~1046)
5. **Thêm/đổi social handle** → line 1030-1049 (hero) + 1650-1654 (footer)
6. **Đổi mascot/sticker** → `web/img/stk-*.jpg` (9 file) + reference line 1460-1523
7. **SEO meta** → line 7 (description), 9-15 (OG), 28-58 (schema.org)

## Pattern sửa Menu section (vd: thêm SKU mới)

Mỗi menu card line ~1110-1117 format:

```html
<div class="menu-card reveal d1">
  <div class="mc-img" style="background:linear-gradient(135deg,COLOR1,COLOR2)">EMOJI</div>
  <div class="mc-body">
    <div class="mc-cat">DANH MỤC</div>
    <div class="mc-jp">日本語</div>
    <div class="mc-en">Tên Việt</div>
    <div class="mc-foot"><span class="mc-price">XX.000đ</span><span class="mc-tag">TAG</span></div>
  </div>
</div>
```

**Class delay**: `.reveal d1` / `d2` / `d3` / `d4` để stagger animation. Xen kẽ trong grid.

**Color palette per category**:
| Category | Gradient |
|---|---|
| ĐẶC TRƯNG (matcha) | `rgba(45,95,107,.35), rgba(45,95,107,.1)` |
| KINH ĐIỂN (hojicha/đá) | `rgba(122,140,79,.3), rgba(122,140,79,.1)` |
| THEO MÙA (soda/trái cây) | `rgba(235,98,74,.25), rgba(235,98,74,.07)` |
| BÁNH | `rgba(168,155,128,.3), rgba(168,155,128,.1)` |
| ĐẶC SẢN (bạc xỉu) | `rgba(196,168,114,.3), rgba(168,155,128,.15)` |

## Pattern sửa Hero copy

Hero copy nằm line 1019-1027:
- `.hero-eyebrow` — micro-label trên h1 (line 1020)
- `.hero-h1` — heading chính (line 1021)
- `.hero-sub` — kanji line (line 1022)
- `.hero-tag` — tagline JP (line 1023)
- `.hero-tag-en` — tagline VN (line 1024)

Khi sửa: GIỮ structure, chỉ swap text. KHÔNG đổi inline style trừ khi cần.

## Pattern thêm promo banner copy

Promo banner data-driven — không cần sửa HTML. Server (Promo.gs) trả `data.promo.message` → JS render vào `#promo-msg`. Để đổi:
1. Vào Sheets tab PROMOTIONS
2. Tạo campaign mới với column `message` + `start_time`/`end_time`
3. `checkAndRunCampaigns()` tự bật khi đến giờ

Plain text message. KHÔNG support HTML.

## Update SEO meta

Khi sửa: bắt buộc đồng bộ 3 nơi:
1. `<meta name="description" ...>` (line 7)
2. `<meta property="og:description" ...>` (line 13)
3. `"description": "..."` trong schema.org JSON-LD (line ~30)

Phone đồng bộ 2 nơi:
1. `"telephone": "+84975087429"` schema.org (line 36)
2. `📞 0975087429` footer (line ~1684)

## Verification flow sau edit

1. Lưu file
2. Run preview: `mcp__Claude_Preview__preview_start` config `kaeru-web` (port 8082)
3. Navigate to `http://localhost:8082/Projects/lamha-kissaten/web/kaeru.html`
4. Inspect changed element qua `preview_inspect`
5. Screenshot quan trọng visual change
6. Check console errors qua `preview_console_logs`
7. Commit (chỉ khi user xác nhận) + clasp push (nếu có sửa GAS)

## Khi user nói "trang web load chậm"

Diagnose order:
1. `preview_network` xem request size
2. Check ảnh `web/img/*` — có file nào >500KB không
3. Check Cloudflare Analytics → load time + region
4. Check landing có bao request external (fonts, analytics, etc.)

Performance baseline target:
- LCP < 2.5s
- Total page weight < 1.5MB
- Largest image < 300KB

## Khi user nói "muốn đổi màu/font"

KHÔNG đổi bừa. Tham chiếu palette ở `_brand-voice.md` §7. Đổi bừa = break brand consistency.

Nếu user muốn đổi → đề xuất tạo 1 variant trên branch, test side-by-side, rồi merge.

## Anti-patterns

- ❌ Rewrite cả section khi user chỉ muốn đổi 1 chữ
- ❌ Đổi inline color → break palette
- ❌ Thêm font mới
- ❌ Đẩy script external mới mà không update CSP
- ❌ Skip preview verify
- ❌ Commit + push thẳng không hỏi user
