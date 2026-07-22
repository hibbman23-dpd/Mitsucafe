# Specialized Aesthetic Design System — "Japanese × Honey/Bee" Product Plan
# v1.1 · 2026-07-07 · Sản phẩm C (lane quốc tế, song song A/B trong digital-product-plan.md)
# (v1.0→v1.1: thêm §2.4 GAP "thị trường cần, mình chưa có" + module M9 + sửa effort estimate)

> Nguồn: phân tích asset thật (`web/mitsu.css`, `typography-explorations.html`, `logo-explorations.html`,
> `seal-honeycomb.html`, `signboard-concept.html`, `sign-relief-explainer.html`, `docs/brand-voice.md`)
> + market research Etsy/Gumroad 2026-07-07.

---

## 1. DESIGN DNA — hệ thống hóa phong cách Mitsu

Đây là phần giá trị nhất: cái đem bán không phải file, mà là **DNA có thể tái tạo**. DNA gồm 7 lớp:

### 1.1 Concept core (lớp sinh ra mọi thứ)
- **Wordplay nền tảng**: 蜜 (mật) ≈ 密 (gắn kết) — "một giọt mật cần ba con ong khác tính".
  → Mọi motif đều encode ý này: 3 chấm mật (tam-mật), 3 ong quanh 1 queen, honeycomb = cộng đồng.
- **Định vị Junkissa**: Nhật là *gia vị* (framing, seal, type), chất liệu bản địa là *chủ thể*.
  Đây chính là công thức generic hóa được: `[Japanese device] × [nature theme] × [local material]`.
- Bài học đóng gói: khách mua không chỉ mua hexagon — mua **phương pháp giấu nghĩa vào hình**.

### 1.2 Color system (đã ship production, 2 theme)
```
Light:  bg #F1E5CB (washi cream) · surface #ECE0C4 · ink #1C1C1A
        honey #C68A3E · honey-deep #9C6A2C · seal-red #B83A2E · moss #6E7A4F
Dark:   bg #16130E · surface #221C14 · text #F2EBDD
        honey #E0AC5E · honey-deep #C68A3E · seal-red #C9483B · moss #8A9568
```
**Usage rules (đây là thứ template rẻ không có):**
- Tối đa 3/5 màu chính trên một bề mặt.
- Seal-red CHỈ làm hanko/chữ ký/niêm phong — không bao giờ làm nền lớn.
- Honey = accent duy nhất cho CTA; moss = màu "tự nhiên" phụ trợ.
- Dark theme không phải đảo màu — là bảng riêng đã tinh chỉnh độ ấm.

### 1.3 Typography system + hidden elements (signature move)
Stack: **Fraunces** (display, italic-friendly) · **Be Vietnam Pro** (body, hỗ trợ tiếng Việt) · **Noto Serif JP** (kanji). Explorations mở rộng: Zen Kaku Gothic (khối đậm), Shippori Mincho, brush script.

**5 kỹ thuật "giấu tổ ong vào chữ" (đã prototype trong `typography-explorations.html`):**
| # | Tên | Japanese device | Hive device |
|---|---|---|---|
| 1 | Honeycomb Inlay | 印 triện | lưới lục giác clip trong lòng chữ, vài ô đổ mật |
| 2 | Sumi Brush | 筆 thư pháp kasure | chấm chữ "i" = giọt mật rơi, mật nhỏ giọt cuối nét |
| 3 | Hex-Grid Build | 構 hình học kamon | chữ dựng trên lưới 60° như khắc từ tổ ong |
| 4 | Hiragana Bridge | つ hiragana | đuôi chữ vuốt thành つ ôm một ô mật (みつ = Mitsu) |
| 5 | Enso Seal Lockup | 円相 enso + triện | tittle = ô lục giác nhũ vàng + underline mật |

**Seal system (`seal-honeycomb.html`)**: chữ 蜜 monoline decompose 宀/必/虫, maze fillers, nét "hôn" khung — khung lục giác thay khung vuông triện truyền thống → "hexagon hanko" là invention riêng, chưa thấy trên thị trường.

### 1.4 Pattern & motif library
- Honeycomb flat-top grid (parametric — có sẵn hàm JS sinh lưới)
- Seigaiha 青海波 (sóng Nhật) · washi paper grain · hoa & quả cà phê
- Honey drop path (có công thức bezier sẵn) · tam-mật 3 chấm

