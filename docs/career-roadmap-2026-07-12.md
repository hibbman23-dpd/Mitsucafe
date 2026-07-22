# Lộ trình nghề nghiệp — hợp nhất mọi plan thành một con đường
**Lập: 2026-07-12 · Bộ ba tài liệu: file này (NGHỀ) + `monetization-master-plan-2026-07-12.md` (TIỀN 90 ngày) + `future-niches-roadmap-2026-07-12.md` (NGÁCH 6–24 tháng)**

> Câu hỏi file này trả lời: mọi plan cũ + mới xếp thành lộ trình nghề từ dễ đến khó thế nào,
> và ở mỗi bậc phải **nắm chắc kiến thức gì** để đứng trước khách hàng như người chuyên nghiệp —
> vì kinh doanh của DPD chính là bán chuyên môn của DPD, nắm vững nghề = doanh thu tăng.
>
> **Cách dùng:** mỗi bậc có (1) plan nào gộp vào, (2) vai nghề + khách hàng, (3) kiến thức đào sâu
> chia module — mỗi module ghi rõ *học trên sản phẩm thật nào* và *tiêu chí nắm chắc*,
> (4) câu hỏi khách sẽ hỏi — trả lời trôi chảy = đạt chuẩn chuyên nghiệp, (5) điều kiện lên bậc.
> Nguyên tắc học xuyên suốt (từ LEARNING_LLM_ENGINEERING.md): **"why" trước code, học trên
> sản phẩm thật, không học chay.**

---

## Kiểm kê: mọi plan về đâu

| Plan (cũ + mới) | Số phận | Bậc |
|---|---|---|
| Hệ Kissaten đang chạy (GAS event bus, tem in, Zalo, loyalty, KDS) | NỀN của tất cả | B0 |
| Monetization plan 90 ngày — Track A "Quán Tự Chạy" | CORE hiện tại | B1 |
| digital-product-plan.md (Skill Pack + OS) | Bị nuốt vào Track A/C | B1 |
| growth-os-creator-plan.md | Thành Track B content, sau nuôi B5 | B1→B5 |
| future-features-plan.md (9 đề xuất, A1 HĐĐT) | A1 thành mồi NĐ70 của B1; còn lại vào PARKING-LOT | B1 |
| LEARNING_LLM_ENGINEERING.md (harness+loop 8 tuần từ 28/07) | Xương sống chuyển bậc | B2 |
| cafe-insight subagent + hermes-self-improving-insight | Portfolio kỹ thuật đầu tiên | B2–B3 |
| Camera AI (dual_camera_ai, customer_reid, YOLO) | Portfolio + tính năng premium sau này | B3 |
| Ngách 2A fractional AI engineer | Vai nghề chính | B3 |
| Ngách 2B SaaS hóa + đại lý; master-workflow-v3 (multi-branch, HQ rollup) | Vai nghề chính | B4 |
| Ngách 2C vertical 2 (nha/spa/garage) | Vai nghề chính | B5 |
| Ngách 2D đào tạo; phim Tam Mật + Higgsfield + taste-clipper + creative-design-director | Kỹ năng sản xuất nội dung nuôi B1-Track B, thành nghề ở B5 | B5 |
| mcp-connectors-plan.md (SePay MCP...) + ngách 2E | Vai nghề đỉnh thang | B6 |
| real-estate-ai-agents-plan.md | Chỉ sống lại như một ứng viên của B5 nếu có insider | B5 (điều kiện) |
| kaeru-bridge | CHẾT (post-mortem giữ). Library 43 test chờ bot API — có thể tái sinh ở B6 | — |
| Resolve+Higgsfield plugin | PARKED — chờ quyết mua Studio, không nằm trên thang nghề | — |

Một đường kể chuyện xuyên suốt — mỗi bậc là câu trả lời cho câu hỏi khó hơn của thị trường:
```
B0 "Tự động hóa quán MÌNH được không?"        → đã trả lời XONG
B1 "Làm được cho quán NGƯỜI KHÁC không?"       → đang trả lời (90 ngày)
B2 "Hiểu SÂU cái mình làm không, hay chỉ vibe?" → học có chủ đích
B3 "Doanh nghiệp lạ, bài toán lạ — làm được không?" → nghề kỹ sư thật
B4 "Vắng mặt mà hệ vẫn chạy cho 50+ khách không?"  → nghề chủ sản phẩm
B5 "Dạy lại + nhân bản sang ngành khác được không?" → nghề chuyên gia
B6 "Xây nền cho NGƯỜI KHÁC build được không?"       → nghề kiến trúc sư
```

