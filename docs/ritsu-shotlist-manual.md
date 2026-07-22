# Phim Ritsu 律 (Tam Mật) — Shot-list thao tác tay | gate v2.8

> **v2 audit 2026-07-14 (gate v2.8):** BEAT-fidelity PASS (mọi beat có shot, nhân-quả liền, Cô Trà agency,
> R8 Kuleshov đúng — KHÔNG drift). Vá: (a) keyframe cũ 1k + IMG-R3 **3:4 nền trơn mắt-nhìn-thẳng (sai)** →
> re-gen 2k/16:9 mắt cúi; (b) **COVERAGE v2.8** — góc đa dạng map ý nghĩa, EXCHANGE (R7/R10/R11) = OTS/reverse.
> Reuse: IMG-R1 EWS `61248058` · IMG-R2 WS `a3d79c6f` (đẹp, làm SET-anchor) · RL `6d713c3a` · Cô Trà sheet
> `11c76497` · PROP `81c8c232`. Ref gen: SET-anchor IMG-R2 + CHARACTER ảnh Ritsu thật `f3ca61e0`.
>
> ### COVERAGE PLAN v2 (angle → nghĩa)
> | Shot | Beat | Angle | Keyframe |
> |---|---|---|---|
> | R1 | B0 | EWS establishing | reuse IMG-R1 ✓ |
> | R2 | B1 | WS eye-level | reuse IMG-R2 ✓ |
> | R3 | B1 | **OVERHEAD top-down** pour (precision=ritual) | re-gen 16:9 |
> | R4 | B1 | insert bloom dome CU | re-gen 16:9 |
> | R5 | B2 | MS serve khách, **hơi HIGH** (máy móc/routine) | re-gen 16:9 |
> | R6 | B2 | y hệt R5 (motif kỷ luật) | reuse R5 |
> | R7 | B4 | **OTS/reverse guest-side** → Cô Trà gặp mắt (ấm/exchange) | re-gen 16:9 |
> | R8 | B3 | insert tia lệch, **canted/unstable** | re-gen 16:9 |
> | R9 | B5 | CU mặt căng, liếc ngang Cô Trà | re-gen 16:9 |
> | R10 | B6 | **OTS reverse guest→Ritsu**, ngẩng gặp mắt (mở khung) | re-gen 16:9 |
> | R11 | B7 | MCU two-shot/reverse khách cười, giữ mắt | re-gen 16:9 |
> SUGGESTION optional: thêm R8-pre **HIGH-angle** hàng ly/khách chờ = lập "giờ cao điểm" (nguyên nhân B3).
> Re-gen 8 keyframe (R3/R4/R5/R7/R8/R9/R10/R11). ★9:16 pass sau.

