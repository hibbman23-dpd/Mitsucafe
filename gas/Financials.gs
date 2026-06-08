/**
 * Financials.gs — Hệ thống Báo cáo Tài chính & Kế toán cho Lâm Hà Kissaten.
 * 
 * Các chức năng chính:
 *   1. Khởi tạo & Định dạng các sheet EXPENSES, DAILY_METRICS, BAO_CAO_TAI_CHINH.
 *   2. setupExpenseForm(): Tự động tạo Google Form nhập chi phí & thiết lập trigger liên kết.
 *   3. onExpenseFormSubmit(e): Trigger tự động chuẩn hóa dữ liệu từ Form gửi về bảng EXPENSES.
 *   4. computeDailyMetrics(dateStr): Tính Doanh thu & Giá vốn (COGS) thực tế từ ORDERS & MENU.
 *   5. cronDailyFinancials(): Trigger chạy hằng đêm tổng hợp số liệu hôm nay & hôm qua, tự động gửi Email.
 *   6. sendDailyEmailReport(), sendMonthlyEmailReport(): Gửi báo cáo tài chính hằng ngày và hằng tháng qua Gmail.
 *   7. createFinancialDashboard(): Khởi tạo giao diện Dashboard đẹp mắt trực tiếp trên Sheets.
 */

/**
 * 1. KHỞI TẠO BẢNG DỮ LIỆU TÀI CHÍNH
 */
function initFinancialSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Khởi tạo sheet EXPENSES nếu chưa có
  var expensesSheet = ss.getSheetByName('EXPENSES');
  if (!expensesSheet) {
    expensesSheet = ss.insertSheet('EXPENSES');
    var headers = ['expense_id', 'date', 'category', 'amount', 'description', 'payment_method', 'staff_id', 'receipt_url', 'created_at'];
    expensesSheet.appendRow(headers);
    expensesSheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    expensesSheet.setFrozenRows(1);
  }
  
  // 2. Khởi tạo sheet DAILY_METRICS nếu chưa có
  var metricsSheet = ss.getSheetByName('DAILY_METRICS');
  if (!metricsSheet) {
    metricsSheet = ss.insertSheet('DAILY_METRICS');
    var headers = ['date', 'revenue', 'cogs', 'orders_count', 'average_order_value', 'updated_at'];
    metricsSheet.appendRow(headers);
    metricsSheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    metricsSheet.setFrozenRows(1);
  }
  
  Logger.log('Financial sheets initialized successfully.');
}

/**
 * 2. TẠO GOOGLE FORM NHẬP CHI PHÍ & TỰ ĐỘNG LIÊN KẾT
 */
function setupExpenseForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initFinancialSheets();
  
  // 1. Tạo Google Form mới
  var formName = 'Lâm Hà Kissaten - Nhập Chi Phí Vận Hành';
  var form = FormApp.create(formName);
  
  form.setDescription('Biểu mẫu ghi nhận các khoản chi tiêu hằng ngày cho quán Lâm Hà Kissaten.\n' +
                      'Lưu ý: Lưu link biểu mẫu này ra màn hình chính điện thoại để tiện nhập liệu nhanh.');
  
  // Câu hỏi 1: Ngày chi
  var dateItem = form.addDateItem();
  dateItem.setTitle('Ngày chi')
          .setHelpText('Chọn ngày thực hiện khoản chi này (mặc định là hôm nay).')
          .setRequired(true);
          
  // Câu hỏi 2: Danh mục chi
  var categoryItem = form.addListItem();
  categoryItem.setTitle('Danh mục chi')
              .setHelpText('Chọn nhóm chi phí phù hợp.')
              .setChoices([
                categoryItem.createChoice('Nguyên vật liệu (Cafe, sữa, trái cây, đá...)'),
                categoryItem.createChoice('Mặt bằng (Tiền thuê nhà)'),
                categoryItem.createChoice('Điện nước & Internet'),
                categoryItem.createChoice('Nhân sự (Lương nhân viên)'),
                categoryItem.createChoice('Marketing & Quảng cáo'),
                categoryItem.createChoice('Khác (Sửa chữa, dụng cụ hỏng...)')
              ])
              .setRequired(true);
              
  // Câu hỏi 3: Số tiền
  var amountItem = form.addTextItem();
  amountItem.setTitle('Số tiền (VND)')
            .setHelpText('Nhập số tiền thực chi (ví dụ: 120000, không cần dấu chấm).')
            .setRequired(true);
  
  // Ràng buộc số tiền phải là số dương
  var validation = FormApp.createTextValidation()
                          .requireNumberGreaterThan(0)
                          .setHelpText('Vui lòng chỉ nhập số nguyên dương lớn hơn 0.')
                          .build();
  amountItem.setValidation(validation);
  
  // Câu hỏi 4: Nội dung chi
  var descItem = form.addParagraphTextItem();
  descItem.setTitle('Ghi chú nội dung chi')
          .setHelpText('Ghi chi tiết lý do chi (ví dụ: Mua 10 hộp sữa đặc Ngôi Sao Phương Nam).')
          .setRequired(true);
          
  // Câu hỏi 5: Hình thức thanh toán
  var paymentItem = form.addListItem();
  paymentItem.setTitle('Hình thức thanh toán')
             .setChoices([
               paymentItem.createChoice('Tiền mặt'),
               paymentItem.createChoice('Chuyển khoản / VietQR')
             ])
             .setRequired(true);
             
  // Câu hỏi 6: Mã nhân viên chi
  var staffItem = form.addTextItem();
  staffItem.setTitle('Mã nhân viên (nếu có)')
           .setRequired(false);
           
  // Câu hỏi 7: Link ảnh hóa đơn
  var receiptItem = form.addTextItem();
  receiptItem.setTitle('Link ảnh hóa đơn / Ghi chú thêm')
             .setHelpText('Dán link ảnh chụp hóa đơn nếu có.')
             .setRequired(false);
             
  // 2. Liên kết Form với Spreadsheet
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  
  var formUrl = form.getPublishedUrl();
  var editUrl = form.getEditUrl();
  
  // 3. Lưu vào CONFIG
  setConfig('EXPENSE_FORM_URL', formUrl);
  setConfig('EXPENSE_FORM_EDIT_URL', editUrl);
  
  // 4. Tạo các Trigger tự động xử lý (Form Submit & Cron Hằng Đêm)
  setupFinancialTriggers();
  
  Logger.log('Google Form created successfully.');
  Logger.log('Form URL (đưa cho chủ quán): ' + formUrl);
  
  // Gửi thông báo Telegram cho chủ quán kèm link
  sendTelegramAlert('📋 <b>HỆ THỐNG PHÂN TÍCH TÀI CHÍNH ĐÃ KHỞI TẠO</b>\n' +
                    'Đã tạo thành công Google Form nhập chi phí.\n' +
                    '👉 <b>Link nhập chi phí (Lưu điện thoại):</b> ' + formUrl + '\n' +
                    '👉 <b>Link chỉnh sửa Form:</b> ' + editUrl);
                    
  return { formUrl: formUrl, editUrl: editUrl };
}

