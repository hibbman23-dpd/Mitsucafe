# Monetization Master Plan — 90 ngày đầu tiên
**Ngày lập: 2026-07-12 · Người lập: Claude Fable 5 (vai chief strategist) · Người thực thi: DPD + model rẻ hơn (Sonnet/ChatGPT/Antigravity)**

> **Cách dùng file này:** Đây là nguồn sự thật duy nhất cho việc kiếm tiền ngoài doanh thu quán.
> Mỗi task có gắn [TIER] — giao đúng model theo luật CLAUDE.md toàn cục:
> - `[CHIEF]` = model mạnh nhất hiện có (quyết định, review, đàm phán giá, đụng tiền)
> - `[BUILDER]` = Sonnet / ChatGPT (viết code, viết content theo spec)
> - `[MACHINE]` = Haiku (chạy test, thu thập số liệu, grep)
> - `[HUMAN]` = việc chỉ DPD làm được (quay video, gặp khách, nhận tiền)
>
> **Luật số 1 của plan này: KHÔNG mở track mới khi track core chưa qua Gate.**
> Repo này đã có 7+ plan chưa ra đồng nào. Plan này thay thế tất cả về mặt ưu tiên,
> trừ vận hành quán hàng ngày.

---

## 0. TL;DR

1. **Ngách chính (Track A): "Quán Tự Chạy" — productized service cho quán cà phê/trà sữa Việt Nam.**
   Setup hệ thống Kissaten (bản sanitized) cho quán khác: 4–6tr setup + 300–500k/tháng duy trì.
   Neo giá theo KiotViet (200–370k/tháng) — khách đã quen trả mức này cho phần mềm.
2. **Bánh đà (Track B): Content "quán thật tự chạy bằng AI"** — TikTok/FB Reels/nhóm chủ quán.
   Không phải track kiếm tiền trực tiếp; là kênh phân phối duy nhất của Track A và C.
3. **Sản phẩm số (Track C): Skill Pack 1,5tr** — bán cho lead không đủ tiền/chưa sẵn sàng Track A.
   Downsell tự động, không tốn công giao hàng.
4. **Gió xuôi pháp lý: NĐ70/2025** — hộ kinh doanh F&B doanh thu ≥1 tỷ/năm bắt buộc hóa đơn điện tử
   từ máy tính tiền; hộ nhỏ hơn vẫn phải bỏ thuế khoán, ghi sổ sách từ 2026. Đây là **cái cớ mở cửa**
   khi chào hàng — không phải sản phẩm (KHÔNG tự build phần mềm HĐĐT, chỉ tích hợp).
5. **Mục tiêu 90 ngày: 10 quán trả tiền setup + 4tr MRR.** Gate rõ ràng ở ngày 14 / 30 / 60 / 90 —
   không đạt thì đổi thông điệp hoặc đổi ngách theo cây quyết định §8.

---

## 1. Nghiên cứu thị trường — facts đã kiểm chứng

### 1.1 Người ta kiếm tiền bằng Claude/AI agent thế nào (2026)
- Pattern thắng lặp lại: **bán outcome cho business không biết code**, không bán "AI".
  Website/MVP cho SMB £2.000–30.000/dự án; agency tự động hóa 1 người $10K–30K/tháng
  với ~80% việc do AI chạy. Nguồn: Artificial Corner, Agensi, Medium Activated Thinker.
- Micro-SaaS: $1K–10K MRR trong 3–6 tháng, chi phí vận hành $85–200/tháng.
- Bottleneck 2026 = **phân phối + niềm tin**, không phải build. Ai có proof thật + đứng trước
  đúng khách sẽ thắng người build giỏi hơn.
- Chợ skill Claude bùng nổ (Agensi chia 70% cho creator, skills.sh, ClaudeSkills.info 658+ skill free).
  → giá skill lẻ bị ép về thấp/free. Bán skill lẻ tiếng Anh = ngách phụ, không phải core.

