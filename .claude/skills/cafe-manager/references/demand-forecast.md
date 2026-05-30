# Reference — Demand Forecast (Weather, Event, Holiday)

> Predict demand pattern → staffing + ingredient prep tránh stockout / waste.

## Lực lượng tác động (Vietnam / Lâm Đồng context)

### 1. Weather (Lâm Hà / Lâm Đồng)
| Weather pattern | Demand shift |
|---|---|
| Mưa to (đặc biệt T6-T10) | -20-30% foot traffic, +15% delivery online, +30% hot drink, -20% cold |
| Nắng dịu (T12-T3) | +5-10% foot traffic, +20% cold drink |
| Nắng gắt >32°C | +25% iced + smoothie, -15% espresso hot |
| Sương mù sáng (Lâm Đồng winter) | +20% hot drink trước 10:00 |

### 2. Holiday & event
| Event | Demand impact |
|---|---|
| Tết Nguyên đán (10-15 ngày) | -50% trước Tết 1 tuần, đóng quán 3-5 ngày, +30% sau Tết tuần đầu |
| 30/4-1/5 (lễ dài) | +40% foot traffic, đặc biệt du khách Đà Lạt |
| 2/9 | +30% foot traffic |
| Lễ Giáng sinh | +25% với theme drink |
| Valentine | +15% với "cho 2" combo |
| Trung thu | +20% theme matcha mooncake |
| Tết Tây | +15% nhẹ |
| Chợ phiên Lâm Hà (cuối tuần) | +20% sáng T7 |
| Festival Đà Lạt (tháng 12 odd year) | +50% du khách 2 tuần |

### 3. Day-of-week pattern
| Day | Typical pattern |
|---|---|
| T2 | Slowest (60-70% peak) |
| T3-T5 | Mid (80-90% peak) |
| T6 | Building (100% peak avg) |
| T7 | Peak (120% peak avg) |
| CN | Mid-peak (110%, family-mom) |

### 4. Time-of-day pattern
| Slot | Drink mix |
|---|---|
| 6:00-9:00 | 70% cà phê, 20% trà, 10% bánh |
| 9:00-11:00 | 50% trà sữa, 30% cà phê, 20% bánh |
| 11:00-13:30 | 40% trà sữa, 30% cold, 20% cà phê, 10% takeaway lunch |
| 14:00-17:00 (happy hour) | 60% cold drink + topping, 20% bánh, 20% cà phê 2nd round |
| 17:00-20:00 | 50% trà sữa, 30% bánh, 20% special |
| 20:00-0:00 | 40% cà phê đêm, 30% trà thảo mộc, 30% takeaway |

### 5. Lunar calendar nhẹ
- Rằm + mùng 1: -5% (số khách ăn chay → tránh sữa)
- Đêm cuối tháng âm: -10% (mưa thường rơi)

## Workflow demand forecast

User nói "/sang" hoặc "forecast tomorrow":
1. Pull weather forecast (manual paste hoặc API)
2. Check calendar events
3. Lookup day-of-week + time pattern
4. Output:

```
🔮 Demand forecast — DD/MM/YYYY (T7)

Weather: nắng dịu 24°C, gió nhẹ
Event: chợ phiên Lâm Hà (mặt tiền đông)
Day pattern: T7 → +20% peak avg

Expected orders: 145-165 (baseline 130 × 1.2)
Expected revenue: 5.2-6.0M VND

SKU mix shift:
↑ cold drink (+15%)
↑ trà sữa topping (+10%)
↑ bánh croissant sáng (chợ phiên)
↓ hot espresso (-5%)

Prep recommendations:
- Trân châu: pha 6kg (vs baseline 5kg)
- Trà ủ: matcha 4L + hojicha 3L
- Sữa tươi: dùng 8L
- Bánh: 30 croissant (sáng) + 15 cookie

Stockout risk: 
⚠️ Sữa tươi đang 6L < expected 8L → đặt thêm sáng nay
```

## Long-range forecast (weekly)

`/tuan` brief Friday include:
- Forecast tuần sau từng ngày (weather + event)
- Prep schedule batch ingredient
- Staff schedule recommendation

## Anomaly detection

Khi actual vs forecast lệch >25%:
- Document trong DAILY_METRICS.notes
- Causes:
  - Weather forecast sai (mưa bất chợt)
  - Event không trong calendar (festival ad-hoc)
  - PR boost (post viral)
  - Competitor open/close

## Compose với skill khác

- `data:analyze` — historical trend analysis
- `small-business:business-pulse` — generic forecast pattern

## Limitations (acknowledge)

- Data đầu vào ít trong 3 tháng đầu launch → forecast noisy
- Weather forecast Lâm Đồng accurate ~70% trong 24h, ~50% trong 7d
- Sự kiện địa phương Lâm Hà thường ko lên calendar global
- Khuyến nghị baseline conservative: +/- 30% buffer cho prep

## Anti-patterns

- ❌ Overprep + waste >5% → mất margin
- ❌ Underprep + stockout giờ peak → mất doanh thu + khách phàn nàn
- ❌ Ignore weather hoàn toàn
- ❌ Forecast lúc 9am cho hôm đó (quá muộn để prep)
- ❌ Trust forecast 100% (build buffer)
- ❌ Skip post-mortem khi actual vs forecast lệch lớn
