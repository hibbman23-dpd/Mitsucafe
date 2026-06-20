# BẢN ĐỒ AGENT — Lâm Hà Kissaten / Mitsu
> Mô hình "AI Agent Company" áp dụng cho quán
> Trạng thái: ✅ Đã có · 🟡 Có một phần · 🔴 Chưa có
> Cập nhật: 2026-06-07

---

## NGUYÊN TẮC

```
Con người (anh/chủ quán)  →  GIAO MỤC TIÊU + DUYỆT ĐẦU RA + RA QUYẾT ĐỊNH CUỐI
        ↓
AI Agent (mỗi skill = 1 nhân sự số)  →  TỰ LÀM theo mục tiêu
        ↓
OS dữ liệu (Google Sheets)  →  ORDERS · MENU · CUSTOMERS · PROMOTIONS · INVENTORY
        ↓
GAS Event Bus  →  XƯƠNG SỐNG tự động (order → tem → Zalo → invoice → stamp)
```

**Chủ quán không làm tay. Chủ quán điều phối Agent.**

---

## 5 TẦNG AGENT

```
┌─────────────────────────────────────────────────────────────┐
│  TẦNG 5 — CHIẾN LƯỢC & MỞ RỘNG                                │
│  [mo-rong] Expansion · [cafe-insight] Deep Research          │
├─────────────────────────────────────────────────────────────┤
│  TẦNG 4 — PHÂN TÍCH & RA QUYẾT ĐỊNH                           │
│  [sang] Brief sáng · [tuan] Review tuần · [roi] Đo lường      │
│  [menu-eng] Menu Engineering · [doi-thu] Đối thủ              │
├─────────────────────────────────────────────────────────────┤
│  TẦNG 3 — KHÁCH HÀNG                                          │
│  [khach] RFM + Winback · [Loyalty stamp ✅GAS] · [review]     │
├─────────────────────────────────────────────────────────────┤
│  TẦNG 2 — MARKETING & CONTENT                                 │
│  [post] Content · [promo] Campaign · [web] Landing · [trend]  │
├─────────────────────────────────────────────────────────────┤
│  TẦNG 1 — VẬN HÀNH (LÕI)                                      │
│  [chot-ca] Két · [huy] Hao hụt · [bao-tri] Thiết bị          │
│  GAS: Order · Tem · Payment · Invoice · Inventory · Notify   │
└─────────────────────────────────────────────────────────────┘
        Điều phối bởi: [cafe-manager] = Router/Orchestrator
```

---

## CHI TIẾT TỪNG AGENT

### TẦNG 1 — VẬN HÀNH (lõi, chạy hằng ngày)

| Agent | Skill/Module | Chức năng | Trạng thái |
|---|---|---|---|
| **Order Bus** | GAS `doPost` | Nhận đơn 8 kênh → ghi ORDERS → alert Telegram | ✅ |
| **Tem dán ly** | GAS `printOrderLabels` | CONFIRMED → in tem qua LAN | ✅ |
| **Thanh toán** | GAS `Payment.gs` | VietQR + đối soát | ✅ |
| **Hóa đơn** | GAS `Invoice.gs` | DELIVERED → bill nhiệt + PDF Zalo | ✅ |
| **Kho** | GAS `Inventory.gs` | Auto trừ NL + alert STOCK_LOW | ✅ |
| **Chốt két** | `chot-ca` | Mở/đóng ca · Z-report · cảnh báo lệch tiền | ✅ |
| **Hao hụt** | `huy` | Log WASTE cuối ngày + trừ kho | ✅ |
| **Bảo trì** | `bao-tri` | Lịch bảo trì espresso/máy đá | ✅ |

### TẦNG 2 — MARKETING & CONTENT

| Agent | Skill | Chức năng | Trạng thái |
|---|---|---|---|
| **Content** | `post` | 1 ý tưởng → FB/IG/TikTok/Threads + prompt Canva/Higgsfield | ✅ |
| **Campaign** | `promo` | Flash sale/happy hour → PROMOTIONS row + banner + Zalo broadcast | ✅ |
| **Landing** | `web` | Sửa mitsu.html/index.html theo metrics | ✅ |
| **Trend scout** | `trend` | Quét trend đồ uống/format viral, lọc 3 cổng → feed `post`+`menu-eng` | ✅ mới xây |

### TẦNG 3 — KHÁCH HÀNG

| Agent | Skill | Chức năng | Trạng thái |
|---|---|---|---|
| **CRM/Retention** | `khach` | RFM segment + winback draft + thank-you Champions | ✅ |
| **Loyalty** | GAS `Loyalty.gs` | 10 tem = 1 free + Zalo notify | ✅ |
| **Review monitor** | `review` | Pull review pending → sentiment → draft phản hồi → alert critical | ✅ mới lên skill |

### TẦNG 4 — PHÂN TÍCH & RA QUYẾT ĐỊNH

