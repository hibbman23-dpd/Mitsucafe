# Spec — Subagent `cafe-insight` (Content → Doanh số Analytics)

**Date:** 2026-06-20
**Status:** Approved design (đã tích hợp góp ý chủ quán v2), chờ implementation plan
**Author:** brainstorm với chủ quán (Mitsu / Lâm Hà Kissaten)

> **v2 (2026-06-20):** Tích hợp 5 góp ý chủ quán sau khi đối chiếu codebase thật.
> Thay đổi lớn nhất: **KHÔNG tạo `CONTENT_LOG` riêng** — thay vào đó **mở rộng `MARKETING_LOG`**
> (vì `Marketing.gs` đã tuyên bố nó là "nơi DUY NHẤT lưu chi phí" và đã có utm_tag/reach/clicks/platform;
> `getRoiData()` đã đọc tab này → engagement data tự động có mặt, không cần JOIN dễ gãy).

---

## 1. Mục tiêu

Một subagent phân tích toàn diện **gộp luôn `cafe-research`**, biến dữ liệu đa nền tảng (FB, IG, TikTok, Threads, Google/web) thành **quyết định kinh doanh tăng doanh số**. Đo ở **mức từng bài đăng** (content-level), đối soát với ORDERS, menu mix, và hoàn cảnh cụ thể của quán.

Câu hỏi subagent phải trả lời mỗi lần chạy:
1. Bài nào **đáng đẩy** (SCALE), bài nào **bỏ** (KILL), bài nào **sửa** (ITERATE)?
2. Content đó đẩy **món nào**, lời thật bao nhiêu (sau COGS + discount)?
3. Kéo về khách **mới vãng lai** hay **khách quay lại** (LTV)?
4. Tuần tới nên **đăng gì / đẩy món gì**, và cần **chuẩn bị tồn kho** ra sao?

## 2. Phạm vi (scope)

**Trong scope:**
- Subagent definition `cafe-insight` (gộp `cafe-research`, thay thế file cũ).
- **Mở rộng `MARKETING_LOG`** thêm cột engagement chiều sâu (KHÔNG tạo CONTENT_LOG riêng).
- 1 tab Sheets mới: `DECISION_LOG`.
- Panel nhập tay trong `web/dashboard.html` → ghi 1 dòng `MARKETING_LOG` qua `logMarketingActivity()`.
- GAS: mở rộng schema + (giai đoạn sau) pull Meta Graph API + health-check token.
- Khung phân tích 4 tầng (Descriptive→Diagnostic→Predictive→Prescriptive) + 7 module.

**Ngoài scope (ghi nhận, không làm đợt này):**
- MMM đầy đủ (Meta Robyn/Google Meridian) — chỉ **bắt đầu log dữ liệu** để ~2 năm sau chạy được.
- Auto-publish lên social (luôn draft-only — giữ guardrail cũ).
- TikTok/Threads API tự động (giữ nhập tay; chỉ FB+IG auto qua Meta).

## 3. Triết lý đo lường — stack 3 lớp

| Lớp | Trả lời | Tần suất | Cài đặt trong quán |
|---|---|---|---|
| **Attribution** | Touchpoint nào ghi công đơn? | Hằng ngày, định hướng | UTM last-click **+ phone-match** (2 đường chéo nhau) |
| **Incrementality** | Có thật nhờ post không? | Khi nghi ngờ | So tuần có-post vs không-post (before/after, holdout nhẹ) |
| **MMM** | Chia ngân sách/công sức kênh nào? | Dài hạn (tương lai) | Chưa chạy — chỉ log dữ liệu tuần từ giờ |

**Phone-match attribution — giới hạn & cơ chế thật (góp ý 1):**
> ⚠️ Meta API **KHÔNG BAO GIỜ** trả SĐT của người tương tác organic (view/like/share) — vì bảo mật. Phone-match **không tự động** ghép được khách vãng lai.

