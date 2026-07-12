/**
 * CameraAI.gs — Phân hệ quản lý bảo mật và sự kiện Camera AI.
 * 
 * Các chức năng chính:
 *   1. Quản lý Đăng nhập: băm mật khẩu SHA-256, sinh/hủy Session Token.
 *   2. Xác thực Token: Bảo vệ các API lấy dữ liệu và cấu hình camera.
 *   3. Ghi nhận Sự kiện: Nhận sự kiện từ Python AI Agent gửi về qua Webhook bảo mật (API Key).
 *   4. Quản trị: Hỗ trợ đổi mật khẩu quản trị và dọn dẹp phiên làm việc cũ.
 */

/**
 * 1. KHỞI TẠO BẢNG & CẤU HÌNH MẶC ĐỊNH
 */
function initCameraSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Tạo sheet CAMERA_EVENTS nếu chưa có
  var cameraSheet = ss.getSheetByName('CAMERA_EVENTS');
  if (!cameraSheet) {
    cameraSheet = ss.insertSheet('CAMERA_EVENTS');
    var headers = ['event_id', 'timestamp', 'camera_name', 'event_type', 'duration_sec', 'description', 'snapshot_url', 'status'];
    cameraSheet.appendRow(headers);
    cameraSheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    cameraSheet.setFrozenRows(1);
  }
  
  // 2. Tạo cấu hình tài khoản mặc định nếu chưa có
  if (!getConfig('ADMIN_USERNAME')) {
    setConfig('ADMIN_USERNAME', 'admin');
  }
  
  if (!getConfig('ADMIN_PASSWORD_HASH')) {
    // Mật khẩu mặc định "123456" — lưu hash CÓ SALT ngay từ đầu (hashPassword tự tạo salt).
    setConfig('ADMIN_PASSWORD_HASH', hashPassword('123456'));
  }
  
  if (!getConfig('CAMERA_AI_SECRET')) {
    // Mã bí mật tĩnh để Python script kết nối bảo mật gửi sự kiện
    var randomSecret = generateRandomString(16);
    setConfig('CAMERA_AI_SECRET', randomSecret);
  }
  
  if (!getConfig('ADMIN_SESSIONS')) {
    setConfig('ADMIN_SESSIONS', '{}');
  }
  
  Logger.log('Camera AI system initialized successfully.');
}

/**
 * 2. HÀM ĐĂNG NHẬP ADMIN VÀ SINH SESSION TOKEN
 */
function adminLogin(username, password) {
  try {
    if (password === '123456') {
      return { ok: false, error: 'Mật khẩu mặc định "123456" đã bị vô hiệu hóa vì lý do bảo mật. Vui lòng đổi mật khẩu tại tệp CONFIG trong Google Sheets để đăng nhập.' };
    }
    initCameraSheets(); // Đảm bảo cấu hình luôn sẵn sàng
    
    var dbUsername = getConfig('ADMIN_USERNAME') || 'admin';
    var dbPasswordHash = getConfig('ADMIN_PASSWORD_HASH');
    var hasSalt = !!getConfig('ADMIN_PASSWORD_SALT');

    var credOk = false;
    if (username === dbUsername) {
      if (hasSalt) {
        credOk = (hashPassword(password) === dbPasswordHash);
      } else if (hashSHA256(password) === dbPasswordHash) {
        // Hash cũ không salt → đúng mật khẩu: nâng cấp sang salted ngay.
        credOk = true;
        setConfig('ADMIN_PASSWORD_HASH', hashPassword(password)); // tạo salt + lưu hash mới
      }
    }
    if (!credOk) {
      return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' };
    }
    
    // Đăng nhập thành công -> Sinh Session Token
    var token = generateRandomString(32);
    var expiry = Date.now() + 2 * 60 * 60 * 1000; // Phiên làm việc kéo dài 2 tiếng
    
    // Lưu session vào CONFIG
    var sessionsJson = getConfig('ADMIN_SESSIONS') || '{}';
    var sessions = {};
    try {
      sessions = JSON.parse(sessionsJson);
    } catch(e) {
      sessions = {};
    }
    
    // Dọn dẹp các token đã hết hạn trước khi lưu token mới
    var cleanSessions = {};
    var now = Date.now();
    Object.keys(sessions).forEach(function(t) {
      if (sessions[t] > now) {
        cleanSessions[t] = sessions[t];
      }
    });
    
    cleanSessions[token] = expiry;
    setConfig('ADMIN_SESSIONS', JSON.stringify(cleanSessions));
    
    Logger.log('Admin login successful. Token generated.');
    return { ok: true, token: token, expires: new Date(expiry).toISOString() };
  } catch (err) {
    logError('adminLogin', err);
    return { ok: false, error: 'Lỗi hệ thống khi đăng nhập: ' + err.message };
  }
}

/**
 * 3. HÀM XÁC THỰC SESSION TOKEN
 */
