---
description: Equipment maintenance status — list overdue/due tasks + mark done
---

Invoke skill `cafe-manager` với chế độ **equipment-maintenance**.

Workflow:
1. Skill load `references/equipment-maintenance.md`
2. Gọi `Maintenance.gs:getAllMaintenanceTasks()` (đã auto-refresh status)
3. Group theo status và dịch các thuật ngữ sang tiếng Việt:
   - **❌ QUÁ HẠN** (overdue >grace_period 3 ngày)
   - **⏰ TỚI HẠN** (đến hạn nhưng còn trong grace_period)
   - **📅 SẮP TỚI** (next_due_at trong 7 ngày tới)
   - **✅ HOÀN THÀNH** (tóm tắt số lượng)
4. Output (Dịch toàn bộ mã thiết bị, loại tác vụ, trạng thái sang tiếng Việt theo từ điển của dự án):
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
5. Hỏi user: "Đánh dấu tác vụ nào đã hoàn thành? (Dán Mã ID tác vụ hoặc gõ 'tất cả quá hạn')"
6. Mark done bulk qua `markMaintenanceDone(task_id, {staff_id, notes, photo_url})`
7. Output: "Đã mark done X tasks. Next due: <list>."

Edge cases:
- Lần đầu chạy → call `seedDefaultMaintenanceTasks()` để seed default cadence
- Nếu user equipment khác default → suggest add manually (insert row vào MAINTENANCE_LOG)
- Photo upload (optional): qua DriveApp.createFile, paste URL vào `photo_url`

Vendor escalation:
- Nếu task `professional_service` overdue → suggest contact vendor + paste `VENDOR_ESPRESSO` from CONFIG
- Skill output draft message ngắn cho user gọi vendor

User input optional: `$ARGUMENTS` có thể là:
- `seed` → chạy seedDefaultMaintenanceTasks()
- `done <task_id>` → quick mark
- `status` (default) → list view