/**
 * 2.1. CÀI ĐẶT CÁC TRIGGER (FORM SUBMIT & CRON HẰNG ĐÊM)
 */
function setupFinancialTriggers() {
  setupFormSubmitTrigger();
  
  // Thiết lập Time-driven Trigger chạy hàng ngày lúc 23:00 - 00:00
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cronDailyFinancials') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  ScriptApp.newTrigger('cronDailyFinancials')
           .timeBased()
           .everyDays(1)
           .atHour(23)
           .create();
           
  Logger.log('Financial triggers and daily cron configured.');
}

function setupFormSubmitTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  
  // Xóa các trigger onFormSubmit cũ để tránh trùng lặp
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onExpenseFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Tạo trigger mới
  ScriptApp.newTrigger('onExpenseFormSubmit')
           .forSpreadsheet(ss)
           .onFormSubmit()
           .create();
  Logger.log('Form submit trigger registered.');
}

/**
 * 3. HÀM XỬ LÝ KHI CÓ PHẢN HỒI GỬI VỀ TỪ GOOGLE FORM
 */
function onExpenseFormSubmit(e) {
  try {
    if (!e || !e.namedValues) return;
    
    // Kiểm tra xem có đúng là Form Nhập Chi Phí dựa trên tiêu đề cột đặc trưng
    if (!e.namedValues['Số tiền (VND)']) {
      Logger.log('Form submitted but does not contain financial data.');
      return;
    }
    
    var rawDate = e.namedValues['Ngày chi'] ? e.namedValues['Ngày chi'][0] : '';
    var rawCategory = e.namedValues['Danh mục chi'] ? e.namedValues['Danh mục chi'][0] : '';
    var rawAmount = e.namedValues['Số tiền (VND)'] ? e.namedValues['Số tiền (VND)'][0] : '0';
    var rawDesc = e.namedValues['Ghi chú nội dung chi'] ? e.namedValues['Ghi chú nội dung chi'][0] : '';
    var rawPayment = e.namedValues['Hình thức thanh toán'] ? e.namedValues['Hình thức thanh toán'][0] : 'Tiền mặt';
    var rawStaff = e.namedValues['Mã nhân viên (nếu có)'] ? e.namedValues['Mã nhân viên (nếu có)'][0] : '';
    var rawReceipt = e.namedValues['Link ảnh hóa đơn / Ghi chú thêm'] ? e.namedValues['Link ảnh hóa đơn / Ghi chú thêm'][0] : '';
    
    // Chuẩn hóa dữ liệu
    var amount = parseInt(rawAmount.replace(/\D/g, '')) || 0;
    
    var dateObj = new Date(rawDate);
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    var dateStr = Utilities.formatDate(dateObj, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    
    // Tạo ID chi phí: EXP-YYYYMMDD-XXXX
    var dateCompact = dateStr.replace(/-/g, '');
    var rand = Math.floor(1000 + Math.random() * 9000);
    var expenseId = 'EXP-' + dateCompact + '-' + rand;
    
    var createdTime = new Date().toISOString();
    
    // Ghi vào bảng EXPENSES
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expSheet = ss.getSheetByName('EXPENSES');
    if (!expSheet) {
      initFinancialSheets();
      expSheet = ss.getSheetByName('EXPENSES');
    }
    
    expSheet.appendRow([
      expenseId,
      dateStr,
      rawCategory,
      amount,
      rawDesc,
      rawPayment,
      rawStaff,
      rawReceipt,
      createdTime
    ]);
    
    Logger.log('Expense saved: ' + expenseId + ' | Amount: ' + amount);
    
    // Tự động tính toán lại chỉ số ngày hôm đó
    computeDailyMetrics(dateStr);
    
    // Gửi Telegram thông báo nhanh khoản chi mới
    var tgMsg = '💸 <b>KHOẢN CHI MỚI ĐÃ GHI NHẬN</b>\n' +
                '🆔 Mã: <code>' + expenseId + '</code>\n' +
                '📅 Ngày chi: ' + dateStr + '\n' +
                '🏷️ Danh mục: ' + rawCategory + '\n' +
                '💰 Số tiền: <b>' + formatCurrency(amount) + '</b>\n' +
                '📝 Nội dung: ' + rawDesc + '\n' +
                '💳 Hình thức: ' + rawPayment + (rawStaff ? ' · Người chi: ' + rawStaff : '');
    sendTelegramAlert(tgMsg);
    
  } catch (err) {
    logError('onExpenseFormSubmit', err);
  }
}

/**
 * 4. TÍNH TOÁN DOANH THU & GIÁ VỐN (COGS) CHO MỘT NGÀY CỤ THỂ
 * @param {string} dateStr - Định dạng YYYY-MM-DD
 */
function computeDailyMetrics(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ordersSheet = ss.getSheetByName('ORDERS');
  if (!ordersSheet) return;
  
  var dateCompact = dateStr.replace(/-/g, '');
  var ordersData = ordersSheet.getDataRange().getValues();
  
  // 1. Tải bảng MENU để cache giá vốn của từng món (NL + Packaging)
  var menuSheet = ss.getSheetByName('MENU');
  var menuData = menuSheet ? menuSheet.getDataRange().getValues() : [];
  var menuCosts = {};
  
  // Index tương ứng với MENU: sku (0), cost_nl (8), cost_packaging (9)
  for (var m = 1; m < menuData.length; m++) {
    var sku = String(menuData[m][0]).toUpperCase();
    var costNl = parseFloat(menuData[m][8]) || 0;
    var costPkg = parseFloat(menuData[m][9]) || 0;
    menuCosts[sku] = costNl + costPkg;
  }
  
  var dailyRevenue = 0;
  var dailyCogs = 0;
  var dailyOrdersCount = 0;
  
  // 2. Lọc đơn hàng hợp lệ trong ngày (status === DELIVERED và order_id khớp ngày)
  for (var i = 1; i < ordersData.length; i++) {
    var row = ordersData[i];
    var orderId = String(row[0]);
    var status = row[12];
    var paymentStatus = row[19];
    
    // Kiểm tra xem đơn hàng có thuộc ngày dateStr (thông qua mã đơn hàng ORD-YYYYMMDD-XXXX)
    if (orderId.indexOf('ORD-' + dateCompact) === 0) {
      // Chỉ tính các đơn đã hoàn thành/giao thành công
      if (status === 'DELIVERED') {
        dailyOrdersCount++;
        dailyRevenue += parseFloat(row[11]) || 0; // cột total
        
        // Tính COGS bằng cách bóc tách items_json
        var itemsJson = row[9];
        if (itemsJson) {
          try {
            var items = JSON.parse(itemsJson);
            items.forEach(function (item) {
              var sku = String(item.sku).toUpperCase();
              var qty = parseInt(item.qty) || 0;
              var unitCost = menuCosts[sku] || 0;
              
              // Nếu không cấu hình vốn cụ thể cho SKU, tính ước lượng 40% giá bán
              if (unitCost === 0) {
                var price = parseFloat(item.price) || 0;
                unitCost = price * 0.4;
              }
              
              dailyCogs += unitCost * qty;
            });
          } catch (e) {
            Logger.log('Error parsing items_json for order ' + orderId + ': ' + e);
          }
        }
      }
    }
  }
  
  var aov = dailyOrdersCount > 0 ? Math.round(dailyRevenue / dailyOrdersCount) : 0;
  var now = new Date().toISOString();
  
  // 3. Ghi vào bảng DAILY_METRICS
  var metricsSheet = ss.getSheetByName('DAILY_METRICS');
  if (!metricsSheet) {
    initFinancialSheets();
    metricsSheet = ss.getSheetByName('DAILY_METRICS');
  }
  
  var metricsData = metricsSheet.getDataRange().getValues();
  var foundRowIdx = -1;
  
  for (var r = 1; r < metricsData.length; r++) {
    if (_dateMatches(metricsData[r][0], dateStr)) {
      foundRowIdx = r + 1; // 1-based index
      break;
    }
  }
  
  var rowData = [
    dateStr,
    Math.round(dailyRevenue),
    Math.round(dailyCogs),
    dailyOrdersCount,
    aov,
    now
  ];
  
  if (foundRowIdx !== -1) {
    metricsSheet.getRange(foundRowIdx, 1, 1, rowData.length).setValues([rowData]);
  } else {
    metricsSheet.appendRow(rowData);
  }
  
  Logger.log('Daily metrics computed for ' + dateStr + ': Rev: ' + dailyRevenue + ' | COGS: ' + dailyCogs);
  return { date: dateStr, revenue: dailyRevenue, cogs: dailyCogs, orders: dailyOrdersCount, aov: aov };
}

/**
 * 4.1. CRON JOB CHẠY HẰNG ĐÊM ĐỂ ĐỒNG BỘ DOANH THU & COGS
 * Đề xuất lập lịch chạy tự động từ 23:50 - 23:59 mỗi ngày.
 */
function cronDailyFinancials() {
  try {
    var now = new Date();
    var todayStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    
    // Tính hôm nay
    computeDailyMetrics(todayStr);
    
    // Tính thêm hôm qua để cập nhật bù các đơn giao trễ/hoàn thành muộn
    var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var yesterdayStr = Utilities.formatDate(yesterday, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    computeDailyMetrics(yesterdayStr);
    
    // Tự động gửi báo cáo Email lúc cuối ngày
    sendDailyEmailReport(todayStr);
  } catch (err) {
    logError('cronDailyFinancials', err);
  }
}

/**
 * 5. GỬI BÁO CÁO TÀI CHÍNH NGÀY QUA EMAIL (GMAIL)
 */
function sendDailyEmailReport(dateStr) {
  try {
    if (!dateStr) {
      dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var metricsSheet = ss.getSheetByName('DAILY_METRICS');
    var expensesSheet = ss.getSheetByName('EXPENSES');
    
    var revenue = 0;
    var cogs = 0;
    var orders = 0;
    var aov = 0;
    
    // 1. Lấy dữ liệu Daily Metrics của ngày báo cáo
    if (metricsSheet) {
      var metrics = metricsSheet.getDataRange().getValues();
      for (var i = 1; i < metrics.length; i++) {
        if (_dateMatches(metrics[i][0], dateStr)) {
          revenue = parseFloat(metrics[i][1]) || 0;
          cogs = parseFloat(metrics[i][2]) || 0;
          orders = parseInt(metrics[i][3]) || 0;
          aov = parseFloat(metrics[i][4]) || 0;
          break;
        }
      }
    }

    // 2. Lấy dữ liệu chi phí trong ngày
    var dailyOPEX = 0;
    var expenseDetails = [];
    if (expensesSheet) {
      var expData = expensesSheet.getDataRange().getValues();
      for (var j = 1; j < expData.length; j++) {
        if (_dateMatches(expData[j][1], dateStr)) {
          var amt = parseFloat(expData[j][3]) || 0;
          dailyOPEX += amt;
          expenseDetails.push({
            category: expData[j][2],
            amount: amt,
            description: expData[j][4] || ''
          });
        }
      }
    }
    
    var grossProfit = revenue - cogs;
    var netProfit = grossProfit - dailyOPEX;
    var margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
    
    // Định dạng ngày hiển thị VN
    var parts = dateStr.split('-');
    var dateFormatted = parts[2] + '/' + parts[1] + '/' + parts[0];
    
    var subject = '📊 [Lâm Hà Kissaten] Báo cáo tài chính ngày ' + dateFormatted;
    var htmlBody = _buildDailyHtmlReport(dateFormatted, revenue, cogs, grossProfit, dailyOPEX, netProfit, margin, orders, aov, expenseDetails);
    
    sendEmailAlert(subject, htmlBody);
  } catch (err) {
    logError('sendDailyEmailReport', err);
  }
}

/**
 * 6. GỬI BÁO CÁO TÀI CHÍNH THÁNG QUA EMAIL (GMAIL)
 */
function sendMonthlyEmailReport(month, year) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var now = new Date();
    if (month === undefined || year === undefined) {
      var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      month = lastMonth.getMonth() + 1; // 1-indexed
      year = lastMonth.getFullYear();
    }
    
    var metricsSheet = ss.getSheetByName('DAILY_METRICS');
    var expensesSheet = ss.getSheetByName('EXPENSES');
    
    var totalRevenue = 0;
    var totalCogs = 0;
    var totalOrders = 0;
    
    // 1. Quét DAILY_METRICS để tổng hợp Doanh thu & COGS tháng
    if (metricsSheet) {
      var metrics = metricsSheet.getDataRange().getValues();
      for (var i = 1; i < metrics.length; i++) {
        var ym = _parseYearMonth(metrics[i][0]);
        if (ym && ym.year === year && ym.month === month) {
          totalRevenue += parseFloat(metrics[i][1]) || 0;
          totalCogs += parseFloat(metrics[i][2]) || 0;
          totalOrders += parseInt(metrics[i][3]) || 0;
        }
      }
    }

    // 2. Quét EXPENSES để tổng hợp Chi phí vận hành
    var totalOPEX = 0;
    var categoryBreakdown = {};
    if (expensesSheet) {
      var expData = expensesSheet.getDataRange().getValues();
      for (var j = 1; j < expData.length; j++) {
        var ym2 = _parseYearMonth(expData[j][1]);
        if (ym2 && ym2.year === year && ym2.month === month) {
          var amt = parseFloat(expData[j][3]) || 0;
          var cat = expData[j][2] || 'Khác';
          totalOPEX += amt;
          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;
        }
      }
    }
    
    var grossProfit = totalRevenue - totalCogs;
    var netProfit = grossProfit - totalOPEX;
    var margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
    
    var monthStr = (month < 10 ? '0' + month : month) + '/' + year;
    
    var subject = '📊 [Lâm Hà Kissaten] Báo cáo tài chính tháng ' + monthStr;
    var htmlBody = _buildMonthlyHtmlReport(monthStr, totalRevenue, totalCogs, grossProfit, totalOPEX, netProfit, margin, totalOrders, totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, categoryBreakdown);
    
    sendEmailAlert(subject, htmlBody);
  } catch (err) {
    logError('sendMonthlyEmailReport', err);
  }
}

/**
 * HÀM PHỤ TRỢ: GỬI ALERT EMAIL QUA GMAIL
 *
 * Lưu ý: scope `script.send_mail` phải được authorize trước. Nếu thiếu, gọi
 * `verifyFinancialsHealth()` thủ công 1 lần trong GAS editor để trigger consent
 * dialog. Mọi permission error đều set flag NEEDS_REAUTH trong Script Properties
 * thay vì spam Telegram mỗi đêm.
 */
function sendEmailAlert(subject, htmlBody) {
  var email = _resolveReportEmail();
  if (!email) {
    Logger.log('No recipient email found for reports.');
    return;
  }
  try {
    MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
    Logger.log('Email report sent to: ' + email);
    // Email gửi được tức là scope đã OK — clear flag nếu có
    try { PropertiesService.getScriptProperties().deleteProperty('NEEDS_REAUTH'); } catch (_) {}
  } catch (e) {
    var emsg = String((e && e.message) || e);
    if (emsg.indexOf('permission') !== -1 || emsg.indexOf('script.send_mail') !== -1) {
      // Đây là lỗi auth — không spam, chỉ set flag và log 1 lần / throttle window
      try {
        PropertiesService.getScriptProperties().setProperty('NEEDS_REAUTH', new Date().toISOString());
      } catch (_) {}
      logError('sendEmailAlert.NEEDS_REAUTH', new Error(
        'MailApp scope chưa được authorize. Mở GAS editor → chạy verifyFinancialsHealth() thủ công và bấm "Allow" trong popup. ' +
        'Chi tiết: ' + emsg
      ));
    } else {
      logError('sendEmailAlert', e);
    }
  }
}

/**
 * Xác định email nhận báo cáo. Thứ tự ưu tiên:
 *   1. CONFIG.REPORT_EMAIL (rõ ràng nhất)
 *   2. Owner email (chỉ work nếu file thuộc sở hữu user, không phải shared org file)
 *   3. Active user email (trong time-trigger context = "")
 * Trả về null nếu không có giá trị hợp lệ.
 */
function _resolveReportEmail() {
  var email = getConfig('REPORT_EMAIL');
  if (email && String(email).indexOf('@') !== -1) return String(email).trim();

  try {
    var owner = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    if (owner) {
      var oe = owner.getEmail();
      if (oe && oe.indexOf('@') !== -1) return oe;
    }
  } catch (_) { /* shared org file → null */ }

  try {
    var au = Session.getActiveUser().getEmail();
    // Trong time-trigger với consumer account: au === "" → coi như không có
    if (au && au.indexOf('@') !== -1) return au;
  } catch (_) {}

  return null;
}

/**
 * Helper: so sánh giá trị ngày từ Sheets (có thể là Date object HOẶC string)
 * với chuỗi 'YYYY-MM-DD'. Chuẩn hoá Date object về string VN trước khi compare.
 * Bug ẩn trước đây: nếu cột date trong DAILY_METRICS/EXPENSES auto-format thành Date,
 * `cellVal === dateStr` luôn false → revenue/expense bị tính = 0.
 */
function _dateMatches(cellVal, dateStr) {
  if (!cellVal) return false;
  if (cellVal instanceof Date) {
    return Utilities.formatDate(cellVal, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') === dateStr;
  }
  return String(cellVal).trim() === dateStr;
}

/**
 * Helper: parse YYYY-MM-DD từ Sheets cell (Date object hoặc string).
 * Trả về {year, month} (month 1-indexed) hoặc null nếu không parse được.
 */
function _parseYearMonth(cellVal) {
  if (!cellVal) return null;
  if (cellVal instanceof Date) {
    return { year: cellVal.getFullYear(), month: cellVal.getMonth() + 1 };
  }
  var parts = String(cellVal).trim().split('-');
  if (parts.length < 2) return null;
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return null;
  return { year: y, month: m };
}

/**
 * DIAGNOSTIC — Chạy thủ công qua GAS editor để:
 *   1. Trigger consent dialog cho mọi scope đã khai báo (đặc biệt script.send_mail)
 *   2. Kiểm tra sheets, triggers, email recipient
 *   3. Gửi 1 email + 1 Telegram xác nhận hệ thống OK
 *
 * Sau khi commit code này, chạy hàm này 1 lần và bấm "Allow" trong popup.
 */
function verifyFinancialsHealth() {
  var report = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Kiểm tra sheets bắt buộc
  ['EXPENSES', 'DAILY_METRICS', 'ORDERS', 'MENU', 'CONFIG', 'ERROR_LOG'].forEach(function (name) {
    report.push((ss.getSheetByName(name) ? '✅' : '❌') + ' Sheet ' + name);
  });

  // 2. Kiểm tra email recipient
  var email = _resolveReportEmail();
  report.push((email ? '✅' : '❌') + ' Email nhận báo cáo: ' + (email || 'CHƯA CẤU HÌNH'));

  // 3. Kiểm tra triggers
  var triggers = ScriptApp.getProjectTriggers();
  var hasCron = triggers.some(function (t) { return t.getHandlerFunction() === 'cronDailyFinancials'; });
  var hasForm = triggers.some(function (t) { return t.getHandlerFunction() === 'onExpenseFormSubmit'; });
  report.push((hasCron ? '✅' : '❌') + ' Cron 23:00 (cronDailyFinancials)');
  report.push((hasForm ? '✅' : '❌') + ' Form trigger (onExpenseFormSubmit)');

  // 4. Test MailApp scope — đây là lý do chính phải chạy hàm này thủ công
  var mailOk = false;
  var mailErr = '';
  try {
    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: '✅ [Lâm Hà Kissaten] Kiểm tra hệ thống báo cáo',
        htmlBody: '<p>Email này xác nhận MailApp đã được authorize đầy đủ.</p>' +
                  '<pre style="font-family:monospace;background:#f3f4f6;padding:12px;border-radius:6px;">' +
                  report.join('\n') + '</pre>'
      });
      mailOk = true;
      try { PropertiesService.getScriptProperties().deleteProperty('NEEDS_REAUTH'); } catch (_) {}
    } else {
      mailErr = 'Không có email để test';
    }
  } catch (e) {
    mailErr = String((e && e.message) || e);
  }
  report.push((mailOk ? '✅' : '❌') + ' MailApp.sendEmail' + (mailErr ? ' — ' + mailErr : ''));

  // 5. Reset throttle để các lỗi mới (nếu có) sẽ alert lại
  try { resetErrorThrottle(); } catch (_) {}

  var summary = '🏥 <b>KIỂM TRA HỆ THỐNG BÁO CÁO TÀI CHÍNH</b>\n' + report.join('\n');
  Logger.log(summary);
  try { sendTelegramAlert(summary); } catch (_) {}
  return report;
}

