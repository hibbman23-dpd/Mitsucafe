# Phim TỔNG — Ki + Highlights + Ten + Ketsu | Shot-list tay | gate v1.9

> ~110s = **Ki** (setup) + **3 highlight** (reuse clip phim con) + **Ten** (hội tụ) + **Ketsu** (về tổ).
> Card/prop/style = `cast-design-tam-mat.md`. Nguyên tắc: clip phim con **dùng lại nguyên**, KHÔNG generate lại.
> Chỉ generate MỚI: 1 bridge (tuỳ chọn) + Ten (T1-T4) + Ketsu (Ke1-Ke3). Video = `kling3_0`, riêng **Ke2 = `cinematic_studio_video_v2`** (multi_shots, cfg cao — cú máy liền mạch).
> Biểu tượng lõi: **giọt mật vàng phát sáng** (Ong Chúa ôm) — hội tụ về.

## Bối cảnh — 🇻🇳 LÂM HÀ (3 con ong từ Nhật TRỞ VỀ, gặp nhau mở quán)
Thung lũng cao nguyên Lâm Hà (Lâm Đồng): đồi thông, sương/mây, magic-hour ấm; quán **Mitsu** (938 Hùng Vương)
phong vị *junkissa* Việt-Nhật. **Ki** (3 con về Lâm Hà gặp nhau) + **Ketsu** (mở quán) = Lâm Hà.
**3 highlight** = reuse clip Nhật (Kin/Kyoto, Ritsu/Osaka, Sō/Tokyo — hồi tưởng học nghề). **Ten** = ánh sáng
trừu tượng trong tổ (không địa lý). Đối lập cảm xúc: 3 nơi Nhật riêng lẻ → 1 mái nhà chung Lâm Hà.

## Locks (kế thừa + hội tụ)
- **L1 màu**: 3 hue riêng (Kin cream/gold · Ritsu ấm-amber · Sō rust) chập chờn → **hợp thành honey-gold ổn định** ở giọt mật → lan khắp tổ.
- **L2 máy**: 50mm tĩnh; **Ke2 = 1 oner push/track liền mạch** (ngoại lệ signature); cấm handheld.
- **L4 bố cục**: Ten = 3 điểm sáng rời → 1 điểm trung tâm; Ketsu = giọt mật center, tổ honeycomb quanh.
- **L5 cảm xúc**: rời rạc/chập chờn → hội tụ ổn định → viên mãn ấm.
- **Composition mode**: Atelier T4, Ke2 (money shots); Templated còn lại.

## Ki (setup) + Highlights — ASSEMBLY (không generate mới)
```
Ki:   MỞ MỚI ở Lâm Hà (Ki1 dưới) — 3 con về thung lũng gặp nhau; KHÔNG reuse K1 (K1 giờ là Kyoto).
3 highlight (reuse bản ★ 9:16/16:9 đã sinh ở phim con — hồi tưởng học nghề tại Nhật):
  KIN:   K10 (ngước nhìn trời, Kyoto)   — diligence/chú tâm
  RITSU: R10 (ngẩng gặp mắt khách, Osaka)— discipline/hiện diện
  SŌ:    So10 (khựng tay giữ ly, Tokyo) — creativity/chủ đích
  → 3 shot này = "mỗi con đã hoàn thiện riêng ở Nhật" trước khi hội tụ về Lâm Hà.
  (Có thể chèn thêm 3 landmark beat ★ KL/RL/SoL — torii Kyoto / kênh Osaka / crossing Tokyo — từ phim con
   để đoạn hồi tưởng "cảm nước Nhật" đậm hơn trước khi về Lâm Hà.)
```
**Ki + bridge (generate MỚI, Lâm Hà):**
| Shot | Ảnh | FS · Soul | ★ | Prompt |
|---|---|---|---|---|
| Ki1 | IMG-Ki1 (thung lũng Lâm Hà bình minh) | FS1 | ★ | `EWS. Lâm Hà highland valley at dawn — pine hills, drifting mist, warm magic-hour light over the Mitsu shopfront. Slow push-in. Holds.` |
| B1 | IMG-B1 (3 ong gặp nhau ở Lâm Hà) | FS3 · 3 Soul | | `WS. The three bees meet in the Lâm Hà valley and stand together, pine and mist behind. Camera slow push-in. Holds.` |

## Ten (hội tụ) — T1-T4 (generate MỚI, kling3_0)
Neg: `drifting camera, face morphing, character drift, flickering background, garbled text, watermark`

| Shot | Ảnh mở | Soul + Slot1 | ★9:16 | Prompt (shot-type + endpoint) |
|---|---|---|---|---|
| T1 | IMG-T1 (3 đốm sáng-giọt trong tổ tối) | — | ★ | `Three separate glowing droplets of light (cream-gold, warm-amber, rust) hover in a dark honeycomb space, each flickering weak and unsteady. Slow drift. Ends still flickering.` |
| T2 | chụp T1 | — | | `Two of the droplets drift together and touch, brightening — but the merged light still wavers, not stable. Ends mid-waver.` |
| T3 | chụp T2 | — | | `The third droplet joins; all three spiral inward toward one point. Camera slow push-in. Ends as they meet.` |
| T4 ⭐ | 2 ô: start chụp T3 / end IMG-T4 (Ong Chúa ôm giọt mật) | ONG CHÚA | ★ | `MATCHCUT: the three lights fuse into a single stable glowing honey droplet, held cupped in the Queen's hands, steady and bright. Camera holds.` |

## Ketsu (về tổ + tuyên ngôn) — Ke1-Ke3

