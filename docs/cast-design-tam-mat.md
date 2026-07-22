# Cast "Tam Mật" — Character Bible | v2 (Ritsu + Sō FINAL từ ảnh thật; còn lại X.2.8 derive)

> Áp X.2.8: thiếu ảnh ref = task thiết kế, không chờ. Suy từ **vai/thesis + style lock + neo tương phản Kin**.
> Đây là bản BOOTSTRAP đã CHỐT (không phải draft) — sinh keyframe + train Soul ngay. User có thể thay ảnh
> thật sau bằng Recast/Soul-Inpaint mà không phải dựng lại. Canon: `session-handoff-tam-mat-film.md`.
> Style lock chung: **2D ink-and-watercolor, chibi-anime, black ink linework + watercolor paper grain,
> palette ochre/rust/cream/ink-black, warm hand-painted.**

## Hệ màu per-nhân vật (Lock 1 color-script — mỗi con 1 hue trong palette chung)

| Nhân vật | Kanji | Hue riêng | Trục tương phản với Kin |
|---|---|---|---|
| Kin 勤 (đã có) | 勤 cần | cream / gold | gốc |
| Ritsu 律 | (không kanji) | costume cream+amber (ảnh thật); grade accent indigo/blue tuỳ chọn cho world phim 2 | barista **kỷ luật**, cười khép, mắt dán vào tia rót |
| Sō 創 | (không kanji) | costume rust-orange (ảnh thật); grade accent teal tuỳ chọn cho world phim 3 | **sáng tạo**, hoa cúc, mắt to tươi |
| Cô Trà (mentor Ritsu) | 茶 trà | plum / rose | nữ, **mềm/hiện diện**, luôn nhìn mắt khách |
| Ông Hoa (mentor Sō) | 花 hoa | amber / brown | **người GIỮ**, cất lại thứ bị vứt |
| Ong Chúa | vương miện nạm ngọc | gold + **burgundy-red** cape (ảnh thật) | lớn, **uy nghi tĩnh**, ôm giọt mật vàng phát sáng |

Token dùng: `[STYLE]` = dòng style lock ở trên. Keyframe prompt = flux_2/soul_cast (đã fine-tune prompt-master: style-first, structured, negative bắt buộc). Mỗi keyframe sinh sheet 3 view (front/3-4/CU) → train Soul.

**Bối cảnh (canon địa điểm):** 3 phim riêng ở NHẬT (học nghề) — **Kin/Kyoto** (Lão Rang, xưởng rang machiya) · **Ritsu/Osaka** (Cô Trà, kissaten) · **Sō/Tokyo** (Ông Hoa, lab pha sáng tạo). **Phim tổng ở LÂM HÀ** — 3 con trở về gặp nhau mở quán Mitsu (thung lũng, thông, magic-hour); Ong Chúa + giọt mật ở đây.

---

## RITSU 律 (phim 2 — discipline) — ✅ FINAL từ ẢNH THẬT (2026-07-05, ĐÈ bản derived v1)

Thesis: rót y hệt mọi khách, sợ trễ quy trình hơn sợ hỏng → tay run → bù *hiện diện* → Act3 nhìn mắt khách khi rót.
Ảnh thật: barista đeo **tạp dề cream** + **ấm gooseneck** + **V60 dripper trên carafe**. (Bản derived cũ indigo/kanji 律/đồng hồ cát → BỎ, xem Decision Log reversion.)

```
CHARACTER CARD — RITSU:
PHYSICAL: chibi bee-barista, warm tan face, large round dark-brown eyes with bright highlights, thin
  calm closed-mouth smile, small ochre blush; smooth black rounded bee-head, two black antennae with
  round tips (the right one slightly bent); high-collar near-black tunic with thin gold trim, a cream
  barista apron (one small coffee stain, tied at the waist) over it, black gloves; lower body in
  amber-and-black horizontal bee-stripes, dark legs, brown leather shoes; pale veined translucent wings.
PERSONALITY: disciplined, precise, upright — pours the exact same way for every guest, eyes fixed on the
  stream not the person (until Act 3); economical, controlled, a beat too rigid; steady even tempo.
VOICE: even mid-register, polite-formal, unhurried, rarely rises.
SIGNATURE PROPS (prop anchor — sinh 1 ảnh sạch, job-id reuse): stainless gooseneck pour-over kettle ·
  glass V60 cone dripper seated on a glass carafe of brewed coffee. Keep both identical across shots.
```
```
KEYFRAME (flux_2): [STYLE] — character sheet of a chibi bee-barista, four views on one cream sheet
(front full-body, back, 3/4, face close-up): warm tan face, large round dark-brown eyes with highlights,
thin calm closed-mouth smile, small ochre blush, smooth black rounded bee-head, two black antennae with
round tips (right one slightly bent), high-collar near-black tunic with thin gold trim, cream barista
apron with one small coffee stain tied at the waist, black gloves, amber-and-black bee-striped lower
body, dark legs, brown shoes, pale veined wings; holding a stainless gooseneck pour-over kettle in one
hand and a glass V60 dripper on a coffee carafe in the other.
Negative: no text, no watermark, no photoreal 3D, no plastic shading, no saturated neon, no modern logos;
keep the face identical across all four views.
```
Emotional-state sheet (Layout B): Neutral · Focused-on-pour · Hands-trembling (Act2) · Meeting-guest's-eyes (Act3 payoff).

