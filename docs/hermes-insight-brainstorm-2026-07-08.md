# Brainstorm — Hermes Self-Improving Insight: so sánh thị trường + nâng cấp + ý tưởng cạnh tranh

> Ngày: 2026-07-08 · Trả lời brief `docs/hermes-self-improving-insight-brief.md` (§6–§7)
> Trạng thái: brainstorm + phản biện — CHƯA build. Plan task-level ở §G.

---

## A. So sánh thị trường — 3 nhóm app có tính năng tương tự

### Nhóm 1 — POS Việt Nam (KiotViet, iPOS, MISA CukCuk, Sapo FnB, POS365)

| Tiêu chí | Họ có | Họ KHÔNG có |
|---|---|---|
| Báo cáo doanh thu, món bán chạy, dashboard | ✅ đầy đủ, biểu đồ đẹp | — |
| "AI" | Chatbot hỏi báo cáo (iPOS có trợ lý AI), gợi ý generic | Không học quán CỤ THỂ; câu trả lời quán nào cũng giống nhau |
| Self-improving | ❌ | Không nhớ gì giữa các phiên, không tích luỹ tri thức riêng của quán |
| Data | Cloud của HỌ | Chủ quán không sở hữu; lo lộ doanh thu (thuế, đối thủ, chủ mặt bằng) |
| Giá | Subscription ~200–500k/tháng, mãi mãi | Không có phương án trả 1 lần |
| Insight → hành động | ❌ chỉ show số | Không nối sang draft promo/post/menu action |

### Nhóm 2 — AI analytics quốc tế (Tenzo $150–400/tháng/điểm, 5-Out, Avero $400–1200/tháng)

- Forecasting ML thật (thời tiết, sự kiện, mùa vụ), độ chính xác cao, drill-down tốt.
- Nhưng: đắt gấp 20–50 lần ngân sách quán VN 1 điểm, tiếng Anh, đòi POS tích hợp chuẩn Mỹ/Âu, cloud SaaS, không hiện diện VN. Chính guide của ngành cũng nói: dưới 5 điểm bán thì "POS + Google Sheets là đủ" — tức phân khúc quán nhỏ bị họ BỎ TRỐNG có chủ đích.
- Học được gì từ họ: format forecast 3 tuần + gắn yếu tố ngoại cảnh (mưa Lâm Hà, lễ, vụ hoa); Avero mạnh audit-trail/loss-prevention → mình có sẵn WASTE_LOG + chốt ca, chỉ cần AI đọc.

### Nhóm 3 — Local LLM apps generic (AnythingLLM, Msty, Jan, Khoj, Letta/MemGPT, Mem0)

- Có RAG + memory + privacy, NHƯNG là công cụ trắng: không domain F&B, không workflow, khách phải tự setup, không có corpus vận hành quán.
- Đây là NGUYÊN LIỆU, không phải sản phẩm. Hermes package của mình = nguyên liệu nhóm 3 + tri thức nhóm 1&2 + kinh nghiệm quán thật.

### Gap chưa ai chiếm (= định vị)

**Domain cafe VN × local-first privacy × tự học theo quán cụ thể × trả 1 lần.** Không đối thủ nào đứng ở giao điểm này. Moat thật = corpus tri thức vận hành chưng cất từ quán thật (Mitsu) + vòng huấn luyện có kỷ luật — thứ không copy nhanh được bằng tiền.

---

## B. Nâng cấp WORKFLOW CHÍNH (insight runtime)

1. **Evidence-linked insight (bắt buộc).** Mọi kết luận phải kèm số gốc + nguồn (tab/row) + cỡ mẫu. Format chuẩn hoá trong system prompt: `[KẾT LUẬN] · [BẰNG CHỨNG n=…, nguồn=…] · [ĐỘ TIN cao/vừa/tín hiệu sớm]`. Lý do: Gemma4 12B local hallucinate nhiều hơn Claude cloud — luật "không số thì không nói" là hàng rào số 1. Nhóm 1&2 đều không có LLM-explained evidence kiểu này.
2. **Min-sample gate nhúng trong prompt.** n < ngưỡng (vd 30 giao dịch/pattern) → chỉ được nói "tín hiệu sớm", CẤM SCALE/KILL. Đây là bài học đã ghi trong lịch sử cafe-insight, giờ hard-code vào template.
3. **Insight ledger append-only** (tab INSIGHTS hoặc jsonl local): insight + ngày + trạng thái `đề_xuất/đã_làm/kết_quả`. Sau 2–4 tuần đo được "AI khuyên trúng bao nhiêu %". Track-record của chính AI = tính năng KHÔNG app nào trên thị trường có, và là proof bán hàng.
4. **Insight → action một chạm.** Mỗi insight gắn next-step nối vào skill sẵn có: draft `/promo`, draft `/post`, flag `/menu-eng`. Dashboard đối thủ dừng ở "cho xem số"; mình đi tới "đây là việc cần làm, draft sẵn rồi".
5. **Anomaly watch sáng.** So hôm qua vs baseline cùng-thứ-trong-tuần (4 tuần gần nhất), chỉ alert khi lệch > ngưỡng VÀ n đủ. Đẩy qua Telegram (pipeline Notify có sẵn). Chạy cron đêm trên Mac mini, không cần Hermes mở.
6. **Ask-your-data.** Tool cho Hermes: `search_kb` (RAG corpus) + `query_data` (đọc CSV export cục bộ của Sheets). **Tối đa 2 tools** — bug #3 (32 tool schema tràn context) cấm thêm nữa. Nếu phải chọn 1: `search_kb` trước, data trộn vào context lúc build prompt.
7. **"Nếu-thì" replay.** Trước khi khuyên, bắt kiểm tra pattern trên lịch sử: "giờ 15–17h thứ Ba yếu 6/8 tuần gần nhất" thay vì "thứ Ba có vẻ yếu". Rẻ (chỉ là prompt discipline + data đủ trong context), tác dụng lớn.
8. **Weekly digest đồng bộ curator 168h** (đã nhận ra trong brief §4): thứ Sáu `/tuan` tổng kết → cuối tuần curator consolidate → sáng thứ Hai AI mở màn "tuần rồi em học được gì". Nhịp cố định, thành nghi thức "họp tuần với AI".