| Shot | Ảnh / model | FS · Soul | ★ | Prompt |
|---|---|---|---|---|
| Ke1 | chụp T4 · kling3_0 | FS2 · ONG CHÚA | ★ | `The Queen lifts the honey droplet; its golden light spreads across the honeycomb hive, cells glowing warm. Slow push-in. Holds.` |
| **Ke2** | IMG-Ke2 (quầy quán Mitsu Lâm Hà) · **`cinematic_studio_video_v2`** (multi_shots, cfg cao) | FS1 · — | ★ | ONER 3 callback liền mạch tại quán Mitsu Lâm Hà: `Single continuous camera move across the Mitsu counter — coffee is poured at the exact right moment (Kin's diligence) → the cup is set down with a meeting of eyes (Ritsu's presence) → a flower is placed with intention (Sō's memory). One unbroken take, warm highland light. Ends on the finished setting.` |
| Ke3 | chụp Ke2 · kling3_0 | FS3 | ★ | `Pull back to a wide of the perfect Mitsu shop in the Lâm Hà valley — all three touches in frame, pine and mist through the window, honey-gold glow, the droplet motif above. Slow pull-out. Ends on the full room.` |
| Tagline | — · **`openai_hazel`** | — | | Card chữ: "Một giọt mật, ba con ong." (KHÔNG render chữ bằng model video.) |

## Ảnh làm sẵn (flux_2 / soul_cast)
| Ảnh | Model | Nội dung |
|---|---|---|
| IMG-Ki1 | flux_2 | thung lũng Lâm Hà bình minh: đồi thông, sương, magic-hour, mặt tiền quán Mitsu |
| IMG-B1 | soul_cast (3 Soul) | 3 ong (Kin/Ritsu/Sō) gặp nhau ở thung lũng Lâm Hà, thông+sương sau lưng |
| IMG-T1 | flux_2 | 3 đốm sáng-giọt (cream-gold/amber/rust) lơ lửng trong honeycomb tối |
| IMG-T4 | soul_cast+ONG CHÚA | Ong Chúa ôm 1 giọt mật vàng ổn định, sáng đều (prop anchor giọt mật) |
| IMG-Ke2 | flux_2 | quầy quán Mitsu Lâm Hà (junkissa Việt-Nhật): ly cà phê + hoa đặt + ánh sáng cao nguyên ấm |

### ✅ Ảnh đã sinh (gpt_image_2, medium/1k, 2026-07-05) — job_id = start-frame video
| Ảnh | job_id | Ghi chú |
|---|---|---|
| IMG-Ki1 Lâm Hà valley (no people) | `4c95658d-6744-477e-9f21-eac9c9b5bf50` | ★ |
| IMG-B1 3 ong gặp ở Lâm Hà | `03324585-eec2-4cee-88f4-44962e094756` | ref 3 ảnh Kin+Ritsu+Sō thật |
| IMG-T1 3 giọt sáng | `289580c1-1767-4087-9205-864a6cfecd7b` | ★ |
| IMG-Ke2 quầy Mitsu Lâm Hà | `7fff37c1-f3e5-4b14-ae62-5038a7d76488` | oner Ke2 |
| PROP-Q giọt mật (biểu tượng lõi) | `6c21dfda-0a4c-47d9-b172-60843eb11e46` | job-id reuse T4/Ke1 |
| IMG-T4 Ong Chúa + giọt mật | `3105ec41-cc3c-46ad-9aa3-a2d84859eb96` | ref ảnh Ong Chúa thật `e85fde0d-43ba-448f-91ce-c32a8fecfbbc` + PROP-Q |

## Generation order
```
Reuse sẵn: K10 (Kyoto), R10 (Osaka), So10 (Tokyo) — bản ★, hồi tưởng học nghề.
Mới (Lâm Hà + hội tụ): IMG-Ki1/B1/T1/T4/Ke2 → train/áp Soul ONG CHÚA + 3 Soul + prop giọt mật
  Ki1(anchor Lâm Hà) → B1 → T1 → T2 → T3 → T4(cần T3 + IMG-T4) → Ke1(cần T4) → Ke2(CSV2 riêng, quán Lâm Hà) → Ke3(cần Ke2) → Tagline(hazel)
```
## Decision Log
```
{frame_source, "T4 fusion",   [minimal-motion; matchcut], matchcut, "cần khoá end 1 giọt ổn định trong tay Ong Chúa"}
{model_selection, "Ke2 oner",  [kling3_0; cinematic_studio_video_v2], CSV2, "cú máy liền mạch 3 callback cần multi_shots + cfg cao"}
{prop, "giọt mật",  [mới mỗi shot; 1 asset dùng chung], 1-asset, "job-id reuse T4/Ke1 = biểu tượng nhất quán"}
{composition_mode, "T4/Ke2", [Templated; Atelier], Atelier, "money shots hội tụ + tuyên ngôn"}
```
## Ghi chú
- Ten = "sáng đơn lẻ vẫn mờ, 2/3 vẫn lung lay, đủ CẢ BA mới ổn" → T1 chập chờn, T2 lung lay, T3 xoáy, T4 ổn.
- Ke2 là shot tuyên ngôn — nếu CSV2 khó giữ liền mạch, fallback FS6 chain kling3_0 (3 đoạn nối last-2s).
- 3 callback Ke2 phải khớp motif đã lập: rót đúng lúc (Kin) / ánh mắt khi đặt (Ritsu) / đặt hoa có chủ đích (Sō).
- Sau khi đủ shot: Coherence Audit toàn phim tổng (180°, rhythm curve, Lock compliance) — bước cuối §5.