## CÔ TRÀ (mentor phim 2 — NGANG HÀNG, dạy bằng tương phản hành động)

Không phải bề trên: đồng nghiệp làm ngược lại một cách tự nhiên (hiện diện, nhìn mắt khách) → tấm gương sống.
Quyết 5 điểm: (1) nữ, cùng tuổi Ritsu, dáng **mềm thả lỏng**; (2) mắt ấm mở, hay ngước lên "khách", nửa cười; (3) khăn plum/rose lỏng, kanji 茶; (4) tạp dề plum-rose, tay áo xắn, khăn dính vệt trà ở thắt lưng; (5) đạo cụ = tách trà đưa thẳng tay (giao tiếp mắt) + chổi khuấy trà.

```
CHARACTER CARD — CÔ TRÀ:
PHYSICAL: young female chibi bee, relaxed soft posture, warm open plum-brown eyes that meet the viewer,
  gentle half-smile, loose plum-rose headscarf with faded kanji 茶. Warm rose apron over gi, rolled
  sleeves, a tea-stained cloth at the belt, soft bee-stripes, clear wings. Holds a teacup offered
  outward; a bamboo tea-whisk.
PERSONALITY: fluid, unhurried, present — always meets the guest's eye; the living contrast that corrects
  Ritsu without a word. Warm easy motion.
VOICE: soft, warm, unhurried (light presence; near-wordless mentor).
```
```
KEYFRAME (flux_2): [STYLE] — character sheet of a warm young female bee barista, three views on cream
paper: relaxed soft posture, warm open plum-brown eyes meeting the viewer, gentle half-smile, loose
plum-rose headscarf with faded kanji 茶, rose apron over gi with rolled sleeves, tea-stained cloth at
belt, soft bee-stripes, clear wings, offering a teacup outward, bamboo tea-whisk.
Negative: no rigid posture, no cold colors, no text besides kanji 茶, no watermark, no photoreal 3D, no
plastic shading, no neon; keep the face identical across all three views.
```

---

## SŌ 創 (phim 3 — creativity) — ✅ FINAL từ ẢNH THẬT (2026-07-05, ĐÈ bản derived v1)

Thesis: luôn đổ bỏ vừa pha xong → không giữ ký ức → bù *chủ đích/ký ức* → Act3 tự ngăn tay đổ ly.
Ảnh thật: **hoa cúc trắng bên phải đầu**, **haori rust hở** + **túi đeo chéo**, cầm **ly sữa đá bọt tầng**. (Bản derived cũ teal/kanji 創 → BỎ, xem Decision Log. Tờ note vò nhàu vẫn giữ làm prop kịch bản Act2/3, nhét trong túi chéo.)

