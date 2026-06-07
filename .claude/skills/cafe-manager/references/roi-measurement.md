# Reference — ROI Measurement (/roi)

> **Agent Đo lường ROI** — mảnh ghép Bước 5 ("đo & tối ưu") trong lộ trình AI Agent Company.
> Mục tiêu: trả lời được 3 câu hỏi mà các agent khác KHÔNG trả lời:
>   1. Post / promo nào THỰC SỰ đẻ ra đơn?
>   2. Campaign nào lãi thật sau khi trừ chiết khấu?
>   3. Đồng marketing nào nên SCALE, đồng nào nên KILL?

Con người (agent post/promo/khach) LÀM việc. Agent này CHẤM ĐIỂM việc đó rồi feed ngược lại.

---

## 1. NGUYÊN TẮC ĐO

1. **Không bịa số.** Chỉ tính khi có data ORDERS (qua GAS endpoint) hoặc user paste. Thiếu data → nói rõ "cần X" rồi dừng.
2. **Luôn so với baseline.** Doanh thu trong promo vô nghĩa nếu không biết ngày thường bán bao nhiêu. ROI = *phần TĂNG THÊM*, không phải tổng.
3. **Quy về gross profit, không phải revenue.** Bán nhiều mà chiết khấu ăn hết margin = lỗ. Luôn trừ COGS + chi phí khuyến mãi.
4. **Attribution trung thực.** Café nhỏ → đừng over-engineer. Dùng 3 tín hiệu có sẵn: `utm_source`, `on_promo`/`promo_price` trên item, và cửa sổ thời gian.
5. **Mỗi activity 1 verdict.** Output cuối luôn kết thúc bằng: SCALE / KEEP / FIX / KILL — không để lửng lơ.

---

## 2. NGUỒN DỮ LIỆU

| Cần | Lấy từ | Trạng thái |
|---|---|---|
| Đơn + utm_source + items_json + total | `ORDERS` tab | ✅ có sẵn |
| Item có on_promo / promo_price | `ORDERS.items_json` | ✅ có sẵn |
| Campaign window + discount + target_sku | `PROMOTIONS` tab | ✅ có sẵn |
| COGS theo SKU (để tính gross profit) | `MENU.cost` | ✅ có sẵn |
| Web traffic theo source | Cloudflare Analytics | 🟡 manual paste (xem `analytics.md`) |
| **Chi phí + link mỗi post/campaign** | `MARKETING_LOG` tab | ✅ `gas/Marketing.gs` |
| **`utm_campaign` per order** | `ORDERS` cột 28 | ✅ `gas/Orders.gs` |

**One-shot endpoint:** `GET /?action=roi_data&from=YYYY-MM-DD&to=YYYY-MM-DD`
→ trả JSON gộp ORDERS + PROMOTIONS + MARKETING_LOG + MENU costs (đủ để tính toàn bộ ROI). Mặc định from = 28 ngày trước (đủ baseline). Đây là nguồn data chính của agent — gọi 1 lần, không cần paste tay.

**Attribution 2 tầng:**
- Tầng kênh: `utm_source` (ig/fb/qr/zalo…) — luôn có.
- Tầng chiến dịch: `utm_campaign` (cột 28 ORDERS) — phân biệt 2 post IG khác nhau. Link đặt hàng phải gắn `&utm_campaign=...` (xem §6.2).

---

## 3. CÔNG THỨC ROI

### 3.1 Baseline (nền so sánh)
```
baseline_revenue_per_day = trung bình doanh thu của N ngày-tương-đương GẦN NHẤT
  ngoài promo (cùng thứ trong tuần nếu có thể — T6 so T6).
N mặc định = 3-4 tuần.
```