---

## C. Nâng cấp WORKFLOW HUẤN LUYỆN (self-improving loop)

Trục chính: giải rủi ro `write_approval: false` (brief §4) mà không giết tính tự học.

1. **Staged memory: `quarantine → confirmed`.** Memory-fact/skill mới sinh vào trạng thái "thử việc", chỉ được dùng làm căn cứ khuyến nghị sau khi: (a) chủ duyệt 👍, HOẶC (b) pattern tái xác nhận ≥3 chu kỳ liên tiếp + đạt min-sample. Giữ `write_approval: false` cho fact quan sát thường (rẻ, vô hại); riêng **kết luận hành động** (bỏ món, đổi giá, kill campaign) bắt buộc qua người.
2. **Duyệt 1 nút 👍/👎 qua Telegram/Zalo.** Tái dùng đúng pattern taste-clipper đã build (👍/👎 → library): AI đặt câu hỏi ngắn "Em thấy combo X yếu thứ Ba 3 tuần liền — đúng không?", chủ bấm 1 nút = 1 label. RLHF-bình-dân, chi phí chủ quán ~10 giây/ngày. Không app đại trà nào có vòng human-feedback kiểu này.
3. **Decay / half-life cho pattern.** Mỗi memory gắn `valid_until` hoặc weight giảm dần theo mùa (mùa mưa Lâm Hà ≠ mùa khô, vụ hoa ≠ ngày thường). Curator tuần prune cái không được tái xác nhận. Chống "học một lần tin mãi mãi".
4. **Counter-evidence tracking.** Memory ghi cả `lần_đúng/lần_sai`. Sai 2 lần liên tiếp → tự rớt về quarantine. Pattern phải TỰ BẢO VỆ vị trí của nó bằng data mới.
5. **Golden-question eval harness.** ~20 câu hỏi chuẩn TIẾNG VIỆT + đáp án kỳ vọng (tính từ data thật). Chạy tự động sau mỗi: curator run / đổi Modelfile / đổi corpus. Điểm tụt → alert Telegram. Không sản phẩm đại trà nào eval lại chính nó sau mỗi lần "học".
6. **Snapshot + rollback.** Thư mục memory/skills của Hermes = git repo; commit trước mỗi curator run. Học nhầm → `git revert`. "Nút undo cho não AI" — rẻ, cứu mạng, và là câu chuyện bán hàng dễ hiểu.
7. **Nhật ký học tập người-đọc-được.** Mỗi tuần AI viết 5–10 dòng tiếng Việt thường: "Tuần này em học được…, em bỏ niềm tin cũ về…". Vừa là cơ chế kiểm soát (chủ đọc lướt là biết AI đang nghĩ gì), vừa là **content hook cực mạnh** cho fanpage/khoá học (screenshot đăng bài — đúng chiến lược "local AI = content hook" trong digital-product-plan).

---

## D. Ý tưởng khác biệt — app đại trà chưa có / ít có