> ### ✅ KEYFRAME v2 ĐÃ SINH 2026-07-14 (gpt_image_2 2k/medium 16:9, ref SET IMG-R2 + CHAR ảnh thật; coverage v2.8)
> | Shot | angle | job_id v2 | ref |
> |---|---|---|---|
> | R3 | OVERHEAD pour | `d9f34ab1-5723-4b5f-9a86-b0452eb67204` | R2set+Ritsu-thật |
> | R4 | insert bloom top-down | `95deb1bc-873e-4a8d-8ed2-b0a98840ea2d` | R3v2 |
> | R5 (=R6) | HIGH serve khách | `fb51ee58-65fd-4c4d-b429-8a54b0e08e1a` | R2set+Ritsu-thật |
> | R7 | OTS Cô Trà gặp mắt | `cb93f651-e931-4d25-8ab5-7d5b626fec5c` | CôTrà-sheet+R2set |
> | R8 | insert canted lệch | `a54aeb08-12bf-4082-bb69-0b5aa09f2269` | R3v2 |
> | R9 | CU liếc ngang | `419007ce-7cd4-4adf-9dbc-53daeb674472` | Ritsu-thật+R2set |
> | R10 | OTS reverse turn (ngẩng gặp mắt) | `43fcade4-22ff-4dc4-aa81-005b30bb0a64` | Ritsu-thật+R2set |
> | R11 | side two-shot payoff | `7f0714de-b9e0-47b6-b9e3-665a41b81588` | Ritsu-thật+R2set |
> Reuse: R1 EWS `61248058-3d04-418a-bd1b-35c920006707` · R2 WS `a3d79c6f-6613-4b8c-a342-04dbf2c364c3` · RL `6d713c3a-7cad-4b8f-9f65-37103061d958` · Cô Trà sheet `11c76497-8d5c-45ef-b82f-6399b37f2250` · PROP `81c8c232-0ac8-4544-9b7e-573c74d29191`.
> DEPRECATED (1k/3:4 phẳng): IMG-R3 `fc9b9a55` · IMG-R4 `a664871a`. Ref Ritsu thật: `f3ca61e0`, `d46bd411`.
> Khách = GIỮ NGƯỜI (user chốt 2026-07-14: ong-barista phục vụ người, tương phản). ★9:16 pass sau.
>
> ### ✅ CLIP v2 ĐÃ SINH 2026-07-14 (kling3_0_turbo 1080p 16:9 5s, image-first minimal-motion)
> | Shot | clip job_id | motion |
> |---|---|---|
> | R1 | **v2 `fec6a6c8-db58-4cd8-ac95-e466d2b81ce2`** (keyframe `9a932819`, engine v3.0 verified) | push-in quán trống về cửa sổ cuối — cũ `5ca53465`/IMG-R1 FAIL I1/I8, bỏ |
> | R2 | `07575974-3164-4f06-918e-7c35ec70bb8a` | Ritsu đặt kettle+V60, buộc tạp dề (reuse IMG-R2) |
> | R3 | `d9f6ea60-6df3-4072-b9b8-587dded717af` | overhead rót spiral chính xác |
> | R4 | `1637894c-b961-4a0a-8249-3fede6d52f2b` | top-down bloom dome, hơi cuộn |
> | R5 (=R6) | `eb83fbc5-4fdc-461d-89f8-4ed75578435d` | đặt ly + gật formal, mắt xuống (reuse cho R6 = motif y hệt) |
> | R7 | `d5e0a358-21ff-47f1-87f8-d1013b1b59df` | Cô Trà rót trà, ngẩng gặp mắt khách (OTS) |
> | R8 | `acceab9a-f67c-40a8-ae8c-1621987638fc` | tia lệch canted, splash (insert) |
> | R9 | `17230a85-f22b-46dd-bc8a-c05c0f51a090` | mặt căng, liếc ngang, do dự (CU) |
> | R10 | `fc2de3a8-a3e2-433d-91ec-06b6c886e0fd` | ngẩng gặp mắt khách, rót vững (OTS turn) |
> | R11 | `5e49f925-fd83-4a29-a1f4-056b50497b20` | khách cười, Ritsu giữ mắt, push-in (payoff) — re-gen (cũ `968b8478` bỏ) |
> **Thứ tự ráp (v3 — thêm 3 shot ensemble/chain 2026-07-14):** R1 → [RL opt] → R2 → R3 → R4 → R5 → **R5b** → R6(=R5) → **R6b** → R7 → R8 → R9 → R10 → **R10b** → R11. RL landmark chưa sinh clip (optional intercut). ★9:16 pass sau.
>
> ### v3 ENSEMBLE + CHAIN (skill v2.9 — feedback user: Cô Trà teleport-in, ly không ai nhận, thiếu góc sau lưng)
> **POPULATION REGISTRY:** Ritsu = trạm pour giữa quầy · Cô Trà = trạm trà cuối quầy BÊN TRÁI Ritsu (khớp R9 liếc trái), business = rót trà cho khách của cô · khách = ngồi dọc quầy.
> | Shot mới | Vai trò | Camera (động cơ) |
> |---|---|---|
> | R5b | interaction chain: khách NHẶT ly R5 vừa đặt (vật cầu = ly) | CU tĩnh |
> | R6b | REVEAL scope-of-duty + lập giờ cao điểm + Cô Trà hiện diện nền | sau lưng Ritsu, máy NÂNG lên (motivated reveal, dọc trục) |
> | R10b | peer-approval: Cô Trà thấy Ritsu đổi, gật nhẹ (Kuleshov đôi R10, eyeline frame-phải) | MCU tĩnh |
> DoP pass: junctions R5→R5b (vật cầu) · R6→R6b (rise reveal hợp lệ 180°) · R6b→R7 (hết teleport-in) · R10→R10b→R11 (eyeline+nhịp) — DUYỆT.
>
> ✅ SINH XONG 2026-07-14 (gpt_image_2 2k + kling3_0_turbo 1080p):
> | Shot | keyframe | clip |
> |---|---|---|
> | R5b | `36bb4579-4762-47dd-8ec4-bb64596fd07d` | `59489528-c4f5-4750-8fed-bf54443455b8` |
> | R6b | **v2 `630498af-8d75-4d7f-bd38-2652583a2fa1`** (v1 `53c1b5ef` FAIL I3/I5, bỏ) | **v2 `acd0e954-791a-45af-aa6e-cbe1cba1f5d3`** (v1 `8b47fd6a` bỏ) |
> | R10b | `16590cc0-c560-4650-97ab-c470c0a4ed69` | `b29db444-6246-4a3d-9b97-93077246a67a` |

