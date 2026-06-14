/**
 * Cloudflare Worker "kaeru-ops" — phục vụ RIÊNG các trang điều khiển
 * (dashboard / kds / camera) trên hostname riêng kaeru-ops.<acct>.workers.dev,
 * đặt sau Cloudflare Access (bật toàn-domain ở Zero Trust dashboard cho worker này).
 *
 * Dùng CHUNG thư mục assets web/ với worker chính (không nhân đôi file).
 * Worker chính (kaerukaphe) CHẶN các path control → chỉ worker này phục vụ chúng.
 *
 * Nhiệm vụ: security headers + CSP control pages + tiêm REPORT_API_TOKEN vào kds.
 * Secret: wrangler secret put REPORT_API_TOKEN --config wrangler.ops.jsonc
 *         (khớp CONFIG.REPORT_API_TOKEN bên Apps Script).
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

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

function jsonRes(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Signage image upload/delete (R2). Behind Cloudflare Access (whole worker) — staff only.
    if (url.pathname === '/sig-img' && request.method === 'POST') {
      const ct = request.headers.get('content-type') || '';
      if (!/^image\/(jpeg|png|webp)$/.test(ct)) return jsonRes({ ok: false, error: 'bad_type' }, 415);
      const buf = await request.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > 3 * 1024 * 1024) return jsonRes({ ok: false, error: 'bad_size' }, 413);
      const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
      const key = crypto.randomUUID() + '.' + ext;
      await env.SIGN_IMG.put(key, buf, { httpMetadata: { contentType: ct } });
      return jsonRes({ ok: true, key: key, url: '/sig-img/' + key }, 200);
    }
    if (url.pathname.startsWith('/sig-img/') && request.method === 'DELETE') {
      const key = url.pathname.slice('/sig-img/'.length);
      if (key) await env.SIGN_IMG.delete(key);
      return jsonRes({ ok: true }, 200);
    }

    const assetRes = await env.ASSETS.fetch(request);

    let res;
    if (url.pathname === '/kds.html' || url.pathname === '/kds') {
      const token = env.REPORT_API_TOKEN || '';
      let body = await assetRes.text();
      body = body.split('__REPORT_API_TOKEN__').join(token);
      const headers = new Headers(assetRes.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.set('content-type', 'text/html; charset=utf-8');
      res = new Response(body, { status: assetRes.status, statusText: assetRes.statusText, headers });
    } else {
      res = new Response(assetRes.body, assetRes);
    }

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    // Toàn bộ worker này là trang nội bộ → noindex + CSP cho tất cả.
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('Content-Security-Policy', CONTROL_CSP);
    return res;
  },
};
