# Tài liệu học bổ sung — phần LEARNING_LLM_ENGINEERING.md KHÔNG cover
**Lập: 2026-07-13 · Companion 3 của bộ tài liệu (TIỀN · NGÁCH · NGHỀ · file này = HỌC)**

> `LEARNING_LLM_ENGINEERING.md` v2 lo trọn kỹ thuật LLM (harness, loop, MCP, eval) — KHÔNG sửa,
> KHÔNG thêm vào đó. File này lo phần còn lại của thang nghề `career-roadmap-2026-07-12.md`:
> kiến thức kinh doanh, VN-stack, ngành dọc "vừa đủ", và kỹ năng nền.
>
> **Giữ nguyên luật phân tầng của file learning, mở rộng sang phi kỹ thuật:**
> - 🔴 HỌC KỸ = sai thì mất tiền/mất khách/chịu trách nhiệm pháp lý
> - 🟡 ĐỦ DÙNG = trả lời được câu hỏi của khách + biết khi nào phải gọi chuyên gia
> - ⚪ KHÁI NIỆM = biết nó tồn tại, AI/chuyên gia gánh phần còn lại
>
> **Luật chống nghiện học (quan trọng với người thích build):**
> 1. **Just-in-time**: chỉ học module khi bậc chứa nó sắp mở. Học trước >1 bậc = giải trí trá hình.
> 2. **1 sách/chủ đề**, đọc để LÀM checklist/script/SOP, không đọc để biết. Sách thứ 2 cùng chủ đề phải được "trả phí" bằng 1 kết quả thực tế từ sách thứ 1.
> 3. Quỹ đọc: **3–4h/tuần**, tách khỏi 8–10h/tuần của lộ trình LLM. Phần lớn module dưới đây học bằng CÁCH LÀM task có sẵn trong plan 90 ngày, không tốn giờ riêng.
> 4. Không mua khóa >2tr khi bản free/sách 300k dạy cùng nội dung. Ngoại lệ duy nhất: tiếng Anh 1-1.

---

## PHẦN 1 — Bậc 1 (học NGAY, tháng 7–10)

### 1.1 Nói chuyện với khách + bán hàng 🔴 (M1.1)
| Tài liệu | Vì sao chọn | Dùng thế nào |
|---|---|---|
| **The Mom Test** — Rob Fitzpatrick (mỏng, có bản dịch Việt) | Sách đúng nhất cho 10 cuộc call tuần 2: hỏi sao để khách nói thật thay vì khen xã giao | Đọc TRƯỚC tuần 2 plan 90 ngày. Biến chương 1–3 thành script call §6.4. Sau mỗi call: chấm mình theo checklist sách |
| **SPIN Selling** — Neil Rackham | Khung hỏi 4 lớp cho deal có tư vấn (đúng loại deal 4–6tr của bạn) | Chỉ cần nắm khung S-P-I-N + chương nghiên cứu vì sao đóng deal sớm là sai. Bỏ phần nghiên cứu học thuật |
| **$100M Offers** — Alex Hormozi (free audiobook trên site của ông) | Cấu trúc offer: giá trị = kết quả mơ ước × xác suất tin / (thời gian × công sức). Áp thẳng vào cách viết gói A1/A2/C | Làm lại trang giá landing sau khi đọc — bài tập thật |
| Thực hành lớn nhất: **ghi âm 10 call tuần 2, nghe lại, tự chấm** | Không sách nào thay được nghe chính giọng mình bán | 30 phút/call nghe lại; AI transcribe + chỉ chỗ nói nhiều hơn nghe |