---

## BẬC 0 — Chủ quán tự động hóa (ĐÃ ĐẠT — tài sản, không phải việc)

Vai: người vận hành hệ mình tự build. Giá trị: **proof không ai mua được bằng tiền.**
Kiến thức đã có mà đa số "dân AI" không có: vận hành F&B thật (ca kíp, hao hụt, két, khách quen),
event-driven architecture bản năng (8 kênh → GAS bus → Sheets → tem/Zalo/Telegram), giới hạn
thực tế của GAS/Sheets/OAuth (bài học 403 chu kỳ 7 ngày = kiến thức xương máu).
**Việc duy nhất ở bậc này:** tiếp tục vận hành + log số liệu sạch — mọi bậc trên đều rút proof từ đây.

---

## BẬC 1 — Người bán giải pháp đóng gói (0–3 tháng · DỄ NHẤT vì nguyên liệu có sẵn 100%)

**Plan gộp:** monetization plan Track A/B/C · digital-product-plan · growth-os-creator (phần content) · future-features A1.
**Vai:** người setup "Quán Tự Chạy" cho quán khác. **Khách:** chủ quán F&B VN. **Tiền:** 4–6tr/setup + 300–500k/tháng, đích 10 quán + 4tr MRR.

### Kiến thức đào sâu (5 module)

**M1.1 — Bán hàng & tâm lý chủ quán nhỏ** *(khó nhất bậc này với DPD — người build giỏi thường trốn vào code)*
- Học: khung bán consultative (SPIN rút gọn: hỏi tình huống → đau → hệ quả → giá trị); xử lý phản đối; định giá theo giá trị (không theo giờ công); tâm lý "sợ công nghệ" của chủ quán 40+.
- Học trên sản phẩm thật: 10 cuộc call tuần 2 của plan 90 ngày = phòng lab. Ghi âm, nghe lại, chấm mình.
- Tiêu chí nắm chắc: nghe 3 câu than của chủ quán → gọi đúng tên cái đau + nói được mất bao nhiêu tiền/tháng vì nó; chốt giá không giảm >10% mà không run.

**M1.2 — Nghiệp vụ triển khai đa quán (multi-tenant thủ công)**
- Học: tách config khỏi code triệt để (CONFIG sheet); quy trình clone-deploy GAS sạch (ops/gas_push.py, không clasp); quản lý N spreadsheet + N deployment không lẫn; backup/restore từng tenant.
- Học trên: task template hóa + new_tenant.py (§4.3 plan 90 ngày) — chính là bài tập lớn.
- Tiêu chí: dựng quán demo mới ≤2h chỉ bằng checklist, không sửa code; giải thích được cho khách "dữ liệu quán anh nằm riêng ở đâu, ai xem được".

**M1.3 — Hệ sinh thái thanh toán + nhắn tin VN (Zalo OA, VietQR, SePay, thiết bị in)**
- Học: vòng đời Zalo OA (đăng ký, xác thực, phí, template message, rate limit); VietQR chuẩn EMVCo; webhook bank (SePay) đối soát; ESC/POS + Xprinter troubleshooting (giấy, khổ tem, driver).
- Học trên: đã chạy hết ở quán mình — giờ học đến mức **xử lý được khi hỏng ở quán người khác, qua điện thoại**.
- Tiêu chí: khách gọi "tem không in nữa" → chẩn đoán đúng lớp lỗi (điện/mạng/poller/GAS/queue) trong 5 phút bằng câu hỏi, không cần đến nơi. Viết được cây chẩn đoán này ra giấy (tái dùng offline-failover.md).

