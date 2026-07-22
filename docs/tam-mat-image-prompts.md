# Tam Mật — BỘ PROMPT SINH ẢNH đầy đủ 4 phim (gpt_image_2)

> Ngân hàng prompt để generate keyframe/asset — paste thẳng vào Higgsfield `generate_image`, model `gpt_image_2`,
> quality `medium` (2 credits/ảnh; nâng `high` cho hero nếu muốn). KHÔNG tốn quota khi chỉ đọc file này.
> Nhân vật có ẢNH THẬT (Kin/Ritsu/Sō/Ong Chúa) → PHẢI upload ảnh làm reference (media_id) để khớp mặt (GPT
> Image 2 không train Soul). Nhân vật X.2.8 (Lão Rang/Cô Trà/Ông Hoa) → text-only. Establishing/landmark → text-only.

## [STYLE] — dán đầu MỌI prompt
```
2D ink-and-watercolor illustration, chibi-anime style, black ink linework and watercolor wash with washi
paper grain, warm ochre/rust/cream/ink-black palette, hand-painted, flat 2D paper cut-out look.
```
## [NEG] — dán cuối MỌI prompt
```
No text (except a headband kanji when specified), no watermark, no photoreal 3D, no plastic shading, no
saturated neon, no modern logos.
```
Establishing/landmark thêm: `No people, no characters, no bees, unpopulated scenery only.`

---

# PHIM 1 — KIN 🇯🇵 Kyoto  ✅ ĐÃ SINH XONG (job_id trong kin-shotlist-manual.md)
| Ảnh | job_id | aspect |
|---|---|---|
| IMG-1 Kyoto establishing | 620e1b36-4816-4dcb-ba69-5ee1989956ee | 16:9 |
| IMG-2 Kin WS xưởng rang | 1e50f852-4e28-4f66-9dad-553175049255 | 16:9 |
| IMG-3 Kin CU cúi (master) | 3fbe394a-bc23-4b9d-a4c1-0098daf3ac55 | 3:4 |
| IMG-4 Kin CU ngẩng | e88dc6ea-c545-4b13-9bc8-4a6da5724cef | 3:4 |
| IMG-5 Lão Rang v2 chuyên nghiệp | 3e0c1cc1-02ed-4a66-8c48-216fde8eab50 | 16:9 |
| KL Kyoto landmark | b5c421c7-2831-4184-a54f-07e34c30e8bf | 16:9 |
Ảnh Kin thật (ref): `41b9ec57-24b8-4b81-8861-ae7e119c9b7a`, `59df700b-62b0-4ddb-87ca-2543dc1b0406`.

---

# PHIM 2 — RITSU 🇯🇵 Osaka  ✅ ĐÃ SINH XONG 2026-07-05 (job_id trong ritsu-shotlist-manual.md; ref ảnh Ritsu thật `f3ca61e0…`,`d46bd411…`)
> Prompt dưới giữ để re-gen nếu cần. Đã sinh: R1 61248058 · R2 a3d79c6f · R3 fc9b9a55 · R4 a664871a · R5 11c76497 · RL 6d713c3a · PROP-R 81c8c232.

