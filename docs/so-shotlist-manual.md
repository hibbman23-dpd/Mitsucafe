# Phim Sō 創 (Tam Mật) — Shot-list v3 | engine v3.0 (design duyệt 2026-07-14)

> **v3 REBUILD (audit gate v3.0):** shotlist v1.9 cũ có 2 orphaned interaction CHÍ MẠNG — (1) tờ note
> KHÔNG được plant (Ông Hoa trả "note Sō đã vứt" nhưng không cảnh nào Sō viết/vứt note → twist chết);
> (2) khách hỏi So5 mà cả phim KHÔNG AI TRẢ LỜI. + Ông Hoa teleport-in (triết lý "người GIỮ" đòi hiện
> diện nền TỪ ACT1 — khán giả thấy ông nhặt, Sō không thấy = twist nổ). + coverage phẳng eye-level.
> + keyframe cũ 1k/3:4. User duyệt full rebuild, dừng sau keyframe.

## ⚠️ v3.3 GEOMETRY AUDIT (2026-07-17) — dò lại phim Sō bằng engine v3.3 (station/geometry)
Phim Sō làm TRƯỚC v3.1-3.3 → dính đúng lớp bug như Ritsu: (1) master thiếu SINK + trạm Ông Hoa (chỉ có trong closeup = trạm không tồn tại); (2) bộ ba match-frame so2c/so7/so8 nền lưới-ô-nhỏ sai + mất vật neo beaker; (3) so5/so11 KHÔNG phải reverse thật (cùng thấy kính); (4) cửa sổ/Tower nhảy cỡ; (5) mùa = xuân (cây xanh) lẫn lộn → chốt THU.
**PLAN-OF-RECORD MỚI = s1_patch `6b281462-a485-4bd9-ab69-5ab83091e99d`** (master có sink Tây + bàn Ông Hoa góc ĐB). STATION PLATE góc ĐB = `a69407ba-6e7f-4e3b-a809-905c07c8c86e` (sinh style-key text, KHÔNG ref plate khác — luật v3.3).
| Shot | v2 keyframe (geometry-fixed) | ghi chú verify |
|---|---|---|
| So1 | `6b281462-...` | master mới, sink+bàn Ông Hoa CÓ THẬT |
| So2c plant | `31d431c1-3a76-4181-80e4-c8a03adc961d` | beaker-neo giữa khung, kính ô lớn, thu, sketch ly+hoa |
| So5 hỏi | `41d47b2b-7a1e-4010-b7aa-58411971e1d9` | tường NAM (không kính/Tower) — reverse thật với So11 |
| So7 trống | `7c558b4d-1110-47b0-bfc9-f7e90a9f79af` | KHỚP KHUNG so2c, note+ly mất, màu xám kiệt |
| So8 trả note | `6bc3c51f-8d53-4630-b7d8-51403f51bae1` | khớp khung so7, note về, màu ấm lại |
| So8b Ông Hoa gật | `061d3714-bcec-4cd1-859c-b44e0feb2795` | góc ĐB thật (poster cạnh-on, Tower chuẩn) |
| So10 pha lại | `438b4fe6-67cd-4f5a-a3be-97ece622c8b9` | kệ thép Bắc, kính dải hẹp phải, thu |
| So11 đưa khách | `60e74a35-a165-4d71-9f8f-56008d42da00` | nhìn Bắc (kệ+kính phải) — reverse thật với So5 |
GIỮ (geometry ổn, không đụng): So2a `72846e72` · So2b overhead `036a91ec` · So3 `ea2fba8f` · So4 sink `2003ffec` · So4b `42bef377` · So6 `defa98f4` · So9 `ac3322f7` · So10b `615107b7`.
**So4c v2** (twist) = `149119eb-f4ae-4f48-86e8-60ea4bcf8c28` — regen: cây XANH→THU (cross-shot diff mùa), Sō sink Tây quay đi + Ông Hoa nền nhặt note vào hộp; bản cũ `442936a6` (green summer) BỎ. Clip `b4dfd0d7-1348-43a2-ae46-805759d6a594`.

