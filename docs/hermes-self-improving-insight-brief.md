# Brief cho Fable 5 — Local Self-Improving Insight Workflow (Hermes + Gemma4)

> **Vai trò của bạn (Fable 5) trong phiên này:** (1) brainstorm ý tưởng thiết kế/đóng gói ở §6, (2) review chặt toàn bộ kế hoạch dưới đây, tìm giả định sai/rủi ro/lỗ hổng — **TRƯỚC KHI** cho phép build. Không code ngay. Output mong đợi: phản biện + đề xuất + (nếu ổn) plan task-level để đưa về Claude Code session build tiếp.

---

## 1. Bối cảnh

Quán thật: **Mitsu / Lâm Hà Kissaten**, khai trương ~11/7/2026.

Đã có workflow insight chạy trên Claude Code: subagent `cafe-insight` (content→doanh số scorecard, RFM, menu engineering, ROI, competitor scan, dự báo món bán chạy...) — nguồn sự thật: `.claude/agents/cafe-insight.md` + skill `cafe-manager` (các lệnh `/roi`, `/khach`, `/menu-eng`, `/tuan`...). Đây chính là "workflow insight đã có sẵn trên Claude" nhắc tới trong yêu cầu.

**Mục tiêu mới:** dựng bản chạy LOCAL của workflow này trên **Hermes** (desktop AI agent app, đã cài) + **Gemma4 12B** qua Ollama, để:
- (a) chạy free/offline, không tốn API cloud cho việc lặp lại hàng ngày;
- (b) tự hoàn thiện dần khi quán vận hành thật và nạp data thật vào;
- (c) sau này đóng gói bán cho quán khác.

**Gắn với kế hoạch sản phẩm đang chạy song song** (`docs/digital-product-plan.md` v1.3, 2026-07-08):
- Sản phẩm A "Trợ Lý Quán AI" (Skill Pack) — 1.5tr, ship tuần 3.
- Sản phẩm B "Quán Tự Chạy OS" (Kissaten sanitized) — 6tr, ship tuần 8.
- Ladder: Pack A → OS B → tier **"Done-With-You" +3.5tr** (Q4) → community 200k/tháng.
- **Nguyên tắc đã chốt trong plan đó: "Local AI Mac Mini = content hook + chương nâng cao, KHÔNG PHẢI requirement."** Bài học G4 (máy in tem): không được ép khách phải có phần cứng/setup always-on để dùng sản phẩm lõi.

→ **Ràng buộc cứng:** package Hermes+Gemma4 này PHẢI là lớp add-on optional, không được thành điều kiện bắt buộc để dùng A/B.

---

## 2. Quyết định đã chốt trong phiên trước (đừng brainstorm lại từ đầu)

- **Kiến trúc = RAG**, không fine-tune trọng số. Lý do đã cân nhắc: data quán còn ít → fine-tune dễ overfit; RAG tách kiến thức khỏi model nên cập nhật rẻ (chỉ re-embed, không train lại) mỗi khi logic cafe-insight đổi.
- Model chạy: **Gemma4 12B qua Ollama**, trên Mac mini 16GB RAM (máy đã chạy 24/7 cho print server/dispatcher/ops script khác).
- Hermes desktop agent app đã có cấu hình sống với Gemma4 12B (từng bị bug blank-response/context-overflow, đã fix — xem §5, đừng lặp lại).

---

## 3. Kiểm chứng kỹ thuật đã làm (đừng mất công tra lại — đã search xác nhận 2026-07-08)

### 3a. "TurboQuant" — có thật, nhưng CHƯA dùng được trên Mac qua Ollama hôm nay

- TurboQuant = kỹ thuật nén **KV-cache** của Google Research (công bố 25/03/2026): nén xuống 3-bit key / 2-bit value, training-free, gần như không giảm chất lượng. Đây là nén cache lúc suy luận (giúp context dài hơn, nhanh hơn), **không phải nén trọng số model**.
- Hiện trạng: **chưa merge vào llama.cpp/Ollama chính thức**. Chỉ có fork cộng đồng (`TheTom/llama-cpp-turboquant`, `elusznik`) có Metal kernel cho Apple Silicon nhưng còn thử nghiệm (vừa vá lỗi crash khởi động). Merge chính thức vào llama.cpp dự kiến roadmap Q3 2026, Ollama theo sau.
- **Khuyến nghị:** KHÔNG phụ thuộc TurboQuant cho bản v1. Ghi vào roadmap "nâng cấp khi Ollama merge — theo dõi lại khoảng Q3/Q4 2026".