**IMG-R1** — Osaka kissaten establishing · 16:9 · text-only
```
[STYLE] Extreme wide establishing, 35mm: an Osaka kissaten at opening hour, a tidy wooden coffee counter,
through the window the Dōtonbori canal and tall painted signboards softly blurred, warm cream-amber
morning light. [NEG] No people, no characters, unpopulated interior only.
```
**IMG-R2** — Ritsu WS ở quầy · 16:9 · ref: ẢNH RITSU THẬT
```
[STYLE] Wide shot of the SAME chibi bee-barista from the reference images — match face, black bee-head,
cream barista apron over a dark high-collar tunic with gold trim, black gloves, amber-and-black striped
lower body: standing at a tidy Osaka kissaten counter, a gooseneck kettle and a glass V60 dripper on a
carafe before him, eyes down, tying/adjusting the apron. Warm window light from the left. [NEG]
```
**IMG-R3** — Ritsu CU rót (mắt cúi, master face) · 3:4 · ref: ẢNH RITSU THẬT
```
[STYLE] Close-up of the SAME chibi bee-barista (match face + apron + colors exactly): calm thin
closed-mouth smile, eyes DOWN fixed on the pour stream, focused and precise. Warm side light. [NEG]
```
**IMG-R4** — Ritsu CU ngẩng gặp mắt khách · 3:4 · ref: IMG-R3 job_id + ẢNH RITSU THẬT
```
[STYLE] The EXACT same close-up and framing as the reference character image — same bee-barista, same
face, same apron, same light — but now his eyes LIFT to meet the guest, a warm gentle look; only the
eyes/expression change. [NEG]
```
**IMG-R5** — Cô Trà sheet (X.2.8, text-only) · 16:9
```
[STYLE] Character sheet of a warm young female chibi bee barista, three views (front, 3/4, close-up) on
plain cream paper: relaxed soft posture, warm open plum-brown eyes that meet the viewer, gentle
half-smile, loose plum-rose headscarf with a faded kanji, a rose apron over gi with rolled sleeves, a
tea-stained cloth at the belt, soft amber-black bee-stripes, tidy clear wings, offering a teacup outward,
a bamboo tea-whisk. Keep the face identical across all three views. [NEG]
```
**RL** — Osaka landmark · 16:9 · text-only · ★
```
[STYLE] Extreme wide: the Osaka Dōtonbori canal — an arched bridge over water, tall painted signboards
reflected below, lively crowd silhouettes, warm sepia ink-wash. [NEG] No brand logos, no neon glare.
```
**PROP-R** — bộ pha (prop anchor) · 1:1 · text-only
```
[STYLE] A clean product still on plain cream paper: a stainless gooseneck pour-over kettle beside a glass
V60 cone dripper seated on a glass carafe of brewed coffee. Neat, well-kept. [NEG] No people.
```

---

# PHIM 3 — SŌ 🇯🇵 Tokyo  ✅ ĐÃ SINH XONG 2026-07-05 (job_id trong so-shotlist-manual.md; ref ảnh Sō thật `82d5072d…`,`79f1f2aa…`,`3412855e…`)
> Đã sinh: S1 93685d86 · S2 72846e72 · S3 d59af2f4 · S4 ccc34a29 · S5 f478e852 · S6 e0422d40 · SoL 830e8d5f · PROP-S da3435f8. Prompt dưới giữ để re-gen.

**IMG-S1** — Tokyo lab establishing · 16:9 · text-only
```
[STYLE] Wide establishing: a modern Tokyo creative coffee lab at morning, a colorful experiment bench
full of tools and bottles, a large glass window with the Tokyo street softly blurred beyond, warm light.
[NEG] No people, no characters, unpopulated interior only.
```
**IMG-S2** — Sō pha MCU · 16:9 · ref: ẢNH SŌ THẬT
```
[STYLE] Medium close-up of the SAME chibi bee from the reference images — match face, white daisy on the
right of the hair, rust-orange open haori over a dark top, gold sash, tan crossbody satchel: layering a
tall iced milk-coffee with quick darting hands, big open cheerful smile, at the Tokyo lab bench. [NEG]
```
**IMG-S3** — Sō CU trung tính (master face, cho Kuleshov) · 3:4 · ref: ẢNH SŌ THẬT
```
[STYLE] Close-up of the SAME chibi bee (match face + daisy + colors exactly): neutral calm expression,
large round brown eyes, mouth relaxed. Warm even light. [NEG]
```
**IMG-S4** — Sō tay khựng (matchcut end) · 3:4 · ref: IMG-S3 job_id + ẢNH SŌ THẬT
```
[STYLE] The EXACT same close-up/framing as the reference character image — same bee, same face — reaching
to toss a cup but her hand FREEZES mid-air, held still, eyes catching herself; only the hand/expression
change. [NEG]
```
**IMG-S5** — Ông Hoa sheet (X.2.8, text-only) · 16:9
```
[STYLE] Character sheet of a calm older "keeper" chibi bee, three views (front, 3/4, close-up) on plain
cream paper: steady gentle posture, kind attentive amber-brown eyes, muted amber-brown headcloth with a
faded kanji, a CLEAN well-kept earth-brown craftsman jacket with many small pockets and a document
satchel, a pressed flower in a small book, tidy bee-stripes, tidy clear wings, careful hands holding a
smoothed-out old note offered outward. Refined, not shabby. Keep the face identical across all three
views. [NEG]
```
**IMG-S6** — khách chờ · 3:4 · text-only (phụ)
```
[STYLE] Close-up of a small chibi bee customer at the counter, hopeful expectant look, warm light. [NEG]
```
**SoL** — Tokyo landmark · 16:9 · text-only · ★
```
[STYLE] Extreme wide: a Tokyo scramble crossing — crowds flowing between tall buildings, a cherry-lined
canal nearby, modern city energy in warm sepia ink-wash. [NEG] No brand logos, no neon glare.
```
**PROP-S** — ly + tờ note · 1:1 · text-only
```
[STYLE] A clean still on plain cream paper: a tall glass of layered iced milk-coffee (cream/amber/dark
bands) with a curl of foam, beside a small crumpled paper note and the same note smoothed flat. [NEG]
```