Phone-match chỉ chạy khi có **bảng ánh xạ social-id ↔ SĐT**. Hiện `CUSTOMERS` **chưa có** cột này (chỉ có `customer_id`=SĐT, `zalo_id`). Vì vậy:
- **Cần làm trước (P3):** thêm cột `fb_psid`, `ig_igsid` vào `CUSTOMERS` + **luồng bắt mapping** (khách nhắn Fanpage/IG qua chatbot hỏi SĐT tích điểm, hoặc quét QR order nhập SĐT).
- **Phạm vi:** Module 1 chỉ phone-match với khách **đã có social-id link**. Khách organic mới hoàn toàn → mặc định **UTM** hoặc xếp nhóm **`unattributed`** (không bịa ghi công).

**Cửa sổ attribution (định nghĩa rõ để khỏi ghi công bừa):**
- UTM last-click → đơn trong **72h** kể từ click.
- Phone-match (P3) → đơn trong **7 ngày** kể từ tương tác.
- Tới giờ chưa có phone-match: attribution = **UTM** + (tuỳ chọn) trường "nguồn biết quán" nhập tay lúc order; phần còn lại = `unattributed`.

**Benchmark ngành F&B 2026 (để chấm điểm tương đối, không tuyệt đối):**
- Engagement rate tốt: TikTok **3.0–3.5%**, IG **2.0–2.5%**.
- Video/Reels luôn thắng ảnh tĩnh.
- **Save + Share = tín hiệu ý định mua** (đáng trọng số cao hơn like).
- Chỉ số "ra tiền": **doanh thu, AOV, tỉ lệ khách quay lại** > view.

## 4. Kiến trúc & luồng dữ liệu

```
[FB/IG]──Meta Graph API (System User token, non-expiring)──┐
[TikTok/Threads]──nhập tay qua dashboard panel─────────────┤
[Web]──GA4 Data API + Cloudflare─────────────────────────  ┤
                                                           ▼
                              [Google Sheets]
              CONTENT_LOG · ORDERS · CUSTOMERS · MENU · PROMOTIONS · INVENTORY
                                                           ▼
                        [subagent cafe-insight]
        ETL+Attribution → Scorecard → Sales×Menu → Funnel →
        Context → Incrementality+Forecast → Decision+Research
                                                           ▼
       Outputs: weekly insight report · per-post scorecard ·
       DECISION_LOG · feed lệnh cho /post /promo /menu-eng /trend
```

## 5. 7 Module (các "ban" của phòng insight)

| # | Module | Làm gì | Nối |
|---|---|---|---|
| 1 | **ETL & Attribution** | Đọc `getRoiData()` (ORDERS+PROMOTIONS+MARKETING_LOG+menu_costs) + GA4 + Meta API; ghép đơn theo UTM (72h) + phone-match (P3, chỉ khách có social-id) + cửa sổ thời gian; phần dư = `unattributed` | `getRoiData`, CONFIG token |
| 2 | **Content Scorecard** | Chấm từng post: reach, ER, save+share, watch-time/retention, CTR, đơn & doanh thu ghi công — **so benchmark** + **SWOT** + **tự tính `confidence_level`** (xem §6.1) | MARKETING_LOG |
| 3 | **Sales × Menu mix** | Post đẩy món nào; tỉ lệ bán giữa món, AOV, attach-rate; Stars/Plowhorses/Puzzles/Dogs | `/menu-eng` |
| 4 | **Funnel & Cohort** | Reach→Click→Đơn→Quay lại (RFM); khách mới vs cũ; chỗ rớt | `/khach`, `RFM.gs` |
| 5 | **Context engine (baseline normalizer)** | **Lọc nhiễu TRƯỚC khi chấm điểm**: thứ/ngày, thời tiết (mưa đèo/sương), payday, khách du lịch cuối tuần (Đà Lạt/Bảo Lộc), promo, đối thủ → tách lift "do nội dung" vs "do thời điểm" (xem §6.4) | `/doi-thu`, PROMOTIONS |
| 6 | **Incrementality & Forecast** | Lift tuần post vs không-post; dự báo cầu món → cảnh báo tồn kho | INVENTORY, `/huy` |
| 7 | **Decision & Research** | SCALE/KILL/ITERATE mỗi post; danh mục 70-20-10; lệnh cho `/post` `/promo`; ghi `DECISION_LOG`; + research ngoài (đối thủ, trend) gộp từ `cafe-research` | `/roi`, `/trend`, `/post` |