**M1.4 — Pháp lý thuế hộ kinh doanh + NĐ70 (mức tư vấn viên, không phải kế toán)**
- Học: NĐ70/2025 áp cho ai, mốc nào, máy tính tiền kết nối thuế là gì; bỏ thuế khoán 2026 nghĩa là hộ phải ghi chép gì; ranh giới mình (setup + tích hợp MISA/VNPT) vs kế toán/nhà cung cấp HĐĐT.
- Tiêu chí: trả lời 10 câu hỏi NĐ70 thường gặp của chủ quán không ấp úng, VÀ biết chính xác câu nào phải nói "cái này anh/chị hỏi kế toán" — nói đúng lúc "tôi không phải người trả lời việc này" chính là chuyên nghiệp.

**M1.5 — Content bán hàng video ngắn** *(nuôi Track B, tái dùng kỹ năng Higgsfield/film đã có)*
- Học: hook 2 giây, cấu trúc video demo 60–90s, đọc số liệu (retention, view→inbox rate) để sửa content thay vì đoán.
- Tiêu chí: tự quay-dựng-đăng 2 video/tuần ≤3h tổng; sau 10 video chỉ được ra nói được video nào ra lead vì sao.

### Câu khách hỏi — trả lời trôi = đạt chuẩn
"Mất mạng thì sao?" (→ failover 4 cấp, kể vanh vách) · "Dữ liệu của tôi ai giữ?" · "Khác gì KiotViet, tôi đang dùng rồi?" · "Hư ai sửa, anh bận thì sao?" · "Quán tôi phải xuất hóa đơn điện tử không?"

**Lên B2 khi:** Gate 30 ngày đạt (≥3 khách trả tiền) và roadmap học 28/07 đã khởi động.

---

## BẬC 2 — Nền kỹ sư LLM thật (tháng 1–4, SONG SONG B1 · khó vừa)

**Plan gộp:** LEARNING_LLM_ENGINEERING.md (8 tuần, 28/07) · cafe-insight · hermes-self-improving-insight.
**Vai:** vẫn bán B1 ban ngày, đêm chuyển từ "vibe coder" thành người **giải thích được tại sao hệ mình chạy**. Bậc này không ra tiền trực tiếp — nó là vé vào B3 (nơi giá nhảy lên $/giờ).

### Kiến thức đào sâu (4 module — bám roadmap học đã có, đây là phần "why")

**M2.1 — LLM fundamentals:** token hóa (learning/week1/count_tokens.py có sẵn), context window & cache, sampling (temperature/top-p), tại sao model ảo giác, giá tiền = token → thiết kế prompt rẻ. Tiêu chí: giải thích cho người không biết code "vì sao AI bịa" trong 2 phút — đây cũng chính là câu khách B1 hay hỏi.

**M2.2 — Harness & loop engineering** (trọng tâm roadmap): agent loop là gì (LLM + tool + vòng lặp + stop condition), tool design, error handling & retry, context management khi hội thoại dài, khi nào subagent. Học trên: chính các skill cafe-manager + subagent cafe-insight đang chạy — mổ xẻ lại chúng, viết lại 1 cái từ đầu không nhìn mẫu. Tiêu chí: vẽ được sơ đồ vòng đời 1 request qua harness của mình; debug agent kẹt loop trong 15 phút có phương pháp (systematic-debugging, không đoán mò).

**M2.3 — RAG & đánh giá (eval):** chunking, embedding, retrieval, vì sao RAG thất bại (retrieval kém ≠ generation kém — đo tách); xây bộ eval nhỏ trước khi xây tính năng. Học trên: port cafe-insight sang Hermes+Gemma4 local (brief sẵn ở docs/hermes-self-improving-insight-brief.md) — dự án học hoàn hảo: local model, RAG thật, dữ liệu quán thật. Tiêu chí: bộ eval ≥30 câu cho cafe-insight, nói được số: "bản mới tốt hơn bản cũ X% trên bộ đo của tôi".

**M2.4 — Local models & trade-off:** chạy Ollama/Gemma (đã có kinh nghiệm 3 root-cause fix), lượng tử hóa là gì, khi nào local thắng API (privacy/chi phí/offline) — khách VN RẤT hay hỏi "dữ liệu tôi có bị gửi đi đâu không", trả lời sâu câu này = điểm cộng chuyên nghiệp khổng lồ. Tiêu chí: bảng so sánh local vs API cho 3 use-case quán, số đo tự chạy chứ không chép mạng.