---

# PHIM TỔNG — 🇻🇳 Lâm Hà + hội tụ  (Ong Chúa CẦN upload ảnh thật)

**IMG-Ki1** — Lâm Hà valley establishing · 16:9 · text-only · ★
```
[STYLE] Extreme wide establishing at dawn: the Lâm Hà highland valley — pine hills, drifting mist, warm
magic-hour light over the wooden Mitsu shopfront. [NEG] No people, no characters, unpopulated scenery.
```
**IMG-B1** — 3 ong gặp nhau ở Lâm Hà · 16:9 · ref: 3 ẢNH THẬT (Kin+Ritsu+Sō) nếu có
```
[STYLE] Wide shot: the three chibi bees — Kin (cream headband + rust gi), Ritsu (barista apron), and Sō
(daisy + rust haori) — standing together in the Lâm Hà valley, pine and mist behind, warm dawn light,
matching the reference images for each face. [NEG]
```
**IMG-T1** — 3 giọt sáng trừu tượng · 16:9 · text-only · ★
```
[STYLE] Three separate glowing droplets of light (cream-gold, warm-amber, rust) hovering in a dark
honeycomb space, each flickering, unsteady, symbolic. [NEG] No people.
```
**IMG-T4** — Ong Chúa ôm giọt mật (fusion end) · 16:9 · ref: ẢNH ONG CHÚA THẬT · ★
```
[STYLE] The SAME regal chibi queen bee from the reference image — match face, ornate gold crown with a
central ruby-red gem and amber orbs, deep burgundy-red cape with gold lining, amber-black striped body:
cupping ONE single large glowing amber honey droplet in both hands, steady and bright, serene. [NEG]
```
**IMG-Ke2** — quầy quán Mitsu Lâm Hà (oner) · 16:9 · text-only
```
[STYLE] A warm wide of the perfect Mitsu counter in the Lâm Hà highland: a cup of coffee, a placed
flower, honey-gold light, pine and mist through the window, ready for a continuous camera move. [NEG]
No people (characters composited/animated separately).
```
**PROP-Q** — giọt mật (biểu tượng lõi) · 1:1 · text-only
```
[STYLE] A single large glowing amber honey droplet on plain cream paper, luminous, teardrop shape. [NEG]
No people.
```
**Tagline card** — model `openai_hazel` (KHÔNG gpt_image_2): chữ "Một giọt mật, ba con ong." + logo Mitsu.

---

## Thứ tự ưu tiên nếu quota hẹp (sinh trước cái tái dùng nhiều)
1. **4 nhân vật hero** (đã có Kin ✓; cần Ritsu/Sō/Ong Chúa — upload ảnh) — mặt là thứ khó nhất, làm trước.
2. **★ landmark + establishing** (KL✓/RL/SoL/IMG-Ki1/IMG-T1) — reuse cả phim tổng.
3. Mentor X.2.8 (IMG-R5/IMG-S5) + prop anchors.
4. Còn lại (insert/phụ) sinh khi dựng.

## Cần từ user để sinh nốt
Upload ảnh thật: **Ritsu, Sō, Ong Chúa** (mỗi con 1-2 ảnh) → tôi cắm media_id vào các prompt "ref: ẢNH THẬT".
