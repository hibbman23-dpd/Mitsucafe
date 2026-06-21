# 🗺️ MASTER WORKFLOW v3.0 — Mitsu / Lâm Hà Kissaten

> Cập nhật 2026-06-21. Thay thế bản v2.0 (file `master-v3.tsx` — 18 module kế hoạch).
> **v3 = phản ánh ĐÚNG những gì ĐÃ BUILD + xương sống SCALE đa chi nhánh.**
> Quyết định chủ quán (2026-06-21): xuất cả markdown+tsx · data scale = **1 spreadsheet/chi nhánh + HQ rollup** · quy mô **2–3 CN sở hữu** trong 12–18 tháng (thiết kế sẵn sàng scale, làm gọn cho 2-3 CN).

---

## 0. Triết lý (giữ từ v2.0 — đã được kiểm chứng đúng)
Event-driven · Schema-first (`location_id`/`category_type`/`business_line` từ ngày 1) · Free-tier-first · No-code-first (code chỉ ở GAS) · Offline-ready (4 cấp) · **Scale bằng config, không rebuild**.
Lõi bất biến: **GAS = event bus duy nhất · Sheets = database · ORDERS append-only · `order_id` khoá chính · `customer_id` = SĐT chuẩn hoá.**

---

## 1. BẢN ĐỒ MODULE THỰC TẾ (v3) — ~29 GAS module + 3 lớp v2.0 chưa có

> Trạng thái: ✅ built & chạy thật · 🟡 built một phần · 🔌 code xong, tắt chờ · 📋 plan.

### Tier 0 — CORE EVENT BUS & DATA
| Module | File | TT |
|---|---|---|
| Event bus / router | `Code.gs` (doPost/doGet) | ✅ |
| Order Core | `Orders.gs` | ✅ |
| Menu Manager | `Menu.gs` | ✅ |
| Payment (VietQR + watchdog) | `Payment.gs` | ✅ |
| Utils / Config / logError→ERROR_LOG | `Utils.gs`, `SeedSheets.gs` | ✅ |

### Tier 1 — FULFILLMENT & OPS
| Invoice (tem ly + bill nhiệt + PDF) | `Invoice.gs`, `LabelPrint.gs` | ✅ |
| Notify (Telegram + Zalo) | `Notify.gs` | ✅ |
| KDS / Dashboard admin | `Dashboard.gs` + web | ✅ |
| Devices / auth / session token | `Devices.gs`, `Admin.gs` | ✅ |
| Triggers nền | `OpsTriggers.gs` | ✅ |
| Maintenance (bảo trì thiết bị) | `Maintenance.gs` | ✅ |
| Offline & failover 4 cấp | `ops/` + giấy A5 | ✅ |

### Tier 2 — FINANCE (v2.0 KHÔNG có)
| Cash recon (chốt ca / Z-report) | `CashRecon.gs` | ✅ |
| Financials / EXPENSES / close-month | `Financials.gs` | ✅ |
| Waste (hao hụt nguyên liệu) | `Waste.gs` | ✅ |

### Tier 3 — CUSTOMER & MARKETING
| RFM / CRM | `RFM.gs` | ✅ |
| Loyalty stamps | (loyalty-stamps.md) | 🟡 |
| Reviews monitor | `Reviews.gs` | ✅ |
| Signage / TV | `Signage.gs` + studio | ✅ |
| Promo / campaign scheduler | `Marketing.gs` + skill `/promo` | ✅ |
| Marketing analytics P1 (MARKETING_LOG + DECISION_LOG) | `Marketing.gs`, `Insight.gs` | ✅ |
| Web traffic GA4 | `WebTraffic.gs` | 🟡 (API thông, chờ traffic) |
| Meta FB/IG/Threads | `Meta.gs` | ✅ |
| TikTok (yt-dlp → ingest) | `TikTokScrape.gs` + `ops/tiktok_pull.sh` | ✅ |
| GBP/Maps | `GbpPerf.gs` | 🔌 chờ duyệt API |
| Zalo OA | `Zalo.gs` | 🔌 chờ token |

### Tier 4 — AI OPERATIONS (v2.0 KHÔNG có — lớp mới quan trọng nhất)
| subagent `cafe-insight` | attribution + ROI + MMM + forecast + review-loop | ✅ |
| skill `cafe-manager` (20+ lệnh) | post/promo/roi/khach/menu-eng/doi-thu/trend/huy/chot-ca/bao-tri/review/sang/tuan/web/inbox/mo-rong/winback-loop/trend-loop | ✅ |
| Command queue + dispatcher (chat→Claude Code) | `Commands.gs` + `ops/dispatcher.sh` | ✅ |
| Camera AI | `CameraAI.gs` + `ops/camera_ai.py` | 🟡 |
| Decision review loop +14d | `Insight.gs` | ✅ |

