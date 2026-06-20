/**
 * TikTokScrape.gs — kéo video gần nhất từ profile TikTok công khai qua Firecrawl /v2/scrape (json extract).
 * OPT-IN: chỉ chạy khi CONFIG.TIKTOK_SCRAPE_ENABLED='true'. Có fallback nhập tay (panel P1).
 */
var FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape';

/**
 * @return {number} số video upsert (0 nếu tắt/lỗi/rỗng → tự về nhập tay)
 */
function pullTiktokViaFirecrawl() {
  if (getConfig('TIKTOK_SCRAPE_ENABLED') !== 'true') { Logger.log('TikTok scrape disabled.'); return 0; }
  var key = getConfig('FIRECRAWL_API_KEY');
  var profile = getConfig('TIKTOK_PROFILE_URL');
  if (!key || !profile) return 0;

  var payload = {
    url: profile,
    onlyMainContent: true,
    waitFor: 4000,
    formats: [{
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          videos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                video_url: { type: 'string' }, caption: { type: 'string' },
                views: { type: 'number' }, likes: { type: 'number' },
                comments: { type: 'number' }, shares: { type: 'number' }
              }
            }
          }
        }
      }
    }]
  };
  var resp = UrlFetchApp.fetch(FIRECRAWL_SCRAPE, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  var vids = body && body.data && body.data.json && body.data.json.videos;
  if (!vids || !vids.length) {
    logError('tiktok.scrape', new Error('Firecrawl trả rỗng (TikTok có thể chặn). HTTP ' + resp.getResponseCode()));
    return 0; // không có data → fallback nhập tay
  }
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var n = 0;
  for (var i = 0; i < vids.length; i++) {
    var v = vids[i];
    var rawUrl = v.video_url || '';
    // Bóc ID SỐ ổn định của video (vd .../@mitsucafe/video/7382910392?is_copy_url=1 → 7382910392)
    // → khoá đối soát cố định, tránh trùng dòng khi URL đổi (tương đối/tuyệt đối/kèm tham số chia sẻ).
    var match = rawUrl.match(/\/video\/(\d+)/);
    var videoId = match ? match[1] : rawUrl.replace(/[^a-zA-Z0-9]/g, '');
    if (!videoId) continue;
    upsertMarketingByExternalId('tt_' + videoId, {
      platform: 'tiktok', type: 'post', format: 'reel',
      title: (v.caption || '').slice(0, 80), date: today, // scrape không có ngày đăng chuẩn → ngày kéo
      views: Number(v.views) || 0, likes: Number(v.likes) || 0,
      comments: Number(v.comments) || 0, shares: Number(v.shares) || 0
    });
    n++;
  }
  Logger.log('pullTiktokViaFirecrawl → ' + n + ' videos');
  return n;
}

/** Trigger hằng ngày (chỉ chạy nếu enabled). */
function installTiktokTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'pullTiktokViaFirecrawl') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('pullTiktokViaFirecrawl').timeBased().everyDays(1).atHour(7).create();
}