### ✅ CLIP v2 GEOMETRY-FIXED (kling3_0_turbo 1080p)
| Shot | clip | Shot | clip |
|---|---|---|---|
| So1 | `cde04804-dfef-4eaf-a9e2-10b68f9b1f61` | So8 | `3ea9ca83-67c0-44b5-861e-c462cc2be198` |
| So2c | `3d7e4605-1589-4e24-a567-1a68f29b2c7b` | So8b | `1a2a4262-52cb-4ff8-8b2e-8fecb38f74d9` |
| So4c | `b4dfd0d7-1348-43a2-ae46-805759d6a594` | So10 | `38774f4f-c9e6-4109-9c27-b9c8d7aeb7bb` |
| So5 | `60be8e75-cdcb-4cd4-a7e1-bed4fa158fb5` | So11 | `f4a0a160-604c-4033-bccb-70cdbe41508c` |
| So7 | `d2adbce7-780e-4103-abb1-9b215e27d8f4` | | |
GIỮ clip cũ (geometry ổn): So2a `380b6d70` · So2b `ef48df26` · So3 `cd6ae774` · So4 `6916c7fd` · So4b `81246f5e` · So6 `f6dc9fad` · So9 `4deef5e6` · So10b `f6772d5c`.

## LOCATION BIBLE — Tokyo lab (canon = IMG-S1 `93685d86` + IMG-S2 `72846e72`, upscale giữ nguyên)

```
FLOOR PLAN:
  ĐÔNG:  CỬA KÍNH LỚN khung thép mảnh Ô TO — Tokyo Tower đỏ + phố + cây ngoài; bàn phụ + stool cạnh kính
  BẮC:   kệ lọ gia vị/bình thủy tinh + cây rủ + poster art; cụm espresso + grinder đầu TÂY kệ
  GIỮA:  BÀN ISLAND thí nghiệm (flask màu, ống nghiệm, dropper, khay gia vị, cối) — Sō đứng phía BẮC nhìn Nam
  TÂY island: SINK — mọi cảnh đổ bỏ diễn ra Ở ĐÂY
  ĐÔNG-BẮC cạnh kính: TRẠM ÔNG HOA — bàn gỗ nhỏ yên tĩnh, sổ ép hoa, hộp gỗ nhỏ "đồ giữ lại"
  NAM:   mép khách (phía camera họ chính)
```
INVARIANTS:
- **IS1**: cửa kính CHỈ tường ĐÔNG — khung thép mảnh Ô TO, Tokyo Tower + phố + cây (KHÔNG khung gỗ ô nhỏ kiểu Osaka)
- **IS2**: tường BẮC = kệ lọ/bình + cây + poster; espresso+grinder đầu Tây
- **IS3**: bàn island giữa; Sō phía BẮC bàn; đồ: flask màu, ống nghiệm, ly tầng
- **IS4**: SINK = đầu TÂY island; đổ bỏ luôn ở đây
- **IS5**: trạm Ông Hoa = góc ĐÔNG-BẮC cạnh kính (sổ ép hoa + hộp gỗ) — ông hiện diện mọi shot thấy góc đó
- **IS6**: sáng ấm từ kính Đông; Act2 xám hơn (L3)
- **IS7**: mọi khung kính = thép mảnh ô to (cấm biến thành khung gỗ nhỏ)
REGISTRY: Sō (bắc island; pha/thử/đổ) · Ông Hoa (đông-bắc TỪ ACT1; business: lau, ép hoa, lặng lẽ nhặt-giữ đồ bị vứt) · khách (đến B4, mép nam).
PROP ANCHORS (P-invariant — canon = So3 `ea2fba8f` / note So2c `9243386c`):
- **P1 ly sữa đá bọt**: ly CAO trong (≈2× chiều cao bàn tay), tầng cream/amber/dark rõ + foam curl trên; KHÔNG phải ly thấp rộng/mug. (Bug So10b: ra tumbler thấp → re-gen.)
- **P2 tờ note**: giấy cream nhỏ, sketch bút chì LY TẦNG + BÔNG HOA nhỏ; bản Act1 phẳng→vò nhàu, bản Act3 vuốt phẳng lại (giữ nếp).

## BEAT LIST v3 (giữ verbs gốc + plant)
```
B1 Sō PHA (hào hứng) + VIẾT note công thức, gài mép bàn → B2 ly tầng XONG (đẹp) →
B3 ĐỔ BỎ ly vào sink + VÒ note ném, không nhìn lại → B3b Ông Hoa NỀN lặng lẽ NHẶT note (Sō không thấy) →
B4 KHÁCH đến hỏi "ly hôm trước" → B5 Sō KHÔNG NHỚ (không giữ gì) →
B6 Ông Hoa ĐẶT note ĐÃ VUỐT PHẲNG đúng chỗ cũ → B7 Sō NHẬN RA →
B8 pha lại theo note + tay đưa về sink KHỰNG giữa không trung + ĐẶT LY TRƯỚC KHÁCH (đóng B4)
```

