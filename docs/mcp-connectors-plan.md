# SẢN PHẨM F — VN MCP CONNECTORS (dual-use track)
# DRAFT v0.1 · 2026-07-08 · chủ sở hữu: DPD

> Trạng thái: **DUAL-USE — khác luật C/D/E.** F KHÔNG xếp hàng chờ slot build tuần 5–6, vì phần lõi
> (SePay MCP) TRÙNG module N1 Bank Feed của sản phẩm D — build 1 lần dùng 2 chỗ. Phần còn lại đi theo
> lịch học (khớp `LEARNING_LLM_ENGINEERING.md`), không đẻ deadline riêng.
> File mẹ: `docs/digital-product-plan.md` (A/B/C/D) · `docs/growth-os-creator-plan.md` (E).
> Nguồn research: session 2026-07-08 tối (web search MCP ecosystem + API VN).

---

## 1. THỊ TRƯỜNG 2026 — TÓM TẮT RESEARCH

### MCP đã thành chuẩn, không còn là cược
- ~17.500–20.000 MCP server được index Q1/2026; SDK đạt ~97 triệu download/tháng (3/2026). Anthropic đã donate MCP vào Agentic AI Foundation (Linux Foundation) — OpenAI, Block đồng sáng lập; AWS/Google/Microsoft/Cloudflare thành viên ([tooldirectory](https://tooldirectory.ai/blog/state-of-mcp-servers-2026), [WorkOS](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)).
- ChatGPT hỗ trợ MCP client đầy đủ từ cuối 2025; Responses API nối remote MCP native; Google ship MCP cho Gemini giữa 2026 → server viết 1 lần chạy được với MỌI client lớn.
- **Insight quyết định chiến lược:** phần lớn 17k server là wrapper cộng đồng chất lượng thấp / thí nghiệm bỏ hoang. Giá trị dồn về server chất lượng + docs tốt + maintained. Ngách không phải "viết thêm wrapper" mà là **connector VN chất lượng + lớp nghiệp vụ trên connector**.

### Cạnh tranh VN — kiểm thực tế 2026-07-08 (QUAN TRỌNG, đổi hướng plan)
| Mảng | Đã có ai làm? | Kết luận cho mình |
|---|---|---|
| KiotViet MCP | ✅ CÓ — ít nhất 2 bản: [HiGo-MCP](https://lobehub.com/mcp/higo-mcp-kiotviet-mcp-server), [haudnn/kiotviet-mcp](https://glama.ai/mcp/servers/haudnn/kiotviet-mcp) (36 tools, auto token refresh, Docker) | ❌ KHÔNG build lại từ đầu. Dùng bản có sẵn, đóng góp docs tiếng Việt nếu thiếu. Năng lượng dồn vào gap |
| Zalo OA MCP | ✅ CÓ — [theyahia/zalo-oa-mcp](https://github.com/theyahia/zalo-oa-mcp) (message, follower, article) | ❌ Không build lại. Test bản có sẵn với OA Mitsu, fork chỉ khi thiếu tool mình cần |
| **SePay / bank feed MCP** | ❌ CHƯA TÌM THẤY | ✅ **Gap chính — build.** Trùng N1 của D |
| VietQR MCP | ❌ chưa thấy bản tử tế | ✅ Build — 1 tool, zero auth, bài tập học tuần 1 |
| Lớp nghiệp vụ F&B/SME VN trên MCP (skill + workflow + docs tiếng Việt) | ❌ trống hoàn toàn | ✅ Đây mới là sản phẩm bán được — wrapper free, nghiệp vụ thu tiền |

### API phía VN — đã verify
- **SePay**: docs công khai đầy đủ — webhook (HMAC-SHA256/API Key/OAuth 2.0), API đọc giao dịch, SDK NodeJS chính thức ([docs.sepay.vn](https://docs.sepay.vn/tich-hop-webhooks.html), [developer.sepay.vn](https://developer.sepay.vn/en)). Free 500 giao dịch/tháng.
- **KiotViet**: Public API OAuth 2.0, tự lấy Client ID/Secret trong "Thiết lập kết nối API" — KHÔNG cần duyệt partner ([kiotviet.vn](https://www.kiotviet.vn/huong-dan-su-dung-public-api-retail/), có bản riêng [ngành F&B](https://www.kiotviet.vn/public-api-fnb/)). Giả định cũ "chỉ đọc file export" (G2) là bi quan quá — API thật dùng được.
- **VietQR quicklink**: img.vietqr.io — không auth, đang dùng sẵn trong Payment.gs.

---

## 2. ĐỊNH VỊ — 3 TẦNG GIÁ TRỊ (build 1 lần, ăn 3 lần)

```
Tầng 1 — MOAT NỘI BỘ (chắc chắn ăn, không phụ thuộc thị trường)
  SePay MCP = chính là N1 Bank Feed của D, viết dạng chuẩn thay vì script rời.
  Kissaten MCP (wrap GAS API) = Claude nói chuyện trực tiếp với hệ quán.
  → Kể cả F "thất bại" thương mại, công sức KHÔNG mất — D và OS B hưởng trọn.

Tầng 2 — OSS LEAD GEN (kênh phân phối MỚI: dev/agency, khác hẳn list chủ quán)
  Open-source 2–3 server + docs tiếng Việt tử tế → GitHub stars, build-in-public
  trên Threads/dev community → credential "người làm AI infrastructure VN".

Tầng 3 — SẢN PHẨM THU TIỀN (chỉ mở khi Tầng 2 có tín hiệu)
  "VN Agent Toolkit" cho agency/dev: bundle curated (server mình + server tuyển chọn
  của người khác) + lớp nghiệp vụ (skill /chot-ca, /roi... chạy TRÊN MCP data thật)
  + docs + support. Code free, NGHIỆP VỤ + TÍCH HỢP thu tiền.
```

**Câu định vị:** *"Ai cũng viết được wrapper API. Tôi bán thứ ở trên wrapper: quy trình nghiệp vụ quán/shop VN chạy trên data thật, đã vận hành ở quán tôi 1 năm."* — nhất quán positioning A/B/C/D/E: bán outcome, proof Mitsu.

---

## 3. GAP ANALYSIS GM — THỊ TRƯỜNG CẦN, MÌNH CHƯA CÓ

### GM1 🔴 Kiến thức MCP protocol + TypeScript SDK — gap kỹ năng lớn nhất, mọi thứ khác chờ nó
- Stack hiện tại: GAS/JS, Python, CF Workers (đã deploy). CHƯA từng: viết MCP server, dùng `@modelcontextprotocol/sdk`, transport stdio vs Streamable HTTP, MCP Inspector.
- **Quyết định:** kế hoạch học 4 tuần (§5), mỗi tuần ship 1 artifact chạy được — không học chay. Khớp roadmap LEARNING_LLM_ENGINEERING (nguyên tắc "học trên data Kissaten thật").

### GM2 🔴 SePay MCP — gap thị trường chính, trùng N1 của D
- Chưa ai làm. Nhu cầu thật: hộ KD bắt buộc tài khoản chính chủ từ 03/2026, bank feed = nguồn doanh thu chuẩn nhất (GF1).
- **Quyết định:** build ĐẦU TIÊN sau tuần học 1. Tools: `list_transactions` (lọc ngày/số tiền/nội dung), `get_balance_summary`, `match_payment` (đối chiếu đơn ORDERS ↔ giao dịch). Test bằng tài khoản SePay Mitsu thật. Đây là bản MCP của N1 — khi D kích hoạt, N1 coi như xong phần ingest.

### GM3 🟡 Kissaten/OS MCP — không ai làm được ngoài mình
- MCP server wrap chính GAS API của hệ (orders, menu, KPI, RFM) → Claude Desktop/Code truy vấn quán trực tiếp: "hôm qua bán bao nhiêu ly, món nào chậm?".
- **Quyết định:** build ở tuần học 4. Vai trò kép: (a) demo clip "tôi hỏi Claude về quán tôi, nó đọc số thật" — halo content mạnh ngang local AI; (b) thành **module premium của OS B v2** ("nối quán bạn vào Claude" +990k upsell).

### GM4 🟡 Remote MCP (CF Workers) — khác biệt kỹ thuật so với wrapper local
- Đa số server VN hiện có = stdio local, cài đặt lằng nhằng (Node, env, config). Remote MCP trên CF Workers = khách dán 1 URL vào Claude, xong. Cloudflare có `McpAgent` trong Agents SDK — stack mình ĐÃ dùng (mitsu.cafe Worker).
- **Quyết định:** tuần học 3 = chuyển SePay MCP lên remote. Đây là kỹ năng ít người VN có → nội dung build-in-public tốt + nền cho Phase 4 (hosted).

### GM5 🟡 Lớp nghiệp vụ trên connector — thứ 17k wrapper KHÔNG có
- Wrapper trả JSON thô. Chủ quán/agency cần: "đối soát két cuối ca từ bank feed", "cảnh báo khách VIP 30 ngày không quay lại", "P&L tuần từ giao dịch đã phân loại".
- **Quyết định:** đóng gói skill nghiệp vụ (từ `/chot-ca`, `/roi`, `/khach`, agent Phân Loại Giao Dịch GF2) thành bộ chạy TRÊN MCP data. Đây là phần THU TIỀN của Tầng 3 — code connector free, nghiệp vụ bán.

### GM6 🟢 Demand phía agency/dev VN — chưa validate, phải mua bằng tín hiệu rẻ
- Giả định: agency automation VN (đang bán n8n/Zapier setup) sẽ cần MCP stack khi khách hỏi "cho AI đọc dữ liệu bán hàng". Chưa có bằng chứng.
- **Quyết định:** KHÔNG khảo sát riêng. Tín hiệu = hành vi thật trên OSS: stars, issues, inbound DM sau 6 tuần công khai (gate §6). Trước đó không build gì cho Tầng 3.

### Ngoài phạm vi F v1 (ghi nhận, không làm)
- Build lại KiotViet/Zalo OA MCP — đã có, dùng + contribute.
- MCP cho Shopee/TikTok Shop API — API seller đóng/duyệt khó, ToS rủi ro (cùng lý do GC1 không cào sàn).
- Marketplace/hosting server cho người khác — đất của Cloudflare/Glama/Smithery.
- Bán "code MCP server" như sản phẩm đóng gói — code sẽ bị copy ngày 1; tiền nằm ở nghiệp vụ + tích hợp + DWY.

---

## 4. F-MODULES (thứ tự build = thứ tự học)

| # | Module | Gap | Ước lượng | Ghi chú |
|---|--------|-----|-----------|---------|
| Q1 | VietQR MCP (`generate_qr` quicklink, 1 tool) | GM1 | 2–3 ngày trong tuần học 1 | Bài tập tốt nghiệp tuần 1 — đủ nhỏ để ship, đủ thật để dùng |
| Q2 | **SePay MCP** (list_transactions, balance, match_payment) | GM2 | 4–5 ngày | = N1 của D. Test tài khoản Mitsu thật. Adapter tách file riêng (luật GF) |
| Q3 | Remote hóa Q2 trên CF Workers (McpAgent + auth) | GM4 | 3–4 ngày | Kỹ năng khác biệt; nền Phase 4 |
| Q4 | Kissaten MCP (wrap GAS API: sales, menu, RFM query) | GM3 | 3–4 ngày | Demo content + module OS B v2. Chỉ READ — không cho LLM ghi ORDERS |
| Q5 | Business Skill Layer (chot-ca/roi/khach chạy trên MCP data) | GM5 | 4–5 ngày | Phần bán được của Tầng 3 — chỉ build sau gate Phase 2 |
| Q6 | Docs + publish (README tiếng Việt song ngữ, npm, registry, 3 clip demo) | GM6 | 2–3 ngày rải | Mỗi server publish ngay khi xong, không gom cuối |

Nguyên tắc kế thừa từ A–E: server chỉ ĐỌC dữ liệu tiền bạc (không tool nào chuyển tiền/ghi sổ — cùng luật "SePay chỉ đọc biến động số dư" của D); mọi số trả về kèm nguồn + timestamp; eval nhẹ trước release (golden set giao dịch Mitsu đã biết đáp án — tinh thần N7/M6).

---

## 5. KẾ HOẠCH HỌC TẬP 4 TUẦN (khớp LEARNING_LLM_ENGINEERING)

> Nguyên tắc: mỗi tuần ≤5h (không đè vận hành quán + lịch A/B), mỗi tuần kết thúc bằng 1 thứ CHẠY ĐƯỢC.
> Bắt đầu: tuần 3 kế hoạch A (28/07) — sau khi Pack A launch, trước khi slot tuần 5–6 mở.

### Tuần L1 — MCP fundamentals + ship server đầu tiên
- Đọc: spec chính thức modelcontextprotocol.io (concepts: tools/resources/prompts, lifecycle, transports stdio vs Streamable HTTP) — 1 buổi.
- Làm: scaffold TypeScript server bằng `@modelcontextprotocol/sdk` → tool `hello` → debug bằng MCP Inspector → nối vào Claude Code local.
- **Tốt nghiệp: Q1 VietQR MCP chạy trong Claude Code**, sinh QR thanh toán đơn thật của Mitsu.
- Khái niệm phải nắm chắc cuối tuần: tool schema (Zod), stdio transport, cách client discover tools. Chưa cần hiểu sampling/roots.

### Tuần L2 — API auth + server "thật" đầu tiên
- Học: OAuth 2.0 client credentials flow (SePay + KiotViet đều dùng), quản lý secret ngoài code (luật CONFIG sheet áp sang env/wrangler secrets), pagination + rate limit.
- Làm: **Q2 SePay MCP** — 3 tools, chạy trên tài khoản Mitsu. Viết golden test: 10 câu hỏi giao dịch đã biết đáp án.
- Tốt nghiệp: hỏi Claude "tuần này quán thu bao nhiêu qua bank, đơn nào chưa khớp thanh toán?" → trả lời đúng từ data thật.

### Tuần L3 — Remote MCP trên Cloudflare
- Học: skill `agents-sdk` + `cloudflare` (đã cài sẵn trong máy) — McpAgent, Streamable HTTP, auth cho remote server, Durable Objects state (đọc mức khái niệm).
- Làm: **Q3** — deploy SePay MCP lên Workers dưới subdomain mitsu.cafe, nối vào Claude bằng URL.
- Tốt nghiệp: cùng server dùng được từ Claude Desktop + Claude Code + (test) ChatGPT — bằng chứng "viết 1 lần chạy mọi client" cho content.

### Tuần L4 — Kissaten MCP + publish công khai
- Làm: **Q4** Kissaten MCP (GAS API đã sống — chỉ wrap) + **Q6** publish Q1/Q2 lên GitHub + npm + đăng ký MCP registry, README song ngữ.
- Content: 3 clip — ① "hỏi Claude về quán tôi" ② "bank feed vào Claude" ③ "cài trong 1 phút bằng URL". Đăng Threads dev + build-in-public.
- Tốt nghiệp: người lạ cài được server từ README không cần hỏi mình.

Tổng đầu tư học: ~20h/4 tuần. Kiến thức bổ sung duy nhất phải mua ngoài: không — docs SePay/KiotViet/MCP đều free và đã verify tồn tại.

---

## 6. LỘ TRÌNH SCALE 4 PHASE + GATES

### Phase 1 — Dogfood (tuần L1–L4, tháng 8/2026) · KHÔNG cần gate
Build Q1–Q4 theo lịch học. Đầu ra chắc chắn giữ được bất kể thị trường: N1 của D xong sớm, demo content, kỹ năng TS/MCP/CF vào người.

### Phase 2 — OSS công khai (tháng 9–10/2026)
- Publish + build-in-public 6 tuần. Đo: GitHub stars, installs (npm/registry), inbound (DM/issue/email hỏi thuê làm).
- **Gate F2 (cuối tháng 10):** ≥50 stars tổng HOẶC ≥10 inbound dev/agency HOẶC ≥3 người hỏi thuê tích hợp → mở Phase 3. Không đạt → F đóng băng ở Tầng 1 (moat nội bộ vẫn nguyên), không đầu tư thêm — zero hối tiếc vì Q2/Q4 đang phục vụ D và OS B.

### Phase 3 — Productize (Q4/2026, chỉ sau Gate F2)
Hai đường tùy tín hiệu inbound nghiêng đâu:
- **F3a — VN Agent Toolkit** (bán cho dev/agency, 1.5–2.5tr): bundle Q1–Q4 + Q5 business layer + docs setup client (Claude/ChatGPT/Gemini) + KiotViet/Zalo MCP tuyển chọn của cộng đồng (ghi credit) + nhóm hỗ trợ. Cấu trúc gói + landing + VietQR: tái dùng nguyên hạ tầng Pack A.
- **F3b — DWY tích hợp** (bán cho SME, 3–5tr/deal): mình setup trọn bộ "AI đọc số quán/shop của anh" — SePay + POS + Claude. Prototype = chính 2 quán pilot của OS B. Ít khách, giá cao, không tốn docs — cùng logic Gate 3 của plan A/B ("chuyển sang DWY nếu pack yếu").
- Mục tiêu 90 ngày Phase 3: 10 toolkit HOẶC 3 deal DWY ≈ 15–25tr. Con số khiêm tốn CHỦ ĐÍCH — F là ngách hẹp, vai trò chính là moat + credential.

### Phase 4 — Hosted remote MCP (2027, chỉ nếu Phase 3 sống)
Subscription "1 URL nối hết stack VN của bạn" 99–199k/th trên CF Workers. Đánh giá lại khi đó — không plan chi tiết bây giờ (thị trường MCP đổi nhanh, plan xa = lãng phí).

### Xung đột lịch với A/B/C/D/E — luật
- F KHÔNG chiếm slot build tuần 5–6. Chỉ dùng quỹ học 5h/tuần.
- Nếu D thắng Gate C0/D0 và kích hoạt tuần 5–6: Q2 nhập vào D-build làm N1 (tiết kiệm 2–3 ngày cho D). Nếu C hoặc E thắng: Q2 vẫn đi theo lịch học, không đổi.
- Mọi trễ → dời gate, không bỏ gate (luật chung).

---

## 7. RỦI RO RIÊNG MẢNG F

| Rủi ro | Đối phó |
|--------|---------|
| Maintenance treadmill — API SePay/KiotViet đổi, server hỏng, user mở issue | Adapter tách file (luật GF); scope OSS = 3–4 server CHẤT chứ không phải 20 server; ghi rõ SLA "best effort" trong README; review mỗi quý cùng đợt KiotViet/Kalodata |
| MCP spec đổi nhanh (registry, auth chuẩn hóa đang chuyển động) | Bám SDK chính thức, không tự chế transport; spec đã vào Linux Foundation → churn giảm dần |
| Wrapper bị copy / người khác build SePay MCP trước khi mình publish | Chấp nhận như plan A — moat không nằm trong code mà ở Tầng 2 (proof + docs VN + build-in-public) và Tầng 3 (nghiệp vụ). Publish sớm ngay cuối L2 để chiếm tên |
| Kênh dev VN trả tiền yếu | Đã tính sẵn: Tầng 3 bán cho agency/SME (có doanh thu dịch vụ), không bán cho dev cá nhân; gate F2 lọc trước khi build phần bán |
| LLM đọc được bank feed = rủi ro lộ dữ liệu khách khi demo | Demo bằng data Mitsu thật đã che số dư/tên người chuyển; server có flag `MASK_PII=true` mặc định; không bao giờ demo bằng data khách hàng |
| Phân mảnh focus (6 sản phẩm A–F) | F chỉ tiêu 5h/tuần quỹ HỌC (đằng nào cũng phải học theo roadmap LLM engineering); mọi output Phase 1 đều là module của D/B — không có công sức "chỉ cho F" cho tới Gate F2 |

---

## NGUỒN

- MCP ecosystem: [tooldirectory — State of MCP 2026](https://tooldirectory.ai/blog/state-of-mcp-servers-2026) · [WorkOS — MCP 2026](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026) · [Pento — A Year of MCP](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
- Đối thủ VN: [HiGo KiotViet MCP](https://lobehub.com/mcp/higo-mcp-kiotviet-mcp-server) · [haudnn KiotViet MCP](https://glama.ai/mcp/servers/haudnn/kiotviet-mcp) · [theyahia zalo-oa-mcp](https://github.com/theyahia/zalo-oa-mcp)
- API: [SePay docs](https://docs.sepay.vn/tich-hop-webhooks.html) · [SePay developer](https://developer.sepay.vn/en) · [KiotViet Public API](https://www.kiotviet.vn/huong-dan-su-dung-public-api-retail/) · [KiotViet F&B API](https://www.kiotviet.vn/public-api-fnb/)
