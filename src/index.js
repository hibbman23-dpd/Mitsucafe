/**
 * Cloudflare Worker "mitsucafe" — phục vụ các trang CÔNG KHAI (web/) + lớp bảo mật.
 *
 * Công khai: landing (mitsu.html), đặt hàng khách (index.html), signage.
 * Trang điều khiển nội bộ (dashboard / kds / camera) KHÔNG phục vụ ở đây —
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
  '/dashboard.html', '/kds.html', '/camera.html',
  '/dashboard', '/kds', '/camera',
];

// Trang công khai nhưng không muốn index (signage trên màn hình tại quán).
const NOINDEX_PATHS = ['/signage.html', '/signage'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Redirect /mitsu or /mitsu.html to the clean root "/"
    if (url.pathname === '/mitsu' || url.pathname === '/mitsu.html') {
      return Response.redirect(url.origin + '/', 301);
    }

    // 301 Redirects from old Kaeru URLs to new Mitsu URLs
    if (url.pathname === '/kaeru' || url.pathname === '/kaeru.html') {
      return Response.redirect(url.origin + '/', 301);
    }

    // Rewrite root "/" to serve "mitsu.html"
    if (url.pathname === '/') {
      url.pathname = '/mitsu.html';
      const modifiedRequest = new Request(url.toString(), request);
      const assetRes = await env.ASSETS.fetch(modifiedRequest);
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
    return res;
  },
};
