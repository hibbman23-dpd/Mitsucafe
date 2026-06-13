'use strict';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;'
}[c]));

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec';

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

// ─── STATE ───────────────────────────────────────────────────────────────────
let screen       = 'menu';    // menu | checkout | success
let sheet        = null;      // null | 'item' | 'cart' | 'upsell'
let activeCat    = 'all';
let lastActiveCat = 'all';
let lastScreen    = 'menu';
let selItem      = null;      // MENU_DATA row đang xem
let selOpts      = {};        // {size, sugar, ice, qty, toppings:[]}
let tableId      = '';        // từ URL ?t=03 → TABLE_03
let cart         = loadCart();
let lastOrder    = { shortCode: '', total: 0, delivery: 'pickup' };
let submitting   = false;
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
  const cats = [{ id:'all', label:'Tất cả', emoji:'🍶' }, ...CATEGORIES];
  return cats.map(c =>
    `<button class="cat-pill${activeCat === c.id ? ' active' : ''}" data-action="cat" data-cat="${c.id}">
       ${c.emoji} ${c.label}
     </button>`
  ).join('');
}

// ─── SCREEN: MENU ─────────────────────────────────────────────────────────────
function renderMenuScreen() {
  const items = MENU_DATA.filter(i => i.available &&
    (activeCat === 'all' || i.subcategory === activeCat));

  // Group by subcategory (preserving CATEGORIES order)
  const order = CATEGORIES.map(c => c.id);
  const groups = {};
  items.forEach(i => {
    if (!groups[i.subcategory]) groups[i.subcategory] = [];
    groups[i.subcategory].push(i);
  });

  const catLabel = {};
  CATEGORIES.forEach(c => { catLabel[c.id] = `${c.emoji} ${c.label}`; });

  let html = '';
  order.forEach(sub => {
    if (!groups[sub]) return;
    if (activeCat === 'all')
      html += `<div class="group-header">${catLabel[sub]}</div>`;
    groups[sub].sort((a,b) => a.sort_order - b.sort_order).forEach(item => {
      const badge  = ROLE_BADGE[item.role];
      const emoji  = CAT_EMOJI[item.subcategory] || '🍶';
      html += `
        <div class="item-card" data-action="open-item" data-sku="${item.sku}" data-role="${item.role || ''}">
          <div class="item-emoji">${emoji}</div>
          <div class="item-info">
            <div class="item-name-row">
              <span class="item-name">${item.name}</span>
              ${badge ? `<span class="role-badge ${badge.cls}">${badge.text}</span>` : ''}
            </div>
            ${item.name_jp ? `<div class="item-jp">${item.name_jp}</div>` : ''}
            ${item.story   ? `<div class="item-story">${item.story}</div>` : ''}
            <div class="item-price">
              ${activePromo && activePromo.active ? `<span class="price-old">${fmt(item.price_m_old)}</span>` : ''}
              ${fmt(item.price_m)}
              ${item.price_l ? ` <span class="price-sep">·</span> ${activePromo && activePromo.active ? `<span class="price-old">${fmt(item.price_l_old)}</span>` : ''}${fmt(item.price_l)}` : ''}
              ${item.price_l ? `<span class="size-hint"> M / L</span>` : ''}
            </div>
          </div>
          <button class="add-btn" data-action="quick-add" data-sku="${item.sku}">+</button>
        </div>`;
    });
  });

  return `
    <header class="app-header">
      <a href="kaeru.html" class="header-home-btn" title="Trang chủ">
        <svg width="18" height="18" viewBox="0 0 50 52" fill="none">
          <path d="M5,19 C11,9 22,11 25,14 C28,11 39,9 45,19" stroke="currentColor" stroke-width="3.8" stroke-linecap="round"/>
          <rect x="9" y="21" width="32" height="3.5" fill="currentColor" rx="1.2"/>
          <rect x="16.5" y="13" width="3.5" height="34" fill="currentColor" rx="1.2"/>
          <rect x="30" y="13" width="3.5" height="34" fill="currentColor" rx="1.2"/>
          <rect x="13.5" y="44" width="10" height="3" fill="currentColor" rx="1"/>
          <rect x="26.5" y="44" width="10" height="3" fill="currentColor" rx="1"/>
        </svg>
        KaeruKàphê
      </a>
      ${tableId ? `<div class="table-chip">Bàn ${tableId}</div>` : '<div></div>'}
    </header>
    <div class="cat-scroll"><div class="cat-pills">${renderCatPills()}</div></div>
    <main class="menu-list">${html || '<p class="empty">Không có món nào.</p>'}</main>
    ${cartBadge()}`;
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
function renderSuccessScreen() {
  const isDelivery = lastOrder.delivery === 'delivery';
  const hasBankInfo = BANK_QR.acct && BANK_QR.bank;

  const qrUrl = hasBankInfo
    ? buildVietQRUrl(lastOrder.total, lastOrder.shortCode)
    : null;

  let paymentBlock = '';
  if (lastOrder.paymentMethod === 'bank_transfer') {
    paymentBlock = hasBankInfo ? `
        <div class="qr-block">
          <div class="qr-label">Quét QR — số tiền & nội dung đã có sẵn</div>
          <img class="qr-img" src="${qrUrl}" alt="QR ngân hàng ${BANK_QR.bank} · ${fmt(lastOrder.total)}">
          <div class="bank-info-text">
            <div class="bank-name-badge">${BANK_QR.bank}</div>
            <div class="bank-acct">${BANK_QR.acct}</div>
            <div class="bank-owner">${BANK_QR.name}</div>
          </div>
          <div class="ck-instruction">Hoặc CK thủ công với nội dung:</div>
          <div class="ck-code">${lastOrder.shortCode}</div>
          <div class="ck-amount">Số tiền: <strong>${fmt(lastOrder.total)}</strong></div>
        </div>`
    : `<div class="payment-note">
         💳 Chuyển khoản ngân hàng<br>
         <div class="ck-instruction" style="margin-top:8px">Ghi nội dung CK:</div>
         <div class="ck-code">${lastOrder.shortCode}</div>
       </div>`;
  } else {
    // cash payment method
    if (isDelivery) {
      paymentBlock = `
        <div class="payment-note">
          💵 Bạn hãy thanh toán <strong>${fmt(lastOrder.total)}</strong> tiền mặt khi nhận hàng nhé!
        </div>`;
    } else {
      paymentBlock = `
        <div class="payment-note">
          💵 Bạn hãy thanh toán tại quầy nhé!<br>
          <div class="ck-instruction" style="margin-top:8px">Số tiền cần thanh toán:</div>
          <div class="ck-amount" style="font-size:24px; color:var(--accent); font-weight:bold; margin-top:4px;">${fmt(lastOrder.total)}</div>
        </div>`;
    }
  }

  return `
    <main class="success-screen">
      <div class="success-icon">${isDelivery ? '🛵' : '✅'}</div>
      <h1 class="success-title">Đơn đã gửi!</h1>
      <p class="success-sub">
        ${isDelivery
          ? 'Đơn giao hàng đã tiếp nhận — cảm ơn bạn!'
          : 'Nhân viên đang xác nhận — vui lòng đợi chút ☕'}
      </p>
      ${isDelivery ? `
      <div class="delivery-confirm-note">
        📞 Chúng mình sẽ gọi cho bạn để xác nhận lại đơn hàng nhé
      </div>` : ''}
      ${paymentBlock}
      <button class="btn-secondary" data-action="go-menu">Đặt thêm</button>
    </main>`;
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
  } else if (screen === 'success') {
    contentHtml = renderSuccessScreen();
  } else if (screen === 'menu') {
    const existingItemSheet = document.getElementById('item-sheet');
    const existingCartSheet = document.getElementById('cart-sheet');
    const existingUpsellSheet = document.getElementById('upsell-sheet');

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
  }
}