1. **Định vị "nhân viên học việc AI", không phải "phần mềm báo cáo".** Vòng đời nhân hoá: tháng đầu = thử việc (chỉ quan sát, hỏi, ghi nháp — chính là quarantine mode ở C.1 dưới lớp áo marketing); sau đó "lên chính thức". Onboarding gọi là "dạy việc". Toàn bộ cơ chế an toàn kỹ thuật trở thành narrative bán hàng tự nhiên.
2. **"Sổ tay quán" xuất được.** Toàn bộ tri thức AI học = file markdown khách SỞ HỮU, đọc được, in được, mang đi được. Pitch: "nghỉ dùng phần mềm vẫn giữ cuốn sổ về quán mình". Data lock-in NGƯỢC — SaaS không bao giờ dám cho, vì lock-in là mô hình của họ.
3. **Privacy tuyệt đối = điểm bán chính, không phải footnote.** "Số liệu doanh thu không rời khỏi máy ở quán bạn." Điểm đau thật của chủ quán VN (thuế, đối thủ, chủ mặt bằng nhìn doanh thu đòi tăng giá thuê). KiotViet/iPOS/CukCuk đều cloud — không đối thủ VN nào nói được câu này.
4. **Trả 1 lần, không phí tháng.** Local-first cho phép điều subscription-SaaS không làm được. Khớp ladder giá hiện có.
5. **`QUAN.yaml` — tổng quát hoá corpus (trả lời §6 câu 4).** Corpus 2 lớp:
   - `/core` — domain-general: công thức RFM, menu engineering Stars/Dogs, SCALE/KILL/ITERATE + ngưỡng confidence, attribution logic, SOP phân tích. Dùng chung mọi quán, đây là tài sản.
   - `/shop` — sinh tự động từ `QUAN.yaml` (1 file: tên quán, SKU list, giờ vàng, mùa vụ địa phương, brand voice, ngưỡng doanh thu) + sheet schema mapping của khách.
   - Cài khách mới = điền yaml + chạy script re-embed. Không viết lại corpus. Việc tách này làm NGAY từ v1 cho Mitsu (Mitsu chỉ là khách hàng số 0) — rẻ hơn nhiều so với tách sau.
6. **Benchmark ẩn danh cộng đồng** (nuôi tier community 200k/tháng): quán opt-in gửi chỉ số CHUẨN HOÁ (%, thứ hạng — không doanh thu tuyệt đối) → nhận lại "quán bạn top 30% tỷ lệ khách quay lại". Network effect mà local app thuần không có; opt-in nên không phản bội lời hứa privacy. Đây là lý do người ta trả 200k/tháng sau khi đã mua đứt.
7. **Track-record công khai của AI** (từ B.3): sau 3 tháng ở Mitsu có con số "AI khuyên 47 việc, 31 việc ra kết quả đo được" → không đối thủ nào có claim kiểu này, và nó tự sinh ra từ insight ledger.

---

## E. Trả lời 4 câu hỏi mở §6

**1. Cài đặt cho khách không rành kỹ thuật?**
3 phương án:
- (a) Script 1-lệnh khách tự chạy — rẻ, nhưng khách không rành SẼ kẹt (quyền macOS, RAM, Ollama version) → phá vỡ support model "không 1-1 free".
- (b) Build app riêng đóng gói Hermes+Ollama — sạch nhất nhưng vượt xa scope, thêm dependency, bịa ra sản phẩm mới.
- (c) **KHUYẾN NGHỊ: Done-With-You.** Mình cài (remote/tận nơi) bằng script chuẩn hoá nội bộ + checklist nghiệm thu. Khách nhận kết quả chạy được. Script 1-lệnh VẪN build — nhưng là công cụ giảm giờ công của MÌNH, không phải sản phẩm giao khách.
→ Khớp đúng vị trí ladder: **đây là phần lõi của tier Done-With-You +3.5tr** (Q4), đồng thời là content hook + "chương nâng cao" cho A/B. Không sinh sản phẩm thứ 3.

**2. License/anti-piracy local-first?**
Không xây anti-piracy. Lý do: thị trường ngách nhỏ, khách mục tiêu không rành kỹ thuật (không crack), giá trị thật nằm ở cài đặt + corpus update + support Zalo + benchmark cộng đồng — toàn thứ không copy được bằng cách chép file. Làm nhẹ 1 việc: nhúng tên quán vào corpus/config (watermark) để trace nếu file bị share. Biến local-first thành điểm bán (D.3), không phải điểm yếu.

**3. Ranh giới an toàn — AI tự quyết vs chủ duyệt?**
3 tầng:
- **Tầng 1 — tự do:** trả lời câu hỏi, nhắc việc (nhập kho, bảo trì), tổng hợp số, ghi nhận quan sát.
- **Tầng 2 — tự ghi, gắn nhãn "chưa xác nhận":** pattern quan sát vào quarantine (C.1), dùng nội bộ để hỏi lại chủ, chưa được làm căn cứ khuyến nghị mạnh.
- **Tầng 3 — bắt buộc duyệt:** mọi đề xuất đổi menu/giá/bỏ món/chạy campaign → chỉ tạo DRAFT + gửi chủ.
- **Bất biến:** AI local read-only với Sheets vận hành. Không bao giờ ghi ORDERS/MENU/PROMOTIONS — ghi chỉ vào không gian riêng của nó (memory, insight ledger, draft).

**4. Corpus tổng quát hoá?** → D.5 (`/core` vs `/shop` + `QUAN.yaml`), làm từ v1.

---

## F. Phản biện — giả định yếu / rủi ro brief chưa nêu