/**
 * HÀM DỰNG HTML BÁO CÁO NGÀY
 */
function _buildDailyHtmlReport(dateFormatted, revenue, cogs, grossProfit, dailyOPEX, netProfit, margin, orders, aov, expenseDetails) {
  var expensesHtml = '';
  if (expenseDetails.length > 0) {
    expensesHtml = '<h3 style="color:#1f2937; margin-top:20px;">Chi tiết chi phí phát sinh</h3>' +
                   '<table style="width:100%; border-collapse:collapse; margin-top:10px; font-family:sans-serif; font-size:14px;">' +
                   '<thead><tr style="background-color:#f3f4f6; text-align:left; border-bottom:2px solid #e5e7eb;">' +
                   '<th style="padding:10px;">Danh mục</th>' +
                   '<th style="padding:10px; text-align:right;">Số tiền</th>' +
                   '<th style="padding:10px;">Ghi chú</th>' +
                   '</tr></thead><tbody>';
    expenseDetails.forEach(function(exp) {
      expensesHtml += '<tr style="border-bottom:1px solid #e5e7eb;">' +
                      '<td style="padding:10px; font-weight:bold;">' + exp.category + '</td>' +
                      '<td style="padding:10px; text-align:right; color:#b91c1c; font-weight:bold;">' + formatCurrency(exp.amount) + '</td>' +
                      '<td style="padding:10px; color:#4b5563;">' + exp.description + '</td>' +
                      '</tr>';
    });
    expensesHtml += '</tbody></table>';
  } else {
    expensesHtml = '<p style="color:#6b7280; font-style:italic; margin-top:20px;">Không phát sinh chi phí vận hành nào trong ngày.</p>';
  }

  var html = 
    '<div style="max-width:600px; margin:0 auto; font-family:sans-serif; color:#374151; line-height:1.6; background-color:#f3f4f6; padding:20px;">' +
      '<div style="background-color:#1f2937; padding:20px; text-align:center; border-radius:8px 8px 0 0;">' +
        '<h2 style="color:#ffffff; margin:0; font-size:20px; font-weight:bold; letter-spacing:1px;">LÂM HÀ KISSATEN</h2>' +
        '<p style="color:#9ca3af; margin:5px 0 0 0; font-size:14px;">Báo cáo tài chính ngày ' + dateFormatted + '</p>' +
      '</div>' +
      '<div style="padding:20px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; background-color:#ffffff;">' +
        
        // KPI Grid
        '<div style="margin-bottom:20px; text-align:center;">' +
          '<div style="display:inline-block; width:45%; background-color:#eff6ff; padding:15px; margin:5px; border-radius:6px; border:1px solid #bfdbfe; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#1e40af; margin-bottom:5px;">DOANH THU</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#1d4ed8;">' + formatCurrency(revenue) + '</div>' +
            '<div style="font-size:11px; color:#60a5fa; margin-top:3px;">' + orders + ' đơn</div>' +
          '</div>' +
          '<div style="display:inline-block; width:45%; background-color:#fef3c7; padding:15px; margin:5px; border-radius:6px; border:1px solid #fde68a; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#854d0e; margin-bottom:5px;">GIÁ VỐN (COGS)</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#b45309;">' + formatCurrency(cogs) + '</div>' +
            '<div style="font-size:11px; color:#d97706; margin-top:3px;">Tỷ lệ: ' + (revenue > 0 ? Math.round((cogs/revenue)*100) : 0) + '%</div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:20px; text-align:center;">' +
          '<div style="display:inline-block; width:45%; background-color:#fef2f2; padding:15px; margin:5px; border-radius:6px; border:1px solid #fca5a5; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#991b1b; margin-bottom:5px;">CHI PHÍ (OPEX)</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#b91c1c;">' + formatCurrency(dailyOPEX) + '</div>' +
          '</div>' +
          '<div style="display:inline-block; width:45%; background-color:#ecfdf5; padding:15px; margin:5px; border-radius:6px; border:1px solid #a7f3d0; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#065f46; margin-bottom:5px;">LỢI NHUẬN RÒNG</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#047857;">' + formatCurrency(netProfit) + '</div>' +
            '<div style="font-size:11px; color:#059669; margin-top:3px;">Tỷ suất: ' + margin + '%</div>' +
          '</div>' +
        '</div>' +

        // Summary details
        '<div style="background-color:#f9fafb; padding:15px; border-radius:6px; border:1px solid #f3f4f6; margin-top:20px;">' +
          '<table style="width:100%; font-family:sans-serif; font-size:14px; border-collapse:collapse;">' +
            '<tr><td style="padding:5px 0; color:#6b7280;">Doanh số thực tế:</td><td style="text-align:right; font-weight:bold;">' + formatCurrency(revenue) + '</td></tr>' +
            '<tr><td style="padding:5px 0; color:#6b7280;">Lợi nhuận gộp:</td><td style="text-align:right; font-weight:bold;">' + formatCurrency(grossProfit) + '</td></tr>' +
            '<tr><td style="padding:5px 0; color:#6b7280;">Giá trị đơn trung bình (AOV):</td><td style="text-align:right; font-weight:bold;">' + formatCurrency(aov) + '</td></tr>' +
          '</table>' +
        '</div>' +

        expensesHtml +

        // Actions
        '<div style="text-align:center; margin-top:30px; border-top:1px solid #f3f4f6; padding-top:20px;">' +
          '<a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '" style="background-color:#1f2937; color:#ffffff; padding:10px 20px; text-decoration:none; font-weight:bold; border-radius:5px; font-size:14px; display:inline-block;">Mở Báo Cáo Trên Google Sheet</a>' +
          '<p style="font-size:12px; color:#9ca3af; margin-top:15px;">Email này được gửi tự động từ hệ thống Lâm Hà Kissaten.</p>' +
        '</div>' +

      '</div>' +
    '</div>';
  return html;
}

