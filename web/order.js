'use strict';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;'
}[c]));

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec';

const BANK_QR = {
  bank: 'VCB',
  acct: '9975087429',
  name: 'DUONG PHUONG MINH',
};

// VietQR động: amount + addInfo → app ngân hàng tự điền số tiền + nội dung CK
function buildVietQRUrl(amount, addInfo) {
  const params = new URLSearchParams({
    amount:      String(amount || 0),
    addInfo:     String(addInfo || ''),
    accountName: BANK_QR.name,
  });
  return `https://img.vietqr.io/image/${BANK_QR.bank}-${BANK_QR.acct}-compact2.png?${params}`;
}

const ICE_LABEL   = { full: 'Nhiều đá', less: 'Ít đá', none: 'Không đá', blended: 'Xay' };
const SUGAR_LABEL = { '0%':'Không ngọt','30%':'Ít ngọt','50%':'Vừa','70%':'Ngọt','100%':'Rất ngọt' };
// Badge text + CSS class theo role
const ROLE_BADGE = {
  hero:      { text: '⭐ Nên thử',   cls: 'role-badge-hero'      },
  signature: { text: '✦ Đặc biệt',  cls: 'role-badge-signature' },
  seasonal:  { text: '🌿 Theo mùa', cls: 'role-badge-seasonal'  },
  trend:     { text: '🔥 Hot',       cls: 'role-badge-trend'     },
};

// Emoji theo category khi không có image
const CAT_EMOJI = {
  phin_coffee:    '☕', machine_coffee: '🫗',
  milk_tea:       '🧋', fruit_tea:      '🍑',
  blended:        '🧊', kissaten:       '🍵',
  pastry:         '🥐',
};

const MITSU_CATEGORIES = [
  { id: 'all', label: 'Tất cả', emoji: '蜜' },
  { id: 'kin', label: 'Chăm chỉ', emoji: '勤' },
  { id: 'ritsu', label: 'Kỷ luật', emoji: '律' },
  { id: 'so', label: 'Sáng tạo', emoji: '創' },
  { id: 'kashi', label: 'Ăn kèm', emoji: '菓' }
];

const BEE_GROUP_EMOJI = {
  kin: '勤',
  ritsu: '律',
  so: '創',
  kashi: '菓'
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let screen       = 'menu';    // menu | checkout | success
let sheet        = null;      // null | 'item' | 'cart' | 'upsell'
let activeCat    = 'all';
let activeMenuMode = 'list';   // list | grid
let curCat       = null;
let curItems     = [];
let curIdx       = 0;
let step         = 0;
let radius       = 0;
let lastCatIdx   = {};
let lastActiveCat = 'all';
let lastScreen    = 'menu';
let selItem      = null;      // MENU_DATA row đang xem
let selOpts      = {};        // {size, sugar, ice, qty, toppings:[]}
let carouselState = 'detail';  // 'detail' | 'options'
let tableId      = '';        // từ URL ?t=03 → TABLE_03
let cart         = loadCart();
let lastOrder    = { shortCode: '', total: 0, delivery: 'pickup' };
let submitting   = false;
// Idempotency: giữ key + short_code ổn định qua các lần retry (mạng yếu) để GAS không tạo đơn trùng.
// Sinh 1 lần cho mỗi lần đặt; xoá khi đặt thành công hoặc khi vào lại checkout mới.
let pendingSubmit = null;     // { idempotencyKey, shortCode }
let deliveryMode = 'pickup';  // 'pickup' | 'delivery'
let paymentMethod = 'bank_transfer'; // 'bank_transfer' | 'cash'

let activePromo  = null;      // {active, percent, start, end, message}
let promoTimer   = null;

let checkoutFormState = {
  phone: '',
  name: '',
  address: '',
  table: '',
  notes: '',
  useFreeDrink: false
};
let customerLoyalty = null;
let loadingLoyalty = false;

// Backup original prices first
MENU_DATA.forEach(item => {
  item.price_m_old = item.price_m;
  if (item.price_l) item.price_l_old = item.price_l;
});

// ─── CART ─────────────────────────────────────────────────────────────────────
function loadCart() {
  try { return JSON.parse(localStorage.getItem('lhk_cart') || '[]'); }
  catch { return []; }
}
function saveCart()  { localStorage.setItem('lhk_cart', JSON.stringify(cart)); }
function clearCart() { cart = []; saveCart(); }
function cartTotal() {
  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  if (screen === 'checkout') {
    const discount = getCartDiscount().amount;
    return Math.max(0, subtotal - discount);
  }
  return subtotal;
}
function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

function addToCart(item, qty, price, modifiers) {
  const key = item.sku + JSON.stringify(modifiers);
  const existing = cart.find(c => c._key === key);
  if (existing) {
    existing.qty += qty;
    existing.subtotal = existing.qty * existing.price;
  } else {
    cart.push({ _key: key, sku: item.sku, name: item.name,
                qty, price, modifiers, subtotal: qty * price });
  }
  saveCart();
}

function updateCartQty(idx, delta) {
  cart[idx].qty = Math.max(0, cart[idx].qty + delta);
  if (cart[idx].qty === 0) cart.splice(idx, 1);
  else cart[idx].subtotal = cart[idx].qty * cart[idx].price;
  saveCart();
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('vi-VN') + 'đ'; }

function calcPrice(item) {
  const base = (selOpts.size === 'L' && item.price_l) ? item.price_l : item.price_m;
  const tops = (selOpts.toppings || []).reduce((s, t) => s + t.price, 0);
  return base + tops;
}

function initOpts(item) {
  const c = item.customizations || {};
  selOpts = {
    size:     item.price_l ? 'M' : null,
    sugar:    c.sugar  ? c.sugar[Math.floor(c.sugar.length / 2)]  : null,
    ice:      c.ice    ? c.ice[0] : null,
    qty:      1,
    toppings: [],
  };
}

function allergenText(list) {
  if (!list || !list.length) return '';
  const map = { milk:'Sữa', egg:'Trứng', gluten:'Gluten', coconut:'Dừa' };
  return '⚠️ ' + list.map(a => map[a] || a).join(', ');
}

// Mã đơn ngắn 3 chữ số, reset mỗi ngày, lưu localStorage.
function genUUID() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function genShortCode() {
  const today = new Date().toLocaleDateString('vi-VN').replace(/\//g, '');
  const key = 'lhk_seq_' + today;
  const seq = (parseInt(localStorage.getItem(key) || '0') + 1);
  localStorage.setItem(key, seq);
  return String(seq).padStart(3, '0');
}

// ─── RENDER HELPERS ──────────────────────────────────────────────────────────
function cartBadge() {
  const n = cartCount();
  return n > 0
    ? `<button class="cart-fab" data-action="open-cart">
         🛒 <span class="cart-badge">${n}</span>
         <span class="cart-fab-total">${fmt(cartTotal())}</span>
       </button>`
    : '';
}

function renderCatPills() {
  return MITSU_CATEGORIES.map(c =>
    `<button class="cat-pill${activeCat === c.id ? ' active' : ''}" data-action="cat" data-cat="${c.id}">
       ${c.emoji} ${c.label}
     </button>`
  ).join('');
}

// ─── SCREEN: MENU ─────────────────────────────────────────────────────────────
function renderMenuScreen() {
  const items = MENU_DATA.filter(i => i.available &&
    (activeCat === 'all' || i.bee_group === activeCat));

  const order = ['kin', 'ritsu', 'so', 'kashi'];
  const groups = {};
  items.forEach(i => {
    if (!groups[i.bee_group]) groups[i.bee_group] = [];
    groups[i.bee_group].push(i);
  });

  const catLabel = {
    kin: '勤 Chăm chỉ (Kin)',
    ritsu: '律 Kỷ luật (Ritsu)',
    so: '創 Sáng tạo (Sō)',
    kashi: '菓 Ăn kèm (Kashi)'
  };

  let html = '';
  if (activeMenuMode === 'list') {
    order.forEach(sub => {
      if (!groups[sub]) return;
      if (activeCat === 'all')
        html += `<div class="group-header">${catLabel[sub]}</div>`;
      groups[sub].sort((a,b) => a.sort_order - b.sort_order).forEach(item => {
        const badge  = ROLE_BADGE[item.role];
        html += `
          <div class="item-card mi" data-action="open-item" data-sku="${item.sku}" data-role="${item.role || ''}">
            <div class="mi-left">
              <span class="mi-name">${item.name}</span>
              ${badge ? `<span class="role-badge ${badge.cls}">${badge.text}</span>` : ''}
              ${item.story ? `<span class="mi-note"> &nbsp;·&nbsp; ${item.story}</span>` : ''}
            </div>
            <span class="mi-dots"></span>
            <div class="mi-price-area">
              <span class="mi-price">
                ${activePromo && activePromo.active ? `<span class="price-old">${fmt(item.price_m_old)}</span>` : ''}
                ${fmt(item.price_m)}
                ${item.price_l ? ` <span class="price-sep">·</span> ${activePromo && activePromo.active ? `<span class="price-old">${fmt(item.price_l_old)}</span>` : ''}${fmt(item.price_l)}` : ''}
                ${item.price_l ? `<span class="size-hint"> M/L</span>` : ''}
              </span>
            </div>
            <button class="add-btn" data-action="quick-add" data-sku="${item.sku}">+</button>
          </div>`;
      });
    });
    html = `<main class="menu-list">${html || '<p class="empty">Không có món nào.</p>'}</main>`;
  } else {
    const flat = [];
    order.forEach(sub => {
      if (!groups[sub]) return;
      groups[sub].sort((a,b) => a.sort_order - b.sort_order).forEach(it => {
        flat.push(it);
      });
    });
    
    const isMobile = window.innerWidth <= 720;
    const basePerRow = isMobile ? 3 : 5;
    let rows = '', rIdx = 0;
    let cursor = 0;
    while (cursor < flat.length) {
      const perRow = rIdx % 2 ? (basePerRow - 1) : basePerRow;
      const cells = flat.slice(cursor, cursor + perRow).map(f => {
        const emoji = BEE_GROUP_EMOJI[f.bee_group] || '蜜';
        return `
          <div class="ghex" data-action="open-item" data-sku="${f.sku}" role="button" tabindex="0" aria-label="${f.name}">
            <div class="hex">
              <div class="in">
                ${hexPhoto(emoji)}
              </div>
            </div>
            <div class="cap"><span class="n">${f.name}</span></div>
          </div>`;
      }).join('');
      rows += `<div class="hrow ${rIdx % 2 ? 'odd' : ''}">${cells}</div>`;
      cursor += perRow;
      rIdx++;
    }
    html = `<main id="gallery-container">${rows || '<p class="empty">Không có món nào.</p>'}</main>`;
  }

  const n = cartCount();
  return `
    <header class="app-header">
      <a href="mitsu.html" class="header-home-btn" title="Trang chủ" style="display:flex; align-items:center;">
        <picture style="display:flex; align-items:center;">
          <source srcset="img/mitsu/logo-dark.webp" media="(prefers-color-scheme: dark)" class="theme-logo-source" data-light="img/mitsu/logo-light.webp" data-dark="img/mitsu/logo-dark.webp">
          <img src="img/mitsu/logo-light.webp" class="header-logo-img" alt="Mitsu Logo" style="height:24px; width:auto;">
        </picture>
      </a>
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="theme-toggle" data-theme-toggle aria-label="Đổi giao diện">
          <div class="hc-theme-icon">
            <svg class="hc-shape" viewBox="0 0 100 100" fill="currentColor">
              <polygon points="50 3, 97 27, 97 73, 50 97, 3 73, 3 27"/>
            </svg>
            <div class="theme-icon-symbol"></div>
          </div>
        </button>

        <!-- Honeycomb Cart Icon -->
        <button class="header-cart-btn ${n > 0 ? 'has-items' : ''}" id="header-cart-wrapper" data-action="open-cart" aria-label="Giỏ hàng${n > 0 ? ` - ${n} món` : ''}">
          <div class="hc-cart-icon">
            <svg class="hc-shape" viewBox="0 0 100 100" fill="currentColor">
              <polygon points="50 3, 97 27, 97 73, 50 97, 3 73, 3 27"/>
            </svg>
            <svg class="cart-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </div>
          <span class="header-cart-badge" id="header-cart-count" aria-hidden="true">${n}</span>
        </button>

        ${tableId ? `<div class="table-chip">Bàn ${tableId}</div>` : ''}
      </div>
    </header>
    <div class="cat-scroll"><div class="cat-pills">${renderCatPills()}</div></div>
    <div class="menu-view-toggle">
      <button class="${activeMenuMode === 'list' ? 'active' : ''}" data-action="toggle-view" data-view="list">Danh sách</button>
      <button class="${activeMenuMode === 'grid' ? 'active' : ''}" data-action="toggle-view" data-view="grid">Tổ ong</button>
    </div>
    ${html}
    ${cartBadge()}
    ${trackingBadge()}`;
}

// ─── BOTTOM SHEET: ITEM ───────────────────────────────────────────────────────
function renderItemSheetInner() {
  const item = selItem;
  if (!item) return '';
  const c    = item.customizations || {};
  const price = calcPrice(item);

  const sizeRow = item.price_l ? `
    <div class="opt-group">
      <div class="opt-label">Size</div>
      <div class="opt-chips">
        ${['M','L'].map(s => `
          <button class="chip${selOpts.size===s?' active':''}"
            data-action="opt" data-key="size" data-val="${s}">
            ${s} — ${activePromo && activePromo.active ? `<span class="price-old" style="margin-right: 4px;">${fmt(s==='L'?item.price_l_old:item.price_m_old)}</span>` : ''}${fmt(s==='L'?item.price_l:item.price_m)}
          </button>`).join('')}
      </div>
    </div>` : '';

  // Sắp xếp đường từ ít đến nhiều
  const sortedSugar = c.sugar ? [...c.sugar].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)) : null;
  const sugarRow = c.sugar ? `
    <div class="opt-group">
      <div class="opt-label">Đường</div>
      <div class="opt-chips">
        ${sortedSugar.map(v => `
          <button class="chip${selOpts.sugar===v?' active':''}"
            data-action="opt" data-key="sugar" data-val="${v}">
            ${SUGAR_LABEL[v] || v}
          </button>`).join('')}
      </div>
    </div>` : '';

  // Sắp xếp đá từ ít đến nhiều
  const iceOrder = { 'none': 0, 'less': 1, 'full': 2, 'blended': 3 };
  const sortedIce = c.ice ? [...c.ice].sort((a, b) => (iceOrder[a] ?? 0) - (iceOrder[b] ?? 0)) : null;
  const iceRow = c.ice && !c.ice.includes('blended') ? `
    <div class="opt-group">
      <div class="opt-label">Đá</div>
      <div class="opt-chips">
        ${sortedIce.map(v => `
          <button class="chip${selOpts.ice===v?' active':''}"
            data-action="opt" data-key="ice" data-val="${v}">
            ${ICE_LABEL[v] || v}
          </button>`).join('')}
      </div>
    </div>` : '';

  const toppingRow = c.toppings && c.toppings.length ? `
    <div class="opt-group">
      <div class="opt-label">Topping</div>
      <div class="opt-chips">
        ${c.toppings.map(t => {
          const active = (selOpts.toppings||[]).some(x => x.id === t.id);
          return `<button class="chip${active?' active':''}"
            data-action="topping" data-id="${t.id}" data-name="${t.name}" data-price="${t.price}">
            ${t.name} +${fmt(t.price)}
          </button>`;
        }).join('')}
      </div>
    </div>` : '';

  const allergen = allergenText(item.allergens);

  return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <div class="sheet-title">${item.name}</div>
          ${item.name_jp ? `<div class="sheet-subtitle">${item.name_jp}</div>` : ''}
        </div>
        <button class="sheet-close" data-action="close-sheet">✕</button>
      </div>
      <div class="sheet-body">
        ${item.story ? `<p class="item-story-full">${item.story}</p>` : ''}
        ${allergen    ? `<p class="allergen">${allergen}</p>` : ''}
        ${sizeRow}${sugarRow}${iceRow}${toppingRow}
        <div class="qty-row">
          <div class="opt-label">Số lượng</div>
          <div class="stepper">
            <button class="step-btn" data-action="qty" data-delta="-1">−</button>
            <span class="qty-val">${selOpts.qty}</span>
            <button class="step-btn" data-action="qty" data-delta="1">+</button>
          </div>
        </div>
      </div>
      <div class="sheet-footer">
        <button class="btn-primary" data-action="add-to-cart">
          Thêm vào giỏ &nbsp;·&nbsp; ${activePromo && activePromo.active ? `<span class="price-old" style="color: rgba(255,255,255,0.7); text-decoration: line-through; font-size: 0.8rem; margin-right: 6px;">${fmt(((selOpts.size === 'L' && item.price_l_old ? item.price_l_old : item.price_m_old) + (selOpts.toppings || []).reduce((s, t) => s + t.price, 0)) * selOpts.qty)}</span>` : ''}${fmt(price * selOpts.qty)}
        </button>
      </div>`;
}

function renderItemSheet() {
  return `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="bottom-sheet" id="item-sheet">
      ${renderItemSheetInner()}
    </div>`;
}

// ─── BOTTOM SHEET: CART ───────────────────────────────────────────────────────
function renderCartSheetInner() {
  const empty = cart.length === 0;
  const rows = cart.map((ci, idx) => {
    const mods = Object.entries(ci.modifiers || {})
      .filter(([k]) => k !== 'size')
      .map(([k,v]) => {
        if (k === 'sugar') return SUGAR_LABEL[v] || v;
        if (k === 'ice')   return ICE_LABEL[v]   || v;
        return v;
      }).join(' · ');
    const sizeLabel = ci.modifiers && ci.modifiers.size ? ` (${ci.modifiers.size})` : '';
    return `
      <div class="cart-row">
        <div class="cart-item-info">
          <div class="cart-item-name">${ci.name}${sizeLabel}</div>
          ${mods ? `<div class="cart-item-mods">${mods}</div>` : ''}
        </div>
        <div class="cart-item-right">
          <div class="stepper stepper-sm">
            <button class="step-btn" data-action="cart-qty" data-idx="${idx}" data-delta="-1">−</button>
            <span class="qty-val">${ci.qty}</span>
            <button class="step-btn" data-action="cart-qty" data-idx="${idx}" data-delta="1">+</button>
          </div>
          <div class="cart-item-price">${fmt(ci.subtotal)}</div>
        </div>
      </div>`;
  }).join('');

  return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">Giỏ hàng</div>
        <button class="sheet-close" data-action="close-sheet">✕</button>
      </div>
      <div class="sheet-body cart-body">
        ${empty
          ? `<p class="empty-cart">Giỏ trống<br><small>Mở menu và thêm món nhé ☕</small></p>`
          : rows}
      </div>
      ${!empty ? `
        <div class="sheet-footer">
          <div class="total-row">
            <span>Tổng cộng</span>
            <strong>${fmt(cartTotal())}</strong>
          </div>
          <button class="btn-primary" data-action="go-checkout">
            Thanh toán
          </button>
        </div>` : ''}`;
}