### 1.2 Thị trường POS/phần mềm quán VN — neo giá
- KiotViet: 200k/270k/370k VND/quán/tháng. Sapo F&B: 229–599k/tháng.
- Nghĩa là: **chủ quán VN đã quen trả 200–600k/tháng cho phần mềm.** Giá duy trì 300–500k/tháng
  của mình nằm đúng vùng quen thuộc, nhưng bán kèm thứ KiotViet không có:
  Zalo OA tự nhắn khách, tem in tự động, loyalty stamp, AI trợ lý viết post/báo cáo.
- KHÔNG đối đầu trực diện KiotViet về quản kho/kế toán. Định vị: **lớp tự động hóa + chăm khách**
  (có thể chạy song song KiotViet ở quán đã dùng).

### 1.3 NĐ70/2025 — gió xuôi pháp lý
- Hiệu lực 01/06/2025: hộ kinh doanh doanh thu ≥1 tỷ/năm ngành F&B, bán lẻ, khách sạn...
  **bắt buộc dùng hóa đơn điện tử khởi tạo từ máy tính tiền kết nối cơ quan thuế.**
- HĐĐT từ máy tính tiền không cần chữ ký số từng hóa đơn → hợp bán lẻ.
- Báo chí ghi nhận **hộ kinh doanh đang lúng túng** (diendandoanhnghiep.vn) → nhu cầu cầm tay chỉ việc.
- Nhà cung cấp HĐĐT đã có: MISA meInvoice, VNPT, EasyInvoice, Fast e-Invoice...
  → **Chiến lược: làm bên tích hợp/setup trọn gói, ăn phí dịch vụ + hoa hồng đại lý nếu có.
  TUYỆT ĐỐI không tự build phần mềm HĐĐT (cần chứng nhận, ngoài khả năng).**

### 1.4 Agency retainer — trần tham khảo
- Thế giới: retainer $1.000–5.000+/tháng cho SMB. VN sẽ thấp hơn nhiều nhưng chứng minh mô hình
  "trả hàng tháng cho tự động hóa" là chuẩn ngành, không phải mình bịa ra.

Nguồn đầy đủ ở Phụ lục §11.

---

## 2. Đánh giá 6 ngách — bảng điểm

Thang 1–5. **Edge** = lợi thế riêng của DPD. **Time-to-cash** = 5 là nhanh nhất.

| # | Ngách | Thị trường | Edge | Time-to-cash | Công giao hàng | MRR tiềm năng | Tổng | Phán quyết |
|---|-------|-----------|------|--------------|----------------|----------------|------|-----------|
| A | Quán Tự Chạy (productized service F&B VN) | 4 | **5** (quán thật + hệ thống chạy 6 tháng) | 4 | 3 | 4 | **20** | **CORE** |
| B | Content creator "quán AI" | 3 | 5 (độc nhất VN: quán thật ở Lâm Hà) | 2 (tiền trực tiếp chậm) | 4 | 2 | 16 | **BÁNH ĐÀ cho A** |
| C | Skill Pack số 1,5tr | 3 | 4 | 4 | **5** (zero công/đơn) | 2 | 18 | **DOWNSELL của A** |
| D | Agency automation SMB Lâm Đồng (ngoài F&B) | 3 | 3 | 3 | 2 (mỗi deal custom) | 3 | 14 | SAU GATE 60 ngày |
| E | Skill/MCP marketplace tiếng Anh (SePay MCP...) | 4 | 2 (không phân phối, cạnh tranh free) | 2 | 4 | 3 | 15 | PARKED — chỉ làm khi A chạy ổn |
| F | Real estate AI agents | 3 | 2 | 1 | 1 | 3 | 10 | PARKED (đã hoãn 2026-07-08, giữ nguyên) |