## SHOT LIST v3 (~16 shot ~64s) — angle → nghĩa · video kling3_0_turbo 1080p
| Shot | Beat | Angle (nghĩa) | Keyframe |
|---|---|---|---|
| So1 | B0 | WS establishing push-in | S1 upscale ✓reuse |
| So2a | B1 | MCU pha, tay thoăn thoắt | S2 upscale ✓reuse |
| So2b | B1 | **OVERHEAD** bàn island đầy màu (phong phú sáng tạo — motif overhead 3 phim) | NEW |
| So2c | B1 | insert CU tay viết note + gài mép bàn (**PLANT 1**) | NEW |
| So3 | B2 | insert ly tầng hoàn thành, foam curl | NEW (ref S2) |
| So4 | B3 | MS hơi HIGH: đổ ly vào SINK, tay kia vò note ném (lãng phí) | NEW |
| So4b | B3 | insert ly tầng tan xuống sink (đau — chain từ So3) | NEW (ref So4) |
| So4c | B3b | qua vai Sō-đang-quay-đi: **Ông Hoa nền cúi nhặt note**, cho vào hộp gỗ (**PLANT twist**) | NEW |
| So5 | B4 | **OTS qua vai Sō** → khách hỏi, mong đợi (exchange) | NEW |
| So6 | B5 | CU Sō mắt trống (Kuleshov) | NEW (thay S3 3:4) |
| So7 | B5 | insert **chỗ gài note TRỐNG** (L4 khung trống — khớp vị trí So2c) | NEW (ref So2c) |
| So8 | B6 | **CÙNG KHUNG So7**: tay già đặt note vuốt phẳng vào đúng chỗ (match-frame) | NEW (ref So7) |
| So8b | B6 | MCU Ông Hoa lùi nhẹ, một gật, lặng (Jiro) | NEW |
| So9 | B7 | CU thought-change HOLD→FLICKER→SETTLE: mắt chạm note → nhận ra | NEW (ref So6) |
| So10 | B8 | MCU pha lại theo note, mắt sáng | NEW (ref S2) |
| So10b ⭐ | B8 | CU tay đưa ly về hướng sink → **KHỰNG** giữa không trung → hạ xuống (thesis; thay S4 3:4) | NEW |
| So11 | B8 | **REVERSE receiver-side**: đặt ly trước khách, khách đón, Sō cười thật (đóng chain B4) | NEW (ref So5) |
| SoL | — | landmark Tokyo (reuse `830e8d5f`) | ✓ |

DoP pass (junction): So2c note-gài ↔ So7 trống ↔ So8 đặt lại = CÙNG VỊ TRÍ mép bàn (match-frame 3 điểm) · So3 ly ↔ So4b tan (vật cầu) · So4 vò-ném ↔ So4c nhặt (vật cầu, Sō quay đi = không thấy) · So5 hỏi ↔ So11 trả (đóng) · sink LUÔN đầu Tây (IS4) · Ông Hoa: So4c nhặt (nền) → So8/8b trả → mọi shot thấy góc ĐB có ông (IS5). DUYỆT.

