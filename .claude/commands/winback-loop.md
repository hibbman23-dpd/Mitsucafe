---
description: Chuỗi giữ chân khách — /khach → /promo → /post tới gate duyệt, +14 ngày đo bằng /roi
---

Invoke skill `cafe-manager` với chế độ **agent-chains** (CHUỖI 1 — Winback Loop).

Đọc `references/agent-chains.md` CHUỖI 1 + `_brand-voice.md`. Chạy tuần tự:

1. **`/khach`** — RFM snapshot, lọc segment **At-Risk** + **Hibernating**
   → handoff: danh sách customer_id + last_order + món hay mua
2. **`/promo`** — thiết kế winback offer riêng từng segment
   (At-Risk: nhắc nhẹ + ưu đãi vừa · Hibernating: ưu đãi mạnh hơn)
   → tạo campaign_id + utm_campaign `winback-YYYYMM`
3. **`/post`** — draft Zalo OA broadcast + 1 post social theo brand voice
4. **⛔ DỪNG Ở GATE** — trình chủ quán duyệt offer + nội dung. KHÔNG tự gửi.

Sau khi chủ duyệt + gửi → nhắc:
- Ghi PROMOTIONS row + gửi Zalo broadcast (khách đã follow OA)
- **+14 ngày chạy `/roi winback-YYYYMM`** đo: bao nhiêu At-Risk quay lại, ROI?
- `log_agent_insight` agent="winback" verdict=SCALE/FIX/KILL → Dashboard
- Feed ngược: segment nào winback fail → lần sau đổi offer/kênh

Nguyên tắc: 1 gate · luôn đóng vòng đo · không tự publish.
Data thật chưa có (chưa mở quán) → chạy để xem cấu trúc chuỗi; số liệu đợi sau 18/06.

User input optional: `$ARGUMENTS` = segment cụ thể (vd "chỉ Hibernating").
