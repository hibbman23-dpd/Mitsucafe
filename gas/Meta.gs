/**
 * Meta.gs — kéo insight FB/IG/Threads qua Graph API v21.0.
 * Token = System User token (KHÔNG hết hạn) hoặc token 60 ngày, trong CONFIG.META_SYSTEM_TOKEN.
 * CONFIG.META_PAGE_ID (Facebook Page id), CONFIG.META_IG_USER_ID (IG business user id).
 * Threads: CONFIG.THREADS_TOKEN + THREADS_USER_ID (base graph.threads.net riêng).
 * Khi token chết → degrade flag (ScriptProperties) + Telegram alert; kênh tự rớt về nhập tay.
 *
 * ⚠️ Tên metric Meta đổi theo version/loại tài khoản — nếu lỗi "(#100) invalid metric"
 *    thì chỉnh danh sách metric theo https://developers.facebook.com/docs/graph-api
 */
var META_API = 'https://graph.facebook.com/v21.0';
var THREADS_API = 'https://graph.threads.net/v1.0';

function getMetaToken() { return getConfig('META_SYSTEM_TOKEN'); }
function _metaProps() { return PropertiesService.getScriptProperties(); }
function isMetaDegraded() { return _metaProps().getProperty('META_DEGRADED') === '1'; }

/** GET Graph API. Trả parsed object hoặc null (+ set degrade) nếu lỗi. */
function _metaGet(path, params) {
  var token = getMetaToken();
  if (!token) { _setMetaDegraded('CONFIG.META_SYSTEM_TOKEN chưa set'); return null; }
  params = params || {};
  params.access_token = token;
  var qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = META_API + path + '?' + qs;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = resp.getResponseCode();
  var body;
  try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  if (code !== 200 || !body || body.error) {
    var msg = body && body.error ? body.error.message : ('HTTP ' + code);
    _setMetaDegraded(msg);
    logError('meta.get ' + path, new Error(msg));
    return null;
  }
  if (isMetaDegraded()) _clearMetaDegraded(); // gọi thành công → clear
  return body;
}

function _setMetaDegraded(reason) {
  if (isMetaDegraded()) return; // tránh spam alert
  _metaProps().setProperty('META_DEGRADED', '1');
  try {
    sendTelegramAlert(
      '⚠️ <b>Token Meta lỗi</b> — hệ thống tự chuyển FB/IG/Threads sang <b>nhập tay</b>.\n' +
      'Lý do: ' + reason + '\n' +
      'Khắc phục: tạo token mới → dán vào CONFIG → key <code>META_SYSTEM_TOKEN</code>.\n' +
      'Hướng dẫn: https://developers.facebook.com/docs/marketing-api/system-users'
    );
  } catch (e) { logError('meta.alert', e); }
}
function _clearMetaDegraded() { _metaProps().deleteProperty('META_DEGRADED'); }

/** Health-check: gọi endpoint rẻ. Trả {ok, degraded}. Dùng cho trigger hằng ngày. */
function checkMetaTokenHealth() {
  var pageId = getConfig('META_PAGE_ID');
  var probe = _metaGet('/' + (pageId || 'me'), { fields: 'id' });
  return { ok: !!probe, degraded: isMetaDegraded() };
}

/** Cài trigger health-check hằng ngày 5:00 (idempotent). */
function installMetaHealthTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkMetaTokenHealth') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('checkMetaTokenHealth').timeBased().everyDays(1).atHour(5).create();
  Logger.log('Installed daily Meta health-check @5:00.');
}

/** insights API trả data[] mỗi metric có values[0].value → map {metric: value}. */
function _flattenInsights(ins) {
  var out = {};
  if (ins && ins.data) {
    for (var i = 0; i < ins.data.length; i++) {
      var d = ins.data[i];
      out[d.name] = (d.values && d.values[0]) ? d.values[0].value : 0;
    }
  }
  return out;
}

/** post_reactions_by_type_total là object {like:.., love:..} → tổng. */
function _sumReactions(v) {
  if (!v || typeof v !== 'object') return Number(v) || 0;
  var s = 0; for (var k in v) s += Number(v[k]) || 0; return s;
}

/**
 * Kéo insight các bài Facebook Page đăng trong [from,to] → upsert MARKETING_LOG (data_source=auto).
 * @return {number} số post xử lý (0 nếu degrade/không token)
 */
function pullMetaFbInsights(from, to) {
  var pageId = getConfig('META_PAGE_ID');
  if (!pageId) return 0;
  var posts = _metaGet('/' + pageId + '/published_posts', {
    fields: 'id,message,created_time,shares,comments.summary(true)',
    since: from, until: to, limit: 50
  });
  if (!posts || !posts.data) return 0;
  var n = 0;
  for (var i = 0; i < posts.data.length; i++) {
    var p = posts.data[i];
    var date = _asDateStr(p.created_time);
    var ins = _metaGet('/' + p.id + '/insights', {
      metric: 'post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total'
    });
    var m = _flattenInsights(ins);
    upsertMarketingByExternalId('fb_' + p.id, {
      platform: 'fb', type: 'post', title: (p.message || '').slice(0, 80),
      date: date,
      reach: m.post_impressions_unique || 0,
      impressions: m.post_impressions || 0,
      clicks: m.post_clicks || 0,
      likes: _sumReactions(m.post_reactions_by_type_total),
      comments: (p.comments && p.comments.summary) ? p.comments.summary.total_count : 0,
      shares: (p.shares ? p.shares.count : 0),
      format: 'photo'
    });
    n++;
  }
  Logger.log('pullMetaFbInsights → ' + n + ' posts');
  return n;
}