**Sản phẩm phụ bắt buộc của B2 (nối sang B3):** 3 bài viết tiếng Anh kỹ thuật (đã ghi trong future-niches §2A) + repo GitHub sạch. Mỗi tuần học = 1 bài log công khai. Tiếng Anh kỹ thuật là module ẩn của bậc này — viết bằng được, có AI sửa, nhưng ý là của mình.

**Lên B3 khi:** xong 8 tuần + eval cafe-insight chạy + 3 bài đăng công khai + Gate 90 B1 không sụp.

---

## BẬC 3 — Fractional AI Engineer (tháng 4–10 · khó: lần đầu bán chuyên môn cho người lạ)

**Plan gộp:** ngách 2A · camera AI (portfolio) · phần kỹ thuật cafe-insight.
**Vai:** kỹ sư AI thuê ngoài theo dự án/ngày. **Khách:** công ty SG/US remote ($40–60/h khởi điểm) + doanh nghiệp VN (gói 15–40tr/dự án). **Đây là bậc thu nhập/giờ nhảy vọt** — thị trường gap 3,2:1 đang trả premium cho đúng kỹ năng B2.

### Kiến thức đào sâu (4 module)

**M3.1 — Nghề consulting (khác hẳn bán package B1):** discovery call → viết SOW (phạm vi, deliverable, tiêu chí nghiệm thu, số vòng sửa); định giá theo giá trị; nói KHÔNG với scope creep; viết weekly update khách đọc 1 phút hiểu. Học trên: 2 dự án đầu nhận giá mềm đổi lấy quyền làm case study. Tiêu chí: SOW mẫu của riêng mình; kể được 1 lần từ chối yêu cầu ngoài phạm vi mà khách vẫn vui.

**M3.2 — Production AI engineering (nâng M2.2 lên chuẩn giao cho người khác):** observability (log gì để 3 tháng sau debug được — skill observability đã có trong kho), cost control per-request, security cơ bản cho agent (prompt injection, quyền tool, secret không vào code — luật sẵn trong CLAUDE.md, giờ giải thích được cho khách vì sao), CI/eval gate trước deploy. Tiêu chí: checklist "AI feature sẵn sàng production" của riêng mình, đem ra dùng được với mọi khách — đây chính là thứ phân biệt $40/h với $120/h.

**M3.3 — Computer vision thực dụng** *(điểm khác biệt hồ sơ — ít fractional engineer nào có)*: YOLO detect/count người, re-identification (ops/customer_reid.db đang chạy), privacy khi camera (luật + đạo đức, nói được với khách). Học trên: hoàn thiện dual_camera_ai của quán thành case study "đếm khách, đo giờ cao điểm, khách quen quay lại". Tiêu chí: video demo + số accuracy tự đo + 1 bài viết tiếng Anh.

**M3.4 — Tiếng Anh làm việc:** call 30 phút với khách nước ngoài không sợ; viết proposal/email chuẩn. Cách luyện rẻ: mọi buổi học B2 tự ghi note tiếng Anh; tuần 2 buổi mock call với AI đóng vai khách khó tính. Tiêu chí: qua 1 discovery call thật bằng tiếng Anh và chốt được deal đầu.

### Câu khách hỏi — trả lời trôi = đạt chuẩn
"How do you evaluate quality?" (→ M2.3 eval) · "What happens when the model hallucinates in production?" · "API hay self-host, chi phí thế nào ở scale của tôi?" · "Bảo mật dữ liệu của chúng tôi ra sao khi qua LLM?" · "Vì sao thuê anh thay vì agency?"

**Lên B4 khi:** 3 dự án trả tiền + 2 testimonial công khai + rate đạt ≥$60/h HOẶC B1 đạt Gate 90 (10 quán) → ưu tiên B4.

---

## BẬC 4 — Chủ sản phẩm SaaS vertical (tháng 6–14 · khó: hệ phải chạy khi mình vắng mặt)