function renderCartSheet() {
  return `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="bottom-sheet sheet-tall" id="cart-sheet">
      ${renderCartSheetInner()}
    </div>`;
}

// ─── SCREEN: CHECKOUT ─────────────────────────────────────────────────────────
function renderCheckoutScreen() {
  const tableLabel = tableId ? `Bàn ${tableId.padStart(2,'0')}` : 'Mang đi';
  const isDelivery = deliveryMode === 'delivery';
  const phoneLabel = isDelivery ? 'Số điện thoại <span class="req">*</span>' : 'Số điện thoại <span class="form-label-hint">(tích tem đổi ly miễn phí)</span>';

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const discount = getCartDiscount();
  const discountRow = discount.amount > 0 ? `
    <div class="summary-row promo-row" style="color: var(--coral); font-weight: 600;">
      <span>🎁 Ly nước miễn phí (Giảm)</span>
      <span>-${fmt(discount.amount)}</span>
    </div>
  ` : '';

  return `
    <header class="app-header">
      <button class="back-btn" data-action="go-menu">← Menu</button>
      <div class="header-logo">Thanh toán</div>
      <div></div>
    </header>
    <main class="checkout-form">

      <div class="form-section">
        <label class="form-label" id="lbl-phone">${phoneLabel}</label>
        <input class="form-input" id="inp-phone" type="tel" placeholder="09xx xxx xxx" inputmode="numeric"
               value="${esc(checkoutFormState.phone)}">
        ${renderRecentPhones()}
        ${renderLoyaltySection()}
      </div>

      <div class="form-section">
        <label class="form-label">Tên khách <span class="form-label-hint">(không bắt buộc)</span></label>
        <input class="form-input" id="inp-name" type="text" placeholder="Ví dụ: Minh" autocomplete="name"
               value="${esc(checkoutFormState.name)}">
      </div>

      <div class="form-section">
        <label class="form-label">Hình thức nhận</label>
        <div class="opt-chips delivery-chips">
          <button class="chip${!isDelivery ? ' active' : ''}"
                  data-action="toggle-delivery" data-mode="pickup">
            🏪 ${tableId ? tableLabel : 'Mang đi / Tại quán'}
          </button>
          <button class="chip${isDelivery ? ' active' : ''}"
                  data-action="toggle-delivery" data-mode="delivery">
            🛵 Giao hàng
          </button>
        </div>
      </div>

      ${isDelivery ? `
      <div class="form-section">
        <label class="form-label">Địa chỉ giao hàng <span class="req">*</span></label>
        <input class="form-input" id="inp-address" type="text"
               placeholder="Số nhà, tên đường..."
               autocomplete="street-address"
               value="${esc(checkoutFormState.address)}">
        ${renderRecentAddresses()}
        <div class="address-region-hint">📍 Khu vực giao: <strong>Lâm Hà, Lâm Đồng</strong></div>
      </div>` : (tableId ? '' : `
      <div class="form-section table-row">
        <span class="form-label">Số bàn</span>
        <span class="table-chip-lg">${tableLabel}</span>
        <input class="form-input table-input" id="inp-table" type="text"
               placeholder="Nhập số bàn (01, 02...)" maxlength="2" inputmode="numeric"
               value="${esc(checkoutFormState.table)}">
      </div>`)}

      <div class="form-section">
        <label class="form-label">Phương thức thanh toán</label>
        <div class="opt-chips payment-chips">
          <button class="chip${paymentMethod === 'bank_transfer' ? ' active' : ''}"
                  data-action="toggle-payment" data-method="bank_transfer">
            💳 Chuyển khoản
          </button>
          <button class="chip${paymentMethod === 'cash' ? ' active' : ''}"
                  data-action="toggle-payment" data-method="cash">
            💵 Tiền mặt
          </button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">Ghi chú</label>
        <input class="form-input" id="inp-notes" type="text" placeholder="Ít ngọt, không đá, không hành..."
               value="${esc(checkoutFormState.notes)}">
      </div>

      <div class="order-summary">
        <div class="summary-title">Đơn hàng</div>
        ${cart.map(ci => `
          <div class="summary-row">
            <span>${ci.name} × ${ci.qty}</span>
            <span>${fmt(ci.subtotal)}</span>
          </div>`).join('')}
        ${discountRow}
        <div class="summary-total">
          <span>Tổng</span>
          <strong>${fmt(cartTotal())}</strong>
        </div>
      </div>

      <div id="submit-error" class="error-msg" style="display:none"></div>
      <button class="btn-primary btn-submit" id="btn-submit" data-action="submit">
        ${isDelivery ? '🛵 Gửi đơn giao hàng' : 'Gửi đơn'} — ${fmt(cartTotal())}
      </button>
    </main>`;
}

