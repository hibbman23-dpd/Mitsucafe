# Reference — Equipment Preventive Maintenance

> Lịch bảo trì chuẩn industry. Tránh máy hỏng đột xuất → đóng cửa mất doanh thu.

## Equipment inventory MitsuKàphê

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
## Từ điển dịch nghĩa sang tiếng Việt (Bắt buộc dùng khi phản hồi)

Khi hiển thị danh sách bảo trì, trợ lý AI **bắt buộc** dịch các mã và thuật ngữ sau sang tiếng Việt:

### Thiết bị (Equipment)
- `EQ-ESP`: Máy pha Espresso
- `EQ-GRD`: Máy xay cafe
- `EQ-ICE`: Máy làm đá
- `EQ-WTR`: Máy lọc nước sinh hoạt
- `EQ-FRG`: Tủ lạnh
- `EQ-FRZ`: Tủ đông
- `EQ-PRN`: Máy in hóa đơn
- `EQ-PRT`: Máy in tem
- `EQ-BLD`: Máy xay sinh tố
- `EQ-SEL`: Máy dập nắp cốc
- `EQ-SHK`: Máy lắc trà sữa
- `EQ-MLK`: Máy đánh sữa

### Loại tác vụ (Task Type)
- `backflush_chemical`: Vệ sinh họng pha bằng thuốc
- `soak_screen_gasket`: Ngâm filter & gioăng họng pha
- `descale_boiler`: Tẩy cặn nồi hơi
- `replace_group_gasket`: Thay gioăng họng pha
- `professional_service`: Bảo dưỡng hãng
- `burr_brush`: Vệ sinh lưỡi xay (chổi)
- `disassemble_clean`: Tháo rời vệ sinh máy xay
- `weekly_clean`: Vệ sinh máy làm đá hàng tuần
- `deep_sanitize`: Khử trùng sâu máy làm đá
- `replace_water_filter`: Thay lõi lọc nước máy đá
- `cartridge_replace`: Thay lõi lọc nước sinh hoạt
- `weekly_wipe`: Lau chùi tủ lạnh hàng tuần
- `monthly_defrost_check`: Kiểm tra xả tuyết tủ lạnh
- `monthly_defrost`: Xả tuyết tủ đông
- `head_clean`: Vệ sinh đầu in
- `blade_clean`: Vệ sinh lưỡi dao máy xay
- `belt_check`: Kiểm tra dây curoa/băng tải

### Trạng thái (Status)
- `due`: Tới hạn
- `overdue`: Quá hạn
- `ok`: Đã hoàn thành

## Workflow `/bao-tri`

User nói "/bao-tri":
1. Pull MAINTENANCE_LOG → group by equipment
2. Output (dịch toàn bộ tên thiết bị và tác vụ bảo trì sang tiếng Việt, giữ nguyên ID trong ngoặc vuông để phục vụ việc mark done):

```
🔧 Trạng thái bảo trì thiết bị — DD/MM/YYYY

❌ QUÁ HẠN (Cần làm ngay):
  - Máy pha Espresso (Vệ sinh họng pha bằng thuốc) — quá hạn 2 ngày [ID: MTN-EQ-ESP-BACKFLUSH_CHEMICAL]
  - Máy làm đá (Khử trùng sâu) — quá hạn 5 ngày [ID: MTN-EQ-ICE-DEEP_SANITIZE]

⏰ TỚI HẠN (Hôm nay/Ngày mai):
  - Tủ lạnh (Lau chùi tủ lạnh hàng tuần) — hôm nay [ID: MTN-EQ-FRG-WEEKLY_WIPE]
  - Máy xay cafe (Vệ sinh lưỡi xay (chổi)) — ngày mai [ID: MTN-EQ-GRD-BURR_BRUSH]

📅 SẮP TỚI (Trong 7 ngày):
  - Máy pha Espresso (Tẩy cặn nồi hơi) — 4 ngày nữa [ID: MTN-EQ-ESP-DESCALE_BOILER]
  - Máy lọc nước sinh hoạt (Thay lõi lọc nước) — 6 ngày nữa [ID: MTN-EQ-WTR-CARTRIDGE_REPLACE]

✅ HOÀN THÀNH: 12 tác vụ đã hoàn thành tốt
```

Sau output → hỏi: "Đánh dấu tác vụ nào đã hoàn thành? (dán mã ID tác vụ hoặc gõ 'tất cả quá hạn')" → user list → markDone() bulk.

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