> Discipline. ~58s, 11 shot. Card/prop/style = `cast-design-tam-mat.md` (RITSU + CÔ TRÀ). Model video = `kling3_0`.
> Thesis: rót y hệt mọi khách, mắt dán tia nước không nhìn người → giờ cao điểm tay run → bù *hiện diện* → Act3 **nhìn vào mắt khách khi rót**. Mentor **Cô Trà** = đồng nghiệp ngang hàng, dạy bằng tương phản (luôn nhìn mắt khách).

## LOCATION BIBLE — quán kissaten Osaka (engine v3.0, canon = họ R2, chốt 2026-07-14)

> **v3.3 SỬA GỐC (Fable audit 2026-07-16):** Bible cũ MÂU THUẪN — bảo "cửa sổ tường Tây" + "Cô Trà đầu Tây cạnh cửa sổ" + "Ritsu giữa quầy", nhưng canon đã duyệt (R2/R5/R1v2) cho thấy **cửa sổ nằm trên tường ĐẦU HỒI TÂY mà quầy ĐÂM VÀO (bình hoa+đèn dome = điểm kết thúc quầy), và RITSU ĐỨNG NGAY SÁT nó** → **Ritsu CHÍNH LÀ bay Tây**. Cô Trà không thể ở đó. Chỗ trống duy nhất = **đầu ĐÔNG**, và ở đó **cửa sổ RỜI KHỎI khung** (đúng như user chỉ ra). Eyeline vì thế ĐẢO.

```
FLOOR PLAN v2 (compass; D1 = camera NAM nhìn BẮC → Tây=TRÁI khung, Đông=PHẢI khung):
   BẮC — back bar chạy suốt: [ván gỗ] [kệ tách/dĩa] [lọ] [máy xay + espresso] [HUTCH TRÀ (đầu Đông)]
 ┌──────────────────────────────────────────────────────────────┐
 │CỬA SỔ│  lane phục vụ (nhân viên, phía BẮC quầy)              │ ĐÔNG:
 │tường │  [trạm RITSU/pour: kettle+V60+carafe — BAY TÂY]       │ tường trơn
 │đầu hồi│                                    [trạm CÔ TRÀ/tea: │ (lối vào
 │TÂY   │                                     ấm+hũ trà+chổi    │  góc ĐN)
 │bệ:   │                                     — BAY ĐÔNG]       │
 │hoa+đèn│──────────── QUẦY chạy Đ–T ──────────────────────────  │
 └──────────────────────────────────────────────────────────────┘
   NAM — stool/khách (ngoài quầy); tường Nam ĐẶC, không cửa (trừ lối vào góc ĐN)
```
INVARIANTS:
- **I1**: **DUY NHẤT 1 cửa sổ**, trên **tường ĐẦU HỒI TÂY** — bức tường mà quầy đâm vào; bệ ngang mặt quầy, có bình hoa vàng + đèn dome; kênh Dōtonbori ngoài. Không tường nào khác có cửa/ô sáng.
- **I2**: tường BẮC (sau lưng nhân viên) chạy suốt: ván gỗ → kệ tách/lọ → máy xay+espresso → **hutch trà đầu ĐÔNG**.
- **I3**: quầy chạy Đ–T; nhân viên phía BẮC (TRONG quầy); khách stool phía NAM.
- **I4**: **trạm RITSU = BAY TÂY, sát cửa sổ** (canon R2/R5 khoá — không đổi).
- **I5**: **trạm CÔ TRÀ = ĐẦU ĐÔNG** (bay Tây đã có chủ). Đồ trà nằm ở hutch Đông.
- **I6**: tường ĐÔNG = trơn, đóng khung bên phải khi nhìn từ D1; KHÔNG cửa sổ.
- **I7**: sáng = ban mai ấm rọi từ cửa sổ Tây → càng về Đông càng nhờ đèn nội thất ấm.
- **I8**: khung cửa sổ = gỗ sẫm ô nhỏ, bệ ngang mặt quầy, spec CỐ ĐỊNH (cấm đổi lưới ô / kính tấm liền).
- **I9**: tường NAM đặc — **CẤM cửa sáng/ô sáng phụ** (R6b cũ bịa 1 cửa góc Tây-Nam = FAIL).