### 1.2 VN-stack: Zalo OA, VietQR, SePay, máy in 🔴 (M1.3)
| Tài liệu | Ghi chú |
|---|---|
| Zalo OA official docs (developers.zalo.me + trung tâm trợ giúp OA) | Đọc kỹ: phí OA, loại template message, rate limit, quy trình xác thực OA — khách sẽ hỏi đúng mấy mục này. Đã dùng rồi, giờ đọc lại **như người sẽ trả lời thay Zalo** |
| VietQR: docs vietqr.io + spec EMVCo QR (bản NAPAS) | Đủ dùng: hiểu field nào bắt buộc, vì sao QR động ≠ QR tĩnh. Đã build rồi — bổ túc phần spec để giải thích được |
| SePay docs (webhook, đối soát) | Học kỹ — nó thành SePay MCP ở W2 lộ trình LLM, một công đôi việc |
| ESC/POS: python-escpos docs + tài liệu lệnh Xprinter | Tự viết **cây chẩn đoán lỗi in 1 trang** (điện→mạng→poller→GAS→queue) từ kinh nghiệm + docs. Đây là tài liệu M1.3 quan trọng nhất, tự viết chứ không đọc của ai |

### 1.3 NĐ70 + thuế hộ kinh doanh 🟡 mức tư vấn viên (M1.4)
- **Nguồn gốc (đọc 1 lần):** toàn văn NĐ70/2025 trên xaydungchinhsach.chinhphu.vn + bài "14 nghiệp vụ thay đổi" của meinvoice.vn (đã có trong nghiên cứu 07-12).
- **Nguồn sống (theo dõi):** mục tin tức của 2–3 nhà cung cấp HĐĐT (MISA, EasyInvoice) — họ cập nhật nhanh nhất vì họ bán hàng bằng tin đó.
- **Làm:** viết `kb/shop/faq-nd70.md` — 10 câu chủ quán hay hỏi + câu trả lời + **câu số 11: "cái này hỏi kế toán"** liệt kê rõ những gì mình KHÔNG tư vấn (thuế suất, kê khai, hoàn thuế). Ranh giới này là chuyên nghiệp, học thuộc nó.
- **1 buổi cà phê với 1 kế toán dịch vụ địa phương** — vừa học vừa xây kênh referral 2 chiều (họ gặp hộ KD cần máy tính tiền mỗi ngày).

### 1.4 Video ngắn bán hàng 🟡 (M1.5)
- Không sách. Học bằng phân tích + lặp: mỗi tuần mổ xẻ 3 video viral của niche chủ quán VN (hook giây 1–2 là gì, cắt cảnh nhịp nào, CTA đặt đâu) — ghi vào 1 file swipe.
- Đọc duy nhất: guide creator chính chủ TikTok (Creator Academy) phần retention + analytics — free, đủ.
- Kỹ năng Higgsfield/film Tam Mật đã có sẵn phần sản xuất — thiếu là phần **đọc số sau đăng**: mỗi video sau 48h ghi 3 số (view, % xem hết, inbox) vào sheet TRACTION rồi mới làm video sau.

### 1.5 Pháp lý cho CHÍNH MÌNH ⚪→🟡 (ngoài lề bắt buộc)
- Đăng ký hộ kinh doanh dịch vụ (mã ngành phần mềm/tư vấn), hóa đơn cho khách của MÌNH, hợp đồng dịch vụ đơn giản + phụ lục phạm vi (đặc biệt điều khoản "tôi tích hợp HĐĐT, không phát hành HĐĐT").
- Nguồn: 1 buổi với chính kế toán ở mục 1.3 + mẫu hợp đồng nhờ AI soạn rồi kế toán/luật sư quen rà 1 lần. KHÔNG tự học luật sâu — mua giờ chuyên gia, rẻ hơn sai.

---

## PHẦN 2 — Bậc 3 (học tháng 10+ · mở khi roadmap LLM xong)

### 2.1 Nghề consulting 🔴 (M3.1)
| Tài liệu | Dùng |
|---|---|
| **Value-Based Fees** — Alan Weiss | Định giá theo giá trị, thoát bẫy tính giờ. Đọc trước dự án trả phí thứ 2 |
| **The Trusted Advisor** — Maister/Green/Galford | Công thức niềm tin = (tin cậy + đáng tin + thân) / vị kỷ. Đọc chậm, 1 chương/tuần |
| **Founding Sales** — Pete Kazanjy (free online) | Bán khi chưa có thương hiệu — đúng hoàn cảnh năm đầu |
| Làm ngay: **SOW template của riêng mình** (phạm vi, deliverable, tiêu chí nghiệm thu, số vòng sửa, giá, điều khoản dừng) | AI soạn khung, mình quyết điều khoản, dùng từ dự án #1 và sửa sau mỗi dự án |