/**
 * HÀM DỰNG HTML BÁO CÁO THÁNG
 */
function _buildMonthlyHtmlReport(monthStr, totalRevenue, totalCogs, grossProfit, totalOPEX, netProfit, margin, totalOrders, aov, categoryBreakdown) {
  var breakdownHtml = '<h3 style="color:#1f2937; margin-top:20px;">Phân bổ chi phí vận hành (OPEX)</h3>' +
                      '<table style="width:100%; border-collapse:collapse; margin-top:10px; font-family:sans-serif; font-size:14px;">' +
                      '<thead><tr style="background-color:#f3f4f6; text-align:left; border-bottom:2px solid #e5e7eb;">' +
                      '<th style="padding:10px;">Danh mục chi phí</th>' +
                      '<th style="padding:10px; text-align:right;">Số tiền</th>' +
                      '<th style="padding:10px; text-align:right;">Tỷ trọng</th>' +
                      '</tr></thead><tbody>';
  
  Object.keys(categoryBreakdown).forEach(function(cat) {
    var amt = categoryBreakdown[cat];
    var pct = totalOPEX > 0 ? Math.round((amt / totalOPEX) * 100) : 0;
    breakdownHtml += '<tr style="border-bottom:1px solid #e5e7eb;">' +
                     '<td style="padding:10px; font-weight:bold;">' + cat + '</td>' +
                     '<td style="padding:10px; text-align:right; color:#b91c1c; font-weight:bold;">' + formatCurrency(amt) + '</td>' +
                     '<td style="padding:10px; text-align:right; color:#4b5563;">' + pct + '%</td>' +
                     '</tr>';
  });
  
  breakdownHtml += '</tbody></table>';

  var html = 
    '<div style="max-width:600px; margin:0 auto; font-family:sans-serif; color:#374151; line-height:1.6; background-color:#f3f4f6; padding:20px;">' +
      '<div style="background-color:#1f2937; padding:25px; text-align:center; border-radius:8px 8px 0 0;">' +
        '<h2 style="color:#ffffff; margin:0; font-size:22px; font-weight:bold; letter-spacing:1px;">LÂM HÀ KISSATEN</h2>' +
        '<p style="color:#9ca3af; margin:5px 0 0 0; font-size:15px;">Báo cáo tài chính tổng quan tháng ' + monthStr + '</p>' +
      '</div>' +
      '<div style="padding:20px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; background-color:#ffffff;">' +
        
        // KPI Grid
        '<div style="margin-bottom:20px; text-align:center;">' +
          '<div style="display:inline-block; width:45%; background-color:#eff6ff; padding:15px; margin:5px; border-radius:6px; border:1px solid #bfdbfe; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#1e40af; margin-bottom:5px;">TỔNG DOANH THU</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#1d4ed8;">' + formatCurrency(totalRevenue) + '</div>' +
            '<div style="font-size:11px; color:#60a5fa; margin-top:3px;">' + totalOrders + ' đơn hàng</div>' +
          '</div>' +
          '<div style="display:inline-block; width:45%; background-color:#fef3c7; padding:15px; margin:5px; border-radius:6px; border:1px solid #fde68a; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#854d0e; margin-bottom:5px;">TỔNG GIÁ VỐN (COGS)</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#b45309;">' + formatCurrency(totalCogs) + '</div>' +
            '<div style="font-size:11px; color:#d97706; margin-top:3px;">Tỷ lệ: ' + (totalRevenue > 0 ? Math.round((totalCogs/totalRevenue)*100) : 0) + '%</div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:20px; text-align:center;">' +
          '<div style="display:inline-block; width:45%; background-color:#fef2f2; padding:15px; margin:5px; border-radius:6px; border:1px solid #fca5a5; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#991b1b; margin-bottom:5px;">TỔNG OPEX</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#b91c1c;">' + formatCurrency(totalOPEX) + '</div>' +
          '</div>' +
          '<div style="display:inline-block; width:45%; background-color:#ecfdf5; padding:15px; margin:5px; border-radius:6px; border:1px solid #a7f3d0; text-align:center; box-sizing:border-box; vertical-align:top;">' +
            '<div style="font-size:11px; font-weight:bold; color:#065f46; margin-bottom:5px;">LỢI NHUẬN RÒNG</div>' +
            '<div style="font-size:18px; font-weight:bold; color:#047857;">' + formatCurrency(netProfit) + '</div>' +
            '<div style="font-size:11px; color:#059669; margin-top:3px;">Tỷ suất ròng: ' + margin + '%</div>' +
          '</div>' +
        '</div>' +

        // Summary details
        '<div style="background-color:#f9fafb; padding:15px; border-radius:6px; border:1px solid #f3f4f6; margin-top:20px;">' +
          '<table style="width:100%; font-family:sans-serif; font-size:14px; border-collapse:collapse;">' +
            '<tr><td style="padding:5px 0; color:#6b7280;">Lợi nhuận gộp:</td><td style="text-align:right; font-weight:bold;">' + formatCurrency(grossProfit) + '</td></tr>' +
            '<tr><td style="padding:5px 0; color:#6b7280;">Đơn trung bình (AOV):</td><td style="text-align:right; font-weight:bold;">' + formatCurrency(aov) + '</td></tr>' +
          '</table>' +
        '</div>' +

        breakdownHtml +

        // Actions
        '<div style="text-align:center; margin-top:30px; border-top:1px solid #f3f4f6; padding-top:20px;">' +
          '<a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '" style="background-color:#1f2937; color:#ffffff; padding:10px 20px; text-decoration:none; font-weight:bold; border-radius:5px; font-size:14px; display:inline-block;">Mở Báo Cáo Trên Google Sheet</a>' +
          '<p style="font-size:12px; color:#9ca3af; margin-top:15px;">Email này được gửi tự động từ hệ thống Lâm Hà Kissaten.</p>' +
        '</div>' +

      '</div>' +
    '</div>';
  return html;
}