function validateSessionToken(token) {
  if (!token) return false;
  
  var sessionsJson = getConfig('ADMIN_SESSIONS') || '{}';
  var sessions = {};
  try {
    sessions = JSON.parse(sessionsJson);
  } catch(e) {
    return false;
  }
  
  var expiry = sessions[token];
  if (!expiry) return false;
  
  // Kiểm tra hạn sử dụng
  if (Date.now() > expiry) {
    // Xóa token hết hạn khỏi CONFIG
    delete sessions[token];
    setConfig('ADMIN_SESSIONS', JSON.stringify(sessions));
    return false;
  }
  
  return true;
}

/**
 * 4. ĐỔI MẬT KHẨU QUẢN TRỊ
 */
function updateAdminPassword(token, oldPassword, newPassword) {
  try {
    // 1. Xác thực Token trước
    if (!validateSessionToken(token)) {
      return { ok: false, error: 'Phiên làm việc hết hạn hoặc không hợp lệ.' };
    }
    
    // 2. Xác thực mật khẩu cũ (hỗ trợ cả hash cũ không salt lẫn hash salted)
    var dbPasswordHash = getConfig('ADMIN_PASSWORD_HASH');
    var hasSalt = !!getConfig('ADMIN_PASSWORD_SALT');
    var oldOk = hasSalt
      ? (hashPassword(oldPassword) === dbPasswordHash)
      : (hashSHA256(oldPassword) === dbPasswordHash);
    if (!oldOk) {
      return { ok: false, error: 'Mật khẩu cũ không chính xác.' };
    }

    // 2.5 Kiểm tra độ mạnh mật khẩu mới
    if (!newPassword || newPassword.length < 8 || newPassword === '123456' || newPassword.toLowerCase() === 'admin') {
      return { ok: false, error: 'Mật khẩu mới quá yếu. Mật khẩu phải dài ít nhất 8 ký tự và không được trùng với mật khẩu mặc định hoặc từ khóa dễ đoán.' };
    }

    // 3. Cập nhật mật khẩu mới — xoay salt mới rồi băm salted.
    setConfig('ADMIN_PASSWORD_SALT', generateRandomString(24));
    setConfig('ADMIN_PASSWORD_HASH', hashPassword(newPassword));
    
    // 4. Hủy toàn bộ phiên làm việc khác để bắt buộc đăng nhập lại
    setConfig('ADMIN_SESSIONS', '{}');
    
    // Thông báo cho chủ quán qua Email
    sendEmailAlert('🔐 [Lâm Hà Kissaten] Đổi mật khẩu quản trị thành công',
                   '<p>Chào chủ quán,</p>' +
                   '<p>Mật khẩu tài khoản quản trị hệ thống Camera của quán vừa được thay đổi thành công lúc ' + formatTimestamp(new Date()) + '.</p>' +
                   '<p>Tất cả các phiên đăng nhập khác đã được tự động đăng xuất vì lý do bảo mật.</p>');
                   
    return { ok: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  } catch (err) {
    logError('updateAdminPassword', err);
    return { ok: false, error: 'Lỗi đổi mật khẩu: ' + err.message };
  }
}

/**
 * 5. NHẬN VÀ LƯU SỰ KIỆN CAMERA AI
 */
function saveCameraEvent(secret, eventData) {
  try {
    // Xác thực API Key tĩnh của Python script gửi về
    var systemSecret = getConfig('CAMERA_AI_SECRET');
    if (!systemSecret || secret !== systemSecret) {
      return { ok: false, error: 'API Key không hợp lệ.' };
    }
    
    if (!eventData.camera_name || !eventData.event_type) {
      return { ok: false, error: 'Thiếu thông tin camera_name hoặc event_type.' };
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('CAMERA_EVENTS');
    if (!sheet) {
      initCameraSheets();
      sheet = ss.getSheetByName('CAMERA_EVENTS');
    }
    
    var dateCompact = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
    var rand = Math.floor(1000 + Math.random() * 9000);
    var eventId = 'EVT-CAM-' + dateCompact + '-' + rand;
    
    var timestamp = new Date().toISOString();
    var duration = parseInt(eventData.duration_sec) || 0;
    var desc = eventData.description || '';
    var snapshot = eventData.snapshot_url || '';
    var severity = eventData.severity || 'WARNING'; // INFO, WARNING, CRITICAL
    
    sheet.appendRow([
      eventId,
      timestamp,
      eventData.camera_name,
      eventData.event_type,
      duration,
      desc,
      snapshot,
      'PENDING'
    ]);
    
    Logger.log('Camera AI event logged: ' + eventId);
    
    // Nếu sự kiện ở mức nghiêm trọng (CRITICAL), gửi mail khẩn cấp cho chủ quán
    if (severity === 'CRITICAL') {
      var subject = '🚨 [CẢNH BÁO CAMERA AI] ' + (eventData.event_title || 'Phát hiện sự kiện bất thường');
      var html = '<div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; border:1px solid #fca5a5; border-radius:8px; background-color:#fff5f5;">' +
                 '<h2 style="color:#b91c1c; margin-top:0;">🚨 Phát hiện Sự kiện Nghiêm trọng</h2>' +
                 '<p>Hệ thống giám sát Camera AI vừa ghi nhận một cảnh báo lúc: <b>' + formatTimestamp(timestamp) + '</b></p>' +
                 '<table style="width:100%; border-collapse:collapse; margin:15px 0;">' +
                   '<tr><td style="padding:5px; font-weight:bold; width:120px;">Camera:</td><td style="padding:5px;">' + eventData.camera_name + '</td></tr>' +
                   '<tr><td style="padding:5px; font-weight:bold;">Sự kiện:</td><td style="padding:5px; color:#b91c1c; font-weight:bold;">' + eventData.event_type + '</td></tr>' +
                   '<tr><td style="padding:5px; font-weight:bold;">Thời lượng:</td><td style="padding:5px;">' + duration + ' giây</td></tr>' +
                   '<tr><td style="padding:5px; font-weight:bold;">Chi tiết:</td><td style="padding:5px;">' + desc + '</td></tr>' +
                 '</table>';
      if (snapshot) {
        html += '<div style="text-align:center; margin:15px 0;"><img src="' + snapshot + '" style="max-width:100%; border-radius:4px; border:1px solid #e5e7eb;" alt="Camera Snapshot"/></div>';
      }
      html += '<div style="text-align:center; margin-top:20px;"><a href="' + ss.getUrl() + '" style="background-color:#b91c1c; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold; font-size:14px; display:inline-block;">Kiểm tra Nhật ký Báo cáo</a></div>' +
              '</div>';
      
      sendEmailAlert(subject, html);
    }
    
    return { ok: true, event_id: eventId };
  } catch (err) {
    logError('saveCameraEvent', err);
    return { ok: false, error: 'Lỗi ghi nhận sự kiện: ' + err.message };
  }
}

/**
 * 6. LẤY NHẬT KÝ SỰ KIỆN CAMERA (YÊU CẦU XÁC THỰC TOKEN)
 */
function getCameraEvents(token, limit) {
  try {
    if (!validateSessionToken(token)) {
      return { ok: false, error: 'Unauthorized', code: 401 };
    }
    
    limit = parseInt(limit) || 50;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('CAMERA_EVENTS');
    if (!sheet) return { ok: true, events: [] };
    
    var data = sheet.getDataRange().getValues();
    var events = [];
    
    // Đọc ngược từ dưới lên để lấy sự kiện mới nhất trước
    var startIdx = data.length - 1;
    var count = 0;
    
    for (var i = startIdx; i >= 1; i--) {
      if (count >= limit) break;
      var row = data[i];
      if (!row[0]) continue;
      
      events.push({
        event_id: row[0],
        timestamp: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
        camera_name: row[2],
        event_type: row[3],
        duration_sec: parseInt(row[4]) || 0,
        description: row[5],
        snapshot_url: row[6],
        status: row[7]
      });
      count++;
    }
    
    return { ok: true, events: events };
  } catch (err) {
    logError('getCameraEvents', err);
    return { ok: false, error: 'Lỗi lấy danh sách sự kiện: ' + err.message };
  }
}

/**
 * HÀM PHỤ TRỢ: TẠO CHUỖI NGẪU NHIÊN
 */
function generateRandomString(length) {
  // Dùng Utilities.getUuid() (UUID v4, ~122 bit entropy) thay vì Math.random()
  // (Math.random KHÔNG phải CSPRNG → token đoán được). Ghép nhiều UUID cho đủ độ dài.
  var str = '';
  while (str.length < length) {
    str += Utilities.getUuid().replace(/-/g, '');
  }
  return str.slice(0, length);
}

/**
 * Salt + key-stretching cho mật khẩu admin.
 * GAS không có bcrypt/PBKDF2 → iterate SHA-256 nhiều vòng với salt (poor-man KDF).
 * Chống rainbow table + làm chậm brute-force nếu hash bị lộ.
 */
function _getOrCreatePasswordSalt() {
  var salt = getConfig('ADMIN_PASSWORD_SALT');
  if (!salt) {
    salt = generateRandomString(24);
    setConfig('ADMIN_PASSWORD_SALT', salt);
  }
  return salt;
}

function hashPassword(password) {
  var salt = _getOrCreatePasswordSalt();
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + '::' + String(password), Utilities.Charset.UTF_8);
  for (var i = 0; i < 1200; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  var hex = '';
  for (var j = 0; j < bytes.length; j++) {
    var b = bytes[j]; if (b < 0) b += 256;
    var s = b.toString(16); if (s.length === 1) s = '0' + s;
    hex += s;
  }
  return hex;
}

/**
 * HÀM PHỤ TRỢ: BĂM SHA-256 (legacy, không salt — chỉ dùng verify hash cũ khi migrate)
 */
function hashSHA256(input) {
  if (input === null || input === undefined) return '';
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var hexString = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byteValue = rawHash[i];
    if (byteValue < 0) byteValue += 256;
    var byteString = byteValue.toString(16);
    if (byteString.length === 1) byteString = '0' + byteString;
    hexString += byteString;
  }
  return hexString;
}
