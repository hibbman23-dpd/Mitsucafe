# ☁️ Kế hoạch xài $300 (~8tr) Google Cloud credit — Lâm Hà Kissaten (Mitsu)

> Cập nhật 2026-06-21 (bản theo TIMELINE khai trương). Credit = **$300 / 90 ngày, hết hạn 19/9/2026, xài-hoặc-mất**.
> **Triết lý:** *mua TÀI SẢN VĨNH VIỄN chạy FREE sau khi hết credit* — credit chỉ ở RÌA, lõi quán (GAS + Sheets + GA4/Meta/GBP API) luôn miễn phí.

---

## 0. ⏱️ Mốc thời gian quyết định mọi thứ

| Giai đoạn | Ngày | Làm được gì với credit |
|---|---|---|
| **Trước khai trương** | nay → 11/7 (~3 tuần) | **CHƯA có data vận hành** → chỉ tạo TÀI SẢN 1 lần (ảnh/nội dung/SEO/SOP) |
| **Vận hành có credit** | 11/7 → 19/9 (~10 tuần) | Pilot cần khách thật (đếm khách, chatbot) + LOG data |
| Hết hạn | 19/9 | Phần chưa dùng mất → fallback free |

### ⚠️ Sự thật: KHÔNG xài hết $300 — và KHÔNG cần cố
Quán nhỏ xài AI/API hợp lệ rất rẻ (Gemini text vài cent; Imagen ~$0.02–0.04/ảnh; Translation/Vision gần free-tier). Để "đốt" hết $300 phải sản xuất thừa mứa = **lãng phí, không phải thắng**. **Mục tiêu = vắt ra nhiều tài sản bền nhất, KHÔNG phải tiêu cho hết.** Dùng ~$100–150 mà mua được kho tài sản chạy-free-mãi đã là tối ưu; phần dư để mất, không sao. Cách tiêu đậm hợp lệ nhất = **front-load sinh ảnh + nội dung hàng loạt TRƯỚC khai trương**.

---

## 1. GIAI ĐOẠN 1 — TRƯỚC KHAI TRƯƠNG (nay → 11/7): xây "kho tài sản khai trương"
Không cần khách/đơn → đổ credit vào tạo tài sản 1 lần, giữ mãi:

| Việc | Credit | Tài sản vĩnh viễn (free sau đó) |
|---|---:|---|
| **Kho ảnh marketing (Imagen/Vertex)** | ~2tr | Ảnh nền promo cả năm (Tết/hè/Trung thu/Noel), template post/story, banner cho **signage-studio**, thiết kế **tem dán ly**. ⚠️ Món THẬT nên chụp ảnh thật (AI food dễ giả) — AI chỉ cho nền/mood/promo. |
| **Lịch nội dung khai trương (Gemini)** | ~1tr | 8–10 tuần draft FB/IG/TikTok/Threads + mô tả menu VI/EN/JP + mẫu broadcast Zalo + bộ SOP/đào tạo nhân viên. |
| **SEO hyper-local + dịch tĩnh** | ~0.5tr | Bài SEO tuyến Đà Lạt–Đức Trọng–Lâm Hà + Đinh Văn/Tân Hà/Đa Me; menu/biển/landing dịch tĩnh lưu Sheet (0 call sau). |
| **RAG knowledge base cho chatbot** | ~0.3tr | Embeddings menu+FAQ+thông tin quán tạo 1 lần → lưu local → chatbot truy hồi **chạy free mãi**. |

> **SEO — sửa so với bản Antigravity:** bài viết tuyến đường/vùng = giữ (tài sản tốt). NHƯNG **cắt "150 cặp Q&A Google Maps" xuống ~15 cái THẬT** (tự nhồi 150 Q&A keyword = vi phạm chính sách GBP, nhìn spam, dễ bị gỡ). **Người phải duyệt tính xác thực** trước khi đăng (Gemini hay bịa khoảng cách/landmark như thác Đa Me). Đăng từ từ, tự nhiên (tránh thin/doorway content bị phạt).

---

## 2. GIAI ĐOẠN 2 — SAU KHAI TRƯƠNG (11/7 → 19/9): pilot cần khách thật

| Việc | Credit | Tài sản vĩnh viễn (free sau đó) |
|---|---:|---|
| **🥇 Đếm khách VÀO/RA (ẩn danh)** | ~2.5tr | Model đếm người hiệu chỉnh → **inference chạy FREE tại Mac mini** (`ops/camera_ai.py`). Cho **tỷ lệ chuyển đổi cửa** = mẫu số còn THIẾU của mọi ROI (giờ chỉ biết "đơn", chưa biết "marketing kéo bao nhiêu người tới cửa"). Khai trương đông là lúc tốt nhất để đo. |
| **Chatbot Zalo/FB (Gemini)** | ~0.7tr | Auto-reply "ở đâu/giờ/menu" lúc khai trương + bắt SĐT↔social cho **P3 phone-match** (`link_social_id`). Fallback: Gemini free-tier hoặc thủ công. |
| **(tùy quy mô) Heatmap/turnover chỗ ngồi** | ~0.5tr | Model bàn-trống nhẹ chạy local → KDS/Telegram. **Chỉ đáng nếu quán nhiều khu/tầng;** quán 1 phòng nhỏ thì over-engineering — ưu tiên THẤP. |
| **OCR hoá đơn nhập (Document AI)** | ~0.5tr | Lịch sử chi phí số hoá → EXPENSES. Vision/DocAI free ~1000 trang/tháng đủ về sau. |