// ─── SCREEN: SUCCESS ──────────────────────────────────────────────────────────
let trackInterval = null;
let currentOrderStatus = 'NEW';

// ─── MULTI-ORDER TRACKING & LOCAL NOTIFICATIONS ──────────────────────────────
let trackingPollInProgress = false;

function loadActiveOrders() {
  const oldActiveId = localStorage.getItem('active_order_id');
  if (oldActiveId) {
    const migrated = [{
      order_id: oldActiveId,
      short_code: (typeof lastOrder !== 'undefined' && lastOrder.shortCode) || '...',
      total: (typeof lastOrder !== 'undefined' && lastOrder.total) || 0,
      delivery_type: (typeof lastOrder !== 'undefined' && lastOrder.delivery) || 'pickup',
      payment_method: (typeof lastOrder !== 'undefined' && lastOrder.paymentMethod) || 'cash',
      status: 'NEW',
      payment_status: 'PENDING',
      added_at: Date.now(),
      completed_at: null
    }];
    localStorage.setItem('lhk_active_orders', JSON.stringify(migrated));
    localStorage.removeItem('active_order_id');
  }

  try {
    return JSON.parse(localStorage.getItem('lhk_active_orders') || '[]');
  } catch (e) {
    return [];
  }
}

function saveActiveOrders(orders) {
  localStorage.setItem('lhk_active_orders', JSON.stringify(orders));
}

// ─── BỘ NHỚ ĐỆM THÔNG TIN KHÁCH (mỗi ô SĐT / địa chỉ giữ 3 cái gần nhất) ──────
// Khách có thể đặt giùm → SĐT và địa chỉ độc lập, chọn riêng từng cái.
function _loadRecent(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

// Lưu SĐT kèm tên (gắn liền với SĐT). Dedupe theo SĐT, giữ 3 gần nhất.
function saveRecentContact(name, phone) {
  if (!phone) return;
  let list = _loadRecent('lhk_recent_contacts').filter(x => x.phone !== phone);
  list.unshift({ name: name || '', phone: phone });
  localStorage.setItem('lhk_recent_contacts', JSON.stringify(list.slice(0, 3)));
}

// Lưu địa chỉ. Dedupe, giữ 3 gần nhất.
function saveRecentAddress(addr) {
  if (!addr) return;
  let list = _loadRecent('lhk_recent_addresses').filter(x => x !== addr);
  list.unshift(addr);
  localStorage.setItem('lhk_recent_addresses', JSON.stringify(list.slice(0, 3)));
}

// Chip gợi ý cho ô SĐT (bấm điền SĐT + tên đi kèm)
function renderRecentPhones() {
  const list = _loadRecent('lhk_recent_contacts');
  if (!list.length) return '';
  const chips = list.map((c, i) => {
    const label = '📞 ' + esc(c.phone) + (c.name ? ' · ' + esc(c.name) : '');
    return `<button class="recall-chip" data-action="fill-contact" data-idx="${i}">${label}</button>`;
  }).join('');
  return `<div class="recall-chips">${chips}</div>`;
}

// Chip gợi ý cho ô địa chỉ (bấm điền địa chỉ)
function renderRecentAddresses() {
  const list = _loadRecent('lhk_recent_addresses');
  if (!list.length) return '';
  const chips = list.map((a, i) => {
    const short = a.length > 34 ? a.slice(0, 33) + '…' : a;
    return `<button class="recall-chip" data-action="fill-address" data-idx="${i}">📍 ${esc(short)}</button>`;
  }).join('');
  return `<div class="recall-chips">${chips}</div>`;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendLocalNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body: body, icon: 'icon-192.png' });
    } catch (e) {
      console.warn('Browser Notification failed:', e);
    }
  }
}

function triggerVibration() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

async function pollActiveOrders() {
  if (trackingPollInProgress) return;
  trackingPollInProgress = true;

  try {
    let localOrders = loadActiveOrders();
    if (!localOrders.length) {
      if (trackInterval) {
        clearInterval(trackInterval);
        trackInterval = null;
      }
      trackingPollInProgress = false;
      return;
    }

    const res = await fetch(`${GAS_URL}?action=active_orders&_cb=${Date.now()}`);
    const data = await res.json();
    if (!data.ok || !data.orders) {
      trackingPollInProgress = false;
      return;
    }

    const liveById = {};
    data.orders.forEach(o => {
      liveById[o.order_id] = o;
    });

    let changed = false;
    const tzOffset = 7 * 60 * 60 * 1000; // GMT+7
    const todayStr = new Date(Date.now() + tzOffset).toISOString().split('T')[0].replace(/-/g, '');
    const nowTs = Date.now();
    const updatedOrders = [];

    for (let order of localOrders) {
      const datePart = order.order_id.split('-')[1];
      const isOldDay = datePart && datePart !== todayStr;
      const isExpiredAge = nowTs - order.added_at > 3 * 60 * 60 * 1000;

      if (isOldDay || isExpiredAge) {
        changed = true;
        continue;
      }

      if (order.completed_at !== null) {
        if (nowTs - order.completed_at > 30000) {
          changed = true;
          continue;
        }
        updatedOrders.push(order);
        continue;
      }

      const live = liveById[order.order_id];
      if (live) {
        // Mốc thời gian cho animation bò (đến khi nào cũng cập nhật, không chỉ lúc đổi status)
        if (live.making_at && order.making_at !== live.making_at) { order.making_at = live.making_at; changed = true; }
        if (live.delivering_at && order.delivering_at !== live.delivering_at) { order.delivering_at = live.delivering_at; changed = true; }
        if (live.status !== order.status || live.payment_status !== order.payment_status) {
          if (live.status === 'READY' && order.status !== 'READY') {
            sendLocalNotification('Mitsu Cafe', `Đơn #${live.short_code} của bạn đã xong! Mời bạn ra quầy lấy nước nhé ☕`);
            triggerVibration();
          }
          if (live.status === 'DELIVERED' && order.status !== 'DELIVERED') {
            checkStampAfterDelivery();   // tự tra lại thẻ tem + báo +N tem
          }
          order.status = live.status;
          order.payment_status = live.payment_status;
          if (live.short_code) order.short_code = live.short_code;
          if (live.delivery_type) order.delivery_type = live.delivery_type;
          if (live.table_id) order.table_id = live.table_id;
          changed = true;
        }
        updatedOrders.push(order);
      } else {
        try {
          const detailRes = await fetch(`${GAS_URL}?action=order_status&order_id=${encodeURIComponent(order.order_id)}&_cb=${Date.now()}`);
          const detailData = await detailRes.json();
          if (detailData.ok) {
            order.status = detailData.status;
            order.payment_status = detailData.payment_status;
            order.completed_at = nowTs;
            changed = true;

            if (order.status === 'DELIVERED') {
              sendLocalNotification('Mitsu Cafe', `Đơn #${order.short_code} đã hoàn thành. Cảm ơn bạn!`);
              triggerVibration();
              checkStampAfterDelivery();   // tự tra lại thẻ tem + báo +N tem
            }
            updatedOrders.push(order);
          } else if (detailData.error === 'not found') {
            changed = true;
          } else {
            updatedOrders.push(order);
          }
        } catch (e) {
          updatedOrders.push(order);
        }
      }
    }

    if (changed) {
      saveActiveOrders(updatedOrders);
      // Re-render sheet content if it's currently open
      const sheetEl = document.getElementById('tracking-sheet');
      if (sheetEl && sheet === 'tracking') {
        sheetEl.innerHTML = renderTrackingSheetInner();
        scheduleTrackCrawls();
      }
      render();
    }
  } catch (err) {
    console.error('Error polling active orders:', err);
  } finally {
    trackingPollInProgress = false;
  }
}

function startTrackingPolling() {
  if (trackInterval) clearInterval(trackInterval);
  pollActiveOrders();
  trackInterval = setInterval(pollActiveOrders, 10000);
}

function trackingBadge() {
  const activeOrders = loadActiveOrders().filter(o => o.completed_at === null);
  const count = activeOrders.length;
  return count > 0
    ? `<button class="tracking-fab" data-action="open-tracking">
         🐝 <span class="tracking-badge-count">${count}</span> đơn chuẩn bị
       </button>`
    : '';
}

function renderTrackingSheet() {
  return `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="bottom-sheet sheet-tall" id="tracking-sheet">
      ${renderTrackingSheetInner()}
    </div>`;
}

// Sau khi render thanh trạng thái: cho sticker "Đang pha"/"Đang giao" bò tới mốc kế trong thời gian còn lại.
// Gọi sau mỗi lần set innerHTML của tracking sheet. An toàn qua re-render vì vị trí đầu đã tính theo timestamp.
function scheduleTrackCrawls() {
  requestAnimationFrame(function () { requestAnimationFrame(function () {
    document.querySelectorAll('#tracking-sheet .bee-sticker[data-crawl-left]').forEach(function (b) {
      var rem = +b.dataset.crawlRem;
      b.style.transition = 'left ' + (rem / 1000) + 's linear';
      b.style.left = b.dataset.crawlLeft + '%';
    });
    document.querySelectorAll('#tracking-sheet .track-progress[data-crawl-w]').forEach(function (p) {
      var rem = +p.dataset.crawlRem;
      p.style.transition = 'width ' + (rem / 1000) + 's linear';
      p.style.width = p.dataset.crawlW + '%';
    });
  }); });
}

