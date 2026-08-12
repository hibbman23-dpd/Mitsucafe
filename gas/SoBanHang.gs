/**
 * SoBanHang.gs — Sổ bán hàng cho việc kê khai thuế.
 *
 * Dựng HAI tab từ ORDERS, KHÔNG sửa ORDERS:
 *   SO_BAN_HANG — mỗi đơn một dòng, cột người đọc được
 *   TONG_THANG  — tổng theo tháng, tách tiền mặt / chuyển khoản
 *
 * Vì sao không sắp xếp lại chính ORDERS: nó là bảng append-only (nguyên tắc bất
 * biến trong CLAUDE.md), và toàn bộ hệ thống — in tem, in bill, đối soát két,
 * báo cáo tài chính — đọc nó theo vị trí/tên cột. Đổi thứ tự hay bỏ cột là gãy
 * dây chuyền. Hai tab này là BẢN ĐỌC, dựng lại được bất cứ lúc nào.
 *
 * Doanh thu chỉ tính đơn ĐÃ GIAO và ĐÃ THU TIỀN. Đơn huỷ, đơn tách, đơn rỗng
 * (in sai bill rồi huỷ) không vào sổ.
 */

var SO_BAN_HANG_HEADERS = [
  'Ngày', 'Giờ', 'Mã đơn', 'Bàn', 'Nội dung', 'Số ly',
  'Thành tiền', 'Thanh toán', 'Kênh', 'Mã hệ thống'
];

var TONG_THANG_HEADERS = [
  'Tháng', 'Số đơn', 'Doanh thu', 'Tiền mặt', 'Chuyển khoản / QR', 'Trung bình mỗi đơn'
];

// Chỉ hai trạng thái này mới là tiền thực thu.
function _sbhIsRevenue(status, paymentStatus, total) {
  if (String(status || '').toUpperCase() !== 'DELIVERED') return false;
  if (String(paymentStatus || '').toUpperCase() !== 'PAID') return false;
  return Number(total) > 0;
}

// 'cash' -> Tiền mặt. Mọi thứ còn lại coi là không dùng tiền mặt (để tách cột
// tổng tháng) nhưng vẫn hiện đúng tên phương thức ở sổ chi tiết.
function _sbhPayLabel(method) {
  var m = String(method || '').toLowerCase();
  return {
    cash: 'Tiền mặt',
    momo: 'MoMo',
    vietqr: 'VietQR',
    bank_transfer: 'Chuyển khoản',
    zalopay: 'ZaloPay',
    vnpay: 'VNPay'
  }[m] || (m ? m : 'Không rõ');
}

function _sbhIsCash(method) {
  return String(method || '').toLowerCase() === 'cash';
}

/** items_json -> "2× Sữa chua dâu sấy · 1× Matcha latte muối" */
function _sbhItemsText(itemsJson) {
  var items;
  try {
    items = JSON.parse(itemsJson || '[]');
  } catch (e) {
    return '(không đọc được danh sách món)';
  }
  if (!items || !items.length) return '';
  var parts = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var qty = Number(it.qty) || 1;
    var name = it.name || it.sku || '?';
    var size = it.modifiers && it.modifiers.size ? ' (' + it.modifiers.size + ')' : '';
    parts.push(qty + '× ' + name + size);
  }
  return parts.join(' · ');
}

function _sbhCupCount(itemsJson) {
  var items;
  try {
    items = JSON.parse(itemsJson || '[]');
  } catch (e) {
    return 0;
  }
  var n = 0;
  for (var i = 0; i < (items || []).length; i++) n += Number(items[i].qty) || 0;
  return n;
}

function _sbhFmtDate(ts) {
  if (!ts) return '';
  var d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
}

function _sbhFmtTime(ts) {
  if (!ts) return '';
  var d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'HH:mm');
}

function _sbhMonthKey(ts) {
  if (!ts) return '';
  var d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'MM/yyyy');
}

function _sbhSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

/**
 * Dựng lại cả hai tab từ đầu. Chạy lại bao nhiêu lần cũng ra kết quả như nhau.
 *
 * @param {Object} [p] — { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } lọc theo ngày,
 *                       bỏ trống thì lấy tất cả.
 */