### Tier 5 — SCALE / MULTI-BRANCH (mục §3)
| location partition · HQ rollup · config push-down · branch RBAC · deploy fan-out | 📋 **cần xây — xem §3** |

**Tự động hoá deploy:** `ops/deploy_gas.js` — 1 lệnh push + version + retarget + smoke-test.

---

## 2. KIẾN TRÚC v3
```
[8 kênh] web·qr·zalo·phone·maps·fb·ig·tiktok
   ↓ webhook / UTM
[GAS EVENT BUS]  doPost/doGet → validate → route → track → invoice → promo → log
   ↓                                   ↑ (đọc)
[Sheets DB]  ORDERS·MENU·INVENTORY·CUSTOMERS·STAFF·PROMOTIONS·CONFIG
             + MARKETING_LOG·DECISION_LOG·WEB_TRAFFIC·GBP_DAILY·EXPENSES·WASTE_LOG·ERROR_LOG
   ↓ outputs                          ↑ analytics
[Xprinter tem/bill] [Telegram] [Zalo] [KDS/TV] [VietQR] [Dashboard]
   ↑
[LỚP AI OPS]  cafe-insight (phân tích) · cafe-manager (vận hành) · dispatcher (chat→Claude Code) · CameraAI
   ↑ chạy trên Mac mini 24/7 (print server + dispatcher + cron pulls)
```

---

## 3. ⚙️ XƯƠNG SỐNG SCALE ĐA CHI NHÁNH (trọng tâm v3)

**Mô hình chốt: 1 spreadsheet/chi nhánh + 1 HQ rollup.** Free, cô lập, song song, scale ~10 CN, không phá luật "không external DB".

```
CN A: Spreadsheet_A (ORDERS/INVENTORY/STAFF/CASH...) ┐
CN B: Spreadsheet_B  ─────────────────────────────── ┤→ HQ Spreadsheet (rollup ngày)
CN C: Spreadsheet_C  ─────────────────────────────── ┘   + MENU/PROMO master push xuống
         mỗi CN: 1 GAS deploy (cùng code, khác CONFIG.LOCATION_ID) + 1 Mac mini/RPi
```

### 🔴 PHẢI VÁ TRƯỚC KHI MỞ CN2 (gap chí mạng đã phát hiện)
1. **`location_id` ghi vào ORDERS nhưng KHÔNG report nào lọc theo** → mọi báo cáo (roi_data, RFM, MMM, dashboard, cash, financials, waste) **gộp chung các CN**. Với mô hình 1-sheet/CN thì mỗi GAS đọc sheet riêng của nó nên tự cô lập — NHƯNG **HQ rollup phải gắn `location_id` vào mọi dòng tổng hợp** để tách lại được. → Chuẩn hoá: mọi hàm tổng hợp nhận tham số `location_id` (hoặc gắn nhãn khi rollup).
2. **HQ rollup endpoint** (`M-HQ`): GAS ở HQ pull `getDailyRollup()` từ từng CN (qua deploy URL + token) → ghi 1 tab `HQ_DAILY` (location_id × ngày × doanh thu/đơn/cost/waste/cash variance). Subagent + Looker đọc cái này để so chi nhánh.
3. **Config push-down** (`M-Sync`): MENU + PROMO templates + brand voice biên ở HQ → đẩy xuống từng CN (hoặc CN importrange master read-only) → không phải sửa menu N lần.
4. **Branch-scoped token/RBAC** (`M-RBAC`): mỗi CN 1 REPORT_API_TOKEN riêng + device gắn `location_id`; nhân viên CN-A không đọc được data CN-B. Hiện token dùng chung 1 cái.
5. **Deploy fan-out**: `deploy_gas.js` hiện trỏ 1 deployment. Thêm tham số `--branch=B` (đọc map deploymentId theo CN) để deploy cùng code ra N CN.

