/**
 * Signage.gs — cấu hình màn quảng cáo mặt tiền.
 * Lưu 1 ô JSON trong CONFIG (key SIGNAGE_CONFIG). Đọc public; ghi cần admin.
 */
function _defaultSignageConfig() {
  return {
    version: 2,
    scenes: [
      { id: 'd1', type: 'menu', enabled: true, duration: 11 },
      { id: 'd2', type: 'tem',  enabled: true, duration: 11 },
      { id: 'd3', type: 'brand', enabled: true, duration: 11 }
    ],
    theme: 'auto',
    promoRibbon: true
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
