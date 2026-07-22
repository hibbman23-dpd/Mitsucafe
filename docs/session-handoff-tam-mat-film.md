# Session Handoff — Phim "Tam Mật" (Higgsfield AI Film)

> Bàn giao 2026-07-03. Dùng skill `anthropic-skills:higgsfield-director` (v1.7) khi tiếp tục.
> Đọc file này trước, không cần đọc lại toàn bộ transcript cũ.

## 1. Mục tiêu

Phim hoạt hình AI (Higgsfield) kể câu chuyện gốc "Tam Mật" của Mitsu — 3 chú ong Kin/Ritsu/Sō
sang Nhật học nghề, mỗi con đại diện 1 đức tính, trở về xây tổ cho Ong Chúa. Nguồn brand:
`docs/brand-voice.md` §6 (story arc gốc), §1 (nhân vật/tagline).

**Kiến trúc 4 chuỗi đã chốt** (không đổi):
```
Phim 1: KIN (diligence)   ~58s — bối cảnh 🇯🇵 KYOTO (xưởng rang machiya)
Phim 2: RITSU (discipline) ~58s — bối cảnh 🇯🇵 OSAKA (kissaten)
Phim 3: SŌ (creativity)    ~52s — bối cảnh 🇯🇵 TOKYO (lab pha sáng tạo)
Phim tổng (~110s) = Ki + 3 highlight (reuse clip Nhật) + Ten (hội tụ) + Ketsu — bối cảnh 🇻🇳 LÂM HÀ (mở quán Mitsu)
```
**Canon địa điểm:** 3 phim riêng ở NHẬT (học nghề, mỗi con 1 thành phố); phim tổng ở LÂM HÀ (3 con trở về gặp
nhau mở quán). Highlights trong phim tổng = hồi tưởng học nghề tại Nhật. Ten = ánh sáng trừu tượng (không địa lý).
Mỗi phim con generate 1 lần, dùng lại nguyên clip cho phim tổng — không generate lại.

## 2. Thesis mỗi con ong (KHÔNG đổi — đã fine-tune kỹ)

| Ong | Trait cực điểm (Act1) | Chính trait đó gây lỗi (Act2) | Bù đắp | Cử chỉ hoàn thiện (Act3) |
|---|---|---|---|---|
| Kin 勤 | Chăm chỉ không nhìn quanh | Rang theo nhịp cố định, mặc mùi đổi → cháy | Chú tâm/lắng nghe | Ngước nhìn trời lần đầu |
| Ritsu 律 | Kỷ luật, rót y hệt mọi khách | Sợ trễ quy trình hơn sợ hỏng → tay run | Hiện diện | Nhìn vào mắt khách khi rót |
| Sō 創 | Sáng tạo, luôn đổ bỏ vừa pha xong | Không giữ lại gì → không nhớ lại được cho khách | Chủ đích/ký ức | Tự ngăn tay mình đổ ly đi |

**Ten (hội tụ)**: dù mỗi con đã hoàn thiện riêng, ánh sáng đơn lẻ vẫn mờ — 2/3 hội tụ vẫn chưa ổn định — chỉ đủ CẢ BA mới thành giọt mật ổn định. **Ketsu**: shot Ke2 (mới) — 1 cú máy liền mạch: cà phê rót đúng lúc (callback Kin) → đặt xuống có ánh mắt (callback Ritsu) → hoa đặt có chủ đích (callback Sō) = tuyên ngôn "quán hoàn hảo = tổng hoà cả ba".

Mentor mỗi phim (đã đổi theo yêu cầu):
- Kin: **Lão Rang** (ong già, muỗng rang gỗ, dạy bằng cách ngửi/im lặng, không lời)
- Ritsu: **Cô Trà** — ĐÃ ĐỔI từ "Bà Trà" mentor bề trên → đồng nghiệp NGANG HÀNG, không dạy, chỉ tương phản qua hành động
- Sō: **Ông Hoa** — twist đã đổi: KHÔNG cắm hoa nữa, mà lặng lẽ trả lại **tờ ghi chú cũ Sō đã vứt** (twist mạnh hơn, nối trực tiếp Act1→Act2 bằng vật thể cụ thể)

## 3. Style hình ảnh — ĐÃ CHỐT (quan trọng, đổi so với plan ban đầu)

User gửi 2 ảnh tham khảo Kin thật (không phải mô tả text). Style thật:
**2D ink-and-watercolor illustration, chibi-anime proportions** — nét mực đen + màu nước có
vân giấy, palette ochre/rust/cream/đen mực, đầu to mắt to kiểu anime. **KHÔNG phải** "stylized
3D-illustrated" như plan gốc ban đầu — đã sửa lại toàn bộ Lock 1/4 theo style thật này.
**Áp dụng cho TOÀN BỘ cast (Kin/Ritsu/Sō/Ong Chúa/3 mentor) + mọi bối cảnh** (user xác nhận).