**GEOMETRY PER STATION (suy từ plan — cấm "đổi props giữ nguyên hình học"):**
- **D1 @ bay TÂY (Ritsu)** = canon: cửa sổ **TRÁI khung, gần, xiên**, có cột góc + bệ hoa/đèn; kệ tách sau lưng; máy xay/espresso mép PHẢI; sáng rọi từ trái. (R2/R5/R10/R11 ✓ giữ)
- **D1 @ đầu ĐÔNG (Cô Trà)** = **KHÔNG có cửa sổ trong khung** (cùng lắm 1 mẩu xa tít mép trái, nhỏ & bẹt); **máy xay/espresso ở mép TRÁI** (phía Tây của cô); **tường đầu hồi ĐÔNG đóng khung bên PHẢI**; hutch trà sau lưng; ánh sáng mềm từ trái + đèn ấm nội thất — **KHÔNG backlit, không ô kính sáng cạnh cô**.
- **D2-Tây** (sau lưng Ritsu nhìn Tây): cửa sổ chính diện cuối lane, khách TRÁI, back bar PHẢI, **KHÔNG có Cô Trà** (cô ở sau lưng máy).
- **D2-Đông** (sau lưng Ritsu nhìn Đông): khách PHẢI, back bar TRÁI, Cô Trà cuối lane, **không cửa sổ trong khung**.
**STATION DRESSING (v3.2 — 2 trạm PHẢI trông khác nhau, chống station collision):**
- **Trạm RITSU (giữa quầy, "pour station")**: gooseneck + V60 + carafe; sau lưng = kệ tách trắng; **espresso + grinder ở đầu ĐÔNG** lọt khung phải; cửa sổ Tây ở xa phía trái.
- **Trạm CÔ TRÀ (đầu TÂY, "tea station")**: **ấm trà sứ hoa + hũ trà + chổi khuấy + tách trà nhỏ**; sau lưng = kệ hũ trà + khăn plum; **CỬA SỔ Tây ngay cạnh cô** (bình hoa + đèn dome trên bệ); **TUYỆT ĐỐI KHÔNG espresso/grinder/V60 trong khung** (đó là đầu Đông).

**SCREEN-DIRECTION TABLE v2 (D-invariant — ĐẢO so với bản cũ vì Cô Trà giờ ở ĐÔNG):**
- **D1** (camera NAM nhìn BẮC): Tây = **TRÁI khung**, Đông = **PHẢI khung**.
  → Ritsu bay Tây (cửa sổ trái cạnh anh) · **Cô Trà ở ĐÔNG = phía PHẢI trục** · espresso/grinder giữa-Đông.
- **EYELINE PAIR (đảo, phải khớp nhau):** Ritsu nhìn Cô Trà = liếc **PHẢI** (đông) · Cô Trà nhìn Ritsu = liếc **TRÁI** (tây).
  ⚠️ R9 cũ `419007ce` cho Ritsu liếc TRÁI = **SAI theo plan mới** → re-gen liếc PHẢI.