### ✅ KEYFRAME v3 ĐÃ SINH 2026-07-14 (gpt_image_2 2k 16:9; Stage C verified; BIND: note = sketch LY+HOA, note bay về phía Đông)
| Shot | job_id | verify |
|---|---|---|
| So1 | S1 upscale `8942a216-6e14-48ad-903f-0280baf4c4ee` | reuse canon |
| So2a | S2 upscale `f37ac69b-4d4d-42a5-8aeb-acc17779edee` | reuse canon |
| So2b overhead | `036a91ec-68b7-4c3d-b815-d1e4ec806c51` | PASS |
| So2c note plant | `9243386c-afce-46db-a780-d5ef0d2b4222` | PASS (BIND sketch) |
| So3 ly xong | `ea2fba8f-eb4c-4d8a-ba94-ca1a5b5b6147` | widget check |
| So4 đổ sink | `2003ffec-5d1c-4f0b-b542-6c21762c69b4` | PASS |
| So4b ly tan | `42bef377-8659-4f61-9091-0e4b94bc344c` | widget check |
| So4c Ông Hoa nhặt | `442936a6-9df1-408f-b683-687f3b3ea083` | PASS (twist) |
| So5 OTS khách | `39e698c9-52cb-4783-9281-4190542e3b60` | PASS |
| So6 CU trống | `defa98f4-f2b5-4706-ac53-b12a7e9dc17f` | PASS |
| So7 chỗ trống | `154c64bb-5c38-4b8a-9d8a-65015f396a4d` | PASS (match So2c) |
| So8 đặt note | `47fb373d-c384-480f-9a6d-85b59f30fe2f` | PASS (match So7, sketch rõ) |
| So8b ông gật | `d6c8059f-f095-4825-a7ba-eab6c8616ea9` | PASS (IS5) |
| So9 nhận ra | `ac3322f7-0f91-44eb-aea0-efd94a5fb5a0` | widget check |
| So10 pha lại | `5540497f-5cf1-458f-9da0-70b8d479a108` | widget check |
| So10b tay khựng | **v2 `615107b7-6b10-4103-b08a-070a7fc76ef0`** (v1 `465b9d3f` FAIL P1 ly thấp→bỏ) | PASS (P1 ly cao layered) |
| So11 reverse đưa khách | `baa90ff2-49c6-423d-a234-d867aac55283` | widget check |

### ✅ CLIP v3 ĐÃ SINH 2026-07-15 (kling3_0_turbo 1080p 16:9 5s, image-first minimal-motion)
Thứ tự ráp: So1 → [SoL opt] → So2a → So2b → So2c → So3 → So4 → So4b → So4c → So5 → So6 → So7 → So8 → So8b → So9 → So10 → So10b → So11
| Shot | clip | Shot | clip |
|---|---|---|---|
| So1 | `bc740744-56d6-40dc-bd19-f8386ed58b36` | So6 | `f6dc9fad-7701-4741-a300-5ab8e38cb4d0` |
| So2a | `380b6d70-58b9-4267-8195-8e93f597ae87` | So7 | `1786b29f-daac-431d-969c-0b874265e6fd` |
| So2b | `ef48df26-0dac-4bf7-81a7-dc2c95d44475` | So8 | `cb718bc4-44e3-4571-9dc1-61f3f73d340e` |
| So2c | `bc88165e-f8ea-4262-8129-00784696e638` | So8b | `c7226157-ddb3-4797-af2e-1f33da58d451` |
| So3 | `cd6ae774-e279-4999-9c41-87d9a14251e8` | So9 | `4deef5e6-06fc-4ac5-b564-f147a2a6a193` |
| So4 | `6916c7fd-3727-4af4-a901-7a67b62270f2` | So10 | `d4d78102-d005-442d-8ce1-8601ab83072b` |
| So4b | `81246f5e-582f-4d9f-95e8-bb51c36c2265` | So10b | `f6772d5c-1712-4f7e-8187-345cf6f1b038` |
| So4c | `bc056323-029b-43ee-a303-3ba65fb961cc` | So11 | `e42ccb6a-214d-4e9b-bdf9-e9b671c2ae8e` |
| So5 | `e528664c-083b-44be-ba12-1d39405a57cc` | | |
SoL landmark chưa sinh clip (reuse `830e8d5f`, optional). ★9:16 pass sau.

DEPRECATED (1k/3:4/concept cũ): IMG-S3 `d59af2f4` · IMG-S4 `ccc34a29` · IMG-S5 `f478e852` (concept chìa→đặt; sheet vẫn dùng làm REF nhân dạng) · IMG-S6 `e0422d40`.
Ref nhân dạng: Sō thật `82d5072d`,`79f1f2aa`,`3412855e` · Ông Hoa sheet `f478e852` · PROP `da3435f8`.

---
# (v1.9 cũ giữ bên dưới để đối chiếu — KHÔNG dùng generate)

> Creativity. ~52s, 10 shot. Card/prop/style = `cast-design-tam-mat.md` (SŌ + ÔNG HOA). Model video = `kling3_0`.
> Thesis: sáng tạo, luôn đổ bỏ vừa pha xong → không giữ gì → không nhớ lại được cho khách → bù *chủ đích/ký ức* → Act3 **tự ngăn tay mình đổ ly đi**. Mentor **Ông Hoa** = người GIỮ, lặng lẽ **trả lại tờ ghi chú cũ Sō đã vứt** (twist, không cắm hoa).

