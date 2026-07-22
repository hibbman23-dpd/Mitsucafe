# Tam Mật — PRODUCTION STATUS (đọc trước ở session mới, chỉ LÀM TIẾP không làm lại)

> **2026-07-14 UPDATE:** Kin phần thiếu (S7,S9,S10,S11,S12,S13,S14) = **XONG** (7 keyframe v4.1 + 8 clip
> kling3_0_turbo 1080p 16:9). Đã vá C2 aspect + C3 Lão Rang Card + coverage anti-flatness (góc đa dạng
> map ý nghĩa). Skill bump **v2.8** (rule SET-ANCHOR≠CAMERA-ANCHOR chống phim 1-góc-phẳng). Chi tiết
> job_id + thứ tự ráp: `kin-shotlist-manual.md` §6b/6c/6d. Balance sau: ~2935cr. Còn treo: ★9:16 native
> (S7/S10/S11/S13/S14), C1 clip nháp S3/S4/S6 chờ chốt re-gen, ráp phim.
> **RITSU 16:9 cũng XONG** (2026-07-14): beat-audit PASS, 8 keyframe v2 coverage + 10 clip kling3_0_turbo 1080p
> (R1-R11, R6 reuse R5). Khách = người (chốt). Chi tiết ở `ritsu-shotlist-manual.md` §keyframe-v2 + §clip-v2.
> **SŌ 16:9 cũng XONG** (2026-07-15): v3 rebuild (arc plant-note + Ông Hoa ensemble + closure khách), 17 keyframe + 17 clip; engine v3.1 thêm PROP continuity (fix So10b ly). Chi tiết `so-shotlist-manual.md`.
> **3/4 PHIM CON XONG 16:9** (Kin/Ritsu/Sō). Còn: phim tổng (Lâm Hà: Ki+highlights reuse+Ten+Ketsu), ★9:16 cả 3 phim, ráp.
>
> 2026-07-08. Skill higgsfield-director = ~~v2.7~~ **v3.0 CONTINUITY ENGINE** (2026-07-14: Location Bible + invariant + render verification — đọc SKILL.md §CONTINUITY ENGINE trước khi generate bất kỳ địa điểm tái xuất). MCP Higgsfield lúc bàn giao DISCONNECT — reconnect trước khi generate.
> Model chốt: keyframe `gpt_image_2` 2cr (ref ảnh thật thay Soul) · video `kling3_0_turbo` 7.5cr single-start / `kling3_0` 10cr matchcut.
> Canon docs: `Projects/lamha-kissaten/docs/` = gốc · `higgsfield-director-workspace/tam-mat-docs/` = mirror mở được (đồng bộ).

## 4 phim — tổng quan
| Phim | Shotlist | Keyframe | Clip |
|---|---|---|---|
| **Kin** 🇯🇵Kyoto | v4.1 (beat+coverage) XONG | XONG (7 cũ + 7 v4.1) | **XONG 16:9** (S1-S16 đủ; ★9:16 treo) |
| **Ritsu** 🇯🇵Osaka | v2 audit v2.8 XONG (beat PASS) | XONG (8 v2 coverage) | **XONG 16:9** (R1-R11; ★9:16 treo) |
| **Sō** 🇯🇵Tokyo | **v3 rebuild XONG** (plant note + ensemble Ông Hoa + closure khách) | **XONG (17 keyframe v3, verified)** | **XONG 16:9** (17 clip; ★9:16 treo) |
| **Phim tổng** 🇻🇳Lâm Hà | có | XONG (6 ảnh) | CHƯA (reuse ★ Kin) |

Keyframe job_id đầy đủ trong từng shotlist mục "Ảnh đã sinh". Ảnh thật ref: Kin `41b9ec57`,`59df700b` · Ritsu `f3ca61e0`,`d46bd411` · Sō `82d5072d`,`79f1f2aa`,`3412855e` · Ong Chúa `e85fde0d`.

