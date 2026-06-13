'use strict';

function defaultConfig() {
  return {
    blocks: { spotlight: true, promo: true, menu: true, video: true,
              qr: true, tem: true, combo: true, daypart: true },
    featured: [],
    combos: [],
    announcement: { text: '', active: false, until: '' },
    video: { youtube_id: 'AQBbF4V4wRg' },
    rotateSeconds: 11,
    theme: 'auto'
  };
}

function normalizeConfig(raw) {
  var d = defaultConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  return {
    blocks:       Object.assign({}, d.blocks, raw.blocks || {}),
    featured:     Array.isArray(raw.featured) ? raw.featured.slice() : d.featured,
    combos:       Array.isArray(raw.combos) ? raw.combos.slice() : d.combos,
    announcement: Object.assign({}, d.announcement, raw.announcement || {}),
    video:        Object.assign({}, d.video, raw.video || {}),
    rotateSeconds: (typeof raw.rotateSeconds === 'number' && raw.rotateSeconds >= 5) ? raw.rotateSeconds : d.rotateSeconds,
    theme:        (['auto', 'day', 'night'].indexOf(raw.theme) >= 0 ? raw.theme : 'auto')
  };
}

function resolveFeatured(featured, menu) {
  var byId = {};
  menu.forEach(function (m) { byId[m.sku] = m; });
  if (featured && featured.length) {
    return featured.filter(function (sku) { return byId[sku] && byId[sku].available; });
  }
  // derive: available hero/signature, up to 5
  return menu.filter(function (m) { return m.available && (m.role === 'hero' || m.role === 'signature'); })
             .map(function (m) { return m.sku; }).slice(0, 5);
}

function dayPart(hour) { return hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; }

var DAYPART_PRIORITY = {
  morning:   ['announcement','spotlight','menu','combo','tem','video','brand'],
  afternoon: ['announcement','spotlight','combo','tem','menu','video','brand'],
  evening:   ['announcement','video','spotlight','tem','menu','combo','brand']
};

function announcementActive(ann, now) {
  if (!ann || !ann.active || !ann.text) return false;
  if (ann.until) { var t = new Date(ann.until).getTime(); if (!isNaN(t) && t < now.getTime()) return false; }
  return true;
}

function buildQueue(config, now, menu) {
  var b = config.blocks, q = [];
  if (announcementActive(config.announcement, now)) q.push({ type: 'announcement' });
  if (b.spotlight) resolveFeatured(config.featured, menu).forEach(function (sku) { q.push({ type: 'spotlight', sku: sku }); });
  if (b.menu)  q.push({ type: 'menu' });
  if (b.combo && config.combos.length) q.push({ type: 'combo', combo: config.combos[0] });
  if (b.tem)   q.push({ type: 'tem' });
  if (b.video) q.push({ type: 'video' });
  if (!q.length) return [{ type: 'brand' }];
  if (b.daypart) {
    var order = DAYPART_PRIORITY[dayPart(now.getHours())];
    q = q.slice().sort(function (a, c) { return order.indexOf(a.type) - order.indexOf(c.type); });
  }
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
  for(var i=1;i<=10;i++){ slots += i<=7 ? '<span class="stamp on">茶</span>' : (i===10?'<span class="stamp free">無</span>':'<span class="stamp">'+i+'</span>'); }
  return '<section class="scene show"><div class="tem"><div class="tem-h r" style="--d:.3s">スタンプカード · THẺ TÍCH TEM</div>'
    +'<div class="tem-big r" style="--d:.45s">Đủ <b>10 tem</b> = <b>1 ly miễn phí</b></div>'
    +'<div class="tem-card r pop" style="--d:.6s">'+slots+'</div>'
    +'<div class="tem-steps r" style="--d:1.1s">Mỗi ly nước mua = <b>1 tem</b> · đọc số điện thoại khi đặt để tích.<br>Đủ 10 tem → nhắc nhân viên đổi <b>1 ly miễn phí</b>.</div>'
    +'<img class="tem-frog r" style="--d:.9s" src="kaeru-mascot.webp" alt=""></div></section>';
}

function renderVideo(youtubeId, leftItem, rightItem){
  var side=function(it,delay,extra){ if(!it) return '<div class="vside">'+WAVE_SIDE_SVG+'</div>';
    return '<div class="vside">'+WAVE_SIDE_SVG+cupSvg(it.subcategory).replace('sp-cup','vcup'+(extra||''))+'<div class="vcaption r" style="--d:'+delay+'s">'+esc(it.name)+'<span class="p">'+fmt(it.price_m)+'</span></div></div>'; };
  return '<section class="scene show"><div class="vid">'+side(leftItem,0.9)
    +'<div class="vcenter"><div class="vframe r pop" style="--d:.4s"><iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(youtubeId)+'?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist='+encodeURIComponent(youtubeId)+'" allow="autoplay; encrypted-media" frameborder="0"></iframe></div>'
    +'<div class="vtitle r" style="--d:.7s">かえるの物語<span class="s">Câu chuyện của Kaeru</span></div></div>'
    +side(rightItem,1,' two')+'</div></section>';
}