### 3.2 Promo / Campaign ROI
```
incremental_revenue = revenue_trong_window − (baseline_per_day × số_ngày_window)
discount_cost       = Σ (giá_gốc − promo_price) × qty   (đơn on_promo)
incremental_GP      = incremental_revenue × gross_margin% − discount_cost − promo_opex
ROI%                = incremental_GP / (discount_cost + promo_opex + ad_spend) × 100
```
- `promo_opex` = chi phí phụ (in banner, quà tặng, ad boost…). Lấy từ MARKETING_LOG; chưa có → 0 + flag.
- `gross_margin%` lấy từ `menu_costs` trong `roi_data`:
  - Ưu tiên: `(price − unit_cost) / price` (`unit_cost` = cost_nl + cost_packaging, đã gồm bao bì).
  - HOẶC `1 − cogs_percent` (⚠️ `cogs_percent` là **PHÂN SỐ**: 0.33 = COGS 33% → margin 67%, KHÔNG phải 33% margin).
  - Thiếu cả hai → dùng 65% giả định + flag.

### 3.3 Content / Post ROI (organic)
Khó đo trực tiếp → dùng **proxy attribution cửa sổ 72h**:
```
attributed_orders = đơn có utm_source = kênh_post, timestamp trong 72h sau giờ post
                    VƯỢT baseline_channel_rate của kênh đó
revenue_attributed = Σ total các đơn đó
effort_cost        = (giờ làm content + ad_spend nếu boost)   ← từ MARKETING_LOG
verdict score      = revenue_attributed / effort_cost  +  engagement (reach→order CVR)
```
Note: organic chỉ là *ước lượng tương quan*, không phải nhân quả. Luôn ghi rõ "proxy".

### 3.4 Channel scorecard (tổng quát)
```
Mỗi utm_source: số đơn · revenue · AOV · % tổng đơn · (CAC nếu kênh có ad_spend)
→ xếp hạng kênh nào mang khách & doanh thu hiệu quả nhất.
```

---

## 4. NGƯỠNG VERDICT

| ROI% (promo) | Verdict | Hành động |
|---|---|---|
| > 200% | 🟢 **SCALE** | Lặp lại, tăng tần suất / mở rộng SKU |
| 50–200% | 🟢 **KEEP** | Giữ nguyên, tinh chỉnh nhỏ |
| 0–50% | 🟡 **FIX** | Lãi mỏng — sửa discount/timing/target trước khi chạy lại |
| < 0% | 🔴 **KILL** | Lỗ — dừng, đừng lặp lại |

| Content (72h proxy) | Verdict |
|---|---|
| revenue_attributed ≥ 3× effort_cost & reach tốt | 🟢 SCALE format này |
| 1–3× | 🟢 KEEP |
| < 1× nhưng reach cao | 🟡 FIX (reach có, không ra đơn → sửa CTA/offer) |
| reach thấp & đơn ~0 | 🔴 KILL format/giờ post này |

Bổ sung cờ:
- Discount > 30% mà ROI vẫn < 50% → cảnh báo "đang mua doanh thu bằng lỗ margin".
- Promo trùng ngày peak (T7/lễ) → flag "discount khi vốn đã đông = lãng phí".
- Promo overlap loyalty redemption → flag double-cost.

---

## 5. OUTPUT FORMAT CHUẨN

```markdown
# 📊 ROI Scorecard — <kỳ: tuần/tháng/campaign cụ thể>
> Baseline: <X.XXXđ/ngày> (N ngày tương đương ngoài promo) · Margin giả định: <X%>

## 🎯 Campaign / Promo
| Campaign | Window | Inc. revenue | Discount cost | Inc. GP | ROI% | Verdict |
|---|---|---|---|---|---|---|
| <name> | <ngày> | +X.XXXđ | -X.XXXđ | +X.XXXđ | XXX% | 🟢 SCALE |

## 📱 Content / Post (proxy 72h)
| Post | Platform | Reach | Đơn gán | Rev gán | Effort | Verdict |
|---|---|---|---|---|---|---|
| <topic> | IG | X | X | X.XXXđ | Xh | 🟢 KEEP |

## 📡 Channel scorecard
| Kênh (utm) | Đơn | Revenue | AOV | % đơn | CAC |
|---|---|---|---|---|---|
| qr | X | X.XXXđ | XX.XXXđ | X% | – |
| ig | X | ... | ... | ... | X.XXXđ |

## ⚠️ Cờ cảnh báo
- <vd: Flash matcha -25% ROI chỉ 12% → mua doanh thu bằng lỗ margin>

## ✅ Quyết định (feed ngược các agent)
1. **SCALE**: <activity> → báo /promo lặp lại / /post nhân format
2. **KILL**: <activity> → ngừng
3. **FIX**: <activity> → sửa <gì> rồi test lại
4. **Data gap cần lấp**: <vd: thêm utm_campaign cho link IG>
```

