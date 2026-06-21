# ☁️ Kế hoạch xài $300 (~8tr) Google Cloud credit — Lâm Hà Kissaten (Mitsu)

> Cập nhật 2026-06-20. Credit = **$300, hạn 90 ngày, xài-hoặc-mất**.
> **Triết lý (chủ quán chốt):** *tiêu GẦN HẾT credit — để lại cũng mất*. Ưu tiên đổ vào những thứ **để lại TÀI SẢN VĨNH VIỄN**, để khi hết tiền **fallback vẫn dựa vào đó chạy FREE**.

---

## 0. Nguyên tắc tiêu (đọc trước)

1. **Mỗi đồng credit phải đổi lấy 1 tài sản sống sót ở $0:** model đã train, data đã số hoá, bản dịch tĩnh, thư viện content — thứ dùng mãi không cần gọi API nữa.
2. **Tránh "phụ thuộc tính phí lặp lại"** (live-call mỗi lần dùng) — vì hết credit là CHẾT. Nếu buộc phải recurring → thiết kế để **rớt xuống Always-Free tier** (vẫn chạy, chỉ giới hạn nhẹ).
3. **One-time heavy > sprinkle nhẹ:** quán nhỏ xài API lẻ tẻ thì credit hết hạn vẫn còn nguyên = phí. Chọn 1–2 **dự án flagship tiêu đậm** để vắt kiệt 90 ngày.
4. **Lõi quán không bao giờ phụ thuộc credit:** Apps Script + Sheets + GA4/GBP/Meta API đều FREE. Credit chỉ ở RÌA (làm giàu thêm), không thay lõi.

---

## 1. PHÂN BỔ ~8tr (mỗi dòng = việc → credit → tài sản để lại → fallback free)

| # | Việc (1 lần) | Credit | TÀI SẢN để lại (chạy free mãi) | Fallback khi hết credit |
|---|---|---:|---|---|
| **A. Pilot đếm KHÁCH VÀO cửa (camera)** 🥇 | ~2.5tr | Model đếm người đã hiệu chỉnh + baseline foot-traffic. Inference chạy **FREE tại Mac mini** (`ops/camera_ai.py` đã có). | Đếm local free mãi; chỉ dùng credit lúc hiệu chỉnh/đo lại. |
| **B. Thư viện content (Gemini Vision + Imagen)** 🥈 | ~2tr | Bộ caption + tên JP (蜜) + mô tả + alt-text cho TOÀN menu + bộ ảnh promo theo mùa — **file giữ mãi**. | Tái dùng thư viện; sinh thêm lẻ trên Gemini free tier. |
| **C. Dịch toàn bộ content tĩnh (Translation)** | ~0.5tr | Menu/biển/landing VI↔EN↔JP **lưu tĩnh vào Sheet/HTML** — không gọi API nữa. | Bản tĩnh, 0 call mãi mãi. |
| **D. Số hoá hoá đơn nhập (Document AI OCR)** | ~0.8tr | Lịch sử chi phí đã số hoá → EXPENSES/Financials. | Vision/DocAI free ~1000 trang/tháng đủ cho quán → free mãi. |
| **E. Train model dự báo nhu cầu (Vertex / BigQuery ML)** | ~1tr | Hệ số/luật dự báo → **bake vào subagent cafe-insight** → chạy free. | Subagent đã có dự báo luật-tay sẵn (không có model vẫn chạy). *Cần đủ lịch sử — để vài tháng nữa.* |
| **F. Chatbot Zalo/FB auto-reply (Gemini)** | ~0.7tr | Luồng + prompt đã chỉnh; **cộng hưởng P3** (bắt SĐT↔social-id qua `link_social_id`). | **Gemini free tier** (rate-limit, đủ lượng tin quán) hoặc về thủ công Claude Code. |
| **G. Buffer khám phá** | ~0.5tr | — | — |
| **(FREE) Looker Studio dashboard** | 0đ | Biểu đồ KPI realtime nối thẳng Sheets cho chủ không-rành-kỹ-thuật. | Free hẳn — làm bất kể credit. |

**Tổng ~8tr.** Đặt budget-alert + quota cứng (mục 3) làm trần an toàn, không để vọt quá.

---

## 2. 🚫 KHÔNG tiêu vào (bẫy phụ thuộc — chết khi hết tiền)

- **Server always-on** (Compute Engine / Cloud Run thường trực): tốn liên tục + chết ở $0. yt-dlp đã chạy free trên Mac mini.
- **Cloud SQL / Firestore làm DB**: vi phạm luật "KHÔNG external DB" + phụ thuộc. Sheets đủ.
- **BigQuery làm kho thường trực**: chỉ dùng 1 lần để train (E) rồi thôi, không để chạy query định kỳ tính tiền.
- **Maps Platform**: có **$200/tháng credit RIÊNG** — đừng đụng $300 này; fallback = ảnh map tĩnh + link.
- **Dịch/AI gọi LIVE mỗi lần dùng** (vd dịch lại mỗi lượt tải trang): biến thành tài sản TĨNH thay vì call lặp.

---

## 3. 🛡️ Cơ chế FALLBACK (an toàn khi hết tiền/hết hạn)

