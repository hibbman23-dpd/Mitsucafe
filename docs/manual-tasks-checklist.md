# ✅ CHECKLIST VIỆC LÀM TAY — Mitsu / Lâm Hà Kissaten

> Cập nhật 2026-06-21. Mọi việc dưới đây **Claude không làm qua code được** — cần bạn thao tác (editor/console/Mac mini/browser). Xếp theo ưu tiên.

---

## 🟢 NHÓM 1 — LÀM NGAY (mở khoá tự động hoá · ~15 phút)

### A. Bật các trigger tự động (Apps Script editor)
Để Meta/GA4/rollup tự chạy hằng ngày (giờ đang phải gọi tay).
1. Mở Google Sheet của quán → menu **Extensions → Apps Script**.
2. Thanh chọn hàm (cạnh nút ▶ Run) → chọn `installMetaPullTrigger` → bấm **Run**. Lần đầu hiện xin quyền → **Review permissions → Allow**.
3. Lặp lại **Run** cho từng hàm:
   - `installMetaHealthTrigger`
   - `installGa4DailyTrigger`
   - `installDailyRollupTrigger`  ← chốt HQ_DAILY mỗi 1:10 sáng (cho Looker)
4. Kiểm: icon **⏰ Triggers** (cột trái) → thấy 4 trigger time-based.
> ❌ ĐỪNG chạy giờ: `installGbpDailyTrigger` / `installZaloRefreshTrigger` (chờ credential) · `installTiktokTrigger` (TikTok dùng cron Mac mini, không dùng GAS) · `installMenuSnapshotTrigger` (chưa có HQ master). Chạy lại an toàn (mỗi hàm tự xoá trigger cũ trước).

### B. Cron TikTok trên Mac mini
1. Trên Mac mini: `crontab -e`
2. Thêm dòng (giữ nguyên dòng dispatcher đã có):
   ```
   10 7 * * * /Users/dpd/Projects/lamha-kissaten/ops/tiktok_pull.sh
   ```
3. Lưu (`Esc` → `:wq`). Kiểm: `crontab -l` → thấy 2 dòng.
4. Chạy thử 1 lần: `/Users/dpd/Projects/lamha-kissaten/ops/tiktok_pull.sh` → `tail -1 ops/tiktok_pull.log` phải có `resp={"ok":true,"ingested":N}`.

### C. Xoá dòng TikTok trùng trong MARKETING_LOG
- Mở Sheet → tab **MARKETING_LOG** → tìm dòng: `platform = tiktok`, cột **`external_post_id` TRỐNG**, tiêu đề "hành trình khởi nghiệp ngày 2" (~2026-06-19).
- Chuột phải → **Delete row**. (GIỮ các dòng tiktok có mã `tt_...` ở external_post_id.)

---

## 🟡 NHÓM 2 — BẢO MẬT (nên làm · ~15 phút, nhiều bước)

### D. Rotate REPORT_API_TOKEN (token cũ đã lỡ vào git history)
Token này được đọc ở **4 nơi** → phải đổi ĐỦ cả 4, nếu không poller/KDS sẽ chết.
1. **Tạo token mới** (terminal): `openssl rand -hex 24` → copy chuỗi.
2. **GAS CONFIG (nguồn):** Sheet → tab **CONFIG** → dòng key `REPORT_API_TOKEN` → dán token mới vào cột value.
3. **File ops (Mac mini):** sửa `.claude/.dispatcher-auth.json` → field `"report_api_token"` = token mới. (Bao 4 script: tiktok_pull, dispatcher, heartbeat, deploy_gas.)
4. **Print poller (launchd):** sửa plist đang chạy (`~/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist`) → key `REPORT_API_TOKEN` → token mới. Rồi reload:
   ```
   launchctl unload ~/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist
   launchctl load   ~/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist
   ```
5. **KDS web (Cloudflare Worker):** token được Worker chèn vào `kds.html` lúc serve (`__REPORT_API_TOKEN__`). Đổi secret/env `REPORT_API_TOKEN` trên Cloudflare (wrangler hoặc dashboard) → redeploy Worker.
6. **Test:** `curl -sSL -G "<BASE>/exec" --data-urlencode action=meta_health --data-urlencode "token=<TOKEN_MỚI>" --data-urlencode "_cb=$RANDOM"` → `{"ok":true...}`. Mở KDS + xem print poller log chạy bình thường.
> Mức độ: token này gác endpoint PII/doanh số (fail-closed). Rò trong git history là rủi ro vừa — rotate là dứt điểm. Nếu chưa kịp, để cuối cũng được.