// ─── SHEET OPEN / CLOSE ──────────────────────────────────────────────────────
function openItemSheet(sku) {
  selItem = MENU_DATA.find(m => m.sku === sku);
  if (!selItem) return;
  initOpts(selItem);
  sheet = 'item';
  render();
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
  const shortCode = genShortCode();

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
      use_free_drink: checkoutFormState.useFreeDrink,
      ...(isDelivery && { delivery_address: address }),
    },
  };

  // UI: loading
  submitting = true;
  const btn = document.getElementById('btn-submit');
  if (btn) { btn.textContent = 'Đang gửi...'; btn.disabled = true; }

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
    });

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

    lastOrder = { shortCode, total, delivery: deliveryMode, paymentMethod: paymentMethod };
    clearCart();
    screen = 'success';
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

    case 'open-item':
      openItemSheet(el.dataset.sku);
      break;

    case 'quick-add':
      e.stopPropagation();
      quickAdd(el.dataset.sku);
      break;

    case 'open-cart':
      openCartSheet();
      break;

    case 'close-sheet':
      closeSheet();
      break;

    case 'opt': {
      const key = el.dataset.key, val = el.dataset.val;
      selOpts[key] = val;
      render();
      break;
    }

    case 'topping': {
      const id = el.dataset.id, name = el.dataset.name, price = Number(el.dataset.price);
      const tops = selOpts.toppings || [];
      const idx  = tops.findIndex(t => t.id === id);
      if (idx >= 0) tops.splice(idx, 1); else tops.push({ id, name, price });
      selOpts.toppings = tops;
      render();
      break;
    }

    case 'qty': {
      const delta = Number(el.dataset.delta);
      selOpts.qty = Math.max(1, Math.min(10, (selOpts.qty || 1) + delta));
      render();
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
  'img/stk-quyet-tam.webp',
  'img/stk-vui-ve.webp',
  'img/stk-ngac-nhien.webp',
  'img/stk-buon-ngu.webp',
  'img/stk-tu-hao.webp',
  'img/stk-tam-biet.webp',
  'img/stk-quyet-tam.webp',
  'img/stk-vui-ve.webp',
  'img/stk-ngac-nhien.webp',
  'img/stk-tu-hao.webp'
];

