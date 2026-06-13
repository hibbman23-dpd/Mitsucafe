/**
 * Signage.gs — cấu hình màn quảng cáo mặt tiền.
 * Lưu 1 ô JSON trong CONFIG (key SIGNAGE_CONFIG). Đọc public; ghi cần admin.
 */
function _defaultSignageConfig() {
  return {
    blocks: { spotlight: true, promo: true, menu: true, video: true, qr: true, tem: true, combo: true, daypart: true },
    featured: [], combos: [],
    announcement: { text: '', active: false, until: '' },
    video: { youtube_id: 'AQBbF4V4wRg' },
    rotateSeconds: 11,
    theme: 'auto'
  };
}

/** Public read — màn signage poll cái này. */
function getSignageConfig() {
  var raw = getConfig('SIGNAGE_CONFIG');
  if (!raw) return { ok: true, config: _defaultSignageConfig() };
  try { return { ok: true, config: JSON.parse(raw) }; }
  catch (e) { logError('getSignageConfig.parse', e); return { ok: true, config: _defaultSignageConfig() }; }
}

/** Admin write — Dashboard tab "Màn hình" gọi. p.config = object. */
function setSignageConfig(p) {
  var cfg = p && p.config;
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'config required' };
  cfg.updated_at = new Date().toISOString();
  setConfig('SIGNAGE_CONFIG', JSON.stringify(cfg));
  return { ok: true, updated_at: cfg.updated_at };
}