function renderTrackingSheetInner() {
  const activeOrders = loadActiveOrders();
  if (activeOrders.length === 0) {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <div class="sheet-title">🐝 Theo dõi chuẩn bị nước</div>
          <div class="sheet-subtitle">Mitsu Cafe — Gom mật ngọt, Gắn yêu thương</div>
        </div>
        <button class="sheet-close" data-action="close-sheet">✕</button>
      </div>
      <div class="sheet-body" style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">☕</div>
        <p style="color: var(--text-dim);">Bạn chưa có đơn hàng nào đang chuẩn bị.</p>
        <button class="btn-primary" style="margin-top: 20px;" data-action="close-sheet">Quay lại Menu</button>
      </div>`;
  }

  const cardsHtml = activeOrders.map(order => {
    const isDelivery = order.delivery_type === 'delivery';
    const typeLabel = isDelivery ? 'Giao hàng 🛵' : (order.table_id ? `Bàn ${order.table_id.replace(/^TABLE_/i, '')} 🏠` : 'Mang đi 🛍️');
    
    // Mốc theo loại đơn: tại quán/mang đi = 3 mốc; giao tận nơi = 4 mốc
    const stops = isDelivery ? [0, 33.34, 66.67, 100] : [0, 50, 100];
    const EIGHT_MIN = 8 * 60 * 1000; // mỗi đoạn chạy 8 phút
    // Sticker: Tiếp nhận→8.png · Đang pha→2.png · Đang giao→1.png · Đã xong/Đã giao→9.png
    let markIdx = 0, crawlToIdx = null, sinceTs = null, img = '8.webp';
    if (order.status === 'MAKING') {
      markIdx = 1; crawlToIdx = 2; sinceTs = order.making_at; img = '2.webp';
    } else if (order.status === 'READY') {
      markIdx = 2; img = '9.webp';                       // delivery: chờ shipper ở mốc Đang giao
    } else if (order.status === 'DELIVERING') {
      markIdx = 2; crawlToIdx = 3; sinceTs = order.delivering_at; img = '1.webp';
    } else if (order.status === 'DELIVERED') {
      markIdx = isDelivery ? 3 : 2; img = '9.webp';
    }
    const activeDot = markIdx + 1;
    const startPct = stops[markIdx];
    let curPct = startPct, endPct = startPct, remainingMs = 0;
    if (crawlToIdx !== null) {
      endPct = stops[crawlToIdx];
      let frac = 0;
      if (sinceTs) { const el = Date.now() - new Date(sinceTs).getTime(); if (el > 0) frac = Math.min(1, el / EIGHT_MIN); }
      curPct = startPct + frac * (endPct - startPct);
      remainingMs = (1 - frac) * EIGHT_MIN;
    }
    const toContainer = p => (10 + p * 0.8); // track-line thụt lề 10%/90% → toạ độ theo order-track

    let statusText = 'Đang tiếp nhận...';
    if (order.status === 'MAKING') statusText = 'Đang pha chế 🍵';
    else if (order.status === 'READY') statusText = isDelivery ? 'Chuẩn bị giao 🛵' : 'Mời ra nhận nước 🔔';
    else if (order.status === 'DELIVERING') statusText = 'Shipper đang giao 🛵';
    else if (order.status === 'DELIVERED') statusText = 'Hoàn tất! Cảm ơn bạn ❤️';
    else if (order.status === 'CANCELLED') statusText = 'Đơn đã huỷ ❌';

    let timelineHtml = '';
    if (order.status === 'CANCELLED') {
      timelineHtml = `
        <div style="color: #EF5350; font-weight: bold; font-size: 0.9rem; text-align: center; margin: 20px 0; background: rgba(239,83,80,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(239,83,80,0.2);">
          ❌ Đơn hàng đã huỷ — Vui lòng liên hệ quầy để được hỗ trợ.
        </div>`;
    } else {
      const dotDefs = isDelivery
        ? [['📥','Tiếp nhận'],['🍵','Đang pha'],['🛵','Đang giao'],['✅','Đã giao']]
        : [['📥','Tiếp nhận'],['🍵','Đang pha'],['✅','Đã xong']];
      const dotsHtml = dotDefs.map((d, i) =>
        `<div class="track-dot ${activeDot >= i + 1 ? 'active' : ''}">
           <div class="track-icon">${d[0]}</div>
           <div>${d[1]}</div>
         </div>`).join('');
      const crawling = crawlToIdx !== null && remainingMs > 500;
      // Đơn giao tận nơi: dòng nhắc khách quán sẽ gọi xác nhận
      const deliveryNote = isDelivery
        ? `<div style="text-align: center; font-size: 0.85rem; color: var(--accent); background: rgba(220,135,10,0.1); border: 1px solid rgba(220,135,10,0.25); padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;">
             📞 Chúng mình sẽ liên hệ bạn để xác nhận đơn hàng nhé!
           </div>`
        : '';
      // bee-sticker là con TRỰC TIẾP của .order-track (không nằm trong track-line) → thoát stacking-context, đè lên icon
      timelineHtml = deliveryNote + `
        <div class="order-track" style="margin-top: 50px;">
          <div class="track-line">
            <div class="track-progress" style="width: ${curPct}%"${crawling ? ` data-crawl-w="${endPct}" data-crawl-rem="${remainingMs}"` : ''}></div>
          </div>
          <div class="bee-sticker" style="left: ${toContainer(curPct)}%"${crawling ? ` data-crawl-left="${toContainer(endPct)}" data-crawl-rem="${remainingMs}"` : ''}>
            <div class="bee-code">#${order.short_code}</div>
            <img src="img/${img}" alt="">
          </div>
          <div class="track-dots">
            ${dotsHtml}
          </div>
        </div>`;
    }

    let paymentHtml = '';
    if (order.payment_status === 'PAID') {
      paymentHtml = `
        <div style="background: rgba(76,175,80,0.12); color: #81C784; padding: 10px; border-radius: 8px; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(76,175,80,0.2); margin-top: 10px;">
          <span>✅ Đã thanh toán thành công</span>
        </div>`;
    } else {
      if (order.payment_method === 'bank_transfer') {
        const hasBankInfo = BANK_QR.acct && BANK_QR.bank;
        const qrUrl = hasBankInfo ? buildVietQRUrl(order.total, order.short_code) : null;
        
        paymentHtml = `
          <div class="unpaid-block" style="margin-top: 10px;">
            <div style="background: rgba(220,135,10,0.12); color: var(--accent); padding: 10px; border-radius: 8px; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(220,135,10,0.2);">
              <span>⚠️ Chờ thanh toán: <strong>${fmt(order.total)}</strong></span>
              <button class="btn-primary" style="margin: 0; padding: 5px 12px; font-size: 0.75rem; border-radius: 6px; box-shadow: none;" data-action="toggle-qr" data-order-id="${order.order_id}">Xem QR chuyển khoản</button>
            </div>
            <div class="qr-collapsible hidden" id="qr-${order.order_id}" style="text-align: center; margin-top: 12px; padding: 12px; border: 1px dashed var(--border-lt); border-radius: 8px; background: rgba(0,0,0,0.15);">
              ${hasBankInfo ? `
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 8px;">Quét QR để tự động điền số tiền và nội dung chuyển khoản</div>
                <img src="${qrUrl}" alt="QR Ngân hàng" style="max-width: 180px; width: 100%; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
                <div style="font-size: 0.72rem; color: var(--text-dim);">
                  <strong style="color: var(--cream);">${BANK_QR.bank}</strong> · ${BANK_QR.acct}<br>
                  Chủ TK: ${BANK_QR.name}<br>
                  Nội dung CK: <strong style="color: var(--accent); font-family: monospace; font-size: 0.8rem;">${order.short_code}</strong>
                </div>` : `
                <div style="font-size: 0.75rem; color: var(--text-dim);">Vui lòng chuyển khoản ngân hàng với nội dung chuyển khoản là:</div>
                <div style="font-size: 1.1rem; color: var(--accent); font-weight: bold; font-family: monospace; margin: 8px 0;">${order.short_code}</div>
                <div style="font-size: 0.85rem; color: var(--cream);">Số tiền: <strong>${fmt(order.total)}</strong></div>`
              }
            </div>
          </div>`;
      } else {
        paymentHtml = `
          <div style="background: rgba(220,135,10,0.12); color: var(--accent); padding: 10px; border-radius: 8px; font-size: 0.85rem; border: 1px solid rgba(220,135,10,0.2); margin-top: 10px; text-align: center;">
            💵 Vui lòng thanh toán <strong>${fmt(order.total)}</strong> tiền mặt ${isDelivery ? 'khi nhận hàng' : 'tại quầy'}.
          </div>`;
      }
    }

    let completedHtml = '';
    if (order.completed_at !== null) {
      const elapsed = Math.max(0, Math.floor((30000 - (Date.now() - order.completed_at)) / 1000));
      completedHtml = `
        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: right; margin-top: 8px; font-style: italic;">
          ⏳ Đơn hàng sẽ đóng sau ${elapsed} giây
        </div>`;
    }

    const itemsSummaryHtml = order.items_summary ? `
      <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 6px; padding-left: 4px; border-left: 2px solid var(--accent); font-style: italic;">
        ${order.items_summary}
      </div>` : '';

    return `
      <div class="tracking-order-card" style="margin-bottom: 24px; padding: 45px 16px 16px; border: 1px dashed var(--border-lt); border-radius: 12px; position: relative; background: rgba(245,240,232,0.02); box-shadow: inset 0 0 12px rgba(0,0,0,0.1);">
        <div style="position: absolute; top: 12px; left: 16px; display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
          <span style="background: var(--sumi, #1c1c1a); color: var(--gold); font-family: monospace; font-weight: bold; border: 1px solid var(--gold); border-radius: 4px; padding: 2px 6px;">#${order.short_code}</span>
          <span style="color: var(--text-muted); font-size: 0.75rem;">(${typeLabel})</span>
        </div>
        <div style="position: absolute; top: 12px; right: 16px; font-size: 0.8rem; font-weight: 600; color: ${order.status === 'CANCELLED' ? '#EF5350' : 'var(--accent)'};">
          ${statusText}
        </div>
        
        ${timelineHtml}
        
        <div style="margin-top: 14px; border-top: 1px solid rgba(245,240,232,0.06); padding-top: 12px;">
          ${itemsSummaryHtml}
          ${paymentHtml}
          ${completedHtml}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div>
        <div class="sheet-title">🐝 Đơn hàng của bạn</div>
        <div class="sheet-subtitle">Theo dõi trạng thái pha chế nước thời gian thực</div>
      </div>
      <button class="sheet-close" data-action="close-sheet">✕</button>
    </div>
    <div class="sheet-body" style="padding: 16px 16px 30px;">
      ${cardsHtml}
    </div>`;
}

// ─── BOTTOM SHEET: UPSELL BÁNH ───────────────────────────────────────────────
function renderUpsellSheetInner() {
  const pastries = MENU_DATA.filter(i => i.available && i.subcategory === 'pastry');

  const cards = pastries.map(item => {
    const inCart = cart.some(c => c.sku === item.sku);
    return `
      <div class="upsell-card${inCart ? ' in-cart' : ''}"
           data-action="upsell-add" data-sku="${item.sku}">
        <div class="upsell-emoji">${CAT_EMOJI[item.subcategory] || '🥐'}</div>
        <div class="upsell-info">
          <div class="upsell-name">${item.name}</div>
          ${item.name_jp ? `<div class="upsell-jp">${item.name_jp}</div>` : ''}
          ${item.story   ? `<div class="upsell-story">${item.story}</div>` : ''}
          <div class="upsell-price">${fmt(item.price_m)}</div>
        </div>
        <button class="upsell-btn${inCart ? ' added' : ''}"
                data-action="upsell-add" data-sku="${item.sku}">
          ${inCart ? '✓' : '+'}
        </button>
      </div>`;
  }).join('');

  const hasPastryInCart = cart.some(c =>
    MENU_DATA.find(m => m.sku === c.sku)?.subcategory === 'pastry'
  );

  return `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <div class="sheet-title upsell-title">🥐 Thêm bánh ăn kèm?</div>
          <div class="sheet-subtitle">パンと一緒にどうぞ — Thêm bánh trước khi thanh toán</div>
        </div>
        <button class="sheet-close" data-action="upsell-skip">✕</button>
      </div>
      <div class="sheet-body upsell-body">
        ${pastries.length
          ? cards
          : '<p class="empty">Hôm nay hết bánh rồi 🙏</p>'}
      </div>
      <div class="sheet-footer">
        <button class="btn-primary" data-action="upsell-checkout">
          ${hasPastryInCart ? 'Thanh toán' : 'Tiếp tục thanh toán'} →
        </button>
        <button class="btn-secondary upsell-skip-btn" data-action="upsell-skip">
          Chỉ nước thôi
        </button>
      </div>`;
}

function renderUpsellSheet() {
  return `
    <div class="sheet-backdrop" data-action="upsell-skip"></div>
    <div class="bottom-sheet sheet-tall" id="upsell-sheet">
      ${renderUpsellSheetInner()}
    </div>`;
}

// ─── RENDER MAIN ──────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  let contentHtml = '';

  // Lưu vị trí cuộn trước khi re-render
  let scrollY = window.scrollY;
  let menuListScrollTop = 0;
  let catScrollLeft = 0;
  const currentMenuListEl = document.querySelector('.menu-list');
  const currentCatScrollEl = document.querySelector('.cat-scroll');

  if (screen === lastScreen && activeCat === lastActiveCat) {
    if (currentMenuListEl) menuListScrollTop = currentMenuListEl.scrollTop;
    if (currentCatScrollEl) catScrollLeft = currentCatScrollEl.scrollLeft;
  } else {
    // Reset cuộn nếu thay đổi màn hình hoặc đổi danh mục category
    scrollY = 0;
    menuListScrollTop = 0;
    lastScreen = screen;
    lastActiveCat = activeCat;
  }

  if (screen === 'checkout') {
    contentHtml = renderCheckoutScreen();
  } else if (screen === 'menu') {
    const existingItemSheet = document.getElementById('item-sheet');
    const existingCartSheet = document.getElementById('cart-sheet');
    const existingUpsellSheet = document.getElementById('upsell-sheet');
    const existingTrackingSheet = document.getElementById('tracking-sheet');

    if (sheet === 'item' && existingItemSheet) {
      existingItemSheet.innerHTML = renderItemSheetInner();
      return;
    }
    if (sheet === 'cart' && existingCartSheet) {
      existingCartSheet.innerHTML = renderCartSheetInner();
      return;
    }
    if (sheet === 'upsell' && existingUpsellSheet) {
      existingUpsellSheet.innerHTML = renderUpsellSheetInner();
      return;
    }
    if (sheet === 'tracking' && existingTrackingSheet) {
      existingTrackingSheet.innerHTML = renderTrackingSheetInner();
      scheduleTrackCrawls();
      return;
    }

    contentHtml = renderMenuScreen();
  }

  // Prepend promo banner if active
  if (activePromo && activePromo.active) {
    const bannerHtml = `
      <div id="promo-banner" class="promo-banner">
        <span>📣 ${activePromo.message}</span>
        <span class="promo-countdown" id="promo-timer">--:--</span>
      </div>
    `;
    app.innerHTML = bannerHtml + contentHtml;
    updatePromoTimerDisplay();
  } else {
    app.innerHTML = contentHtml;
  }

  // Khôi phục vị trí cuộn sau khi innerHTML cập nhật
  if (screen === 'menu') {
    window.scrollTo(0, scrollY);
    const newMenuListEl = document.querySelector('.menu-list');
    const newCatScrollEl = document.querySelector('.cat-scroll');
    if (newMenuListEl && menuListScrollTop > 0) newMenuListEl.scrollTop = menuListScrollTop;
    if (newCatScrollEl && catScrollLeft > 0) newCatScrollEl.scrollLeft = catScrollLeft;
  }

  if (screen === 'menu') {
    if (sheet === 'item' && selItem) {
      app.insertAdjacentHTML('beforeend', renderItemSheet());
      requestAnimationFrame(() => {
        const el = document.getElementById('item-sheet');
        if (el) el.classList.add('open');
      });
    }
    if (sheet === 'cart') {
      app.insertAdjacentHTML('beforeend', renderCartSheet());
      requestAnimationFrame(() => {
        const el = document.getElementById('cart-sheet');
        if (el) el.classList.add('open');
      });
    }
    if (sheet === 'upsell') {
      app.insertAdjacentHTML('beforeend', renderUpsellSheet());
      requestAnimationFrame(() => {
        const el = document.getElementById('upsell-sheet');
        if (el) el.classList.add('open');
      });
    }
    if (sheet === 'tracking') {
      app.insertAdjacentHTML('beforeend', renderTrackingSheet());
      scheduleTrackCrawls();
      requestAnimationFrame(() => {
        const el = document.getElementById('tracking-sheet');
        if (el) el.classList.add('open');
      });
    }
  }
}

// ─── 3D CAROUSEL ─────────────────────────────────────────────────────────────
const hexPhoto = (k) => `<div class="photo" data-k="${k}"></div>`;

function openCarousel(sku) {
  const allItems = [];
  const order = ['kin', 'ritsu', 'so', 'kashi'];
  order.forEach(sub => {
    const subItems = MENU_DATA.filter(i => i.bee_group === sub && i.available);
    subItems.sort((a,b) => a.sort_order - b.sort_order);
    allItems.push(...subItems);
  });

  if (!allItems.length) return;

  const ov = document.getElementById('ov');
  const ring = document.getElementById('ring');
  if (!ov || !ring) return;

  curItems = allItems;
  const idx = allItems.findIndex(i => i.sku === sku);
  curIdx = idx !== -1 ? idx : 0;
  
  lastCatIdx = {};
  ['kin', 'ritsu', 'so', 'kashi'].forEach(c => {
    lastCatIdx[c] = curItems.findIndex(item => item.bee_group === c);
  });

  curCat = curItems[curIdx].bee_group;
  step = 360 / curItems.length;
  radius = Math.round(100 / Math.tan(Math.PI / Math.max(curItems.length, 3))) + 60;

  ring.innerHTML = curItems.map((it, i) => {
    const groupEmoji = BEE_GROUP_EMOJI[it.bee_group] || '蜜';
    return `
      <div class="ccell" data-i="${i}" style="transform:rotateY(${i * step}deg) translateZ(${radius}px)">
        <div class="ccell-wrapper">
          <div class="hex">
            <div class="in">
              ${hexPhoto(groupEmoji)}
              <div class="cap">
                <span class="n">${it.name}</span>
                <span class="p">${fmt(it.price_m)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  ov.classList.add('on');
  document.body.style.overflow = 'hidden';
  carouselState = 'detail';
  updateCarousel();
}

function renderCarouselOptionsInner(it) {
  const c = it.customizations || {};
  
  const sizeRow = it.price_l ? `
    <div class="opt-group">
      <div class="opt-label">Size</div>
      <div class="opt-chips">
        ${['M','L'].map(s => `
          <button class="chip${selOpts.size===s?' active':''}"
            data-action="opt" data-key="size" data-val="${s}">
            ${s} — ${activePromo && activePromo.active ? `<span class="price-old" style="margin-right: 4px;">${fmt(s==='L'?it.price_l_old:it.price_m_old)}</span>` : ''}${fmt(s==='L'?it.price_l:it.price_m)}
          </button>`).join('')}
      </div>
    </div>` : '';

  const sortedSugar = c.sugar ? [...c.sugar].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)) : null;
  const sugarRow = c.sugar ? `
    <div class="opt-group">
      <div class="opt-label">Đường</div>
      <div class="opt-chips">
        ${sortedSugar.map(v => `
          <button class="chip${selOpts.sugar===v?' active':''}"
            data-action="opt" data-key="sugar" data-val="${v}">
            ${SUGAR_LABEL[v] || v}
          </button>`).join('')}
      </div>
    </div>` : '';

  const iceOrder = { 'none': 0, 'less': 1, 'full': 2, 'blended': 3 };
  const sortedIce = c.ice ? [...c.ice].sort((a, b) => (iceOrder[a] ?? 0) - (iceOrder[b] ?? 0)) : null;
  const iceRow = c.ice && !c.ice.includes('blended') ? `
    <div class="opt-group">
      <div class="opt-label">Đá</div>
      <div class="opt-chips">
        ${sortedIce.map(v => `
          <button class="chip${selOpts.ice===v?' active':''}"
            data-action="opt" data-key="ice" data-val="${v}">
            ${ICE_LABEL[v] || v}
          </button>`).join('')}
      </div>
    </div>` : '';

  const toppingRow = c.toppings && c.toppings.length ? `
    <div class="opt-group">
      <div class="opt-label">Topping</div>
      <div class="opt-chips">
        ${c.toppings.map(t => {
          const active = (selOpts.toppings||[]).some(x => x.id === t.id);
          return `<button class="chip${active?' active':''}"
            data-action="topping" data-id="${t.id}" data-name="${t.name}" data-price="${t.price}">
            ${t.name} +${fmt(t.price)}
          </button>`;
        }).join('')}
      </div>
    </div>` : '';

  const price = calcPrice(it);

  return `
    <div class="carousel-options-scroll">
      ${sizeRow}
      ${sugarRow}
      ${iceRow}
      ${toppingRow}
    </div>
    <div class="carousel-options-footer" style="margin-top: 20px; display: flex; gap: 12px; width: 100%;">
      <button class="btn-secondary" style="flex: 1; margin: 0; padding: 12px; font-size: 0.88rem;" data-action="carousel-back-details">Quay lại</button>
      <button class="dadd btn-primary" style="flex: 1; margin: 0; padding: 12px; font-size: 0.88rem; box-shadow: none;" data-action="carousel-add-final" data-sku="${it.sku}">Thêm vào giỏ — ${fmt(price)}</button>
    </div>
  `;
}

