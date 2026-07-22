# Future Features Plan — nghiên cứu thị trường 2026-07-08

> Nguồn: khảo sát POS VN (KiotViet/iPOS/CukCuk/Sapo), xu hướng cafe tech 2026, quy định thuế NĐ 70/2025.
> Đối chiếu: `docs/system/roadmap.md` (M01–M18) + `docs/hermes-insight-brainstorm-2026-07-08.md` — chỉ liệt kê thứ quán CHƯA có.
> Cấu trúc: §A = đề xuất áp dụng được vào workflow hiện tại (chờ duyệt từng cái) · §B = parking lot chưa áp dụng được, phát triển riêng sau.

---

## A. ÁP DỤNG ĐƯỢC — nâng cấp trong workflow GAS+Sheets hiện tại

Xếp theo ưu tiên (giá trị ÷ công sức).

### A1. ⚠️ Hóa đơn điện tử máy tính tiền — NĐ 70/2025 (PHÁP LÝ, ưu tiên cao nhất)

- **Thị trường nói gì:** từ 1/6/2025 quán F&B doanh thu ≥1 tỷ/năm BẮT BUỘC hóa đơn điện tử khởi tạo từ máy tính tiền kết nối cơ quan thuế; từ 1/1/2026 bỏ thuế khoán, hộ kinh doanh kê khai theo doanh thu thực. 1 tỷ/năm ≈ 2,7tr/ngày — Mitsu chạy tốt sẽ chạm ngưỡng.
- **Gap hiện tại:** `generatePDFInvoice()` chỉ là PDF thường, KHÔNG phải HĐĐT có mã cơ quan thuế. Không tự build được — phải qua nhà cung cấp được cấp phép (MISA meInvoice, Viettel, FPT, EasyInvoice…).
- **Đề xuất áp dụng:**
  1. NGAY: thêm "threshold watch" vào insight loop — doanh thu lũy kế năm chạm 70%/85%/95% của 1 tỷ → alert Telegram nhắc chuẩn bị.
  2. NGAY: vì bỏ thuế khoán, ORDERS trong Sheets = sổ doanh thu kê khai → thêm report `/thue` xuất bảng doanh thu tháng/quý đúng định dạng kê khai hộ KD.
  3. KHI CHẠM NGƯỠNG: GAS gọi API provider HĐĐT tại bước DELIVERED (song song PDF hiện có, không phá state machine). Chọn provider trước (nghiêng MISA meInvoice — phổ biến hộ KD, có API).
- **Giá trị gói bán:** MỌI quán VN đau vụ này 2026 — module "sẵn sàng thuế" là hook bán cực mạnh cho Skill Pack/OS.
- **Xác nhận 2026-07-08 (chữ ký số / máy tính tiền):** chữ ký số (HSM hay từ xa) KHÔNG thay được yêu cầu — loại HĐĐT khởi tạo từ máy tính tiền theo NĐ70/2025 vốn KHÔNG bắt buộc chữ ký số người bán (đặc thù bán lẻ). Bắt buộc thật sự = tích hợp giải pháp của 1 nhà cung cấp được cơ quan thuế công nhận (MISA/Viettel/FPT/VNPT/BKAV/EasyInvoice...) để truyền dữ liệu đúng chuẩn định dạng. "Máy tính tiền" không cần phần cứng chuyên dụng — máy tính/điện thoại + máy in + internet + phần mềm là đủ, nên GAS+Sheets hiện tại giữ nguyên vai trò event bus, chỉ thêm bước gọi API provider ở DELIVERED (đúng đề xuất mục 3 trên). Ngưỡng ≥1 tỷ/năm bắt buộc từ 1/6/2025; hộ 200tr–1 tỷ chưa bắt buộc, lộ trình khuyến khích 2027–2028.
- **So sánh chi phí 2026-07-08 (per-invoice API vs bundle POS):** ở volume ước ~2.000 đơn/tháng lúc chạm ngưỡng 1 tỷ, giá per-invoice thuần (MISA ~300-500đ/hd) ≈ 600k-1tr/tháng — ĐẮT hơn gói bundle POS có kèm HĐĐT free (KiotViet công bố 2026: gói rẻ nhất ~250-270k/tháng, đã bao free HĐĐT+CKS). Flat-fee bundle thắng per-invoice khi volume cao. Nhưng KHÔNG đổi nguyên hệ thống qua KiotViet — mất hết webhook 8 kênh/in tem/Zalo/stamp/campaign đã build. Đường đi đúng: dùng KiotViet (hay NCC bundle rẻ khác) CHỈ làm "máy phát hóa đơn" qua Public API (OAuth2) — GAS gọi ở bước DELIVERED, giữ nguyên GAS+Sheets làm event bus. Trước khi chọn, hỏi NCC: (1) gói rẻ nhất có cap số hóa đơn/tháng không, (2) API tạo hóa đơn có tính riêng ngoài gói không, (3) dùng thuần qua API (không qua UI bán hàng của họ) có vi phạm điều khoản không.

