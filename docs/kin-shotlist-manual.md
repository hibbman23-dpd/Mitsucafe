# Phim Kin 勤 (Tam Mật) — Shot-list v4 | BEAT-FIDELITY + gate v2.7 audit

> **v4 2026-07-13 — vá audit gate v2.7 (0 credit) trước khi generate phần thiếu:**
> **C2** aspect keyframe = aspect video (§5, kill crop 3:4 dưới 16:9, thêm ★9:16) · **C3** dựng lại
> LÃO RANG CHARACTER CARD (§4b, byte-identical) · SUGGESTION bỏ bare-emotion. **C1 (S3/S4/S6 clip nháp
> reframe-from-WS) HOÃN** — clip cũ dùng tạm được, chưa re-gen (chờ user chốt có làm lại không).
> **v3 2026-07-06 — viết lại theo kịch bản CHUẨN** (v2 beat-drift: bịa "ngước nhìn trời" thay "ngửi mẻ
> thành công", hạ Lão Rang thành reactor. Vá skill v2.0 SCRIPT-BEAT FIDELITY). Bối cảnh 🇯🇵 KYOTO
> (xưởng rang machiya). Style/model/canon = handoff + cast-design.

---

## 1. BEAT LIST — hợp đồng kịch bản (giữ nguyên động từ của user)

```
B1. Kin RANG hạt (mẻ đầu, tự làm theo nhịp của mình)
B2. Hạt BỊ CHÁY (khói đổi, hạt đen)
B3. Kin VẺ MẶT THẤT VỌNG (nhìn mẻ hỏng, vai sụp)
B4. Lão Rang KẾ BÊN ĐỘNG VIÊN (đến bên, đặt tay, gật khích lệ)
B5. Lão Rang CHỈ DẠY mẻ rang đầu tiên (demo tay nghề, Kin quan sát)
B6. TRAO LẠI chiếc DỤNG CỤ RANG (muỗng gỗ chuyển từ tay già sang tay Kin)
B7. Kin RANG LẠI (làm lại, tập trung theo cách vừa học)
B8. Kin NGỬI ĐƯỢC MÙI THƠM của mẻ rang THÀNH CÔNG (payoff giác quan)
```
Chuỗi nhân-quả: B2 do B1 (rang sai nhịp) → B3 do B2 → B4 do B3 → B5 tiếp B4 → B6 chốt B5 → B7 nhờ B6 → B8 chứng B7.

## 2. FILM-REFERENCE PASS — 3 phim cùng scene-type (try-fail-mentor-retry-succeed / craft)

| Phim | Grammar mượn được | Áp vào shot |
|---|---|---|
| **Jiro Dreams of Sushi** (2011, tamago apprentice) | Payoff nghề = GIÁC QUAN + phản ứng mặt; approval của thầy = 1 cái gật nhỏ, không lời | S13-S14 (ngửi), S15 coda gật |
| **The Karate Kid** (1984, Miyagi) | Dạy = CU tay thầy LÀM MẪU chậm + trò xem qua vai (OTS); trao nghề = vật cụ thể chuyển giữa 2 đôi tay trong 1 khung | S10 (demo), S11 (handover) |
| **Ratatouille** (2007, sensory grammar) | Mùi hương = insert làn hơi cuộn + nhắm mắt hít vào + mặt bừng nở | S13 (steam insert) + S14 (inhale CU) |

Decision Log: `{reference_films, "Kin roast scene", [Whiplash; Jiro; Karate Kid; Ratatouille; Kung Fu Panda], Jiro+KarateKid+Ratatouille, "taste-approval / tool-handover / smell-grammar khớp 8 beat"}`

## 3. COVERAGE MAP — mỗi beat ≥1 shot, mỗi shot có beat

```
B0 setting → S1 (establishing) [+KL landmark, trang trí có lý do: cảm Kyoto]
B1 → S2, S3        B2 → S4, S5, S6        B3 → S7 ★
B4 → S8, S9        B5 → S10 ★             B6 → S11 ⭐matchcut
B7 → S12           B8 → S13 + S14 ★ (payoff) + S15 coda (thầy gật — Jiro)
[ADDED symbol, không thay beat: S16 = trời hửng sáng (reuse K11) — đặt SAU B8, chỉ là dư âm]
```

## 4. SHOT LIST v3 (16 shot, ~58-62s) — video kling3_0_turbo (matchcut = kling3_0)

Neg: `drifting camera, face morphing, character drift, hand deformation, garbled text, watermark`
`[STYLE]` như cũ. ✅ = clip đã sinh (reuse). 🆕 = cần keyframe/clip mới.

| Shot | Beat | Ảnh mở | ★9:16 | MOTION | Trạng thái |
|---|---|---|---|---|---|
| S1 | B0 | IMG-1 | ★ | `Slow push-in. Smoke drifts up and thins. Camera holds.` | ✅ K1 (2 ratio) |
| KL | B0 | KL img | ★ | `Slow push-in; lanterns sway, mist drifts. Ends on the pagoda.` | ✅ (2 ratio) |
| S2 | B1 | IMG-2 | | `Kin stirs the pan steady for three strokes, then the paddle stills. Camera static.` | ✅ K2 |
| S3 | B1 | chụp S2 | | `Medium on his hands and the paddle, his OWN untrained rhythm, beans tumbling. Ends on a stroke.` | ✅ K3 |
| S4 | B2 | chụp S3 | | `Insert: beans shift amber to dark, a thin smoke thread curls faster. Ends as the first dark bean turns.` | ✅ K5a |
| S5 | B2→B3 | ⭐ start IMG-3 / end IMG-4 | ★ | `Eyes flick up from the pan, smile fades. Camera holds.` (nhận ra khói) | ✅ K5b (2 ratio) |
| S6 | B2 | chụp S4 | | `Insert: burnt black beans, thick dark smoke curling up. Ends as smoke fills frame top.` | ✅ K6 |
| S7 🆕 | **B3** | IMG-6 (Kin thất vọng CU) | ★ | `Kin's shoulders slump, eyes drop to the ruined batch, a slow exhale. Camera static. Holds on the downcast face.` | 🆕 keyframe+clip |
| S8 | B4 | keyframe Lão Rang-scene | | `The old master steps in beside Kin, silent, tilts his head and sniffs the burnt air once. Camera holds.` | ✅ K7 (repurpose: đến bên) |
| S9 🆕 | **B4** | IMG-7 (two-shot vai kề vai) | | `The master lays a hand on Kin's shoulder, one gentle encouraging nod; Kin's head lifts a little. Camera holds.` | 🆕 keyframe+clip |
| S10 🆕 | **B5** | IMG-8 (OTS Kin nhìn thầy demo) | ★ | `Over Kin's shoulder: the master's old hands stir the pan slowly, deliberate even strokes; Kin watches, leaning in. Ends on a completed stroke.` | 🆕 keyframe+clip |
| S11 🆕⭐ | **B6** | matchcut: start IMG-9a (muỗng trong tay thầy) / end IMG-9b (muỗng trong tay Kin) | ★ | `The master offers the wooden paddle; Kin receives it with both hands, a small bow of the head. Camera holds.` | 🆕 2 keyframe + kling3_0 |
| S12 🆕 | **B7** | IMG-2 (reuse ảnh) | | `Kin resumes roasting — steadier now, the master's rhythm, focused and calm. Ends mid-even-stroke.` | 🆕 clip (ảnh có sẵn) |
| S13 🆕 | **B8** | IMG-10a (chảo hạt nâu vàng + hơi thơm) | ★ | `Insert: evenly browned beans, a soft golden curl of aroma-steam rising, gentle and steady. Ends on the curl.` | 🆕 keyframe+clip |
| S14 🆕 | **B8** | IMG-10b (Kin nhắm mắt hít) | ★ | `Kin leans in, closes his eyes and breathes in the aroma — his face blooms into a real smile. Slow push-in. Holds.` | 🆕 keyframe+clip |
| S15 | B8 coda | chụp S8 / old K8 | | `The master closes his eyes and gives one slow approving nod. Camera static.` (Jiro approval) | ✅ old K8 (repurpose) |
| S16 | ADDED | old K10/K11 | ★ | dư âm: Kin ngước lên / trời hửng vàng — đặt SAU B8, biểu tượng CỘNG THÊM | ✅ old K10+K11 |

**Eyeline giữ:** S8→S9 thầy nhìn Kin/xuống; S10 Kin nhìn xuống-trái vào chảo demo; S11 hai người nhìn vào muỗng; S13→S14 Kin cúi vào chảo rồi nhắm mắt.

## 4c. CAMERA COVERAGE PLAN (v4.1 anti-flatness — skill v2.8)

> Lỗi phát hiện 2026-07-13: dùng 1 set-ref (IMG-2) full-frame cho mọi keyframe → model kế thừa GÓC MÁY
> của IMG-2 → cả phim 1 góc eye-level 3/4, 1 nền, phẳng. Sửa: set-ref = SET continuity ONLY; mỗi shot
> khai góc RIÊNG map tới Ý NGHĨA. Two-person/handover = reverse angle, nền khác nhau.

| Shot | Beat | Góc máy MỚI (angle → nghĩa) | Keyframe |
|---|---|---|---|
| S7 | B3 defeat | **HIGH angle** nhìn xuống Kin nhỏ bé, vai sụp (thất bại/nhỏ nhoi) | IMG-6 v2 re-gen |
| S9 | B4 | **LOW two-shot** hơi ngước, thầy đặt tay vai + gật (uy nghi/nâng đỡ), Kin ngẩng mặt lên | IMG-7 v2 re-gen (sửa beat) |
| S10 | B5 | **OTS** qua vai Kin nhìn tay thầy demo (đã đa dạng) | IMG-8 giữ ✓ |
| S11 | B6 | **matchcut REVERSE**: 9a giver-side (tay thầy, nền thầy) / 9b receiver-side (tay Kin, nền Kin, góc ngược) | IMG-9a giữ + IMG-9b v2 re-gen |
| S12 | B7 | MS callback IMG-2 (cố ý lặp khung = "rang lại" đúng chỗ) | IMG-2 reuse ✓ |
| S13 | B8 | **OVERHEAD top-down** chảo hạt + hơi thơm (nghi thức/reveal) — khác eye-level | IMG-10a v2 optional |
| S14 | B8 payoff | **CU push-in thấp/gần** thân mật, Kin nhắm mắt hít | IMG-10b giữ hoặc siết gần |

Giữ: IMG-8, IMG-9a (đã đa dạng). Re-gen bắt buộc: IMG-9b (reverse — CRITICAL logic). Re-gen nên: IMG-6 (high), IMG-7 (low+beat). Optional: IMG-10a (overhead), IMG-10b (siết gần).

## 4b. LÃO RANG — CHARACTER CARD (C3 fix v4, byte-identical — PASTE vào MỌI shot S8–S15 + IMG-7/8/9a)

> v3 rewrite xoá mất Card Lão Rang → dựng lại từ mảnh mô tả rời + sheet IMG-5 `3e0c1cc1` + scene `2c0227b0` đã sinh.
> Từ đây mọi shot có Lão Rang paste NGUYÊN VĂN block dưới (không paraphrase — X.2.5 byte-identical).

```
CHARACTER CARD — LÃO RANG (mentor Kin):
PHYSICAL: elderly chibi bee master, kind weathered tan face, small round dark eyes under heavy calm
  brows, a short white beard, gentle closed-mouth look; smooth dark rounded bee-head, two grey-black
  antennae with round tips; a charcoal-grey samue work jacket over a darker inner top, a cream apron
  with a few old roast-scorch marks tied at the waist; muted amber-and-black bee-striped lower body,
  dark legs, plain sandals; large pale veined translucent wings slightly worn. Aged careful hands.
PERSONALITY: quiet, patient — teaches by SMELL and SILENCE, wordless; corrects by DOING not telling;
  slow deliberate motion, still authority; approval = one small nod (Jiro grammar).
VOICE: near-wordless; at most a low quiet hum.
SIGNATURE PROP (prop anchor — reuse IMG-5 sheet 3e0c1cc1): a long dark wooden roasting paddle. Keep
  identical every shot; this is the tool handed to Kin in S11 (B6).
```

## 5. Keyframe MỚI cần sinh (gpt_image_2 → C2 fix v4: aspect = video aspect; ★ shot thêm bản 9:16)

> **C2 (v4):** aspect keyframe = aspect video của shot (kill crop 3:4 dưới 16:9). Shot ★ (S7/S10/S11/S13/S14) sinh THÊM bản 9:16 native.
> **C3 (v4):** shot có Lão Rang → paste `[LÃO RANG CARD]` (§4b) nguyên văn thay mô tả rời.
> **SUGGESTION (v4):** bỏ bare-emotion ("quietly disappointed") → động từ vật lý (Kuleshov).

| Ảnh | aspect | ref | Prompt |
|---|---|---|---|
| IMG-6 Kin thất vọng | 16:9 +★9:16 | IMG-3 + ảnh Kin thật | `[STYLE] The EXACT same bee-boy and headband as the reference, reframed to 16:9 — shoulders slumping down, eyes dropping to the ruined dark beans, the smile going flat, a slow exhale. Only expression/posture change. [NEG]` |
| IMG-7 động viên two-shot | 16:9 | Lão Rang-scene (2c0227b0) + ảnh Kin thật | `[STYLE] Medium two-shot inside the machiya roastery: [LÃO RANG CARD] standing beside the small bee-boy Kin, laying one aged hand on his shoulder with one small nod; the boy's head lifting slightly. Warm furnace light from left. [NEG]` |
| IMG-8 thầy demo OTS | 16:9 +★9:16 | Lão Rang-scene + ảnh Kin thật | `[STYLE] Over-the-shoulder past the bee-boy: [LÃO RANG CARD] — the master's aged hands stirring the low iron pan with slow deliberate strokes, beans turning evenly; Kin watching intently, leaning in. Warm light. [NEG]` |
| IMG-9a muỗng tay thầy | 16:9 +★9:16 | Lão Rang-scene | `[STYLE] Close-up, 16:9: the aged hands of [LÃO RANG CARD] holding out the long dark wooden roasting paddle, offering it forward. Warm light. [NEG]` |
| IMG-9b muỗng tay Kin | 16:9 +★9:16 | IMG-9a + ảnh Kin thật | `[STYLE] The EXACT same close-up/framing as IMG-9a, 16:9 — but now the small gloved hands of the bee-boy Kin receive the same dark wooden paddle, gripping it with both hands. Only the hands change. [NEG]` |
| IMG-10a chảo thành công | 16:9 +★9:16 | PROP hoặc text-only | `[STYLE] Insert close-up, 16:9: a pan of evenly browned coffee beans, a soft golden curl of aroma-steam rising, warm and appetizing. No people. [NEG]` |
| IMG-10b Kin hít mùi | 16:9 +★9:16 | IMG-3 + ảnh Kin thật | `[STYLE] The EXACT same bee-boy as the reference, reframed to 16:9 — eyes CLOSED, leaning slightly toward rising golden steam, breathing in, the face blooming into a blissful real smile. [NEG]` |

## 6. ✅ ASSET ĐÃ SINH (giữ nguyên — job_id)

**Keyframe (gpt_image_2):** IMG-1 `620e1b36` · IMG-2 `1e50f852` · IMG-3 `3fbe394a` · IMG-4 `e88dc6ea` · IMG-5 Lão Rang sheet `3e0c1cc1` · Lão Rang-scene `2c0227b0` · KL `b5c421c7`. Ảnh Kin thật: `41b9ec57`, `59df700b`.

**Video 16:9 (K-cũ → map v3):** K1→S1 `e5e8cb48` · K2→S2 `6aa73d8d` · K3→S3 `9e4050f7` · K5a→S4 `fd88af9f` · K5b→S5 `85bd9bc5` · K6→S6 `1e070bcc` · K7→S8 `cedfb38c` · K8→S15 `5207366c` · K10→S16a `094cfa48` · K11→S16b `40298967` · KL `20680fa5`. **K9 cũ `11711957` = DEPRECATED** (beat-drift, không dùng).
**Video 9:16 ★:** K1 `9e08326d` · K4 `22e72dbf` (dùng lại cho S7 tham khảo framing) · K5b `3087a47e` · K10 `104d3d65` · K11 `45a1cbd8` · KL `5a4eac97`.

**Cần sinh mới:** 7 keyframe (mục 5) + 8 clip (S7/S9/S10/S11/S12/S13/S14 + ★9:16 cho S7/S10/S11/S13/S14). Ước tính ~14cr ảnh + ~75cr video.

### 6b. ✅ KEYFRAME v4 ĐÃ SINH 2026-07-13 (gpt_image_2, 2k/medium, 16:9, có ref bối cảnh — job_id full)
Ref UUID full (thay 8-ký-tự cũ): **IMG-2 bg-anchor** `1e50f852-4e28-4f66-9dad-553175049255` · **IMG-3 Kin** `3fbe394a-bc23-4b9d-a4c1-0098daf3ac55` · **Lão Rang-scene** `2c0227b0-8190-4b83-8b47-dfb27847a0d8` · **Lão Rang sheet** `3e0c1cc1-02ed-4a66-8c48-216fde8eab50` · IMG-1 `620e1b36-4816-4dcb-ba69-5ee1989956ee` · IMG-4 `e88dc6ea-c545-4b13-9bc8-4a6da5724cef` · KL `b5c421c7-2831-4184-a54f-07e34c30e8bf`.

| Keyframe | góc (v4.1) | job_id FINAL | ref dùng |
|---|---|---|---|
| IMG-6 Kin thất vọng (S7) | HIGH angle | `324a00f7-735e-4a72-a5e3-63e409d3318d` | IMG-3 + IMG-2 |
| IMG-7 động viên (S9) | LOW two-shot | `c2d57023-2519-45d0-b68b-c46f54fd3243` | Lão Rang-scene + IMG-2 + IMG-3 |
| IMG-8 OTS demo (S10) | OTS | `65c900d0-d61b-436a-9f00-b968cc594ec8` | Lão Rang-scene + IMG-2 + IMG-3 |
| IMG-9a muỗng tay thầy (S11 start) | CU giver-side | `c3c8cbeb-e806-4d8f-a9cc-e4c779d2a9a6` | Lão Rang-scene + IMG-2 |
| IMG-9b muỗng tay Kin (S11 end) | REVERSE receiver-side | `8f1bff35-5cdc-4b6b-b3bd-51884b8cd232` | IMG-9a + IMG-3 |
| IMG-10a chảo thành công (S13) | OVERHEAD top-down | `41e7bc01-363b-43c6-87fe-1f8009e4606b` | IMG-2 |
| IMG-10b Kin hít (S14) | TIGHT intimate CU | `ff19cffc-6cf3-492c-b5e0-f3ba98eca0b1` | IMG-3 + IMG-2 |

DEPRECATED (phẳng eye-level / sai logic, bỏ): IMG-10a no-ref `574e5ec1` · IMG-6 v1 `310901ca` · IMG-7 v1 `e1f3f3c5` · IMG-9b v1 `4af1a63c` · IMG-10a eye-level `b6ab7f9d` · IMG-10b 3/4 `83b31d55`.
**Coverage FINAL 7 shot:** S7 HIGH · S8 OTS · S9 LOW · S11 CU-giver→REVERSE-receiver · S13 OVERHEAD · S14 TIGHT-CU. ★9:16 native pass sau.

### 6c. ✅ CLIP v4 ĐÃ SINH 2026-07-14 (kling3_0_turbo, 1080p 16:9 5s, image-first minimal-motion)
| Shot | clip job_id | motion |
|---|---|---|
| S7 | `4432fc53-fa32-4395-a951-a7fbe76370d1` | vai sụp thêm, thở hắt, khói tàn (high hold) |
| S9 | `c4ea3931-8e4f-479e-a345-fcf5b755e151` | thầy bóp vai + gật, Kin ngẩng mặt (low hold) |
| S10 | `69f8fba0-603b-4053-81f5-32716759627f` | thầy khuấy đều, Kin nghiêng vào (OTS) |
| S11a | `fb226146-638a-4378-8030-8d2b920b2098` | thầy chìa muỗng ra (giver-side) |
| S11b | `5e005a63-d69c-4bcd-9938-05c1e6e8a7be` | Kin nhận muỗng 2 tay, cúi đầu (reverse) |
| S12 | `5d5efc5f-f7e9-4cc1-9172-27216614c8c5` | Kin rang lại vững, khuấy đều |
| S13 | `dbf0c7ce-1ca4-40dd-bec1-3c11c32b786a` | hơi thơm bốc lên camera (overhead hold) |
| S14 | `de154936-8928-4baa-883b-0c159c157cd2` | Kin hít, cười sâu, push-in |

S11 = CẮT 2 clip (S11a | S11b) match-on-action ở edit, KHÔNG matchcut nội suy (reverse angle).

### 6d. THỨ TỰ RÁP FINAL S1→S16 (clip mới 🆕 + clip cũ ✅)
```
S1 K1 e5e8cb48✅ · KL 20680fa5✅ · S2 K2 6aa73d8d✅ · S3 K3 9e4050f7✅(nháp) · S4 K5a fd88af9f✅(nháp)
S5 K5b 85bd9bc5✅ · S6 K6 1e070bcc✅(nháp) · S7 4432fc53🆕 · S8 K7 cedfb38c✅ · S9 c4ea3931🆕
S10 69f8fba0🆕 · S11 fb226146+5e005a63🆕(cắt 2) · S12 5d5efc5f🆕 · S13 dbf0c7ce🆕 · S14 de154936🆕
S15 K8 5207366c✅ · S16 K10 094cfa48 + K11 40298967✅
```
Còn treo: ★9:16 native (S7/S10/S11/S13/S14) cho phim tổng + social; C1 clip nháp S3/S4/S6 (chờ user chốt re-gen).

## 7. Generation order (mới)
```
IMG-6 → IMG-7 → IMG-8 → IMG-9a → IMG-9b(cần 9a) → IMG-10a → IMG-10b
S7 → S9 → S10 → S11(matchcut 9a/9b, kling3_0) → S12 → S13 → S14 → xong ráp theo thứ tự S1→S16
```

## 8. Decision Log (append)
```
{script_fidelity, "Kin shotlist", [v2 giữ nguyên; viết lại theo beat], viết-lại-v3, "v2 bịa 'nhìn trời' thay 'ngửi mẻ thành công', hạ mentor thành reactor — vi phạm B4-B8. rejected_because: beat-drift"}
{reference_films, "Kin roast scene", [Whiplash;Jiro;KarateKid;Ratatouille;KungFuPanda], Jiro+KarateKid+Ratatouille, "approval-by-sense / tool-handover / smell-grammar"}
{frame_source, "S11 handover", [single-start; matchcut], matchcut, "cần khoá 2 trạng thái: muỗng tay thầy → tay Kin"}
{asset_reuse, "clip cũ", [bỏ hết; reuse có map], reuse-có-map, "10/11 clip cũ vẫn phủ B0-B2,B4,B8-coda; chỉ K9 deprecated"}
{aspect_ratio, "keyframe mới Kin", [3:4 CU; 16:9 = video], 16:9-native, "C2 v4: 3:4 dưới 16:9 crop hỏng; IMG-6/8/9a/9b/10a/10b sinh 16:9, ★ thêm 9:16. rejected_because: aspect mismatch"}
{style_key, "Lão Rang Card", [mô tả rời từng shot; 1 Card byte-identical], 1-Card-§4b, "C3 v4: v3 xoá Card → drift nguy cơ; dựng lại từ IMG-5 3e0c1cc1 + mảnh mô tả, paste S8-S15"}
{frame_source, "C1 S3/S4/S6 reframe-from-WS", [re-gen CU keyframe riêng; giữ clip nháp], HOÃN-giữ-nháp, "clip cũ dùng tạm; re-gen tốn credit, chờ user chốt"}
```