function updateCarousel(skipAnimation = false) {
  const ring = document.getElementById('ring');
  const detail = document.getElementById('detail');
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
  curCat = it.bee_group;
  if (lastCatIdx) {
    lastCatIdx[curCat] = curIdx;
  }
  const catNames = {
    kin: '勤 · Chăm chỉ',
    ritsu: '律 · Kỷ luật',
    so: '創 · Sáng tạo',
    kashi: '菓 · Bánh ăn kèm'
  };

  const hasCustomizations = it.price_l || it.customizations?.sugar || it.customizations?.ice || it.customizations?.toppings?.length;

  // Clear temporary styles from dragging
  detail.style.opacity = '';
  detail.style.transition = '';

  if (carouselState === 'options' && hasCustomizations) {
    detail.innerHTML = `
      <div class="dk jp">${catNames[curCat] || '蜜'}</div>
      <div class="dn">${it.name}</div>
      ${renderCarouselOptionsInner(it)}
    `;
  } else {
    carouselState = 'detail';
    detail.innerHTML = `
      <div class="dk jp">${catNames[curCat] || '蜜'}</div>
      <div class="dn">${it.name}</div>
      <div class="dp">${fmt(it.price_m)}</div>
      ${it.story ? `<div class="dd">${it.story}</div>` : ''}
      <button class="dadd btn-primary" data-action="carousel-add-honey" data-sku="${it.sku}">Thêm mật</button>
    `;
  }

  if (!skipAnimation) {
    detail.style.animation = 'none';
    void detail.offsetWidth;
    detail.style.animation = '';
  }
}