### A2. Kênh delivery apps (GrabFood/ShopeeFood/beFood) — nhập liệu bán tự động

- **Thị trường:** đơn food app là kênh lớn; kinh nghiệm chủ quán = dùng app làm phễu, kéo khách về kênh riêng (Mitsu đang đúng chiến lược này với 8 kênh + QR).
- **Gap:** đơn Grab/Shopee KHÔNG đổ vào event bus → insight mù kênh delivery, inventory không trừ, ROI campaign sai.
- **Đề xuất v1 (không đợi API):** thêm nút "Đơn Grab/Shopee" trên KDS → nhân viên bấm chọn món → tạo order `utm_source=grabfood` vào ORDERS như thường. 5 giây/đơn, data đủ cho insight + trừ kho. Cuối ngày đối soát tổng với merchant app.
- API integration thật → §B1.

### A3. Prepaid / gói tháng (membership) — retention mạnh nhất chưa khai thác

- **Thị trường:** 1/3 khách thích trả subscription hơn trả từng lần; 2026 quán nhỏ độc lập cũng đã áp dụng (mô hình Blank Street).
- **Gap:** mới có stamp (M11). Chưa có nạp trước/gói.
- **Đề xuất:** cột `prepaid_balance` trong CUSTOMERS + top-up qua VietQR (hạ tầng Payment sẵn) + trừ dần khi DELIVERED. Gói kiểu "20 ly espresso tháng = X đ" (giảm ~15%). Sheets gánh thoải mái, không cần app — khách check số dư qua Zalo (hạ tầng notify sẵn).
- **Lưu ý:** tiền nạp trước = nợ với khách — cần dòng đối soát riêng trong `/chot-ca`.

### A4. Hẹn giờ lấy (order-ahead) — nâng cấp nhỏ, khách du lịch thích

- **Thị trường:** pre-order phổ biến cả quán độc lập 2026.
- **Gap:** pickup flow có sẵn nhưng không hẹn giờ.
- **Đề xuất:** field `pickup_time` trong payload web order + KDS sort theo giờ hẹn + trigger nhắc pha trước 10'. Nhỏ, dùng nguyên state machine.

### A5. Weather feed cho forecast — vũ khí Tenzo, chi phí 0

- **Thị trường:** Tenzo/5-Out forecast bằng thời tiết + sự kiện — chính xác tới 98%.
- **Đề xuất:** cron kéo Open-Meteo API (free) → CSV local → nguồn thứ 3 cho Hermes insight loop (P1 pipeline nhận luôn). Lâm Hà mưa chiều = biến số lớn nhất của quán — dự báo "mai mưa 80%, chuẩn bị ít đá, đẩy đồ nóng + delivery".

### A6. SePay đối soát bank tự động

- Đã nhận diện trong `docs/mcp-connectors-plan.md` (gap N1). Áp dụng vào quán: webhook SePay → GAS → tự động match VietQR payment thay `checkPaymentStatus` thủ công + khớp `/chot-ca`. Vừa là feature quán, vừa là sản phẩm F — một công đôi việc.

### A7. PO draft cho supplier khi STOCK_LOW

