# Kế Hoạch Thực Thi — Digital Products Multi-Agent F&B
# v1.3 · 2026-07-08 · chủ sở hữu: DPD
# (v1.0→v1.1: verify hệ thật + gap analysis "khách cần, Mitsu không cần" → pivot positioning sản phẩm B)
# (v1.1→v1.2: thêm SẢN PHẨM C — Radar Đối Thủ + Intel Membership, kèm gap analysis GC "khách cần, mình CHƯA có" từ research 2026-07-08. C ở trạng thái DRAFT, chỉ kích hoạt sau Gate A)
# (v1.2→v1.3: thêm SẢN PHẨM D — Két Sắt AI (Financial Intelligence), gap analysis GF1–GF6 research 2026-07-08 chiều. D cũng DRAFT sau Gate A. C và D KHÔNG build song song — khảo sát C0/D0 gộp chung quyết định cái nào trước, xem "LỊCH C/D — XỬ LÝ XUNG ĐỘT")

> Nguồn phân tích thị trường: session 2026-07-07 (memory `project_digital_products.md`).
> File này = plan thực thi task-level. Cập nhật status trực tiếp vào checkbox.

---

## VERIFY HỆ THẬT (kiểm 2026-07-07)

| Lỗi nghi vấn | Kết quả kiểm | Trạng thái |
|---|---|---|
| GAS /exec trả 403 anonymous (memory 2026-07-02) | `curl ?action=ping` → `{"ok":true,"version":"1.2"}`; `?action=menu` → 27 items | ✅ ĐÃ HẾT — order online sống |
| GAP location_id: report chưa lọc | `Branches.gs`: rollup ĐÃ lọc theo location (dòng 33, phòng sheet dùng chung). Dashboard/Financials/Insight/RFM không lọc — nhưng thiết kế 1-sheet/CN nên mỗi sheet = 1 location, số không sai | 🟡 Vá ở tầng kiến trúc. Chỉ thành bug nếu khách dồn nhiều CN vào 1 sheet → docs sản phẩm B PHẢI ghi rõ ràng buộc "1 sheet = 1 điểm bán" |
| PR tồn đọng | #1 (CF Workers config), #2 (web hardening), #3 (payment watchdog) vẫn OPEN từ tháng 6 | 🟡 #3 payment watchdog nên merge trước khi làm sản phẩm B — module này khách rất cần |

→ P0.1 (fix 403) coi như XONG. Không còn blocker kỹ thuật cho Phase 0.

---

## GAP ANALYSIS — KHÁCH CẦN, MITSU KHÔNG CẦN (research 2026-07-07)

Mitsu = quán 1 điểm, chủ technical, chưa vướng chuẩn thuế mới, tự build từ zero. Khách điển hình KHÁC ở 5 điểm, mỗi điểm = quyết định sản phẩm:

### G1 🔴 Hóa đơn điện tử máy tính tiền (NĐ 70/2025) — thay đổi positioning B
- Từ 01/06/2025: F&B doanh thu ≥1 tỷ/năm BẮT BUỘC hóa đơn điện tử khởi tạo từ máy tính tiền, truyền dữ liệu thuế real-time. 2026: xóa thuế khoán → hộ kinh doanh kê khai theo doanh thu thật ([xaydungchinhsach.chinhphu.vn](https://xaydungchinhsach.chinhphu.vn/mot-so-noi-dung-moi-cua-nghi-dinh-so-70-2025-nd-cp-ve-hoa-don-chung-tu-119250403074719995.htm), [pos365](https://www.pos365.vn/nghi-dinh-so-702025nd-cp-8561.html)).
- GAS/Sheets KHÔNG THỂ và KHÔNG NÊN làm máy tính tiền hợp pháp.
- **Quyết định:** B KHÔNG bán như "thay POS". Bán như **lớp kênh-riêng + AI nằm TRÊN POS hợp pháp**. Docs có chương "NĐ70 — hệ này đứng đâu": POS lo hóa đơn/thuế, hệ này lo đơn online kênh riêng + marketing + insight. Né hẳn rủi ro pháp lý + né đối đầu KiotViet.

### G2 🔴 Khách ĐÃ có POS (KiotViet 300k+ quán, 200–290k/th; CukCuk 199–499k; Sapo 249–899k)
- Họ sẽ không bỏ POS đang chạy. Bắt chuyển hệ = mất 80% thị trường.
- **Quyết định:** xây module **POS Import** (MỚI — Mitsu không cần): parse file export CSV/Excel của KiotViet/Sapo/CukCuk → đổ vào ORDERS/MENU/CUSTOMERS. Mở khóa Pack A cho khách giữ nguyên POS: "xuất file cuối tuần → AI đọc → insight". Đây thành **cầu nối bán Pack A rộng nhất**.

### G3 🟡 Telegram → chủ quán VN dùng Zalo
- Alert chủ quán qua Telegram = rào cản tâm lý (app lạ).
- **Quyết định:** giữ Telegram làm mặc định kỹ thuật (API free, dễ), nhưng: (a) docs cài Telegram 5 phút kèm video, (b) option alert qua Zalo cá nhân (hướng dẫn semi-manual) — không phụ thuộc Zalo OA trả phí. Zalo OA (gói Tiêu chuẩn ~1tr/năm cho auto-reply, [bảng giá 2026](https://miniai.vn/bang-gia-zalo-oa-moi-nhat-2026/)) = chương "nâng cao", không phải requirement.

### G4 🟡 Máy in tem + print server — khách không có Mac always-on
- Flask print server trên Mac = setup Mitsu-specific, không nhân bản được.
- **Quyết định:** B v1 ship **no-printer mode** mặc định: CONFIRMED → hiện KDS tab + đơn lên màn hình, tem = tùy chọn. Chương in tem riêng cho quán chịu đầu tư (kèm bill máy in ~1.5–2tr, bê từ `docs/system/labels-print.md`). KHÔNG để máy in thành điều kiện dùng hệ.

### G5 🟢 Đau chiết khấu app giao đồ ăn = góc bán hàng chủ lực cho B
- GrabFood 25–30% + VAT, ShopeeFood 25%, cộng 10–20% doanh thu đốt vào quảng cáo in-app ([Tuổi Trẻ](https://tuoitre.vn/chu-tiem-keu-kinh-doanh-tren-grabfood-befood-shopee-food-ton-10-20-doanh-thu-cho-quang-cao-20240617001143418.htm), [Sapo](https://www.sapo.vn/blog/phi-ban-hang-tren-grabfood)).
- **Quyết định:** headline sản phẩm B đổi thành góc "kênh đặt hàng CỦA BẠN — 0% chiết khấu": *"Mỗi đơn qua app mất 25–30%. Hệ này cho quán kênh đặt riêng qua QR + link, chạy trên Google miễn phí."* Đơn giá B 5.99tr = ~1 tháng chiết khấu app của quán cỡ vừa → ROI dễ nói.

### Ngoài phạm vi v1 (ghi nhận, không làm)
- Chấm công / lương nhân viên → POS làm rồi, không đụng.
- Tích hợp API trực tiếp KiotViet/Grab → sau, khi có >20 khách B yêu cầu.
- Kế toán thuế → giới thiệu đối tác, không làm.

---

## TỔNG QUAN

| | Sản phẩm A | Sản phẩm B |
|---|---|---|
| Tên | **Trợ Lý Quán AI** (Skill Pack) | **Quán Tự Chạy OS** (Kissaten sanitized) |
| Giá | 990k early → 1.500k | 3.990k early → 5.990k |
| Ship | Tuần 3 (28/07/2026) | Tuần 8 (01/09/2026) |
| Mục tiêu 90 ngày | 30 đơn ≈ 40tr | 8 đơn ≈ 38tr |
| Vai trò | Entry, volume, list building | Flagship, margin, moat |

Ladder: Pack 1.5tr → OS 6tr → Done-With-You +3.5tr → (Q4) community 200k/tháng.

**Nguyên tắc:**
- Bán outcome ("quán tự chạy", "content 30 ngày trong 1 giờ"), KHÔNG bán từ "multi-agent".
- Mọi proof quay tại Mitsu thật: tem in, Telegram alert, dashboard.
- Local AI Mac Mini = content hook + chương nâng cao, không phải requirement.
- Support = nhóm Zalo chung + FAQ. Không 1-1 free.

---

## PHASE 0 — TUẦN NÀY (07–13/07)

- [x] **P0.1** ~~Fix GAS /exec 403~~ — verify 2026-07-07: đã hết, API sống (xem VERIFY HỆ THẬT).
- [ ] **P0.1b** Merge PR #3 payment watchdog — module khách cần, để lâu drift với main.
- [ ] **P0.2** Nhắn 2–3 chủ quán quen (Lâm Hà/Đà Lạt) mời beta Pack A: free đổi feedback + testimonial + quyền quay quán họ.
- [ ] **P0.3** Chốt tên thương mại + domain/subdomain (đề xuất: `kit.mitsu.cafe` — tận dụng trust + CF Workers sẵn).
- [ ] **P0.4** Mở tab Sheets `SALES_LOG` (đơn hàng digital product) + `LEADS` (email/Zalo người quan tâm) — dogfood chính hệ của mình.
- [ ] **P0.5** Đăng bài Threads/FB đầu tiên: "Tôi vận hành quán bằng AI agents, sắp đóng gói bán" — đo phản ứng, gom lead trước khi build xong (validate demand, tránh build chay).

**Gate Phase 0:** ≥15 người để lại contact quan tâm → tiếp tục. <5 → dừng, khảo sát lại pain/giá trước khi build.

---

## SẢN PHẨM A — TRỢ LÝ QUÁN AI

### A1. Nội dung: 12 skill (map từ skill Mitsu đang chạy)

| # | Skill bán | Nguồn (skill hiện có) | Việc phải làm |
|---|-----------|----------------------|---------------|
| 1 | Brief sáng | `/sang` | Gỡ KPI Mitsu, tham số hóa checklist mở quán |
| 2 | Draft post đa kênh | `/post` | Tách brand-voice thành slot người dùng tự điền |
| 3 | Thiết kế campaign/flash sale | `/promo` | Gỡ PROMOTIONS schema Mitsu → schema generic |
| 4 | Đo ROI marketing | `/roi` | Gỡ MARKETING_LOG cứng, hướng dẫn tự log |
| 5 | RFM + winback khách | `/khach` | Generic hóa nguồn CUSTOMERS |
| 6 | Menu engineering | `/menu-eng` | Giữ nguyên logic Stars/Plowhorses/Puzzles/Dogs |
| 7 | Quét đối thủ | `/doi-thu` | Bỏ hardcode Lâm Hà → hỏi địa bàn |
| 8 | Trend scout | `/trend` | Giữ, thêm filter theo loại quán |
| 9 | Phản hồi review | `/review` | Tách brand voice slot |
| 10 | Log hao hụt | `/huy` | Kèm tab WASTE_LOG template |
| 11 | Chốt ca / đối soát két | `/chot-ca` | Kèm tab CASH_LOG template |
| 12 | Tổng kết tuần | `/tuan` | Gỡ số Mitsu |
| 0 | **Onboarding wizard** (skill số 0, viết MỚI) | — | Hỏi 10 câu (loại quán, menu, giá, 3 post cũ, đối tượng khách) → tự sinh file BRAND_MEMORY + điền Sheets template. **Nhận cả file export KiotViet/Sapo/CukCuk** để tự điền MENU + CUSTOMERS (gap G2) |
| 13 | **POS Import** (viết MỚI — gap G2) | — | Skill đọc file export tuần của POS → chuẩn hóa vào ORDERS/MENU/CUSTOMERS → các skill 1–12 chạy trên data đó. Khách giữ nguyên POS, không phải chuyển hệ |

Bonus module (điểm khác biệt, ghi rõ "nâng cao"): chuỗi `/winback-loop` + `/trend-loop` — quy trình nối nhiều skill = câu chuyện "multi-agent" thật để marketing.

### A2. Cấu trúc gói giao khách

```
tro-ly-quan-ai/
├── 00-BAT-DAU-TAI-DAY.pdf        (quickstart 1 trang, có QR video)
├── skills/                        (13 file .md — mỗi skill 1 file)
├── setup/
│   ├── claude-projects.md        (cách nạp vào Claude Project)
│   ├── chatgpt-gpts.md           (cách nạp vào Custom GPT)
│   └── gemini-gems.md
├── sheets-template/              (link copy Google Sheets: MENU, CUSTOMERS,
│                                  MARKETING_LOG, WASTE_LOG, CASH_LOG)
├── videos/                       (link 6 video, mỗi video ≤7')
└── nhom-zalo.md                  (link nhóm hỗ trợ)
```

Format skill file chuẩn: `ROLE / INPUT cần / OUTPUT format / VÍ DỤ 1 lần chạy thật (đã ẩn danh từ Mitsu)`. Ví dụ thật = thứ prompt pack Etsy $10 không có.

### A3. Task tuần 1 (14–20/07)

- [ ] A3.1 Tạo repo/thư mục riêng `products/tro-ly-quan-ai/` (KHÔNG trộn vào codebase quán).
- [ ] A3.2 Viết onboarding wizard (skill 0) — làm ĐẦU TIÊN, vì 12 skill kia đều đọc BRAND_MEMORY nó sinh ra. Định nghĩa schema BRAND_MEMORY trước.
- [ ] A3.3 Convert skill 1–6 (nhóm doanh thu — giá trị cao nhất). Mỗi skill: gỡ data Mitsu → thêm slot BRAND_MEMORY → chạy thử với data quán giả "Cà phê Ban Mai" → so output với bản Mitsu gốc.
- [ ] A3.4 Làm Sheets template 5 tab + data mẫu 30 ngày của quán giả.

### A4. Task tuần 2 (21–27/07)

- [ ] A4.1 Convert skill 7–12.
- [ ] A4.2 **Beta test**: đưa 2 chủ quán ở P0.2 dùng. Quan sát họ setup — chỗ nào kẹt >5 phút = phải sửa docs/wizard. Mục tiêu: setup xong ≤30 phút không cần mình.
- [ ] A4.3 Quay 6 video (điện thoại + quay màn hình, không cần đẹp): ① cài đặt 15' ② brief sáng ③ post + promo ④ ROI + menu-eng ⑤ khách + winback ⑥ chốt ca + hao hụt.
- [ ] A4.4 Landing page 1 trang trên CF Workers stack sẵn có: hero (video demo tại Mitsu) → pain 3 gạch → gói gì bên trong → giá + VietQR → FAQ → testimonial beta. Thanh toán: VietQR + xác nhận thủ công qua Zalo (MVP, tự động hóa sau khi >5 đơn/ngày).

### A5. Launch tuần 3 (28/07–03/08)

- [ ] A5.1 Early-bird 990k, giới hạn 20 suất, đếm ngược công khai.
- [ ] A5.2 Lịch content launch: T2 story "tại sao tôi đóng gói" → T3 demo video 1 → T4 testimonial beta → T5 mở bán → T6-CN daily proof (screenshot đơn, output skill khách chạy).
- [ ] A5.3 Sau 20 suất → giá 1.500k. Mỗi khách mua → mời vào nhóm Zalo → xin 1 screenshot kết quả tuần đầu (fuel content).

**Gate A:** 10 đơn trong 14 ngày đầu → build tiếp B full-speed. <5 đơn → phỏng vấn người không mua, sửa offer trước khi đổ 6 tuần vào B.

---

## SẢN PHẨM B — QUÁN TỰ CHẠY OS

### B1. Phạm vi kỹ thuật + positioning (đã pivot theo gap analysis)

**Positioning:** KHÔNG phải POS, KHÔNG thay máy tính tiền (G1). B = "kênh đặt riêng 0% chiết khấu + lớp AI" chạy SONG SONG POS hợp pháp. Headline: *"Mỗi đơn qua app mất 25–30%. Đây là kênh đặt CỦA BẠN, chạy trên Google miễn phí."* (G5)

Giữ (sanitize từ Kissaten): GAS event bus (`doPost` → validate → route), 7 tab Sheets, status flow NEW→…→DELIVERED, Telegram alert, Zalo notify + stamp loyalty, KDS tab, web order template (mitsu.html generic hóa), bill PDF.

**Thêm MỚI theo gap (Mitsu không cần, khách cần):**
- No-printer mode mặc định — CONFIRMED → KDS, tem = tùy chọn module riêng (G4).
- POS Import module (chung code với Pack A skill 13) (G2).
- Option alert Zalo cá nhân bên cạnh Telegram (G3).
- Docs chương "NĐ 70/2025 — hệ này đứng đâu so với máy tính tiền" (G1).
- Ràng buộc ghi rõ: 1 sheet = 1 điểm bán (report không lọc location — xem VERIFY).

Cắt khỏi v1 (để v2/upsell): campaign engine phức tạp, multi-branch rollup, Vertex content factory, taste-clipper, in tem Xprinter (thành add-on module), tích hợp API trực tiếp KiotViet/Grab.

### B2. Sanitize checklist (tuần 3–4, chạy song song launch A)

- [ ] B2.1 Repo template mới `quan-tu-chay-os` — copy có chọn lọc, KHÔNG fork (tránh lộ git history Mitsu).
- [ ] B2.2 Quét secret: grep toàn bộ token/chat_id/OA id/URL deploy/SĐT/domain → tất cả phải đọc từ CONFIG sheet (vốn là luật sẵn — audit lại lần cuối).
- [ ] B2.3 Gỡ brand: mitsu/kaeru/蜜/Lâm Hà trong code, comment, docs, HTML.
- [ ] B2.4 **Vá GAP location_id trong report** (memory `project_multibranch_scale`) — bản bán cho người khác phải sạch hơn bản mình dùng.
- [ ] B2.5 Web order template: thay asset Mitsu bằng placeholder + 3 theme màu.
- [ ] B2.6 Data mẫu: MENU 20 SKU quán giả, 50 đơn mẫu, 30 khách mẫu — mở lên thấy hệ "sống" ngay.

### B3. Installer + docs (tuần 5–6) — 80% công sức, sản phẩm sống chết ở đây

- [ ] B3.1 `Setup.gs`: 1 hàm `setupAll()` — tạo 7 tab + header + CONFIG khung + trigger. Người dùng: copy Sheets template → mở Apps Script → dán code → chạy 1 hàm → điền CONFIG → deploy web app. Mục tiêu ≤60 phút.
- [ ] B3.2 CONFIG validator: hàm `checkSetup()` báo tiếng Việt từng key thiếu/sai (token Telegram sai, chưa deploy web app...).
- [ ] B3.3 Docs tiếng Việt: `01-cai-dat` (60'), `02-nhan-don` (mặc định KDS, không cần máy in), `03-in-tem` (module TÙY CHỌN, kèm mua máy nào, giá — bê từ `docs/system/labels-print.md`), `04-alert` (Telegram 5' + option Zalo cá nhân), `05-zalo-loyalty` (ghi rõ tier: không OA vẫn chạy / OA Tiêu chuẩn 1tr/năm mở auto), `06-tuy-bien-menu-web`, `07-pos-import` (KiotViet/Sapo/CukCuk), `08-nd70-va-may-tinh-tien` (hệ này KHÔNG thay hóa đơn điện tử), `09-xu-ly-loi` (bê từ offline-failover, đổi ngôi).
- [ ] B3.4 Video: ① cài A-Z 1 lần thật không cắt ② một đơn chạy xuyên hệ (đặt web → Telegram → in tem → Zalo → bill) — video ② = video bán hàng chủ lực.
- [ ] B3.5 Tích hợp Pack A: mục "nối Trợ Lý Quán AI vào data OS" — closed loop, không đối thủ nào có.
- [ ] B3.6 Build no-printer mode: flag CONFIG `PRINT_ENABLED=false` mặc định → CONFIRMED chỉ đẩy KDS, bỏ qua printOrderLabels (giữ luật "in khi CONFIRMED" cho quán bật in).
- [ ] B3.7 Build POS Import: script parse export KiotViet/Sapo/CukCuk (xin file mẫu thật từ 2 quán beta — họ đang dùng POS nào thì support format đó TRƯỚC) → map vào ORDERS/MENU/CUSTOMERS.
- [ ] B3.8 Alert Zalo cá nhân: SOP semi-manual (không phụ thuộc OA trả phí) làm option cạnh Telegram.

### B4. Pilot + launch (tuần 7–8)

- [ ] B4.1 Pilot 2 quán trả 50% (≈2tr) đổi case study + được mình setup cùng (chính là prototype gói Done-With-You).
- [ ] B4.2 Đo thời gian setup thật của pilot → sửa docs cho đến khi ≤60'.
- [ ] B4.3 Launch: early 3.990k (10 suất) → 5.990k. Bundle A+B = 6.990k. DWY +3.500k.
- [ ] B4.4 Ưu tiên bán cho người đã mua A (warm list nhóm Zalo).

---

## MARKETING — 8 TUẦN

Kênh: TikTok/Reels (chủ lực) · FB groups chủ quán F&B · Threads build-in-public · nhóm Zalo (own list).

| Tuần | Content chủ đạo |
|------|-----------------|
| 0–1 | "Quán tôi ở Đà Lạt tự chạy bằng AI" — quay tem in, Telegram kêu, dashboard. 3 clip. Gom lead P0.5 |
| 2 | Behind-the-scenes đóng gói + beta tester dùng thử. 3 clip |
| 3 | **Launch A** — lịch A5.2 |
| 4–5 | Kết quả khách A (screenshot, quote) + teaser OS: "1 đơn chạy từ QR đến tem in" |
| 6–7 | Series "quán không cần thu ngân trực page": mỗi module OS 1 clip |
| 8 | **Launch B** + case study pilot |

Quy tắc content: mỗi clip = 1 outcome đo được ("30 ngày content trong 1 giờ", "biết món nào lỗ trong 5 phút"). Không dạy lý thuyết AI — đối thủ khóa học làm rồi, mình là chủ quán không phải giảng viên. Local AI Mac Mini: 1–2 clip halo "quán tôi chạy AI không cần internet" cho viral/press, gắn CTA về Pack A.

## GIÁ & DOANH THU 90 NGÀY

| Kịch bản | Pack A | OS B | DWY | Tổng |
|----------|--------|------|-----|------|
| Thấp | 15 × 1.3tr = 19.5tr | 4 × 5tr = 20tr | 1 × 3.5tr | ~43tr |
| Mục tiêu | 30 × 1.35tr = 40tr | 8 × 4.8tr = 38tr | 3 × 3.5tr = 10.5tr | ~89tr |

## RỦI RO

| Rủi ro | Đối phó |
|--------|---------|
| Support nuốt thời gian vận hành quán | Nhóm Zalo chung, FAQ, khung giờ trả lời 21–22h. DWY mới được 1-1 |
| Copy lậu | Chấp nhận. Moat = update + community + proof quán thật |
| GAS/Sheets đổi chính sách | Rủi ro thấp; docs failover đã có |
| Khách kỳ vọng "AI làm hết" | Trang "sản phẩm KHÔNG làm gì" ngay trên landing — lọc trước khi mua |
| Khách tưởng B = máy tính tiền → dính NĐ 70/2025 | Landing + docs nói thẳng: KHÔNG thay POS/hóa đơn điện tử, chạy song song. Không nói mập mờ để bán được hàng |
| KiotViet/Sapo ra tính năng AI tương tự | Họ làm generic cho 300k khách; mình làm sâu F&B nhỏ + brand voice + community. Theo dõi mỗi quý |
| Xung đột thời gian vận hành Mitsu | Mỗi tuần chỉ 2 khối việc product (checkbox trên); trễ thì dời gate, không bỏ gate |

## GATES — ĐIỀU KIỆN DỪNG/TIẾP

1. **Sau P0 (13/07):** <5 lead quan tâm → dừng build, khảo sát lại.
2. **Sau launch A +14 ngày:** <5 đơn → không build B vội, sửa offer A.
3. **Sau launch B +30 ngày:** <3 đơn → chuyển trọng tâm sang DWY/service (giá cao, ít khách, đỡ tốn docs).

---

# SẢN PHẨM C — RADAR ĐỐI THỦ AI + INTEL MEMBERSHIP (DRAFT · 2026-07-08)

> Trạng thái: **DRAFT — không kích hoạt trước Gate A** (launch A +14 ngày, ≥10 đơn).
> Nguồn: session research 2026-07-08. Định vị: pack CI (competitive intelligence) 1,5tr cho
> solopreneur/SME + membership báo cáo intel 249k/tháng. Ladder: C1 1,5tr → C7 OS 3,9tr → C2 membership.
> ~60% nội dung C1 generic hóa từ `/doi-thu` + `/trend` + cafe-insight. Phần đó KHÔNG liệt kê lại ở đây —
> mục này chỉ ghi **cái thị trường cần mà mình CHƯA có** (gap analysis GC, cùng logic mục G của sản phẩm B).

## GAP ANALYSIS GC — KHÁCH CẦN, MÌNH CHƯA CÓ (research 2026-07-08)

Stack Mitsu = nghiên cứu secondary trên web công khai cho 1 quán F&B địa phương. Khách trả tiền cho CI ở VN
phần lớn KHÔNG giống vậy: họ bán online trên sàn, chạy ads, sắp bỏ vốn mở điểm bán, hoặc cần nghe khách hàng
của chính họ. 6 gap, mỗi gap = quyết định sản phẩm:

### GC1 🔴 Data sàn TMĐT (Shopee/TikTok Shop) — mảng khách đông nhất, stack hiện tại = 0
- Seller online VN đông hơn chủ quán F&B nhiều lần; họ ĐÃ quen trả subscription cho data tool:
  Kalodata 549k/th (mua chung 199k/th) cho TikTok Shop ([hoangtutech](https://hoangtutech.com/kalodata-1-thang-phan-tich-du-lieu-va-insight-tiktok-tot-nhat/), so sánh với FastMoss trên [tinhte](https://tinhte.vn/thread/danh-gia-tool-phan-tich-thi-truong-tiktok-shop-bang-kalodata-va-fastmoss.4071845/));
  Lupi/Shopee Analytics cho Shopee; Metric.vn báo giá custom hướng doanh nghiệp ([metric.vn](https://metric.vn/insights/)).
- Mức 199–549k/th này = **bằng chứng giá** cho C2 membership 249k/th: đúng vùng chi trả đã được thị trường xác nhận.
- **Quyết định:** KHÔNG tự cào sàn (ToS + chống bot + công sức = hố đen). C1 thêm module **Data-Input Adapter**:
  khách export/screenshot từ Kalodata-FastMoss-Lupi bản free/rẻ → agent đọc + phân tích + đối chiếu tuần trước
  (INTEL_LOG). Định vị: *"tool data 200k cho anh số liệu; Radar cho anh biết phải LÀM gì với số liệu đó."*
  Mình bán tầng synthesis, không cạnh tranh tầng data.

### GC2 🔴 Ad-spy / Meta Ad Library — nguồn free mạnh nhất chưa nằm trong stack
- Nghiên cứu quảng cáo đối thủ = nhu cầu CI phổ biến nhất của SME chạy ads. Meta Ad Library free, không cần
  đăng nhập, xem được toàn bộ ads đang chạy của bất kỳ fanpage nào ([kmedia](https://kmedia.vn/cong-cu-nghien-cuu-doi-thu-facebook-2026/), [muabantool](https://muabantool.com/spy-ads-facebook/)); tool trả phí (BigSpy, Minea, AdSpy) yếu data VN.
- `/doi-thu` hiện tại không đọc ads. Skill MỚI hoàn toàn.
- **Quyết định:** viết skill **Ad-Angle Analyst**: input = link Ad Library đối thủ (hoặc paste nội dung ads)
  → phân loại angle/hook/offer, đếm ads chạy lâu (= ads lãi), đề xuất angle chưa ai dùng. Chi phí build thấp,
  giá trị cảm nhận cao — ứng viên demo clip launch.

### GC3 🟡 Social listening bình dân — enterprise 4 ông lớn, SME trống hoàn toàn
- YouNet Media/Buzzmetrics thống trị social listening VN, giá không public, khách 500+ công ty lớn
  ([younetgroup](https://www.younetgroup.com/social-listening/), [sefamedia](https://sefamedia.vn/4-ong-lon-ve-social-listening-tai-viet-nam/)). SME không mua nổi → khoảng trống thật.
- Rào kỹ thuật: FB API đóng với group/comment; KHÔNG hứa "tự động nghe MXH" — sẽ thất hứa.
- **Quyết định:** module **Social Pulse semi-manual**: SOP khách gom input (screenshot comment, export post
  fanpage mình + đối thủ, top post group ngành) theo checklist 15'/tuần → agent phân sentiment, gom insight,
  so tuần trước. Bán đúng kỳ vọng: "quy trình nghe thị trường 15 phút/tuần", không phải "AI tự nghe 24/7".

### GC4 🟡 Location intelligence — người sắp MỞ điểm bán cần nhất, chưa có module nào
- Nhu cầu chuẩn trước khi mở quán: đếm lưu lượng 2h/quán/ngày × 3 ngày, khảo sát đối thủ bán kính 500m–2km,
  nhân khẩu + thu nhập khu vực ([italio](https://italio.vn/chon-mat-bang-kinh-doanh-cafe-hieu-qua/), [Tomorrow Marketers](https://blog.tomorrowmarketers.org/khoi-nghiep-kinh-doanh-cafe/)).
- Google Popular Times không có trong official Places API; bên thứ ba (Outscraper, BestTime) trả phí USD
  ([outscraper](https://outscraper.com/places-api-popular-times/), [besttime.app](https://besttime.app/)) — không nhét vào pack 1,5tr được.
- **Quyết định:** module **Khảo Sát Mặt Bằng 7 Ngày**: form thu data field thủ công (đếm khách, giá đối thủ,
  giờ cao điểm — chính SOP đã dùng khi chọn mặt bằng Mitsu Lâm Hà) + agent tổng hợp thành báo cáo GO/NO-GO
  kèm dự phóng doanh thu. Đây là chương "kinh nghiệm thật" không đối thủ prompt-pack nào giả được.
  Gắn vào Validation Sprint (C5 thu nhỏ trong C1).

### GC5 🟡 Primary research (khảo sát khách hàng) — agent hiện chỉ làm secondary
- Thuê agency (Q&Me, khaosat.me...) = hàng chục triệu/dự án, SME không với tới ([bizfly](https://bizfly.vn/techblog/chi-phi-nghien-cuu-thi-truong.html), [qandme](https://qandme.net/en)).
- **Quyết định:** module **Survey Designer**: agent sinh bảng hỏi theo mục tiêu nghiên cứu → khách chạy
  Google Forms (free, đổ thẳng Sheets) → agent phân tích kết quả + cross-tab cơ bản. Đóng vòng
  primary + secondary trong 1 pack — điểm khác biệt so với mọi prompt pack chỉ biết Google.

### GC6 🟢 Bằng chứng demand ngoài F&B — chưa có, phải mua bằng khảo sát trước khi build
- Toàn bộ proof hiện tại là F&B Lâm Hà. C1 nhắm rộng hơn (seller online, spa, shop) — chưa validate.
- **Quyết định:** trước khi build C1, khảo sát chính list lead P0.5 + khách Pack A: "anh/chị mất bao nhiêu
  giờ/tháng ngó đối thủ? sẵn trả bao nhiêu để việc đó tự động 80%?" ≥15 câu trả lời + ≥50% nói >2h/tháng
  → build. Không đạt → C1 thu hẹp thành add-on F&B của Pack A, bỏ tham vọng cross-ngành.

### Ngoài phạm vi C v1 (ghi nhận, không làm)
- Tự cào Shopee/TikTok/FB quy mô lớn — ToS + chống bot, rủi ro > lợi.
- Social listening tự động 24/7 — đất của YouNet, không đấu.
- Mua data foot-traffic API (Outscraper/BestTime) hộ khách — chi phí USD tái diễn, phá cấu trúc giá pack.
- Báo cáo tùy chỉnh theo yêu cầu từng khách — đó là dịch vụ agency, chỉ làm ở tier DWY.

## C-MODULES PHẢI BUILD MỚI (không generic hóa được từ stack sẵn)

| # | Module | Gap | Ước lượng |
|---|--------|-----|-----------|
| M1 | Data-Input Adapter (Kalodata/FastMoss/Lupi export → INTEL_LOG) | GC1 | 2–3 ngày, xin file export mẫu từ 2 seller quen |
| M2 | Ad-Angle Analyst (Meta Ad Library) | GC2 | 1–2 ngày, thuần prompt engineering |
| M3 | Social Pulse semi-manual (SOP 15'/tuần + agent phân tích) | GC3 | 2 ngày SOP + 1 ngày skill |
| M4 | Khảo Sát Mặt Bằng 7 Ngày (form field + báo cáo GO/NO-GO) | GC4 | 2 ngày — chép SOP Mitsu đã dùng thật |
| M5 | Survey Designer (bảng hỏi + phân tích Google Forms/Sheets) | GC5 | 2 ngày |
| M6 | Verifier + confidence tag (`[XÁC NHẬN 2 NGUỒN]`/`[1 NGUỒN]`/`[SUY LUẬN]`) | chống bịa — bảo hiểm brand | 2 ngày + golden set 10 câu Lâm Hà đã biết đáp án |

## LỊCH C (chỉ chạy sau Gate A đạt)

- [ ] **C0** (tuần 4, sau launch A): khảo sát demand GC6 + 2 post "tôi theo dõi đối thủ ở Lâm Hà bằng AI" đo phản ứng. **Gate C0: <10 lead hoặc khảo sát fail → C1 thành add-on Pack A, dừng plan C độc lập.**
- [ ] **C1-build** (tuần 5–6): generic hóa `/doi-thu`+`/trend` + build M1–M6. Chạy thử trên 1 ngành KHÔNG phải F&B (chọn theo nghề của lead khảo sát).
- [ ] **C1-beta** (tuần 7): 3 beta tester (ưu tiên khách Pack A), landing clone template A, 5 video.
- [ ] **C1-launch** (tuần 8): early 1.190k × 20 → 1.490k.
- [ ] **C2** (tuần 9–10): chạy engine (GPT Researcher/local-deep-research trên Mac Mini) sản xuất báo cáo intel tháng #1 → tặng free khách C1/Pack A → convert 249k/th. **Gate C2: <15 member sau 30 ngày → gộp C2 thành bonus C1, không nuôi membership riêng.**

## RỦI RO RIÊNG MẢNG CI

| Rủi ro | Đối phó |
|--------|---------|
| Output sai → khách quyết định sai vốn liếng → cháy brand | M6 Verifier bắt buộc, mọi số kèm nguồn+ngày, disclaimer "agent gom+phân tích, quyết định của bạn" in trên landing lẫn báo cáo |
| Khách kỳ vọng "tự động nghe MXH 24/7" | Định vị semi-manual nói thẳng từ landing (bài học trang "sản phẩm KHÔNG làm gì" của A) |
| Tool nguồn (Kalodata, Ad Library) đổi format/chính sách | Adapter tách thành file riêng, sửa 1 chỗ; theo dõi mỗi quý cùng đợt review KiotViet |
| Đè lịch vận hành Mitsu + plan A/B | C bất động cho tới Gate A; mọi trễ → dời gate, không bỏ gate |

---

# SẢN PHẨM D — KÉT SẮT AI (Financial Intelligence & Forecasting) [DRAFT v0.1 — 2026-07-08]

> Trạng thái: **DRAFT — không kích hoạt trước Gate A** (cùng luật với C).
> Định vị: pack tài chính 1,5tr cho chủ quán F&B/hộ KD + module CFO gắn OS B (+1,99tr) + về sau
> subscription "sức khỏe quán" 149k/th. Ladder: A 1,5tr → D 1,5tr → B 6tr → D-CFO +2tr → DWY.
> ~50% D generic hóa được từ stack sẵn (`/chot-ca` `/menu-eng` `/huy` + Financials/Insight của OS).
> Phần đó không liệt kê lại — mục này chỉ ghi **cái thị trường cần mà mình CHƯA có** (gap GF,
> cùng logic G của B và GC của C).
>
> **Nguyên tắc kiến trúc bất biến của D: LLM KHÔNG làm toán.** Tầng tính = Sheets formulas + GAS
> (deterministic, audit được); tầng LLM chỉ diễn giải/cảnh báo/what-if trên số đã tính.
> Điểm bán kỹ thuật: *"máy tính tính, AI chỉ giải thích — không bịa số của bạn."*

## GAP ANALYSIS GF — KHÁCH CẦN, MÌNH CHƯA CÓ (research 2026-07-08)

Bối cảnh vĩ mô làm nền cho toàn mảng D: từ 01/01/2026 xóa thuế khoán, hộ KD kê khai theo doanh thu
thật; 50.000+ cửa hàng F&B đóng cửa nửa đầu 2025, nguyên liệu tăng 30–40%
([vietnambiz](https://vietnambiz.vn/nam-thanh-loc-2025-nganh-fb-vo-mong-sieu-loi-nhuan-va-lan-song-roi-di-chua-tung-co-2025121716556992.htm), [theleader](https://theleader.vn/ap-luc-chi-phi-tai-dinh-hinh-cuoc-choi-nganh-fb-d45302.html)).
Hàng triệu chủ quán lần đầu bị ép nhìn số thật — MISA/POS lo tầng compliance, tầng "hiểu số + nhìn trước" đang trống.

### GF1 🔴 Bank feed tự động — nguồn data dòng tiền mình chưa từng đụng
- Mitsu xác nhận VietQR thủ công. Khách cần tự động. Hạ tầng VN 2026 đã chín: [SePay](https://sepay.vn/) free 500 giao dịch/tháng, webhook 12+ ngân hàng; [Casso](https://casso.vn/); payOS free từ 01/2026 — phí A2A vài trăm đồng/giao dịch.
- Từ 01/03/2026 hộ KD bắt buộc tài khoản chính chủ, thuế quản theo dòng tiền bank ([Tuổi Trẻ](https://tuoitre.vn/tai-khoan-ngan-hang-phai-chinh-chu-ho-kinh-doanh-het-cua-giau-doanh-thu-20260301070210855.htm)) → **giao dịch ngân hàng = nguồn doanh thu chuẩn nhất**, hơn cả POS export.
- **Quyết định:** module **Bank Feed Ingest** — webhook SePay → GAS `doPost` (đúng pattern event bus sẵn có) → tab `BANK_FEED` append-only. Đây là cầu dữ liệu chủ lực của D, tương đương vai trò POS Import (G2) của A/B. Ưu tiên SePay trước (free tier + docs tốt), Casso sau.

### GF2 🔴 Tách bạch tiền cá nhân / tiền quán — pain số 1 khi kê khai, LLM làm đúng vai
- Sai lầm phổ biến nhất của hộ KD: 1 tài khoản nhận cả tiền hàng, tiền nhà gửi, tiền vay — đến kỳ kê khai không tách nổi dòng nào là doanh thu ([SGGP](https://www.sggp.org.vn/lan-lon-tai-chinh-ca-nhan-va-doanh-nghiep-de-lam-vao-rui-ro-ve-thue-post852794.html), [vietnam.vn](https://www.vietnam.vn/minh-bach-dong-tien-ho-kinh-doanh-buoc-ngoat-tu-dinh-danh-tai-khoan-ngan-hang)).
- Mitsu không có pain này (tách sẵn) → chưa có module nào.
- **Quyết định:** agent **Phân Loại Giao Dịch**: đọc BANK_FEED → gắn nhãn `doanh_thu / chi_NVL / chi_cố_định / cá_nhân / vay_mượn / chuyển_nội_bộ` + confidence; nghi ngờ thì hỏi chủ quán qua Telegram/Zalo (1 chạm xác nhận). Đây là chỗ classification LLM đúng sở trường — Gemma 12B local cũng đủ (halo content C6 cũ). Nhãn đổ ngược vào P&L + forecast.

### GF3 🔴 Công nợ nhà cung cấp + lịch phải trả — lỗ hổng lớn nhất của forecast
- 68% chủ quán không tính chính xác food cost, thất thoát trung bình 25–40tr/tháng; công nợ NCC + khách chây ì = pain kể tên nhiều nhất ([iPOS](https://ipos.vn/cach-tinh-lai-lo-kinh-doanh-nha-hang/), [BẾP THÁI BÌNH](https://bepthaibinh.com/kinh-doanh-am-thuc-nha-hang-linh-vuc-fb-tu-kho-khan-den-giai-phap/)).
- Kissaten không có tab SUPPLIERS/PAYABLES — Mitsu mua đứt bán đoạn, khách thì gối đầu 15–30 ngày.
- **Quyết định:** thêm tab `PAYABLES` (NCC, số tiền, hạn trả, kỳ lặp) + `FIXED_COSTS` (mặt bằng, lương, điện). Forecast 13 tuần = thu dự kiến (từ BANK_FEED/POS) − lịch phải trả. **Không có GF3 thì forecast chỉ là đồ chơi** — chi cố định + công nợ mới là thứ làm quán hụt tiền.

### GF4 🟡 Hồ sơ vay vốn — outcome bán được rõ nhất
- 80% cơ sở F&B nhỏ đóng cửa vì thiếu vốn; hồ sơ vay bị từ chối vì không chứng minh được dòng tiền ([iPOS](https://ipos.vn/vay-von-kinh-doanh/)).
- **Quyết định:** module **Hồ Sơ Vay 1 Chạm**: từ 6–12 tháng data → xuất PDF "báo cáo dòng tiền + P&L + xu hướng" định dạng ngân hàng quen đọc. Không hứa "được duyệt vay" — chỉ hứa "số liệu sạch, trình bày chuẩn". Demo clip mạnh: "quán tôi in hồ sơ vay trong 1 phút".

### GF5 🟡 Benchmark ngành — khách hỏi "quán tôi vậy là tốt hay tệ?", mình chỉ có data 1 quán
- Chuẩn công khai đã đủ dùng v1: food cost lý tưởng 30–35% (đồ uống 28–35%), lãi ròng cafe 10–20% doanh thu ([Sapo](https://www.sapo.vn/blog/cach-tinh-gia-cost-mon-an-do-uong), [D-corp](https://www.dcorp.com.vn/kinh-doanh-quan-cafe-co-lai-khong/)).
- **Quyết định:** v1 nhúng bảng benchmark công khai (kèm nguồn) vào skill — agent so số quán khách với chuẩn ngành, gắn cờ lệch. **v2 moat:** ≥30 khách D → aggregate ẩn danh (opt-in) thành benchmark riêng "quán cỡ bạn ở tỉnh lẻ" — thứ MISA có data nhưng không làm cho segment này, và là xương sống subscription 149k/th.

### GF6 🟢 Seller sàn TMĐT — cùng 1 pain, thị trường to hơn F&B, dùng chung hạ tầng C
- Shopee/TikTok Shop tăng phí 5/2026, tổng chi phí chạm 40–45% doanh thu; seller "đơn tưởng lãi, trừ hết còn vài nghìn" ([CafeBiz](https://cafebiz.vn/chu-shop-online-khoc-rong-co-nguoi-ban-tren-shopee-tiktok-shop-phai-cong-gan-50-doanh-thu-cho-cac-loai-phi-176260704084401313.chn), [VOV](https://vov.vn/kinh-te/chiem-98-thi-phan-tiktok-shop-va-shopee-tang-phi-siet-loi-nhuan-nguoi-ban-post1288742.vov)).
- **Quyết định:** KHÔNG build pack riêng cho seller ở v1. Làm 1 skill lẻ **"Lãi Thật Từng Đơn Sàn"** (nhập phí sàn + giá vốn → lãi ròng thật từng đơn/SKU) dùng làm **lead magnet free/99k** — cùng chiến thuật M1 Data-Input Adapter của C (đọc export Kalodata/Shopee). Nếu lead seller > lead F&B ở khảo sát D0 → cân nhắc D-seller v2.

### Ngoài phạm vi D v1 (ghi nhận, không làm)
- Dịch vụ kế toán/thuế, tư vấn kê khai hộ — disclaimer "công cụ quản trị, không thay kế toán" in mọi nơi; giới thiệu đối tác kế toán dịch vụ (kiếm 1 kế toán quen làm referral 2 chiều).
- Làm cổng thanh toán / giữ tiền hộ — đất của SePay/payOS, mình chỉ ĐỌC webhook.
- ML forecasting phức tạp — moving average + hệ số mùa vụ + lịch phải trả là đủ và giải thích được; "AI dự báo 92%" của enterprise không tái tạo nổi ở segment này, đừng hứa.
- Bank feed đa ngân hàng tự viết — chỉ tích hợp qua SePay/Casso, không tự kết nối API bank.

## D-MODULES PHẢI BUILD MỚI (không generic hóa được từ stack sẵn)

| # | Module | Gap | Ước lượng |
|---|--------|-----|-----------|
| N1 | Bank Feed Ingest (SePay webhook → GAS → BANK_FEED) | GF1 | 2–3 ngày — pattern doPost sẵn, mở tài khoản SePay test bằng chính Mitsu |
| N2 | Agent Phân Loại Giao Dịch (+ xác nhận 1 chạm qua Telegram/Zalo) | GF2 | 3 ngày — prompt + confidence + luồng hỏi lại |
| N3 | Tab PAYABLES + FIXED_COSTS + forecast 13 tuần (Sheets formulas thuần) | GF3 | 3 ngày — deterministic, golden test bằng data Mitsu 6 tháng |
| N4 | Hồ Sơ Vay 1 Chạm (PDF generator — tái dùng pipeline generatePDFInvoice) | GF4 | 2 ngày |
| N5 | Benchmark pack v1 (bảng chuẩn ngành + agent so sánh gắn cờ) | GF5 | 1 ngày |
| N6 | Skill lẻ "Lãi Thật Từng Đơn Sàn" (lead magnet) | GF6 | 1 ngày |
| N7 | Bộ eval tài chính: 20 câu hỏi + đáp án đúng từ data Mitsu, chạy trước mỗi lần sửa skill | chống sai số — bảo hiểm brand (tương đương M6 của C) | 2 ngày |

Kiến thức phải bổ sung trước khi build: ① chuẩn kê khai nhóm doanh thu 2026 (đọc [hướng dẫn MISA](https://www.meinvoice.vn/tin-tuc/14863/ke-khai-thue-doi-voi-ho-kinh-doanh/) + consult 1 kế toán dịch vụ ~500k) ② forecast cơ bản: moving average + seasonal decomposition — học 1 tuần, thực hành thẳng trên data Mitsu (khớp roadmap LEARNING_LLM_ENGINEERING).

## LỊCH C/D — XỬ LÝ XUNG ĐỘT (cả hai đều DRAFT sau Gate A, KHÔNG build song song)

Quỹ thời gian tuần 5–6 chỉ đủ 1 pack. Quyết định bằng data, không bằng cảm tính:

- [ ] **D0 = gộp vào khảo sát C0** (tuần 4): thêm 2 câu — "nỗi lo lớn hơn: đối thủ đang làm gì, hay tiền quán tuần sau còn không?" + "2026 phải kê khai doanh thu thật, anh/chị đã có cách theo dõi chưa?". Kèm 1 post P0.5-style hook thuế khoán đo phản ứng riêng.
- [ ] **Gate C0/D0:** pain nào thắng (≥60% lead) → build pack đó tuần 5–6, pack kia lùi tuần 9–10. Hòa → ưu tiên **D trước** (lý do: deadline kê khai 2026 là sự kiện có hạn chót thật, demand có mùa; CI không có deadline).
- [ ] **D-build** (2 tuần khi kích hoạt): N1→N3 trước (data + forecast = xương sống), N4–N6 sau, N7 chạy xuyên suốt. Beta 2 quán quen với bank feed thật của họ.
- [ ] **D-launch:** early 990k × 20 → 1.490k, bán warm list Pack A trước.
- [ ] **D-CFO module cho OS B** (+1.990k upsell, bundle B+D-CFO 7.490k): chỉ sau khi B launch — `Finance.gs` + `Forecast.gs` đọc thẳng ORDERS/INVENTORY/WASTE_LOG, zero nhập liệu, alert tuần qua Telegram/Zalo.
- [ ] **D-sub 149k/th** (Q4, cần ≥30 khách D active): weekly health report 5 chỉ số + 1 cảnh báo + 1 việc cần làm + benchmark aggregate GF5-v2.

## RỦI RO RIÊNG MẢNG D

| Rủi ro | Đối phó |
|--------|---------|
| AI nói sai số tiền → mất sạch uy tín trong 1 lần | Kiến trúc 2 tầng bất biến (LLM không làm toán) + N7 eval bắt buộc trước mỗi release |
| Bị hiểu nhầm là dịch vụ kế toán/thuế → trách nhiệm pháp lý | Disclaimer in đậm landing + docs + footer mọi báo cáo; không tư vấn mức thuế cụ thể, chỉ ước tính kèm "xác nhận với kế toán của bạn" |
| SePay/Casso đổi giá/API | Adapter tách file riêng như M-adapter của C; BANK_FEED schema độc lập nguồn — đổi provider không đụng downstream |
| Khách sợ cho tool đọc tài khoản ngân hàng | SePay chỉ đọc biến động số dư (không lệnh chi); nói rõ + hướng dẫn mở tài khoản bán hàng riêng (tiện thể giải luôn GF2); local AI = angle "số không rời máy bạn" cho segment nhạy cảm |
| MISA đánh xuống segment này với Agentic AI | Họ bán compliance cho kế toán viên; mình bán "hiểu số" cho chủ quán không biết kế toán. Theo dõi mỗi quý cùng đợt review KiotViet/Kalodata |