### ✅ ĐÃ TRIỂN KHAI + TEST LIVE (2026-06-21, v69 — `gas/Branches.gs`)
- **M30/M31 — `getDailyRollup()` + tab `HQ_DAILY`**: rollup ngày (revenue/order/AOV/expenses/waste) với **`location_id` LÀ KHÓA ĐẦU** (góp ý #4). Route `daily_rollup` (`&record=true`→upsert HQ_DAILY idempotent) + trigger `installDailyRollupTrigger()` (1:10 sáng). Dùng NGAY cho 1 CN làm bảng KPI Looker. Test: location_id-first ✓, rev=22000 ✓.
- **M32 — `snapshotMenuFromMaster()` (góp ý #1)**: snapshot MENU cứng từ HQ master (đọc tĩnh, tránh IMPORTRANGE lag chặn đặt món), daily 3AM. **Gated OFF** khi chưa set `CONFIG.MENU_MASTER_SHEET_ID` → 1 CN KHÔNG bị clobber. Route `menu_snapshot`. Test: no-op, MENU giữ 27 ✓.
- **M34 — deploy fan-out (góp ý #3)**: `ops/branches.json` + `deploy_gas.js --branch=X / --all / --dry-run` (backward-compat). Test: dry-run + deploy thật v69 ✓.

### ⏸ Góp ý #2 — MARKETING_LOG/DECISION_LOG tập trung HQ: ĐÚNG nhưng HOÃN
Khi có HQ thật (CN2): MARKETING_LOG + DECISION_LOG lưu DUY NHẤT ở HQ; CN chỉ giữ ORDERS + EXPENSES; subagent cấp HQ pull rollup CN + đọc MARKETING_LOG HQ → ROI chéo. **CHƯA migrate giờ** vì 1 CN chưa có HQ + tách MARKETING_LOG ra sẽ phá `getRoiData` (đang đọc cùng sheet ORDERS) đang chạy thật.

### Làm GỌN cho 2–3 CN (không over-engineer)
- Chưa cần franchise/RBAC nặng (CN sở hữu, cùng chủ). RBAC = chỉ tách token đọc + nhãn location_id (đủ).
- HQ rollup = 1 GAS trigger/ngày pull N sheet → đủ. Chưa cần BigQuery.
- Đẩy menu = importrange từ 1 MENU_MASTER (đơn giản hơn push code).

### Khi nào leo lên DB thật (BigQuery/Firestore)?
Khi **>5 CN** hoặc ORDERS 1 CN vượt ~vài trăm nghìn dòng/năm (Sheets chậm). Lúc đó: per-branch sheet vẫn là điểm ghi, nhưng **export sang BigQuery** để phân tích chuỗi. **Thiết kế schema NGAY từ giờ cho BQ-friendly** (cột phẳng, kiểu nhất quán, có location_id) để sau export thẳng, không refactor.

### Lộ trình single → multi
1. **Giờ (1 CN):** vá location_id vào report + tách MENU_MASTER + thêm `getDailyRollup()` (dù 1 CN cũng chạy). → Sẵn sàng.
2. **CN2:** clone spreadsheet (template) + tạo GAS deploy mới (cùng code) + set CONFIG.LOCATION_ID + Mac mini/RPi + token riêng. HQ thêm 1 dòng vào danh sách CN cần pull.
3. **HQ console:** Looker Studio đọc `HQ_DAILY` → dashboard so chi nhánh + subagent cafe-insight phân tích chuỗi.

---

## 4. ☁️ GCP CHO SCALE — tận dụng credit BÂY GIỜ cho tương lai nhiều CN

> Liên kết kế hoạch credit: `docs/gcp-credit-plan.md`. Dưới đây là phần riêng cho SCALE.

| Tận dụng NGAY (1 CN) | Lợi cho scale sau này |
|---|---|
| **Looker Studio HQ dashboard (FREE)** đọc HQ_DAILY | Mở CN2/3 chỉ thêm location_id → dashboard tự tách cột so sánh. Dựng 1 lần, scale free. |
| **Schema BQ-friendly** cho ORDERS/MARKETING_LOG (cột phẳng + location_id) | Khi >5 CN → export BigQuery không phải refactor. Tài sản thiết kế, 0 phí giờ. |
| **Kho ảnh/nội dung/SEO/SOP** (credit, GĐ1 trước khai trương) | **Tài sản dùng chung mọi CN** — CN mới copy brand pack + SOP, không làm lại. Nhân giá trị theo số CN. |
| **RAG knowledge base + chatbot** (credit) | Brain CSKH chuẩn hoá → mọi CN dùng chung 1 bộ, trả lời nhất quán. |
| **Model đếm khách (credit train, chạy local)** | Mỗi CN 1 Mac mini/RPi chạy cùng model free → tỷ lệ chuyển đổi cửa từng CN để so. |
| **Gemini phân tích chuỗi** (cafe-insight đọc HQ_DAILY) | So CN nào hiệu quả, nhân rộng cái thắng. |

**Nguyên tắc giữ nguyên:** credit chỉ mua TÀI SẢN tái dùng cho mọi CN; lõi vận hành từng CN chạy free (Sheets+GAS+RPi). Fallback: hết credit, mọi CN vẫn chạy.

---

## 5. ✅ Quyết định đã chốt · ❓ để sau
**Chốt (2026-06-21):** xuất markdown+tsx · 1 sheet/CN + HQ rollup · 2-3 CN sở hữu · GCP credit → tài sản tái dùng + Looker HQ.
**Để sau khi cần (hỏi lại):** (a) ngưỡng leo BigQuery (>5 CN?); (b) franchise → RBAC chặt + onboarding chuẩn; (c) delivery module riêng; (d) chuyển Mac mini → RPi từng CN (điện/ổn định).

---
*Master Workflow v3.0 · phản ánh build thật + scale spine · 2026-06-21 · kèm `master-v3.tsx` (viz) + `docs/gcp-credit-plan.md`.*