## Bối cảnh — 🇯🇵 TOKYO (Sō sang Nhật học nghề sáng tạo)
Quán/lab pha chế sáng tạo Tokyo hiện đại (kiểu Nakameguro/Shibuya): bàn thí nghiệm nhiều đồ, cửa kính lớn, phố Tokyo năng động ngoài.
Đặc trưng Tokyo cảm được: hiện đại-đô thị, nhịp nhanh, nhiều màu >< nhưng vẫn giữ style ink-watercolor sepia (đừng neon quá). Ông Hoa xuất hiện ở lab Tokyo này.

## Locks
- **L1 màu**: Act1 rực nhiều màu vui (rust/amber/teal-accent) → Act2 nhạt/trống khi mất ký ức → Act3 ấm lại, ly được giữ.
- **L2 máy**: 50mm; nhịp nhanh hơn phim Ritsu (nhân vật lanh); signature = insert đồ pha nhiều tầng; **cấm** handheld.
- **L3 sáng**: bàn thí nghiệm cạnh cửa kính lớn (phố Tokyo mờ ngoài), ấm; Act2 xám hơn.
- **L4 bố cục**: Act1 khung đầy đồ/động → Act2 khung trống (empty counter) → Act3 khung khoá vào BÀN TAY giữ ly.
- **L5 cảm xúc**: hào hứng-phá (làm rồi đổ) → hụt/mất ký ức (không nhớ) → chủ đích (ngăn tay, giữ lại).
- **Composition mode**: Atelier So1, So10; Templated còn lại.

## Phần 0 — Soul
```
Train Soul SŌ (soul_cast, ảnh thật hoa cúc+haori) + Soul ÔNG HOA (X.2.8 sheet). Prop anchor sạch:
ly sữa đá bọt tầng (cream/amber/dark) + tờ ghi chú (bản VÒ NHÀU và bản VUỐT PHẲNG). Card verbatim.
```

## Ảnh làm sẵn (flux_2 / soul_cast)
| Ảnh | Model | Note | Nội dung |
|---|---|---|---|
| IMG-S1 lab pha Tokyo WS | flux_2 | no char, anchor L1 | bàn thí nghiệm pha chế nhiều màu trong quán/lab Tokyo hiện đại, cửa kính lớn phố Tokyo mờ ngoài, sáng ấm |
| IMG-S2 Sō pha MCU | soul_cast+SŌ | | Sō cười, tay thoăn thoắt xếp tầng ly sữa đá |
| IMG-S3 Sō CU trung tính | soul_cast+SŌ | nét, cho Kuleshov | CU Sō mặt bình, mắt to |
| IMG-S4 Sō tay khựng | soul_cast+SŌ | cùng khung tay-đổ, đông cứng | Sō đưa ly định đổ, bàn tay khựng giữa không trung |
| IMG-S5 Ông Hoa | soul_cast+ÔNG HOA | | Ông Hoa chìa tờ ghi chú đã vuốt phẳng |
| IMG-S6 khách | flux_2 | phụ | khách chờ, ánh mong đợi |

### ✅ Ảnh đã sinh (gpt_image_2, medium/1k, 2026-07-05) — job_id = start-frame video
| Ảnh | job_id | Ghi chú |
|---|---|---|
| IMG-S1 Tokyo lab (no people) | `93685d86-8545-4b9d-b0bb-b4c40eddb760` | 16:9 |
| IMG-S2 Sō pha ly MCU | `72846e72-8631-41ac-ba99-eda36243580c` | ref ảnh Sō thật |
| IMG-S3 Sō CU trung tính (master) | `d59af2f4-3284-47aa-8349-f997b7089dcf` | ref ảnh Sō thật |
| IMG-S4 Sō tay khựng (matchcut So10) | `ccc34a29-ef62-4941-ae92-3a01f7fdc37e` | ref IMG-S3 |
| IMG-S5 Ông Hoa sheet (chuyên nghiệp) | `f478e852-7121-4172-9dd2-fb571b9c8d28` | X.2.8 text |
| IMG-S6 khách | `e0422d40-dad4-4653-a649-a45d5c9875c9` | phụ |
| SoL Tokyo landmark (crossing) | `830e8d5f-d41d-47d0-a3cd-37e9efb99a9e` | ★ reuse phim tổng |
| PROP-S ly sữa đá bọt + tờ note | `da3435f8-54e2-48f4-b910-363467053ed7` | prop anchor |
> Ảnh Sō thật (ref): `82d5072d-df3e-4a07-a821-ea143aa67174`, `79f1f2aa-af1e-426c-8049-2743dd6d836c`, `3412855e-cd33-4e90-8fdc-ca911ef73afb`.