function switchCarouselCategory(dir) {
  if (!curItems.length) return;
  const cats = ['kin', 'ritsu', 'so', 'kashi'];
  const curCatId = curItems[curIdx].bee_group;
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
      const fallbackIdx = curItems.findIndex(item => item.bee_group === nextCatId);
      if (fallbackIdx !== -1) {
        targetIdx = fallbackIdx;
        break;
      }
    }
  }

  if (targetIdx === -1) return;

  const ring = document.getElementById('ring');
  if (!ring) return;

  const len = curItems.length;
  
  // A = Current cells
  const idxA_center = curIdx;
  const idxA_left   = (curIdx - 1 + len) % len;
  const idxA_right  = (curIdx + 1 + len) % len;

  // B = Target cells
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

  // 1. Prepare initial positions of incoming cells B at the same angles as A but offset vertically
  allTransitionCells.forEach(cell => {
    cell.style.transition = 'none';
  });

  // Align cellB elements to the horizontal angle of corresponding cellA elements
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

  const detail = document.getElementById('detail');
  if (detail) {
    detail.style.transition = 'opacity 0.25s ease';
    detail.style.opacity = '0';
  }

  // Force reflow to register the starting positions
  void ring.offsetHeight;

  // 2. Animate the transition
  requestAnimationFrame(() => {
    allTransitionCells.forEach(cell => {
      cell.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease';
    });

    // Swap active class for smooth scale transition of inner wrappers
    if (cellA_center) cellA_center.classList.remove('active');
    if (cellB_center) cellB_center.classList.add('active');

    // Slide A out
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

    // Slide B in
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

  // 3. Snapping cleanup
  setTimeout(() => {
    curIdx = targetIdx;
    carouselState = 'detail';

    const it = curItems[curIdx];
    curCat = it.bee_group;
    if (lastCatIdx) {
      lastCatIdx[curCat] = curIdx;
    }

    // Snap the main ring horizontal angle
    ring.style.transition = 'none';
    ring.style.transform = `translateZ(-${radius}px) rotateY(${-curIdx * step}deg)`;
    void ring.offsetHeight;
    ring.style.transition = '';

    // Revert all cells back to their default horizontal rotation transforms
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
} // matches exit transition duration

function moveCarousel(dir) {
  if (!curItems.length) return;
  curIdx = (curIdx + dir + curItems.length) % curItems.length;
  carouselState = 'detail';
  updateCarousel();
}

function closeCarousel() {
  const ov = document.getElementById('ov');
  if (ov) ov.classList.remove('on');
  document.body.style.overflow = '';
}

function initCarousel() {
  const ovClose = document.getElementById('ovClose');
  const ovPrev = document.getElementById('ovPrev');
  const ovNext = document.getElementById('ovNext');
  const ov = document.getElementById('ov');
  const ring = document.getElementById('ring');

  if (ovClose) ovClose.onclick = closeCarousel;
  if (ovPrev) ovPrev.onclick = () => moveCarousel(-1);
  if (ovNext) ovNext.onclick = () => moveCarousel(1);

  if (ov) {
    ov.onclick = (e) => {
      if (e.target === ov) closeCarousel();
    };

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
      const curCatId = curItems[curIdx].bee_group;
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
          const fallbackIdx = curItems.findIndex(item => item.bee_group === cid);
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
          const fallbackIdx = curItems.findIndex(item => item.bee_group === cid);
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
            carouselState = 'detail';
            const it = curItems[curIdx];
            curCat = it.bee_group;
            if (lastCatIdx) lastCatIdx[curCat] = curIdx;

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
            carouselState = 'detail';
            const it = curItems[curIdx];
            curCat = it.bee_group;
            if (lastCatIdx) lastCatIdx[curCat] = curIdx;

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
            updateCarousel(true);
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
            updateCarousel(true);
          }, 300);
        }
        isDraggingVertically = false;
      }
    });
  }

  if (ring) {
    ring.onclick = (e) => {
      const cell = e.target.closest('.ccell');
      if (cell) {
        const i = parseInt(cell.dataset.i, 10);
        if (i === curIdx) return;
        curIdx = i;
        updateCarousel();
      }
    };
  }

  document.addEventListener('keydown', (e) => {
    const ovEl = document.getElementById('ov');
    if (ovEl && ovEl.classList.contains('on')) {
      if (e.key === 'Escape') closeCarousel();
      if (e.key === 'ArrowRight') moveCarousel(1);
      if (e.key === 'ArrowLeft') moveCarousel(-1);
    }
  });
}

