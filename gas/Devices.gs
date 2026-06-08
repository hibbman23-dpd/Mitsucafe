/**
 * Devices.gs — Cấp quyền thiết bị cho trang nội bộ (dashboard/kds).
 *
 * Ý tưởng: mỗi thiết bị sinh device_id (UUID, lưu localStorage). Thiết bị mới = PENDING,
 * trang nội bộ hiện màn "Chờ Mac Mini cấp quyền". Chủ quán DUYỆT (qua dashboard tab
 * "Thiết bị" sau khi đăng nhập mật khẩu, HOẶC Mac Mini curl bằng REPORT_API_TOKEN).
 * Endpoint data (orders, dashboard_summary…) chỉ chạy khi device_id = APPROVED.
 *
 * Sheet DEVICES:
 *   device_id | label | status | first_seen | approved_at | approved_by | last_seen | user_agent
 *   status ∈ pending | approved | revoked
 *
 * Bootstrap KHÔNG tự khóa: device_list/approve/revoke KHÔNG bị device-gate
 * (chỉ cần admin session hoặc report token) → luôn duyệt được thiết bị đầu tiên.
 */

var _DEVICES_HEADERS = ['device_id', 'label', 'status', 'first_seen', 'approved_at', 'approved_by', 'last_seen', 'user_agent'];

function _devicesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DEVICES');
  if (!sheet) {
    sheet = ss.insertSheet('DEVICES');
    sheet.getRange(1, 1, 1, _DEVICES_HEADERS.length).setValues([_DEVICES_HEADERS])
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _deviceRowIndex(sheet, deviceId) {
  if (!deviceId) return -1;
  var ids = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(deviceId)) return i + 1; // 1-based row
  }
  return -1;
}

/** Thiết bị mới đăng ký xin quyền (open — chưa cần auth). */
function deviceRegister(deviceId, label, userAgent) {
  if (!deviceId) return { ok: false, error: 'device_id required' };
  var sheet = _devicesSheet();
  var now = new Date().toISOString();
  var row = _deviceRowIndex(sheet, deviceId);
  if (row !== -1) {
    sheet.getRange(row, 7).setValue(now); // last_seen
    var status = sheet.getRange(row, 3).getValue();
    return { ok: true, status: String(status || 'pending'), device_id: deviceId };
  }
  sheet.appendRow([deviceId, label || '', 'pending', now, '', '', now, (userAgent || '').slice(0, 200)]);
  return { ok: true, status: 'pending', device_id: deviceId };
}

/** Trang nội bộ poll trạng thái (open). Cập nhật last_seen. */
function deviceCheck(deviceId) {
  if (!deviceId) return { ok: true, status: 'unknown' };
  var sheet = _devicesSheet();
  var row = _deviceRowIndex(sheet, deviceId);
  if (row === -1) return { ok: true, status: 'unknown' };
  sheet.getRange(row, 7).setValue(new Date().toISOString());
  return { ok: true, status: String(sheet.getRange(row, 3).getValue() || 'pending') };
}

/** Gate cho endpoint data.
 *  ĐÃ TẮT device-approval (chuyển sang gate trang ở tầng Cloudflare/Worker).
 *  Luôn true → không chặn theo thiết bị nữa. (Giữ token/password guard ở Code.gs.) */
function isDeviceApproved(deviceId) {
  return true;
}

/** Danh sách thiết bị cho dashboard tab "Thiết bị". */
function deviceList() {
  var sheet = _devicesSheet();
  if (sheet.getLastRow() < 2) return { ok: true, devices: [] };
  var data = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push({
      device_id: data[i][0], label: data[i][1], status: data[i][2],
      first_seen: _isoOrStr(data[i][3]), approved_at: _isoOrStr(data[i][4]),
      approved_by: data[i][5], last_seen: _isoOrStr(data[i][6]), user_agent: data[i][7],
    });
  }
  // mới nhất (last_seen) lên đầu
  out.sort(function (a, b) { return String(b.last_seen).localeCompare(String(a.last_seen)); });
  return { ok: true, devices: out };
}

function _isoOrStr(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }

/** Duyệt thiết bị (upsert). approvedBy = 'admin' (session) hoặc 'mac-mini' (report token).
 *  Nếu thiết bị chưa đăng ký (vd self-approve từ Dashboard) → tạo mới luôn ở trạng thái approved. */
function deviceApprove(deviceId, approvedBy, label) {
  if (!deviceId) return { ok: false, error: 'device_id required' };
  var sheet = _devicesSheet();
  var row = _deviceRowIndex(sheet, deviceId);
  var now = new Date().toISOString();
  if (row === -1) {
    sheet.appendRow([deviceId, label || '', 'approved', now, now, approvedBy || 'admin', now, '']);
    return { ok: true, device_id: deviceId, status: 'approved', created: true };
  }
  sheet.getRange(row, 3).setValue('approved');
  sheet.getRange(row, 5).setValue(now);
  sheet.getRange(row, 6).setValue(approvedBy || 'admin');
  return { ok: true, device_id: deviceId, status: 'approved' };
}

/** Thu hồi quyền thiết bị. */
function deviceRevoke(deviceId) {
  var sheet = _devicesSheet();
  var row = _deviceRowIndex(sheet, deviceId);
  if (row === -1) return { ok: false, error: 'device không tồn tại' };
  sheet.getRange(row, 3).setValue('revoked');
  return { ok: true, device_id: deviceId, status: 'revoked' };
}

/** Đặt nhãn dễ nhớ cho thiết bị (vd "Tablet bếp"). */
function deviceLabel(deviceId, label) {
  var sheet = _devicesSheet();
  var row = _deviceRowIndex(sheet, deviceId);
  if (row === -1) return { ok: false, error: 'device không tồn tại' };
  sheet.getRange(row, 2).setValue(String(label || '').slice(0, 80));
  return { ok: true, device_id: deviceId };
}