### 3b. Cái nên dùng NGAY để "chạy hiệu quả nhất": Gemma4 QAT

- `gemma4:12b-it-qat` — bản chính thức có sẵn trên Ollama. QAT = Quantization-**Aware** Training: sai số lượng tử hoá được model học bù lại NGAY TRONG LÚC train, khác với model hiện tại đang dùng.
- Đã kiểm bằng `ollama show gemma4:12b-fixed`: model hiện tại là **Q4_K_M thường** (quant SAU khi train, không phải QAT) — chất lượng thấp hơn QAT ở cùng dung lượng bit.
- QAT 12B chạy ~7GB RAM, chất lượng gần bf16. Máy có 16GB RAM tổng — đủ tầm nhưng khoảng trống thật sự eo hẹp (xem bug cũ ở §5 — RAM/context từng là nguyên nhân lỗi).
- **Việc kỹ thuật đầu tiên khi build:** `ollama pull gemma4:12b-it-qat` → build Modelfile mới trên nền QAT (giữ nguyên phần sửa lỗi reasoning từ bug cũ) → đo lại tốc độ/RAM thực tế trước khi thay hẳn model default trong Hermes config.

---

## 4. Cơ chế "self-improving" CÓ THẬT trong Hermes (đọc từ `~/.hermes/config.yaml`)

Không phải fine-tune trọng số. Hermes có 3 cơ chế tích luỹ tri thức sẵn, dùng được luôn:

1. **memory** (`memory.memory_enabled: true`) — ghi fact/user-profile tích luỹ qua các turn hội thoại, flush mỗi 6 turn, nhắc mỗi 10 turn, giới hạn 2200 ký tự.
2. **curator** (`curator.enabled: true`, `interval_hours: 168` = đúng 1 tuần) — job định kỳ **consolidate + prune + archive** memory & skills tự động. 168h trùng khớp nhịp `/tuan` (weekly Friday brief) đã có sẵn trong skill `cafe-manager` → có thể đồng bộ lịch: mỗi tuần quán tổng kết xong là curator dọn/cô đọng tri thức học được trong tuần.
3. **skill self-authoring** (`skills.write_approval: false`, `creation_nudge_interval: 15`) — Hermes ĐƯỢC PHÉP tự viết skill mới không cần người duyệt tay, được nhắc mỗi 15 turn.

→ **"Self-improving" đúng nghĩa ở đây** = Hermes tự ghi memory-fact + tự tạo skill mới khi phát hiện pattern lặp lại từ data quán thật (VD: "combo Y luôn yếu thứ Ba" → tự ghi nhớ, có thể tự sinh skill nhắc việc), rồi **curator dọn dẹp/rút gọn hàng tuần** để tri thức không phình to/nhiễu theo thời gian. Không đụng trọng số model — model (Gemma4) đứng yên, chỉ có lớp tri thức RAG + memory + skill xung quanh nó lớn dần.

**Rủi ro cần Fable5 soi kỹ:** `write_approval: false` cho skill nghĩa là Hermes tự ghi KHÔNG qua người duyệt. Quán nhỏ, data ít trong giai đoạn đầu → dễ học nhầm nhiễu thành pattern thật (bài học đã ghi trong lịch sử dự án cafe-insight: *"kỷ luật thống kê mẫu nhỏ — đừng SCALE/KILL trên nhiễu, phải gắn confidence + ngưỡng volume tối thiểu"*). Cần cơ chế gate: có nên chặn skill mới có hiệu lực ngay, hay để "chờ duyệt" một vòng? Ngưỡng data tối thiểu bao nhiêu mới cho phép tự ghi kết luận?

---

## 5. Bẫy kỹ thuật đã từng dính — tránh lặp lại

3 bug từng làm Gemma4 trả rỗng trong Hermes (đã fix, giữ nguyên fix khi build tiếp):