/**
 * 7. KHỞI TẠO BẢNG DÀNH RIÊNG CHO REPORT DASHBOARD
 */
function createFinancialDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Tạo hoặc dọn dẹp sheet BAO_CAO_TAI_CHINH
  var sheetName = 'BAO_CAO_TAI_CHINH';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    // Lưu các biểu đồ hiện tại
    var charts = sheet.getCharts();
    charts.forEach(function(c) { sheet.removeChart(c); });
    sheet.clear();
  } else {
    sheet = ss.insertSheet(sheetName);
  }
  
  // Thiết kế không hiển thị gridline mặc định để giao diện sạch hơn giống app
  sheet.setGridlines(false);
  
  // 2. Thiết lập độ rộng cột
  sheet.setColumnWidth(1, 30);   // Cột A: Khoảng cách
  sheet.setColumnWidth(2, 120);  // Cột B: Ngày / Danh mục
  sheet.setColumnWidth(3, 130);  // Cột C: Số liệu
  sheet.setColumnWidth(4, 110);  // Cột D: Tỷ trọng %
  sheet.setColumnWidth(5, 130);  // Cột E: Doanh thu
  sheet.setColumnWidth(6, 130);  // Cột F: Giá vốn (COGS)
  sheet.setColumnWidth(7, 130);  // Cột G: Chi phí vận hành
  sheet.setColumnWidth(8, 130);  // Cột H: Lợi nhuận ròng
  sheet.setColumnWidth(9, 110);  // Cột I: Số đơn
  sheet.setColumnWidth(10, 110); // Cột J: AOV
  
  // 3. Khởi tạo Tiêu đề chính của Dashboard
  sheet.getRange('B2:J2').merge()
       .setValue('LÂM HÀ KISSATEN — BÁO CÁO KẾ TOÁN & TÀI CHÍNH')
       .setFontSize(16)
       .setFontWeight('bold')
       .setFontColor('#ffffff')
       .setBackground('#1f2937')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
  sheet.setRowHeight(2, 45);
  
  // 4. Khởi tạo Khu vực Bộ lọc Tháng/Năm
  sheet.getRange('B3').setValue('Chọn Tháng:').setFontWeight('bold').setHorizontalAlignment('right');
  sheet.getRange('C3').setValue(new Date().getMonth() + 1); // Dropdown tháng hiện tại
  sheet.getRange('D3').setValue('Chọn Năm:').setFontWeight('bold').setHorizontalAlignment('right');
  sheet.getRange('E3').setValue(new Date().getFullYear());  // Dropdown năm hiện tại
  
  // Tạo Validation Dropdown cho Tháng (1-12) và Năm (2025-2028)
  var monthRule = SpreadsheetApp.newDataValidation().requireValueInList(['1','2','3','4','5','6','7','8','9','10','11','12'], true).build();
  sheet.getRange('C3').setDataValidation(monthRule).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f3f4f6');
  
  var yearRule = SpreadsheetApp.newDataValidation().requireValueInList(['2025','2026','2027','2028'], true).build();
  sheet.getRange('E3').setDataValidation(yearRule).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f3f4f6');
  
  // 5. Ô dữ liệu phụ trợ ẩn (để tính ngày Bắt đầu và Kết thúc của Tháng được chọn)
  // B4 = Ngày bắt đầu tháng: =DATE(E3, C3, 1)
  // D4 = Ngày kết thúc tháng: =EOMONTH(B4, 0)
  sheet.getRange('B4').setFormula('=DATE(E3, C3, 1)').setFontColor('#ffffff'); // ẩn text bằng màu trắng
  sheet.getRange('D4').setFormula('=EOMONTH(B4, 0)').setFontColor('#ffffff'); // ẩn text bằng màu trắng
  
  // 6. THIẾT KẾ CÁC THẺ KPI CARDS (B5:C7, D5:E7, F5:G7, H5:I7)
  // Thẻ 1: Doanh Thu
  sheet.getRange('B5:C5').merge().setValue('TỔNG DOANH THU').setFontSize(9).setFontWeight('bold').setFontColor('#4b5563').setHorizontalAlignment('center').setBackground('#eff6ff');
  sheet.getRange('B6:C7').merge().setFormula('=SUMIFS(DAILY_METRICS!B:B, DAILY_METRICS!A:A, ">="&B4, DAILY_METRICS!A:A, "<="&D4)').setFontSize(15).setFontWeight('bold').setFontColor('#1d4ed8').setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#eff6ff');
  sheet.getRange('B5:C7').setBorder(true, true, true, true, false, false, '#bfdbfe', SpreadsheetApp.BorderStyle.SOLID);
  
  // Thẻ 2: Giá Vốn COGS
  sheet.getRange('D5:E5').merge().setValue('GIÁ VỐN (COGS)').setFontSize(9).setFontWeight('bold').setFontColor('#4b5563').setHorizontalAlignment('center').setBackground('#fef3c7');
  sheet.getRange('D6:E6').merge().setFormula('=SUMIFS(DAILY_METRICS!C:C, DAILY_METRICS!A:A, ">="&B4, DAILY_METRICS!A:A, "<="&D4)').setFontSize(15).setFontWeight('bold').setFontColor('#b45309').setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#fef3c7');
  sheet.getRange('D7:E7').merge().setFormula('=IF(B6>0, D6/B6, 0)').setFontSize(9).setFontColor('#78350f').setHorizontalAlignment('center').setBackground('#fef3c7');
  sheet.getRange('D5:E7').setBorder(true, true, true, true, false, false, '#fde68a', SpreadsheetApp.BorderStyle.SOLID);
  
  // Thẻ 3: Chi Phí OPEX
  sheet.getRange('F5:G5').merge().setValue('CHI PHÍ (OPEX)').setFontSize(9).setFontWeight('bold').setFontColor('#4b5563').setHorizontalAlignment('center').setBackground('#fef2f2');
  sheet.getRange('F6:G6').merge().setFormula('=SUMIFS(EXPENSES!D:D, EXPENSES!B:B, ">="&B4, EXPENSES!B:B, "<="&D4)').setFontSize(15).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#fef2f2');
  sheet.getRange('F7:G7').merge().setFormula('=IF(B6>0, F6/B6, 0)').setFontSize(9).setFontColor('#991b1b').setHorizontalAlignment('center').setBackground('#fef2f2');
  sheet.getRange('F5:G7').setBorder(true, true, true, true, false, false, '#fca5a5', SpreadsheetApp.BorderStyle.SOLID);
  
  // Thẻ 4: Lợi Nhuận Ròng
  sheet.getRange('H5:I5').merge().setValue('LỢI NHUẬN RÒNG').setFontSize(9).setFontWeight('bold').setFontColor('#4b5563').setHorizontalAlignment('center').setBackground('#ecfdf5');
  sheet.getRange('H6:I6').merge().setFormula('=B6-D6-F6').setFontSize(15).setFontWeight('bold').setFontColor('#047857').setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#ecfdf5');
  sheet.getRange('H7:I7').merge().setFormula('=IF(B6>0, H6/B6, 0)').setFontSize(9).setFontColor('#065f46').setHorizontalAlignment('center').setBackground('#ecfdf5');
  sheet.getRange('H5:I7').setBorder(true, true, true, true, false, false, '#a7f3d0', SpreadsheetApp.BorderStyle.SOLID);

  // Thiết lập Format hiển thị số tiền và tỉ lệ phần trăm cho các KPI Cards
  sheet.getRange('B6').setNumberFormat('#,##0"đ"');
  sheet.getRange('D6').setNumberFormat('#,##0"đ"');
  sheet.getRange('D7').setNumberFormat('0.0%');
  sheet.getRange('F6').setNumberFormat('#,##0"đ"');
  sheet.getRange('F7').setNumberFormat('0.0%');
  sheet.getRange('H6').setNumberFormat('#,##0"đ"');
  sheet.getRange('H7').setNumberFormat('0.0%');
  
  // Set Row Heights cho KPI cards
  sheet.setRowHeight(5, 20);
  sheet.setRowHeight(6, 25);
  sheet.setRowHeight(7, 20);
  
  // 7. CƠ CẤU CHI PHÍ VẬN HÀNH (OPEX) BREAKDOWN (B10:D17)
  sheet.getRange('B10:D10').merge().setValue('CƠ CẤU CHI PHÍ VẬN HÀNH (OPEX)').setFontSize(11).setFontWeight('bold').setFontColor('#1f2937');
  
  sheet.getRange('B11').setValue('Danh mục chi phí').setFontWeight('bold').setBackground('#f3f4f6').setBorder(true, null, true, null, null, null);
  sheet.getRange('C11').setValue('Số tiền').setFontWeight('bold').setBackground('#f3f4f6').setHorizontalAlignment('right').setBorder(true, null, true, null, null, null);
  sheet.getRange('D11').setValue('Tỷ trọng').setFontWeight('bold').setBackground('#f3f4f6').setHorizontalAlignment('right').setBorder(true, null, true, null, null, null);
  
  var categories = [
    'Nguyên vật liệu (Cafe, sữa, trái cây, đá...)',
    'Mặt bằng (Tiền thuê nhà)',
    'Điện nước & Internet',
    'Nhân sự (Lương nhân viên)',
    'Marketing & Quảng cáo',
    'Khác (Sửa chữa, dụng cụ hỏng...)'
  ];
  
  for (var k = 0; k < categories.length; k++) {
    var rowIdx = 12 + k;
    sheet.getRange(rowIdx, 2).setValue(categories[k]);
    sheet.getRange(rowIdx, 3).setFormula('=SUMIFS(EXPENSES!D:D, EXPENSES!C:C, B' + rowIdx + ', EXPENSES!B:B, ">="&$B$4, EXPENSES!B:B, "<="&$D$4)').setNumberFormat('#,##0"đ"').setHorizontalAlignment('right');
    sheet.getRange(rowIdx, 4).setFormula('=IF($C$18>0, C' + rowIdx + '/$C$18, 0)').setNumberFormat('0.0%').setHorizontalAlignment('right');
  }
  
  // Dòng Tổng Cộng Chi Phí
  sheet.getRange('B18').setValue('Tổng Chi Phí OPEX').setFontWeight('bold').setBorder(true, null, true, null, null, null);
  sheet.getRange('C18').setFormula('=SUM(C12:C17)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setHorizontalAlignment('right').setBorder(true, null, true, null, null, null);
  sheet.getRange('D18').setFormula('=SUM(D12:D17)').setFontWeight('bold').setNumberFormat('100.0%').setHorizontalAlignment('right').setBorder(true, null, true, null, null, null);
  
  // 8. BẢNG CHI TIẾT THEO NGÀY DYNAMIC (B21:J52)
  sheet.getRange('B21:J21').merge().setValue('CHI TIẾT TÀI CHÍNH HẰNG NGÀY TRONG THÁNG').setFontSize(11).setFontWeight('bold').setFontColor('#1f2937');
  
  var tblHeaders = ['Ngày', 'Doanh thu', 'Giá vốn (COGS)', 'Chi phí OPEX', 'Lợi nhuận ròng', 'Tỷ suất LN', 'Số đơn', 'Đơn TB (AOV)'];
  for (var h = 0; h < tblHeaders.length; h++) {
    var colLetter = String.fromCharCode(66 + h); // B, C, D, E, F, G, H, I, J
    var cell = sheet.getRange(colLetter + '22');
    cell.setValue(tblHeaders[h]).setFontWeight('bold').setBackground('#f3f4f6').setBorder(true, null, true, null, null, null);
    if (h > 0) {
      cell.setHorizontalAlignment(h === 5 ? 'center' : 'right');
    }
  }
  
  // Tạo công thức động cho 31 ngày
  for (var d = 0; d < 31; d++) {
    var r = 23 + d;
    
    // B23 = Ngày đầu tháng: B4. Các ngày tiếp theo tự động cộng 1 nếu chưa vượt quá ngày cuối cùng D4.
    if (d === 0) {
      sheet.getRange('B' + r).setFormula('=IF(B4<="", "", B4)');
    } else {
      var prevRow = r - 1;
      sheet.getRange('B' + r).setFormula('=IF(B' + prevRow + '="","",IF(B' + prevRow + '+1>$D$4,"",B' + prevRow + '+1))');
    }
    
    // Thiết lập các công thức VLOOKUP & SUMIFS tham chiếu động
    sheet.getRange('C' + r).setFormula('=IF($B' + r + '="","",IFERROR(VLOOKUP($B' + r + ',DAILY_METRICS!A:E,2,FALSE),0))').setNumberFormat('#,##0"đ"');
    sheet.getRange('D' + r).setFormula('=IF($B' + r + '="","",IFERROR(VLOOKUP($B' + r + ',DAILY_METRICS!A:E,3,FALSE),0))').setNumberFormat('#,##0"đ"');
    sheet.getRange('E' + r).setFormula('=IF($B' + r + '="","",SUMIFS(EXPENSES!D:D,EXPENSES!B:B,$B' + r + '))').setNumberFormat('#,##0"đ"');
    sheet.getRange('F' + r).setFormula('=IF($B' + r + '="","",C' + r + '-D' + r + '-E' + r + ')').setNumberFormat('#,##0"đ"');
    sheet.getRange('G' + r).setFormula('=IF($B' + r + '="","",IF(C' + r + '>0,F' + r + '/C' + r + ',0))').setNumberFormat('0%').setHorizontalAlignment('center');
    sheet.getRange('H' + r).setFormula('=IF($B' + r + '="","",IFERROR(VLOOKUP($B' + r + ',DAILY_METRICS!A:E,4,FALSE),0))').setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange('I' + r).setFormula('=IF($B' + r + '="","",IFERROR(VLOOKUP($B' + r + ',DAILY_METRICS!A:E,5,FALSE),0))').setNumberFormat('#,##0"đ"');
    
    // Định dạng hiển thị Ngày VN
    sheet.getRange('B' + r).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  }
  
  // Dòng Tổng Cộng Chi Tiết Ngày
  sheet.getRange('B54').setValue('Tổng cộng').setFontWeight('bold').setBorder(true, null, true, null, null, null);
  sheet.getRange('C54').setFormula('=SUM(C23:C53)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setBorder(true, null, true, null, null, null);
  sheet.getRange('D54').setFormula('=SUM(D23:D53)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setBorder(true, null, true, null, null, null);
  sheet.getRange('E54').setFormula('=SUM(E23:E53)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setBorder(true, null, true, null, null, null);
  sheet.getRange('F54').setFormula('=SUM(F23:F53)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setBorder(true, null, true, null, null, null);
  sheet.getRange('G54').setFormula('=IF(C54>0,F54/C54,0)').setFontWeight('bold').setNumberFormat('0.0%').setHorizontalAlignment('center').setBorder(true, null, true, null, null, null);
  sheet.getRange('H54').setFormula('=SUM(H23:H53)').setFontWeight('bold').setNumberFormat('#,##0').setBorder(true, null, true, null, null, null);
  sheet.getRange('I54').setFormula('=IF(H54>0,C54/H54,0)').setFontWeight('bold').setNumberFormat('#,##0"đ"').setBorder(true, null, true, null, null, null);
  
  // 9. VẼ BIỂU ĐỒ BẰNG SCRIPT ĐỂ TĂNG MỨC ĐỘ CHUYÊN NGHIỆP
  try {
    // Biểu đồ Cơ cấu chi phí OPEX
    var pieChart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(sheet.getRange('B12:C17'))
      .setPosition(10, 5, 0, 0) // Hàng 10, Cột E
      .setOption('title', 'Cơ cấu Chi phí OPEX')
      .setOption('height', 180)
      .setOption('width', 300)
      .setOption('chartArea', {left:10, top:30, width:'90%', height:'80%'})
      .build();
    sheet.insertChart(pieChart);
    
    // Biểu đồ xu hướng Doanh thu vs Lợi nhuận ngày
    var lineChart = sheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(sheet.getRange('B22:B53')) // Trục X: Ngày
      .addRange(sheet.getRange('C22:C53')) // Series 1: Doanh thu
      .addRange(sheet.getRange('F22:F53')) // Series 2: Lợi nhuận
      .setPosition(10, 8, 0, 0) // Hàng 10, Cột H
      .setOption('title', 'Biểu đồ Doanh thu & Lợi nhuận ròng ngày')
      .setOption('height', 180)
      .setOption('width', 360)
      .setOption('legend', {position: 'bottom'})
      .setOption('chartArea', {left:40, top:30, width:'85%', height:'65%'})
      .build();
    sheet.insertChart(lineChart);
  } catch(chartErr) {
    Logger.log('Error creating dashboard charts: ' + chartErr);
  }
  
  Logger.log('Financial Dashboard created successfully in sheet ' + sheetName);
  
  // Gửi thông báo Telegram
  sendTelegramAlert('📊 <b>BẢNG BÁO CÁO TÀI CHÍNH ĐÃ KHỞI TẠO</b>\n' +
                    'Đã khởi tạo thành công tab <code>BAO_CAO_TAI_CHINH</code> trên Google Sheet.\n' +
                    'Bạn có thể vào sheet để xem biểu đồ và tùy chọn Tháng/Năm trực quan!');
}
