'use strict';

function defaultConfig() {
  return { version: 2, scenes: [], theme: 'auto', promoRibbon: true };
}

var SCENE_TYPES = ['spotlight','image','video','menu','combo','tem','announcement','brand'];

function clampDuration(d, fallback) {
  var n = parseInt(d, 10);
  if (isNaN(n)) return (fallback && fallback >= 5) ? fallback : 11;
  return n < 5 ? 5 : n;
}

// One-way migrate old v1 config (blocks/featured/combos/announcement/video/rotateSeconds) → v2 scenes[].
function migrateV1(raw) {
  var d = defaultConfig();
  var blocks = (raw && raw.blocks) || {};
  var dur = clampDuration(raw && raw.rotateSeconds, 11);
  var scenes = [];
  var n = 0;
  function add(s) { s.id = 'm' + (++n); s.enabled = true; if (!s.duration) s.duration = dur; scenes.push(s); }
  var ann = (raw && raw.announcement) || {};
  if (blocks.announcement !== false && ann.active && ann.text) add({ type: 'announcement', text: ann.text, until: ann.until || '' });
  if (blocks.spotlight !== false && Array.isArray(raw && raw.featured)) raw.featured.forEach(function (sku) { if (sku) add({ type: 'spotlight', sku: sku }); });
  if (blocks.menu !== false) add({ type: 'menu' });
  var combo = (raw && raw.combos && raw.combos[0]) || null;
  if (blocks.combo !== false && combo && Array.isArray(combo.items) && combo.items.length >= 2 && combo.price) add({ type: 'combo', items: combo.items.slice(), price: combo.price, label: combo.label || '' });
  if (blocks.tem !== false) add({ type: 'tem' });
  var yt = raw && raw.video && raw.video.youtube_id;
  if (blocks.video !== false && yt) add({ type: 'video', youtube_id: yt, duration: 45 });
  d.scenes = scenes;
  d.theme = (['auto','day','night'].indexOf(raw && raw.theme) >= 0) ? raw.theme : 'auto';
  d.promoRibbon = (raw && raw.blocks && raw.blocks.promo === false) ? false : true;
  return d;
}

function normalizeScene(s, i) {
  if (!s || typeof s !== 'object' || SCENE_TYPES.indexOf(s.type) < 0) return null;
  var out = { id: String(s.id || ('s' + i)), type: s.type, enabled: s.enabled !== false, duration: clampDuration(s.duration, 11) };
  if (s.type === 'spotlight') out.sku = String(s.sku || '');
  if (s.type === 'image') { out.image = String(s.image || ''); out.caption = String(s.caption || ''); }
  if (s.type === 'video') out.youtube_id = String(s.youtube_id || '');
  if (s.type === 'announcement') { out.text = String(s.text || ''); out.until = String(s.until || ''); }
  if (s.type === 'combo') { out.items = Array.isArray(s.items) ? s.items.slice() : []; out.price = parseInt(s.price, 10) || 0; out.label = String(s.label || ''); }
  return out;
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultConfig();
  if (raw.version !== 2) return migrateV1(raw); // old schema
  var d = defaultConfig();
  d.scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).map(normalizeScene).filter(Boolean);
  d.theme = (['auto','day','night'].indexOf(raw.theme) >= 0) ? raw.theme : 'auto';
  d.promoRibbon = raw.promoRibbon !== false;
  return d;
}

function buildQueue(config, now, menu) {
  var byId = {}; (menu || []).forEach(function (m) { byId[m.sku] = m; });
  var q = (config.scenes || []).filter(function (s) {
    if (!s.enabled) return false;
    if (s.type === 'spotlight') return byId[s.sku] && byId[s.sku].available;
    if (s.type === 'image') return !!s.image;
    if (s.type === 'video') return !!s.youtube_id;
    if (s.type === 'announcement') return !!s.text;
    if (s.type === 'combo') return (s.items || []).length >= 2 && s.price > 0;
    return true; // menu, tem, brand
  });
  if (!q.length) return [{ type: 'brand', duration: 11 }];
  return q;
}