function buildSoBanHang(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('ORDERS');
  if (!src) return { ok: false, error: 'Không có tab ORDERS' };
  if (src.getLastRow() < 2) return { ok: false, error: 'ORDERS chưa có dữ liệu' };

  var data = src.getDataRange().getValues();
  // Tra cột theo TÊN, không theo số thứ tự: ORDERS có 24 cột và từng được thêm
  // cột giữa chừng. Hardcode chỉ số là lỗi âm thầm chờ sẵn.
  var head = data[0].map(function (h) { return String(h).trim(); });
  var iId = head.indexOf('order_id');
  var iTs = head.indexOf('timestamp');
  var iTable = head.indexOf('table_id');
  var iItems = head.indexOf('items_json');
  var iTotal = head.indexOf('total');
  var iStatus = head.indexOf('status');
  var iMethod = head.indexOf('payment_method');
  var iPayStatus = head.indexOf('payment_status');
  var iChannel = head.indexOf('channel');

  var missing = [];
  [['order_id', iId], ['timestamp', iTs], ['items_json', iItems], ['total', iTotal],
   ['status', iStatus], ['payment_status', iPayStatus]].forEach(function (pair) {
    if (pair[1] < 0) missing.push(pair[0]);
  });
  if (missing.length) {
    return { ok: false, error: 'ORDERS thiếu cột: ' + missing.join(', ') };
  }

  var from = (p && p.from) ? String(p.from) : '';
  var to = (p && p.to) ? String(p.to) : '';

  var rows = [];
  var months = {};      // 'MM/yyyy' -> {count, revenue, cash, other}
  var skipped = 0;

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row[iId]) continue;

    var total = Number(row[iTotal]) || 0;
    if (!_sbhIsRevenue(row[iStatus], row[iPayStatus], total)) { skipped++; continue; }

    var ts = row[iTs];
    if (from || to) {
      var iso = ts ? Utilities.formatDate(new Date(ts), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : '';
      if (from && iso < from) continue;
      if (to && iso > to) continue;
    }

    var method = iMethod >= 0 ? row[iMethod] : '';
    rows.push([
      _sbhFmtDate(ts),
      _sbhFmtTime(ts),
      String(row[iId]).replace(/^ORD-\d{8}-/, ''),   // phần đuôi cho gọn mắt
      iTable >= 0 ? String(row[iTable] || '').replace('TABLE_', '') : '',
      _sbhItemsText(row[iItems]),
      _sbhCupCount(row[iItems]),
      total,
      _sbhPayLabel(method),
      iChannel >= 0 ? String(row[iChannel] || '') : '',
      String(row[iId])
    ]);

    var mk = _sbhMonthKey(ts);
    if (mk) {
      if (!months[mk]) months[mk] = { count: 0, revenue: 0, cash: 0, other: 0 };
      months[mk].count += 1;
      months[mk].revenue += total;
      if (_sbhIsCash(method)) months[mk].cash += total;
      else months[mk].other += total;
    }
  }

  // ── Tab sổ chi tiết ──
  var sh = _sbhSheet(ss, 'SO_BAN_HANG', SO_BAN_HANG_HEADERS);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, SO_BAN_HANG_HEADERS.length).setValues(rows);
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('#,##0"đ"');
  }
  sh.setColumnWidth(5, 320);   // cột Nội dung cần rộng
  sh.setColumnWidth(10, 170);  // Mã hệ thống
  sh.hideColumns(10);          // giữ để đối chiếu, ẩn cho đỡ rối mắt

  // ── Tab tổng tháng ──
  var keys = Object.keys(months).sort(function (a, b) {
    // 'MM/yyyy' -> so theo yyyyMM
    return (a.slice(3) + a.slice(0, 2)) < (b.slice(3) + b.slice(0, 2)) ? 1 : -1;
  });
  var mrows = keys.map(function (k) {
    var m = months[k];
    return [k, m.count, m.revenue, m.cash, m.other,
            m.count ? Math.round(m.revenue / m.count) : 0];
  });
  var msh = _sbhSheet(ss, 'TONG_THANG', TONG_THANG_HEADERS);
  if (mrows.length) {
    msh.getRange(2, 1, mrows.length, TONG_THANG_HEADERS.length).setValues(mrows);
    msh.getRange(2, 3, mrows.length, 4).setNumberFormat('#,##0"đ"');
  }

  return {
    ok: true,
    rows: rows.length,
    months: mrows.length,
    skipped: skipped,
    note: 'Chỉ tính đơn DELIVERED + PAID. Bỏ qua ' + skipped + ' dòng (huỷ, chưa trả, rỗng).'
  };
}