// ─── SHEET OPEN / CLOSE ──────────────────────────────────────────────────────
function openItemSheet(sku) {
  selItem = MENU_DATA.find(m => m.sku === sku);
  if (!selItem) return;
  initOpts(selItem);
  sheet = 'item';
  render();
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
    <a href="#" data-action="open-full-cart" class="btn-primary cart-pop-action" style="text-decoration: none; border-radius: 6px; display: block; font-weight: 500;">
      Xem giỏ hàng & Thanh toán
    </a>
  `;

  const btn = pop.querySelector('[data-action="open-full-cart"]');
  if (btn) {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      pop.classList.remove('show');
      openCartSheet();
    });
  }
}

function openCartSheet() { sheet = 'cart'; render(); }

function closeSheet() { sheet = null; render(); }

// ─── QUICK ADD (bypass item sheet for items without customizations) ────────────
function quickAdd(sku) {
  const item = MENU_DATA.find(m => m.sku === sku);
  if (!item) return;
  const c = item.customizations || {};
  if (item.price_l || c.sugar || c.ice || c.toppings?.length) {
    // Has options → open sheet
    openItemSheet(sku);
  } else {
    // No options → add directly
    addToCart(item, 1, item.price_m, {});
    showToast(`${item.name} đã thêm ✓`);
    render();
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
}

// ─── ORDER SUBMIT ─────────────────────────────────────────────────────────────
async function submitOrder() {
  if (submitting) return;

  const name    = document.getElementById('inp-name')?.value.trim() || '';
  const phone   = document.getElementById('inp-phone')?.value.trim().replace(/\D/g,'');
  const notes   = document.getElementById('inp-notes')?.value.trim() || '';
  const rawAddress = document.getElementById('inp-address')?.value.trim() || '';
  const address = rawAddress && !rawAddress.includes('Lâm Hà')
    ? rawAddress + ', Lâm Hà, Lâm Đồng'
    : rawAddress;
  const tblIn   = document.getElementById('inp-table')?.value.trim() || '';
  const tbl     = tableId ? `TABLE_${tableId.padStart(2,'0')}` : (tblIn ? `TABLE_${tblIn.padStart(2,'0')}` : null);
  const isDelivery = deliveryMode === 'delivery';

  // Validate
  const errEl = document.getElementById('submit-error');
  if (isDelivery && !phone) {
    showErr(errEl, 'Vui lòng nhập số điện thoại để giao hàng.');
    return;
  }
  if (phone && phone.length < 9) {
    showErr(errEl, 'Vui lòng nhập số điện thoại hợp lệ.');
    return;
  }
  if (checkoutFormState.useFreeDrink && !phone) {
    showErr(errEl, 'Vui lòng nhập số điện thoại để sử dụng ly nước miễn phí.');
    return;
  }
  if (isDelivery && !address) { showErr(errEl, 'Vui lòng nhập địa chỉ giao hàng.'); return; }
  if (cart.length === 0) { showErr(errEl, 'Giỏ hàng trống.'); return; }

  errEl.style.display = 'none';

  // Save user info
  const normPhone = phone ? (phone.startsWith('0') ? phone : '0' + phone) : '';
  if (normPhone) {
    localStorage.setItem('lhk_user', JSON.stringify({ name, phone: normPhone }));
  }

  const total = cartTotal();
  const items = cart.map(ci => ({
    sku: ci.sku, name: ci.name, qty: ci.qty, price: ci.price,
    modifiers: ci.modifiers || {},
  }));

  const utmSource = sessionStorage.getItem('lhk_utm') || 'web_static';
  const deliveryType = isDelivery ? 'delivery' : (tbl ? 'dine_in' : 'pickup');
  // Sinh idempotency key + short_code 1 lần; lần retry sau lỗi mạng dùng lại cùng giá trị → GAS dedup.
  if (!pendingSubmit) pendingSubmit = { idempotencyKey: genUUID(), shortCode: genShortCode() };
  const shortCode = pendingSubmit.shortCode;
  const idempotencyKey = pendingSubmit.idempotencyKey;

  const payload = {
    channel: 'web', utm_source: utmSource,
    table_id: isDelivery ? null : tbl,
    customer_name: name || null,
    customer_id: normPhone || null,
    items, total,
    payment: { method: paymentMethod, total, status: 'PENDING' },
    metadata: {
      delivery_type: deliveryType,
      business_line: 'kissaten',
      category_type: 'beverage',
      notes,
      short_code: shortCode,
      idempotency_key: idempotencyKey,
      use_free_drink: checkoutFormState.useFreeDrink,
      ...(isDelivery && { delivery_address: address }),
    },
  };

  // UI: loading
  submitting = true;
  const btn = document.getElementById('btn-submit');
  if (btn) { btn.textContent = 'Đang gửi...'; btn.disabled = true; }

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    // Parse response
    const data = await res.json();
    if (data.ok && data.order_id) {
      const isDelivery = deliveryMode === 'delivery';
      const deliveryType = isDelivery ? 'delivery' : (tbl ? 'dine_in' : 'pickup');
      const itemsSummary = cart.map(ci => `${ci.name} (x${ci.qty})`).join(', ');

      const activeOrders = loadActiveOrders();
      // Nếu server dedup (retry trùng key) đơn đã có local → không push trùng.
      if (!activeOrders.some(o => o.order_id === data.order_id)) {
        activeOrders.push({
          order_id: data.order_id,
          short_code: data.short_code || shortCode,
          total: total,
          delivery_type: deliveryType,
          table_id: isDelivery ? null : tbl,
          payment_method: paymentMethod,
          status: 'NEW',
          payment_status: 'PENDING',
          items_summary: itemsSummary,
          added_at: Date.now(),
          completed_at: null
        });
        saveActiveOrders(activeOrders);
      }
      // Đặt thành công → xoá pendingSubmit để đơn kế tiếp có key/short_code mới.
      pendingSubmit = null;
      // Lưu để lần sau điền nhanh — SĐT và địa chỉ riêng (khách có thể đặt giùm)
      saveRecentContact(name, normPhone);
      if (isDelivery && rawAddress) saveRecentAddress(rawAddress);
      // Xin quyền thông báo ngay sau khi đặt đơn (vẫn còn user gesture) → notify/rung khi READY mới chạy
      requestNotificationPermission();
    }

    // Tích hợp lưu đặc điểm khách hàng quen qua camera AI nội bộ
    fetch('http://localhost:5000/api/associate_order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_phone: normPhone,
        customer_name: name || 'Khách Quen',
        items: cart.map(ci => `${ci.name} (${ci.qty})`).join(', ')
      })
    }).catch(err => console.log('Không kết nối được Camera AI local:', err));

    clearCart();
    
    screen = 'menu';
    sheet = 'tracking';
    startTrackingPolling();
    render();

  } catch (err) {
    submitting = false;
    if (btn) { btn.textContent = `Gửi đơn — ${fmt(total)}`; btn.disabled = false; }
    showErr(errEl, 'Mất kết nối — kiểm tra mạng và thử lại.');
  }
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── EVENT DELEGATION ─────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el  = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  switch (act) {

    case 'cat':
      activeCat = el.dataset.cat;
      render();
      break;

    case 'toggle-view':
      activeMenuMode = el.dataset.view;
      render();
      break;

    case 'open-item': {
      const sku = el.dataset.sku;
      openCarousel(sku);
      break;
    }

    case 'carousel-add-honey': {
      const sku = el.dataset.sku;
      const item = MENU_DATA.find(m => m.sku === sku);
      if (item) {
        selItem = item;
        initOpts(item);
        const hasCustomizations = item.price_l || item.customizations?.sugar || item.customizations?.ice || item.customizations?.toppings?.length;
        if (hasCustomizations) {
          carouselState = 'options';
          updateCarousel();
        } else {
          addToCart(item, 1, item.price_m, {});
          showToast(`${item.name} đã thêm ✓`);
          closeCarousel();
          render();
        }
      }
      break;
    }

    case 'carousel-back-details':
      carouselState = 'detail';
      updateCarousel();
      break;

    case 'carousel-add-final': {
      if (!selItem) break;
      const price    = calcPrice(selItem);
      const modifiers = {};
      if (selOpts.size)   modifiers.size  = selOpts.size;
      if (selOpts.sugar)  modifiers.sugar = selOpts.sugar;
      if (selOpts.ice)    modifiers.ice   = selOpts.ice;
      if (selOpts.toppings && selOpts.toppings.length)
        modifiers.toppings = selOpts.toppings.map(t => t.name).join(', ');
      addToCart(selItem, selOpts.qty, price, modifiers);
      showToast(`${selItem.name} đã thêm ✓`);
      closeCarousel();
      render();
      break;
    }

    case 'quick-add':
      e.stopPropagation();
      quickAdd(el.dataset.sku);
      break;

    case 'open-cart':
      if (el.id === 'header-cart-wrapper' || el.closest('#header-cart-wrapper')) {
        toggleCartPopup(e);
      } else {
        openCartSheet();
      }
      break;

    case 'close-sheet':
      closeSheet();
      break;

    case 'opt': {
      const key = el.dataset.key, val = el.dataset.val;
      selOpts[key] = val;
      if (document.getElementById('ov').classList.contains('on')) {
        const group = el.closest('.opt-chips');
        if (group) {
          group.querySelectorAll('.chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === val);
          });
        }
        const priceBtn = document.querySelector('[data-action="carousel-add-final"]');
        if (priceBtn && selItem) {
          const price = calcPrice(selItem);
          priceBtn.textContent = `Thêm vào giỏ — ${fmt(price)}`;
        }
      } else {
        render();
      }
      break;
    }

    case 'topping': {
      const id = el.dataset.id, name = el.dataset.name, price = Number(el.dataset.price);
      const tops = selOpts.toppings || [];
      const idx  = tops.findIndex(t => t.id === id);
      if (idx >= 0) {
        tops.splice(idx, 1);
        el.classList.remove('active');
      } else {
        tops.push({ id, name, price });
        el.classList.add('active');
      }
      selOpts.toppings = tops;
      if (document.getElementById('ov').classList.contains('on')) {
        const priceBtn = document.querySelector('[data-action="carousel-add-final"]');
        if (priceBtn && selItem) {
          const price = calcPrice(selItem);
          priceBtn.textContent = `Thêm vào giỏ — ${fmt(price)}`;
        }
      } else {
        render();
      }
      break;
    }

    case 'qty': {
      const delta = Number(el.dataset.delta);
      selOpts.qty = Math.max(1, Math.min(10, (selOpts.qty || 1) + delta));
      if (document.getElementById('ov').classList.contains('on')) {
        updateCarousel();
      } else {
        render();
      }
      break;
    }

    case 'add-to-cart': {
      if (!selItem) break;
      const price    = calcPrice(selItem);
      const modifiers = {};
      if (selOpts.size)   modifiers.size  = selOpts.size;
      if (selOpts.sugar)  modifiers.sugar = selOpts.sugar;
      if (selOpts.ice)    modifiers.ice   = selOpts.ice;
      if (selOpts.toppings && selOpts.toppings.length)
        modifiers.toppings = selOpts.toppings.map(t => t.name).join(', ');
      addToCart(selItem, selOpts.qty, price, modifiers);
      showToast(`${selItem.name} đã thêm ✓`);
      sheet = null;
      render();
      break;
    }

    case 'cart-qty': {
      const idx   = Number(el.dataset.idx);
      const delta = Number(el.dataset.delta);
      updateCartQty(idx, delta);
      render();
      break;
    }

    case 'go-checkout':
      // Kiểm tra xem đã có bánh trong giỏ chưa — nếu có rồi thì vào checkout luôn
      if (cart.some(c => MENU_DATA.find(m => m.sku === c.sku)?.subcategory === 'pastry')) {
        sheet = null;
        enterCheckout();
      } else {
        sheet = 'upsell';
      }
      render();
      break;

    case 'toggle-delivery':
      deliveryMode = el.dataset.mode;
      render();
      break;

    case 'toggle-payment':
      paymentMethod = el.dataset.method;
      render();
      break;

    case 'go-menu':
      screen = 'menu';
      sheet  = null;
      submitting   = false;
      deliveryMode = 'pickup';
      paymentMethod = 'bank_transfer';
      customerLoyalty = null;
      checkoutFormState.useFreeDrink = false;
      render();
      break;

    case 'upsell-skip':
      // ✕ / backdrop → đóng upsell, về lại menu (không vào checkout)
      sheet = null;
      render();
      break;

    case 'upsell-checkout':
      // Nút "Tiếp tục thanh toán" → đi thẳng đến checkout
      sheet = null;
      enterCheckout();
      render();
      break;

    case 'upsell-add': {
      const uSku  = el.dataset.sku;
      const uItem = MENU_DATA.find(m => m.sku === uSku);
      if (!uItem) break;
      const uC = uItem.customizations || {};
      if (uItem.price_l || uC.sugar || uC.ice || uC.toppings?.length) {
        // Có options → mở item sheet (sẽ quay lại upsell sau khi thêm)
        openItemSheet(uSku);
      } else {
        // Không có options → thêm trực tiếp, giữ nguyên upsell để thấy ✓
        if (!cart.some(c => c.sku === uSku)) {
          addToCart(uItem, 1, uItem.price_m, {});
          showToast(`${uItem.name} đã thêm ✓`);
        }
        render(); // re-render upsell sheet với checkmark
      }
      break;
    }

    case 'submit':
      submitOrder();
      break;

    case 'open-tracking':
      // Mở lại popup theo dõi đơn từ nút nổi 🐝
      screen = 'menu';
      sheet = 'tracking';
      startTrackingPolling();
      render();
      break;

    case 'fill-contact': {
      // Bấm chip SĐT gần nhất → điền SĐT + tên đi kèm
      const c = _loadRecent('lhk_recent_contacts')[parseInt(el.dataset.idx, 10)];
      if (c) {
        checkoutFormState.phone = c.phone || '';
        if (c.name) checkoutFormState.name = c.name;
        if (c.phone) fetchLoyaltyInfo(c.phone);
        render();
      }
      break;
    }

    case 'fill-address': {
      // Bấm chip địa chỉ gần nhất → điền địa chỉ
      const a = _loadRecent('lhk_recent_addresses')[parseInt(el.dataset.idx, 10)];
      if (a) {
        checkoutFormState.address = a;
        render();
      }
      break;
    }

    case 'toggle-qr': {
      // Bung/thu gọn QR chuyển khoản trong card theo dõi
      const qrEl = document.getElementById(`qr-${el.dataset.orderId}`);
      if (qrEl) qrEl.classList.toggle('hidden');
      break;
    }
  }
});

// Close sheet on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheet) closeSheet();
});

// ─── LOYALTY CARD & INPUT BINDINGS ───────────────────────────────────────────
function initCheckoutState() {
  const saved = JSON.parse(localStorage.getItem('lhk_user') || '{}');
  checkoutFormState = {
    phone: saved.phone || '',
    name: saved.name || '',
    address: '',
    table: '',
    notes: '',
    useFreeDrink: false
  };
  customerLoyalty = null;
  loadingLoyalty = false;
}

function enterCheckout() {
  initCheckoutState();
  pendingSubmit = null;   // checkout mới → idempotency key mới
  screen = 'checkout';
  if (checkoutFormState.phone) {
    fetchLoyaltyInfo(checkoutFormState.phone);
  }
}

async function fetchLoyaltyInfo(phone) {
  const norm = phone.replace(/\D/g, '');
  if (norm.length < 9 || norm.length > 11) {
    customerLoyalty = null;
    render();
    return;
  }

  loadingLoyalty = true;
  render();

  try {
    const res = await fetch(`${GAS_URL}?action=customer_info&phone=${encodeURIComponent(norm)}`);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if (data.ok && data.customer) {
      customerLoyalty = data.customer;
      // Mốc tem/ly free hiện tại để so sánh sau khi đơn DELIVERED (stamp_total_ever chỉ tăng → đếm delta chuẩn)
      localStorage.setItem('lhk_stamp_total', String(parseInt(data.customer.stamp_total_ever || 0, 10)));
      localStorage.setItem('lhk_free_earned', String(parseInt(data.customer.free_drinks_earned || 0, 10)));
    } else {
      customerLoyalty = null;
    }
  } catch (err) {
    console.error('Error fetching loyalty info:', err);
    customerLoyalty = null;
  } finally {
    loadingLoyalty = false;
    render();
  }
}

// Khi đơn DELIVERED: tự tra lại thẻ tem, nếu tăng thì báo "Bạn vừa nhận +N tem".
async function checkStampAfterDelivery() {
  let user;
  try { user = JSON.parse(localStorage.getItem('lhk_user') || '{}'); } catch (e) { user = {}; }
  const phone = (user.phone || '').replace(/\D/g, '');
  if (phone.length < 9) return;
  try {
    const res = await fetch(`${GAS_URL}?action=customer_info&phone=${encodeURIComponent(phone)}&_cb=${Date.now()}`);
    const data = await res.json();
    if (!data.ok || !data.customer) return;
    const c = data.customer;
    const rawPrev = localStorage.getItem('lhk_stamp_total');
    const prevTotal = parseInt(rawPrev || '0', 10);
    const newTotal = parseInt(c.stamp_total_ever || 0, 10);
    const prevFree = parseInt(localStorage.getItem('lhk_free_earned') || '0', 10);
    const newFree = parseInt(c.free_drinks_earned || 0, 10);
    localStorage.setItem('lhk_stamp_total', String(newTotal));
    localStorage.setItem('lhk_free_earned', String(newFree));
    customerLoyalty = c; // để màn thanh toán (nếu mở) hiện số mới
    if (rawPrev === null) return; // chưa có mốc trước → không báo delta sai lần đầu
    if (newFree > prevFree) {
      showToast(`🎁 Chúc mừng! Bạn vừa nhận ${newFree - prevFree} ly nước miễn phí!`);
    } else if (newTotal > prevTotal) {
      showToast(`🎟️ Bạn vừa nhận +${newTotal - prevTotal} tem! Hiện có ${c.stamp_count}/10`);
    }
  } catch (e) { /* im lặng */ }
}

function getCartDiscount() {
  if (!checkoutFormState.useFreeDrink || !customerLoyalty) return { amount: 0, sku: null };
  const availableRewards = customerLoyalty.free_drinks_earned - customerLoyalty.free_drinks_used;
  if (availableRewards <= 0) return { amount: 0, sku: null };

  // Find the highest priced drink in the cart
  let highestDrink = null;
  cart.forEach(ci => {
    const sku = (ci.sku || '').toUpperCase();
    if (sku.indexOf('BK') !== 0) { // Drink items only (no pastry)
      if (!highestDrink || ci.price > highestDrink.price) {
        highestDrink = ci;
      }
    }
  });

  if (highestDrink) {
    return { amount: highestDrink.price, sku: highestDrink.sku };
  }
  return { amount: 0, sku: null };
}

const STAMP_STICKERS = [
  'img/stamps/s1.webp',
  'img/stamps/s2.webp',
  'img/stamps/s3.webp',
  'img/stamps/s4.webp',
  'img/stamps/s5.webp',
  'img/stamps/s6.webp',
  'img/stamps/s7.webp',
  'img/stamps/s8.webp',
  'img/stamps/s9.webp',
  'img/stamps/s10.webp'
];

function renderLoyaltySection() {
  const phone = checkoutFormState.phone.replace(/\D/g, '');
  if (phone.length < 9) return '';

  if (loadingLoyalty) {
    return `<div class="loyalty-loading" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 8px; font-style: italic;">Đang tìm thẻ tích tem... 🐝</div>`;
  }

  const stamps = customerLoyalty ? (customerLoyalty.stamp_count || 0) : 0;
  const freeEarned = customerLoyalty ? (customerLoyalty.free_drinks_earned || 0) : 0;
  const freeUsed = customerLoyalty ? (customerLoyalty.free_drinks_used || 0) : 0;
  const freeAvailable = Math.max(0, freeEarned - freeUsed);

  let gridHtml = '';
  for (let i = 0; i < 10; i++) {
    const isActive = i < stamps;
    if (isActive) {
      const stickerImg = STAMP_STICKERS[i] || 'img/stamps/s1.webp';
      gridHtml += `
        <div class="stamp-slot active" title="Tem ${i+1}">
          <img src="${stickerImg}" class="stamp-img" alt="🐝">
        </div>`;
    } else {
      gridHtml += `
        <div class="stamp-slot" title="Ô ${i+1}">
          <span class="stamp-number">${i+1}</span>
        </div>`;
    }
  }

  const stampsFromCart = cart.reduce((s, ci) => {
    const sku = (ci.sku || '').toUpperCase();
    return sku.indexOf('BK') !== 0 ? s + ci.qty : s;
  }, 0);

  let nextStepText = '';
  if (stampsFromCart > 0) {
    const totalAfterOrder = stamps + stampsFromCart;
    const newRewards = Math.floor(totalAfterOrder / 10);
    
    if (newRewards > 0) {
      nextStepText = `Mua thêm ${stampsFromCart} ly sẽ nhận ngay <strong>${newRewards} ly nước miễn phí</strong>! 🎉`;
    } else {
      nextStepText = `Đơn này được cộng <strong>+${stampsFromCart} tem</strong>. Mua ${10 - (totalAfterOrder % 10)} ly nữa để nhận quà! 🎟️`;
    }
  } else {
    nextStepText = `Mua 1 món nước bất kỳ để bắt đầu tích tem đổi quà nhé! ☕`;
  }

  let rewardBlock = '';
  if (freeAvailable > 0) {
    rewardBlock = `
      <div class="reward-box">
        <label class="reward-checkbox-container">
          <input type="checkbox" class="reward-checkbox" id="chk-use-free-drink" ${checkoutFormState.useFreeDrink ? 'checked' : ''}>
          <div class="reward-text-container">
            <span class="reward-title">Đổi 1 ly nước miễn phí</span>
            <span class="reward-desc">Bạn đang có ${freeAvailable} ly thưởng khả dụng</span>
          </div>
          <span class="reward-badge-gift">🎁</span>
        </label>
      </div>`;
  }

  return `
    <div class="loyalty-container">
      <div class="loyalty-header">
        <div class="loyalty-title">
          <span>Thẻ tích tem Mitsu</span>
          <span>${stamps}/10 🎟️</span>
        </div>
        <div class="loyalty-subtitle">${nextStepText}</div>
      </div>
      <div class="stamp-grid">
        ${gridHtml}
      </div>
      ${rewardBlock}
    </div>
  `;
}

