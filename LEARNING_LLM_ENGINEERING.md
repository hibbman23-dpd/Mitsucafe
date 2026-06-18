# Lộ trình học LLM Engineering — 6 tuần
# Cho: chủ/builder Lâm Hà Kissaten · Mục tiêu: debug LLM không cần đoán mò
# Bài tập thực hành 100% trên data thật của quán (ORDERS / CUSTOMERS / MENU / Ollama local)

> Nguyên tắc: **mỗi tuần phải đẻ ra 1 thứ chạy được**, không học chay.
> Stack bạn đang có: Ollama (Gemma, Qwen3:8b) · Claude API · Google Sheets · GAS · Python.

---

## Triết lý của lộ trình này

Bạn không thiếu khả năng làm — bạn thiếu **mental model về cách LLM thực sự chạy bên trong**.
Đó là lý do vụ Hermes + Gemma "câm" làm bạn mất thời gian. Học xong 6 tuần này, khi model
trả về rác / câm / cắt ngang, bạn **biết ngay** tại sao thay vì thử-sai.

Đo lường thành công: cuối mỗi tuần tự trả lời được câu hỏi "Tại sao?" ở cuối phần đó **mà không Google**.

---

## TUẦN 1 — Tokenization & Context Window
**Khái niệm cốt lõi:** LLM không đọc chữ, nó đọc *token*. Mọi giới hạn, mọi vụ "câm", mọi
chi phí đều quy về token. Đây là nền của mọi thứ còn lại.

Học:
- Token là gì, vì sao "Bạc xỉu" ≠ 1 token, tiếng Việt tốn token hơn tiếng Anh thế nào
- Context window = input + output. Tràn → model cắt/câm (đúng bug Hermes/Gemma của bạn)
- `num_ctx` trong Ollama: vì sao mặc định 2048/4096 và vì sao phải tăng cho prompt dài
- KV cache, vì sao prompt dài làm chậm và tốn

**Bài tập (data thật):**
1. Viết script Python đếm token của 1 đơn ORDERS đầy đủ (items_json + modifiers + notes).
   Dùng `tiktoken` (cho Claude/GPT) và so với tokenizer của Gemma.
2. Lấy 20 dòng CUSTOMERS nhồi vào 1 prompt Ollama, cố tình để tràn `num_ctx`, quan sát
   model câm/cắt. Rồi tăng `num_ctx`, thấy nó sống lại. **Tự tay tái hiện đúng bug cũ.**

**Tự trả lời được:** "Tại sao Hermes + Gemma trả về blank?" — viết 3 câu vào memory.

---

## TUẦN 2 — Structured Output (đây là tuần ra tiền nhất)
**Khái niệm cốt lõi:** Bắt LLM trả JSON sạch đút thẳng vào Sheets — bỏ regex chữa cháy.

Học:
- JSON mode / `format: json` của Ollama
- Function calling / tool use của Claude API (load skill `claude-api` khi làm)
- GBNF grammar trong llama.cpp/Ollama — ép output theo đúng schema (kể cả enum sugar/ice)
- Vì sao "prompt xin JSON" không đủ, phải *ép* ở tầng decode

**Bài tập (data thật):**
1. Cho 1 câu order tiếng Việt tự do ("cho 2 bạc xỉu ít đường ít đá với 1 croffle") →
   ép Ollama trả về đúng `items[]` theo Event Schema v1.1 trong CLAUDE.md.
2. Làm cùng việc đó bằng Claude API với tool use. So sánh độ ổn định 2 cách.
3. Schema phải khớp `sku/name/qty/modifiers{sugar,ice}` — nối được vào `validateOrderPayload`.

**Tự trả lời được:** "Tại sao JSON mode ổn hơn prompt thường?" và "Khi nào dùng local vs Claude?"

---

## TUẦN 3 — Embeddings & Semantic Search
**Khái niệm cốt lõi:** Biến chữ thành vector để máy hiểu "gần nghĩa". Nền của trí nhớ & gợi ý.

Học:
- Embedding là gì, cosine similarity (toán cấp 3, đừng sợ)
- Ollama embedding model (`nomic-embed-text`) chạy local, miễn phí
- Vì sao KHÔNG cần vector DB cho quy mô quán — numpy + vài nghìn dòng là đủ

