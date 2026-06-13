/**
 * Cloudflare Worker — phục vụ static assets (web/) + lớp bảo mật.
 *
 * Nhiệm vụ:
 *   1. Thêm security headers cho MỌI response (HSTS, X-Frame-Options, CSP cơ bản…).
 *   2. Tiêm REPORT_API_TOKEN (Worker secret) vào kds.html lúc serve —
 *      token KHÔNG nằm trong git, KHÔNG lộ ra file tĩnh.
 *   3. Trang điều khiển (dashboard/kds/camera) đặt sau Cloudflare Access
 *      (cấu hình ở Zero Trust dashboard — KHÔNG enforce trong code này).
 *
 * Deploy: wrangler deploy. Secret: wrangler secret put REPORT_API_TOKEN
 *         (giá trị khớp CONFIG.REPORT_API_TOKEN bên Google Apps Script).
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

// Trang điều khiển nội bộ — nhận cả X-Robots-Tag LẪN CONTROL_CSP chặt.
// Gồm cả biến thể extensionless do assets html_handling redirect .html → /path.
const CONTROL_PATHS = [
  '/dashboard.html', '/kds.html', '/camera.html',
  '/dashboard', '/kds', '/camera',
];
// Trang không muốn index nhưng KHÔNG phải control (signage giữ CSP YouTube-friendly của riêng nó).
const NOINDEX_PATHS = CONTROL_PATHS.concat(['/signage.html', '/signage']);

// CSP chặt CHỈ cho trang control (không áp cho trang marketing vì có embed YouTube/social).
// Giữ 'unsafe-inline' vì các trang dùng nhiều onclick + inline script/style; ĐÃ bỏ 'unsafe-eval'.
// localhost:5000 cho camera (API máy in/AI local). frame-ancestors 'none' = chống clickjacking.
const CONTROL_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://cloudflareinsights.com http://localhost:5000",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://script.google.com",
].join('; ');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetRes = await env.ASSETS.fetch(request);

    let res;
    // Tiêm token vào kds.html (màn POS) — chỉ trang này cần.
    if (url.pathname === '/kds.html' || url.pathname === '/kds') {
      const token = env.REPORT_API_TOKEN || '';
      let body = await assetRes.text();
      body = body.split('__REPORT_API_TOKEN__').join(token);
      // Tạo header mới: bỏ content-encoding/length cũ (body đã đổi → để runtime tự tính).
      const headers = new Headers(assetRes.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.set('content-type', 'text/html; charset=utf-8');
      res = new Response(body, { status: assetRes.status, statusText: assetRes.statusText, headers });
    } else {
      res = new Response(assetRes.body, assetRes);
    }

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    if (NOINDEX_PATHS.includes(url.pathname)) res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (CONTROL_PATHS.includes(url.pathname)) res.headers.set('Content-Security-Policy', CONTROL_CSP);
    return res;
  },
};
