# Reference — Cash Reconciliation (Đối soát két tiền mặt)

> Z-report style. Tránh sai lệch giữa số tiền trong két thực tế và số ORDERS payment_method=cash.

## Threshold (configurable trong CONFIG sheet)

| Variance | Status | Action |
|---|---|---|
| `\|var\| ≤ 20.000đ` | `ok` | Log + tiếp tục |
| `20k < \|var\| ≤ 50.000đ` | `warn` | Log + ghi note, KHÔNG alert |
| `\|var\| > 50.000đ` | `alert` | Telegram chủ quán + suggest camera review |

CONFIG keys (Phase C sẽ seed):
- `CASH_VARIANCE_WARN_VND` = 20000
- `CASH_VARIANCE_ALERT_VND` = 50000
- `DEFAULT_CASH_FLOAT_VND` = 500000 (tiền float đầu ca)

## Z-report formula

```
expected_closing = opening_cash 
                 + Σ(ORDERS hôm nay, shift, payment_method=cash, payment_status=PAID, total)
                 - Σ(EXPENSES hôm nay, shift, payment_method=cash, amount)

variance = closing_cash_actual - expected_closing
```

## Workflow `/chot-ca`

### Mở ca sáng (open shift)
User nói "/chot-ca start" hoặc `/chot-ca open`:
```
Mở ca [sang/chieu/toi] - DD/MM/YYYY HH:MM
Tiền float đầu ca: <default 500.000đ> — đổi nếu khác

→ Append CASH_LOG: opening_cash, opened_at, shift, staff_id
→ Return log_id
```

### Đóng ca (close shift)
User nói "/chot-ca" hoặc `/chot-ca close`:
```
Đóng ca [sang/chieu/toi] - DD/MM/YYYY HH:MM
Tiền thực tế đếm được trong két: <user nhập VND>

→ Compute expected_closing
→ variance = actual - expected
→ Status (ok/warn/alert)
→ Update CASH_LOG row hiện hành (closing_actual, closing_expected, variance, status, closed_at)
→ Render summary
→ Nếu alert → Telegram chủ quán qua logError pattern (throttle 6h)
```

### Output summary

```
🧾 Đối soát ca <chieu> - 25/11/2026

Tiền float đầu ca:    500.000đ
+ Cash orders (X đơn): 1.250.000đ
- Cash expenses:        25.000đ
─────────────────────
Expected closing:    1.725.000đ
Actual count:        1.700.000đ
─────────────────────
VARIANCE:              -25.000đ  ⚠️ WARN

Note: Variance trong khoảng 20-50k. Note + tiếp tục.
```

## Shift mapping

Mitsu hours 6:00-0:00. Mặc định 3 ca:

| Shift code | Time window |
|---|---|
| `sang` | 6:00 - 14:00 |
| `chieu` | 14:00 - 18:00 |
| `toi` | 18:00 - 0:00 |

Solo operator MVP: 1 shift = 1 day. Khi có staff: split ca.

## CASH_LOG schema

```
log_id (CSH-YYYYMMDD-XXX) | date | shift | staff_id |
opening_cash | closing_cash_actual | closing_cash_expected |
variance | variance_pct | status (ok/warn/alert) |
cash_orders_total | cash_expenses_total |
notes | opened_at | closed_at
```

`variance_pct` = `variance / expected_closing × 100` (để tracking trend không depend value tuyệt đối).

## Trend analysis (cho `/tuan` brief)

Aggregate weekly:
- Tổng variance tuyệt đối
- % ca ok / warn / alert
- Top staff_id có variance lớn nhất (khi có staff)
- Avg variance per shift

Nếu trend variance ↑ liên tục >2 tuần → flag possible:
- POS settings bug (compute expected sai)
- Cash handling habit (không đếm cẩn thận)
- (Suspected) skimming

## Alert template (Telegram khi >50k)

```
🚨 CASH VARIANCE ALERT

Ca: <shift> - <date>
Staff: <staff_id>
Expected: <X.XXX.XXXđ>
Actual:   <X.XXX.XXXđ>
Variance: <±X.XXXđ>

Suggest review:
1. Camera quay khu pha 14:00-18:00
2. ORDERS payment_method=cash hôm nay
3. EXPENSES payment_method=cash hôm nay

Log: CSH-YYYYMMDD-XXX
```

## Edge cases

| Case | Handle |
|---|---|
| Đóng ca trước khi mở | Auto-open ca với default float |
| Mở 2 ca cùng lúc | Reject — phải close ca cũ trước |
| Variance siêu lớn (>200k) | Alert + suggest check POS reset, không done close ca |
| Quên đóng ca cuối ngày | Auto-close 00:30 với last known cash_total + flag "auto_closed" |
| Negative opening (debt) | Reject — float phải ≥0 |
| Tiền giả phát hiện | Notes manually + adjust closing_actual với reason |

## Tích hợp với cron

`cronCashReconAlert` chạy sau mỗi close shift:
- Check variance status
- Nếu `alert` → Telegram qua throttle (6h dedupe per shift code)

`cronWeeklyOpsDigest` Friday 06:30:
- Aggregate tuần qua: total variance + breakdown ok/warn/alert
- Trend so với tuần trước
- Đưa vào weekly brief section "Operations highlight"

## Anti-patterns

- ❌ Skip đếm thực tế → nhập closing = expected (cheat)
- ❌ Đếm chỉ 1 lần (nên đếm 2 lần độc lập, khớp mới chốt)
- ❌ Để tiền lẻ qua đêm trong két (chỉ giữ float, còn lại safe)
- ❌ Mở ca không log → end ca không có baseline
- ❌ Variance < -100k mà không alert
- ❌ Override variance manually không note lý do