1. `reasoning_effort` không phải `"none"` → model rơi vào chế độ nghĩ ngầm, nội dung thật nằm trong field `reasoning`, `content` trả rỗng.
2. Có proxy debug chặn giữa Hermes và Ollama → buffer toàn bộ response trước khi forward → client timeout, thấy rỗng.
3. **32 tool schema mặc định của Hermes (~15k token)** khiến model nghĩ quá lâu về tools, tràn giới hạn 65536 token → `finish_reason: length`, content rỗng.

Fix đã áp dụng: `reasoning_effort: none`, bỏ proxy debug, `platform_toolsets.cli: []`.

→ **Áp dụng cho phần mới:** nếu thêm tool `search_kb` (RAG retrieval) vào Hermes, CHỈ thêm đúng 1 tool. Không được bật lại bộ 32 tool cũ — đó chính là nguyên nhân bug #3.

---

## 6. Yêu cầu đóng gói để bán — phần CẦN Fable5 brainstorm nhiều nhất

Ràng buộc đã biết:

- Phải cài đặt nhanh, khách không rành kỹ thuật ("không tốn thời gian setup").
- KHÔNG được là điều kiện bắt buộc của Sản phẩm A/B hiện có — add-on optional, đúng tinh thần "content hook + chương nâng cao" đã chốt trong `docs/digital-product-plan.md`.
- Corpus RAG hiện đang build từ tri thức RIÊNG của Mitsu (`cafe-insight.md`, `docs/system/*`) → phải tổng quát hoá được cho quán KHÁC (SKU khác, sheet schema có thể lệch) trước khi bán được.
- Máy khách chạy Hermes+Ollama cục bộ → không có server trung tâm để "gọi về nhà" kiểu SaaS cloud nhằm chặn crack/license — cần nghĩ mô hình license phù hợp local-first (hoặc biến đây thành ĐIỂM BÁN: *"100% dữ liệu quán ở lại máy bạn, không gửi cloud nào"*).
- Định vị theo ladder sẵn có: đây là feature phụ của Sản phẩm B, hay là phần lõi của tier "Done-With-You +3.5tr" (vì cần touch tay cài Ollama/Hermes/Modelfile, không phải thứ khách tự cài 1-click thật sự)? **Đừng tự bịa ra sản phẩm thứ 3 mới chồng lên ladder đang chạy** — nếu có ý mới, phải đối chiếu ladder hiện tại trước.
- Nguyên tắc bán hàng đã chốt: *"Bán outcome, KHÔNG bán từ 'multi-agent'"* — ngôn ngữ đóng gói phải nói kết quả ("quán ngày càng hiểu khách hơn mà không cần thuê ai nhìn số"), không nói kỹ thuật RAG/embedding/QAT với khách.
- Support model đã chốt: *"nhóm Zalo chung + FAQ, không 1-1 free"* — package phải tự vận hành được với mức support này.

**Câu hỏi mở cho Fable5:**

1. Cài đặt 1-lệnh cho khách không rành: đóng gói installer thế nào (script + Modelfile + corpus template + Hermes config mẫu)? Có nên tách hẳn thành 1 app riêng thay vì yêu cầu khách tự cài Hermes?
2. License/anti-piracy local-first: có cần cơ chế gì không, hay "bán trọn gói 1 lần + support Zalo" là đủ, giống các sản phẩm A/B hiện tại?
3. Ranh giới an toàn: việc gì local Gemma4 được TỰ quyết và tự ghi memory/skill (vd nhắc nhập kho), việc gì BẮT BUỘC người chủ duyệt trước khi tin (vd đề xuất bỏ món khỏi menu)?
4. Corpus tổng quát hoá: tách phần nào của tri thức cafe-insight là **domain-general** (công thức RFM, SCALE/KILL/ITERATE, attribution logic) vs **Mitsu-specific** (tên món, câu chuyện thương hiệu, giá) — để không phải viết lại corpus từ đầu cho mỗi khách hàng mới?

---

## 7. Việc cần Fable5 làm cụ thể

1. Đọc kỹ §1–§6.
2. Phản biện: giả định nào ở trên sai/yếu? Rủi ro nào chưa liệt kê (đặc biệt rủi ro liên quan §4 self-improve không người duyệt, và §6 đóng gói bán)?
3. Brainstorm 2–3 phương án đóng gói cụ thể (trả lời 4 câu hỏi mở ở §6), so sánh trade-off.
4. Nếu thấy ổn, viết lại thành plan task-level (không code) để đưa về Claude Code session tiếp tục build.