**Vì sao A thắng:** duy nhất ngách mà DPD có proof không ai copy được trong 6 tháng
(quán thật + số thật + video thật). Ngách E ai giỏi code cũng nhảy vào được; ngách A cần
người vừa hiểu vận hành quán vừa build được hệ — tập giao rất hẹp.

**Cấu trúc 3 track chạy đồng thời (chỉ 3, không hơn):**
```
Track B (content) → kéo lead → Track A (4-6tr setup + MRR)
                              ↘ lead chưa đủ tiền → Track C (1,5tr Skill Pack)
                                                    ↘ nuôi tiếp → lên Track A sau
```

---

## 3. Khách hàng mục tiêu (ICP)

**ICP chính:** Chủ quán cà phê / trà sữa / ăn vặt Việt Nam, 1 điểm bán, 3–15 nhân viên,
doanh thu 100tr–1tỷ/tháng... *(hiệu chỉnh sau 10 cuộc nói chuyện đầu — xem W2)*. Đặc điểm:
- Đang dùng Zalo cá nhân nhắn khách thủ công, hoặc không nhắn gì.
- Đã trả tiền KiotViet/Sapo hoặc đang dùng sổ tay → hiểu khái niệm "trả tiền phần mềm".
- Đau: quên đơn giờ cao điểm, không giữ được khách quen, tự viết post FB mất 1 tiếng, sợ NĐ70.
- Ở đâu: nhóm FB "Cộng đồng chủ quán cà phê", "Kinh doanh F&B", "Setup quán cafe";
  TikTok #chuquancafe #kinhdoanhcafe; hội quán địa phương Lâm Đồng/Đà Lạt.

**Phản-ICP (từ chối bán, đỡ mất công support):** chuỗi >3 điểm (cần phần mềm lớn),
quán chưa khai trương (chưa có đau thật), người đòi "AI làm hết không cần tôi làm gì".

---

## 4. Sản phẩm & giá

### 4.1 Ba bậc

| Bậc | Tên | Giá | Gồm | Công giao |
|-----|-----|-----|-----|-----------|
| C | **Skill Pack "Trợ Lý Quán"** | 1,5tr một lần | Bộ skill Claude/ChatGPT: viết post đúng brand, plan promo, daily brief, RFM khách, menu engineering (sanitize từ skills cafe-manager hiện có) + video hướng dẫn + nhóm Zalo hỗ trợ | ~0/đơn sau khi đóng gói |
| A1 | **Quán Tự Chạy — Setup** | 4–6tr một lần (launch 4tr cho 5 khách đầu, chuẩn 6tr từ khách thứ 6) | Clone hệ Kissaten sanitized: web order + QR, GAS event bus, Sheets DB, tem in tự động (khách tự mua Xprinter ~1,2–1,5tr theo link mình đưa), Telegram alert, Zalo OA cơ bản, KDS. Setup 1 ngày + đào tạo 1 buổi | 1–2 ngày người/quán (mục tiêu ép về 0,5 ngày nhờ playbook §7) |
| A2 | **Duy trì + AI** | 300–500k/tháng | Hosting/giám sát, sửa lỗi, cập nhật tính năng mới, Skill Pack C miễn phí kèm, báo cáo tuần tự động, hỗ trợ Zalo trong 24h | mục tiêu <1h/quán/tháng |

Bán kèm tùy chọn: tích hợp HĐĐT máy tính tiền (MISA meInvoice/VNPT...) — phí dịch vụ 1–2tr
+ khách tự trả phí nhà cung cấp HĐĐT. Đây là mồi NĐ70.

### 4.2 Unit economics mục tiêu
- 10 quán setup (trung bình 5tr) = 50tr một lần + 10 × 400k = **4tr MRR** cuối ngày 90.
- 50 quán (tháng 6–12) = **20tr MRR** — lúc đó doanh thu phần mềm ≈ lợi nhuận một quán thứ hai,
  không cần mặt bằng.