### 2.2 Production engineering ngoài LLM 🔴 (M3.2)
- **Google SRE Book** (free, sre.google) — CHỈ 3 chương: SLO, monitoring golden signals, postmortem culture. Map thẳng vào failover 4 cấp đã có của quán.
- **OWASP Top 10** + **OWASP Top 10 for LLM Applications** — học kỹ; đây là tài liệu khách enterprise sẽ hỏi "anh có biết không" và đa số freelancer VN không biết → điểm khác biệt giá.
- 2 skill có sẵn trong máy: `agent-skills-observability-and-instrumentation` + `agent-skills-security-and-hardening` — chạy chúng trên chính codebase Kissaten như bài lab.
- Sản phẩm học: **checklist "AI feature production-ready"** phiên bản của mình (log gì, alert gì, secret ở đâu, eval gate nào, chi phí trần) — thứ phân biệt $40/h và $120/h, nhắc lại từ career-roadmap.

### 2.3 Computer vision thực dụng 🟡 (M3.3)
- Ultralytics YOLO docs (đã có yolov8n.pt trong repo) + Roboflow blog cho annotation/dataset. Mức: dùng-tinh chỉnh-đo accuracy, KHÔNG học lý thuyết deep learning (đúng luật tầng Model = ⚪ của file learning).
- Riêng **privacy camera** 🔴: quy định camera nơi công cộng VN + nguyên tắc ẩn danh hóa (lưu vector, không lưu mặt) — vì bán tính năng này mà nói sai luật là mất khách + rủi ro thật. Nguồn: nghị định bảo vệ dữ liệu cá nhân VN (PDPD) — đọc phần áp cho doanh nghiệp nhỏ, cộng 1 câu hỏi xác nhận với kế toán/luật sư quen.
- Lab = hoàn thiện dual_camera_ai thành case study có số (đã ghi ở career-roadmap M3.3).

### 2.4 Tiếng Anh làm việc 🔴 (module ẩn quyết định giá của cả bậc)
- **Duy nhất được phép chi tiền khóa học: 1-1 online (italki/Cambly) 2 buổi/tuần × 30 phút**, chủ đề CHỈ là: mock discovery call, mock weekly update, đọc to bài viết của mình. Không học ngữ pháp tổng quát.
- Nghe hàng ngày thay giải trí: **Latent Space podcast** (một công đôi việc: tiếng Anh + tin AI ngành — nguồn theo dòng thời sự tốt nhất cho B3) + **Lenny's Podcast** (từ vựng product/business).
- Viết: 3 bài dev.to đã cam kết ở future-niches — AI sửa ngữ pháp, KHÔNG để AI viết hộ ý; mỗi bài tự đọc to 1 lần, thu âm.
- Đo: tháng 10 làm 1 mock discovery call 30 phút với AI đóng vai khách khó (chấm theo rubric: hiểu yêu cầu, hỏi lại đúng, chốt next step) — pass mới nhận khách quốc tế thật.

---

## PHẦN 3 — Bậc 4 (học tháng 12+ · chỉ khi Gate 90 đạt)

