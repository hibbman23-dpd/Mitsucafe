  // ── App-wide constants ──
  const APP_VERSION = '20260522';
  const ORDER_URL_BASE = 'index.html?utm_source=landing';
  const withVersion = (url) => url + (url.includes('?') ? '&' : '?') + 'v=' + APP_VERSION;

  // ── Single combined scroll handler (nav + hero parallax) ──
  const nav = document.getElementById('nav');
  const heroSun = document.querySelector('.hero-sun');
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 50);
    if (heroSun && y < innerHeight) heroSun.style.transform = `translateY(${y * .14}px)`;
  }, {passive: true});

  // ── Scroll reveal ──
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('up'); });
  }, {threshold: .12, rootMargin: '0px 0px -36px 0px'});
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // ── Ripple chuyển trang (nút Đặt ngay) ──
  let isNavigating = false;
  function orderRipple(e) {
    const btn = e.currentTarget;
    const href = btn.getAttribute('href');
    if (!href || href === '#') return;
    e.preventDefault();
    if (isNavigating) return;
    isNavigating = true;

    // Lớp 1: ink trắng trong nút
    const ink = document.createElement('span');
    ink.className = 'order-ink';
    const r = btn.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 2.4;
    ink.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;
    btn.appendChild(ink);

    // Lớp 2: sóng teal phủ toàn màn hình
    const cx = e.clientX, cy = e.clientY;
    const maxR = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(innerWidth - cx, cy),
      Math.hypot(cx, innerHeight - cy),
      Math.hypot(innerWidth - cx, innerHeight - cy)
    ) + 10;
    const d = maxR * 2;
    const wave = document.createElement('div');
    wave.className = 'order-wave';
    wave.style.cssText = `width:${d}px;height:${d}px;left:${cx-d/2}px;top:${cy-d/2}px`;
    document.body.appendChild(wave);

    // Trigger expand sau 1 frame (cần timeout để CSS transition kích hoạt)
    requestAnimationFrame(() => requestAnimationFrame(() => wave.classList.add('open')));

    // Chuyển trang sau khi sóng phủ đầy
    setTimeout(() => { location.href = withVersion(href); }, 640);
  }

  // Gắn cho cả btn-primary lẫn nav order buttons
  document.querySelectorAll('.btn-primary, .nav-cta, .nav-order-btn').forEach(btn => {
    if (btn.getAttribute('href')?.includes('index.html')) {
      btn.addEventListener('click', orderRipple);
    }
  });

  // ── Menu cards → order page ──
  document.querySelectorAll('.menu-card').forEach(card => {
    card.style.cursor = 'pointer';
    // A11y: cho phép focus + kích hoạt bằng bàn phím / trình đọc màn hình
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    const nameEl = card.querySelector('.mc-en');
    card.setAttribute('aria-label', (nameEl ? nameEl.textContent.trim() + ' — ' : '') + 'Đặt ngay');
    const goOrder = () => {
      if (isNavigating) return;
      isNavigating = true;
      location.href = withVersion(ORDER_URL_BASE);
    };
    card.addEventListener('click', goOrder);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goOrder(); }
    });
  });

  // ── Sticker click bounce ──
  document.querySelectorAll('.circular-stk-item').forEach(s => {
    s.addEventListener('click', () => {
      const b = s.querySelector('.stk-badge');
      if (b) {
        b.style.transition = 'transform .1s cubic-bezier(0.25, 1, 0.5, 1)';
        b.style.transform = 'scale(.94)';
        setTimeout(() => { b.style.transform = ''; }, 110);
      }
    });
  });

  // ── Circular stickers layout arrangement ──
  function arrangeStickers() {
    const container = document.querySelector('.circular-stickers-container');
    if (!container) return;
    
    const isMobile = window.innerWidth <= 600;
    
    // Choose radius based on screen size
    const radius = isMobile ? 125 : 230; 
    
    // Fallback dimensions if container width/height not fully computed yet
    const rect = container.getBoundingClientRect();
    const width = rect.width || (isMobile ? 370 : 750);
    const height = rect.height || (isMobile ? 380 : 640);
    
    const items = document.querySelectorAll('.circular-stk-item');
    const baseAngle = -Math.PI / 2;
    const angleStep = Math.PI / 3;
    
    items.forEach((item, index) => {
      const angle = baseAngle + index * angleStep;
      // Position using percentages centered around the container's 50% midpoint
      const xPct = 50 + (Math.cos(angle) * radius / width) * 100;
      const yPct = 50 + (Math.sin(angle) * radius / height) * 100;
      
      item.style.left = `${xPct}%`;
      item.style.top = `${yPct}%`;
    });
  }
  
  arrangeStickers();
  window.addEventListener('resize', arrangeStickers);

  // ── 2D Mascot Interaction (SVG & Pointer Events) ──
  function initMascotInteraction() {
    const wrapper = document.querySelector('.center-mascot-animation-wrapper');
    if (!wrapper) return;

    // Track active pointer state
    let isPressed = false;

    // Toggle offering class based on hover or touch actions
    wrapper.addEventListener('pointerenter', (e) => {
      // Only hover on mouse/pen devices
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        wrapper.classList.add('offering');
      }
    });

    wrapper.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        // If we are currently pressing down, don't remove offering until pointerup
        if (!isPressed) {
          wrapper.classList.remove('offering');
        }
      }
    });

    wrapper.addEventListener('pointerdown', (e) => {
      isPressed = true;
      wrapper.classList.add('offering');
    });

    const releaseOffering = () => {
      isPressed = false;
      wrapper.classList.remove('offering');
    };

    window.addEventListener('pointerup', releaseOffering);
    window.addEventListener('pointercancel', releaseOffering);
  }

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMascotInteraction);
  } else {
    initMascotInteraction();
  }

  // ── Footer disclosure toggles (Contact + Hours) ──
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
        toggle.style.color = 'var(--coral)';
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  }
  bindToggle('contact-toggle', 'contact-details');
  bindToggle('hours-toggle', 'hours-details');

  // ── Promotion System ──
  (function() {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec';
    const URGENT_THRESHOLD_MS = 10 * 60 * 1000;
    let promoTimer = null;
    let pricesApplied = false;

    function formatVnd(n) { return n.toLocaleString('vi-VN') + 'đ'; }

    function revertPrices() {
      document.querySelectorAll('.mc-price').forEach(el => {
        if (el.dataset.originalPrice) {
          el.textContent = formatVnd(parseInt(el.dataset.originalPrice, 10));
        }
      });
      pricesApplied = false;
    }

    function applyDiscountedPrices(multiplier) {
      if (pricesApplied) return; // idempotency guard
      document.querySelectorAll('.mc-price').forEach(el => {
        const raw = el.textContent.replace(/\D/g, '');
        const parsed = parseInt(raw, 10);
        if (isNaN(parsed)) return;
        if (!el.dataset.originalPrice) el.dataset.originalPrice = String(parsed);
        const oldPrice = parseInt(el.dataset.originalPrice, 10);
        const discounted = Math.round(oldPrice * multiplier);
        // Build via DOM to keep CSP clean and avoid innerHTML injection surface
        el.textContent = '';
        const oldSpan = document.createElement('span');
        oldSpan.className = 'price-old';
        oldSpan.style.cssText = 'text-decoration:line-through;opacity:.6;font-size:.8rem;margin-right:6px;font-weight:normal;color:rgba(245,240,232,.6);';
        oldSpan.textContent = formatVnd(oldPrice);
        el.appendChild(oldSpan);
        el.appendChild(document.createTextNode(formatVnd(discounted)));
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
        // Resolve discount: prefer server value, fall back to 5% only if missing/invalid.
        // Server schema sends `percent` (integer, e.g. 5 = 5% off). Also accept
        // `discount` (fraction 0..1) or `multiplier` (0..1) for forward-compat.
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
        document.getElementById('promo-msg').textContent = promo.message || '';
        const bannerEl = document.getElementById('promo-banner');
        bannerEl.classList.remove('hidden');

        const endTime = new Date(promo.end).getTime();
        if (isNaN(endTime)) { console.warn('Promo end date không hợp lệ:', promo.end); return; }
        const timerEl = document.getElementById('promo-timer');

        function updateTimer() {
          const diff = endTime - Date.now();
          if (diff <= 0) { endPromo(bannerEl); return; }
          const hours = Math.floor(diff / 3600000);
          const minutes = Math.floor((diff % 3600000) / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          const mm = String(minutes).padStart(2, '0');
          const ss = String(seconds).padStart(2, '0');
          timerEl.textContent = hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
          timerEl.classList.toggle('urgent', diff <= URGENT_THRESHOLD_MS);
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

  // ── Reset bfcache: dọn wave TRƯỚC khi trang bị đóng băng ──
  // pagehide fires trước khi freeze → trang được lưu vào bfcache ở trạng thái sạch
  // pageshow là lớp dự phòng cho trường hợp pagehide không đủ
  function resetNavState() {
    isNavigating = false;
    document.querySelectorAll('.order-wave, .order-ink').forEach(el => el.remove());
  }
  window.addEventListener('pagehide', resetNavState);
  window.addEventListener('pageshow', (e) => { if (e.persisted) resetNavState(); });

  // ── Video Story Integration (Modal & Floating Bubble) ──
  (function() {
    const videoId = 'AQBbF4V4wRg';
    const dialog = document.getElementById('video-dialog');
    const closeBtn = document.getElementById('dialog-close-trigger');
    const videoContainer = document.getElementById('dialog-video-container');
    const visualTrigger = document.getElementById('story-visual-trigger');
    
    const bubbleContainer = document.getElementById('story-bubble-container');
    const bubbleTrigger = document.getElementById('story-bubble-trigger');
    const bubbleBadgeTrigger = document.getElementById('story-bubble-badge-trigger');
    const bubbleClose = document.getElementById('story-bubble-close-trigger');
    
    if (!dialog || !videoContainer) return;
    
    function openVideo() {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const autoplayParam = isMobile ? 'autoplay=0' : 'autoplay=1';
      
      videoContainer.innerHTML = '<iframe class="dialog-video-frame" ' +
        'src="https://www.youtube.com/embed/' + videoId + '?' + autoplayParam + '&playsinline=1&enablejsapi=1&rel=0" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
        'allowfullscreen></iframe>';
      dialog.showModal();
    }
    
    function closeVideo() {
      dialog.close();
      videoContainer.innerHTML = '';
    }
    
    if (visualTrigger) {
      visualTrigger.addEventListener('click', openVideo);
      visualTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openVideo();
        }
      });
    }
    
    if (bubbleTrigger) {
      bubbleTrigger.addEventListener('click', openVideo);
    }
    
    if (bubbleBadgeTrigger) {
      bubbleBadgeTrigger.addEventListener('click', openVideo);
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', closeVideo);
    }
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeVideo();
      }
    });
    
    dialog.addEventListener('close', () => {
      videoContainer.innerHTML = '';
    });
    
    if (bubbleContainer) {
      const isDismissed = localStorage.getItem('kaeru_story_dismissed');
      if (isDismissed !== 'true') {
        setTimeout(() => {
          bubbleContainer.classList.remove('hidden');
        }, 3000);
      }
      
      if (bubbleClose) {
        bubbleClose.addEventListener('click', (e) => {
          e.stopPropagation();
          bubbleContainer.classList.add('hidden');
          localStorage.setItem('kaeru_story_dismissed', 'true');
        });
      }
    }
  })();

// ── Dynamic Google Fonts Loading (CSP Friendly) ──
(function() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;700&family=IM+Fell+English+SC&family=Lora:ital,wght@0,400;0,600;1,400&display=swap';
  document.head.appendChild(link);
})();
