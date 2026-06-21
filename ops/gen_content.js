/*
 * gen_content.js — Content factory (Vertex AI Gemini) cho Mitsu / Lâm Hà Kissaten.
 * Sinh "kho nội dung" 1 lần (pre-launch, tài sản giữ mãi): mỗi món menu →
 *   { description_vi, name_jp, caption_ig }. Đổ ra docs/content/menu-content-pack.json.
 *
 * Dùng credit GCP qua Vertex (project mitsucafe). Auth = ADC (gcloud auth application-default).
 *
 * Chạy:
 *   gcloud auth application-default login        # 1 lần nếu chưa có ADC
 *   node ops/gen_content.js --limit=2            # test 2 món
 *   node ops/gen_content.js                       # toàn menu
 *   node ops/gen_content.js --dry-run            # chỉ in món, không gọi Vertex
 *
 * Gotcha: gemini-2.5-flash "thinking" ăn hết maxOutputTokens → ĐẶT thinkingBudget:0 cho task content.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT = process.env.GCP_PROJECT || 'mitsucafe';
const REGION = process.env.GCP_REGION || 'us-central1';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MENU_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec?action=menu';
const OUT = path.join(__dirname, '../docs/content/menu-content-pack.json');

const BRAND = 'Mitsu (蜜 = mật ong) — quán cà phê/trà & bánh phong cách kissaten Nhật, ở Lâm Hà (cao nguyên Lâm Đồng). Giọng ấm áp, mộc mạc, tinh tế, không sến.';

function args() {
  const a = { limit: Infinity, dryRun: false, live: false };
  for (const x of process.argv.slice(2)) {
    if (x === '--dry-run') a.dryRun = true;
    else if (x === '--live') a.live = true;
    else if (x.startsWith('--limit=')) a.limit = parseInt(x.slice(8), 10) || Infinity;
  }
  return a;
}

function adcToken() {
  return execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
}

async function genForItem(item, token) {
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`;
  const prompt = `Thương hiệu: ${BRAND}
Món: "${item.name}"${item.name_jp ? ' (JP hiện có: ' + item.name_jp + ')' : ''}, nhóm: ${item.category || ''}, giá: ${item.price_m || item.price || ''}đ.
Viết tiếng Việt (trừ name_jp). Trả JSON: description_vi (1 câu ~20 từ, gợi vị + cảm giác, không sáo rỗng), name_jp (tên Nhật katakana/kanji ngắn hợp món, nếu đã có thì giữ/chuẩn hoá), caption_ig (1 caption Instagram vui, ấm, kèm đúng 2 hashtag tiếng Việt không dấu cách).`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          description_vi: { type: 'string' },
          name_jp: { type: 'string' },
          caption_ig: { type: 'string' }
        },
        required: ['description_vi', 'name_jp', 'caption_ig']
      }
    }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status !== 200) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const txt = data.candidates[0].content.parts[0].text;
  return JSON.parse(txt);
}

async function main() {
  const a = args();
  // Mặc định đọc menu LOCAL (seed/menu_items.json) — bền, không phụ thuộc /exec.
  // --live: lấy từ API (curl -L vì Apps Script 302→googleusercontent).
  let menu;
  if (a.live) {
    console.log('Menu ← live API…');
    menu = JSON.parse(execSync(`curl -sSL "${MENU_URL}&_cb=${Date.now()}${Math.random()}"`, { encoding: 'utf8', maxBuffer: 10485760 })).items || [];
  } else {
    console.log('Menu ← seed/menu_items.json (local)');
    menu = JSON.parse(fs.readFileSync(path.join(__dirname, '../seed/menu_items.json'), 'utf8'));
  }
  const items = menu.slice(0, a.limit);
  console.log(`${menu.length} món, xử lý ${items.length}${a.dryRun ? ' [DRY-RUN]' : ''} · model ${MODEL} @ ${PROJECT}/${REGION}`);
  if (a.dryRun) { items.forEach(i => console.log('  -', i.sku, i.name)); return; }

  const token = adcToken();
  const out = {};
  for (const it of items) {
    try {
      out[it.sku] = { name: it.name, ...(await genForItem(it, token)) };
      console.log(`  ✓ ${it.sku} ${it.name} → ${out[it.sku].name_jp}`);
    } catch (e) {
      console.error(`  ✗ ${it.sku}: ${e.message}`);
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✅ ${Object.keys(out).length} món → ${path.relative(process.cwd(), OUT)}`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
