/**
 * Archive.gs
 * Chứa logic dọn dẹp (Archive) các đơn hàng cũ để giảm tải cho sheet Orders chính.
 */

/**
 * Hàm này sẽ được gọi bằng Time-driven trigger (vd: 2:00 AM mỗi ngày).
 * Quét các đơn DELIVERED hoặc CANCELLED cũ hơn 30 ngày.
 * Cắt các dòng đó khỏi sheet 'Orders' và dán sang sheet 'ORDERS_ARCHIVE'.
 */
function archiveOldOrders() {
  var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
  var archiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS_ARCHIVE');
  
  if (!mainSheet) {
    logError('archiveOldOrders', 'Main sheet "Orders" not found');
    return;
  }
  
  // Nếu sheet lưu trữ chưa có, tạo mới và copy header
  if (!archiveSheet) {
    archiveSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('ORDERS_ARCHIVE');
    var headerRange = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn());
    archiveSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).setValues(headerRange.getValues());
  }

  var data = mainSheet.getDataRange().getValues();
  if (data.length <= 1) return; // Chỉ có header hoặc trống

  var now = new Date();
  var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  var rowsToDelete = [];
  var rowsToArchive = [];

  // Quét từ dưới lên (để xoá dòng không bị lệch index)
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var status = row[12]; // M column: status
    var timestampStr = row[0]; // A column: timestamp (ISO string)
    
    if (status === 'DELIVERED' || status === 'CANCELLED') {
      if (timestampStr) {
        var orderDate = new Date(timestampStr);
        if (!isNaN(orderDate.getTime())) {
          if (now.getTime() - orderDate.getTime() > THIRTY_DAYS_MS) {
            rowsToArchive.push(row);
            rowsToDelete.push(i + 1); // 1-indexed for SpreadsheetApp
          }
        }
      }
    }
  }

  if (rowsToArchive.length > 0) {
    // Append vào archive
    var startRow = archiveSheet.getLastRow() + 1;
    archiveSheet.getRange(startRow, 1, rowsToArchive.length, rowsToArchive[0].length).setValues(rowsToArchive);
    
    // Xoá từ dưới lên
    for (var j = 0; j < rowsToDelete.length; j++) {
      mainSheet.deleteRow(rowsToDelete[j]);
    }
    
    Logger.log('Archived ' + rowsToArchive.length + ' old orders.');
  } else {
    Logger.log('No old orders to archive.');
  }
}