// ── Scene renderers ──

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmt(n){return Number(n||0).toLocaleString('vi-VN')+'đ';}
function fmtK(n){return Math.round(Number(n||0)/1000)+'k';}

// SVG cup fallbacks (no photos yet). Returns an <svg> string by category.
function cupSvg(cat){
  if (cat==='milk_tea'||cat==='fruit_tea') return '<svg class="sp-cup r" style="--d:.5s" viewBox="0 0 200 280" fill="none"><ellipse cx="100" cy="60" rx="62" ry="16" fill="#15485A" stroke="#E0A93F" stroke-width="2.6"/><rect x="116" y="6" width="9" height="70" rx="4" fill="#FF5E40" stroke="#08171c" stroke-width="1.5"/><path d="M40 92 L160 92 L146 250 Q145 264 131 264 L69 264 Q55 264 54 250 Z" fill="#2D5F6B" stroke="#E0A93F" stroke-width="2.8"/><ellipse cx="100" cy="92" rx="60" ry="15" fill="#488aa0" stroke="#E0A93F" stroke-width="2.6"/></svg>';
  return '<svg class="sp-cup r" style="--d:.5s" viewBox="0 0 200 280" fill="none"><ellipse cx="100" cy="60" rx="60" ry="15" fill="#15485A" stroke="#E0A93F" stroke-width="2.4"/><path d="M48 90 L152 90 L150 120 Q150 250 100 250 Q50 250 50 120 Z" fill="#3a2218" stroke="#E0A93F" stroke-width="2.6"/><path d="M50 175 L150 175 L148 210 Q120 230 100 230 Q80 230 52 210 Z" fill="#D8B877"/><ellipse cx="100" cy="90" rx="52" ry="12" fill="#5a3a28" stroke="#E0A93F" stroke-width="2"/></svg>';
}

function renderSpotlight(item){
  var img = item.image ? '<img class="sp-cup r" style="--d:.5s" src="'+esc(item.image)+'" alt="">' : cupSvg(item.subcategory);
  var jp = item.name_jp ? '<div class="sp-jp r" style="--d:.85s">'+esc(item.name_jp)+'</div>' : '';
  var story = item.story ? '<div class="sp-story r" style="--d:1.2s">'+esc(item.story)+'</div>' : '';
  var sizehint = item.price_l ? 'size M · L thêm '+fmt(item.price_l-item.price_m) : '';
  return '<section class="scene show"><div class="sp"><div class="sp-left"><div class="steam"><span></span><span></span><span></span></div>'+img+'</div>'
    +'<div class="sp-right"><div class="eyebrow r" style="--d:.7s"><span class="seal">推</span><span class="lbl">Món nên thử</span></div>'
    +jp+'<div class="sp-name r" style="--d:1s">'+esc(item.name)+'</div>'+story
    +'<div class="sp-pricewrap"><div class="pricetag r pop" style="--d:1.35s">'+fmt(item.price_m).replace('đ','')+'<span class="d">đ</span></div>'
    +(sizehint?'<span class="sizehint r" style="--d:1.5s">'+esc(sizehint)+'</span>':'')+'</div></div></div>'
    +'<div class="waveband r fade" style="--d:.35s">'+WAVE_BAND_SVG+'</div></section>';
}

function renderMenu(menu, categories){
  // up to 3 category columns, ~4 items each, available only
  var cats = categories.slice(0,3);
  var kanji = {phin_coffee:'珈',machine_coffee:'琲',milk_tea:'茶',fruit_tea:'果',blended:'氷',kissaten:'菓',pastry:'麭'};
  var cols = cats.map(function(c,i){
    var items = menu.filter(function(m){return m.available && m.subcategory===c.id;}).slice(0,4);
    var rows = items.map(function(m){var bdg=m.role==='hero'?'<span class="mtag hot">Bán chạy</span>':m.role==='signature'?'<span class="mtag sig">Đặc biệt</span>':''; return '<div class="mitem"><span class="nm">'+esc(m.name)+bdg+'</span><span class="ln"></span><span class="pr">'+fmtK(m.price_m)+'</span></div>';}).join('');
    return '<div class="mcol r" style="--d:'+(0.5+i*0.15)+'s"><div class="mcat"><span class="k">'+(kanji[c.id]||'品')+'</span><span class="n">'+esc(c.label)+'</span></div>'+rows+'</div>';
  }).join('');
  return '<section class="scene show"><div class="menu"><div class="menu-h r" style="--d:.3s"><div class="jp">お品書き</div><div class="vi">Thực đơn hôm nay</div></div><div class="menu-cols">'+cols+'</div></div></section>';
}