> **❌ BỎ khỏi cửa sổ này — face-demographics (A.1 bản Antigravity):** (1) Google Vision API **KHÔNG trả tuổi/giới tính** (chỉ landmark+cảm xúc) → cơ chế sai; (2) ảnh mặt = **dữ liệu sinh trắc NHẠY CẢM** theo **Nghị định 13/2023**, cần đồng ý rõ ràng từng khách → bất khả thi cho khách vãng lai. Thay bằng đếm-thân-người ẩn danh (trên); "tệp khách theo ca" suy từ **dữ liệu ORDERS/POS** (free).
>
> **❌ BỎ — ML demand forecast (E):** 70 ngày đầu quán MỚI là bất thường (hype khai trương), không đủ/không đại diện để train. Chỉ **LOG data**; để dành vài tháng sau (subagent đã có dự báo luật-tay).

---

## 3. 🆓 Làm ngay, KHÔNG tốn credit
- **Looker Studio dashboard** nối Google Sheets → KPI realtime (doanh thu/đơn/ROI/RFM) cho chủ xem trực quan. Free hẳn.
- **QR digital menu microsite đa ngữ:** nội dung+ảnh sinh 1 lần (GĐ1) → host tĩnh trên GitHub Pages sẵn có.

---

## 4. 🚫 KHÔNG tiêu vào (bẫy phụ thuộc — chết khi hết tiền)
- Server always-on (Compute Engine / Cloud Run 24/7): cron giữ trên **Mac mini local** (`tiktok_pull.sh`, `dispatcher.sh`).
- Cloud SQL / Firestore làm DB (vi phạm "KHÔNG external DB"). BigQuery thường trực (chỉ dùng 1 lần nếu train).
- Maps Platform: có **$200/tháng credit RIÊNG** → đừng đụng $300 này.
- API gọi LIVE mỗi lần dùng (dịch lại mỗi lượt tải trang) → biến thành tài sản TĨNH.
- **Đừng tiêu bừa cho hết $300** — để dư còn hơn mua đồ vô dụng.

---

## 5. 🛡️ Cơ chế FALLBACK 0 đồng
1. **KHÔNG nâng paid account** → hết credit/90 ngày Google tự DỪNG dịch vụ tính phí, **KHÔNG trừ tiền**. Lõi quán vẫn chạy.
2. **Cờ CONFIG ngắt API** (`OCR_ENABLED`, `AI_AUTOREPLY_ENABLED`…) + đường free song song — pattern `TIKTOK_SCRAPE_ENABLED` sẵn có. Hết credit → set `false` → hạ cấp tức thì, không gì vỡ.
3. **Quota cứng từng API** (~$3/ngày cho recurring chống loop đốt sạch). **NHƯNG nới tạm cap khi chạy job 1-lần nặng** (Imagen batch / Video Intelligence / train) — xong hạ lại, vì $3/ngày sẽ chặn chính flagship.
4. **Budget alert** 25/50/75/90% (chỉ cảnh báo, không tự chặn → cần quota ở trên).
5. **Vertex AI** (trong GCP project), KHÔNG key AI Studio → credit mới được trừ.
6. **Riêng tư camera:** treo biển báo có camera; chỉ đếm/hiện-diện ẩn danh, **không bao giờ** danh tính/sinh trắc.

### Always-Free đứng vững sau 19/9
GA4 · GBP · Apps Script/Sheets · Translation 500k ký tự/tháng · Vision/DocAI ~1000 trang/tháng · Gemini free-tier · Looker Studio · yt-dlp (Mac mini) · model đếm khách + RAG chatbot chạy local. → Hệ vẫn phân tích + tự động hoá, **đứng trên kho tài sản đã mua** (ảnh, nội dung, SEO, bản dịch, model, embeddings).

---

## 6. ✅ Tóm tắt thứ tự
1. **Tuần này → 11/7:** dựng rào (budget/alert/quota, không nâng paid) · Looker Studio · **đổ credit sinh kho ảnh+nội dung+SEO+SOP+RAG** (tiêu đậm nhất, để lại nhiều tài sản nhất).
2. **11/7 → 19/9:** pilot đếm-khách + chatbot + OCR + LOG data. Heatmap chỗ ngồi chỉ nếu quán nhiều khu.
3. **Không** train ML forecast (chưa đủ data). **Không** face-demographics (sai kỹ thuật + vi phạm NĐ13). **Không** cố tiêu cho hết.

---
*Kế hoạch GCP credit (timeline khai trương 11/7, hết hạn 19/9) · 2026-06-21 · spend→tài sản-free · đã bỏ face-demographics + cắt Maps Q&A + thêm Looker free + RAG chatbot.*