- Chi phí biến đổi/quán ≈ 0 (GAS + Sheets free, Zalo OA phí riêng khách trả).
  Chi phí thật = thời gian support → mọi quyết định kỹ thuật ưu tiên **giảm giờ support**.

### 4.3 Việc kỹ thuật bắt buộc trước khi bán (tuần 1–2)
1. `[BUILDER]` **Template hóa repo**: tách bản "Kissaten-core" sanitized — bỏ dữ liệu Mitsu,
   token, số liệu thật; mọi thứ riêng của quán nằm trong CONFIG sheet + 1 file hướng dẫn điền.
   Tiêu chí nghiệm thu: từ template → quán demo mới chạy được trong ≤2 giờ theo checklist §7,
   không sửa code, chỉ điền CONFIG.
2. `[BUILDER]` **Script khởi tạo khách mới** (`ops/new_tenant.py` hoặc GAS): tạo Sheet 7 tab từ
   template, điền CONFIG, deploy GAS (nhớ: máy này `clasp push` gãy — dùng `python3 ops/gas_push.py`).
3. `[MACHINE]` Chạy 4 lớp gate hiện có (unit → syntax → API smoke → E2E) trên bản template.
4. `[CHIEF]` Review bảo mật bản template trước khi giao quán đầu tiên: không lộ token,
   mỗi quán 1 spreadsheet + 1 GAS deployment riêng (đã chốt 1-sheet/CN trong Workflow v3 — tái dùng).
5. `[HUMAN]` Đăng ký pháp lý thu tiền: quyết định hộ kinh doanh dịch vụ / cá nhân — hỏi kế toán địa phương.

---

## 5. Kế hoạch 90 ngày — tuần theo tuần

> Mỗi mục: `[TIER] Việc — Tiêu chí xong`. Model triển khai đọc §10 để lấy prompt sẵn.

### Tuần 1 (13–19/07): Dọn nền + đóng gói
- `[HUMAN]` Merge PR #11, set `STAFF_FORM_TOKEN` + `BANK_WEBHOOK_SECRET` (việc treo từ 12/07) — Xong khi form staff hết 401.
- `[BUILDER]` Task 4.3.1 template hóa — Xong khi quán demo dựng được ≤2h.
- `[BUILDER]` Task 4.3.2 script new_tenant — Xong khi chạy end-to-end 1 lần.
- `[BUILDER]` Landing page bán hàng 1 trang (tái dùng hạ tầng mitsu.html, trang mới `web/quan-tu-chay.html`): hero video + 3 bậc giá + form Zalo/SĐT. Xong khi live trên domain hiện có.
- `[HUMAN]` Quay nguyên liệu video #1: 90 giây flow thật — khách quét QR → đơn hiện KDS → tem tự in → Telegram báo → khách nhận Zalo. Quay dọc 9:16, nhiều take, cả tiếng máy in.

### Tuần 2 (20–26/07): Ra mắt content + 10 cuộc nói chuyện
- `[BUILDER]` Dựng + caption video #1 theo script §6.3; đăng TikTok + Reels + 3 nhóm FB chủ quán. Xong khi live cả 3 nơi.
- `[HUMAN]` Nhắn trực tiếp 20 chủ quán quen/bạn bè giới thiệu — mục tiêu **10 cuộc nói chuyện 15 phút** (không bán, chỉ hỏi đau gì — script §6.4). Ghi âm/ghi chú lại.
- `[CHIEF]` Đọc 10 ghi chú → hiệu chỉnh ICP §3 + thông điệp §6. Đây là điểm dữ liệu quan trọng nhất 90 ngày.
- 🚩 **GATE 14 ngày** (§8).