function renderCombo(combo, menu){
  var byId={}; menu.forEach(function(m){byId[m.sku]=m;});
  var its=(combo.items||[]).map(function(sku){return byId[sku];}).filter(Boolean);
  if (its.length<2) return renderBrand();
  var sum=its.reduce(function(s,m){return s+(m.price_m||0);},0);
  var save=sum-combo.price;
  var pct=sum>0?Math.round(save/sum*100):0;
  var seal=save>0?'<span class="save-seal">-'+fmtK(save)+'</span>':''; // triện tròn đỏ đè góc giá
  var cells=its.map(function(m,i){return '<div class="citem r" style="--d:'+(0.5+i*0.1)+'s">'+cupSvg(m.subcategory).replace('sp-cup','')+'<span class="nm">'+esc(m.name)+'</span><span class="op">'+fmt(m.price_m)+'</span></div>'+(i<its.length-1?'<div class="cplus r pop" style="--d:.7s">＋</div>':'');}).join('');
  return '<section class="scene show"><div class="combo"><div class="combo-badge r pop" style="--d:.3s">本日のセット · '+esc(combo.label||'Combo hôm nay')+'</div>'
    +'<div class="combo-row">'+cells+'<div class="cequals r pop" style="--d:.9s">＝</div><div class="cprice r pop" style="--d:1.05s">'+seal+fmt(combo.price).replace('đ','')+'<span class="d">đ</span></div></div>'
    +(save>0?'<div class="csave r" style="--d:1.2s">Tiết kiệm '+fmt(save)+(pct?' ('+pct+'%)':'')+' so với mua lẻ</div>':'')+'</div></section>';
}

function renderTem(){
  var slots='';
  for(var i=1;i<=10;i++){ slots += i<=7 ? '<span class="stamp on">蜜</span>' : (i===10?'<span class="stamp free">無</span>':'<span class="stamp">'+i+'</span>'); }
  return '<section class="scene show"><div class="tem"><div class="tem-h r" style="--d:.3s">スタンプカード · THẺ TÍCH TEM</div>'
    +'<div class="tem-big r" style="--d:.45s">Đủ <b>10 tem</b> = <b>1 ly miễn phí</b></div>'
    +'<div class="tem-card r pop" style="--d:.6s">'+slots+'</div>'
    +'<div class="tem-steps r" style="--d:1.1s">Mỗi ly nước mua = <b>1 tem</b> · đọc số điện thoại khi đặt để tích.<br>Đủ 10 tem → nhắc nhân viên đổi <b>1 ly miễn phí</b>.</div>'
    +'<img class="tem-bee r" style="--d:.9s" src="img/mitsu/char-queen-joyful.webp" alt=""></div></section>';
}

function renderVideo(youtubeId, leftItem, rightItem){
  var side=function(it,delay,extra){ if(!it) return '<div class="vside">'+WAVE_SIDE_SVG+'</div>';
    return '<div class="vside">'+WAVE_SIDE_SVG+cupSvg(it.subcategory).replace('sp-cup','vcup'+(extra||''))+'<div class="vcaption r" style="--d:'+delay+'s">'+esc(it.name)+'<span class="p">'+fmt(it.price_m)+'</span></div></div>'; };
  return '<section class="scene show"><div class="vid">'+side(leftItem,0.9)
    +'<div class="vcenter"><div class="vframe r pop" style="--d:.4s"><iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(youtubeId)+'?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist='+encodeURIComponent(youtubeId)+'" allow="autoplay; encrypted-media" frameborder="0"></iframe></div>'
    +'<div class="vtitle r" style="--d:.7s">三蜜の物語<span class="s">Câu chuyện của Mitsu</span></div></div>'
    +side(rightItem,1,' two')+'</div></section>';
}