**Plan gộp:** ngách 2B · master-workflow-v3 (multi-branch, HQ rollup — thiết kế có sẵn, giờ thành sản phẩm) · phần premium của camera AI.
**Vai:** từ "người setup từng quán" thành "chủ nền tảng nhiều quán tự đăng ký". **Khách:** 50–200 quán + 3–10 đại lý tỉnh. **Tiền:** MRR là vua; đích năm: 50 quán = 20tr MRR, xa hơn 350tr MRR trần ngách.

### Kiến thức đào sâu (5 module)

**M4.1 — Kiến trúc multi-tenant nghiêm túc:** cô lập dữ liệu (1 sheet+1 GAS/tenant đã chốt — giờ hiểu trade-off vs DB chung để TỰ QUYẾT khi nào GAS/Sheets hết trần và migrate đi đâu: Supabase/CF Workers đã có nền CF); vá GAP location_id report (đã ghi trong memory multibranch — vá trước CN2); HQ rollup + health dashboard toàn hệ (mở rộng gas_health.py). Tiêu chí: chịu tải giả lập 200 tenant; tài liệu "trần hệ thống hiện tại + kế hoạch migrate" viết xong TRƯỚC khi đụng trần.

**M4.2 — Billing + vòng đời khách:** thu tiền định kỳ tự động (SePay webhook đối soát — ăn khớp plan MCP cũ), nhắc phí, cắt dịch vụ đúng cách khi khách ngừng trả (không giữ dữ liệu làm con tin — chuyên nghiệp), hoàn tiền. Tiêu chí: 0 khách nào phải nhắn tay đòi phí; churn đo được hàng tháng.

**M4.3 — Support ops có hệ thống:** SLA phân hạng, kho FAQ video, đo giờ support/khách (mục tiêu <1h/tháng), tự động hóa cấp 1 bằng chính agent mình build (ăn điểm marketing: "hệ support của tôi cũng là AI tôi bán"). Tiêu chí: 80% ticket đóng không cần mình đích thân.

**M4.4 — Quản trị kênh đại lý:** tuyển-đào tạo-trả hoa hồng đại lý tỉnh (30–40% setup + 20% MRR theo future-niches); tài liệu đào tạo đại lý = SOP B1 đóng gói lại — **kiến thức B1 giờ thành giáo trình, đây là lý do phải học chắc từ đầu**. Tiêu chí: 1 đại lý đầu tiên tự setup 1 quán không cần mình can thiệp, chỉ nghiệm thu.

**M4.5 — Tài chính sản phẩm:** đọc P&L của chính mình: CAC, LTV, churn, MRR growth; quyết giá bằng số. Tiêu chí: báo cáo tháng 1 trang, tự làm, tự hiểu, dám tăng giá khi số bảo tăng.

**Lên B5 khi:** 30+ quán + support <1h/khách/tháng + 1 đại lý chạy độc lập.

---

## BẬC 5 — Chuyên gia ngành + người dạy (tháng 9–18 · khó: nhân bản chính mình)

**Plan gộp:** ngách 2C (vertical 2: nha/spa/garage — real-estate-ai-agents chỉ sống lại nếu có insider BĐS) · ngách 2D (đào tạo) · growth-os-creator (giờ audience đủ lớn) · toàn bộ kỹ năng film Tam Mật/Higgsfield/creative-design-director (production value cho khóa học + thương hiệu cá nhân).

**Hai nhánh chạy chọn lọc (không bắt buộc cả hai):**

**Nhánh 5a — Vertical thứ 2.** Kiến thức mới: domain ngành chọn (học qua insider partner — điều kiện bắt buộc, không insider không vào); nghiệp vụ lịch hẹn/nhắc tái khám (map từ order flow: 60% tái dùng theo future-niches §2C); voice AI tiếng Việt (theo dõi STT/TTS mỗi quý, build khi đủ tự nhiên). Tiêu chí nắm chắc: ngồi 1 tuần trong phòng khám/spa của insider, vẽ lại toàn bộ flow tiền + khách của họ trước khi viết dòng code nào — đúng thứ tự đã làm với quán mình.