| Module | Tài liệu chính (1/chủ đề) | Mức |
|---|---|---|
| SaaS metrics + tài chính sản phẩm (M4.5) | **SaaS Metrics 2.0** — David Skok (forentrepreneurs.com, free) + **The SaaS Playbook** — Rob Walling (viết cho bootstrapper 1 người, không phải VC-startup) | 🔴 |
| Multi-tenant + trần hệ thống (M4.1) | Không sách. Tự viết tài liệu "trần GAS/Sheets: quota nào vỡ trước, ở bao nhiêu tenant" bằng số đo thật + 1 buổi đọc docs quota Google. Phương án migrate: skill `cloudflare`/`durable-objects` đã cài local | 🔴 |
| Billing + dunning (M4.2) | Học từ chính SePay docs + 1 bài dài về dunning (Baremetrics/ProfitWell blog) — khái niệm chuẩn: nhắc phí 3 lần, grace period, cắt mềm | 🟡 |
| Support ops (M4.3) | Intercom/Help Scout guides (free) — chỉ lấy: phân hạng ticket, macro trả lời, đo first-response-time. Còn lại tự động hóa bằng agent của mình | 🟡 |
| Đại lý/kênh (M4.4) | Không sách hay. Học từ 1 người thật: mời 1 đại lý phần mềm (MISA/KiotViet) cấp huyện cà phê 2 buổi — hỏi hoa hồng, vì sao bỏ hãng, cái gì làm họ chăm bán. Giáo trình đào tạo đại lý = SOP B1 đóng gói | 🔴 |

---

## PHẦN 4 — Kiến thức ngành dọc "VỪA ĐỦ" (Bậc 5a · công thức 20 giờ)

> Nguyên tắc bạn đặt ra — chuẩn: **phục vụ nhu cầu của ngành, không làm ngành đó.**
> Nghĩa là: KHÔNG học nha khoa/spa/kỹ thuật ô tô. CHỈ học **dòng tiền + dòng khách + ngôn ngữ** của ngành.
> Công thức 20 giờ dưới đây áp cho BẤT KỲ vertical nào (nha, spa, garage, gym, BĐS nếu sống lại):

**Giờ 1–8 — Ngồi trong cơ sở của insider (bắt buộc, không thay được):**
vẽ flow từ lúc khách biết đến → đặt lịch → đến → trả tiền → quay lại. Đánh dấu chỗ nào GHI TAY,
chỗ nào QUÊN → mỗi chỗ quên = 1 tính năng bán được. Đếm: 1 khách đáng bao nhiêu tiền/năm,
mất 1 khách quen vì quên nhắc = mất bao nhiêu.

**Giờ 9–12 — Học ngôn ngữ ngành:** lập bảng **50 thuật ngữ** người trong ngành dùng hàng ngày
(nha: tái khám, cạo vôi, chụp phim, tủy, implant, bảo hành phục hình; spa: liệu trình, buổi lẻ,
gói, cọc giữ lịch, khách nợ buổi; garage: cấp bảo dưỡng, km định kỳ, sổ bảo dưỡng, báo giá phụ tùng).
Nói sai thuật ngữ = lộ người ngoài = mất niềm tin ngay câu thứ 2. Nguồn: nghe lỏm ở cơ sở insider + group FB ngành.

**Giờ 13–16 — Trinh sát phần mềm đương nhiệm:** dùng thử/xem demo 2–3 phần mềm quản lý ngành đó
đang bán ở VN + **đào mỏ lời chê**: đọc hết review, comment trong group FB ngành than về phần mềm.
Lời chê của họ = spec sản phẩm của mình. (Đúng cách đã làm với KiotViet ở ngách F&B.)

**Giờ 17–20 — Phỏng vấn 5 chủ cơ sở KHÔNG phải insider** (insider giới thiệu), dùng đúng kỹ thuật
The Mom Test của M1.1: chỉ hỏi quá khứ và hiện tại, không pitch. Đầu ra: bảng xếp hạng 3 cái đau
theo tiền mất/tháng.

**Điểm dừng học (quan trọng):** khi trả lời được 5 câu này là ĐỦ, dừng lại và build:
1. Một khách của ngành này đáng bao nhiêu tiền/năm? 2. Họ mất khách nhiều nhất ở khâu nào?
3. Ai trong tiệm là người sẽ dùng phần mềm hàng ngày (chủ hay lễ tân)? 4. Họ đang trả bao nhiêu
cho phần mềm/quảng cáo? 5. Mùa nào đông, mùa nào vắng?
Học quá 5 câu này = đang trốn việc bán bằng cách học.