function renderAnnouncement(text){
  return '<section class="scene show"><div class="combo"><div class="combo-badge r pop" style="--d:.3s">お知らせ · THÔNG BÁO</div><div class="sp-name r" style="--d:.5s;text-align:center;max-width:80vw">'+esc(text)+'</div></div></section>';
}

function renderBrand(){
  return '<section class="scene show"><div class="combo"><img class="brand-frog r" style="--d:.3s" src="kaeru-mascot.webp" alt=""><div class="sp-name r" style="--d:.6s;text-align:center">KaeruKàphê</div><div class="sp-story r" style="--d:.9s;text-align:center;font-style:normal">お茶の心を、ふるさとへ。</div></div></section>';
}

var WAVE_BAND_SVG = '<svg viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 120 Q120 70 240 110 T480 110 T720 110 T960 110 T1200 110 T1440 110 L1440 200 L0 200 Z" fill="var(--wave1)"/><path d="M0 140 Q120 100 240 132 T480 132 T720 132 T960 132 T1200 132 T1440 132 L1440 200 L0 200 Z" fill="var(--wave2)"/></svg><svg class="b" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 150 Q160 110 320 144 T640 144 T960 144 T1280 144 T1600 144 L1600 200 L0 200 Z" fill="var(--wave3)"/></svg>';
var WAVE_SIDE_SVG = '<div class="wavewrap r fade" style="--d:.2s"><svg viewBox="0 0 240 600" preserveAspectRatio="xMidYMax slice" fill="none"><path d="M0 600 L240 600 L240 300 Q160 250 230 180 Q120 230 110 130 Q150 70 60 40 Q110 130 0 170 Z" fill="var(--wave2)"/><path d="M0 600 L240 600 L240 420 Q150 380 210 300 Q110 360 70 270 Q40 360 0 350 Z" fill="var(--wave3)"/><g fill="var(--wave-foam)" opacity=".6"><circle cx="60" cy="42" r="7"/><circle cx="110" cy="132" r="6"/><circle cx="230" cy="182" r="6"/></g></svg></div>';

// ── Browser-only rotation runtime (guarded; Node tests never enter here) ──
if (typeof window !== 'undefined') (function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec';
  var CACHE_KEY = 'lhk_signage_cfg', PROMO_KEY = 'lhk_signage_promo';

  function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  var cfg = normalizeConfig(safeJSON(localStorage.getItem(CACHE_KEY)));
  var promo = safeJSON(localStorage.getItem(PROMO_KEY)) || { active: false };
  var queue = [], idx = -1, timer = null, RELOADED = false;

  function menuData() { return (typeof MENU_DATA !== 'undefined') ? MENU_DATA : []; }
  function catsData() { return (typeof CATEGORIES !== 'undefined') ? CATEGORIES : []; }

  function applyTheme() {
    var m = cfg.theme || 'auto', h = new Date().getHours();
    var day = (m === 'day') || (m === 'auto' && h >= 6 && h < 18);
    var tv = document.getElementById('tv');
    tv.classList.toggle('day', day);
    tv.classList.toggle('night', !day);
  }

  function mountScene(d) {
    var stage = document.getElementById('stage'), html;
    var byId = {}; menuData().forEach(function (m) { byId[m.sku] = m; });
    if (d.type === 'spotlight') {
      html = renderSpotlight(byId[d.sku] || { name: '', price_m: 0, subcategory: '' });
    } else if (d.type === 'menu') {
      html = renderMenu(menuData(), catsData());
    } else if (d.type === 'combo') {
      html = renderCombo(d.combo, menuData());
    } else if (d.type === 'tem') {
      html = renderTem();
    } else if (d.type === 'video') {
      if (!navigator.onLine || !cfg.video.youtube_id) {
        html = renderBrand();
      } else {
        html = renderVideo(
          cfg.video.youtube_id,
          menuData().filter(function (m) { return m.available && m.subcategory === 'milk_tea'; })[0],
          menuData().filter(function (m) { return m.available && m.subcategory === 'phin_coffee'; })[0]
        );
      }
    } else if (d.type === 'announcement') {
      html = renderAnnouncement(cfg.announcement.text);
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
    var dwell = (d.type === 'video') ? 45000 : cfg.rotateSeconds * 1000;
    timer = setTimeout(advance, dwell);
  }

  function rebuild() {
    queue = buildQueue(cfg, new Date(), menuData());
    idx = -1;
    advance();
  }

  function applyPromo() {
    var r = document.getElementById('ribbon');
    if (cfg.blocks.promo && promo && promo.active) {
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
    if (hh === 4 && !RELOADED) { RELOADED = true; location.reload(); }
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

  window.addEventListener('online', function () { if (queue.length === 0) location.reload(); });

  // boot: render from cache immediately, then poll
  applyTheme();
  rebuild();
  applyPromo();
  tickClock(); setInterval(tickClock, 1000);
  setInterval(tickCountdown, 1000);
  poll(); setInterval(poll, 60000);
})();

// ── CommonJS export for Node tests (ignored in browser) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, resolveFeatured: resolveFeatured, dayPart: dayPart, announcementActive: announcementActive, buildQueue: buildQueue, esc: esc, renderSpotlight: renderSpotlight, renderMenu: renderMenu, renderCombo: renderCombo, renderTem: renderTem, renderVideo: renderVideo, renderAnnouncement: renderAnnouncement, renderBrand: renderBrand };
}
