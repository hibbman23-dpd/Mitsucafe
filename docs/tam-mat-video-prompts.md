# Tam Mật — BỘ PROMPT VIDEO đầy đủ 4 phim (kling3_0)

> Paste vào Higgsfield `generate_video`, model **`kling3_0`** (image-to-video). Cách dùng tay:
> - **Shot thường**: 1 ảnh mở (start) + gõ câu MOTION (chỉ tả chuyển động, KHÔNG tả lại cảnh/mặt).
> - **Matchcut (⭐)**: 2 ô ảnh — `start_image` + `end_image` — gõ MOTION ngắn. KHÔNG dùng element token khi có end_image.
> - **Text-to-video (FS7)**: không ảnh, dán prompt có `[STYLE]`.
> - **"chụp màn hình"**: xuất 1 frame nét (mặt rõ, không nhòe) từ clip trước → dùng làm ảnh mở shot sau.
> - ★ = render thêm bản **9:16** (reuse phim tổng + social). Aspect kling: 16:9 / 9:16 (KHÔNG 21:9).
> [NEG] dán mọi shot: `drifting camera, face morphing, character drift, hand deformation, garbled text, watermark`

`[STYLE]` (cho shot text-to-video) = `2D ink-and-watercolor, chibi-anime, black ink linework + watercolor washi grain, ochre/rust/cream/ink-black, flat 2D paper cut-out, warm.`

---

# PHIM 1 — KIN 🇯🇵 Kyoto (K1–K11) — ảnh mở đã có job_id (kin-shotlist-manual.md)
| Shot | Ảnh mở | ★ | MOTION |
|---|---|---|---|
| K1 | IMG-1 | ★ | `Slow push-in. Smoke drifts up and thins. Camera holds.` |
| K2 | IMG-2 | | `Kin stirs the pan steady for three strokes, then the paddle stills. Camera static.` |
| K3 | chụp K2 | | `Medium on his hands and the wooden paddle, metronome tempo, beans tumbling. Ends on a completed stroke.` |
| K4 | IMG-3 | ★ | `Eyes stay down on the beans, one slow blink, a breath, never looks around. Camera static.` |
| K5a | chụp K3 | | `Insert: beans shift amber to dark, a thin smoke thread curls faster. No move. Ends as the first dark bean turns.` |
| K5b ⭐ | start IMG-3 / end IMG-4 | ★ | `Eyes flick up from the pan, smile fades. Camera holds.` |
| K6 | chụp K5a | | `Insert: burnt black beans, thick dark smoke curling up. Camera static. Ends as smoke fills the top of frame.` |
| K7 | IMG-5 | | `Medium: the old master steps in behind Kin, silent, tilts his head and sniffs the air once. Camera holds.` |
| K8 | chụp K7 | | `Close-up: the master closes his eyes and gives one slow nod toward the smoke. Camera static.` |
| K9 | IMG-3 | | `Kin follows the master's gaze, hesitates, his head lifts a few degrees and holds.` |
| K10 | chụp K9 | ★ | `Kin lifts his head fully and looks up at the sky for the first time, eyes widening with wonder. Slow push-in. Holds.` |
| K11 | text-to-video | ★ | `[STYLE] Wide low-angle dawn sky over Kyoto tiled rooftops and Higashiyama hills, warm gold blooming, one thin pale smoke thread, clouds drift slowly. Ends on full light.` |
| KL | IMG landmark (b5c421c7) | ★ | `Slow push-in; lanterns sway faintly, thin mist drifts over the roofs. Ends on the pagoda.` |

---

# PHIM 2 — RITSU 🇯🇵 Osaka (R1–R11) — ảnh mở = IMG-R* (xem image-prompts)
| Shot | Ảnh mở | ★ | MOTION |
|---|---|---|---|
| R1 | IMG-R1 | ★ | `EWS. Morning light spreads across the counter, Osaka signage soft-blurred through the window. Slow push-in. Steam rises. Holds.` |
| R2 | IMG-R2 | | `Ritsu steps to the counter, sets the kettle and V60, ties the apron, then stills. Camera static.` |
| R3 | IMG-R3 | ★ | `CU of the gooseneck stream pouring a precise spiral into the V60, eyes down on the stream. Ends on a full pour.` |
| R4 | chụp R3 | | `Insert: the coffee bed blooms and domes, steam curling. No move. Ends as the dome peaks.` |
| R5 | IMG-R3 | | `Ritsu sets the cup before guest 1 with a small formal nod, eyes still down. Camera static.` |
| R6 | IMG-R3 | | `Same exact pour and nod for guest 2, identical motion. Camera static. Ends on the nod.` |
| R7 | IMG-R5 | | `Beside him, Cô Trà pours tea and lifts her eyes to meet the guest, a warm half-smile. Camera holds.` |
| R8 | chụp R3/R4 | | `Insert: under rush the pour stream wavers and misses the center, unstable. No move. Ends as it drifts off-center.` |
| R9 | IMG-R3 | | `Ritsu's face tightens, he glances sideways toward Cô Trà, hesitates. Camera holds.` |
| R10 ⭐ | start IMG-R3 / end IMG-R4 | ★ | `Ritsu slows, lifts his gaze from the stream to meet the guest's eyes, the pour staying steady. Camera holds.` |
| R11 | chụp R10 | ★ | `MCU two-shot: the guest smiles back, Ritsu pours steady while holding the gaze. Slow push-in. Holds.` |
| RL | text-to-video | ★ | `[STYLE] EWS Osaka Dōtonbori canal, arched bridge, painted signboards reflected in water, crowd silhouettes, warm sepia. Slow pan. Ends on the reflection.` |

