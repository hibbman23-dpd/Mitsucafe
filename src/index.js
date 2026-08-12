/**
 * Cloudflare Worker "mitsucafe" — phục vụ các trang CÔNG KHAI (web/) + lớp bảo mật.
 *
 * Công khai: landing (mitsu.html), đặt hàng khách (index.html), signage.
 * Trang điều khiển nội bộ (dashboard / kds / camera / chấm công) KHÔNG phục vụ ở đây —
 *   worker này trả 404 cho chúng; chúng chỉ sống trên worker "mitsu-ops"
 *   (hostname riêng, sau Cloudflare Access). Mọi cập nhật trang nội bộ → mitsu-ops.
 *
 * Nhiệm vụ:
 *   1. Security headers cho MỌI response (HSTS, X-Frame-Options, CSP cơ bản…).
 *   2. Chặn (404) các path điều khiển để người ngoài không vào được.
 *   3. noindex cho signage (công khai nhưng không muốn lên search).
 *
 * Deploy: wrangler deploy (CI tự động khi push main).
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

// Trang điều khiển nội bộ — CHẶN trên worker công khai (chỉ mitsu-ops phục vụ).
// Gồm cả biến thể extensionless do assets html_handling redirect .html → /path.
const BLOCKED_PATHS = [
  '/dashboard.html', '/kds.html', '/camera.html', '/cham-cong.html',
  '/dashboard', '/kds', '/camera', '/cham-cong',
  // Script chỉ trang nội bộ dùng — chặn luôn để không lộ endpoint nội bộ.
  '/cham-cong.js',
];

// Trang công khai nhưng không muốn index (signage trên màn hình tại quán).
const NOINDEX_PATHS = ['/signage.html', '/signage'];

// Asset có version query (?v=...) đổi tên khi nội dung đổi → cache dài hạn an toàn.
const VERSIONED_ASSET_RE = /\.(css|js|webp|png|svg|woff2)$/i;

// Bot UA phổ biến (crawler/monitoring) — không log hit cho các request này.
const BOT_UA_RE = /bot|crawler|spider|preview|lighthouse|headless/i;

// Web app GAS đang sống (cùng URL client dùng cho order.js/kds.html/dashboard.html).
const GAS_URL = 'https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec';

/**
 * HTML navigation công khai — điều kiện log (thay GA4 client-side, xem
 * docs/ga4-to-cloudflare-plan.md). GET + Accept:text/html + UA không phải bot +
 * path "/" hoặc ".html" công khai (không BLOCKED_PATHS/NOINDEX_PATHS/sig-img).
 */
function isHtmlNavRequest(request, url) {
  if (request.method !== 'GET') return false;
  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/html')) return false;
  const ua = request.headers.get('User-Agent') || '';
  if (BOT_UA_RE.test(ua)) return false;
  if (url.pathname !== '/' && !url.pathname.endsWith('.html')) return false;
  if (BLOCKED_PATHS.includes(url.pathname)) return false;
  if (NOINDEX_PATHS.includes(url.pathname)) return false;
  if (url.pathname.startsWith('/sig-img/')) return false;
  return true;
}

/**
 * Log 1 lượt xem trang → GAS action=web_hit (fire-and-forget qua ctx.waitUntil).
 * KHÔNG lưu IP thô: visitor_hash = SHA-256(IP+UA+ngày) cắt 16 ký tự, đổi mỗi ngày.
 * Lỗi thì nuốt im — không được ảnh hưởng serve trang.
 */
async function logWebHit(request, env) {
  try {
    const url = new URL(request.url);
    const ua = request.headers.get('User-Agent') || '';
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const day = new Date().toISOString().slice(0, 10);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ua + day));
    const visitorHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    let refererHost = '';
    const refHeader = request.headers.get('Referer');
    if (refHeader) {
      try { refererHost = new URL(refHeader).hostname; } catch (_) { refererHost = ''; }
    }

    const cf = request.cf || {};
    const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';

    const body = {
      action: 'web_hit',
      path: url.pathname,
      utm_source: url.searchParams.get('utm_source') || '',
      utm_medium: url.searchParams.get('utm_medium') || '',
      utm_campaign: url.searchParams.get('utm_campaign') || '',
      referer: refererHost,
      country: cf.country || '',
      city: cf.city || '',
      region: cf.region || '',
      device,
      visitor_hash: visitorHash,
    };

    const token = env.REPORT_API_TOKEN || '';
    await fetch(GAS_URL + '?action=web_hit&token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {
    // nuốt im — logging không được phép làm gãy serve trang
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Redirect /mitsu or /mitsu.html to the clean root "/"
    if (url.pathname === '/mitsu' || url.pathname === '/mitsu.html') {
      return Response.redirect(url.origin + '/', 301);
    }

    // 301 Redirects from old Kaeru URLs to new Mitsu URLs
    if (url.pathname === '/kaeru' || url.pathname === '/kaeru.html') {
      return Response.redirect(url.origin + '/', 301);
    }

    // Log hit TRƯỚC khi serve — đặt sau các redirect ở trên để không đếm hit cho URL
    // cũ (chỉ redirect, không thực sự render trang).
    if (isHtmlNavRequest(request, url)) ctx.waitUntil(logWebHit(request, env));

    // Root "/": QR bàn (?t=NN) → ordering app (index.html), giữ nguyên query;
    //           còn lại → landing (mitsu.html). Rewrite (không redirect) để URL sạch.
    if (url.pathname === '/') {
      const u = new URL(url);
      u.pathname = url.searchParams.has('t') ? '/index.html' : '/mitsu.html';
      const assetRes = await env.ASSETS.fetch(new Request(u.toString(), request));
      const res = new Response(assetRes.body, assetRes);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
      return res;
    }

    // Public read-only image serving for signage (R2). Stable, cacheable, same-origin.
    if (url.pathname.startsWith('/sig-img/')) {
      const key = url.pathname.slice('/sig-img/'.length);
      if (!key) return new Response('Not found', { status: 404 });
      const obj = await env.SIGN_IMG.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=604800, immutable');
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
      return new Response(obj.body, { headers });
    }

    // Chặn trang nội bộ: trả 404 trước khi chạm assets → không lộ sự tồn tại.
    if (BLOCKED_PATHS.includes(url.pathname)) {
      const res = new Response('Not found', { status: 404 });
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
      res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return res;
    }

    const assetRes = await env.ASSETS.fetch(request);
    const res = new Response(assetRes.body, assetRes);

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    if (NOINDEX_PATHS.includes(url.pathname)) res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

    // Ảnh trong /img/ (path ổn định, đổi ảnh = đổi tên file) hoặc CSS/JS có ?v= cache-bust
    // → cache dài hạn an toàn. HTML giữ nguyên must-revalidate (SW đã stale-while-revalidate).
    const isImgAsset = url.pathname.startsWith('/img/');
    const isVersionedAsset = VERSIONED_ASSET_RE.test(url.pathname) && url.searchParams.has('v');
    if (isImgAsset || isVersionedAsset) {
      res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return res;
  },
};