Kin's Character Card đã final (từ 2 ảnh thật):
```
PHYSICAL: chibi bee-boy, mắt nâu to có highlight, lông mày sắc/tập trung (đặc điểm mặt cố định,
  KHÔNG PHẢI giận dữ), má hồng, NỤ CƯỜI NHẸ là mặc định. Khăn đầu cream 2 dải tưa + kanji 勤 đen,
  2 râu đen đầu tròn nâu. Áo gi nâu gỉ phủ lớp trong tối, THÂN DƯỚI SỌC NGANG ĐEN-VÀNG (bụng ong),
  đai dây thừng + mấu gỗ, cánh nhỏ trong mờ, ủng nâu. Thường mang đòn gánh 2 giỏ mây.
PERSONALITY: cường độ ấm áp lặng lẽ — mày tập trung + cười thật; quyết liệt qua TƯ THẾ (gánh
  nặng, bước đều) KHÔNG qua nét mặt hung dữ.
```
Asset phụ: ly "mitsu" đã có design thật trong ảnh 2 (cốc trong + wordmark mitsu + hanko 蜜 +
trân châu đen) — dùng lại cho shot Ke2 cuối phim tổng để đồng bộ.

**Toàn cast có Card + keyframe prompt** trong `docs/cast-design-tam-mat.md` (Lão Rang trong
`docs/kin-shotlist-manual.md`):
**CAST CHỐT ĐỦ 2026-07-05 — không còn ai chờ ảnh:**
- **Ảnh thật (FINAL):** Kin · **Ritsu** (barista tạp dề cream + gooseneck + V60) · **Sō** (hoa cúc + haori
  rust + túi chéo + ly sữa đá bọt) · **Ong Chúa** (vương miện nạm ngọc + áo choàng đỏ + ôm **giọt mật vàng
  phát sáng** = biểu tượng lõi phim). Cả 4 đã ĐÈ bản X.2.8 derived cũ (Decision-Log reversion).
- **X.2.8 tự thiết kế (FINAL, user "còn lại tự tạo"):** Lão Rang · Cô Trà · Ông Hoa.
User thay ảnh thật cho nhân vật đã lỡ generate → Recast/Soul-Inpaint, không dựng lại.

## 4. Quyết định kỹ thuật đã chốt (model, workflow)

**Model chuẩn hoá toàn dự án** (đã sửa từ plan ban đầu có veo3_1 — bỏ hẳn, không hợp style
2D-illustrated):
- Video: **`kling3_0`** toàn bộ 4 phim (hỗ trợ sẵn 16:9 YouTube + 9:16 TikTok/FB, không cần đổi model)
- Keyframe ảnh: **`flux_2`** primary (hợp stylization ink-wash hơn seedream_v4_5)
- Character identity: **`soul_cast`** (budget cao cho Kin/Ritsu/Sō/Ong Chúa, thấp cho mentor)
- Tagline card cuối phim: **`openai_hazel`** (KHÔNG dùng video model render chữ — model video render text rất tệ)
- Ke2 (cú máy liền mạch 3 callback): xem xét `cinematic_studio_video_v2` (cfg_scale cao, multi_shots)

**Kỹ thuật frame-source — matchcut start/end: áp CÓ CHỌN LỌC theo Module X.3, KHÔNG đại trà**
(sửa lại: bản trước ghi "mọi shot bắt buộc start+end" — sai, xung đột với Frame Source Decision Matrix):

Kling 3.0 (và Seedance 2.0) hỗ trợ thật cặp `role:"start_image"` + `role:"end_image"` trong `medias`
(matchcut — model nội suy động tác GIỮA 2 ảnh keyframe). Xác nhận đúng: `format-e-mcp.md §API Quirks`.
Nhưng đây là MỘT frame-source technique, KHÔNG phải luật bắt buộc. Chọn qua Frame Source Decision Matrix
(Module X.3 — FS1–FS7); "NOT every shot needs a new start frame":

- **Dùng matchcut (start+end image)** chỉ khi cần khoá CHÍNH XÁC trạng thái kết của shot (đúng pose/vị trí
  để match cut sang shot sau, hoặc động tác cần điểm đến rõ). Thường là FS1/FS2/FS3 với 1 end-frame tự chỉ định.
- **KHÔNG cần end_image**:
  - **FS7** (establishing/dream/abstract) = pure text-to-video, không ảnh.
  - **FS6** (long take, nối > 1 shot) = video continuation: `Extend @Video1` / last 2–3s clip — cơ chế
    **@video1**, KHÔNG phải cặp ảnh. ĐỪNG nhét FS6 vào khuôn start/end image (đây là lỗi ở bản trước).
  - Shot thường = 1 keyframe + minimal-motion prompt (Popcorn pipeline MẶC ĐỊNH, MODE 2): 1 start image,
    prompt chỉ tả CHUYỂN ĐỘNG. Vẫn hợp lệ — không "thiếu" gì. End_image là công cụ THÊM khi cần, không phải vá lỗi.