- **D2-Tây**: khách trái, back bar phải, cửa sổ chính diện cuối lane, KHÔNG Cô Trà.
- **D2-Đông**: khách **phải**, back bar **trái**, Cô Trà cuối lane, KHÔNG cửa sổ.
- Cấm lật phía trên cùng 1 trục.

MASTER ANGLES / STATION PLATES:
- **Trạm RITSU (bay TÂY)** = R2 `a3d79c6f` (accepted canon).
- **Trạm CÔ TRÀ (đầu ĐÔNG)** = **`fa2f63c3-a3f3-4ffe-bcb0-139870829464`** — plate rỗng, sinh **text-only style-key + hình học suy từ plan** (KHÔNG ref plate trạm khác, theo luật v3.3). Verified PASS: không cửa sổ · tường Đông trơn đóng phải · hutch trà sau lưng · espresso/grinder mép TRÁI (đảo so R2 = bằng chứng đầu kia quầy).
- Overhead = R3v2 `d9f34ab1`.

**BỎ (station collision — Cô Trà bị đặt trong trạm Ritsu):** R7 `cb93f651` · R10b `16590cc0` · **R7v2 `af0cd691` + R10bv2 `f3816527` + plate Tây `813cea71`** (v3.2 sinh plate BẰNG plate Ritsu → thừa kế hình học, cửa sổ vẫn trái cùng cỡ = vẫn cùng chỗ, chỉ đổi props) · R6b v2 `630498af` (Cô Trà chính diện chắn cửa sổ + bịa cửa sáng góc TN) · R9 v1 `419007ce` + R9v2 `7596032d` (liếc TRÁI = sai plan mới).

**FIX v3.3 FINAL (hình học đúng, Stage C verified từng nhánh):**
| Shot | keyframe | clip | verify |
|---|---|---|---|
| R7 OTS Cô Trà gặp mắt khách (đầu ĐÔNG) | `d9616c58-9ec1-403a-aa0e-1fe4dcff84ad` | `772f958b-36d4-4cfb-9a69-326315de5447` | không cửa sổ · grinder TRÁI · tường Đông PHẢI |
| R9 Ritsu liếc **PHẢI** (đông→Cô Trà) | `3f756f46-675c-4663-932e-49e1206baf86` | `9eb434a3-324b-447e-801b-92eca0539892` | trạm Tây canon · con ngươi dồn phải |
| R10b Cô Trà gật, liếc **TRÁI** (tây→Ritsu) | `a256f41b-c30d-401f-beda-1cb6155fd68c` | `c735102b-b303-4e90-b93c-c2b1b3a4b03d` | không cửa sổ · cặp eyeline khớp R9 |
| R6b **D2-ĐÔNG** rise reveal | `7af46460-5db0-4a30-a78a-7fb939f59b31` | `a82ecfa6-3439-469f-b2d6-665635806088` | khách PHẢI · back bar TRÁI · Cô Trà cuối lane · không cửa sổ/cửa ma |
VERIFY LOG: R2/R3/R4/R5/R5b/R7/R8/R9/R10/R10b/R11 pass invariants (window Tây + kệ + trạm đúng). **FAIL cũ:** R1 `61248058` (I8: kính liền, I1: bố trí lệch) · R6b `53c1b5ef` (I3: Ritsu NGOÀI quầy; I5: Cô Trà sai trạm; I1/I6: cửa sổ bịa tường Đông) — regen cả 2.

## Bối cảnh — 🇯🇵 OSAKA (Ritsu sang Nhật học nghề pha)
Quán *kissaten* Osaka: quầy gỗ gọn gàng, chính xác; qua cửa sổ thấp thoáng kênh Dōtonbori / biển hiệu Osaka.
Đặc trưng Osaka cảm được: nhộn nhịp bên ngoài >< quầy Ritsu tĩnh-kỷ-luật bên trong (tương phản). Cô Trà = đồng nghiệp ở quán Osaka này.