### Tuần 3–4 (27/07–09/08): 3 khách đầu tiên (bán tay-trong-tay)
- `[HUMAN]` Chào giá launch 4tr cho lead nóng nhất. Mục tiêu: **3 khách đặt cọc.**
- `[HUMAN]+[BUILDER]` Setup quán #1 theo playbook §7 — vừa làm vừa sửa playbook. Ghi lại mọi vấp.
- `[BUILDER]` Video #2: case study quán #1 (trước/sau, lời chủ quán). Content 2 video/tuần từ đây (lịch §6.3).
- `[BUILDER]` Đóng gói Skill Pack C từ skills cafe-manager (sanitize) + trang bán + video demo 3 phút. Xong khi mua-tải-dùng không cần mình can thiệp.
- Lưu ý lịch: roadmap học harness 8 tuần bắt đầu 28/07 — học **trên chính các task BUILDER của plan này**, không mở project học riêng (khớp nguyên tắc "dạy trên sản phẩm thật").
- 🚩 **GATE 30 ngày**.

### Tháng 2 (10/08–09/09): Hệ thống hóa
- Mục tiêu bán: tổng **6–8 quán** + 5 đơn Skill Pack.
- `[BUILDER]` Ép giờ setup: tự động hóa mọi bước lặp >2 lần (Zalo OA template, printer config, menu import từ ảnh/Excel).
- `[BUILDER]` Dashboard giám sát tập trung: 1 sheet HQ theo dõi health tất cả quán khách (tái dùng thiết kế HQ rollup của Workflow v3 + watchdog gas_health.py cho lỗi 403 chu kỳ 7 ngày — đã có sẵn trong repo).
- `[HUMAN]` Thử mồi NĐ70: 5 tin nhắn chào riêng quán doanh thu lớn (≥1 tỷ/năm) về gói tích hợp HĐĐT. Đo phản hồi trước khi làm content NĐ70 diện rộng.
- `[CHIEF]` Quyết theo dữ liệu: mồi nào ra khách nhiều hơn — "tự động hóa/giữ khách" hay "NĐ70 compliance" → dồn content vào mồi thắng.
- 🚩 **GATE 60 ngày**.

### Tháng 3 (10/09–10/10): Nhân bản
- Mục tiêu: tổng **10 quán, 4tr MRR**.
- `[HUMAN]` Referral: quán cũ giới thiệu quán mới → tặng 1 tháng duy trì.
- `[BUILDER]` Self-serve một phần: khách tự điền form đăng ký → new_tenant chạy tự động → mình chỉ làm buổi đào tạo.
- `[CHIEF]` Review 90 ngày: P&L thật, giờ support/quán, churn. Quyết mở Track D (agency SMB) hay dồn tiếp F&B. Cập nhật file này.
- 🚩 **GATE 90 ngày**.

---

## 6. Playbook bán hàng

### 6.1 Thông điệp lõi (đã né sai lầm "bán AI")
> "Quán mình ở Lâm Hà: khách quét QR tự đặt, tem tự in, Zalo tự nhắn khách, cuối ngày tự chốt sổ.
> Mình setup y hệt cho quán bạn trong 1 ngày. Bằng tiền một chầu cà phê mỗi ngày."

KHÔNG nói: "AI agent", "tự động hóa quy trình", "chuyển đổi số". CÓ nói: "đỡ quên đơn",
"khách quay lại", "đỡ 1 tiếng viết post mỗi ngày", "sổ sách sẵn sàng cho thuế 2026".

### 6.2 Funnel
```
Video TikTok/Reels/nhóm FB → comment/inbox → Zalo OA Mitsu → gửi video demo 3 phút
→ hẹn call 15 phút → báo giá → cọc 50% → setup → thu nốt + bật duy trì tháng
Lead lạnh/chê đắt → chào Skill Pack 1,5tr → nuôi trong nhóm Zalo → upsell A sau 1–2 tháng
```