---

## 6. SETUP ATTRIBUTION — ĐÃ TRIỂN KHAI (2026-06-07)

### 6.1 Tab MARKETING_LOG — ✅ `gas/Marketing.gs`
Schema:
```
activity_id | date | type (post|promo|ad|event) | platform | campaign_id (link PROMOTIONS) |
title | utm_tag | cost_vnd | effort_hours | reach | clicks | notes
```
> Chỗ DUY NHẤT lưu **chi phí marketing** — không có nó thì ROI = revenue trần.
> Nhập nhẹ: date + type + cost + utm_tag là đủ.

**Setup 1 lần (chạy trong Apps Script editor):**
- `initMarketingLog()` — tạo tab (idempotent)
- `seedMarketingLogSamples()` — (tuỳ chọn) 3 dòng mẫu để test agent
- Nhập hằng ngày: `logMarketingActivity({...})` hoặc nhập tay / mobile form

### 6.2 utm_campaign — ✅ ORDERS cột 28 (`gas/Orders.gs`)
Link đặt hàng trên mỗi post/campaign gắn thêm `&utm_campaign=...`:
```
?utm_source=ig&utm_campaign=matcha-flash-0620
```
`doPost` đọc `p.utm_campaign` → ghi cột 28 ORDERS (KHÔNG đụng `notes` vì notes in trên tem dán ly).
Khi đó attribution xuống tới từng post. Chưa gắn utm_campaign → vẫn chạy ở mức KÊNH (utm_source).

> Sau khi sửa GAS → reminder user: `cd gas && clasp push`. Đơn cũ trước 2026-06-07 không có utm_campaign → agent coi là blank, attribution mức kênh.

---

## 7. NHỊP CHẠY

| Khi nào | Làm gì |
|---|---|
| **Mỗi cuối campaign** (`endCampaign` trigger) | Auto-tính ROI 1 campaign → đính kèm Telegram report |
| **Thứ 6 hằng tuần** (gọi trong `/tuan`) | ROI scorecard tuần → mục "Content & engagement" của weekly brief |
| **Ad-hoc** (`/roi <campaign>`) | User hỏi 1 campaign/post cụ thể |
| **Cuối tháng** | Channel scorecard tháng → quyết định ngân sách kênh |

Tích hợp `/tuan`: weekly-brief mục "📱 Content & engagement" → thay bằng ROI scorecard rút gọn (top SCALE + top KILL).

---

## 8. COMPOSE & ANTI-PATTERN

Compose với:
- `campaign-promo.md` — promo có sẵn "ROI tracking plan"; agent này CHẠY plan đó sau khi promo kết thúc.
- `rfm-segmentation.md` — winback ROI: bao nhiêu khách At-Risk quay lại sau winback.
- `menu-engineering.md` — promo đẩy Dogs có cứu được không, hay chỉ giảm giá Stars (mất margin vô ích).
- `weekly-brief.md` — feed kết quả vào.

Anti-pattern:
- ❌ Báo "doanh thu promo X triệu" mà không trừ baseline + discount → con số vô nghĩa.
- ❌ Gán nhân quả cho organic post ("post này tạo 20 đơn") — luôn ghi "proxy/tương quan".
- ❌ Tính ROI khi chưa có cost trong MARKETING_LOG → phải flag "cost=0, ROI lạc quan giả".
- ❌ Tạo thêm tab Sheets ngoài MARKETING_LOG.
- ❌ So promo T7 với baseline T3 (khác nhịp khách) — phải so cùng thứ trong tuần.
- ❌ Kết luận KILL chỉ sau 1 lần chạy nếu sample nhỏ (<20 đơn) → ghi "cần thêm data".