### 1.5 Illustration / mascot logic
Bộ 4 nhân vật với **attribute cố định** (Kin: khăn 勤 + giỏ; Ritsu: tạp dề + V60; Sō: hoa + trà sữa; Queen: vương miện + giọt mật), 6 biểu cảm/nhân vật. Bài học đóng gói: mascot system = *character sheet + attribute rules*, không phải bộ ảnh.

### 1.6 Physical / production layer (moat thật sự)
- Kanban gỗ live-edge + 3 kỹ thuật khắc (chìm / nổi phủ bóng / khảm epoxy) — đã có explainer SVG.
- Kỷ luật "logo sống thật ở favicon và bill nhiệt": mọi mark test ở size nhỏ + 1 màu.
- QR standee đã brand hóa (`mitsu-order-qr-brand.svg`).
- 3D print pipeline: Upscayl ultrasharp-4x cho texture emblem, vector chỉ cho mark sạch.

### 1.7 Voice layer
Archetype 50 Caregiver / 30 Sage / 20 Explorer + vocabulary do/don't (cấm "premium/luxury/đẳng cấp") — voice guidelines đi kèm visual = thứ brand kit Etsy không bao giờ có.

---

## 2. MARKET RESEARCH (2026-07)

### 2.1 Cầu
- Gumroad 2026: design assets, AI prompt packs, bundles nằm trong nhóm bán chạy nhất; **bundle/ecosystem outperform template lẻ** ([Gumroad trends 2026](https://conversionproplus.com/blog/gumroad-trends-2026-what-s-selling-right-now), [Etsy 2026 trends](https://dylanjahraus.com/digital-products-to-sell-on-etsy-in-2026-6-top-trends-16980-mo/)).
- Niche-targeted kit (theo ngành: photographer, wellness...) outperform generic ([mydesigns.io](https://mydesigns.io/blog/gumroad-for-selling-digital-products/)).
- Kênh: Etsy = discovery + phí ~6.5%; Gumroad = own-traffic + phí 10%, launch tức thì. Chiến thuật chuẩn: bản lite free trên Figma Community → funnel về bản full ([DesignerIncome](https://www.designerincome.com/blog/how-to-sell-your-figma-ui-kit-on-gumroad-2026)).

### 2.2 Đối thủ
| Phân khúc | Ví dụ | Giá | Điểm yếu |
|---|---|---|---|
| Bee/honey logo bundle | [Etsy bee branding kit](https://www.etsy.com/market/bee_branding_kit), [beehive bundle](https://www.etsy.com/listing/1494282293/beehive-logo-branding-bundle-modern-boho) | $5–30 | SVG/Canva rời rạc, boho-generic, không system, không rules |
| Brand kit Canva | [Etsy brand kit](https://www.etsy.com/market/brand_kit) | $10–50 | Đổi màu + font là hết, không concept |
| Figma design system | [OE Enterprise](https://ojo.gumroad.com/l/oesystem), [Material Me](https://felixco.gumroad.com/l/material-me), [Brand Design System](https://brandingboard.gumroad.com/l/brand-design-system-figma) | $30–130 | UI/product-app focus, không aesthetic-brand, không physical |
| Prompt pack | [25k Midjourney prompts](https://www.etsy.com/listing/4380763524/25000-midjourney-prompts-pack-2026-ai) | $5–15 | Race-to-bottom, số lượng thay chất lượng, không style-locked |
| Moodboard brand prompts | [luxury wedding pack](https://www.etsy.com/no-en/listing/4367035941/ai-midjourney-mood-board-brand-prompt) | $15–40 | Gần nhất với ý tưởng, nhưng chỉ moodboard, không system |

### 2.3 Khoảng trống
1. **Giao điểm Japanese × honey/bee ≈ trống**: bee kits = boho/farm/apiary Mỹ; Japanese kits = wabi-sabi/minimal riêng. Chưa ai làm "junkissa hive".
2. **Không ai bán "aesthetic OS"**: tokens code thật + typography method + pattern parametric + prompt library + physical production specs trong MỘT hệ. Từng mảnh có người bán; tổ hợp thì không — vì người bán template không vận hành quán thật.
3. **Prompt library style-locked**: prompt pack thị trường bán số lượng; gap = prompt **tái tạo đúng một style** với ảnh proof thật.
4. **Digital → physical bridge**: không competitor nào kèm STL/spec khắc gỗ/hướng dẫn in tem nhiệt. Đây là moat từ 3D printing + quán thật.

### 2.4 GAP — THỊ TRƯỜNG CẦN, MÌNH CHƯA CÓ (research 2026-07-07)

Asset hiện tại = HTML/JS/SVG code + docs tiếng Việt. Buyer Etsy/Gumroad điển hình = chủ shop nhỏ KHÔNG phải designer/dev. Mỗi gap dưới đây = quyết định sản phẩm:

#### GC1 🔴 Canva editable — format mặc định của thị trường
- Buyer Etsy kỳ vọng **Canva template link**, edit trong tài khoản họ; Canva template bán được giá cao hơn chính vì editable ([Insight Agent guide](https://www.insightagent.app/guides/selling-canva-templates-on-etsy)). Complaint phổ biến nhất: template không edit được như kỳ vọng, hoặc dùng element Canva Pro khiến tài khoản free vỡ layout ([Firther Design](https://www.firtherdesignco.com/blog/buyer-anxiety-on-etsy-and-how-can-you-avoid-it)).
- Mình có: 0 file Canva. Toàn bộ là code.
- **Quyết định:** mọi SKU C1–C3 phải ship bản Canva song song (free-account-safe, không Pro elements) + delivery chuẩn = PDF chứa template links (giải quyết luôn complaint "mobile Etsy chôn nút download"). SVG/tokens/Figma = tier "pro buyer", Canva = tier mass.

#### GC2 🔴 Figma files — funnel chuẩn của dân design
- Playbook chuẩn: bản lite free trên Figma Community làm lead magnet → full trên Gumroad ([DesignerIncome](https://www.designerincome.com/blog/how-to-sell-your-figma-ui-kit-on-gumroad-2026)). Mình chưa có file Figma nào.
- **Quyết định:** port tokens → Figma Variables, 5 type recipes → components, pattern → styles. C0 lite = Figma Community. (Figma MCP có sẵn trong tool stack — build được từ code hiện có.)

#### GC3 🔴 Social media templates — thành phần brand kit 2026 bắt buộc
- Bestseller thực tế: [2100 IG templates](https://www.etsy.com/listing/4459862410/2100-instagram-templates-for-canva-posts) (640 post + 640 story + 450 carousel + reel/highlight covers + bonus Notion planner, ~4.5k favorites); buyer 2026 coi brand kit = "production system": dựng identity 1 lần, áp lên post/story/carousel/reels ([getly](https://www.getly.store/blog/top-18-social-media-templates-free-in-2026-instagram-tiktok-linkedin-and-pinterest-canvafigmaphotoshop-pack)).
- Mình có: per-platform format specs trong brand-voice.md (§5) — tức có *ruleset* nhưng 0 template file.
- **Quyết định:** module M9 mới. KHÔNG đua số lượng (nghìn template = race to bottom) — đi chất: 40–60 template Canva theo đúng system (post/story/carousel/reel cover/highlight) + content-pillar mapping (dịch từ brand-voice framework). Đóng vào C2/C3.

#### GC4 🟡 Video tutorial + English-first
- Listing tốt kèm tutorial video; pack bestseller đều có "how to use" video. Toàn bộ docs/video hiện tại tiếng Việt.
- **Quyết định:** guidelines PDF + 3–4 video tutorial tiếng Anh (script viết trước, voiceover AI được — đã có pipeline); listing copy + support template tiếng Anh. Đây là chi phí ẩn lớn nhất — cộng ~1 tuần công.

#### GC5 🟢 Etsy từ VN — verified khả thi, có phí ẩn
- Vietnam được Etsy Payments hỗ trợ trực tiếp: bank VND local, KHÔNG cần Payoneer; bắt buộc đăng ký Individual seller; phí payment VN 4.5% + 11.500₫/đơn + Regulatory Operating Fee 1.24% (trên cả transaction 6.5%) ([StoreFleet playbook](https://storefleet.io.vn/blog/etsy-pod-tu-viet-nam/), [Etsy payments policy](https://www.etsy.com/legal/etsy-payments/), [Alura country guide](https://www.alura.io/docs/article/etsy-payments-guide-by-country)). Tổng phí Etsy thực ~12–13% → Gumroad 10% flat vẫn là kênh chính, Etsy làm discovery.
- **Việc phải làm:** mở shop, verify ID, bank verify sau đơn đầu.

#### GC6 🟢 Licensing — phải viết rõ, chưa có gì
- Fonts: Fraunces/Be Vietnam Pro/Noto Serif JP đều OFL — bundle trong product OK, cấm bán font file riêng ([Google Fonts licensing](https://fonts.google.com/knowledge/glossary/licensing), [madegooddesigns](https://madegooddesigns.com/google-fonts-commercial-use/)). An toàn nhất: link tải + hướng dẫn, không đóng file font vào zip.
- STL: chuẩn thị trường = personal license mặc định, **merchant/commercial tier riêng** (kiểu "bán tối đa 25 bản in vật lý/license") ([ví dụ listing](https://www.etsy.com/listing/1590156617/commercial-license-3d-printer-stl-file), [pea3d guide](https://pea3d.com/en/is-selling-3d-prints-legal-guide-2026/)).
- **Quyết định:** viết LICENSE.md cho toàn hệ: personal + small-commercial (1 brand) mặc định; extended license (agency/nhiều client) = SKU add-on; STL merchant tier riêng. KHÔNG bán PLR/MRR.

#### GC7 🟡 Mockup format — buyer muốn PSD smart-object hoặc Canva frame
- Mình không có Photoshop. Có Affinity (export PSD được) hoặc làm mockup dạng Canva frame.
- **Quyết định:** M8 ship 2 format: Canva frame mockup (mass) + PSD export từ Affinity (pro). Test PSD mở được trong Photopea trước khi bán.

#### Bảng tổng effort thật (sửa ước lượng v1.0)
| Layer | v1.0 nói | Thực tế sau gap research |
|---|---|---|
| Concept/DNA/method | sẵn 100% | ✅ đúng |
| Tokens/SVG/code | sẵn ~90% | ✅ generic hóa là xong |
| **Format thị trường cần** (Canva, Figma, social pack, video EN, license, mockup) | không tính | ❌ **~0% — đây là 50–60% khối lượng build thật** |

→ "Asset sẵn ~70%" (v1.0) là ảo. Đúng hơn: **DNA sẵn 100%, deliverable sẵn ~40%**. C0+C1 vẫn nhét được tuần 4–5 nhưng C1 phải gồm bản Canva ngay từ đầu — không ship code-only.

---

## 3. CẤU TRÚC SẢN PHẨM — "Specialized Aesthetic Design System"

Tên làm việc: **KISSA HIVE** (hoặc giữ dòng "Mitsu Method"). 9 module.
**Luật format (từ §2.4):** mỗi module visual ship 2 tier — **Canva** (mass buyer, free-account-safe) + **Figma/SVG/code** (pro buyer). Không module nào ship code-only.

### M1 — Design Tokens & Foundation
`tokens.json` (W3C design tokens) + `theme.css` (2 theme, bản generic hóa từ mitsu.css) + Figma Variables.
**Lý do**: tokens = xương sống mọi module sau; code thật đã chạy production = proof điểm khác biệt với PNG-kit.

### M2 — Typography System + Hidden Elements
Font stack 3 tầng (display/body/CJK) + scale + casing rules + **5 recipe "hidden hive"** dạng: SVG template có thể sửa + hàm JS parametric (honeycomb(), honeyDrop()) + tutorial từng bước + worksheet "áp cho tên brand CỦA BẠN".
**Lý do**: đây là signature — thứ khiến người ta mua hệ này thay vì font pairing miễn phí. Bán *method*, không chỉ file.

### M3 — Pattern & Illustration Library
Honeycomb parametric (3 mật độ × 2 theme) · seigaiha · washi grain · honey drop · tam-mật · hexagon hanko frame blank (tự đặt chữ/initial vào) · mascot character-sheet framework (attribute rules, không bán nhân vật Mitsu — bán khung tạo nhân vật).
**Lý do**: SVG + seamless tile + PNG 300dpi = dùng được cả web lẫn in; hanko frame trống = khách tự cá nhân hóa → tăng perceived value.

### M4 — Packaging & Signage System
Dieline cup sleeve/túi kraft/hộp bánh + tem nhiệt 58mm template (1 màu, test thật trên Xprinter) + kanban gỗ spec: 3 kỹ thuật khắc kèm explainer + QR standee template.
**Lý do**: chỉ người vận hành quán thật mới viết được chương này đúng; ảnh chụp sản phẩm THẬT tại Mitsu = sales asset không copy được.

### M5 — 3D Asset Integration
STL/3MF: hanko stamp lục giác (khắc chữ tùy chỉnh) · coaster tổ ong · khay đựng tem · bảng test khắc chữ. Kèm print settings + hướng dẫn upscale texture (Upscayl workflow đã verify).
**Lý do**: KHÔNG competitor nào có. Giá vốn ~0 (đã có printer + pipeline). Feature này một mình nó justify tier cao nhất.

### M6 — AI Prompt Library (style reproduction)
30–50 prompt **đã test** (Higgsfield/Midjourney/Nano Banana): mascot trong style, food photography theo palette, texture washi, mockup signage... Mỗi prompt kèm ảnh output thật + ghi chú anti-plastic (từ higgsfield-director know-how). Cấu trúc: `[base style block] + [subject slot] + [negative block]` — khách thay slot.
**Lý do**: chống copy (prompt bị leak thì ảnh proof + cấu trúc block vẫn là của mình); thị trường prompt đang bán rác số lượng → chất lượng curated đứng riêng.

### M7 — Brand Guidelines & Usage Rules
PDF/Notion template ~30 trang: concept story framework (wordplay method: tìm cặp từ đồng âm của brand khách) · color rules (3/5, seal-only-signature) · type rules · pattern dos/don'ts · voice sliders (4 trục formal/playful/poetic/local) + vocabulary do-don't template.
**Lý do**: guidelines = thứ biến "bộ file" thành "design system", cho phép định giá gấp 3–5 lần.

### M8 — Mockup Templates
Mockup 2 format (GC7): Canva frame + PSD (export Affinity, test Photopea): cup + sleeve, biển gỗ, tem nhiệt, menu, IG grid 9 ô, QR standee. Ưu tiên chụp thật tại Mitsu rồi làm smart-object.
**Lý do**: mockup từ quán thật ≠ mockup stock — vừa là module vừa là marketing.

### M9 — Social Media Template Pack (MỚI — gap GC3)
40–60 template Canva theo system: IG post / story / carousel / reel cover / highlight cover + content-pillar map (dịch + generic hóa từ brand-voice.md §5–6: story arcs, per-platform format rules). Kèm mini Notion content planner (chuẩn bestseller có bonus planner).
**Lý do**: thành phần bắt buộc của brand kit 2026 theo kỳ vọng buyer; mình có ruleset độc quyền (voice + format specs đã vận hành thật) — đi chất thay vì đua nghìn template.

---

## 4. PRODUCT LADDER — 4 SKU + 1 service

| # | SKU | Nội dung | Giá | Kênh |
|---|---|---|---|---|
| C0 | **Hive Patterns (free/lite)** | 3 pattern (Canva + Figma) + 1 recipe type + preview guidelines | $0 (email-gate) | Figma Community + Canva link / Gumroad — lead magnet |
| C1 | **Hidden Hive Type Kit** | M2 đầy đủ (Canva + SVG/Figma) + mini token set + video tutorial EN | $19–29 | Etsy + Gumroad |
| C2 | **Kissa Hive Design System** | M1+M2+M3+M7+M8+**M9** — mọi module 2 tier Canva/Figma + 3 video EN | $79 early → $99 | Gumroad chính, Etsy listing trỏ về |
| C3 | **Kissa Hive Complete** (flagship) | C2 + M4 + M5 + M6 (packaging, STL kèm merchant tier riêng, prompt library) | $149 early → $189 | Gumroad |
| C3b | **Extended License add-on** | Quyền dùng cho nhiều client/agency (GC6) | +$79 | Gumroad |
| C4 | **Semi-custom "Your Hive"** | Áp method vào brand khách: đổi wordplay, palette shift, 1 logotype hidden-element, 5 prompt riêng | $399–499, 5 suất/tháng | Direct/Gumroad |

Phí kênh (GC5): Etsy VN tổng ~12–13% (transaction 6.5% + payment 4.5%+11.5k₫ + regulatory 1.24%) vs Gumroad 10% flat → Gumroad = kênh doanh thu chính, Etsy = discovery + social proof (review).

Logic ladder: C0 gom list → C1 volume + review Etsy → C2 sản phẩm chính → C3 margin (khác biệt STL+prompt) → C4 chính là "Done-With-You" phiên bản quốc tế, đồng dạng với ladder VN (Pack A → OS B → DWY).

Doanh thu kịch bản 90 ngày (thận trọng): C1 40×$24 + C2 25×$85 + C3 10×$160 + C4 2×$450 ≈ **$5,600 ≈ 140tr** — nhưng cần discount kỳ vọng: Etsy niche mới, không audience quốc tế sẵn → thực tế 90 ngày đầu có thể 20–30% con số này. Gate: C2 <10 đơn sau 45 ngày → dồn về C4 service.

---

## 5. LỢI THẾ CẠNH TRANH & CÁCH KHAI THÁC

1. **"Deployed, not mocked"** — positioning chủ lực: *"This system runs a real café in the Đà Lạt highlands"*. Mọi listing image = ảnh thật: biển gỗ, tem in, ly, web đang chạy. Competitor bán mockup; mình bán hệ đã sống. (Đồng bộ positioning "quán thật Đà Lạt" của memory digital products.)
2. **Code thật trong hộp**: mitsu.css 2-theme production → khách dev/designer nhận `tokens.json` + CSS chạy được, không chỉ style guide PDF.
3. **3D printing moat**: STL đi kèm brand kit = category of one. Content angle: "I 3D-printed my café's brand" — TikTok/Reels quốc tế rất hợp.
4. **Method > asset**: 5 hidden-element recipes + wordplay framework dạy được → mở đường course/workshop sau (LTV cao hơn template).
5. **AI pipeline đã verify**: prompt library có ảnh proof + anti-plastic notes từ kinh nghiệm Higgsfield thật — đúng lúc thị trường prompt pack đang mất giá vì rác.
6. **Trilingual type handling** (VN diacritics + kanji + Latin) — nỗi đau thật của brand Á muốn chất Nhật; ít seller phương Tây làm đúng.

**Rủi ro & đối phó:**
- *Trùng lịch với A/B (launch 28/07 + 01/09)*: KHÔNG build C song song. C0+C1 làm được nhanh (asset có sẵn ~70%), nhét tuần 4–5; C2/C3 sau khi B ship. C4 chỉ mở khi C2 có traction.
- *Copy lậu*: chấp nhận như plan A/B — moat = ảnh quán thật + update + method.
- *Cannibalize brand Mitsu?* Không bán nhân vật Kin/Ritsu/Sō và chữ 蜜 hoàn chỉnh — bán framework + hexagon hanko trống. Brand Mitsu giữ làm case study.

## 6. NEXT ACTIONS (khi được duyệt — thứ tự đã sửa theo §2.4)
- [ ] C-1: Generic hóa mitsu.css → `tokens.json` + theme.css không tên Mitsu.
- [ ] C-2: Đóng gói 5 type recipes thành SVG editable + **bản Canva tương đương** + hướng dẫn EN (từ typography-explorations.html). Test bằng tài khoản Canva free.
- [ ] C-3: Port tokens + recipes + patterns sang Figma (Variables/components/styles) — nền cho C0 lite trên Figma Community.
- [ ] C-4: Viết LICENSE.md (personal/small-commercial mặc định, extended add-on, STL merchant tier) + trang "fonts: OFL, tải từ Google Fonts".
- [ ] C-5: Chụp bộ ảnh production tại quán (biển, tem, ly, standee) — dùng chung cho listing + mockup M8.
- [ ] C-6: Mở Etsy shop VN (Individual) + Gumroad store; verify ID trước, bank verify sau đơn đầu.
- [ ] C-7: Dựng C0 lite pack (Figma Community + Canva link) + trang Gumroad, đo email opt-in 2 tuần trước khi build C2.
- [ ] C-8: Script + quay 3 video tutorial EN (voiceover AI pipeline sẵn có).