1. **RAM 16GB là rủi ro số 1.** Mac mini đã gánh print server + dispatcher 24/7. QAT 12B ~7GB + embedding model + context RAG dài + Hermes app: sát trần, và RAM/context từng chính là nguyên nhân bug cũ (§5 brief). Phải benchmark TRƯỚC khi cam kết kiến trúc; chuẩn bị kế hoạch B: chạy insight batch ngoài giờ bán, hoặc fallback `gemma4:4b-it-qat` cho tác vụ nhẹ.
2. **Tiếng Việt của Gemma4 12B chưa được eval.** Toàn bộ giá trị sản phẩm là insight tiếng Việt tự nhiên. Golden questions (C.5) phải là tiếng Việt và phải chạy NGAY ở P0 — nếu chất lượng Việt ngữ không đạt, cân nhắc Qwen (mạnh đa ngữ) trước khi đổ công vào corpus.
3. **Embedding model chưa chốt trong brief.** Đề xuất eval `bge-m3` (đa ngữ, tốt tiếng Việt) vs `nomic-embed-text` (nhẹ hơn). Tốn thêm RAM — gộp vào benchmark P0.
4. **Mắt xích thiếu lớn nhất: pipeline data Sheets → local.** Brief không nói data quán (Google Sheets trên cloud) xuống máy local bằng đường nào. Cần job export định kỳ (Apps Script → CSV/JSON đẩy về Mac mini, hoặc script pull bằng service account). Không có mắt xích này thì RAG chỉ có tri thức tĩnh, không có số liệu sống — "self-improving" thành khẩu hiệu.
5. **Quản lý kỳ vọng khách.** 12B local kém Claude cloud rõ rệt. Demo bán hàng phải bán "chăm chỉ + kín đáo + ngày càng hiểu quán" — không bán "thông minh nhất". Nếu demo bằng Claude rồi giao Gemma là tự phá uy tín.
6. **Dependency risk: Hermes là app bên thứ 3.** Config format đổi / project chết → sản phẩm bán cho khách chết theo. Giảm nhẹ: giữ toàn bộ tài sản (corpus, memory format, QUAN.yaml, eval) ở định dạng MÌNH kiểm soát, Hermes chỉ là runtime thay được; pin version Hermes khi cài cho khách.
7. **`creation_nudge_interval: 15` (nhắc tự viết skill mỗi 15 turn) có thể quá hăng** với data quán giai đoạn đầu còn mỏng → sinh skill rác nhanh hơn curator dọn. Cân nhắc tăng interval hoặc trỏ nudge vào quarantine (C.1).

---

## G. Plan task-level (không code — thứ tự thực thi cho session build)

