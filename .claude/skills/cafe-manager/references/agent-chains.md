# Reference — Agent Chains (Playbook chuỗi tự chạy)

> **Nối agent rời rạc thành workflow.** Đây là tầng "AI Workflow → AI Company" của bài chia sẻ.
> Mỗi chuỗi: nhiều agent nối tiếp · **đúng 1 GATE người duyệt** · **đóng vòng bằng /roi + log insight lên dashboard**.

## NGUYÊN TẮC CHUNG (áp cho mọi chuỗi)

1. **1 gate duy nhất** — con người chỉ chạm 1 lần để duyệt, không can thiệp từng bước. Trước gate = agent tự làm; sau gate = thực thi + đo.
2. **Luôn đóng vòng** — không chuỗi nào kết thúc ở "đã làm xong". Phải có bước `/roi` (hoặc đo tương đương) + `log_agent_insight` → hiện trên Ops Dashboard.
3. **Feed ngược** — kết quả đo quay lại làm input lần chạy sau (cái KILL không đề xuất lại; segment winback fail thì đổi offer).
4. **Scheduled-to-gate** — khi chạy tự động (scheduled task): agent chạy tới gate → tạo bản nháp → **ping Telegram chủ quán** → chủ duyệt lúc rảnh → bước cuối thực thi. Không bao giờ tự gửi/tự đăng.
5. **Data handoff rõ** — mỗi bước ghi output đủ để bước sau dùng (segment list, campaign_id, utm_campaign, doc_link).

---

## CHUỖI 1 — WINBACK LOOP (giữ chân khách) · nhịp 2 tuần

```
[/khach]  RFM → lọc segment "At-Risk" + "Hibernating"
   │ handoff: danh sách customer_id + last_order + món hay mua
   ▼
[/promo]  thiết kế winback offer hợp từng segment
   │  (At-Risk: nhắc nhẹ + ưu đãi vừa · Hibernating: ưu đãi mạnh hơn)
   │ handoff: campaign_id + utm_campaign (winback-YYYYMM)
   ▼
[/post]   draft Zalo broadcast + 1 post social
   ▼
⛔ GATE — chủ quán duyệt offer + nội dung (1 lần)
   ▼
THỰC THI: gửi Zalo broadcast (khách đã follow OA) + ghi PROMOTIONS
   ▼  …+14 ngày…
[/roi]    bao nhiêu khách At-Risk quay lại? incremental GP? ROI?
   ▼
[log_agent_insight] agent="winback" verdict=SCALE/FIX/KILL → Dashboard
   ▼
FEED NGƯỢC → /khach lần sau: segment nào winback fail → đổi offer/kênh
```
Lệnh chạy nhanh: `/winback-loop` (chạy /khach→/promo→/post tới gate).

---

## CHUỖI 2 — TREND-TO-TEST LOOP (bắt trend an toàn) · nhịp 2 tuần

```
[/trend]  quét trend → lọc 3 cổng (định vị / làm được / khách địa phương)
   │ handoff: trend đồ uống → nhánh A · trend format → nhánh B
   ▼
A) [/menu-eng] trend món có thành SKU khả thi? margin? menu có bloat không?
B) [/post]     trend format → 1 reel/post test
   ▼
⛔ GATE — chủ quán chọn thử cái nào (đừng thử hết)
   ▼
THỰC THI: thêm SKU thử (batch nhỏ) HOẶC đăng reel test
   ▼  …+7–14 ngày…
[/roi]    SKU thử ra đơn không? reel ra tương tác/đơn không?
   ▼
[log_agent_insight] verdict SCALE (làm thật) / KILL (bỏ)
   ▼
FEED NGƯỢC → /trend lần sau KHÔNG đề xuất lại cái đã KILL
```
Lệnh chạy nhanh: `/trend-loop` (chạy /trend→/menu-eng|/post tới gate).

---

## CHUỖI 3 — WEEKLY GROWTH REVIEW · nhịp thứ 6

```
[/tuan]   metrics tuần (doanh thu, top/bottom SKU, repeat rate)
   ▼
[/roi]    chấm điểm marketing tuần: post/promo nào ĐẺ RA ĐƠN
   ▼
(đầu tháng) [/menu-eng] + [/doi-thu]   matrix SKU + động thái đối thủ
   ▼
TỔNG HỢP → content-calendar tuần sau + đề xuất 1 promo nếu doanh thu ↓>10%
   ▼
⛔ GATE — chủ quán duyệt plan tuần sau
   ▼
[log_agent_insight] agent="weekly" → Dashboard
```
> Chuỗi này = `/tuan` ở chế độ "đầy đủ": tự kéo `/roi` + (đầu tháng) `/menu-eng`,`/doi-thu`.

---

## CHUỖI 4 — REPUTATION LOOP · nhịp mỗi 6h (đã có scheduled task)

```
[/review] pull review pending → phân loại sentiment → draft phản hồi brand-voice
   ▼
⛔ GATE — chủ quán duyệt + paste lên Maps/FB
   ▼
THỰC THI: markReviewResponded(id, responder)
   ▼
PHÁT HIỆN PATTERN: review xấu lặp 1 chủ đề (vd "đá loãng", "chờ lâu")
   ▼  → feedback-loop.md
[ACTION VẬN HÀNH] map sang skill phù hợp:
   "máy đá/đồ uống loãng" → /bao-tri ·  "chờ lâu" → xem KDS/nhân sự
   ▼
[log_agent_insight] agent="review" + critical count → Dashboard
```

---

## CHUỖI 5 — DAILY PULSE · nhịp 7h sáng (đã có cafe_morning_brief)

```
[/sang]   đọc dashboard_summary (KPI hôm qua + két + kho + bảo trì + review)
   ▼
Top 3 priority hôm nay + checklist mở quán → Telegram chủ quán
   ▼
nếu phát hiện bất thường (kho thấp/ca lệch/review critical) → trỏ thẳng skill xử lý
```
> Không cần gate — chỉ báo cáo + điều hướng. Chủ quán đọc trên đường tới quán.

---

## BẢN ĐỒ CHUỖI ↔ DASHBOARD

Mọi chuỗi đổ kết quả về **1 nơi**: card "🤖 Agent insights" trên `web/dashboard.html` (qua `log_agent_insight`).
→ Chủ quán mở dashboard thấy ngay: tuần này winback SCALE hay KILL, trend nào đáng làm thật, review có critical không — **không cần mở từng file docs**.

## LỊCH CHẠY (đăng ký ở automation-registry.md Layer D)

| Chuỗi | Nhịp | Tự chạy tới | Người duyệt |
|---|---|---|---|
| Winback Loop | 2 tuần (T2 tuần lẻ) | bản nháp offer+post | có |
| Trend-to-Test | 2 tuần (T4 tuần chẵn) | đề xuất trend đã lọc | có |
| Weekly Growth | T6 06:30 | plan tuần sau | có |
| Reputation | mỗi 6h | draft phản hồi | có |
| Daily Pulse | 07:00 | brief + điều hướng | không |

## ANTI-PATTERN

- ❌ Nhiều gate trong 1 chuỗi → chủ quán mệt, mất tự động hóa. **1 gate.**
- ❌ Tự gửi/đăng không qua gate (vi phạm nguyên tắc cafe-manager #2).
- ❌ Chuỗi không có bước đo → chạy mù, không biết hiệu quả.
- ❌ Không feed ngược → lặp lại sai lầm (đề xuất lại trend đã fail).
- ❌ Chạy tất cả chuỗi cùng 1 ngày → dồn việc duyệt. Giãn lịch ra.