## 6. Phần bổ sung (góc nhìn phòng chiến lược)

**6.1 Confidence level (subagent TỰ TÍNH, không phải cột nhập tay)** — N nhỏ → 1 post lên đơn có thể là may (vd 1 khách quen click rồi đặt đơn văn phòng 500k làm lệch ROI). Mỗi scorecard gắn cờ:
- `LOW` — clicks < 30 **hoặc** đơn ghi công < 3 → "tham khảo, **đừng** đổi chiến lược/dồn tiền boost".
- `MEDIUM` — clicks 30–100, đơn 3–10.
- `HIGH` — clicks > 100, đơn > 10.

**6.2 Margin chứ không chỉ doanh thu** — `getRoiData()` đã trả `menu_costs` + `cost_vnd` từ MARKETING_LOG → mỗi quyết định gắn COGS + discount → **lãi gộp thật**, tránh post promo "nhiều đơn nhưng lỗ".

**6.3 Chất lượng khách (LTV)** — dùng `RFM.gs`: phân biệt content kéo khách vãng lai 1 lần vs khách trung thành.

**6.4 Context engine = bộ lọc nhiễu (chạy TRƯỚC khi chấm điểm)** — chuẩn hoá baseline rồi mới đánh giá:
- Matcha tăng vọt ngày mưa lạnh → ghi lift do **thời tiết**, **không** vội chấm post Matcha là SCALE.
- Save/Share cao nhưng đơn ít do mưa bão → chấm **ITERATE** (nội dung tốt, thời tiết cản), **không** KILL.

**6.5 DECISION_LOG + cơ chế review +14d** — ghi mỗi quyết định + ngày review. **Mỗi lần chạy, subagent quét DECISION_LOG tìm dòng tới hạn review** → điền `actual_result` + `hit_or_miss` → quán học dần, không lặp lỗi.

**6.6 Panel nhập tay (dashboard)** — form nhập số post TikTok/Threads (+ FB/IG khi token chết) → gọi `logMarketingActivity()` ghi **1 dòng MARKETING_LOG** (`data_source=manual`) → rồi mới phân tích.

## 7. Token Meta — vấn đề & giải pháp

Meta có 3 loại token: User (~1–2h), Long-lived user (~60 ngày), **System User (không hết hạn)**.

Giải pháp 3 lớp:
1. **System User token** qua Business Manager, scope `pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights` → vĩnh viễn.
2. **Cất trong CONFIG**, key **`META_SYSTEM_TOKEN`**, không nhúng code (guardrail `❌ Token/key trong code`).
3. **Health-check trigger** (`checkMetaTokenHealth()`, ≥15 phút — chạy 1 lần/ngày) gọi endpoint rẻ; token chết → kênh **tự rớt xuống nhập tay** (không kẹt cứng) + `sendTelegramAlert()` **kèm hành động cụ thể** (góp ý 5):
   > ⚠️ Token Meta đã hết hạn. Hệ thống **tự chuyển FB/IG sang chế độ nhập tay**. Vui lòng tạo token mới (link hướng dẫn) → dán vào tab `CONFIG` → key `META_SYSTEM_TOKEN`.

## 8. Schema Sheets

### 8.1 Mở rộng `MARKETING_LOG` (KHÔNG tạo CONTENT_LOG)

Giữ nguyên 12 cột hiện có (`Marketing.gs:16`), **append** cột mới ở cuối (index ≥12 → không phá code đọc-theo-index hiện tại như `getMarketingLog`):

```
[hiện có] activity_id | date | type | platform | campaign_id | title |
          utm_tag | cost_vnd | effort_hours | reach | clicks | notes
[thêm]    impressions | views | likes | comments | shares | saves |
          watch_time_sec | avg_watch_pct | format | topic | sku_featured | data_source
```

- `activity_id` (MKT-YYYYMMDD-XXX) làm khoá post — tái dùng, không đẻ key mới.
- **Controlled vocab** (để aggregate được):
  - `format`: `reel | photo | carousel | story | live | text`
  - `topic`: `mon-spotlight | behind-scene | promo | ugc | trend | thong-bao | khac`
  - `data_source`: `auto | manual`
