# Mitsu — Bức tranh Google Business / Maps (profile + cover liền cảnh)

> Spec thiết kế · 2026-06-25 · phạm vi: **chỉ** bộ ảnh GBP/Maps. KHÔNG đụng 4 huy hiệu nhóm, mascot rời, icon UI (đã có).

## 1. Mục tiêu
Một **bức tranh minh hoạ duy nhất** cho Google Business Profile / Maps, xuất thành 2 file:
- **Cover 16:9** (1920×1080) — toàn cảnh quán Mitsu.
- **Profile 1:1** (≥720×720) — crop cận mặt cười của mascot hero (chính là "tấm selfie").

Hai ảnh **cùng một thế giới / cùng tông màu**, ghép lại đọc như một câu chuyện: *mascot vừa tự sướng trong quán*.

## 2. Cơ chế "một bức tranh" (quan trọng)
Google **không** đè profile lên cover ở vị trí cố định kiểu Facebook → KHÔNG dựa vào liền-mạch-pixel. Sự thống nhất đến từ:
- Profile = crop mặt hero trong chính cover (tấm selfie hero đang chụp).
- Cùng bảng màu, ánh sáng, nét vẽ.
→ Người xem thấy avatar tròn + cover sẽ tự nối thành một cảnh, bất kể Google đặt đâu.

## 3. Bố cục (đã chốt, trái → phải)
Tham chiếu blocking đã duyệt trong phiên brainstorm.

| # | Phần tử | Vị trí | Nhân vật (ref art có sẵn) |
|---|---------|--------|---------------------------|
| ① | **Hero — mascot selfie**, cười tươi, một tay giơ điện thoại **lệch sang bên** (không che mặt) | Tiền cảnh **góc dưới-trái**, to nhất | **Sō 創** joyful — `web/img/mitsu/char-so-joyful.webp` |
| ② | Mascot **ngạc nhiên** ló sau quầy bar (bị lọt hình) | Giữa, sau quầy | **Ritsu 律** surprised — `char-ritsu-surprised.webp` |
| ③ | Mascot **giơ ly trà sữa vẫy** chào | Phải | **Kin 勤** joyful + dáng cầm ly ref `char-so-bubbletea.webp` |
| — | **Biển gỗ treo** khắc "Mitsu 蜜" + **huy hiệu ong chúa** kế bên | Trên cao, giữa | Ong chúa **女王** proud — `char-queen-proud.webp` |
| — | **Máy pha cà phê + máy pha trà**, kệ hũ mật | Hậu cảnh sau quầy | — |
| ④ | **2 bé khách thú nhân hoá** dễ thương, quay sang cười | Tiền cảnh quầy (ghế bar) | thiết kế mới, phong cách đồng bộ |

**Tinh chỉnh đã chốt:**
1. Dùng đúng 4 nhân vật brand: Kin/Ritsu/Sō hoạt động, Ong chúa = huy hiệu biển (ăn khớp hệ 4 nhóm menu Kin勤/Ritsu律/Sō創/Kashi菓).
2. Điện thoại giữ lệch → profile crop ra mặt cười sạch.
3. **Chỉ 2** bé thú (giảm tải để cover nhỏ trên Maps vẫn rõ); 2 mascot phụ nhỏ hơn hero.
4. Không kỳ vọng Google ghép pixel — thống nhất bằng cảnh/tông.

## 4. Phong cách & màu
- **Không khí**: junkissa / kissaten Showa-retro, ấm, hoài cổ, hút Gen Z; đèn **hổ phách** ấm, chiều sâu nội thất.
- **Nét nhân vật**: đồng bộ tuyệt đối với bộ art hiện có (ong tròn mũm, ukiyo-e-lite) — reference các file `char-*` ở trên.
- **Bảng màu**: washi kem `#F1E5CB` · honey amber `#E5952B`/`#EF9F27` · charcoal `#393531` · seal đỏ `#B83A2E` · moss `#6E7A4F`. Gỗ quầy/biển nâu ấm.
- **Chữ trong ảnh**: tối thiểu — chỉ biển "Mitsu 蜜". Tránh chữ nhỏ (Maps thu nhỏ sẽ vỡ).

## 5. Ràng buộc / bẫy
- **Legibility thumbnail**: hero to, chủ thể rõ ở cỡ ~200px; tránh rối.
- **Safe margin**: chừa lề an toàn quanh cover (Maps crop khác nhau mobile/desktop) — không để chủ thể sát mép.
- **Vùng crop profile**: mặt hero nằm trọn trong một ô vuông crop được (1:1), không bị tay/điện thoại cắt ngang mặt.
- Không watermark, không khung viền, không chữ marketing.

## 6. Sản xuất (đã chốt: **chủ tự gen**)
1. **Claude** dùng `/prompt-master` viết **prompt GPT Image** chi tiết (EN), kèm: mô tả bố cục §3, style §4, danh sách reference 4 nhân vật + logo `web/img/mitsu/vector/mitsu-lockup.svg`, câu chặn (no text artifacts ngoài biển, no watermark), tỉ lệ **16:9** cho cover.
2. **Profile 1:1**: ưu tiên **crop thẳng từ cover** (mặt Sō ở góc dưới-trái) — đảm bảo cùng cảnh tuyệt đối. Chỉ gen riêng (prompt phụ "mặt Sō cười cận cảnh, cùng style") nếu mặt hero trong cover không đủ phân giải/độ rõ khi crop ≥720.
3. **Chủ** gen trên tài khoản (GPT Image / công cụ chủ dùng), lưu ra `~/Downloads/`.
4. **Claude** hậu kỳ: crop/căn profile 1:1 (≥720), kiểm tra cover 1920×1080, nén (cwebp/jpg ≤ ~300KB cover), đặt file:
   - master → `brand-assets/social/` (gitignored)
   - bản dùng → `web/img/brand/gbp-cover.jpg` + `web/img/brand/gbp-profile.png`
5. Chủ upload lên Google Business Profile.

## 7. Deliverables
- `brand-assets/social/gbp-cover-master.png`, `gbp-profile-master.png` (gốc gen)
- `web/img/brand/gbp-cover-1920x1080.jpg`, `web/img/brand/gbp-profile-720.png`
- Prompt GPT Image lưu trong plan/handoff để chủ tái dùng / chỉnh seed.

## 8. Ngoài phạm vi
4 huy hiệu nhóm menu · mascot rời/sticker · icon UI (hex/giọt mật/tem) · favicon.ico/maskable · logo vuông tĩnh khác — đều **đã có** hoặc track riêng.
