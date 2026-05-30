# Reference — Equipment Preventive Maintenance

> Lịch bảo trì chuẩn industry. Tránh máy hỏng đột xuất → đóng cửa mất doanh thu.

## Equipment inventory KaeruKàphê

| ID | Equipment | Vendor | Service interval recommend |
|---|---|---|---|
| EQ-ESP | Máy pha espresso | (e.g. Brewmate / La Marzocco / DeLonghi) | Daily backflush, monthly descale, quarterly pro service |
| EQ-GRD | Máy xay cà phê | (e.g. Mazzer / Eureka) | Weekly burr clean, monthly full disassemble |
| EQ-ICE | Máy đá | (e.g. Hoshizaki / Brema) | Weekly clean, monthly deep sanitize, quarterly filter |
| EQ-FRG | Tủ lạnh | (e.g. LG / Sanaky) | Weekly wipe, monthly defrost check |
| EQ-FRZ | Tủ đông | | Monthly defrost |
| EQ-WTR | Máy lọc nước | (e.g. Karofi / Pureit) | Quarterly cartridge change |
| EQ-BLD | Máy xay sinh tố | | Daily clean after use |
| EQ-SHK | Máy lắc trà sữa | | Weekly clean |
| EQ-SEL | Máy seal ly | | Monthly check belt + film |
| EQ-MLK | Máy đánh sữa (steam) | (part of espresso) | Daily wipe immediate, weekly soak |
| EQ-PRN | Máy in tem (Xprinter POS-58L) | Xprinter | Monthly head clean |
| EQ-PRT | Máy in tem (Xprinter XP-365B) | Xprinter | Monthly head clean |

User cập nhật danh sách thực tế khi mua thiết bị (qua MAINTENANCE_LOG init).

## Maintenance cadence chuẩn (research-backed)

### Espresso machine (EQ-ESP)

| Task | Frequency | Time | Note |
|---|---|---|---|
| Backflush no chemical | 6h | 2' | Each group head, 3s steam wand purge |
| Wipe steam wand sạch | After every steaming | 5s | Tránh milk dry inside |
| Backflush with chemical (Cafiza/Pulycaff) | Daily (close) | 5' | 5 cycles |
| Tháo basket + portafilter rửa nóng | Daily | 3' | |
| Soak group screen + gasket | Weekly (Mon) | 30' | Cleaning solution |
| Inspect portafilter basket | Weekly | 2' | Crack / scale |
| Descale boiler | Monthly | 1h | Nếu nước >5°dH |
| Boiler sight glass check | Monthly | 5' | If accessible |
| Replace gasket | 6 months | 30' | Group + steam wand |
| Replace dispersion screen | 12 months | 15' | |
| Professional service | Quarterly | (vendor) | Inspect boiler valve etc. |

### Grinder (EQ-GRD)

| Task | Frequency | Time |
|---|---|---|
| Vacuum bin + chute | Daily | 1' |
| Burr brush | Weekly | 5' |
| Full disassemble + ultrasonic clean | Monthly | 30' |
| Burr sharpness check | Quarterly | 5' |
| Replace burr | 12-18 months (depends volume) | 30' |

### Ice maker (EQ-ICE)

| Task | Frequency | Time |
|---|---|---|
| Wipe outer | Daily | 2' |
| Drain + rinse internal | Weekly | 10' |
| Deep sanitize with food-safe solution | Monthly | 1h |
| Replace water filter | Quarterly | 15' |
| Service motor + check ice production rate | Quarterly | 30' |

### Water filter (EQ-WTR)

| Task | Frequency |
|---|---|
| Check pressure gauge | Weekly |
| Replace cartridge | 3-6 months tùy nước input |
| Full system clean | 12 months |

### Fridge/freezer (EQ-FRG/EQ-FRZ)

| Task | Frequency |
|---|---|
| Wipe inside + check temp | Weekly |
| FIFO check date labels | Weekly |
| Defrost (if non-frost-free) | Monthly |
| Gasket inspection | Quarterly |
| Coil cleaning back | 6 months |

### Other equipment
- Blender: rinse + tháo blade rửa daily
- Sealer: belt check monthly
- Printer (Xprinter POS-58L/XP-365B): head clean với cồn isopropyl monthly
- Steam wand: lau immediately after every steaming (DAILY)

## MAINTENANCE_LOG schema

```
task_id (MTN-EQ-TASK-XXXX) | equipment | task_type | frequency_days |
last_done_at | next_due_at | status (ok/due/overdue) |
staff_id | notes | photo_url | seed_at
```

Status auto-update:
- `ok`: `now < next_due_at`
- `due`: `now >= next_due_at AND now < next_due_at + grace_period (3 days)`
- `overdue`: `now >= next_due_at + grace_period`

## Workflow `/bao-tri`

User nói "/bao-tri":
1. Pull MAINTENANCE_LOG → group by equipment
2. Output:

```
🔧 Maintenance status — DD/MM/YYYY

OVERDUE (cần làm ngay):
  ❌ EQ-ESP backflush_chemical — overdue 2 ngày
  ❌ EQ-ICE deep_sanitize — overdue 5 ngày

DUE hôm nay/ngày mai:
  ⏰ EQ-FRG weekly_wipe — hôm nay
  ⏰ EQ-GRD burr_brush — mai

SẮP TỚI (7 ngày):
  📅 EQ-ESP descale_monthly — 4 ngày nữa
  📅 EQ-WTR cartridge_replace — 6 ngày nữa

OK:
  ✅ 12 task in green
```

Sau output → hỏi: "Đánh dấu task nào đã xong?" → user list → markDone() bulk.

## Cron reminder

`cronEquipmentMaintReminder`:
- Hourly check overdue/due
- Telegram alert nếu overdue >3 ngày (qua throttle 24h dedupe per task)
- Daily morning digest (7:00) tổng kết due today

Edge: nếu user dismiss reminder 3 lần liên tiếp → suggest escalate "Cần liên hệ vendor service".

## Maintenance log photo (audit)

Khi user mark done:
- Optional: upload photo (qua DriveApp.createFile)
- Photo URL lưu trong MAINTENANCE_LOG.photo_url
- Dùng cho audit + tranh chấp với vendor warranty

## Vendor contact registry

Lưu trong CONFIG sheet:
- `VENDOR_ESPRESSO` = "Tên + SDT + ngày bảo hành"
- `VENDOR_ICE_MAKER`
- `VENDOR_WATER_FILTER`

Khi /bao-tri output có vendor service task → kèm contact info.

## Anti-patterns

- ❌ Skip daily backflush vì "máy còn sạch"
- ❌ Dùng nước thường tha nước RO/lọc → scale nhanh
- ❌ Quên ghi serial number của filter để track replacement
- ❌ Backflush wrong: dùng water thay vì chemical solution
- ❌ Để gasket cứng → leakage
- ❌ Skip quarterly pro service vì "máy chạy ổn" (small issue grow big)
- ❌ Vệ sinh ice maker không dùng food-safe sanitizer