1. **KHÔNG nâng lên tài khoản trả phí** → hết credit/90 ngày Google **tự DỪNG dịch vụ tính phí, KHÔNG trừ tiền** (chỉ trừ nếu chủ động bật full account). Lõi quán vẫn chạy.
2. **Budget + cảnh báo** (Billing → Budgets & alerts): mốc 25/50/75/90% của 8tr → email. *Cảnh báo KHÔNG tự chặn chi* → thêm:
3. **Quota cứng từng API** (APIs & Services → Quotas): vd Gemini X request/ngày → 1 bug/loop không đốt sạch credit qua đêm.
4. **Mỗi feature trả phí gắn 1 cờ CONFIG** (`AI_AUTOREPLY_ENABLED`, `OCR_ENABLED`…) + đường free song song — pattern `TIKTOK_SCRAPE_ENABLED` sẵn có. Hết credit → tắt cờ → quay về thủ công/free, **không gì vỡ**.
5. **Code gọi AI graceful:** gặp 429/quota/billing-off → rớt xuống free-tier hoặc luồng thủ công. **Không để AI fail làm chết nhận đơn/lõi.**
6. **Vertex AI (trong GCP project), KHÔNG key AI Studio** — để credit thực sự được trừ.

### Always-Free chạy mãi sau credit (lõi fallback)
GA4 API · GBP API · Apps Script/Sheets · Translation 500k ký tự/tháng · Vision/DocAI ~1000 trang/tháng · Gemini free tier (rate-limit) · Looker Studio · yt-dlp (Mac mini). → Sau 90 ngày, hệ vẫn phân tích + tự động hoá ở mức free, đứng trên các tài sản đã mua (model, bản dịch, thư viện content, data số hoá).

---

## 4. 🗓️ Lịch 90 ngày (vắt kiệt trước khi đồng hồ hết)

- **Tuần 1:** dựng rào (budget/alert/quota) · liên kết Vertex · **không** nâng paid account · dựng Looker Studio (free).
- **Tuần 1–3 — CHỐT TÀI SẢN TĨNH trước (chắc ăn):** C (dịch toàn bộ, lưu tĩnh) · D (OCR hoá đơn tồn) · B (sinh thư viện content). Xong là giữ mãi.
- **Tuần 2–8 — Flagship tiêu đậm:** A (pilot camera-conversion: thu clip mẫu → hiệu chỉnh model → chuyển inference về Mac mini free) · F (chatbot + bắt social-id cho P3).
- **Tuần 6–10 — nếu đủ data:** E (train forecast → bake vào subagent).
- **Tuần 10–12 — quyết giữ/bỏ:** cái nào đáng vài $/tháng (trong free-tier càng tốt) thì giữ; còn lại tắt cờ. Rà budget xài tới đâu, đẩy nốt vào B/A nếu còn dư.

---

## 5. Ý tưởng MỚI — chi tiết (quán chưa có)

### 🥇 A. Camera → đếm khách VÀO cửa vs ĐƠN (tỷ lệ chuyển đổi cửa)
**Lỗ hổng đang có:** toàn hệ analytics chỉ đo ĐƠN, không biết **marketing kéo bao nhiêu người TỚI cửa**. Có "100 đi qua → 30 vào → 12 mua" thì ROI mới khép vòng (mẫu số còn thiếu).
**Cách:** dùng credit (Vertex/Video Intelligence hoặc Gemini phân tích snapshot định kỳ) để **hiệu chỉnh** model đếm người trên footage quán; sau đó **inference chạy FREE tại Mac mini** (đã có `ops/camera_ai.py`). Tài sản = model + baseline. Có thể mở rộng: giờ cao điểm, độ dài hàng chờ → xếp ca.
**⚠️ Riêng tư:** CHỈ đếm ẩn danh, **không lưu mặt**; treo biển báo có camera; tuân thủ pháp luật.

### 🥈 B. "Nhà máy" content đa phương thức (Gemini Vision + Imagen)
Chụp 1 ly đồ uống → sinh **caption + tên JP + mô tả + alt-text + 3 biến thể post**; batch cả menu + bộ ảnh promo theo mùa. Tăng tốc đúng cỗ máy content mà cafe-insight đo. Tài sản = thư viện file giữ mãi.

### B-bonus. Looker Studio (FREE)
Nối Google Sheets → dashboard KPI realtime (doanh thu/đơn/ROI/RFM) cho chủ xem trực quan. Không tốn credit — nên làm ngay.

### E. Dự báo nhu cầu bằng ML (Vertex / BigQuery ML)
Train trên ORDERS → dự báo bán theo món/giờ → **giảm hao hụt** (đúng nỗi đau `/huy`). Tài sản = hệ số → bake vào subagent (đang dự báo luật-tay). *Cần đủ lịch sử — quán mới nên để vài tháng.*

### D. OCR hoá đơn (Document AI) · 6. Sentiment review hàng loạt (Gemini)
OCR hoá đơn nhập → tự ghi EXPENSES. Gom review Google/FB → phân loại tốt/xấu + chủ đề → feed `/review`. Cả hai rẻ, nằm trong free-tier sau này.

---

## 6. 🔗 Cộng hưởng P3 (phone-match)
Chatbot (F) chính là **luồng bắt SĐT↔social-id** P3 cần — gọi `link_social_id`/`linkCustomerSocialId` (đã có trong `Code.gs`). Khách nhắn fanpage → bot hỏi SĐT tích điểm → `customers_social[]` có dữ liệu → phone-match ghép đơn↔tương tác chạy thật. Một mũi tên 2 đích: CSKH tự động (xài credit) + nuôi attribution P3 (đang xây).

---
*Kế hoạch GCP credit · 2026-06-20 · triết lý: tiêu gần hết → mua tài sản chạy-free-mãi · fallback đứng trên tài sản đó.*
