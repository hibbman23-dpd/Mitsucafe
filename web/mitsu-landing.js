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
    const sku = btn.dataset.sku;
    let href = btn.getAttribute('href') || ORDER_URL_BASE;
    if (sku) {
      href = `index.html?utm_source=landing&sku=${sku}`;
    }
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
            <button class="mi" data-sku="${it.sku}" aria-label="Xem chi tiết ${it.name}">
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
    const bestSellerSKUs = ['DR003', 'DR004', 'DR005', 'DR010', 'DR012', 'DR015', 'DR020', 'BK001', 'BK002'];
    MENU.forEach(c => c.items.forEach((it, i) => {
      if (bestSellerSKUs.includes(it.sku)) {
        flat.push({ cat: c.id, k: c.k, i, ...it });
      }
    }));
    
    function renderGalleryGrid() {
      const isMobile = window.innerWidth <= 720;
      const perRow = isMobile ? 3 : 5;
      let rows = '', rIdx = 0;
      
      for (let x = 0; x < flat.length; x += perRow) {
        const cells = flat.slice(x, x + perRow).map(f => `
          <div class="ghex" data-sku="${f.sku}" role="button" tabindex="0" aria-label="${f.name}">
            <div class="hex">
              <div class="in">
                ${hexPhoto(f.k)}
              </div>
            </div>
            <div class="cap"><span class="n">${f.name}</span></div>
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
  let curCat = null, curItems = [], curIdx = 0, step = 0, radius = 0, lastCatIdx = {};

  function openCarousel(sku) {
    const allItems = [];
    MITSU_CATEGORIES.forEach(c => {
      const subItems = (typeof MENU_DATA !== 'undefined' ? MENU_DATA : []).filter(item => item.bee_group === c.id && item.available);
      subItems.sort((a,b) => a.sort_order - b.sort_order);
      subItems.forEach(it => {
        allItems.push({ catId: c.id, k: c.k, ...it });
      });
    });

    if (!allItems.length || !ring || !ov) return;

    curItems = allItems;
    const idx = allItems.findIndex(i => i.sku === sku);
    curIdx = idx !== -1 ? idx : 0;
    
    lastCatIdx = {};
    ['kin', 'ritsu', 'so', 'kashi'].forEach(c => {
      lastCatIdx[c] = curItems.findIndex(item => item.catId === c);
    });

    // Set active category romaji/label for footer deep links
    const cat = MENU.find(c => c.id === allItems[curIdx].catId);
    curCat = cat || { id: allItems[curIdx].catId, k: allItems[curIdx].k };
    
    step = 360 / curItems.length;
    radius = Math.round(130 / Math.tan(Math.PI / Math.max(curItems.length, 3))) + 60;

    ring.innerHTML = curItems.map((it, i) => `
      <div class="ccell" data-i="${i}" style="transform:rotateY(${i * step}deg) translateZ(${radius}px)">
        <div class="ccell-wrapper">
          <div class="hex">
            <div class="in">
              ${hexPhoto(it.k)}
              <div class="cap">
                <span class="n">${it.name}</span>
                <span class="p">${formatPrice(it.price_m)}</span>
              </div>
            </div>
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
      const isActive = (i === curIdx);
      const isPrev = (i === (curIdx - 1 + curItems.length) % curItems.length);
      const isNext = (i === (curIdx + 1 + curItems.length) % curItems.length);
      
      el.classList.toggle('active', isActive);
      
      if (isActive || isPrev || isNext) {
        el.style.opacity = isActive ? '1' : '0.38';
        el.style.visibility = 'visible';
        el.style.pointerEvents = 'auto';
      } else {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      }
    });
    
    const it = curItems[curIdx];
    const cat = MENU.find(c => c.id === it.catId);
    curCat = cat || { id: it.catId, k: it.k, romaji: it.catId };
    if (lastCatIdx) {
      lastCatIdx[it.catId] = curIdx;
    }
    detail.innerHTML = `
      <div class="dk jp">${curCat.k} · ${curCat.romaji}</div>
      <div class="dn">${it.name}</div>
      <div class="dp">${formatPrice(it.price_m)}</div>
      ${it.story ? `<div class="dd">${it.story}</div>` : ''}
      <button class="dadd btn-primary" data-sku="${it.sku}" style="margin-top: 20px; font-size: 0.88rem; padding: 10px 24px;">Đặt món này</button>
    `;
    
    const daddBtn = detail.querySelector('.dadd');
    if (daddBtn) {
      daddBtn.addEventListener('click', orderRipple);
    }
    
    detail.style.animation = 'none';
    void detail.offsetWidth;
    detail.style.animation = '';
  }

  function switchCarouselCategory(dir) {
    if (!curItems.length) return;
    const cats = ['kin', 'ritsu', 'so', 'kashi'];
    const curCatId = curItems[curIdx].catId;
    let catIdx = cats.indexOf(curCatId);
    if (catIdx === -1) return;

    let targetIdx = -1;
    for (let i = 1; i <= cats.length; i++) {
      const nextCatIdx = (catIdx + dir * i + cats.length * 2) % cats.length;
      const nextCatId = cats[nextCatIdx];
      const savedIdx = lastCatIdx[nextCatId];
      if (savedIdx !== undefined && savedIdx !== -1) {
        targetIdx = savedIdx;
        break;
      } else {
        const fallbackIdx = curItems.findIndex(item => item.catId === nextCatId);
        if (fallbackIdx !== -1) {
          targetIdx = fallbackIdx;
          break;
        }
      }
    }

    if (targetIdx === -1) return;

    if (!ring) return;

    const len = curItems.length;
    
    const idxA_center = curIdx;
    const idxA_left   = (curIdx - 1 + len) % len;
    const idxA_right  = (curIdx + 1 + len) % len;

    const idxB_center = targetIdx;
    const idxB_left   = (targetIdx - 1 + len) % len;
    const idxB_right  = (targetIdx + 1 + len) % len;

    const cellA_center = ring.children[idxA_center];
    const cellA_left   = ring.children[idxA_left];
    const cellA_right  = ring.children[idxA_right];

    const cellB_center = ring.children[idxB_center];
    const cellB_left   = ring.children[idxB_left];
    const cellB_right  = ring.children[idxB_right];

    if (!cellA_center || !cellB_center) return;

    const slideOutY = dir > 0 ? '-60vh' : '60vh';
    const slideInY  = dir > 0 ? '60vh' : '-60vh';

    const allTransitionCells = new Set([
      cellA_center, cellA_left, cellA_right,
      cellB_center, cellB_left, cellB_right
    ].filter(Boolean));

    allTransitionCells.forEach(cell => {
      cell.style.transition = 'none';
    });

    if (cellB_center) {
      cellB_center.style.transform = `rotateY(${idxA_center * step}deg) translateZ(${radius}px) translateY(${slideInY})`;
      cellB_center.style.opacity = '0';
      cellB_center.style.visibility = 'visible';
    }
    if (cellB_left && cellB_left !== cellB_center) {
      cellB_left.style.transform = `rotateY(${idxA_left * step}deg) translateZ(${radius}px) translateY(${slideInY})`;
      cellB_left.style.opacity = '0';
      cellB_left.style.visibility = 'visible';
    }
    if (cellB_right && cellB_right !== cellB_center && cellB_right !== cellB_left) {
      cellB_right.style.transform = `rotateY(${idxA_right * step}deg) translateZ(${radius}px) translateY(${slideInY})`;
      cellB_right.style.opacity = '0';
      cellB_right.style.visibility = 'visible';
    }

    if (detail) {
      detail.style.transition = 'opacity 0.25s ease';
      detail.style.opacity = '0';
    }

    void ring.offsetHeight;

    requestAnimationFrame(() => {
      allTransitionCells.forEach(cell => {
        cell.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease';
      });

      if (cellA_center) cellA_center.classList.remove('active');
      if (cellB_center) cellB_center.classList.add('active');

      if (cellA_center) {
        cellA_center.style.transform = `rotateY(${idxA_center * step}deg) translateZ(${radius}px) translateY(${slideOutY})`;
        cellA_center.style.opacity = '0';
      }
      if (cellA_left && cellA_left !== cellA_center) {
        cellA_left.style.transform = `rotateY(${idxA_left * step}deg) translateZ(${radius}px) translateY(${slideOutY})`;
        cellA_left.style.opacity = '0';
      }
      if (cellA_right && cellA_right !== cellA_center && cellA_right !== cellA_left) {
        cellA_right.style.transform = `rotateY(${idxA_right * step}deg) translateZ(${radius}px) translateY(${slideOutY})`;
        cellA_right.style.opacity = '0';
      }

      if (cellB_center) {
        cellB_center.style.transform = `rotateY(${idxA_center * step}deg) translateZ(${radius}px) translateY(0)`;
        cellB_center.style.opacity = '1';
      }
      if (cellB_left && cellB_left !== cellB_center) {
        cellB_left.style.transform = `rotateY(${idxA_left * step}deg) translateZ(${radius}px) translateY(0)`;
        cellB_left.style.opacity = '0.38';
      }
      if (cellB_right && cellB_right !== cellB_center && cellB_right !== cellB_left) {
        cellB_right.style.transform = `rotateY(${idxA_right * step}deg) translateZ(${radius}px) translateY(0)`;
        cellB_right.style.opacity = '0.38';
      }
    });

    setTimeout(() => {
      curIdx = targetIdx;
      
      const it = curItems[curIdx];
      const cat = MENU.find(c => c.id === it.catId);
      curCat = cat || { id: it.catId, k: it.k, romaji: it.catId };
      if (lastCatIdx) {
        lastCatIdx[it.catId] = curIdx;
      }

      // Snap main ring horizontal angle
      ring.style.transition = 'none';
      ring.style.transform = `translateZ(-${radius}px) rotateY(${-curIdx * step}deg)`;
      void ring.offsetHeight;
      ring.style.transition = '';

      // Revert all cells back to default horizontal rotation transforms
      [...ring.children].forEach((cell, i) => {
        cell.style.transition = 'none';
        cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
        cell.style.opacity = '';
        cell.style.visibility = '';
        void cell.offsetHeight;
        cell.style.transition = '';
      });

      updateCarousel();

      if (detail) {
        detail.style.opacity = '1';
      }
    }, 500);
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
    
    let isDragging = false;
    let isDraggingVertically = false;
    let dragStartX = 0;
    let dragStartY = 0;

    let cellsA = []; // Current category cells
    let cellsB = []; // Next category cells
    let cellsC = []; // Prev category cells
    let idxA = [];
    let idxB = [];
    let idxC = [];
    let initialReady = false;
    let targetIdxNext = -1;
    let targetIdxPrev = -1;
    const maxDragDist = 250;

    function prepareVerticalDragTargets() {
      if (!curItems.length || !ring) return;
      const cats = ['kin', 'ritsu', 'so', 'kashi'];
      const getCatId = (item) => item.catId || item.bee_group;
      const curCatId = getCatId(curItems[curIdx]);
      let catIdx = cats.indexOf(curCatId);
      if (catIdx === -1) return;

      const len = curItems.length;

      // Current cells (A)
      const idxA_center = curIdx;
      const idxA_left   = (curIdx - 1 + len) % len;
      const idxA_right  = (curIdx + 1 + len) % len;
      idxA = [idxA_center, idxA_left, idxA_right];
      cellsA = idxA.map(i => ring.children[i]);

      // Next category (B) - when dragging up
      let nextCatId = '';
      targetIdxNext = -1;
      for (let i = 1; i <= cats.length; i++) {
        const nextCatIdx = (catIdx + i) % cats.length;
        const cid = cats[nextCatIdx];
        const savedIdx = lastCatIdx[cid];
        if (savedIdx !== undefined && savedIdx !== -1) {
          targetIdxNext = savedIdx;
          nextCatId = cid;
          break;
        } else {
          const fallbackIdx = curItems.findIndex(item => getCatId(item) === cid);
          if (fallbackIdx !== -1) {
            targetIdxNext = fallbackIdx;
            nextCatId = cid;
            break;
          }
        }
      }

      if (targetIdxNext !== -1) {
        const idxB_center = targetIdxNext;
        const idxB_left   = (targetIdxNext - 1 + len) % len;
        const idxB_right  = (targetIdxNext + 1 + len) % len;
        idxB = [idxB_center, idxB_left, idxB_right];
        cellsB = idxB.map(i => ring.children[i]);
      } else {
        cellsB = [];
      }

      // Prev category (C) - when dragging down
      let prevCatId = '';
      targetIdxPrev = -1;
      for (let i = 1; i <= cats.length; i++) {
        const prevCatIdx = (catIdx - i + cats.length) % cats.length;
        const cid = cats[prevCatIdx];
        const savedIdx = lastCatIdx[cid];
        if (savedIdx !== undefined && savedIdx !== -1) {
          targetIdxPrev = savedIdx;
          prevCatId = cid;
          break;
        } else {
          const fallbackIdx = curItems.findIndex(item => getCatId(item) === cid);
          if (fallbackIdx !== -1) {
            targetIdxPrev = fallbackIdx;
            prevCatId = cid;
            break;
          }
        }
      }

      if (targetIdxPrev !== -1) {
        const idxC_center = targetIdxPrev;
        const idxC_left   = (targetIdxPrev - 1 + len) % len;
        const idxC_right  = (targetIdxPrev + 1 + len) % len;
        idxC = [idxC_center, idxC_left, idxC_right];
        cellsC = idxC.map(i => ring.children[i]);
      } else {
        cellsC = [];
      }

      const allTransitionCells = new Set([...cellsA, ...cellsB, ...cellsC].filter(Boolean));
      allTransitionCells.forEach(cell => {
        cell.style.transition = 'none';
      });

      initialReady = true;
    }

    function handleDragStart(clientX, clientY) {
      isDragging = true;
      isDraggingVertically = false;
      dragStartX = clientX;
      dragStartY = clientY;
      initialReady = false;
    }

    function handleDragMove(clientX, clientY) {
      if (!isDragging) return;
      const diffX = clientX - dragStartX;
      const diffY = clientY - dragStartY;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (!isDraggingVertically) {
        if (absY > 8 && absY > absX) {
          isDraggingVertically = true;
          prepareVerticalDragTargets();
        }
      }

      if (isDraggingVertically && initialReady) {
        let ratio = diffY / maxDragDist;
        if (ratio < -1) ratio = -1;
        if (ratio > 1) ratio = 1;

        const detail = document.getElementById('detail');
        if (detail) {
          detail.style.transition = 'none';
          detail.style.opacity = Math.max(0, 1 - Math.abs(ratio) * 2);
        }

        if (ratio < 0) {
          // Dragging up (next category B moves in from below)
          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[0].style.opacity = 1 + ratio;
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[1].style.opacity = 0.38 * (1 + ratio);
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[2].style.opacity = 0.38 * (1 + ratio);
          }

          if (cellsB[0]) {
            cellsB[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(${(1 + ratio) * 60}vh)`;
            cellsB[0].style.opacity = -ratio;
            cellsB[0].style.visibility = 'visible';
          }
          if (cellsB[1] && cellsB[1] !== cellsB[0]) {
            cellsB[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(${(1 + ratio) * 60}vh)`;
            cellsB[1].style.opacity = 0.38 * -ratio;
            cellsB[1].style.visibility = 'visible';
          }
          if (cellsB[2] && cellsB[2] !== cellsB[0] && cellsB[2] !== cellsB[1]) {
            cellsB[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(${(1 + ratio) * 60}vh)`;
            cellsB[2].style.opacity = 0.38 * -ratio;
            cellsB[2].style.visibility = 'visible';
          }

          cellsC.forEach(cell => {
            if (cell && !cellsA.includes(cell) && !cellsB.includes(cell)) {
              cell.style.opacity = '0';
              cell.style.visibility = 'hidden';
            }
          });
        } else {
          // Dragging down (prev category C moves in from above)
          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[0].style.opacity = 1 - ratio;
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[1].style.opacity = 0.38 * (1 - ratio);
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(${ratio * 60}vh)`;
            cellsA[2].style.opacity = 0.38 * (1 - ratio);
          }

          if (cellsC[0]) {
            cellsC[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(${(-1 + ratio) * 60}vh)`;
            cellsC[0].style.opacity = ratio;
            cellsC[0].style.visibility = 'visible';
          }
          if (cellsC[1] && cellsC[1] !== cellsC[0]) {
            cellsC[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(${(-1 + ratio) * 60}vh)`;
            cellsC[1].style.opacity = 0.38 * ratio;
            cellsC[1].style.visibility = 'visible';
          }
          if (cellsC[2] && cellsC[2] !== cellsC[0] && cellsC[2] !== cellsC[1]) {
            cellsC[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(${(-1 + ratio) * 60}vh)`;
            cellsC[2].style.opacity = 0.38 * ratio;
            cellsC[2].style.visibility = 'visible';
          }

          cellsB.forEach(cell => {
            if (cell && !cellsA.includes(cell) && !cellsC.includes(cell)) {
              cell.style.opacity = '0';
              cell.style.visibility = 'hidden';
            }
          });
        }
      }
    }

    function handleDragEnd(clientX, clientY) {
      if (!isDragging) return;
      const wasDraggingVertically = isDraggingVertically;
      const diffX = clientX - dragStartX;
      const diffY = clientY - dragStartY;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      isDragging = false;
      isDraggingVertically = false;

      if (wasDraggingVertically && initialReady) {
        const detail = document.getElementById('detail');
        const getCatId = (item) => item.catId || item.bee_group;
        if (diffY < -60 && targetIdxNext !== -1) {
          const allTransitionCells = new Set([...cellsA, ...cellsB].filter(Boolean));
          allTransitionCells.forEach(cell => {
            cell.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
          });
          void ring.offsetHeight;

          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(-60vh)`;
            cellsA[0].style.opacity = '0';
            cellsA[0].classList.remove('active');
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(-60vh)`;
            cellsA[1].style.opacity = '0';
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(-60vh)`;
            cellsA[2].style.opacity = '0';
          }

          if (cellsB[0]) {
            cellsB[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsB[0].style.opacity = '1';
            cellsB[0].classList.add('active');
          }
          if (cellsB[1] && cellsB[1] !== cellsB[0]) {
            cellsB[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsB[1].style.opacity = '0.38';
          }
          if (cellsB[2] && cellsB[2] !== cellsB[0] && cellsB[2] !== cellsB[1]) {
            cellsB[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsB[2].style.opacity = '0.38';
          }

          setTimeout(() => {
            curIdx = targetIdxNext;
            const it = curItems[curIdx];
            const cat = MENU.find(c => c.id === getCatId(it));
            curCat = cat || { id: getCatId(it), k: it.k, romaji: getCatId(it) };
            if (lastCatIdx) lastCatIdx[getCatId(it)] = curIdx;

            ring.style.transition = 'none';
            ring.style.transform = `translateZ(-${radius}px) rotateY(${-curIdx * step}deg)`;
            void ring.offsetHeight;
            ring.style.transition = '';

            [...ring.children].forEach((cell, i) => {
              cell.style.transition = 'none';
              cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
              cell.style.opacity = '';
              cell.style.visibility = '';
            });

            updateCarousel();
            if (detail) {
              detail.style.transition = 'opacity 0.25s ease';
              detail.style.opacity = '1';
            }
          }, 300);
        } else if (diffY > 60 && targetIdxPrev !== -1) {
          const allTransitionCells = new Set([...cellsA, ...cellsC].filter(Boolean));
          allTransitionCells.forEach(cell => {
            cell.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
          });
          void ring.offsetHeight;

          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(60vh)`;
            cellsA[0].style.opacity = '0';
            cellsA[0].classList.remove('active');
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(60vh)`;
            cellsA[1].style.opacity = '0';
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(60vh)`;
            cellsA[2].style.opacity = '0';
          }

          if (cellsC[0]) {
            cellsC[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsC[0].style.opacity = '1';
            cellsC[0].classList.add('active');
          }
          if (cellsC[1] && cellsC[1] !== cellsC[0]) {
            cellsC[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsC[1].style.opacity = '0.38';
          }
          if (cellsC[2] && cellsC[2] !== cellsC[0] && cellsC[2] !== cellsC[1]) {
            cellsC[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsC[2].style.opacity = '0.38';
          }

          setTimeout(() => {
            curIdx = targetIdxPrev;
            const it = curItems[curIdx];
            const cat = MENU.find(c => c.id === getCatId(it));
            curCat = cat || { id: getCatId(it), k: it.k, romaji: getCatId(it) };
            if (lastCatIdx) lastCatIdx[getCatId(it)] = curIdx;

            ring.style.transition = 'none';
            ring.style.transform = `translateZ(-${radius}px) rotateY(${-curIdx * step}deg)`;
            void ring.offsetHeight;
            ring.style.transition = '';

            [...ring.children].forEach((cell, i) => {
              cell.style.transition = 'none';
              cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
              cell.style.opacity = '';
              cell.style.visibility = '';
            });

            updateCarousel();
            if (detail) {
              detail.style.transition = 'opacity 0.25s ease';
              detail.style.opacity = '1';
            }
          }, 300);
        } else {
          const allTransitionCells = new Set([...cellsA, ...cellsB, ...cellsC].filter(Boolean));
          allTransitionCells.forEach(cell => {
            cell.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
          });
          void ring.offsetHeight;

          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[0].style.opacity = '1';
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[1].style.opacity = '0.38';
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[2].style.opacity = '0.38';
          }

          cellsB.forEach((cell, i) => {
            if (cell) {
              cell.style.transform = `rotateY(${idxA[i] * step}deg) translateZ(${radius}px) translateY(60vh)`;
              cell.style.opacity = '0';
            }
          });

          cellsC.forEach((cell, i) => {
            if (cell) {
              cell.style.transform = `rotateY(${idxA[i] * step}deg) translateZ(${radius}px) translateY(-60vh)`;
              cell.style.opacity = '0';
            }
          });

          if (detail) {
            detail.style.transition = 'opacity 0.3s ease';
            detail.style.opacity = '1';
          }

          setTimeout(() => {
            [...ring.children].forEach((cell, i) => {
              cell.style.transition = 'none';
              cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
              cell.style.opacity = '';
              cell.style.visibility = '';
            });
            updateCarousel();
          }, 300);
        }
      } else {
        if (Math.max(absX, absY) > 50) {
          if (absX > absY) {
            if (diffX > 0) moveCarousel(-1); else moveCarousel(1);
          }
        }
      }
    }

    ov.addEventListener('touchstart', (e) => {
      if (e.target.closest('#detail')) return;
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    ov.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      if (e.target.closest('#detail')) return;
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    ov.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      if (e.target.closest('#detail')) return;
      const touch = e.changedTouches[0];
      handleDragEnd(touch.clientX, touch.clientY);
    }, { passive: true });

    ov.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('#detail')) return;
      handleDragStart(e.clientX, e.clientY);
    });

    ov.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      if (e.target.closest('#detail')) return;
      handleDragMove(e.clientX, e.clientY);
    });

    ov.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      if (e.target.closest('#detail')) return;
      handleDragEnd(e.clientX, e.clientY);
    });

    ov.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        if (isDraggingVertically && initialReady) {
          const detail = document.getElementById('detail');
          const allTransitionCells = new Set([...cellsA, ...cellsB, ...cellsC].filter(Boolean));
          allTransitionCells.forEach(cell => {
            cell.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
          });
          void ring.offsetHeight;

          if (cellsA[0]) {
            cellsA[0].style.transform = `rotateY(${idxA[0] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[0].style.opacity = '1';
          }
          if (cellsA[1] && cellsA[1] !== cellsA[0]) {
            cellsA[1].style.transform = `rotateY(${idxA[1] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[1].style.opacity = '0.38';
          }
          if (cellsA[2] && cellsA[2] !== cellsA[0] && cellsA[2] !== cellsA[1]) {
            cellsA[2].style.transform = `rotateY(${idxA[2] * step}deg) translateZ(${radius}px) translateY(0)`;
            cellsA[2].style.opacity = '0.38';
          }

          cellsB.forEach((cell, i) => {
            if (cell) {
              cell.style.transform = `rotateY(${idxA[i] * step}deg) translateZ(${radius}px) translateY(60vh)`;
              cell.style.opacity = '0';
            }
          });

          cellsC.forEach((cell, i) => {
            if (cell) {
              cell.style.transform = `rotateY(${idxA[i] * step}deg) translateZ(${radius}px) translateY(-60vh)`;
              cell.style.opacity = '0';
            }
          });

          if (detail) {
            detail.style.transition = 'opacity 0.3s ease';
            detail.style.opacity = '1';
          }

          setTimeout(() => {
            [...ring.children].forEach((cell, i) => {
              cell.style.transition = 'none';
              cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
              cell.style.opacity = '';
              cell.style.visibility = '';
            });
            updateCarousel();
          }, 300);
        }
        isDraggingVertically = false;
      }
    });

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

  // Trigger carousel from menu or honeycomb clicks
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.ghex') || e.target.closest('.mi');
    if (t) {
      const sku = t.dataset.sku;
      if (sku) openCarousel(sku);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target.closest('.ghex') || e.target.closest('.mi');
      if (t) {
        const sku = t.dataset.sku;
        if (sku) {
          e.preventDefault();
          openCarousel(sku);
        }
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
    
    // Add click listeners to film cards to open the video
    document.querySelectorAll('.film-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', openVideo);
    });
    
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

  function updateHeaderCart() {
    const badge = document.getElementById('header-cart-count');
    const wrapper = document.getElementById('header-cart-wrapper');
    if (!badge || !wrapper) return;
    try {
      const cart = JSON.parse(localStorage.getItem('lhk_cart') || '[]');
      const count = cart.reduce((s, i) => s + (i.qty || 0), 0);
      badge.textContent = count;
      if (count > 0) {
        wrapper.classList.add('has-items');
      } else {
        wrapper.classList.remove('has-items');
      }
    } catch (e) {
      badge.textContent = '0';
      wrapper.classList.remove('has-items');
    }
  }
  function toggleCartPopup(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    let pop = document.getElementById('cart-popup');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'cart-popup';
      pop.className = 'cart-pop';
      document.body.appendChild(pop);
    }

    if (pop.classList.contains('show')) {
      pop.classList.remove('show');
    } else {
      renderCartPopupContent(pop);
      pop.classList.add('show');
      const closePop = (ev) => {
        if (!pop.contains(ev.target) && !ev.target.closest('#header-cart-wrapper')) {
          pop.classList.remove('show');
          document.removeEventListener('click', closePop);
        }
      };
      document.addEventListener('click', closePop);
    }
  }

  function renderCartPopupContent(pop) {
    let cartItems = [];
    try {
      cartItems = JSON.parse(localStorage.getItem('lhk_cart') || '[]');
    } catch (e) {
      cartItems = [];
    }

    const formatFn = (p) => p ? `${Math.round(p / 1000)}k` : '0k';
    const total = cartItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    if (cartItems.length === 0) {
      pop.innerHTML = `
        <div class="cart-pop-header">Giỏ hàng của bạn</div>
        <div style="padding: 20px 0; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          Giỏ trống ☕
        </div>
      `;
      return;
    }

    const listHtml = cartItems.map(ci => {
      const item = typeof MENU_DATA !== 'undefined' ? MENU_DATA.find(m => m.sku === ci.sku) : null;
      const group = item ? item.bee_group : 'kin';
      const hanko = (group === 'kin' ? '勤' : group === 'ritsu' ? '律' : group === 'so' ? '創' : group === 'kashi' ? '菓' : '蜜');
      
      let modsStr = '';
      if (ci.modifiers) {
        const parts = [];
        if (ci.modifiers.size) parts.push(ci.modifiers.size);
        if (ci.modifiers.sugar) parts.push(`Đường: ${ci.modifiers.sugar}`);
        if (ci.modifiers.ice) parts.push(`Đá: ${ci.modifiers.ice}`);
        if (ci.modifiers.toppings) parts.push(ci.modifiers.toppings);
        modsStr = parts.join(', ');
      }

      return `
        <div class="cart-pop-item">
          <div class="cart-pop-thumb">
            <div class="hex">
              <div class="in" style="inset: 1.5px;">
                <div class="photo" data-k="${hanko}"></div>
              </div>
            </div>
          </div>
          <div class="cart-pop-info">
            <div class="cart-pop-name">${ci.name}</div>
            <div class="cart-pop-details">${ci.qty} × ${formatFn(ci.price)}${modsStr ? ` | <span style="font-size: 0.68rem; opacity: 0.7;">${modsStr}</span>` : ''}</div>
          </div>
          <div class="cart-pop-subtotal">${formatFn(ci.subtotal)}</div>
        </div>
      `;
    }).join('');

    pop.innerHTML = `
      <div class="cart-pop-header">Giỏ hàng của bạn</div>
      <div class="cart-pop-list">
        ${listHtml}
      </div>
      <div class="cart-pop-footer">
        <div class="cart-pop-total-lbl">Tổng cộng:</div>
        <div class="cart-pop-total-val">${formatFn(total)}</div>
      </div>
      <a href="index.html?sheet=cart" class="btn-primary cart-pop-action" style="text-decoration: none; border-radius: 6px; display: block; font-weight: 500;">
        Xem giỏ hàng & Thanh toán
      </a>
    `;
  }

  document.addEventListener('DOMContentLoaded', updateHeaderCart);
  window.addEventListener('pageshow', updateHeaderCart);
  updateHeaderCart();

  const cartWrapper = document.getElementById('header-cart-wrapper');
  if (cartWrapper) {
    cartWrapper.addEventListener('click', toggleCartPopup);
  }

})();