- **Gap:** M04 alert xong dừng — chủ vẫn tự soạn tin nhắn đặt hàng.
- **Đề xuất:** STOCK_LOW → GAS sinh draft đơn đặt (món, số lượng theo forecast M16, supplier từ INVENTORY) → gửi chủ duyệt qua Telegram → forward Zalo supplier. Đúng tầng-3 (draft, người duyệt).

### A8. Menu board TV tự đổi theo campaign

- **Thị trường:** digital signage là trend 2026 cả quán nhỏ.
- **Đề xuất:** 1 trang HTML (hạ tầng web sẵn) đọc MENU + PROMOTIONS → TV thứ 2 (hoặc chia màn KDS). Happy hour bật → giá trên board tự đổi. `isCampaignActiveNow()` có sẵn, gần như chỉ là view mới.

### A9. Gift voucher QR

- **Đề xuất:** tab VOUCHERS + mã QR in tem (hạ tầng in sẵn) — khách du lịch mua tặng, quán thu tiền trước. Cùng logic đối soát A3.

---

## B. PARKING LOT — chưa áp dụng được, phát triển riêng sau

| # | Tính năng | Vì sao chưa | Điều kiện mở lại |
|---|---|---|---|
| B1 | **API integration GrabFood/ShopeeFood thật** (đơn tự đổ vào event bus) | Merchant API không mở public cho quán nhỏ; đối tác POS phải ký thỏa thuận | Khi có tư cách đối tác POS (bán OS đủ nhiều quán) hoặc Grab mở API. A2 là cầu tạm đủ dùng |
| B2 | **Zalo Mini App đặt món + tích điểm một chạm** | Effort lớn (dev mini app + duyệt Zalo), web order + Zalo OA hiện tại phủ 80% giá trị | Khi CN2 mở (multi-branch) hoặc khách OS yêu cầu đủ nhiều để chia chi phí dev 1 lần bán n lần |
| B3 | **AI ordering chatbot** (khách nhắn Zalo, bot tự tạo đơn) | LLM đứng trong đường đơn hàng = vi phạm bất biến (I.5); sai đơn = mất khách thật | Chỉ khi có lớp confirm người (bot draft → khách bấm xác nhận menu có cấu trúc → mới thành order). Xét sau khi CSKH bot (I.2) chạy ổn 3 tháng |
| B4 | **Xếp ca nhân viên theo forecast** (labor optimization kiểu Tenzo) | M06 payroll cơ bản còn chưa build; quán 2-3 nhân viên chưa đáng | Sau M06 + M16 chạy, và khi có CN2/quy mô ≥5 nhân viên |
| B5 | **Dynamic pricing ngoài happy hour** (giá theo giờ ế tự động) | Nhạy cảm với khách VN quán nhỏ, dễ phản cảm; happy hour campaign (M10) đã phủ nhu cầu thật | Chỉ dạng "smart discount đề xuất qua /promo" — đã có đường đó, không cần feature riêng |
| B6 | **HĐĐT tích hợp sâu** (tự động 100% mọi đơn) | Chưa chạm ngưỡng 1 tỷ; phí provider chưa đáng khi chưa bắt buộc | Threshold watch A1 báo 85% → kích hoạt |
| B7 | **App membership riêng (iOS/Android)** | Trend lớn ở Mỹ (Craver...) nhưng chi phí dev/duy trì không hợp quán VN nhỏ; Zalo là app membership của VN rồi | Không mở lại trừ khi scale chuỗi >5 CN. A3 prepaid + Zalo phủ nhu cầu |

---

## C. Tác động lên sản phẩm bán (đối chiếu ladder, không sinh sản phẩm mới)

- A1 (sẵn sàng thuế NĐ70) + A6 (SePay) → chương mới trong **Sản phẩm B "Quán Tự Chạy OS"** — đau chung mọi quán 2026, hook bán mạnh hơn cả AI.
- A3 (prepaid) + A9 (voucher) → recipe trong **Skill Pack A** (dạy setup trên Sheets).
- A5 (weather) → nguồn data cho gói Hermes DWY (đã có chỗ trong P1).
- B1/B2 → chỉ xét khi OS bán đủ nhiều (kinh tế 1 lần dev, n lần bán).

*Cập nhật khi có quyết định duyệt từng mục §A.*