function renderAnnouncement(text){
  return '<section class="scene show"><div class="combo"><div class="combo-badge r pop" style="--d:.3s">お知らせ · THÔNG BÁO</div><div class="sp-name r" style="--d:.5s;text-align:center;max-width:80vw">'+esc(text)+'</div></div></section>';
}

function renderImage(scene){
  var cap = scene.caption ? '<div class="img-cap r" style="--d:.6s">'+esc(scene.caption)+'</div>' : '';
  return '<section class="scene show"><div class="imgscene">'
    + '<img class="imgfull r fade" style="--d:.2s" src="'+esc(scene.image)+'" alt="" '
    + 'onerror="this.closest(\'.scene\').outerHTML=window.__renderBrand?window.__renderBrand():\'\'">'
    + cap + '</div></section>';
}

function renderBrand(){
  return '<section class="scene show"><div class="combo"><img class="brand-bee r" style="--d:.3s" src="img/mitsu/char-queen-joyful.webp" alt=""><div class="sp-name r" style="--d:.6s;text-align:center">mitsu<span class="dot">.</span></div><div class="sp-story r" style="--d:.9s;text-align:center;font-style:normal">蜜を集めて、絆を繋ぐ。</div></div></section>';
}

var WAVE_BAND_SVG = '<svg viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 120 Q120 70 240 110 T480 110 T720 110 T960 110 T1200 110 T1440 110 L1440 200 L0 200 Z" style="fill:var(--wave1)"/><path d="M0 140 Q120 100 240 132 T480 132 T720 132 T960 132 T1200 132 T1440 132 L1440 200 L0 200 Z" style="fill:var(--wave2)"/></svg><svg class="b" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 150 Q160 110 320 144 T640 144 T960 144 T1280 144 T1600 144 L1600 200 L0 200 Z" style="fill:var(--wave3)"/></svg>';
var WAVE_SIDE_SVG = '<div class="wavewrap r fade" style="--d:.2s"><svg viewBox="0 0 240 600" preserveAspectRatio="xMidYMax slice" fill="none"><path d="M0 600 L240 600 L240 300 Q160 250 230 180 Q120 230 110 130 Q150 70 60 40 Q110 130 0 170 Z" style="fill:var(--wave2)"/><path d="M0 600 L240 600 L240 420 Q150 380 210 300 Q110 360 70 270 Q40 360 0 350 Z" style="fill:var(--wave3)"/><g style="fill:var(--wave-foam)" opacity=".6"><circle cx="60" cy="42" r="7"/><circle cx="110" cy="132" r="6"/><circle cx="230" cy="182" r="6"/></g></svg></div>';

