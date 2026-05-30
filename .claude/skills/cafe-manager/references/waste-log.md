# Reference — Waste Log (Hao hụt / Hủy nguyên liệu)

> Fix gap quan trọng: hiện `deductInventoryForOrder` chỉ trừ kho theo đơn bán.
> Cuối ngày phải log waste để INVENTORY không lệch + COGS chính xác.

## Khi nào log waste

| Reason code | VD | Tần suất expected |
|---|---|---|
| `overproduction` | Pha 5L trà sáng, cuối ngày còn 1.2L | Daily |
| `spillage` | Đổ ly bị rớt, trộn nhầm | Weekly |
| `expiry` | Lô sữa quá hạn, batch trân châu cũ | Weekly |
| `test` | Pha thử recipe mới, training nhân viên | Monthly |
| `other` | Mất do thiết bị fail, mất điện | Edge |

## Workflow `/huy` cuối ngày

User nói "/huy" → skill load reference này → output:

```
🗑️ Log waste cuối ngày

Mở form mobile: <link doGet?action=waste_form>
HOẶC nhập trực tiếp ở đây:

Nguyên liệu hao hụt hôm nay là gì?

VD format:
- Trân châu đường đen: 200g, lý do: overproduction
- Trà hojicha ủ: 1.5L, lý do: overproduction
- Milk foam: 100ml, lý do: spillage
- ...
```

Khi user nhập → skill:
1. Parse từng dòng → mapping ingredient_id từ INVENTORY
2. Estimate cost = qty × cost_per_unit (từ INVENTORY sheet)
3. Append từng row vào WASTE_LOG
4. Update INVENTORY current_stock giảm tương ứng
5. Tính tổng waste hôm nay + % so với revenue
6. Output summary:

```
✅ Đã log 4 dòng waste:
- Trân châu đường đen: 200g  · ~24.000đ
- Trà hojicha: 1.5L  · ~18.000đ
- Milk foam: 100ml  · ~3.500đ
- Bánh croissant: 2 cái · ~20.000đ

Tổng waste: 65.500đ (~2.8% revenue 2.350.000đ)
✅ Trong target <3%
```

Threshold cảnh báo:
- Waste >3% revenue → suggest review recipe portion
- Waste >5% revenue → ⚠️ critical (báo Telegram next morning)

## WASTE_LOG schema

```
waste_id (WST-YYYYMMDD-XXXX) | date | time | ingredient_id (link INVENTORY) | qty | unit |
reason (overproduction/spillage/expiry/test/other) | staff_id | cost_estimate (VND) |
photo_url | notes | logged_at
```

## Integration với COGS calculation

Sau khi log waste:
1. INVENTORY.current_stock giảm theo qty
2. Cost waste hôm nay → cộng vào COGS hiệu chỉnh trong DAILY_METRICS
3. Báo cáo tài chính (Financials.gs) tự pick up

Formula:
```
COGS_thực_tế = COGS_theo_order + cost_waste_hôm_nay
Gross_profit_thực = revenue - COGS_thực_tế
```

## Khi user paste raw waste data

Format chấp nhận (skill parse):
```
<tên nguyên liệu>, <qty> <unit>, <reason>
```
Hoặc:
```
<tên>: <qty><unit> · <reason>
```

Skill detect:
- Unit: g, kg, ml, L, cup, piece, slice
- Reason keywords: "thừa"/"dư"/"overproduction", "đổ"/"rớt"/"spillage", "hết hạn"/"expiry", "test", "khác"

## Mobile form (doGet endpoint)

`Waste.gs:webAppWasteForm()` render HTML form mobile-friendly:
- Dropdown ingredient (lookup INVENTORY)
- Input qty + unit
- Radio reason
- Textarea notes
- (Optional) upload photo qua DriveApp

Submit → `webAppWasteSubmit(e)` → logWaste() → JSON response.

URL: `https://script.google.com/.../exec?action=waste_form`

Khuyến nghị: lưu link này vào màn hình chính điện thoại chủ quán + nhân viên.

## Compose với existing utilities

| Cần | Reuse |
|---|---|
| Append row | SpreadsheetApp.getActiveSpreadsheet().getSheetByName() |
| Format currency | `gas/Utils.gs:formatCurrency()` |
| Generate ID | `WST-YYYYMMDD-XXXX` (giống pattern EXP-) |
| Update INVENTORY | (cần helper mới — atomic update) |
| Telegram alert >5% | `gas/Notify.gs:sendTelegramAlert()` qua throttle `logError` |

## Anti-patterns

- ❌ Forget log waste 2+ ngày → INVENTORY divergence không recover được
- ❌ Log đại số lớn để cân kho (cheat) → batch cost wrong → COGS sai
- ❌ Log mà không cập nhật INVENTORY
- ❌ Mất batch ID khi log → không trace được lô
- ❌ Skip photo waste >100k VND (audit trail)
- ❌ Khôi phục từ WASTE_LOG sang INVENTORY (đã trừ rồi)

## Edge cases

| Case | Handle |
|---|---|
| Quên log 1 ngày | User dùng `/huy` với date trễ → row có `date` ≠ `logged_at` |
| Nhập sai qty | Append correction row với qty âm + reason "correction" |
| Mất net khi log | Form mobile có offline-first (localStorage) — submit khi có net |
| Multi-staff log cùng lúc | Each row có staff_id, append-only → no conflict |
