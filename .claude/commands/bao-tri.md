---
description: Equipment maintenance status — list overdue/due tasks + mark done
---

Invoke skill `cafe-manager` với chế độ **equipment-maintenance**.

Workflow:
1. Skill load `references/equipment-maintenance.md`
2. Gọi `Maintenance.gs:getAllMaintenanceTasks()` (đã auto-refresh status)
3. Group theo status:
   - **❌ OVERDUE** (overdue >grace_period 3 ngày)
   - **⏰ DUE** (đến hạn nhưng còn trong grace_period)
   - **📅 UPCOMING** (next_due_at trong 7 ngày tới)
   - **✅ OK** (count tóm tắt, không list)
4. Output:
   ```
   🔧 Maintenance status — DD/MM/YYYY

   OVERDUE (cần làm ngay):
     ❌ EQ-ESP backflush_chemical — overdue 2d
     ❌ EQ-ICE deep_sanitize — overdue 5d

   DUE hôm nay/ngày mai:
     ⏰ EQ-FRG weekly_wipe — hôm nay
     ⏰ EQ-GRD burr_brush — mai

   SẮP TỚI (7 ngày):
     📅 EQ-ESP descale_boiler — 4d
     📅 EQ-WTR cartridge_replace — 6d

   OK: 12 task in green
   ```
5. Hỏi user: "Đánh dấu task nào đã xong? (paste task_id hoặc 'all overdue')"
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