**Nhánh 5b — Đào tạo.** Kiến thức mới: instructional design (mục tiêu học được đo → bài tập trên case thật → feedback loop); vận hành cohort (nhịp tuần, nhóm Zalo, tỷ lệ hoàn thành >60% — trung bình ngành khóa online <15%, hoàn thành cao = referral cao); community trả phí. Kỹ năng film/Higgsfield đã luyện qua Tam Mật thành lợi thế sản xuất: khóa học quay đẹp hơn 90% đối thủ. Tiêu chí: NPS cohort đầu ≥50; học viên đầu tiên tự setup được quán họ = bằng chứng dạy được.

**Câu khách hỏi bậc này:** "Anh có làm ngành tôi bao giờ chưa?" (5a — câu trả lời PHẢI là chuyện insider thật) · "Học xong tôi tự làm được thật không, hay lại phải thuê anh?" (5b — trả lời trung thực: được đến mức X, quá mức đó thì thuê).

**Lên B6 khi:** 1 nhánh chạy có lãi ổn + tổng thu nhập không còn phụ thuộc giờ công của mình >50%.

---

## BẬC 6 — Kiến trúc sư hạ tầng (12–24 tháng · khó nhất: xây cho người khác build)

**Plan gộp:** mcp-connectors-plan (SePay MCP = gap chính đã xác định) · ngách 2E · di sản kaeru-bridge (library 43 test tái sinh khi làm bot API) · toàn bộ kinh nghiệm eval/harness B2–B4 đóng gói thành công cụ.

**Vai:** người xây picks & shovels cho làn sóng agent VN: MCP connectors cho stack SME VN (SePay, MISA HĐĐT, Zalo OA, VietQR), bộ eval tiếng Việt, harness tooling. Open-source lấy danh tiếng (kéo ngược giá B3 lên $150+/h) + hosted/support trả phí.

**Kiến thức đào sâu:** MCP protocol ở mức spec (không phải mức dùng); OAuth2/security cho connector giữ credential người khác — trách nhiệm cao hơn hẳn giữ của mình; API design & versioning (breaking change làm vỡ hệ của NGƯỜI KHÁC); vận hành open-source (issue, PR review, release, community — chính là kỹ năng B4-support đổi ngữ cảnh); developer experience: viết docs cho dev — tài liệu là sản phẩm.

**Tiêu chí nắm chắc:** connector đầu tiên có ≥10 người dùng thật không quen biết; 1 PR từ người lạ được merge; talk/bài viết được cộng đồng dev VN dẫn lại.

**Điều kiện vào:** tín hiệu cầu thật (≥3 người lạ hỏi xin/mua connector — đã ghi trong future-niches). Không vào sớm: hạ tầng không có người dùng = plan chết đẹp nhất trong các loại plan chết.

---

## Bản đồ tổng + luật vận hành lộ trình

```
2026 H2   B1 ████████ (bán, 90 ngày)
          B2     ██████ (học 8 tuần, song song, từ 28/07)
2027 H1   B3        ████████ (fractional, 1–2 ngày/tuần)
          B4           ████████ (nếu Gate 90 đạt — ưu tiên hơn B3 khi phải chọn)
2027 H2   B5                ████████ (chọn 5a HOẶC 5b trước, không cả hai cùng lúc)
2028      B6                      ████████ (khi có tín hiệu cầu)
```

1. **Không quá 2 bậc active** ngoài vận hành quán (trùng luật future-niches).
2. **Không nhảy bậc.** Mỗi bậc là proof của bậc sau; nhảy cóc = bán không có bằng chứng.
3. **Kiến thức mỗi bậc có "kỳ thi" là khách hàng thật** — mục "câu khách hỏi" chính là đề thi. Tự kiểm mỗi tháng: bốc 5 câu của bậc đang đứng, trả lời to thành tiếng, ghi âm, tự chấm (hoặc đưa AI chấm).
4. **Mọi giờ học phải chảy qua sản phẩm thật đang bán.** Học không có đầu ra sản phẩm = giải trí.
5. **Review lộ trình mỗi quý** (khớp Gate 90 ngày + nhịp /mo-rong): bậc nào xong, bậc nào mở, plan nào trong bảng kiểm kê đổi số phận — sửa file này, không mở file mới.