## 10 shot (video kling3_0). Neg: `drifting camera, face morphing, character drift, hand deformation, garbled text, watermark`

| Shot | Ảnh mở | Soul + Slot1 | Eyeline | ★9:16 | Prompt chuyển động (shot-type + endpoint) |
|---|---|---|---|---|---|
| So1 | IMG-S1 | — | — | ★ | `WS. Tokyo creative café at morning; slow push-in across the colorful experiment bench, city street soft-blurred beyond the glass, warm light, steam drifting. Camera holds.` |
| So2 | IMG-S2 | SŌ @image_1 | mắt xuống ly (làm) | | `MCU. Sō layers a tall iced milk-coffee with quick darting hands, grinning. Ends as she sets it down.` |
| So3 | chụp S2 | — (insert) | — | ★ | `Insert: the finished layered drink, foam curl rising, bands of cream-amber-dark. No move. Ends on the curl.` |
| So4 | IMG-S3 | SŌ | mắt lướt, quay đi | | `MS. Sō immediately pours the drink out and reaches for the next idea, not looking back. Camera static.` |
| So5 | IMG-S6 | — (guest) | khách nhìn Sō, mong đợi | | `CU. A guest arrives and asks for "the one from before," hopeful. Camera holds. Ends on the ask.` |
| So6 | IMG-S3 | SŌ | mắt trống, cụp nhẹ | | `CU. Sō falters — she cannot remember, nothing was kept. Camera holds. Ends on the blank look.` |
| So7 | chụp S1 | — (insert) | — | | `Insert: the empty bench, no note, nothing saved. No camera move. Ends holding on the emptiness.` |
| So8 | IMG-S5 | ÔNG HOA | Ông Hoa đặt note, nhìn xuống | | `MS. Ông Hoa steps in silently and sets down the smoothed-out note Sō had thrown away. Camera holds.` |
| So9 | IMG-S3 | SŌ | mắt XUỐNG tờ note | | `CU. Sō looks at the note, recognition dawning — the memory returns. Camera holds. Ends on the flicker of recognition.` |
| So10 ⭐ | 2 ô: start IMG-S3 / end IMG-S4 | SŌ | mắt theo bàn tay đang đổ | ★ | `MATCHCUT: Sō starts to toss the new cup, then stops her own hand mid-air and holds it. Camera holds.` |

## Landmark beat 🇯🇵 Tokyo (tuỳ chọn — để cảm nước Nhật; intercut sau So1)
FS7 pure-text-to-video, không nhân vật/Soul, ★9:16 (reuse hồi tưởng phim tổng). Model kling3_0.
```
SoL (Tokyo) ★: [STYLE] EWS. A Tokyo scramble crossing — crowds flowing between tall buildings, a
cherry-lined canal nearby, modern city energy in warm sepia ink-wash, a bee weaving through. Slow
push-in. No brand logos, no neon glare. Ends mid-flow.
```

## Generation order
```
IMG-S1→S2→S3→S4→S5→S6 → train Soul SŌ + ÔNG HOA + prop (ly + note)
So1(anchor) → So2 → So3(cần S2) → So4 → So5 → So6 → So7(cần S1) → So8 → So9 → So10(cần IMG-S3/S4)
```
## Decision Log
```
{frame_source, "So4 tossing / So6 lost", [diễn cảm phức tạp; Kuleshov neutral+insert], Kuleshov, "không bắt model diễn 'quên/hụt' — mặt trung tính S3 + insert bàn trống S7"}
{frame_source, "So10 turn",  [minimal-motion; matchcut], matchcut, "cần khoá end bàn tay khựng giữa không trung"}
{prop, "tờ ghi chú", [mới; tờ Sō vứt], tờ-Sō-vứt, "nối Act1(vứt)→Act3(giữ) bằng vật thể cụ thể — Ông Hoa trả lại"}
{composition_mode, "So1/So10", [Templated; Atelier], Atelier, "hero"}
```
## Ghi chú
- So4 (đổ đi) + So10 (ngăn tay) = cùng động tác ĐỐI XỨNG → đóng vòng thesis; So10 matchcut để khựng đúng khoảnh khắc.
- So6/So7 Kuleshov: mặt trung tính + bàn trống, để khán giả tự thấy "mất ký ức".
- Ông Hoa chỉ So8: twist bằng vật thể (tờ note), không lời, không cắm hoa.
