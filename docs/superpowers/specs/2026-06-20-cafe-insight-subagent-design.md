# Spec — Subagent `cafe-insight` (Content → Doanh số Analytics)

**Date:** 2026-06-20
**Status:** Approved design, chờ implementation plan
**Author:** brainstorm với chủ quán (Mitsu / Lâm Hà Kissaten)

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
- 2 tab Sheets mới: `CONTENT_LOG`, `DECISION_LOG`.
- Panel nhập tay trong `web/dashboard.html` → ghi `CONTENT_LOG` qua GAS.
- GAS: endpoint nhận content metrics + (giai đoạn sau) pull Meta Graph API + health-check token.
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

**Phone-match attribution (điểm mạnh riêng của quán):** `customer_id = SĐT chuẩn hóa` trong CUSTOMERS. Người tương tác/click post → sau đó đặt đơn bằng **cùng SĐT** → ghép được dù không qua UTM. Subagent dùng song song UTM + phone-match để tăng độ chính xác.

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
| 1 | **ETL & Attribution** | Hút GA4 + Meta API + CONTENT_LOG + ORDERS; ghép đơn theo UTM + phone-match + cửa sổ thời gian | CONFIG token |
| 2 | **Content Scorecard** | Chấm từng post: reach, ER, save+share, watch-time/retention, CTR, đơn & doanh thu ghi công — **so benchmark** + **SWOT** | CONTENT_LOG |
| 3 | **Sales × Menu mix** | Post đẩy món nào; tỉ lệ bán giữa món, AOV, attach-rate; Stars/Plowhorses/Puzzles/Dogs | `/menu-eng` |
| 4 | **Funnel & Cohort** | Reach→Click→Đơn→Quay lại (RFM); khách mới vs cũ; chỗ rớt | `/khach` |
| 5 | **Context engine** | Phủ hoàn cảnh: thứ/ngày, thời tiết, lễ/payday, promo đang chạy, đối thủ → tách "do nội dung" vs "do thời điểm" | `/doi-thu`, PROMOTIONS |
| 6 | **Incrementality & Forecast** | Lift tuần post vs không-post; dự báo cầu món → cảnh báo tồn kho | INVENTORY, `/huy` |
| 7 | **Decision & Research** | SCALE/KILL/ITERATE mỗi post; danh mục 70-20-10; lệnh cho `/post` `/promo`; + research ngoài (đối thủ, trend) gộp từ `cafe-research` | `/roi`, `/trend`, `/post` |

## 6. Phần bổ sung (góc nhìn phòng chiến lược)

1. **Tín hiệu vs nhiễu** — N nhỏ → 1 post lên đơn có thể là may. Gắn **cờ độ tin cậy** (baseline + trung bình trượt). Không đổi cả chiến lược vì 1 bài.
2. **Margin chứ không chỉ doanh thu** — mỗi quyết định gắn COGS + discount → **lãi thật**, tránh post promo "nhiều đơn nhưng lỗ".
3. **Chất lượng khách (LTV)** — phân biệt content kéo khách vãng lai 1 lần vs khách trung thành.
4. **DECISION_LOG** — ghi quyết định + kết quả +14 ngày → quán học dần, không lặp lỗi.
5. **Panel nhập tay (dashboard)** — form nhập số post TikTok/Threads (+ FB/IG khi token chết) → CONTENT_LOG qua GAS → rồi mới phân tích.

## 7. Token Meta — vấn đề & giải pháp

Meta có 3 loại token: User (~1–2h), Long-lived user (~60 ngày), **System User (không hết hạn)**.

Giải pháp 3 lớp:
1. **System User token** qua Business Manager, scope `pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights` → vĩnh viễn.
2. **Cất trong CONFIG, không nhúng code** (guardrail `❌ Token/key trong code`).
3. **Health-check trigger** (≥15 phút/ngày 1 lần) gọi endpoint rẻ; token chết → `sendTelegramAlert()`; kênh đó **tự rớt xuống nhập tay** → không kẹt cứng, chỉ degrade.

## 8. Schema Sheets mới

**`CONTENT_LOG`** (1 dòng = 1 bài đăng / 1 nền tảng):
```
post_id | platform | post_url | post_date | format | topic | sku_featured |
reach | impressions | views | likes | comments | shares | saves |
watch_time_sec | avg_watch_pct | link_clicks | utm_tag |
boost_cost | data_source(auto|manual) | logged_at | notes
```

**`DECISION_LOG`** (1 dòng = 1 quyết định):
```
decision_id | date | scope(post|menu|promo|channel) | ref_id |
decision(SCALE|KILL|ITERATE) | rationale | expected_metric |
review_date(+14d) | actual_result | hit_or_miss
```

(Tên tab UPPERCASE đúng naming convention; `post_id` format `POST-YYYYMMDD-XXX`.)

## 9. Định nghĩa subagent

- File: `.claude/agents/cafe-insight.md` (thay `cafe-research.md`).
- Tools: `WebSearch, WebFetch, Read, Write, Bash, Glob, Grep, Skill`.
- Giữ nguyên các nguyên tắc cũ (brand voice, draft-only, save vào `docs/`, không loop subagent, output ngắn gọn).
- Thêm: workflow 4 tầng phân tích, 7 module, đọc CONTENT_LOG/ORDERS, compose với `/menu-eng /khach /roi /doi-thu /trend /post /promo`.
- Giữ lại toàn bộ 5 use-case research cũ của `cafe-research` (competitor scan, batch content, RFM, reviews, trend) như "chế độ research" của Module 7.

## 10. Tiêu chí thành công

- Nhập 1 batch post vào CONTENT_LOG (qua panel) → subagent ra **scorecard + SWOT + SCALE/KILL/ITERATE** cho từng post, có **đối soát đơn** (UTM/phone-match) và **menu mix**.
- Mỗi kết luận có **cờ độ tin cậy** và **lãi thật** (không chỉ doanh thu).
- Quyết định ghi vào DECISION_LOG, có ngày review +14d.
- Token Meta sống qua System User; health-check báo Telegram khi chết.
- `cafe-research` cũ vẫn chạy được mọi use-case (không mất chức năng khi gộp).

## 11. Giai đoạn triển khai (đề xuất)

- **P1 — Nền tảng nhập tay:** CONTENT_LOG + DECISION_LOG schema, panel dashboard, GAS endpoint nhận metrics, subagent đọc & phân tích. → **chạy được ngay, mọi nền tảng.**
- **P2 — Auto FB/IG:** System User token, Meta Graph pull, health-check trigger.
- **P3 — Chiều sâu:** incrementality (post vs không-post), forecast tồn kho, DECISION_LOG review loop +14d.
- **P4 (tương lai):** tích đủ dữ liệu tuần → cân nhắc MMM (Robyn/Meridian).

---

## Open questions

(Không còn — các điểm chốt đã thống nhất trong brainstorm: mức A content-level, Meta API + nhập tay, gộp cafe-research, panel dashboard, phone-match + UTM, benchmark tương đối.)