Khi CÓ dùng matchcut thì khai báo (kèm Frame Source để không bỏ qua gate X.3):
```
FRAME SOURCE: FSx (lý do 1 dòng)
START_IMAGE:  [ảnh — fresh keyframe HOẶC end-frame/screenshot shot trước nếu FS2/FS3]
END_IMAGE:    [ảnh — trạng thái kết, có thể tái dùng làm START_IMAGE shot sau]
MOTION:       [prompt ngắn — model nội suy giữa 2 ảnh, KHÔNG tả lại cảnh]
```
Element token `<<<@NAME>>>` chỉ dùng ở BƯỚC SINH ẢNH (keyframe/soul_cast). KHÔNG đưa token vào lệnh
matchcut video khi có end_image (Kling/Seedance không tương thích — `format-e-mcp §API Quirks`).
Budget: matchcut ăn 4 slot medias → còn tối đa 5 element token.

Các fix nhỏ khác đã áp (từ audit skill v1.7, xem `references/modules/editing-grammar.md`):
- Kuleshov: không bắt model "diễn cảm xúc phức tạp" (xấu hổ, thất vọng) — tách CU mặt trung tính
  + insert vật thể mang nghĩa, để khán giả tự gán cảm xúc. Đã áp cho K5b, cần áp lại cho So4.
- Rupture dài (5-6s thay vì chuẩn 0.5-1.5s) → khai báo rõ là "Long Take variant" trong Lock 5.
- Eye-trace giữa 2 shot LIỀN CẢNH phải khớp vị trí khung hình (trừ act-transition = reset hợp lệ).
- 9 shot ★ highlight (dùng lại ở phim tổng + cutdown social) nên generate cả bản 9:16 native.

## 5. Trạng thái hiện tại — đã xong gì, còn gì

✅ **Xong hoàn chỉnh**: kiến trúc 4 chuỗi, thesis 3 con ong, 5 Locks, Character Card Kin (final,
từ ảnh thật), 11 shot Kin (K1-K11) — **bản mẫu để làm theo cho 2 phim còn lại**.
⚠️ **Cần QC lại K1–K11 theo §4 đã sửa**: các shot bị ép thành matchcut start+end phải soi lại — shot nào
là establishing/dream (FS7) hoặc long-take continuation (FS6) thì BỎ end_image, trả về đúng frame source
theo X.3. Chỉ giữ matchcut ở shot thật sự cần khoá trạng thái kết.

⚠️ **Khuyến nghị chưa áp**: tách K5 (Rupture) thành K5a/K5b — 1 matchcut khó nội suy bước nhảy
khung lớn (drum→mặt Kin) trong 1 lần, nên chia 2 shot nối tiếp.

✅ **Ritsu film (R1-R11)** — shot-list + Frame Source plan XONG, `docs/ritsu-shotlist-manual.md` (gate v1.9).
✅ **Sō film (So1-So10)** — shot-list + Frame Source plan XONG, `docs/so-shotlist-manual.md` (gate v1.9).
   (Cả 2: FS mỗi shot, Soul tick, eyeline, ★9:16, 1 matchcut đúng chỗ [R10/So10], Kuleshov, Decision Log.)

✅ **Phim TỔNG (Ki + Highlights + Ten T1-T4 + Ketsu Ke1-Ke3)** — shot-list XONG,
   `docs/phim-tong-ten-ketsu-shotlist.md` (gate v1.9). Ten hội tụ 3 hue→giọt mật (T4 matchcut);
   Ke2 = oner 3 callback dùng `cinematic_studio_video_v2`; reuse ★ K10/R10/So10.

→ **TOÀN BỘ 4 chuỗi đã có shot-list + Frame Source plan.** Còn lại chỉ là THI CÔNG:
1. Sinh keyframe/sheet 4-view toàn cast → train Soul (KIN/RITSU/SŌ/ONG CHÚA + LÃO RANG/CÔ TRÀ/ÔNG HOA)
   + sinh sạch prop anchor (giọt mật, kettle+V60, ly sữa đá bọt, tờ note).
2. Generate 4 phim theo gen-order trong từng file; giữ 9 shot ★ bản 9:16 cho phim tổng + social.
3. Ráp phim tổng: reuse clip phim con + Ten/Ketsu mới; Ke2 thử CSV2, fallback FS6-chain kling.
4. Coherence Audit toàn phim tổng (180°, rhythm curve, Lock compliance).

## 6. Việc cần từ user trước khi tiếp

- Ảnh tham khảo: **KHÔNG bắt buộc nữa** — toàn cast đã bootstrap-design (X.2.8) ở `docs/cast-design-tam-mat.md`.
  Chỉ gửi ảnh nếu muốn thay bản tự-thiết-kế bằng likeness thật (swap qua Recast, không chặn tiến độ).
- Xác nhận có tách K5 thành K5a/K5b không.
- Xác nhận thứ tự làm tiếp: Ritsu trước hay Sō trước (không có preference nào được nêu).

## 7. Cách dùng file này ở phiên mới

Mở skill `anthropic-skills:higgsfield-director`, đọc file này thay cho việc đọc lại transcript,
rồi tiếp tục từ mục 5 ("Chưa làm"). Style/model/workflow ở mục 3-4 là LUẬT CỐ ĐỊNH, không phải
đề xuất — áp thẳng, không hỏi lại trừ khi user đổi ý.
