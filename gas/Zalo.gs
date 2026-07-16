/**
 * Zalo.gs — tự xoay OA access token (hạn ~25h) bằng refresh token (dùng-1-lần).
 * Mỗi refresh ghi đè CONFIG.ZALO_OA_TOKEN + CONFIG.ZALO_REFRESH_TOKEN (token mới).
 */
var ZALO_OAUTH = 'https://oauth.zaloapp.com/v4/oa/access_token';

/**
 * Dấu vân tay token để log an toàn: độ dài + 4 ký tự cuối.
 * Đủ để so hai token có khớp nhau không và thấy cái nào rỗng/cụt, mà không đổ
 * secret vào ERROR_LOG. Sheet ERROR_LOG ai đọc được cũng thấy — đừng cho nó token.
 */
function _tokenFingerprint(t) {
  if (!t) return '(rỗng)';
  var s = String(t);
  return 'len=' + s.length + ' …' + s.slice(-4);
}

/** Gọi refresh, lưu token mới. Có lock tránh 2 tiến trình refresh cùng lúc (mất chuỗi token). */
function refreshZaloToken() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var refresh = getConfig('ZALO_REFRESH_TOKEN');
    var props = PropertiesService.getScriptProperties();
    if (!refresh || props.getProperty('ZALO_SHEET_DEGRADED') === '1') {
      refresh = props.getProperty('ZALO_REFRESH_TOKEN_CACHE') || refresh;
    }
    var appId = getConfig('ZALO_APP_ID');
    var secret = getConfig('ZALO_APP_SECRET');
    if (!refresh || !appId || !secret) { logError('zalo.refresh', new Error('thiếu CONFIG ZALO_*')); return null; }
    var resp = UrlFetchApp.fetch(ZALO_OAUTH, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: { secret_key: secret },
      payload: { refresh_token: refresh, app_id: appId, grant_type: 'refresh_token' },
      muteHttpExceptions: true
    });
    var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
    if (!body || !body.access_token) {
      logError('zalo.refresh', new Error('refresh fail: ' + resp.getContentText().slice(0, 200)));
      try { sendTelegramAlert('⚠️ Zalo OA refresh token LỖI — cần lấy lại refresh_token từ Zalo OA console → CONFIG.ZALO_REFRESH_TOKEN'); } catch (e2) {}
      return null;
    }
    
    // Ghi vào Sheet CONFIG
    setConfig('ZALO_OA_TOKEN', body.access_token);
    if (body.refresh_token) setConfig('ZALO_REFRESH_TOKEN', body.refresh_token); // token mới, ghi đè
    var nowIso = new Date().toISOString();
    setConfig('ZALO_LAST_REFRESH_TS', nowIso);
    
    // Đọc lại để kiểm tra xác nhận
    var readVerifyToken = getConfig('ZALO_OA_TOKEN');
    var sheetVerificationFailed = (readVerifyToken !== body.access_token);
    
    // Ghi đè dự phòng vào ScriptProperties
    props.setProperty('ZALO_OA_TOKEN_CACHE', body.access_token);
    if (body.refresh_token) {
      props.setProperty('ZALO_REFRESH_TOKEN_CACHE', body.refresh_token);
    }
    props.setProperty('ZALO_LAST_REFRESH_TS', nowIso);
    
    if (sheetVerificationFailed) {
      // KHÔNG log giá trị token — ERROR_LOG là sheet, ai đọc được sheet là có token
      // Zalo OA sống. Để chẩn đoán "sheet ghi đúng chưa" chỉ cần biết ĐỘ DÀI và 4 ký
      // tự cuối, không cần chính token.
      logError('zalo.refresh.verify', new Error(
        'Ghi token Zalo lên CONFIG sheet lỗi hoặc bị trễ. Sheet: ' + _tokenFingerprint(readVerifyToken) +
        ', Mong đợi: ' + _tokenFingerprint(body.access_token)));
      props.setProperty('ZALO_SHEET_DEGRADED', '1');
    } else {
      props.deleteProperty('ZALO_SHEET_DEGRADED');
    }
    
    Logger.log('Zalo token refreshed; expires_in=' + body.expires_in + '; ts=' + nowIso);
    return body.access_token;
  } finally { lock.releaseLock(); }
}

/** Trigger refresh mỗi 18h (an toàn trước hạn ~25h). */
function installZaloRefreshTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'refreshZaloToken') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('refreshZaloToken').timeBased().everyHours(18).create();
}

var ZALO_OPENAPI = 'https://openapi.zalo.me/v2.0/oa';

/** GET Zalo OA API với access token hiện tại. Trả object hoặc null. */
function _zaloGet(path, params) {
  var token = getConfig('ZALO_OA_TOKEN');
  var props = PropertiesService.getScriptProperties();
  if (!token || props.getProperty('ZALO_SHEET_DEGRADED') === '1') {
    token = props.getProperty('ZALO_OA_TOKEN_CACHE') || token;
  }
  if (!token) { refreshZaloToken(); token = getConfig('ZALO_OA_TOKEN') || props.getProperty('ZALO_OA_TOKEN_CACHE'); }
  if (!token) return null;
  params = params || {};
  var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var resp = UrlFetchApp.fetch(ZALO_OPENAPI + path + (qs ? '?' + qs : ''), {
    headers: { access_token: token }, muteHttpExceptions: true
  });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { return null; }
  if (body && body.error && body.error !== 0) {
    // token có thể hết hạn → refresh 1 lần rồi thử lại
    if (refreshZaloToken()) {
      resp = UrlFetchApp.fetch(ZALO_OPENAPI + path + (qs ? '?' + qs : ''),
        { headers: { access_token: getConfig('ZALO_OA_TOKEN') }, muteHttpExceptions: true });
      try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
    }
  }
  return body;
}

/**
 * Best-effort: ghi 1 dòng MARKETING_LOG/ngày cho Zalo OA (reach = follower count).
 * ⚠️ Per-broadcast open/click qua API Zalo hạn chế — phần đó có thể giữ thủ công.
 * @return {boolean}
 */
function pullZaloDailyFollowers() {
  var info = _zaloGet('/getoa', {});
  if (!info || !info.data) return false;
  var followers = Number(info.data.num_follower || info.data.follower || 0);
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  upsertMarketingByExternalId('zalo_followers_' + today, {
    platform: 'zalo', type: 'event', title: 'Zalo OA followers',
    date: today, reach: followers, format: 'text'
  });
  Logger.log('Zalo followers=' + followers);
  return true;
}