### 6.3 Lịch content (2 video/tuần, quay 1 buổi/tuần)
Trụ 1 — "Quán tự chạy" (demo tính năng thật, 60–90s); Trụ 2 — "Số thật" (doanh thu, khách quay
lại, chi phí — minh bạch là điểm khác biệt); Trụ 3 — "Cầm tay" (mẹo chủ quán dùng được ngay,
kể cả không mua — xây niềm tin). Tỷ lệ 1:1:2. CTA mọi video: "Muốn quán bạn chạy vậy, inbox 'QUÁN'."
`[BUILDER]` viết script theo brand voice (đọc `web/mitsu.html` + `mitsu.css` làm chuẩn — KHÔNG tin docs/brand-voice.md cũ).

### 6.4 Script call 15 phút (tuần 2 — nghe là chính)
1. "Quán anh/chị đông nhất khung nào? Lúc đó cái gì hay vỡ?"
2. "Có nhắn tin lại khách cũ bao giờ không? Vì sao không?"
3. "Đang trả tiền phần mềm gì? Thấy đáng không?"
4. "Nghe NĐ70 hóa đơn điện tử chưa? Đang tính xử lý sao?"
5. Cuối: "Em có hệ thống đang chạy ở quán em, gửi anh/chị video 3 phút xem thử nhé?" — KHÔNG báo giá trong call đầu.

### 6.5 Xử lý phản đối
- "Đắt" → so KiotViet 270k/tháng không nhắn khách hộ; 400k của mình = 13k/ngày; downsell Skill Pack.
- "Không rành công nghệ" → "Em setup xong hết, anh/chị chỉ bấm 3 nút như em làm ở quán em — mời qua Lâm Hà xem tận mắt."
- "Quán tôi nhỏ" → Skill Pack trước, hệ thống sau.
- "Để suy nghĩ" → mời vào nhóm Zalo (nuôi bằng content Trụ 3), giữ giá launch 7 ngày.

---

## 7. Playbook giao hàng — setup 1 quán

Checklist chuẩn (BUILDER chi tiết hóa thành SOP có ảnh màn hình trong tuần 3, lưu `docs/tenant-setup-sop.md`):
1. **Trước ngày setup:** khách gửi menu + logo + SĐT Zalo; khách đặt mua Xprinter theo link; mình chạy `new_tenant` tạo Sheet + GAS + web order riêng; điền MENU.
2. **Ngày setup (mục tiêu ≤4h tại quán hoặc remote):** cài printer + Mac/PC poller (hoặc phương án in qua điện thoại nếu quán không có máy tính — BUILDER nghiên cứu tuần 3); nối Telegram nhóm chủ quán; Zalo OA cơ bản; in QR để bàn (tái dùng thiết kế `web/mitsu-order-qr-brand.svg`); chạy 3 đơn test end-to-end: QR → order → tem in → status → Zalo.
3. **Đào tạo 1 buổi (≤90 phút):** flow nhận đơn, đổi status, thêm/sửa món, xem báo cáo ngày; quay video buổi đào tạo gửi lại khách làm tài liệu.
4. **Sau 7 ngày:** call 10 phút hỏi vướng gì; xin 1 câu nhận xét + quyền quay case study.
5. **Định nghĩa "xong":** quán chạy 7 ngày liên tục không cần mình can thiệp → mới tính duy trì tháng.

Nguyên tắc support: mọi câu hỏi lặp 2 lần → BUILDER làm video/FAQ vào kho chung; kho gửi mọi khách mới → giờ support giảm dần theo số khách.

---

## 8. Gates — đo gì, quyết gì