```
CHARACTER CARD — SŌ:
PHYSICAL: chibi bee, warm tan face, large round brown eyes with bright highlights, open cheerful smile
  showing a little, ochre freckle-blush; black hair with a single white daisy tucked on the right side;
  two antennae (one black, one amber) with round tips; rust-orange open haori jacket over a dark inner
  top, a gold sash/obi belt, a tan leather crossbody satchel; lower body in bold amber-and-black bee-
  stripes (slightly fluffy), dark leggings, mustard-ochre boots; large pale veined translucent wings.
PERSONALITY: creative, restless, playful — always making something new then tossing it out; quick darting
  hands, light on the feet, expressive brows; warm, impulsive, curious.
VOICE: bright, quick, higher register, lilting, curious.
SIGNATURE PROP (prop anchor): a tall glass of layered iced milk-coffee (cream / amber / dark bands) with
  a curl of foam-steam rising · plus the crumpled discarded note in the satchel (Act2/3 story prop).
```
```
KEYFRAME (flux_2): [STYLE] — character sheet of a chibi bee, four views on one cream sheet (front
full-body, back, 3/4, face close-up): warm tan face, large round brown eyes with highlights, open
cheerful smile, ochre freckle-blush, black hair with a single white daisy tucked on the right, two
antennae (one black one amber) with round tips, rust-orange open haori over a dark inner top, gold sash
belt, tan leather crossbody satchel, bold amber-and-black bee-striped fluffy lower body, dark leggings,
mustard-ochre boots, large pale veined wings; holding a tall glass of layered iced milk-coffee with a
curl of foam rising.
Negative: no text, no watermark, no photoreal 3D, no plastic shading, no saturated neon, no modern logos;
keep the face and the daisy position identical across all four views.
```
Emotional-state sheet: Playful-making · Tossing-the-cup (Act2 flaw) · Hand-freezing-mid-toss (Act3 turn) · Quiet-remembering.

## ÔNG HOA (mentor phim 3 — lặng lẽ TRẢ LẠI tờ ghi chú Sō đã vứt)

Twist: không cắm hoa; là **người GIỮ** — nhặt lại thứ người khác vứt. Tương phản Sō (vứt) = ông cất.
Quyết 5 điểm: (1) trung/cao niên, điềm tĩnh, hơi khom, tay cẩn thận; (2) mắt hiền chú ý, để ý thứ bị bỏ; (3) khăn/nón amber-brown kanji 花 phai; (4) gi nâu đất nhiều túi nhỏ + túi đựng giấy, một **bông hoa ép** kẹp trong sổ; (5) đạo cụ = tờ ghi chú cũ (của Sō) đã vuốt phẳng, chìa ra lặng lẽ + túi giấy đã cất.

```
CHARACTER CARD — ÔNG HOA:
PHYSICAL: calm older chibi bee, steady slightly-stooped posture, kind attentive amber-brown eyes, soft
  knowing look, muted amber-brown headcloth with faded kanji 花. Earth-brown gi with many small pockets
  and a document satchel, a pressed flower tucked in a small book, muted bee-stripes, clear wings.
  Careful hands. Holds a smoothed-out crumpled old note, offered silently.
PERSONALITY: quiet, preserving — keeps and returns what others throw away; wordless. Slow careful motion.
VOICE: low, few words (near-wordless mentor).
```
```
KEYFRAME (flux_2): [STYLE] — character sheet of a calm older keeper bee, three views on cream paper:
steady slightly-stooped posture, kind attentive amber-brown eyes, muted amber-brown headcloth with faded
kanji 花, earth-brown gi with many small pockets and a document satchel, a pressed flower in a small
book, muted bee-stripes, clear wings, careful hands holding a smoothed-out crumpled note offered
outward.
Negative: no bright saturated colors, no flower-arranging pose, no text besides kanji 花, no watermark,
no photoreal 3D, no plastic shading, no neon; keep the face identical across all three views.
```

---

## ONG CHÚA (Ten/Ketsu — tổ mà cả ba xây cho) — ✅ FINAL từ ẢNH THẬT (2026-07-05, ĐÈ bản derived)

Ảnh thật: **vương miện vàng nạm hồng-ngọc/hổ phách**, **áo choàng đỏ-burgundy lót vàng**, tay áo đen viền vàng, ôm **giọt mật vàng phát sáng** trong hai lòng bàn tay. Giọt mật = biểu tượng lõi phim ("một giọt mật, ba con ong") → prop anchor tối quan trọng, chính là thứ Ten/Ketsu hội tụ về. (Bản derived cũ vương miện honeycomb + áo amber-gold → BỎ, xem Decision Log.)