| Agent | Skill | Chức năng | Trạng thái |
|---|---|---|---|
| **Brief sáng** | `sang` | KPI hôm qua + top 3 ưu tiên + checklist mở quán | ✅ |
| **Review tuần** | `tuan` | Tổng kết tuần + plan tuần sau | ✅ |
| **Đo lường ROI** | `roi` | Post/promo nào ĐẺ RA ĐƠN? Campaign nào lãi thật? + verdict SCALE/KILL | ✅ mới xây |
| **Menu Engineering** | `menu-eng` | Stars/Dogs matrix → giữ/bỏ món (data `?action=menu_engineering_data`) | ✅ mới lên skill |
| **Đối thủ** | `doi-thu` | Quét quán Lâm Hà: giá, món hot, promo; deep → `cafe-insight` | ✅ mới lên skill |

### TẦNG 5 — CHIẾN LƯỢC & MỞ RỘNG

| Agent | Skill | Chức năng | Trạng thái |
|---|---|---|---|
| **Mở rộng** | `mo-rong` | Brainstorm 4 trục cơ hội theo quý | ✅ |
| **Deep Research** | `cafe-insight` | Multi-step: competitor + trend + batch content | ✅ |

### ĐIỀU PHỐI

| Agent | Skill | Chức năng | Trạng thái |
|---|---|---|---|
| **Orchestrator** | `cafe-manager` | Router: nghe yêu cầu → gọi đúng skill | ✅ |

---

## TỔNG KẾT TRẠNG THÁI

```
✅ Đã có:        23 agent/module  → bộ khung "AI Agent Company" ĐẦY ĐỦ
🟡 Một phần:      0
🔴 Chưa có:       0
```

**Kết luận (2026-06-07):** Bản đồ agent ĐÃ KÍN — không còn ô 🟡/🔴.
- TẦNG 4 / Đo lường → `/roi` (+ backend `gas/Marketing.gs`, endpoint `roi_data`)
- Menu Engineering → `/menu-eng` · Đối thủ → `/doi-thu`
- Review monitor → `/review` · Trend scout → `/trend`

Việc còn lại không phải XÂY agent nữa, mà là **VẬN HÀNH**: deploy GAS, đặt nhịp chạy định kỳ, và **nối chuỗi tự chạy** (việc 3).

---

## CHUỖI AGENT TỰ CHẠY (mục tiêu kết nối)

Ví dụ vòng lặp giữ chân khách — nối nhiều Agent thành 1 workflow:

```
[khach] phát hiện nhóm "At Risk" sắp rời
   ↓ tự động
[promo] sinh ưu đãi winback phù hợp
   ↓
[post] sinh nội dung đăng + Zalo broadcast draft
   ↓
CHỦ QUÁN duyệt 1 lần  ←─ điểm con người can thiệp duy nhất
   ↓
GAS gửi Zalo + ghi PROMOTIONS
   ↓
[Đo lường ROI] tuần sau: bao nhiêu khách quay lại? lãi/lỗ?
   ↓ feed ngược về [khach]
```

---

## LỘ TRÌNH 3 BƯỚC TIẾP THEO

1. ~~**Xây [Đo lường ROI]**~~ ✅ XONG (2026-06-07) — skill `/roi` + reference `roi-measurement.md` + backend GAS (`gas/Marketing.gs`, ORDERS cột `utm_campaign`, endpoint `?action=roi_data`). **Cần deploy:** `cd gas && clasp push` → trong Apps Script editor chạy `initMarketingLog()` (+ `seedMarketingLogSamples()` nếu muốn test).
2. ~~**Hệ thống hóa [Đối thủ] + [Menu Engineering]**~~ ✅ XONG (2026-06-07) — `/menu-eng` (dùng endpoint `menu_engineering_data` có sẵn) + `/doi-thu` (deep delegate `cafe-insight`) + reference `competitor-scan.md`.
3. **Nối chuỗi tự chạy** — bắt đầu từ vòng lặp giữ chân khách ở trên.
4. **Xây [Trend scout]** 🔴 — agent cuối còn thiếu: quét trend đồ uống/format viral → feed `/post` + `/menu-eng`.
```

---

## 🖥️ OPS DASHBOARD (web/dashboard.html) — 2026-06-07

Trang điều hành tổng cho chủ quán. 1 file, login mật mã (admin session), auto-refresh 90s.

```
web/dashboard.html ──GET ?action=dashboard_summary&token=── GAS getDashboardSummary()
  Cards: KPI hôm nay · Đơn live · Két ca · Tồn kho thấp · Bảo trì tới hạn
         · Review chờ trả lời · Promo (bật/tắt) · RFM · 🤖 Agent insights