---

# PHIM 3 — SŌ 🇯🇵 Tokyo (So1–So10) — ảnh mở = IMG-S*
| Shot | Ảnh mở | ★ | MOTION |
|---|---|---|---|
| So1 | IMG-S1 | ★ | `WS. Slow push-in across the colorful bench, Tokyo street soft-blurred beyond the glass, warm light, steam drifting. Camera holds.` |
| So2 | IMG-S2 | | `Sō layers a tall iced milk-coffee with quick darting hands, grinning. Ends as she sets it down.` |
| So3 | chụp S2 | ★ | `Insert: the finished layered drink, foam curl rising, cream-amber-dark bands. No move. Ends on the curl.` |
| So4 | IMG-S3 | | `Sō immediately pours the drink out and reaches for the next idea, not looking back. Camera static.` |
| So5 | IMG-S6 | | `A guest asks for "the one from before," hopeful. Camera holds. Ends on the ask.` |
| So6 | IMG-S3 | | `Sō falters — she cannot remember, nothing was kept. Camera holds. Ends on the blank look.` |
| So7 | chụp S1 | | `Insert: the empty bench, no note, nothing saved. No move. Ends holding on the emptiness.` |
| So8 | IMG-S5 | | `Ông Hoa steps in silently and sets down the smoothed-out note Sō threw away. Camera holds.` |
| So9 | IMG-S3 | | `Sō looks at the note, recognition dawning — the memory returns. Camera holds. Ends on the flicker of recognition.` |
| So10 ⭐ | start IMG-S3 / end IMG-S4 | ★ | `Sō starts to toss the new cup, then stops her own hand mid-air and holds it. Camera holds.` |
| SoL | text-to-video | ★ | `[STYLE] EWS Tokyo scramble crossing, crowds flowing between tall buildings, cherry-lined canal, warm sepia. Slow push-in. Ends mid-flow.` |

---

# PHIM TỔNG — 🇻🇳 Lâm Hà + hội tụ
| Shot | Ảnh mở · model | ★ | MOTION |
|---|---|---|---|
| Ki1 | IMG-Ki1 · kling3_0 | ★ | `EWS Lâm Hà valley at dawn — pine, mist, magic-hour over the Mitsu shopfront. Slow push-in. Holds.` |
| B1 | IMG-B1 · kling3_0 | | `The three bees meet in the Lâm Hà valley and stand together, pine and mist behind. Slow push-in. Holds.` |
| — | REUSE K10 / R10 / So10 (★ hồi tưởng học nghề Nhật) | ★ | *(dùng lại clip, không generate lại)* |
| T1 | IMG-T1 · kling3_0 | ★ | `Three separate glowing droplets flicker weak and unsteady. Slow drift. Ends still flickering.` |
| T2 | chụp T1 · kling3_0 | | `Two droplets drift together and touch, brightening but still wavering. Ends mid-waver.` |
| T3 | chụp T2 · kling3_0 | | `The third droplet joins; all three spiral inward. Slow push-in. Ends as they meet.` |
| T4 ⭐ | start chụp T3 / end IMG-T4 · kling3_0 | ★ | `The three lights fuse into a single stable glowing honey droplet in the Queen's hands. Camera holds.` |
| Ke1 | chụp T4 · kling3_0 | ★ | `The Queen lifts the droplet; its golden light spreads across the honeycomb hive, cells glowing warm. Slow push-in. Holds.` |
| **Ke2** | IMG-Ke2 · **`cinematic_studio_video_v2`** (multi_shots, cfg cao) | ★ | ONER 3 callback: `One continuous camera move across the Mitsu counter — coffee poured at the exact right moment (Kin) → the cup set down with a meeting of eyes (Ritsu) → a flower placed with intention (Sō). One unbroken take, warm highland light. Ends on the finished setting.` *(fallback nếu CSV2 khó giữ liền mạch: FS6 chain kling3_0, nối last-2s từng đoạn)* |
| Ke3 | chụp Ke2 · kling3_0 | ★ | `Pull back to a wide of the perfect Mitsu shop in the Lâm Hà valley — pine and mist through the window, honey-gold glow, droplet motif above. Slow pull-out. Ends on the full room.` |
| Tagline | — · `openai_hazel` (ảnh chữ, KHÔNG video) | | "Một giọt mật, ba con ong." + logo Mitsu |

---

## Quy tắc tay (nhắc lại)
1. Ô MOTION chỉ tả chuyển động — đừng tả mặt/áo/màu (ảnh giữ rồi; tả lại = đổi mặt).
2. Chỉ 4 shot matchcut (K5b/R10/So10/T4) dùng 2 ô ảnh. Còn lại 1 ảnh + motion. FS7 (K11/RL/SoL) không ảnh.
3. Mọi motion có điểm đến ("Ends…/Holds/stills") — Kling treo 99% nếu action không có endpoint.
4. ★ render thêm 9:16.
5. Thoại: phim này gần như không thoại (mentor không lời). Nếu thêm thoại Việt → ElevenLabs → Kling Lipsync (Kling native không có tiếng Việt).
6. Nhịp cắt: dialogue ~6 cut/phút, action ~25 — phim này chậm (breath/pulse), giữ shot dài vừa.