## KIN — clip nào XÀI ĐƯỢC (reuse, KHÔNG làm lại)
| Shot | Beat | Clip 16:9 | 9:16 ★ | Ghi chú |
|---|---|---|---|---|
| S1 | establishing | `e5e8cb48` | `9e08326d` | ✅ xài |
| KL | Kyoto landmark | `20680fa5` | `5a4eac97` | ✅ xài |
| S2 | Kin rang (B1) | `6aa73d8d` | — | ✅ xài |
| S5 | nhận ra khói (B2→B3) matchcut | `85bd9bc5` | `3087a47e` | ✅ xài (keyframe 3:4, crop nhẹ) |
| S8 | Lão Rang đến bên (B4) | `cedfb38c` | — | ✅ xài |
| S15 | thầy gật (B8 coda) | `5207366c` | — | ✅ xài |
| S16 | dư âm trời hửng | `094cfa48`+`40298967` | `104d3d65`+`45a1cbd8` | ✅ xài (coda ADD) |

## KIN — clip NHÁP, dưới chuẩn v2.7 (dùng tạm HOẶC làm lại)
| Shot | Clip | Lỗi (gate v2.7) |
|---|---|---|
| S3 | `9e4050f7` | INSERT/CU DISCIPLINE — animate từ IMG-2 (WS) reframe, không keyframe CU riêng |
| S4 | `fd88af9f` | như trên (insert chảo) |
| S6 | `1e070bcc` | như trên (insert hạt cháy) |

## KIN — CHƯA có, phải LÀM MỚI (session sau)
Keyframe mới (prompt sẵn mục 5 kin-shotlist) + clip:
- S7 (B3 thất vọng) IMG-6 · S9 (B4 động viên) IMG-7 · S10 (B5 demo) IMG-8 · S11 (B6 trao muỗng, matchcut) IMG-9a+9b · S12 (B7 rang lại, ảnh có sẵn IMG-2) · S13 (B8 chảo thơm) IMG-10a · S14 (B8 hít mùi) IMG-10b.
- Ước tính: ~14cr ảnh + ~75cr video (2 ratio ★).

## KIN — clip BỎ (deprecated, đừng dùng)
`11711957` (K9 cũ) = beat-drift, đã loại.

## Việc phải sửa để Kin đạt chuẩn v2.7 (audit đã chạy)
3 CRITICAL:
- **C1** S3/S4/S6 = reframe-from-WS → sinh keyframe insert CU riêng (chảo) rồi re-gen 3 clip.
- **C2** ASPECT: keyframe CU đang 3:4 dưới video 16:9 → sinh lại CU ở 16:9 (+9:16 cho ★). Ảnh hưởng IMG-3/4/6/9a/9b/10b.
- **C3** Lão Rang KHÔNG có Character Card (v3 rewrite xoá mất) → viết Card byte-identical (0 credit), paste mọi shot S8-S15.

6 SUGGESTION: cast genre pack `craft-artisan` + log `{genre_pack}` · Scene Card + Blocking Map (Kin+Lão Rang) · thought-change shot ở TURN B3→B4 · Sound Map (foley rang/hít + score cue B8) · chạy subagent briefs (≥5 shot) · bỏ "quietly disappointed" (bare emotion) thành động từ vật lý.

## NEXT SESSION — thứ tự đề xuất
1. Viết Kin **v4** (0 credit): vá C1-C3 + 6 suggestion trong shotlist. (Tôi đã đề xuất làm; user chưa chốt A/B.)
2. Beat-audit Ritsu + Sō shotlist qua gate v2.7 (2 file này viết pre-v2.0, có thể beat-drift như Kin cũ) TRƯỚC khi generate clip.
3. Generate: Kin phần thiếu → Ritsu clips → Sō clips → phim tổng (reuse ★ Kin).
4. Không đụng clip ✅ ở bảng "xài được".

## File liên quan (workspace tam-mat-docs/ + canon lamha docs/)
`kin-shotlist-manual.md` (v3) · `ritsu-shotlist-manual.md` · `so-shotlist-manual.md` · `phim-tong-ten-ketsu-shotlist.md` · `cast-design-tam-mat.md` · `tam-mat-image-prompts.md` · `tam-mat-video-prompts.md` · `session-handoff-tam-mat-film.md`.
Skill fine-tune: `../skill-v2-handoff.md`.