## Locks
- **L1 màu**: Act1 cream/amber sạch, đều → Act2 (cao điểm) ám nóng gấp, hơi lệch → Act3 ấm ổn, giọt sáng. Accent: viền vàng.
- **L2 máy**: 50mm tĩnh; signature = CU tia rót; **cấm** handheld.
- **L3 sáng**: cửa sổ Osaka chếch trái (biển hiệu/kênh ngoài mờ hậu cảnh), 1:4 mềm; Act2 gắt hơn.
- **L4 bố cục**: center CU cho tia nước (Act1-2 khung khoá vào vòi/ly, cắt mặt Ritsu) → Act3 mở khung thấy CẢ mặt Ritsu + mắt khách.
- **L5 cảm xúc**: chính xác-lạnh (mắt cúi tia nước) → căng/sợ trễ (tay run) → hiện diện (ngẩng nhìn mắt khách).
- **Composition mode**: Atelier R1, R10; Templated còn lại.

## Phần 0 — Soul
```
Train Soul RITSU (soul_cast, ảnh thật barista) + Soul CÔ TRÀ (X.2.8 sheet). Sinh sạch prop anchor:
gooseneck kettle + V60 dripper trên carafe (job-id reuse mọi shot cầm đồ). Card paste verbatim.
```

## Ảnh làm sẵn (flux_2 / soul_cast)
| Ảnh | Model | Note | Nội dung |
|---|---|---|---|
| IMG-R1 kissaten Osaka EWS | flux_2 | no char, anchor L1 | quán kissaten Osaka buổi mở cửa, quầy pha gỗ gọn, cửa sổ trái thấp thoáng biển hiệu/kênh Osaka mờ, cream-amber |
| IMG-R2 Ritsu ở quầy WS | soul_cast+RITSU | wide → **mờ mặt** | Ritsu sau quầy, kettle+V60, tạp dề, mắt xuống |
| IMG-R3 Ritsu CU rót (mắt cúi) | soul_cast+RITSU | nét | CU Ritsu nghiêng nhìn tia nước, miệng khép |
| IMG-R4 Ritsu CU mắt NGẨNG | soul_cast+RITSU | cùng khung R3, mắt lên | CU Ritsu ngẩng nhìn thẳng (mắt khách), nét ấm dịu |
| IMG-R5 Cô Trà | soul_cast+CÔ TRÀ | | Cô Trà cạnh quầy, đưa tách trà, nhìn lên |

### ✅ Ảnh đã sinh (gpt_image_2, medium/1k, 2026-07-05) — job_id = start-frame video
| Ảnh | job_id | Ghi chú |
|---|---|---|
| IMG-R1 Osaka establishing (no people) | `61248058-3d04-418a-bd1b-35c920006707` | 16:9 |
| IMG-R2 Ritsu WS quầy Osaka | `a3d79c6f-6613-4b8c-a342-04dbf2c364c3` | ref ảnh Ritsu thật |
| IMG-R3 Ritsu CU mắt cúi (master) | `fc9b9a55-7f1c-4a75-b414-0b2619722ab9` | ref ảnh Ritsu thật |
| IMG-R4 Ritsu CU ngẩng (matchcut R10) | `a664871a-255f-4e98-a165-414eeb83b922` | ref IMG-R3 |
| IMG-R5 Cô Trà sheet | `11c76497-8d5c-45ef-b82f-6399b37f2250` | X.2.8 text |
| RL Osaka landmark (Dōtonbori) | `6d713c3a-7cad-4b8f-9f65-37103061d958` | ★ reuse phim tổng |
| PROP-R kettle + V60 + carafe | `81c8c232-0ac8-4544-9b7e-573c74d29191` | prop anchor, job-id reuse |
> Ảnh Ritsu thật (ref): `f3ca61e0-54d0-40c0-a6f4-64114b56906f`, `d46bd411-52a8-4f42-a265-3ecd52152489`.
> Model keyframe override: `gpt_image_2` (user chỉ định) — ref ảnh Ritsu thật giữ mặt (không Soul).

## 11 shot (video kling3_0). Neg: `drifting camera, face morphing, character drift, hand deformation, garbled text, watermark`

