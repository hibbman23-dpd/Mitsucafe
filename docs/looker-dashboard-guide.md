# 📊 Looker Studio Dashboard — Mitsu / Lâm Hà Kissaten

> Dashboard KPI cho chủ quán (không-kỹ-thuật). **FREE hẳn** (Looker Studio không tốn credit GCP).
> Nối thẳng Google Sheets → biểu đồ realtime. **Sẵn sàng đa chi nhánh** (mọi chart lọc theo `location_id`).
> Cập nhật 2026-06-21. Nguồn dữ liệu đã có: `HQ_DAILY` (đã backfill 21 ngày), `MARKETING_LOG`, `DAILY_METRICS`.

---

## 0. Chuẩn bị data (đã xong phần code)
- **`HQ_DAILY`** = nguồn CHÍNH (phẳng, có `location_id` + `date` + revenue/order_count/avg_order_value/expenses/waste_cost). Lý tưởng cho Looker.
- Giữ đầy data: chạy `installDailyRollupTrigger()` (editor) → tự chốt HÔM QUA mỗi 1:10 sáng. Bù lịch sử: route `rollup_backfill&from=&to=` (đã chạy cho tháng 6).
- ⚠️ Quán chưa khai trương → HQ_DAILY hiện gần như rỗng (chỉ data test). Sau 11/7 sẽ tự đầy.

## 1. Kết nối Looker → Sheets (1 lần, ~5 phút)
1. Vào [lookerstudio.google.com](https://lookerstudio.google.com) → **Create → Report**.
2. **Add data → Google Sheets** → chọn spreadsheet của quán → tab **HQ_DAILY** → Add.
3. Lặp lại Add data cho tab **MARKETING_LOG** và **DAILY_METRICS** (mỗi tab = 1 data source).
4. Kiểm field type: `date`→Date (YYYY-MM-DD), `revenue/expenses/...`→Number, `location_id`→Text.

## 2. Trang 1 — TỔNG QUAN NGÀY (nguồn HQ_DAILY)
- **Scorecard** (hàng đầu): `SUM(revenue)` · `SUM(order_count)` · `AVG(avg_order_value)` · `SUM(expenses)` · `SUM(waste_cost)`.
- **Time series**: trục X = `date`, trục Y = `revenue` (thêm `order_count` line phụ).
- **Lãi gộp ước lượng** (calculated field): `revenue - expenses - waste_cost`.
- **Bộ lọc đầu trang:** Date range control + **Drop-down `location_id`** (để sau mở CN chọn xem từng quán / tất cả).

## 3. Trang 2 — SO CHI NHÁNH (nguồn HQ_DAILY) — sẵn cho scale
- **Bar chart**: Dimension = `location_id`, Metric = `SUM(revenue)`. (1 CN giờ chỉ 1 cột; mở CN2 tự thêm cột.)
- **Bảng**: `location_id` × (revenue, order_count, avg_order_value, waste_cost).
- Đây chính là lý do `location_id` là khóa đầu HQ_DAILY — Looker tách chi nhánh tức thì.

## 4. Trang 3 — MARKETING (nguồn MARKETING_LOG)
- **Bar**: Dimension = `platform`, Metric = `SUM(cost_vnd)` và `SUM(reach)` (so chi phí vs tiếp cận từng kênh).
- **Bảng**: top post theo `likes+comments+shares+saves` (tạo calculated field `engagement`).
- **Lưu ý:** Looker chỉ hiện số THÔ. Phần attribution/ROI/SCALE-KILL nằm ở subagent `cafe-insight` (báo cáo `docs/insight-reports/`), không thay thế nhau — Looker = nhìn nhanh, subagent = phân tích sâu.

## 5. Hoàn thiện
- **Theme** màu nâu/mật hợp brand Mitsu (蜜). Tiêu đề tiếng Việt dễ hiểu cho quản lý.
- **Share**: nút Share → gửi link cho chủ/quản lý (view-only). Mở trên điện thoại được.
- **Refresh**: Looker cache ~15 phút; File → Data freshness chỉnh nếu cần nhanh hơn.

## 6. Khi scale CN
Mở CN2: data CN2 (1 spreadsheet riêng) → `getDailyRollup()` đẩy lên HQ_DAILY ở HQ spreadsheet (kèm `location_id`). Dashboard đang trỏ HQ_DAILY → **tự có thêm chi nhánh, không sửa dashboard**. (Hoặc Looker blend nhiều nguồn nếu chưa có HQ tập trung.)

---
*Looker dashboard guide · FREE · nguồn HQ_DAILY (location_id-first) · 2026-06-21 · xem `docs/master-workflow-v3.md` §3 + `docs/gcp-credit-plan.md`.*