// Bind input changes to checkoutFormState
document.addEventListener('input', e => {
  const id = e.target.id;
  if (!id) return;
  if (id === 'inp-phone') {
    const val = e.target.value.replace(/\D/g, '');
    checkoutFormState.phone = e.target.value;
    if (val.length === 10 || (val.length === 9 && !val.startsWith('0'))) {
      fetchLoyaltyInfo(val);
    } else if (val.length < 9) {
      if (customerLoyalty !== null) {
        customerLoyalty = null;
        checkoutFormState.useFreeDrink = false;
        render();
      }
    }
  }
  if (id === 'inp-name') {
    checkoutFormState.name = e.target.value;
  }
  if (id === 'inp-address') {
    checkoutFormState.address = e.target.value;
  }
  if (id === 'inp-table') {
    checkoutFormState.table = e.target.value;
  }
  if (id === 'inp-notes') {
    checkoutFormState.notes = e.target.value;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'chk-use-free-drink') {
    checkoutFormState.useFreeDrink = e.target.checked;
    render();
  }
});

// ─── PROMOTION SYSTEM ──────────────────────────────────────────────────────────
async function checkPromoStatus() {
  try {
    const res = await fetch(`${GAS_URL}?action=promo_info`);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if (data.ok && data.promo) {
      updatePromoState(data.promo);
    }
  } catch (err) {
    console.warn('Cannot fetch promo status:', err);
  }
}

function applyPromoPercent(active) {
  const pct = (activePromo && activePromo.percent) ? activePromo.percent : 5;
  const factor = 1 - pct / 100;
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * factor);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * factor);
    } else {
      item.price_m = item.price_m_old;
      if (item.price_l_old) item.price_l = item.price_l_old;
    }
  });
}

function recalculateCartItemPrice(c) {
  const item = MENU_DATA.find(i => i.sku === c.sku);
  if (!item) return c.price;
  
  const size = c.modifiers?.size;
  const base = (size === 'L' && item.price_l) ? item.price_l : item.price_m;
  
  let tops = 0;
  if (c.modifiers?.toppings) {
    const toppingNames = c.modifiers.toppings.split(', ').map(s => s.trim());
    const availableToppings = item.customizations?.toppings || [];
    toppingNames.forEach(tName => {
      const topObj = availableToppings.find(t => t.name === tName);
      if (topObj) {
        tops += topObj.price;
      }
    });
  }
  return base + tops;
}

function syncCartPrices() {
  cart.forEach(c => {
    c.price = recalculateCartItemPrice(c);
    c.subtotal = c.qty * c.price;
  });
  saveCart();
}

function updatePromoTimerDisplay() {
  if (!activePromo || !activePromo.active) return;
  const endTime = new Date(activePromo.end).getTime();
  const now = new Date().getTime();
  const diff = endTime - now;
  const timerEl = document.getElementById('promo-timer');
  const bannerEl = document.getElementById('promo-banner');

  if (diff <= 0) {
    if (promoTimer) {
      clearInterval(promoTimer);
      promoTimer = null;
    }
    activePromo.active = false;
    applyPromoPercent(false);
    syncCartPrices();
    if (bannerEl) bannerEl.classList.add('hidden');
    render();
    return;
  }

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const hours = Math.floor(diff / (1000 * 60 * 60));

  let timeStr = '';
  if (hours > 0) {
    timeStr = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  if (timerEl) {
    timerEl.textContent = timeStr;
    if (diff <= 10 * 60 * 1000) {
      timerEl.classList.add('urgent');
    } else {
      timerEl.classList.remove('urgent');
    }
  }
}

function startPromoCountdown() {
  if (promoTimer) clearInterval(promoTimer);
  promoTimer = setInterval(updatePromoTimerDisplay, 1000);
  updatePromoTimerDisplay();
}

function updatePromoState(promo) {
  if (promoTimer) {
    clearInterval(promoTimer);
    promoTimer = null;
  }
  
  activePromo = promo;
  
  if (activePromo && activePromo.active) {
    applyPromoPercent(true);
    syncCartPrices();
    startPromoCountdown();
  } else {
    applyPromoPercent(false);
    syncCartPrices();
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function init() {
  const params = new URLSearchParams(location.search);
  tableId = params.get('t') || params.get('table_id') || '';
  // Normalize: "03" → "03", "TABLE_03" strip prefix
  tableId = tableId.replace(/^TABLE_/i, '');
  // Persist UTM source for order payload
  const utm = params.get('utm_source');
  if (utm) sessionStorage.setItem('lhk_utm', utm);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Migration & load active orders
  const activeOrders = loadActiveOrders();
  if (activeOrders.length > 0) {
    screen = 'menu';
    startTrackingPolling();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pollActiveOrders();
    }
  });

  render();
  checkPromoStatus().then(() => render());
  initCarousel();

  // Parse SKU deep link to auto-open 3D Carousel
  const sku = params.get('sku');
  if (sku) {
    const item = MENU_DATA.find(m => m.sku === sku);
    if (item && item.available) {
      setTimeout(() => openCarousel(sku), 150);
    }
  }

  // Parse cart/sheet deep link
  if (params.get('sheet') === 'cart' || params.get('cart') === '1') {
    setTimeout(() => openCartSheet(), 150);
  }
  
  // Khởi chạy vòng lặp kiểm tra khách quen từ Camera AI (3 giây/lần)
  customerPollTimer = setInterval(pollActiveCustomer, 3000);
}

// ─── CAMERA AI INTEGRATION (ACTIVE CUSTOMER POLLING) ──────────────────────────
let lastActiveCustomerId = null;
let customerPollTimer = null;
let customerPollFails = 0;

async function pollActiveCustomer() {
  // Chỉ chạy trên màn hình menu hoặc checkout
  if (screen !== 'menu' && screen !== 'checkout') {
    removeCustomerSuggestionBanner();
    return;
  }

  try {
    const res = await fetch('http://localhost:5000/api/active_customer');
    if (!res.ok) throw new Error('Flask not running');
    const data = await res.json();
    customerPollFails = 0;

    if (data.detected) {
      if (data.customer_id !== lastActiveCustomerId) {
        lastActiveCustomerId = data.customer_id;
        
        // Hiện thông báo toast chào mừng
        showToast(`🐝 Chào mừng ${data.name} quay lại!`);
        
        // Nếu đang ở màn hình checkout, tự động điền form
        if (screen === 'checkout') {
          const inpPhone = document.getElementById('inp-phone');
          const inpName = document.getElementById('inp-name');
          
          if (inpPhone && (!checkoutFormState.phone || checkoutFormState.phone.startsWith('ANON'))) {
            const cleanPhone = data.customer_id.startsWith('ANON_') ? '' : data.customer_id;
            inpPhone.value = cleanPhone;
            checkoutFormState.phone = cleanPhone;
            if (cleanPhone) {
              fetchLoyaltyInfo(cleanPhone);
            }
          }
          if (inpName && !checkoutFormState.name) {
            inpName.value = data.name;
            checkoutFormState.name = data.name;
          }
        }
        
        // Vẽ banner gợi ý nước uống trên Menu/Checkout
        showCustomerSuggestionBanner(data);
      }
    } else {
      if (lastActiveCustomerId !== null) {
        lastActiveCustomerId = null;
        removeCustomerSuggestionBanner();
      }
    }
  } catch (err) {
    // Flask Camera AI không chạy (vd máy khách) → ngừng poll sau 3 lần fail,
    // tránh spam fetch localhost:5000 mỗi 3s vô tận trên thiết bị khách.
    if (++customerPollFails >= 3 && customerPollTimer) {
      clearInterval(customerPollTimer);
      customerPollTimer = null;
    }
  }
}

function showCustomerSuggestionBanner(cust) {
  removeCustomerSuggestionBanner();
  
  const banner = document.createElement('div');
  banner.id = 'customer-suggestion-banner';
  banner.className = 'customer-suggestion-banner';
  
  // Customization mapping: Trích xuất tên món sạch để thêm vào giỏ nhanh
  const cleanFavDrink = (cust.favorite_drink || '').split(',')[0].replace(/\s*\(\d+\)\s*/g, '').trim();
  
  banner.innerHTML = `
    <div class="cs-content">
      <span class="cs-avatar">🐝</span>
      <div class="cs-details">
        <div class="cs-title">Chào mừng <strong>${cust.name}</strong> quay lại!</div>
        <div class="cs-desc">Món uống quen thuộc: <strong>${cleanFavDrink || 'Chưa lưu'}</strong></div>
      </div>
    </div>
    ${cleanFavDrink ? `<button class="cs-btn" id="btn-quick-order-fav" data-sku-fav="${cleanFavDrink}">Gọi nhanh</button>` : ''}
  `;
  
  // Thêm banner vào đầu màn hình hiện tại
  const targetContainer = document.querySelector('.menu-screen main') || document.querySelector('.checkout-form');
  if (targetContainer) {
    targetContainer.insertBefore(banner, targetContainer.firstChild);
    
    // Gắn sự kiện cho nút Gọi nhanh
    document.getElementById('btn-quick-order-fav')?.addEventListener('click', () => {
      const matchedItem = MENU_DATA.find(item => item.name.toLowerCase() === cleanFavDrink.toLowerCase());
      if (matchedItem) {
        quickAdd(matchedItem.sku);
      } else {
        showToast(`Không tìm thấy món ${cleanFavDrink} trong menu. Vui lòng chọn bên dưới.`);
      }
    });
  }
}

function removeCustomerSuggestionBanner() {
  const el = document.getElementById('customer-suggestion-banner');
  if (el) el.remove();
}

init();