| Shot | Ảnh mở | Soul + Slot1 | Eyeline | ★9:16 | Prompt chuyển động (shot-type + endpoint) |
|---|---|---|---|---|---|
| R1 | IMG-R1 | — | — | ★ | `EWS. Osaka kissaten at opening; morning light spreads across the counter, Osaka signage soft-blurred through the window. Slow push-in. Steam rises. Holds.` |
| R2 | IMG-R2 (mặt mờ) | RITSU | mắt xuống-quầy | | `WS. Ritsu steps to the counter, sets the kettle and V60, ties the apron, then stills. Camera static.` |
| R3 | IMG-R3 | RITSU @image_1 | mắt dán tia nước (xuống) | ★ | `CU of the gooseneck stream pouring a precise spiral into the V60, eyes down on the stream. Ends on a full pour.` |
| R4 | chụp R3 | — (insert) | — | | `Insert: the coffee bed blooms and domes, steam curling. No camera move. Ends as the dome peaks.` |
| R5 | IMG-R3 | RITSU | mắt xuống, gật formal | | `MS. Ritsu sets the cup before guest 1 with a small formal nod, eyes still down. Camera static.` |
| R6 | IMG-R3 | RITSU (y hệt R5) | mắt xuống (giống hệt) | | `MS. Same exact pour and nod for guest 2, identical motion. Camera static. Ends on the nod.` |
| R7 | IMG-R5 | CÔ TRÀ | Cô Trà nhìn LÊN mắt khách | | `MCU. Beside him, Cô Trà pours tea and lifts her eyes to meet the guest, a warm half-smile. Camera holds.` |
| R8 | chụp R4/R3 | — (insert) | — | | `Insert: under rush, the pour stream wavers and misses the center, unstable. No move. Ends as it drifts off-center.` |
| R9 | IMG-R3 | RITSU | mắt liếc NGANG sang Cô Trà | | `CU. Ritsu's face tightens, he glances sideways toward Cô Trà, hesitates. Camera holds.` |
| R10 ⭐ | 2 ô: start IMG-R3 / end IMG-R4 | RITSU | mắt xuống → NGẨNG gặp mắt khách | ★ | `MATCHCUT: Ritsu slows, lifts his gaze from the stream to meet the guest's eyes, the pour staying steady. Camera holds.` |
| R11 | chụp R10 | RITSU two-shot | Ritsu↔khách gặp mắt | ★ | `MCU two-shot: the guest smiles back, Ritsu pours steady while holding the gaze. Slow push-in. Holds.` |

## Landmark beat 🇯🇵 Osaka (tuỳ chọn — để cảm nước Nhật; intercut sau R1)
FS7 pure-text-to-video, không nhân vật/Soul, ★9:16 (reuse hồi tưởng phim tổng). Model kling3_0.
```
RL (Osaka) ★: [STYLE] EWS. The Osaka Dōtonbori canal — an arched bridge over water, tall painted
signboards reflected below, lively crowd silhouettes, warm sepia ink-wash. Slow pan. No brand logos,
no neon glare. Ends on the reflection.
```

## Generation order
```
IMG-R1→R2→R3→R4→R5 → train Soul RITSU + CÔ TRÀ + prop
R1(anchor) → R2 → R3 → R4(cần R3) → R5 → R6 → R7 → R8(cần R3/R4) → R9 → R10(cần IMG-R3/R4) → R11(cần R10)
```
## Decision Log
```
{frame_source, "R8 rupture", [FS6 video-cont; FS3 insert], FS3, "Kuleshov — tay run khó, tách insert tia nước lệch + mặt căng R9"}
{frame_source, "R10 turn",   [minimal-motion; matchcut], matchcut, "cần khoá end mắt ngẩng gặp khách"}
{composition_mode, "R1/R10", [Templated; Atelier], Atelier, "hero"}
```
## Ghi chú
- R5+R6 CỐ Ý y hệt nhau = motif kỷ luật; đừng đổi động tác.
- R8 tách insert (không bắt model diễn tay run) — Kuleshov.
- Cô Trà chỉ xuất R7 (+ hậu cảnh R9): tương phản hành động, không thoại.