```
CHARACTER CARD — ONG CHÚA:
PHYSICAL: regal chibi queen bee, warm tan face, large round dark-brown eyes with bright highlights,
  gentle closed-mouth smile, soft ochre blush; black rounded bee-head, two black antennae with round
  tips; an ornate gold crown set with a central ruby-red gem and amber orbs on the points; a deep
  burgundy-red cape with gold-patterned lining draped over the shoulders, dark near-black sleeves with
  gold cuff-bands; large bold amber-and-black bee-striped rounded body; large pale veined wings.
PERSONALITY: serene, unifying, patient — presence not labor; the light that only stabilizes when all
  three converge. Slow graceful motion, still dignity.
VOICE: warm, resonant, unhurried (or non-verbal luminous presence).
SIGNATURE PROP (prop anchor — film core symbol): a single large glowing amber honey droplet, held
  cupped in both hands. Reuse the SAME droplet asset in Ten/Ketsu (K e2 convergence). Keep identical.
```
```
KEYFRAME (flux_2): [STYLE] — character sheet of a regal chibi queen bee, four views on one cream sheet
(front full-body, back, 3/4, face close-up): warm tan face, large round dark-brown eyes with highlights,
gentle closed-mouth smile, ochre blush, black rounded bee-head, two black antennae round tips, ornate
gold crown with a central ruby-red gem and amber orbs on the points, deep burgundy-red cape with
gold-patterned lining over the shoulders, dark sleeves with gold cuff-bands, large bold amber-and-black
bee-striped rounded body, large pale veined wings; cupping a single large glowing amber honey droplet
in both hands.
Negative: no worker headband, no kanji, no text, no watermark, no photoreal 3D, no plastic shading, no
neon; keep the face + crown + droplet identical across all four views.
```

---

## Decision Log (asset_design — append-only)
```
{asset_design, "Ritsu (no photo)",   [chờ ảnh; tự thiết kế], tự-thiết-kế, "X.2.8 — hue indigo, kanji 律, rigid/precise, ấm rót + đồng hồ cát"}
{asset_design, "Ritsu",  [derived-indigo-律; ẢNH THẬT barista tạp dề], ẢNH-THẬT, "user gửi ảnh 2026-07-05 → override; cream apron + gooseneck + V60, no kanji band. rejected_because: derived thay bằng ảnh thật"}
{asset_design, "Cô Trà (no photo)",  [chờ ảnh; tự thiết kế], tự-thiết-kế, "peer mentor, hue plum, kanji 茶, present/warm — tương phản Ritsu"}
{asset_design, "Sō (no photo)",      [chờ ảnh; tự thiết kế], tự-thiết-kế, "hue teal, kanji 創, messy-creative, tờ note vò nhàu"}
{asset_design, "Sō",     [derived-teal-創; ẢNH THẬT hoa cúc+haori], ẢNH-THẬT, "user gửi ảnh 2026-07-05 → override; daisy + rust haori + túi chéo + ly sữa đá bọt, no kanji band. rejected_because: derived thay bằng ảnh thật"}
{asset_design, "Ông Hoa (no photo)", [chờ ảnh; tự thiết kế], tự-thiết-kế, "keeper, hue amber, kanji 花, trả lại note đã vứt"}
{asset_design, "Ong Chúa (no photo)",[chờ ảnh; tự thiết kế], tự-thiết-kế, "regal honey-gold, vương miện honeycomb, no worker band"}
{asset_design, "Ong Chúa", [derived-honeycomb; ẢNH THẬT crown+burgundy+droplet], ẢNH-THẬT, "user gửi ảnh 2026-07-05 → override; vương miện nạm ngọc + áo choàng đỏ + ôm giọt mật. rejected_because: derived thay bằng ảnh thật"}
{asset_design, "Cô Trà + Ông Hoa", [chờ ảnh; giữ X.2.8 derived], X.2.8-derived-FINAL, "user 'còn lại tự tạo' 2026-07-05 → duyệt bản tự thiết kế làm chính thức"}
```

## Trạng thái — CAST ĐÃ CHỐT ĐỦ, không còn ai chờ ảnh
- **Ảnh thật (FINAL):** Kin (`kin-shotlist-manual.md`) · **Ritsu** · **Sō** · **Ong Chúa** — 2026-07-05, đè derived.
- **X.2.8 tự thiết kế (FINAL, user duyệt):** Lão Rang (`kin-shotlist-manual.md`) · **Cô Trà** · **Ông Hoa** (user: "còn lại tự tạo").
- Cả 7 nhân vật đều có Card + keyframe prompt + prop anchor → 3 phim con + phim tổng KHÔNG chờ gì nữa.
- Bước tiếp mỗi phim: sinh sheet 4-view → train Soul → chạy Frame Source plan (X.3) như phim Kin.
- Prop anchor toàn phim: **giọt mật vàng phát sáng** (Ong Chúa ôm) = biểu tượng lõi, tái dùng ở Ten/Ketsu.