| Gate | Ngày | Ngưỡng ĐẠT | Nếu TRƯỢT |
|------|------|-----------|-----------|
| G1 | 14 | ≥10 cuộc nói chuyện xong + ≥5 lead inbound từ content | KHÔNG đổi sản phẩm. Đổi kênh phân phối: DM trực tiếp 50 chủ quán + đăng 5 nhóm FB khác. Content flop ≠ ngách sai. |
| G2 | 30 | ≥3 khách cọc/trả tiền (A hoặc C) | `[CHIEF]` đọc lại 10+ ghi chú call: khách nói KHÔNG vì giá / vì niềm tin / vì không đau? Giá → hạ setup còn 2,5tr cho 5 khách đầu. Niềm tin → dồn video số thật + mời tới quán. Không đau → đổi mồi sang NĐ70/sổ sách thuế. |
| G3 | 60 | ≥6 quán + giờ setup ≤1 ngày/quán + churn 0 | Nếu bán được nhưng giao hàng ngập: NGỪNG nhận khách 2 tuần, dồn BUILDER tự động hóa. Nếu không bán thêm được: thu hẹp địa lý (chỉ Lâm Đồng, gặp mặt) hoặc kích hoạt Track D với 2 lead ngoài F&B tốt nhất. |
| G4 | 90 | 10 quán + 4tr MRR + support <1h/quán/tháng | Đạt → viết plan scale (đại lý địa phương? self-serve? tăng giá?). Trượt nhưng ≥5 quán → chạy tiếp 90 ngày nữa, không đổi ngách. <3 quán sau 90 ngày nỗ lực thật → ngách này không dành cho phân phối hiện có; CHIEF họp lại, cân nhắc Track E (đem chính hệ thống này bán ra thị trường tiếng Anh dạng template/skill — lúc đó đã có 90 ngày proof + video). |

Metric theo dõi hàng tuần (`[MACHINE]` tổng hợp vào 1 sheet TRACTION, xem mỗi thứ 6 cùng skill /tuan):
video views, inbound lead, call đã thực hiện, tỷ lệ chốt, tiền về, MRR, giờ support/quán, churn.

---

## 9. Rủi ro & đối sách

| Rủi ro | Xác suất | Đối sách |
|--------|----------|----------|
| Support ngập khi >5 quán (nghề thật của productized service) | CAO | Playbook §7 + kho FAQ video + dashboard HQ giám sát chủ động; giá duy trì đủ cao để lọc khách phiền |
| GAS/Sheets quota khi nhiều tenant | TB | 1 sheet + 1 GAS/quán (đã cô lập); watchdog gas_health.py mỗi tenant; lỗi OAuth 7 ngày đã biết cách xử (publish In production) |
| KiotViet/Sapo ra tính năng Zalo AI tương tự | TB | Không cạnh phần mềm, cạnh **dịch vụ cầm tay + cộng đồng chủ quán**; họ không setup tận nơi cho hộ nhỏ |
| Khách đòi HĐĐT mà mình không phải nhà cung cấp | CAO | Luôn nói rõ: mình tích hợp với MISA/VNPT..., không phát hành hóa đơn; ký phụ lục ghi rõ phạm vi |
| Bản thân sa đà build thêm tính năng thay vì bán | **RẤT CAO** (lịch sử repo chứng minh) | Luật: tính năng mới chỉ được build khi ≥2 khách trả tiền yêu cầu. Mọi ý tưởng khác ghi vào PARKING-LOT.md, không mở file plan mới |
| Mất giá launch (khách sau đòi giá khách đầu) | THẤP | Công khai "giá 5 khách đầu", có đếm ngược trên landing |

---

## 10. Prompt library — dán thẳng cho model triển khai

