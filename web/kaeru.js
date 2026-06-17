(function() {
  'use strict';

  const APP_VERSION = '20260617';
  const ORDER_URL_BASE = 'index.html?utm_source=landing';
  const withVersion = (url) => url + (url.includes('?') ? '&' : '?') + 'v=' + APP_VERSION;

  // ─── NAV SCROLL & PARALLAX ──────────────────────────────────────────────────
  const nav = document.getElementById('nav');
  const heroArt = document.querySelector('.markwrap');
  
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 50);
    if (heroArt && y < window.innerHeight) {
      heroArt.style.transform = `translateY(${y * 0.12}px)`;
    }
  }, { passive: true });

  // ─── SCROLL REVEAL ──────────────────────────────────────────────────────────
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('up');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });
  
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // ─── RIPPLE PAGE TRANSITION ──────────────────────────────────────────────────
  let isNavigating = false;
  
  function orderRipple(e) {
    const btn = e.currentTarget;
    const href = btn.getAttribute('href') || ORDER_URL_BASE;
    if (!href || href === '#') return;
    
    e.preventDefault();
    if (isNavigating) return;
    isNavigating = true;

    // Ink ripple inside the button
    const ink = document.createElement('span');
    ink.className = 'order-ink';
    const r = btn.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 2.4;
    ink.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,0.25);transform:scale(0);animation:ripple-effect 0.5s ease-out;width:${s}px;height:${s}px;left:${e.clientX - r.left - s/2}px;top:${e.clientY - r.top - s/2}px;pointer-events:none;`;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ink);

    // Full screen expansion wave
    const cx = e.clientX, cy = e.clientY;
    const maxR = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(window.innerWidth - cx, cy),
      Math.hypot(cx, window.innerHeight - cy),
      Math.hypot(window.innerWidth - cx, window.innerHeight - cy)
    ) + 10;
    const d = maxR * 2;
    const wave = document.createElement('div');
    wave.className = 'order-wave';
    wave.style.cssText = `position:fixed;border-radius:50%;background:var(--accent);z-index:99999;pointer-events:none;transition:transform 0.65s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.65s;transform:scale(0);opacity:1;width:${d}px;height:${d}px;left:${cx - d/2}px;top:${cy - d/2}px;`;
    document.body.appendChild(wave);

    // Dynamic keyframes styling injection if needed (ripple-effect)
    if (!document.getElementById('ripple-style')) {
      const style = document.createElement('style');
      style.id = 'ripple-style';
      style.innerHTML = `@keyframes ripple-effect { to { transform: scale(1); opacity: 0; } }`;
      document.head.appendChild(style);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wave.style.transform = 'scale(1)';
      });
    });

    setTimeout(() => {
      window.location.href = withVersion(href);
    }, 600);
  }

  // Bind ripple triggers
  function bindRippleTriggers() {
    document.querySelectorAll('.btn-primary, .nav-cta, .nav-order-btn').forEach(btn => {
      if (btn.getAttribute('href')?.includes('index.html')) {
        btn.addEventListener('click', orderRipple);
      }
    });
  }
  bindRippleTriggers();

  // Reset page navigation freeze for bfcache
  function resetNavState() {
    isNavigating = false;
    document.querySelectorAll('.order-wave, .order-ink').forEach(el => el.remove());
  }
  window.addEventListener('pagehide', resetNavState);
  window.addEventListener('pageshow', (e) => { if (e.persisted) resetNavState(); });

  // ─── FOOTER TOGGLES ──────────────────────────────────────────────────────────
  function bindToggle(toggleId, detailsId) {
    const toggle = document.getElementById(toggleId);
    const details = document.getElementById(detailsId);
    if (!toggle || !details) return;
    
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = details.style.maxHeight && details.style.maxHeight !== '0px';
      if (isOpen) {
        details.style.maxHeight = '0px';
        details.style.marginTop = '0px';
        toggle.style.color = '';
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        details.style.maxHeight = details.scrollHeight + 'px';
        details.style.marginTop = '8px';
        toggle.style.color = 'var(--accent-deep)';
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  }
  bindToggle('contact-toggle', 'contact-details');
  bindToggle('hours-toggle', 'hours-details');

  // ─── DYNAMIC MENU SHOWCASE RENDERING ─────────────────────────────────────────
  const MITSU_CATEGORIES = [
    { id: 'kin', k: '勤', romaji: 'Kin', vi: 'Chăm chỉ', desc: 'Cà phê & trà sữa mỗi ngày — làm đều, làm chuẩn' },
    { id: 'ritsu', k: '律', romaji: 'Ritsu', vi: 'Kỷ luật', desc: 'Pha chuẩn từng thông số — cà phê specialty & trà thuần' },
    { id: 'so', k: '創', romaji: 'Sō', vi: 'Sáng tạo', desc: 'Sáng tạo có mật ong thật — lạ mà ai cũng uống được' },
    { id: 'kashi', k: '菓', romaji: 'Kashi', vi: 'Ăn kèm', desc: 'Bánh ngọt nhỏ — hợp cầm tay, gói mang đi' }
  ];

  const MENU = MITSU_CATEGORIES.map(c => ({
    id: c.id,
    k: c.k,
    romaji: c.romaji,
    vi: c.vi,
    desc: c.desc,
    items: (typeof MENU_DATA !== 'undefined' ? MENU_DATA : []).filter(item => item.bee_group === c.id && item.available)
  }));

  const formatPrice = (p) => p ? `${Math.round(p / 1000)}k` : 'Liên hệ';
  const hexPhoto = (k) => `<div class="photo" data-k="${k}"></div>`;

  // Render List View
  const listEl = document.getElementById('list');
  if (listEl) {
    listEl.innerHTML = MENU.map(c => `
      <section class="cat" style="padding:0; margin-bottom:40px;">
        <div class="cat-head">
          <span class="k jp">${c.k}</span>
          <span class="nm">${c.romaji} <small>· ${c.vi}</small></span>
          <span class="desc">${c.desc}</span>
        </div>
        <div class="items-grid">
          ${c.items.map((it, i) => `
            <button class="mi" data-cat="${c.id}" data-i="${i}" aria-label="Xem chi tiết ${it.name}">
              <span class="mi-name">${it.name}</span>
              ${it.story ? `<span class="mi-note"> &nbsp;·&nbsp; ${it.story}</span>` : ''}
              <span class="mi-dots"></span>
              <span class="mi-price">${formatPrice(it.price_m)}</span>
            </button>`).join('')}
        </div>
      </section>`).join('');
  }

  // Render Honeycomb Gallery View
  const galleryEl = document.getElementById('gallery');
  if (galleryEl) {
    const flat = [];
    MENU.forEach(c => c.items.forEach((it, i) => flat.push({ cat: c.id, k: c.k, i, ...it })));
    
    function renderGalleryGrid() {
      const isMobile = window.innerWidth <= 720;
      const perRow = isMobile ? 3 : 5;
      let rows = '', rIdx = 0;
      
      for (let x = 0; x < flat.length; x += perRow) {
        const cells = flat.slice(x, x + perRow).map(f => `
          <div class="hex ghex" data-cat="${f.cat}" data-i="${f.i}" role="button" tabindex="0" aria-label="${f.name}">
            <div class="in">
              ${hexPhoto(f.k)}
              <div class="cap"><span class="n">${f.name}</span></div>
            </div>
          </div>`).join('');
        rows += `<div class="hrow ${rIdx % 2 ? 'odd' : ''}">${cells}</div>`;
        rIdx++;
      }
      galleryEl.innerHTML = rows;
    }
    
    renderGalleryGrid();
    window.addEventListener('resize', renderGalleryGrid);
  }

  // List/Honeycomb Toggle
  const tabList = document.getElementById('tab-list');
  const tabGrid = document.getElementById('tab-grid');
  
  function setView(grid) {
    if (!galleryEl || !listEl) return;
    galleryEl.classList.toggle('on', grid);
    listEl.classList.toggle('off', grid);
    tabGrid.setAttribute('aria-pressed', String(grid));
    tabList.setAttribute('aria-pressed', String(!grid));
  }
  
  if (tabList && tabGrid) {
    tabList.addEventListener('click', () => setView(false));
    tabGrid.addEventListener('click', () => setView(true));
  }

  // ─── 3D CAROUSEL DIALOG ──────────────────────────────────────────────────────
  const ov = document.getElementById('ov');
  const ring = document.getElementById('ring');
  const detail = document.getElementById('detail');
  let curCat = null, curItems = [], curIdx = 0, step = 0, radius = 0;

  function openCarousel(catId, idx) {
    const cat = MENU.find(c => c.id === catId);
    if (!cat || !ring || !ov) return;
    
    curCat = cat;
    curItems = cat.items;
    curIdx = idx;
    step = 360 / curItems.length;
    // Calculate radius to prevent overlap
    radius = Math.round(130 / Math.tan(Math.PI / Math.max(curItems.length, 3))) + 60;
    
    ring.innerHTML = curItems.map((it, i) => `
      <div class="hex ccell" data-i="${i}" style="transform:rotateY(${i * step}deg) translateZ(${radius}px)">
        <div class="in">
          ${hexPhoto(cat.k)}
          <div class="cap">
            <span class="n">${it.name}</span>
            <span class="p">${formatPrice(it.price_m)}</span>
          </div>
        </div>
      </div>`).join('');
      
    ov.classList.add('on');
    document.body.style.overflow = 'hidden';
    updateCarousel();
  }

  function updateCarousel() {
    if (!ring || !detail) return;
    ring.style.transform = `translateZ(-${radius}px) rotateY(${-curIdx * step}deg)`;
    
    [...ring.children].forEach((el, i) => {
      el.classList.toggle('active', i === curIdx);
    });
    
    const it = curItems[curIdx];
    detail.innerHTML = `
      <div class="dk jp">${curCat.k} · ${curCat.romaji}</div>
      <div class="dn">${it.name}</div>
      <div class="dp">${formatPrice(it.price_m)}</div>
      ${it.story ? `<div class="dd">${it.story}</div>` : ''}
      <button class="dadd" data-sku="${it.sku}">Đặt món này</button>
    `;
    
    // Wire ripple effect on the dynamically added button
    const daddBtn = detail.querySelector('.dadd');
    if (daddBtn) {
      daddBtn.addEventListener('click', orderRipple);
    }
    
    // Trigger entrance animation
    detail.style.animation = 'none';
    void detail.offsetWidth;
    detail.style.animation = '';
  }

  function moveCarousel(dir) {
    if (!curItems.length) return;
    curIdx = (curIdx + dir + curItems.length) % curItems.length;
    updateCarousel();
  }

  function closeCarousel() {
    if (ov) ov.classList.remove('on');
    document.body.style.overflow = '';
  }

  if (ov) {
    document.getElementById('ovPrev').addEventListener('click', () => moveCarousel(-1));
    document.getElementById('ovNext').addEventListener('click', () => moveCarousel(1));
    document.getElementById('ovClose').addEventListener('click', closeCarousel);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeCarousel(); });
    
    ring.addEventListener('click', (e) => {
      const cell = e.target.closest('.ccell');
      if (cell) {
        const i = parseInt(cell.dataset.i, 10);
        if (i === curIdx) return;
        curIdx = i;
        updateCarousel();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!ov.classList.contains('on')) return;
      if (e.key === 'Escape') closeCarousel();
      if (e.key === 'ArrowRight') moveCarousel(1);
      if (e.key === 'ArrowLeft') moveCarousel(-1);
    });
  }

  // Trigger carousel from menu clicks
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat][data-i]');
    if (t && !t.classList.contains('hex') && !t.classList.contains('ghex')) {
      openCarousel(t.dataset.cat, parseInt(t.dataset.i, 10));
    }
  });

  // Honeycomb gallery clicks
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.ghex');
    if (t) openCarousel(t.dataset.cat, parseInt(t.dataset.i, 10));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target.closest('.ghex') || e.target.closest('.mi');
      if (t) {
        e.preventDefault();
        openCarousel(t.dataset.cat, parseInt(t.dataset.i, 10));
      }
    }
  });

  // ─── PROMOTION SYSTEM ────────────────────────────────────────────────────────
  (function() {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec';
    const URGENT_THRESHOLD_MS = 10 * 60 * 1000;
    let promoTimer = null;
    let pricesApplied = false;

    function formatVnd(n) { return n.toLocaleString('vi-VN') + 'đ'; }

    function revertPrices() {
      document.querySelectorAll('.mi-price').forEach(el => {
        if (el.dataset.originalPrice) {
          el.textContent = formatPrice(parseInt(el.dataset.originalPrice, 10));
        }
      });
      pricesApplied = false;
    }

    function applyDiscountedPrices(multiplier) {
      if (pricesApplied) return;
      document.querySelectorAll('.mi-price').forEach(el => {
        // Extract price from menu data or text content
        const btn = el.closest('.mi');
        if (!btn) return;
        const catId = btn.dataset.cat;
        const iIdx = parseInt(btn.dataset.i, 10);
        const cat = MENU.find(c => c.id === catId);
        if (!cat) return;
        const item = cat.items[iIdx];
        if (!item || !item.price_m) return;

        const oldPrice = item.price_m;
        if (!el.dataset.originalPrice) el.dataset.originalPrice = String(oldPrice);
        const discounted = Math.round(oldPrice * multiplier);

        el.textContent = '';
        const oldSpan = document.createElement('span');
        oldSpan.style.cssText = 'text-decoration:line-through; opacity:0.5; font-size:0.8rem; margin-right:6px; font-weight:normal;';
        oldSpan.textContent = formatPrice(oldPrice);
        el.appendChild(oldSpan);
        el.appendChild(document.createTextNode(formatPrice(discounted)));
      });
      pricesApplied = true;
    }

    function endPromo(bannerEl) {
      clearInterval(promoTimer);
      promoTimer = null;
      document.documentElement.classList.remove('has-promo');
      document.body.classList.remove('has-promo');
      if (bannerEl) bannerEl.classList.add('hidden');
      revertPrices();
    }

    async function checkPromo() {
      try {
        const res = await fetch(GAS_URL + '?action=promo_info');
        if (!res.ok) return;
        const data = await res.json();
        if (!(data.ok && data.promo && data.promo.active)) return;

        const promo = data.promo;
        let multiplier = 0.95;
        if (typeof promo.percent === 'number' && promo.percent > 0 && promo.percent < 100) {
          multiplier = 1 - promo.percent / 100;
        } else if (typeof promo.discount === 'number' && promo.discount > 0 && promo.discount < 1) {
          multiplier = 1 - promo.discount;
        } else if (typeof promo.multiplier === 'number' && promo.multiplier > 0 && promo.multiplier < 1) {
          multiplier = promo.multiplier;
        }

        document.documentElement.classList.add('has-promo');
        document.body.classList.add('has-promo');
        
        const bannerEl = document.getElementById('promo-banner');
        const promoMsgEl = document.getElementById('promo-msg');
        if (promoMsgEl) promoMsgEl.textContent = promo.message || '';
        if (bannerEl) bannerEl.classList.remove('hidden');

        const endTime = new Date(promo.end).getTime();
        if (isNaN(endTime)) return;
        const timerEl = document.getElementById('promo-timer');

        function updateTimer() {
          const diff = endTime - Date.now();
          if (diff <= 0) { endPromo(bannerEl); return; }
          const hours = Math.floor(diff / 3600000);
          const minutes = Math.floor((diff % 3600000) / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          const mm = String(minutes).padStart(2, '0');
          const ss = String(seconds).padStart(2, '0');
          if (timerEl) {
            timerEl.textContent = hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
            timerEl.classList.toggle('urgent', diff <= URGENT_THRESHOLD_MS);
          }
        }

        applyDiscountedPrices(multiplier);
        updateTimer();
        promoTimer = setInterval(updateTimer, 1000);
      } catch (err) {
        console.warn('Promo load error:', err);
      }
    }

    checkPromo();
  })();

  // ─── VIDEO STORY & BUBBLE INTEGRATION ────────────────────────────────────────
  (function() {
    const videoId = 'AQBbF4V4wRg';
    const dialog = document.getElementById('video-dialog');
    const closeBtn = document.getElementById('dialog-close-trigger');
    const videoContainer = document.getElementById('dialog-video-container');
    const visualTrigger = document.querySelector('.sec-story'); // Clicking story section launches it
    
    const bubbleContainer = document.getElementById('story-bubble-container');
    const bubbleTrigger = document.getElementById('story-bubble-trigger');
    const bubbleBadgeTrigger = document.getElementById('story-bubble-badge-trigger');
    const bubbleClose = document.getElementById('story-bubble-close-trigger');
    
    if (!dialog || !videoContainer) return;
    
    function openVideo() {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const autoplayParam = isMobile ? 'autoplay=0' : 'autoplay=1';
      
      videoContainer.innerHTML = `<iframe class="dialog-video-frame" ` +
        `src="https://www.youtube.com/embed/${videoId}?${autoplayParam}&playsinline=1&enablejsapi=1&rel=0" ` +
        `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
        `allowfullscreen></iframe>`;
      dialog.showModal();
    }
    
    function closeVideo() {
      dialog.close();
      videoContainer.innerHTML = '';
    }
    
    // Add visual play overlay on coaster for feedback
    const coasterEl = document.querySelector('.coaster');
    if (coasterEl) {
      coasterEl.style.cursor = 'pointer';
      coasterEl.addEventListener('click', openVideo);
    }
    
    if (bubbleTrigger) bubbleTrigger.addEventListener('click', openVideo);
    if (bubbleBadgeTrigger) bubbleBadgeTrigger.addEventListener('click', openVideo);
    if (closeBtn) closeBtn.addEventListener('click', closeVideo);
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeVideo();
    });
    
    dialog.addEventListener('close', () => {
      videoContainer.innerHTML = '';
    });
    
    if (bubbleContainer) {
      const isDismissed = localStorage.getItem('mitsu_story_dismissed');
      if (isDismissed !== 'true') {
        setTimeout(() => {
          bubbleContainer.classList.remove('hidden');
        }, 4000);
      }
      
      if (bubbleClose) {
        bubbleClose.addEventListener('click', (e) => {
          e.stopPropagation();
          bubbleContainer.classList.add('hidden');
          localStorage.setItem('mitsu_story_dismissed', 'true');
        });
      }
    }
  })();

})();