- `confidence_level` **KHÔNG** lưu ở đây — subagent tính lúc phân tích (§6.1).
- Cập nhật `MARKETING_LOG_HEADERS`, `logMarketingActivity()`, `getMarketingLog()`, `getRoiData()` để đọc/ghi cột mới.

### 8.2 Tab mới `DECISION_LOG`

```
decision_id | date | scope(post|menu|promo|channel) | ref_id(=activity_id…) |
decision(SCALE|KILL|ITERATE) | rationale | expected_metric |
review_date(+14d) | actual_result | hit_or_miss
```

Tạo bằng `initDecisionLog()` (idempotent, theo mẫu `initMarketingLog`). `decision_id` format `DEC-YYYYMMDD-XXX`.

### 8.3 Mở rộng `CUSTOMERS` (chỉ P3 — cho phone-match)

Thêm `fb_psid`, `ig_igsid` (append cuối, `RFM.gs` đọc theo tên header nên an toàn).

## 9. Định nghĩa subagent

- File: `.claude/agents/cafe-insight.md` (thay `cafe-research.md`).
- Tools: `WebSearch, WebFetch, Read, Write, Bash, Glob, Grep, Skill`.
- Giữ nguyên các nguyên tắc cũ (brand voice, draft-only, save vào `docs/`, không loop subagent, output ngắn gọn).
- Thêm: workflow 4 tầng phân tích, 7 module, đọc `getRoiData()`/MARKETING_LOG/ORDERS, compose với `/menu-eng /khach /roi /doi-thu /trend /post /promo`.
- Giữ lại toàn bộ 5 use-case research cũ của `cafe-research` (competitor scan, batch content, RFM, reviews, trend) như "chế độ research" của Module 7.

## 10. Tiêu chí thành công

- Nhập 1 batch post vào MARKETING_LOG (qua panel) → subagent ra **scorecard + SWOT + SCALE/KILL/ITERATE** cho từng post, có **đối soát đơn** (UTM, phone-match khi P3) và **menu mix**.
- Mỗi kết luận có **confidence_level** (tự tính) và **lãi gộp thật** (trừ COGS + discount).
- Quyết định ghi vào DECISION_LOG; lần chạy sau tự điền `actual_result` cho dòng tới hạn +14d.
- Context engine tách được lift "do nội dung" vs "do thời tiết/payday" trước khi chấm điểm.
- Token Meta sống qua System User; health-check rớt-xuống-nhập-tay + Telegram báo có hành động.
- `cafe-research` cũ vẫn chạy được mọi use-case (không mất chức năng khi gộp).

## 11. Giai đoạn triển khai (đề xuất)

- **P1 — Nền tảng nhập tay (chạy được ngay, mọi nền tảng):**
  1. Mở rộng `MARKETING_LOG` (cột mới + cập nhật `MARKETING_LOG_HEADERS`/`logMarketingActivity`/`getMarketingLog`/`getRoiData`).
  2. `initDecisionLog()` + tab DECISION_LOG.
  3. Panel nhập liệu trong `web/dashboard.html` → `logMarketingActivity()`.
  4. Định nghĩa subagent `.claude/agents/cafe-insight.md` (thay `cafe-research.md`), Module 1–7 + giữ 5 use-case research cũ.
- **P2 — Auto FB/IG + Web:** `pullMetaInsights()` + `checkMetaTokenHealth()` trong `Marketing.gs`; `META_SYSTEM_TOKEN` vào CONFIG; trigger health-check. **+ GA4 Data API** (advanced service trong GAS) kéo traffic/landing web (kênh `landing`) vào MARKETING_LOG/ETL.
- **P3 — Chiều sâu + phone-match:** thêm `fb_psid`/`ig_igsid` vào CUSTOMERS + luồng bắt mapping; incrementality (post vs không-post); forecast tồn kho; DECISION_LOG review loop +14d.
- **P4 (tương lai):** tích đủ ~2 năm dữ liệu tuần → cân nhắc MMM (Robyn/Meridian).

---

## Open questions

(Không còn — các điểm chốt đã thống nhất trong brainstorm: mức A content-level, Meta API + nhập tay, gộp cafe-research, panel dashboard, phone-match + UTM, benchmark tương đối.)