/**
 * Kéo insight IG media trong [from,to] → upsert MARKETING_LOG (data_source=auto).
 * IG cho `saved` + (reels) plays/avg_watch_time mà FB không có.
 * @return {number} số media xử lý
 */
function pullMetaIgInsights(from, to) {
  var igId = getConfig('META_IG_USER_ID');
  if (!igId) return 0;
  var media = _metaGet('/' + igId + '/media', {
    fields: 'id,caption,timestamp,media_type,like_count,comments_count',
    since: from, until: to, limit: 50
  });
  if (!media || !media.data) return 0;
  var n = 0;
  for (var i = 0; i < media.data.length; i++) {
    var md = media.data[i];
    var date = _asDateStr(md.timestamp);
    if (date < from || date > to) continue;
    var isReel = md.media_type === 'VIDEO' || md.media_type === 'REEL';
    var metric = isReel
      ? 'reach,saved,shares,plays,ig_reels_avg_watch_time'
      : 'reach,impressions,saved,shares';
    var m = _flattenInsights(_metaGet('/' + md.id + '/insights', { metric: metric }));
    upsertMarketingByExternalId('ig_' + md.id, {
      platform: 'ig', type: 'post',
      title: (md.caption || '').slice(0, 80), date: date,
      format: isReel ? 'reel' : 'photo',
      reach: m.reach || 0,
      impressions: m.impressions || 0,
      views: m.plays || 0,
      likes: md.like_count || 0,
      comments: md.comments_count || 0,
      shares: m.shares || 0,
      saves: m.saved || 0,
      avg_watch_pct: 0,
      watch_time_sec: Math.round((m.ig_reels_avg_watch_time || 0) / 1000)
    });
    n++;
  }
  Logger.log('pullMetaIgInsights → ' + n + ' media');
  return n;
}

/** GET Threads Graph API (token + base riêng). Trả object hoặc null (+degrade). */
function _threadsGet(path, params) {
  var token = getConfig('THREADS_TOKEN');
  if (!token) { _setMetaDegraded('CONFIG.THREADS_TOKEN chưa set'); return null; }
  params = params || {};
  params.access_token = token;
  var qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var resp = UrlFetchApp.fetch(THREADS_API + path + '?' + qs, { muteHttpExceptions: true });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  if (resp.getResponseCode() !== 200 || !body || body.error) {
    logError('threads.get ' + path, new Error(body && body.error ? body.error.message : 'http'));
    return null;
  }
  return body;
}

/**
 * Kéo insight các thread đăng trong [from,to] → upsert MARKETING_LOG (platform='threads', auto).
 * @return {number} số thread xử lý
 */
function pullMetaThreadsInsights(from, to) {
  var uid = getConfig('THREADS_USER_ID');
  if (!uid) return 0;
  var posts = _threadsGet('/' + uid + '/threads', {
    fields: 'id,text,timestamp', since: from, until: to, limit: 50
  });
  if (!posts || !posts.data) return 0;
  var n = 0;
  for (var i = 0; i < posts.data.length; i++) {
    var p = posts.data[i];
    var date = _asDateStr(p.timestamp);
    if (date < from || date > to) continue;
    var m = _flattenInsights(_threadsGet('/' + p.id + '/insights',
      { metric: 'views,likes,replies,reposts,quotes' }));
    upsertMarketingByExternalId('th_' + p.id, {
      platform: 'threads', type: 'post', format: 'text',
      title: (p.text || '').slice(0, 80), date: date,
      views: m.views || 0, likes: m.likes || 0, comments: m.replies || 0,
      shares: (Number(m.reposts) || 0) + (Number(m.quotes) || 0)
    });
    n++;
  }
  Logger.log('pullMetaThreadsInsights → ' + n + ' threads');
  return n;
}

/** Pull cả FB+IG+Threads cho [from,to]. Skip nếu degrade. @return {Object} */
function pullMetaAll(from, to) {
  if (isMetaDegraded()) return { ok: false, degraded: true, fb: 0, ig: 0, threads: 0 };
  var fb = pullMetaFbInsights(from, to);
  var ig = pullMetaIgInsights(from, to);
  var threads = pullMetaThreadsInsights(from, to);
  return { ok: true, degraded: isMetaDegraded(), fb: fb, ig: ig, threads: threads };
}

/** Trigger hằng ngày: pull 3 ngày gần nhất (engagement còn tăng vài ngày). */
function pullMetaRecent() {
  var tz = 'Asia/Ho_Chi_Minh';
  var to = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var from = Utilities.formatDate(new Date(Date.now() - 3 * 86400000), tz, 'yyyy-MM-dd');
  return pullMetaAll(from, to);
}

/** Cài trigger pull Meta hằng ngày 5:30 (idempotent). */
function installMetaPullTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pullMetaRecent') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('pullMetaRecent').timeBased().everyDays(1).atHour(5).nearMinute(30).create();
  Logger.log('Installed daily Meta pull @5:30.');
}