**Bậc 5b (đào tạo) — 2 tài liệu:** **Design for How People Learn** — Julie Dirksen (thiết kế bài học
cho người lớn, thực dụng) + kho bài viết free của **Wes Kao** (cohort-based course: nhịp tuần,
tỷ lệ hoàn thành, engagement). Cộng đồng trả phí: **The Business of Belonging** — David Spinks. Chỉ đọc khi trigger 5k follower bật.

---

## PHẦN 5 — Bậc 6 (2027+ · đọc khi tín hiệu cầu bật)

- **MCP spec** đọc ở mức đặc tả (modelcontextprotocol.io/specification) — W2–W3 lộ trình LLM mới học mức dùng; B6 cần mức "giải thích được vì sao spec chọn thiết kế đó".
- **OAuth 2.0 Simplified** — Aaron Parecki (free online, oauth.com) — học kỹ; giữ credential người khác là trách nhiệm pháp lý, không chỉ kỹ thuật.
- **Working in Public** — Nadia Eghbal + **opensource.guide** (GitHub) — vận hành dự án open-source, xử người dùng free đòi hỏi.
- **Diátaxis** (diataxis.fr) — khung viết docs 4 loại (tutorial/how-to/reference/explanation); docs là sản phẩm ở B6. Áp thử ngay từ B4 khi viết SOP đại lý — rehearsal miễn phí.

---

## PHẦN 6 — Kiến thức nền chạy ngầm suốt lộ trình (không có "tuần học", chỉ có thói quen)

| Thứ | Thói quen | Nguồn |
|---|---|---|
| Tin AI ngành (để nói chuyện với khách B3+ không lạc hậu) | 30 phút/tuần, cố định sáng thứ 2 | Anthropic engineering blog + Simon Willison blog + Latent Space. ĐỦ. Không doomscroll Twitter AI |
| Viết rõ ràng (nền của bán hàng, docs, dạy học) | Mỗi tuần 1 bài log học công khai (đã cam kết ở B2) | Đọc 1 lần: **On Writing Well** — Zinsser, phần I–II |
| Tài chính cá nhân người tự doanh | 1 buổi/tháng chốt: thu, chi, thuế phải nộp, quỹ 6 tháng | Kế toán quen (mục 1.3) — thuê, không tự học sâu |
| Năng lượng (rủi ro thật: quán + học + bán = 3 việc) | Lịch tuần có ô NGHỈ như có ô học; tuần nào ngủ <6h×3 ngày → cắt module học, không cắt ngủ | Không cần sách. Cần kỷ luật lịch |

---

## PHẦN 7 — Ghép lịch tổng (không đè 8–10h/tuần của lộ trình LLM)

```
T7–T8/2026 : The Mom Test (trước tuần 2 plan 90 ngày) → 10 call → $100M Offers → sửa landing
             Zalo/VietQR/SePay đọc lại như người dạy · faq-nd70.md · 1 buổi kế toán
T8–T9      : SPIN khung · swipe file video · cây chẩn đoán máy in · (song song W1–W4 LLM)
T9–T10     : SRE 3 chương + OWASP LLM · bắt đầu tiếng Anh 1-1 2 buổi/tuần · (song song W5–W8)
T10–T11    : Consulting pack (Value-Based Fees, Trusted Advisor, SOW template) · mock call gate
T12+       : SaaS Playbook + Skok (chỉ khi Gate 90 đạt) · phỏng vấn đại lý MISA/KiotViet
2027 Q1+   : Công thức 20 giờ ngành dọc (chỉ khi có insider ký) · Dirksen/Wes Kao (chỉ khi 5k follower)
2027 H2+   : OAuth Simplified · Working in Public · Diátaxis (chỉ khi tín hiệu B6 bật)
```

**Tự kiểm mỗi quý (cùng nhịp review career-roadmap):** mỗi module đã "học" phải chỉ ra được
1 artifact nó đẻ ra (script, SOP, checklist, hợp đồng, số đo). Module không có artifact = chưa học,
hoặc học thừa — cả hai đều sửa bằng cùng một cách: quay lại làm.