**P1 — Template hóa (Sonnet):**
> Đọc CLAUDE.md + docs/system/*. Tạo bản sanitized của hệ Kissaten thành template multi-tenant: (1) liệt kê mọi chỗ hardcode dữ liệu Mitsu/token/location trong *.gs và web/, (2) dời hết vào CONFIG sheet keys, (3) viết docs/tenant-config-guide.md hướng dẫn điền từng key. Ràng buộc: không đổi kiến trúc, không thêm tính năng, ORDERS append-only, token chỉ ở CONFIG. Nghiệm thu: checklist chạy quán demo mới ≤2h không sửa code.

**P2 — new_tenant (Sonnet):**
> Viết ops/new_tenant.py: nhận tenant.yaml (tên quán, SĐT, menu.csv, màu brand) → tạo Google Sheet 7 tab từ template, điền CONFIG + MENU, deploy GAS project mới (dùng cơ chế của ops/gas_push.py — clasp push gãy trên máy này), sinh web order page + QR SVG theo brand quán. In ra checklist việc còn lại phải làm tay. Kèm chế độ --dry-run và test.

**P3 — Landing (Sonnet, bắt buộc gọi skill frontend-design + creative-design-director):**
> Tạo web/quan-tu-chay.html — landing 1 trang tiếng Việt bán gói Quán Tự Chạy theo §4 và thông điệp §6.1 của docs/monetization-master-plan-2026-07-12.md. Giọng và thẩm mỹ theo web/mitsu.html + mitsu.css (KHÔNG theo docs/brand-voice.md — file đó cũ). Hero: chỗ nhúng video 9:16. Pricing 3 bậc. CTA duy nhất: nút Zalo. Mobile-first, không framework, tự host được trên hạ tầng CF Workers + GitHub Pages hiện có (đọc memory security model để không phá page-gating).

**P4 — Script video (Sonnet):**
> Đọc §6.1, §6.3. Viết script video TikTok 75 giây "quán tự chạy" #1: hook 2 giây đầu là tiếng máy in tem + đơn hiện KDS; kịch bản theo flow thật QR→KDS→tem→Telegram→Zalo; caption + 8 hashtag VN F&B; 3 biến thể hook để A/B.

**P5 — Đóng gói Skill Pack (Sonnet):**
> Sanitize skills cafe-manager (post, promo, sang, tuan, khach, menu-eng) thành bộ dùng được cho quán bất kỳ: bỏ mọi tham chiếu Mitsu/sheet nội bộ, thay bằng file cấu hình quán khách tự điền (ten-quan.md). Đóng gói .zip + README cài cho người không biết code (Claude web/desktop) + outline video hướng dẫn 3 phút.

**P6 — SOP setup (Sonnet, sau quán #1):**
> Từ ghi chú setup quán #1 (đính kèm), viết docs/tenant-setup-sop.md theo khung §7: từng bước có lệnh cụ thể, ảnh màn hình placeholder, thời gian chuẩn, lỗi thường gặp + cách xử. Mục tiêu người mới làm theo được không cần hỏi.

---

## 11. Phụ lục — nguồn nghiên cứu (truy cập 2026-07-12)

- Cách kiếm tiền với Claude: artificialcorner.com/p/money-with-claude · sabrina.dev/p/12-ways-to-make-money-with-claude · medium.com/activated-thinker (founders making real money with Claude)
- Indie/solo 2026: productengineer.info (income tiers) · buildmvpfast.com (AI agent employees) · agensi.io/learn (solopreneurs, skills marketplaces)
- NĐ70/2025: xaydungchinhsach.chinhphu.vn (nội dung mới NĐ70) · meinvoice.vn (14 nghiệp vụ thay đổi) · diendandoanhnghiep.vn (hộ kinh doanh lúng túng) · pos365.vn, easyinvoice.vn (quy định hộ kinh doanh)
- Giá POS VN: loopin.one/en/post/restaurant-pos-pricing-vietnam-2026 (KiotViet 220–550k, Sapo 229–599k) · nplgcorp.com (bảng giá Sapo)
- Agency pricing: cuebytes.com, monetizebot.ai, taskip.net (retainer $1–5k+/tháng)
- Chợ skill: agensi.io (70% creator) · skills.sh · claudeskills.info · insightraider.com (Gumroad $65.8M software dev)

---

*File này thay thế về ưu tiên: digital-product-plan.md (Track A/C nuốt nội dung đó), growth-os-creator-plan.md (thành Track B phục vụ A), mcp-connectors-plan.md (PARKED → Track E), real-estate-ai-agents-plan.md (PARKED). Các file kia giữ làm tài liệu tham khảo, không mở việc mới từ chúng.*