---

## 🟢 NHÓM 3 — LOOKER DASHBOARD (FREE, làm ngay được · ~15 phút, browser)
Theo chi tiết: **`docs/looker-dashboard-guide.md`**. Tóm tắt:
1. [lookerstudio.google.com](https://lookerstudio.google.com) → Create → Report.
2. Add data → Google Sheets → spreadsheet quán → tab **HQ_DAILY** (+ MARKETING_LOG + DAILY_METRICS).
3. Dựng 3 trang: Tổng quan ngày · So chi nhánh · Marketing (chart + scorecard theo guide).
4. Thêm filter **Date range** + drop-down **`location_id`** (sẵn cho đa CN).
5. Share link view-only cho quản lý.
> Data đã backfill HQ_DAILY tháng 6; sau khai trương 11/7 tự đầy nhờ trigger ở mục A.

---

## 🔵 NHÓM 4 — GCP GATING (mở khoá track content/RAG/camera sau · ~10 phút, console)
Làm trước khi tôi viết script gọi Vertex/Gemini.
1. **Budget + cảnh báo:** [console.cloud.google.com](https://console.cloud.google.com) → Billing → **Budgets & alerts** → tạo budget 8.000.000đ, mốc cảnh báo **25/50/75/90%**.
2. **KHÔNG nâng full/paid account** — để hết credit Google tự DỪNG dịch vụ, không trừ tiền.
3. **Bật Vertex AI:** APIs & Services → Library → tìm **"Vertex AI API"** → Enable. (Cùng GCP project đã link với Apps Script.)
4. **Quota cap chống đốt credit:** APIs & Services → Quotas → lọc Vertex/Gemini → đặt trần ngày thấp (~vài $/ngày). Khi chạy job sinh ảnh/embeddings 1 lần thì nới tạm rồi hạ lại.
5. Xong → báo Claude: "đã bật Vertex" → Claude viết script content/RAG.

---

## ⏳ NHÓM 5 — KÊNH GATED (làm KHI có điều kiện, chưa gấp)

### G. GBP / Google Maps API (chờ verified 60 ngày + duyệt đơn ~tuần–tháng)
1. GBP của quán phải **verified + hoạt động 60+ ngày** (quán mới → chưa đủ, chờ ~tháng 8).
2. [console.cloud.google.com](https://console.cloud.google.com) → chọn project đã link Apps Script → ghi **Project Number**.
3. APIs & Services → Library → Enable **"Business Profile API"** + **"Business Profile Performance API"**.
4. Nộp [đơn xin quyền GBP API](https://support.google.com/business/contact/api_default) → "Application for Basic API Access" (điền Project Number + lý do đo Maps).
5. Theo dõi: IAM & Admin → Quotas → Business Profile API (**0 = chưa duyệt; 300 QPM = duyệt**).
6. Khi duyệt → Sheet CONFIG đặt `GBP_LOCATION_ID` (ID dạng số) → báo Claude test + chạy `installGbpDailyTrigger()`.

### H. Zalo OA token (khi có app Zalo OA)
1. [developers.zalo.me](https://developers.zalo.me) → app gắn OA của quán → lấy **App ID · App Secret · Refresh Token**.
2. Sheet CONFIG thêm 3 dòng: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REFRESH_TOKEN`.
3. Báo Claude → chạy `refreshZaloToken()` test → `installZaloRefreshTrigger()`.

---

## 📌 Thứ tự đề nghị
1️⃣ Nhóm 1 (A·B·C) — ngay, mở khoá tự động.
2️⃣ Nhóm 3 (Looker) — quick win free.
3️⃣ Nhóm 4 (GCP gating) — khi muốn Claude làm content/RAG.
4️⃣ Nhóm 2 (rotate token) — khi rảnh.
5️⃣ Nhóm 5 (GBP/Zalo) — khi đủ điều kiện.

*Checklist việc tay · 2026-06-21 · liên quan `master-workflow-v3.md` · `gcp-credit-plan.md` · `looker-dashboard-guide.md`.*