| Phase | Việc | Gate qua phase sau |
|---|---|---|
| **P0 — Đo nền** | `ollama pull gemma4:12b-it-qat` · Modelfile mới giữ fix cũ (`reasoning_effort: none`) · benchmark RAM/tokens-per-sec trên Mac mini đang chạy đủ service · eval 10 câu tiếng Việt sơ bộ | RAM headroom ≥2GB khi full load · tiếng Việt đạt (nếu fail → eval Qwen trước khi đi tiếp) |
| **P1 — Data pipeline** | Script Python pull qua **Sheets API + Service Account read-only** (share view-only cho SA, xem H.2) · chạy 23h + retry 23:30/00:00 · snapshot CSV theo ngày (giữ N ngày cho replay B.7) · **freshness check**: row count + timestamp cuối vs hôm trước, lệch → alert Telegram | Data hôm qua có mặt local trước 7h sáng, tự động 7 ngày liền · giả lập pipeline chết 1 ngày → alert bắn đúng |
| **P2 — Corpus 2 lớp** | Tách cafe-insight.md → `/core` (domain-general) + `/shop` (Mitsu) · `QUAN.yaml` theo schema H.5 · script sinh `/shop` từ yaml · chọn + cài embedding model (bge-m3 vs nomic, đo RAM) | Re-embed toàn corpus < 10 phút, 1 lệnh |
| **P3 — RAG tool** | Thêm ĐÚNG 1 tool `search_kb` vào Hermes (nhớ bug #3: không bật lại 32 tools) · số liệu ngày trộn vào context lúc build prompt thay vì tool thứ 2 · **quarantine memory KHÔNG vào index RAG** (H.4) | 10 câu hỏi mẫu trả lời có evidence đúng nguồn |
| **P4 — Staged memory + gate** | Quarantine→confirmed cho memory/skill mới · phân tầng an toàn 3 tầng (E.3) · nút duyệt 👍/👎 Inline Keyboard → **webhook về CF Worker + KV, Mac mini pull outbound-only** (H.3, không Tunnel) · quarantine TTL adaptive + cap 30 mục (H.4) | Kết luận hành động không bao giờ auto-confirmed · Mac mini không mở port inbound nào |
| **P5 — Eval + rollback** | Golden questions 2 nhóm core/shop + câu canary "chưa đủ dữ liệu" (H.6) · đáp án nhóm shop TÍNH RUNTIME bằng script pandas · <90% → **freeze memory-write + alert**; core fail → auto-rollback snapshot · git-hoá thư mục memory/skills, commit trước curator run | Đổi corpus bừa 1 lần → eval bắt được regression · giả lập core fail → hệ tự rollback + freeze |
| **P6 — Weekly loop** | Đồng bộ `/tuan` (thứ 6) → curator 168h → digest "tuần này học được gì" sáng thứ 2 · anomaly watch sáng qua Telegram · insight ledger · **dead-man switch**: Worker cron alert nếu Mac mini im >24h (H.8) | Chạy trọn 2 tuần thật tại Mitsu không can thiệp tay |
| **P7 — Đóng gói DWY** | Script cài chuẩn hoá nội bộ (Hermes pin version + Ollama + corpus + QUAN.yaml) · checklist nghiệm thu · "sổ tay quán" export · watermark `shop_id` + fingerprint corpus (H.7 — KHÔNG PyArmor v1) · trang chào hàng theo ngôn ngữ outcome | Cài máy sạch < 2 giờ công |

Nguyên tắc xuyên suốt: Mitsu = khách hàng số 0 — mọi thứ build cho Mitsu phải đi qua `QUAN.yaml`/corpus-2-lớp ngay từ đầu, không hardcode rồi tách sau.

---

## H. Vòng góp ý 1 (2026-07-08) — đánh giá + quyết định

### H.2 Pipeline Sheets → local: Service Account pull ✅ (chốt, giải quyết F.4)

Góp ý đúng. Chốt + cải tiến:
- **Sheets API `spreadsheets.readonly`** thay vì Drive export — pull đúng tab (ORDERS, WASTE_LOG…), least-privilege, share view-only cho email SA. Khớp security model hiện có (không đụng tài khoản Google cá nhân).
- Pull 23h + retry 23:30/00:00. Snapshot CSV **theo ngày, giữ N ngày** — chính là nguyên liệu cho "nếu-thì" replay (B.7) miễn phí.
- **Rủi ro thật của pipeline là chết-im-lặng**, không phải chết-ồn-ào → freshness check (row count + max timestamp) mỗi sáng, lệch → Telegram alert. Gate P1 phải test cả nhánh fail.
- Cho khách DWY: đường "KiotViet/iPOS gửi CSV qua email" MONG MANH (format đổi theo version, parse email lỗi vặt) → **không nhận làm adapter v1**. Điều kiện tiên quyết DWY ghi thẳng vào hợp đồng: *"dữ liệu bán hàng phải về một Google Sheet"* (KiotViet/iPOS đều export được ra Sheets, hoặc quán đã có sẵn). SA pull là adapter DUY NHẤT v1; mapping cột lệch xử lý bằng `data_mapping` trong `QUAN.yaml`.

### H.3 Nút duyệt 👍/👎 qua Cloudflare Worker ✅ (chốt, sửa 1 điểm)

Góp ý đúng hướng — đã có Worker mitsu.cafe chạy sẵn, thêm route rẻ. **Sửa 1 điểm: bỏ nhánh Cloudflare Tunnel.** `cloudflared` là daemon chạy thường trực trên Mac mini — mâu thuẫn với chính lý do đề xuất (tiết kiệm RAM), lại mở đường inbound không cần thiết.

Luồng chốt (outbound-only tuyệt đối):
```
AI phát hiện insight → gửi Telegram sendMessage + Inline Keyboard (callback_data = insight_id)
Chủ bấm 👍/👎 → Telegram webhook → CF Worker (verify secret_token) → ghi KV: {shop_id}:{insight_id} = verdict
Mac mini: job sáng (hoặc mỗi giờ) GET Worker endpoint → nhận batch verdict → apply vào staged memory
```
- Mac mini **không mở port, không daemon thêm** — chỉ 1 request outbound/giờ. Duyệt vốn chỉ cần apply ở batch kế tiếp, độ trễ 1h vô hại.
- `callback_data` giới hạn 64 byte → chỉ nhét `insight_id`, nội dung tra ở local ledger.
- Thiết kế multi-tenant sẵn: KV key prefix `shop_id`, mỗi quán DWY 1 `chat_id` (cùng 1 bot) → 1 Worker phục vụ mọi khách, không thêm chi phí.

### H.4 TTL quarantine ✅ (chốt, sửa con số)

Góp ý đúng vấn đề (quarantine phình → loãng context). 3 chỉnh:
1. **TTL cố định 14 ngày là sai số học**: pattern chu kỳ TUẦN ("thứ Ba yếu") sau 14 ngày mới có 2 lần quan sát — chưa đạt ngưỡng tái xác nhận 3 chu kỳ (C.1) đã bị xóa. Chốt: `TTL = max(14 ngày, 3 × chu_kỳ_pattern)` — pattern ngày: 14 ngày; pattern tuần: ~5 tuần; pattern mùa: không TTL, chờ đúng mùa sau (dùng `valid_until` của C.3).
2. **Không hard-delete — archive** (curator có sẵn cơ chế archive). Pattern tái xuất sau khi bị archive = tín hiệu mạnh, đếm số lần "hồi sinh".
3. **Chặn triệt để nỗi lo loãng context: quarantine KHÔNG nằm trong index RAG.** Store riêng, chỉ `confirmed` mới được embed vào corpus truy hồi. Kèm cap cứng 30 mục quarantine, đầy → evict mục cũ nhất/ít bằng chứng nhất. Giới hạn ô nhiễm bằng cấu trúc, không chỉ bằng thời gian.

### H.5 `QUAN.yaml` schema ✅ (chốt, bổ sung field)

Cấu trúc đề xuất tốt, thêm field còn thiếu để đủ cho DWY + multi-tenant:

```yaml
schema_version: 1                # migration sau này
shop:
  id: "mitsu-lamha"              # khóa KV Worker + watermark (H.7)
  name: "Mitsu Cafe"
  location: "Lâm Hà, Lâm Đồng"
  timezone: "Asia/Ho_Chi_Minh"
  language: "vi"
  closed_days: []                # ngày nghỉ cố định
operating_rules:
  peak_hours: ["07:00-09:00", "15:00-17:00"]
  low_season: "Mùa mưa (T5–T10)"
  high_season: "Mùa hồng chín / vụ hoa"
data_source:
  type: "gsheet"                 # adapter duy nhất v1 (H.2)
  sheet_id: "..."
  tabs: ["ORDERS", "WASTE_LOG", "CUSTOMERS"]
data_mapping:
  revenue_col: "Tổng tiền"
  item_name_col: "Tên hàng hóa"
  timestamp_col: "Thời gian"
  category_col: "Nhóm"           # beverage/pastry/retail — luật stamp chỉ beverage
alert:
  telegram_chat_id: "..."
  revenue_drop_percent: 20
  waste_limit_vnd: 200000
analysis:
  min_sample_per_pattern: 30     # ngưỡng B.2, cho phép chỉnh theo quy mô quán
  quarantine_ttl_days: 14        # sàn TTL (H.4)
brand_voice_file: "shop/brand-voice.md"
```

Điểm thêm quan trọng: `shop.id` (xâu chuỗi KV + watermark), `category_col` (không có thì luật "stamp chỉ beverage" và menu-engineering gãy), `min_sample_per_pattern` chỉnh được (quán đông ngưỡng khác quán vắng), `schema_version`.

### H.6 Eval 2 nhóm + auto-freeze ✅ (chốt, 3 cải tiến)

Chia core (tĩnh)/shop (động) + freeze <90% là đúng. Cải tiến:
1. **Đáp án nhóm shop phải TÍNH LÚC CHẠY** bằng script pandas trên data local — không được viết cứng, vì data trôi mỗi ngày → golden answer cứng sẽ tự sai và báo động giả.
2. **Fail khác nhau → phản ứng khác nhau:** core fail = model/corpus hỏng → auto-rollback snapshot (C.6) + freeze; shop fail = thường do RETRIEVAL hoặc DATA STALE → check freshness pipeline (H.2) trước khi đổ lỗi model. Gộp chung 1 ngưỡng sẽ rollback oan.
3. **Thêm nhóm 3 — câu canary "không được trả lời":** hỏi thứ data không đủ để kết luận ("Món nào nên bỏ khỏi menu?" khi mới 1 tuần data) → đáp án ĐÚNG = "chưa đủ dữ liệu, n=…". Test trực tiếp hàng rào hallucination (B.1–B.2) — thứ 12B local dễ vỡ nhất, và gần như không sản phẩm nào eval kiểu này.

Cơ chế freeze: 1 flag file; mọi đường ghi memory check flag trước khi ghi. Gỡ freeze = việc của người, không tự gỡ.

### H.7 Obfuscation (PyArmor/.pyc) ❌ KHÔNG áp dụng v1

Nhận diện rủi ro đúng (khách DWY share folder), nhưng giải pháp sai chỗ:
- `.pyc` decompile ngược trong 1 lệnh (decompyle3/pycdc) — bảo vệ ~0.
- PyArmor bảo vệ thật hơn nhưng: pin chặt Python version + arch, dễ gãy sau macOS update trên máy KHÁCH — mà support model đã chốt là "Zalo nhóm + FAQ, không 1-1". Binary obfuscated chết trên máy khách = ticket support đắt nhất có thể tự tạo ra.
- **Quan trọng nhất: chất xám thật KHÔNG nằm trong file Python.** Python chỉ là glue (pull CSV, gọi Ollama, ghi file). Tài sản = corpus `.md` + prompt + phương pháp trong `QUAN.yaml` — mà RAG bắt buộc để dạng plain text cho model đọc. Obfuscate glue = khoá cửa sổ, để cửa chính mở.

Thay thế (giữ tinh thần góp ý, đổi công cụ):
1. **Watermark + fingerprint per-khách:** `shop_id` nhúng trong mọi file corpus + biến thể vô hình (khoảng trắng, wording xoay nhẹ mỗi bản giao) → folder bị share là trace ra ai để nói chuyện hợp đồng.
2. **Điều khoản license trong hợp đồng DWY** — đúng tầm thị trường ngách, quan hệ trực tiếp.
3. **Đòn bẩy thật = update:** corpus update + benchmark cộng đồng + Worker KV chỉ phục vụ `shop_id` hợp lệ → bản copy lậu đứng yên và thoái hoá dần, bản chính ngày càng khôn. Chống lậu bằng giá trị, không bằng khoá.
4. PyArmor ghi roadmap "cân nhắc lại NẾU thực tế xảy ra leak" — không trả chi phí phức tạp trước khi có bằng chứng cần.

### H.8 Đánh giá độ ổn định workflow hoàn chỉnh

Chuỗi đầy đủ sau vòng góp ý:
```
Sheets ──SA pull 23h──▶ CSV snapshot ──batch đêm──▶ insight (evidence-gated)
   ▲                        │                            │
freshness alert ◀───────────┘                            ▼
                                        Telegram alert + nút 👍/👎
Mac mini ◀──pull KV mỗi giờ── CF Worker ◀──webhook── Telegram
   │
   ├─▶ staged memory (quarantine ngoài RAG → confirmed trong RAG)
   ├─▶ curator 168h (trước đó: git snapshot)
   └─▶ eval 3 nhóm sau curator ──fail──▶ freeze + rollback + alert
```

**Điểm mạnh cấu trúc:**
- **Mọi mắt xích hỏng đều degrade về "hôm nay không có insight mới", không bao giờ về "insight sai"** — pipeline chết → alert + AI im; eval fail → freeze; học nhầm → rollback. Fail-safe, không fail-wrong. Đây là thuộc tính ổn định quan trọng nhất.
- Vòng tự học có **3 phanh độc lập**: gate người duyệt (tầng 3) · eval tự động + freeze · snapshot/rollback. Runaway self-learning bị chặn cấu trúc.
- Mac mini **outbound-only** — không port inbound, không daemon mới; RAM chỉ thêm đúng phần Ollama/embedding đã tính ở P0.
- Loop kín có nhịp cố định (23h pull → sáng alert → tuần curator → eval) — dễ đoán, dễ debug, dễ dạy khách.

**Điểm còn mỏng (đã vá trong plan):**
1. **Mac mini = SPOF** kiêm print server. Vá: launchd auto-restart cho mọi job + **dead-man switch**: mỗi job ping 1 endpoint Worker; Worker cron thấy im >24h → Telegram alert. Chi phí ~0 (đã có Worker). → vào P6.
2. Đường data khách DWY chưa qua thực chiến — vá bằng điều kiện tiên quyết "data về Google Sheet" (H.2), rủi ro dồn về 1 adapter duy nhất đã test ở Mitsu.
3. Hermes third-party (F.6) — không đổi: tài sản ở format mình kiểm soát, Hermes pin version, thay được.

**Kết luận ổn định:** Mitsu single-shop: **cao** — không SPOF nào chết-im-lặng được nữa, mọi failure mode có alert + đường lui. DWY multi-shop: **trung bình cho tới khi** adapter Sheets + Worker multi-tenant chạy thật ≥1 khách — đúng thứ gate P7 kiểm.

---

## I. Kiểm kê toàn project — còn gì port lên Hermes local (2026-07-08)

3 lăng kính: **(a)** huấn luyện/chạy local được không (sức 12B) · **(b)** giá trị dự phòng khi Claude hết quota · **(c)** đóng gói bán được không.

### I.1 Reframe quan trọng: local không phải "dự phòng" — local là MẶC ĐỊNH cho việc lặp hằng ngày

Đảo lại câu hỏi quota: đừng đợi Claude hết quota mới chạy local. **Router theo loại task, cố định, không cần đo quota:**

| Tier | Chạy gì | Khi nào |
|---|---|---|
| 0 — Claude | Deep work: thiết kế campaign mới, /mo-rong, sửa code GAS/web, plan | Tuần/tháng, theo yêu cầu |
| 1 — Gemma local (mặc định) | Mọi việc LẶP HẰNG NGÀY: brief sáng, draft post/review/winback, Q&A SOP, insight batch | Hằng ngày, tự động |
| 2 — Script thuần | Số liệu không narration (chốt ca, RFM table, freshness check) | LLM local chết vẫn chạy |
| 3 — Giấy | `ops/offline-sop-a5.md` | Mất điện/mất máy |

→ Claude thành dao mổ, không phải máy xay. Quota tự nhiên dư ra. Thang degrade 0→3 khớp luôn triết lý offline-failover 4 cấp có sẵn của quán.

### I.2 Tài sản PORT NGAY (local fit cao, 12B dư sức)

1. **`/sang` + `/tuan` briefs** — narration số liệu theo template. Đây là task đốt quota Claude đều nhất (mỗi ngày) và dễ nhất cho 12B. Quota-saver #1.
2. **SOP staff assistant (SP MỚI trong gói, chưa ai khai thác):** corpus = `docs/system/*` (10 file SOP thật: labels-print, loyalty-stamps, offline-failover…) + `ops/staff-training.md` + `docs/agent-map.md`. Nhân viên mới hỏi AI "in lại tem sao?", "stamp cộng cho bánh không?" thay vì hỏi chủ. RAG Q&A = dạng bài local mạnh nhất. **Bán rất được** — quán nào cũng đau nhân viên mới/nghỉ việc; outcome: "nhân viên tự học việc, chủ không phải đứng kèm".
3. **CSKH chatbot — ĐÃ CÓ SẴN 80%:** `ops/rag_build.js` + `rag_query.js` đang chạy RAG FAQ (embeddings Vertex, retrieval local, corpus seo-pack + store-facts). Việc còn lại: đổi embed sang bge-m3 local (P2 chọn model dùng chung) → **một stack RAG phục vụ cả 3: insight + SOP staff + CSKH**. Zero cost mới, hạ tầng gộp một.
4. **`/review` responder** — draft phản hồi review ngắn theo brand voice; few-shot từ `docs/review-monitor/` (kho phản hồi đã duyệt sẵn có).
5. **`/khach` winback** — RFM = pandas (tier 2), draft Zalo = template + few-shot từ `docs/winback-drafts/` sẵn có.
6. **`/chot-ca` `/huy` `/bao-tri`** — bản chất deterministic, LLM chỉ narrate + bắt bất thường. Fit cao nhất, rủi ro thấp nhất.

### I.3 Tài sản HYBRID (local draft → Claude polish khi đáng tiền)

7. **`/post` social** — kho bài đã đăng/duyệt = few-shot library, chấm 👍/👎 theo đúng pattern taste-clipper → local học giọng dần. 12B viết creative tiếng Việt ở mức "draft khá" — đủ cho post thường ngày, campaign lớn mới gọi Claude. Quota-saver #2 (content = việc hằng ngày).
8. **`/promo`** — local điền biến thể từ template `docs/system/campaign-promo.md`; THIẾT KẾ campaign mới giữ Claude (tier 0).
9. **`/trend` + `/doi-thu`** — local không web-search được, nhưng data-in đã có: `ops/tiktok_pull.sh` + kho `docs/trend-scout/`, `docs/competitor-scans/`. Kiến trúc: script kéo data (tier 2) → local lọc/phân loại/tóm tắt (tier 1). Đánh giá "trend hợp quán không" phức tạp → giữ Claude.
10. **Content factory (`ops/gen_content.js`, `gen_seo.js`, `gen_video_scripts.js`)** — đang chạy Vertex Gemini Flash. Port draft-level sang local = khỏi phụ thuộc credit GCP; giữ Vertex làm fallback chất lượng.
11. **`/web` suggestions** — data WEB_HITS/WEB_TRAFFIC (Worker tracking sẵn) → local narrate funnel web→đơn; sửa code thật vẫn Claude.

### I.4 Data feed MỚI cho self-improving loop (repo có sẵn, brief chưa tính)

- **`ops/camera_count.py` — foot traffic local:** đếm người đi ngang vs vào quán → insight conversion vỉa hè, giờ đông THẬT vs giờ bán được. Cắm vào corpus insight như 1 nguồn CSV nữa. **Camera xử lý local = điểm bán privacy cực mạnh** ("camera AI không đẩy hình lên cloud nào").
- **WASTE_LOG + variance chốt ca** → loss-prevention insight (đúng bài Avero $400+/tháng đang bán, mình có data sẵn).
- **MARKETING_LOG** → nuôi attribution corpus của `/roi`.
- ⚠️ **`camera_ai.py` (face-recognition nhân viên): KHÔNG đưa vào gói bán.** Sinh trắc học = rủi ro pháp lý + nhạy cảm với chính nhân viên quán khách. Bán chỉ people-COUNTING; face-rec để nội bộ Mitsu tự chịu trách nhiệm.

### I.5 KHÔNG port

- **Creative pipeline (creative-design-director, Higgsfield, phim Tam Mật, image prompts)** — cần frontier model + tool ảnh/video, 12B vô vọng. Giữ nguyên chỗ cũ.
- **Đường đơn hàng realtime (GAS event bus, KDS, in tem)** — deterministic, LLM CẤM đứng trong luồng đơn. Bất biến.
- **`/mo-rong`, master-workflow design, code maintenance** — deep reasoning, tier 0.

### I.6 Cập nhật gói bán DWY: 1 stack RAG local → 4 module outcome

| Module | Outcome bán | Nguồn có sẵn |
|---|---|---|
| Insight tự học | "quán ngày càng hiểu khách" | cafe-insight (plan chính) |
| Trợ lý SOP nhân viên | "nhân viên mới tự học việc" | docs/system/* + staff-training.md |
| CSKH FAQ bot | "khách hỏi có người trả lời 24/7" | rag_build/rag_query (có sẵn 80%) |
| Đếm khách qua đường | "biết bao nhiêu người đi ngang mà không vào" | camera_count.py |

Cùng 1 hạ tầng (Ollama + embed + Hermes + QUAN.yaml), 4 câu chuyện bán — tăng giá trị cảm nhận tier DWY +3.5tr mà gần như không tăng chi phí build. Corpus SOP cũng chia `/core` (SOP F&B chung) vs `/shop` (SOP riêng quán) đúng khung D.5.

**Tác động plan:** P2 thêm nguồn corpus (docs/system/* + staff-training + store-facts/seo-pack); P3 tool `search_kb` phục vụ chung 3 corpus (namespace theo module, vẫn 1 tool — không vi phạm bug #3); P6 thêm nguồn CSV camera_count. Không thêm phase mới.