function renderLoyaltySection() {
  const phone = checkoutFormState.phone.replace(/\D/g, '');
  if (phone.length < 9) return '';

  if (loadingLoyalty) {
    return `<div class="loyalty-loading" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 8px; font-style: italic;">Đang tìm thẻ tích tem... 🐸</div>`;
  }

  const stamps = customerLoyalty ? (customerLoyalty.stamp_count || 0) : 0;
  const freeEarned = customerLoyalty ? (customerLoyalty.free_drinks_earned || 0) : 0;
  const freeUsed = customerLoyalty ? (customerLoyalty.free_drinks_used || 0) : 0;
  const freeAvailable = Math.max(0, freeEarned - freeUsed);

  let gridHtml = '';
  for (let i = 0; i < 10; i++) {
    const isActive = i < stamps;
    if (isActive) {
      const stickerImg = STAMP_STICKERS[i] || 'img/stk-quyet-tam.webp';
      gridHtml += `
        <div class="stamp-slot active" title="Tem ${i+1}">
          <img src="${stickerImg}" class="stamp-img" alt="🐸">
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
          <span>Thẻ tích tem Kaeru</span>
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

function applyPromo5Percent(active) {
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * 0.95);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * 0.95);
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
    applyPromo5Percent(false);
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
    applyPromo5Percent(true);
    syncCartPrices();
    startPromoCountdown();
  } else {
    applyPromo5Percent(false);
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

  render();
  checkPromoStatus().then(() => render());
  
  // Khởi chạy vòng lặp kiểm tra khách quen từ Camera AI (3 giây/lần)
  setInterval(pollActiveCustomer, 3000);
}

// ─── CAMERA AI INTEGRATION (ACTIVE CUSTOMER POLLING) ──────────────────────────
let lastActiveCustomerId = null;

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

    if (data.detected) {
      if (data.customer_id !== lastActiveCustomerId) {
        lastActiveCustomerId = data.customer_id;
        
        // Hiện thông báo toast chào mừng
        showToast(`🐸 Chào mừng ${data.name} quay lại!`);
        
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
    // Tránh in log lỗi liên tục nếu Flask Server không chạy
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
      <span class="cs-avatar">🐸</span>
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