**Bài tập (data thật):**
1. Embed toàn bộ tên món MENU. Khách gõ "cà phê sữa đá" → tìm SKU gần nhất dù gõ sai chính tả.
2. Embed lịch sử notes của CUSTOMERS → "khách này thích kiểu gì" bằng món gần nghĩa.

**Tự trả lời được:** "Tại sao semantic search bắt được 'bạc xỉu' khi khách gõ 'cf sữa'?"

---

## TUẦN 4 — RAG đúng nghĩa (sửa cái sai phổ biến nhất)
**Khái niệm cốt lõi:** Đừng nhồi cả database vào prompt (vừa tràn, vừa ngu đi, vừa đắt).
Chỉ lấy *đúng vài dòng liên quan* rồi mới đưa cho LLM.

Học:
- Retrieve → Augment → Generate: 3 bước, đa số người chỉ làm bước 3
- Chunking, top-k retrieval (dùng embedding tuần 3)
- Vì sao nhồi 200 đơn vào context làm câu trả lời *tệ hơn* 5 đơn đúng

**Bài tập (data thật):**
1. "Khách 0901xxx hay uống gì, mấy giờ ghé?" → retrieve đúng đơn của khách đó từ ORDERS,
   chỉ đưa phần liên quan cho LLM trả lời. So với cách nhồi hết.
2. Nối được vào skill `khach` (RFM) bạn đã có — biến nó từ thống kê thành hội thoại.

**Tự trả lời được:** "Tại sao ít context lại cho câu trả lời tốt hơn nhiều context?"

---

## TUẦN 5 — Prompt Engineering có kỷ luật + Eval
**Khái niệm cốt lõi:** Hết "thấy ổn là xong". Phải *đo* được prompt nào tốt hơn.

Học:
- System vs user vs assistant role, few-shot, vì sao thứ tự quan trọng
- Temperature / top_p — khi nào cần 0 (trích data), khi nào cần cao (viết post)
- Eval set: 20 ca thử + đáp án đúng → chạy tự động chấm điểm
- A/B 2 prompt trên cùng eval set

**Bài tập (data thật):**
1. Lấy skill `post` (draft social) — tạo eval 15 brief, chấm brand voice tự động.
2. Sửa prompt extract đơn ở Tuần 2, đo bằng eval xem có thật sự khá hơn không.

**Tự trả lời được:** "Prompt A tốt hơn B — bằng chứng số là gì, không phải cảm giác?"

---

## TUẦN 6 — Gắn vào hệ thống thật + chọn local vs cloud
**Khái niệm cốt lõi:** Ghép tất cả vào pipeline quán đang chạy, biết khi nào dùng cái gì.

Học:
- Khi nào Ollama local (rẻ, riêng tư, đơn giản) vs Claude API (khó, cần độ chính xác cao)
- Cost & latency budgeting cho 1 quán
- Fallback: local câm → cloud đỡ (đúng tinh thần failover 4 cấp của bạn)

**Bài tập tốt nghiệp (chọn 1, làm cho chạy thật):**
- **A:** Bot nhận order tiếng Việt tự do → JSON chuẩn → đẩy vào doPost. (gộp T2+T4)
- **B:** "Gợi ý món cho khách 09xxx" dựa lịch sử thật, có fallback local→cloud. (gộp T3+T4+T6)
- **C:** Nâng skill `khach` thành chat hỏi-đáp về khách hàng bằng RAG. (gộp T4+T5)

---

## Tài nguyên (xem theo nhu cầu, không cày tuần tự)
- **Ollama docs** — `num_ctx`, `format: json`, embedding models (đọc kỹ, đây là stack bạn đang chạy)
- **Claude API** — dùng skill `claude-api` ngay trong Claude Code khi cần (tool use, structured output)
- Andrej Karpathy — "Let's build the GPT Tokenizer" (YouTube) — hiểu token tận gốc, đáng 2h
- Anthropic prompt engineering guide — phần few-shot & XML structuring
- KHÔNG cần: khóa ML đại học, PyTorch, train model. Với quán, đó là phí thời gian.

## Quy tắc khi bí
Bí ở đâu → mở Claude Code, mô tả đúng bài tập tuần đó, bảo tôi giải thích + cùng code.
Học bằng cách *làm trên data thật của bạn*, không phải toy example.