// ── Browser-only rotation runtime (guarded; Node tests never enter here) ──
if (typeof window !== 'undefined') (function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec';
  window.__renderBrand = renderBrand;
  var CACHE_KEY = 'lhk_signage_cfg', PROMO_KEY = 'lhk_signage_promo';

  function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  var cfg = normalizeConfig(safeJSON(localStorage.getItem(CACHE_KEY)));
  var promo = safeJSON(localStorage.getItem(PROMO_KEY)) || { active: false };
  var queue = [], idx = -1, timer = null;

  function menuData() { return (typeof MENU_DATA !== 'undefined') ? MENU_DATA : []; }
  function catsData() { return (typeof CATEGORIES !== 'undefined') ? CATEGORIES : []; }

  function applyTheme() {
    var m = cfg.theme || 'auto', h = new Date().getHours();
    var day = (m === 'day') || (m === 'auto' && h >= 6 && h < 18);
    var tv = document.getElementById('tv');
    tv.classList.toggle('day', day);
    tv.classList.toggle('night', !day);
  }

  // ── Preview mode: Studio iframe posts a single scene; no polling/auto-rotate ──
  var params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') {
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.kind !== 'signage-preview') return;
      var scene = e.data.scene || { type: 'brand', duration: 11 };
      cfg = normalizeConfig({ version: 2, scenes: [scene], theme: e.data.theme || 'auto', promoRibbon: false });
      applyTheme();
      queue = buildQueue(cfg, new Date(), menuData());
      idx = -1;
      if (queue.length) { idx = 0; mountScene(queue[0]); clearTimeout(timer); }
    });
    applyTheme();
    tickClock(); setInterval(tickClock, 1000);
    return; // skip the normal boot/poll path below
  }

  function mountScene(d) {
    var stage = document.getElementById('stage'), html;
    var byId = {}; menuData().forEach(function (m) { byId[m.sku] = m; });
    if (d.type === 'spotlight') {
      html = renderSpotlight(byId[d.sku] || { name: '', price_m: 0, subcategory: '' });
    } else if (d.type === 'menu') {
      html = renderMenu(menuData(), catsData());
    } else if (d.type === 'combo') {
      html = renderCombo({ items: d.items, price: d.price, label: d.label }, menuData());
    } else if (d.type === 'tem') {
      html = renderTem();
    } else if (d.type === 'video') {
      if (!navigator.onLine || !d.youtube_id) {
        html = renderBrand();
      } else {
        html = renderVideo(
          d.youtube_id,
          menuData().filter(function (m) { return m.available && m.subcategory === 'milk_tea'; })[0],
          menuData().filter(function (m) { return m.available && m.subcategory === 'phin_coffee'; })[0]
        );
      }
    } else if (d.type === 'announcement') {
      html = renderAnnouncement(d.text);
    } else if (d.type === 'image') {
      html = renderImage(d);
    } else {
      html = renderBrand();
    }
    stage.innerHTML = html;
    // video scene hides QR rail (it has side panels)
    document.getElementById('qrrail').style.display = (d.type === 'video') ? 'none' : '';
    // replay cascade reveal
    var tv = document.getElementById('tv');
    tv.classList.remove('run'); void tv.offsetWidth; tv.classList.add('run');
    renderDots();
  }

  function renderDots() {
    var el = document.getElementById('dots'), h = '';
    for (var i = 0; i < queue.length; i++) { h += '<i class="' + (i === idx ? 'on' : '') + '"></i>'; }
    el.innerHTML = h;
  }

  function advance() {
    if (!queue.length) return;
    idx = (idx + 1) % queue.length;
    var d = queue[idx];
    mountScene(d);
    clearTimeout(timer);
    var dwell = (d.duration && d.duration >= 5 ? d.duration : 11) * 1000;
    timer = setTimeout(advance, dwell);
  }

  function rebuild() {
    queue = buildQueue(cfg, new Date(), menuData());
    idx = -1;
    advance();
  }

  function applyPromo() {
    var r = document.getElementById('ribbon');
    if (cfg.promoRibbon && promo && promo.active) {
      r.style.display = '';
      r.innerHTML = '十 ' + esc(promo.message || 'Ưu đãi') + ' <b id="pc"></b>';
      tickCountdown();
    } else {
      r.style.display = 'none';
    }
  }

  function tickCountdown() {
    var pc = document.getElementById('pc'); if (!pc || !promo.end) return;
    var ms = new Date(promo.end).getTime() - Date.now();
    if (ms <= 0) { promo.active = false; applyPromo(); return; }
    var m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    pc.textContent = '· còn ' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function tickClock() {
    var d = new Date();
    var hh = d.getHours(), mm = d.getMinutes();
    document.getElementById('clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var open = hh >= 6 && hh < 23;
    document.getElementById('open-txt').textContent = open ? 'Đang mở cửa' : 'Đã đóng cửa';
    applyTheme();
    // Reload 1 lần/ngày lúc 4h (chống rò bộ nhớ 24/7). Khoá theo ngày trong localStorage
    // vì location.reload() xoá biến in-memory → nếu không persist sẽ lặp vô hạn cả tiếng 4h.
    var rkey = d.toDateString();
    if (hh === 4 && localStorage.getItem('lhk_signage_reload') !== rkey) {
      localStorage.setItem('lhk_signage_reload', rkey); location.reload();
    }
  }

  function poll() {
    fetch(GAS_URL + '?action=signage_config').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && j.config) {
        cfg = normalizeConfig(j.config);
        localStorage.setItem(CACHE_KEY, JSON.stringify(j.config));
        applyTheme();
        rebuild();
      }
    }).catch(function () {});

    fetch(GAS_URL + '?action=promo_info').then(function (r) { return r.json(); }).then(function (j) {
      var p = j && j.promo;
      if (p) {
        promo = p;
        localStorage.setItem(PROMO_KEY, JSON.stringify(p));
        applyPromo();
      }
    }).catch(function () {});
  }

  function stableOffset(id, range) {
    var h = 0;
    var idStr = String(id || '');
    for (var i = 0; i < idStr.length; i++) {
      h = (h * 31 + idStr.charCodeAt(i)) & 0xffff;
    }
    return ((h % 1000) / 1000 - 0.5) * range;
  }

  function renderTimeline(orders) {
    var tlOverlay = document.getElementById('timeline');
    var tlTable = document.getElementById('tl-table');
    var tlDelivery = document.getElementById('tl-delivery');
    var tv = document.getElementById('tv');
    var readyBoard = document.getElementById('ready-board');

    orders = orders || [];
    // Đơn ĐÃ XONG tại quán/mang đi (READY) → tách khỏi timeline, hiện số TO ở bảng riêng cho khách dễ thấy
    var boardOrders = orders.filter(function(o){ return o.delivery_type !== 'delivery' && o.status === 'READY'; });
    var timelineOrders = orders.filter(function(o){ return !(o.delivery_type !== 'delivery' && o.status === 'READY'); });

    if (readyBoard) {
      readyBoard.innerHTML = boardOrders.map(function(o){
        return '<div class="ready-card"><div class="rc-lbl">Mời lấy nước 🔔</div><div class="rc-code">' + esc(o.short_code || '—') + '</div></div>';
      }).join('');
    }

    // Clear old bees mỗi lần render
    var oldBees = tlOverlay.querySelectorAll('.bee-sticker');
    for (var i = 0; i < oldBees.length; i++) {
      oldBees[i].parentNode.removeChild(oldBees[i]);
    }

    if (timelineOrders.length === 0) {
      tlOverlay.classList.add('empty');
      tlOverlay.classList.remove('active');
      tv.classList.toggle('has-orders', boardOrders.length > 0);
      return;
    }

    tlOverlay.classList.remove('empty');
    tlOverlay.classList.add('active');
    tv.classList.add('has-orders');

    var hasDelivery = timelineOrders.some(function(o) { return o.delivery_type === 'delivery'; });
    tlDelivery.style.display = hasDelivery ? 'block' : 'none';

    // Determine position for each bee based on status
    var EIGHT_MIN = 8 * 60 * 1000; // mỗi đoạn chạy 8 phút
    timelineOrders.forEach(function(o) {
      var isDelivery = o.delivery_type === 'delivery';
      var track = isDelivery ? tlDelivery : tlTable;

      // Mốc (%): table = 10 / 50 / 90 ; delivery = 10 / 37 / 63 / 90
      var makingStart  = isDelivery ? 37 : 50;
      var makingEnd    = isDelivery ? 63 : 90;
      var deliverStart = 63, deliverEnd = 90;

      // Mapping sticker mới:
      //   Tiếp Nhận (NEW/CONFIRMED) → 8.png
      //   Đang Pha  (MAKING)        → 2.png (ảnh barista)
      //   Đang Giao (DELIVERING)    → 1.png
      //   Đã Xong/Đã Giao (READY/DELIVERED) → 9.png
      var img = '8.webp';   // mặc định: Tiếp Nhận
      var leftPct = 10;
      var crawlEnd = null, sinceTs = null;

      if (o.status === 'MAKING') {
        img = '2.webp';
        leftPct = makingStart;
        crawlEnd = makingEnd;          // chạy từ từ tới mốc kế
        sinceTs = o.making_at;
      } else if (o.status === 'READY') {
        img = '9.webp';
        leftPct = isDelivery ? deliverStart : 90; // delivery: chờ shipper ở mốc Đang Giao
      } else if (o.status === 'DELIVERING') {
        img = '1.webp';
        leftPct = deliverStart;
        crawlEnd = deliverEnd;
        sinceTs = o.delivering_at;
      } else if (o.status === 'DELIVERED') {
        img = '9.webp';
        leftPct = 90;
      }

      // Vị trí hiện tại theo thời gian đã trôi (8 phút = tới mốc kế)
      var curLeft = leftPct;
      var remainingMs = 0;
      if (crawlEnd !== null) {
        var frac = 0;
        if (sinceTs) {
          var elapsed = Date.now() - new Date(sinceTs).getTime();
          if (elapsed > 0) frac = Math.min(1, elapsed / EIGHT_MIN);
        }
        curLeft = leftPct + frac * (crawlEnd - leftPct);
        remainingMs = (1 - frac) * EIGHT_MIN;
      }

      var bee = document.createElement('div');
      bee.className = 'bee-sticker';
      if (o.status === 'DELIVERED') {
        bee.className += ' delivered';
      }
      bee.style.transition = 'none';   // đặt vị trí đầu không animate
      bee.style.left = curLeft + '%';

      // Determine label text (dine-in displays Bàn 0X if table_id is present)
      var codeText = '#' + o.short_code;
      if (o.delivery_type !== 'delivery' && o.table_id) {
        var tableNum = String(o.table_id).replace(/^(table_|ban|bàn)\s*/i, '');
        if (!isNaN(parseInt(tableNum, 10))) {
          var num = parseInt(tableNum, 10);
          codeText = 'Bàn ' + (num < 10 ? '0' + num : num);
        } else {
          codeText = 'Bàn ' + o.table_id;
        }
      }

      bee.innerHTML = '<div class="bee-code">' + esc(codeText) + '</div><img src="img/' + img + '" alt="">';
      
      // Calculate stable offsets based on order_id to prevent bees jumping every 10s
      var offsetLeft = stableOffset(o.order_id, 4);      // range -2vh to 2vh
      var offsetBottom = (stableOffset(o.order_id + '_b', 1) + 0.5) * 2; // range 0vh to 2vh
      bee.style.marginLeft = offsetLeft + 'vh';
      bee.style.bottom = offsetBottom + 'vh';

      track.appendChild(bee);

      // Crawl: animate từ vị trí hiện tại → mốc kế trong thời gian còn lại (linear, mượt)
      if (crawlEnd !== null && remainingMs > 500) {
        (function(b, endP, remMs) {
          requestAnimationFrame(function() { requestAnimationFrame(function() {
            b.style.transition = 'left ' + (remMs / 1000) + 's linear';
            b.style.left = endP + '%';
          }); });
        })(bee, crawlEnd, remainingMs);
      }
    });
  }

  function pollOrders() {
    fetch(GAS_URL + '?action=active_orders').then(function(r) { return r.json(); }).then(function(j) {
      if (j && j.ok) {
        renderTimeline(j.orders);
      }
    }).catch(function() {});
  }

  window.addEventListener('online', function () { if (queue.length === 0) location.reload(); });

  // boot: render from cache immediately, then poll
  applyTheme();
  rebuild();
  applyPromo();
  tickClock(); setInterval(tickClock, 1000);
  setInterval(tickCountdown, 1000);
  poll(); setInterval(poll, 60000);
  pollOrders(); setInterval(pollOrders, 10000); // 10s poll for orders
})();

// ── CommonJS export for Node tests (ignored in browser) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, migrateV1: migrateV1, clampDuration: clampDuration, buildQueue: buildQueue, esc: esc, renderSpotlight: renderSpotlight, renderMenu: renderMenu, renderCombo: renderCombo, renderTem: renderTem, renderVideo: renderVideo, renderAnnouncement: renderAnnouncement, renderImage: renderImage, renderBrand: renderBrand };
}