```

**2 mặt điều khiển (quan trọng):**
- **Live ops** (web) → đọc state thật từ GAS, điều khiển toggle (promo, mark paid qua KDS).
- **Agent chiến lược** (`/roi`, `/trend`...) → chạy trong Claude Code, KHÔNG trên web. Output được agent POST lên `AGENT_INSIGHTS` → hiện ở card "Agent insights".

**Quy tắc mở rộng:** thêm tính năng mới = (1) thêm 1 khối `try` trong `getDashboardSummary()` + (2) thêm 1 card trong `dashboard.html`. Agent mới → thêm bước `log_agent_insight` (đã ghi trong SKILL.md).

---

## ✅ CHECKLIST DEPLOY (chạy 1 lần trước khi dùng)

```
1. cd gas && clasp push
2. Apps Script editor → chạy:
   - migrateForRoiAgent()      → cột utm_campaign + tab MARKETING_LOG
   - initAgentInsightsSheet()  → tab AGENT_INSIGHTS (cho dashboard)
   (Sheet mới hoàn toàn: initAllSheets() đã gồm tất cả tab trên)
3. Apps Script → Deploy → Manage deployments → Edit → NEW VERSION
   (BẮT BUỘC — clasp push KHÔNG tự cập nhật URL /exec)
4. Deployment access = "Anyone"  (agent + web fetch cần)
5. CONFIG: đặt ADMIN_USERNAME + ADMIN_PASSWORD_HASH (SHA256) cho dashboard login
   + điền secrets thật: TELEGRAM_BOT_TOKEN, ZALO_OA_TOKEN, VIETQR_ACCOUNT
6. Deploy web/ (Cloudflare Pages / GitHub Pages) → mở dashboard.html
```

---

## 🔗 AGENT CHAINS — chuỗi tự chạy (việc 3 · 2026-06-07)

Tầng cao nhất: nối agent rời rạc thành workflow. **1 gate duyệt/chuỗi · đóng vòng bằng /roi · đổ insight về Dashboard.**

```
CHUỖI 1 Winback    /khach → /promo → /post → ⛔duyệt → gửi → +14d /roi → insight   [/winback-loop]
CHUỖI 2 Trend-Test /trend → /menu-eng|/post → ⛔duyệt → thử → +7-14d /roi → insight [/trend-loop]
CHUỖI 3 Weekly     /tuan → /roi → (đầu tháng) /menu-eng+/doi-thu → ⛔duyệt plan      [/tuan full]
CHUỖI 4 Reputation /review → ⛔duyệt → markResponded → pattern→/bao-tri → insight     [/review]
CHUỖI 5 Daily      /sang đọc dashboard_summary → top 3 + điều hướng (no gate)        [/sang]
```

Chi tiết + data handoff + anti-pattern: `references/agent-chains.md` · lịch chạy: `automation-registry.md` Layer D.

**Mô hình hoàn chỉnh:** Tool → Workflow → **Chain** → Company. Con người chỉ chạm 1 gate/chuỗi; mọi kết quả hiện 1 chỗ trên Ops Dashboard.

---

## 🎛️ OPS DASHBOARD v2 — bàn điều khiển đầy đủ (2026-06-07)

`web/dashboard.html` — app nhiều tab, login mật mã (chung tài khoản MitsuCam):

| Tab | Làm được |
|---|---|
| 📊 Tổng quan | KPI/đơn/két/kho/bảo trì/review/RFM/agent-insights (đọc) |
| 🍵 Menu & Giá | **Sửa trực tiếp**: giá M/L, vốn, bật-tắt bán, bật promo + giá promo; thêm món |
| 📦 Kho & Nguyên liệu | **Sửa**: tồn, ngưỡng min, giá/ĐV, NCC; thêm nguyên liệu |
| 👤 Nhân viên | **Sửa**: vai trò, ca, lương/giờ, đang làm; thêm NV |
| 🏷️ Promo | Bật/tắt campaign (tạo mới qua /promo) |
| ⚙️ Cấu hình | Sửa CONFIG an toàn (in tem, loyalty, info quán) — KHÔNG đụng token/secret |
| 🤖 Agents & Chat | 16 nút agent + khung chat ra lệnh Claude |

**Backend:** `gas/Admin.gs` (CRUD theo header, token-guard, config allowlist) · `gas/Commands.gs` (COMMAND_QUEUE).
**Endpoint:** `admin_data` · `menu_update/add` · `inventory_update/add` · `staff_update/add` · `promo_toggle` · `config_set` · `queue_command` · `command_queue` · `command_update`.

### Cầu nối Chat → Claude (Command Queue)
```
Chat/nút dashboard → queue_command → COMMAND_QUEUE (status=pending)
   → Claude Code chạy /inbox: nhặt pending → route skill → thực thi (draft, không tự gửi)
   → command_update (status=done + result) → dashboard hiện kết quả như chat
```
Không real-time (trễ = nhịp /inbox). Máy phải bật Claude Code. Dùng đúng gói hiện tại, 0đ thêm.
Tự động: scheduled task chạy `/inbox` mỗi 2-5 phút.
