/*
 * gen_seo.js — Sinh kho nội dung SEO hyper-local (Vertex Gemini) cho Mitsu / Lâm Hà.
 * Đón khách pass-through (Đà Lạt→Đức Trọng→Lâm Hà) + phủ vùng (Đinh Văn, Tân Hà, Đạ Me).
 * Tài sản pre-launch 1 lần → đăng dần (GBP post / blog / Q&A). Output docs/content/seo-pack.json (+ .md).
 *
 * Chạy: node ops/gen_seo.js   ·   --dry-run
 *
 * ⚠️ AI-generated DRAFT → CHỦ DUYỆT trước khi đăng. Prompt ép KHÔNG bịa khoảng cách/landmark
 *    cụ thể (để placeholder cho chủ điền) — tránh nội dung sai bị Google phạt.
 */
const fs = require('fs');
const path = require('path');
const { genJSON, PROJECT, REGION, MODEL } = require('./vertex');

const BRAND = 'Mitsu (蜜 = mật ong) — cà phê/trà & bánh phong cách kissaten Nhật, ở Đinh Văn, Lâm Hà, Lâm Đồng. Giọng ấm, mộc, tinh tế. Khách: dân địa phương + khách đi tuyến Đà Lạt→Đức Trọng→Lâm Hà.';
const RULE = 'QUAN TRỌNG: KHÔNG bịa số km, thời gian di chuyển, tên thác/địa danh cụ thể hay sự kiện nếu không chắc — chỗ nào cần số liệu thực tế thì để placeholder dạng [chủ điền: ...]. Viết tự nhiên, hữu ích cho người đọc, KHÔNG nhồi từ khoá.';

const AREAS = [
  { key: 'tuyen-duc-trong-lam-ha', label: 'Tuyến đường Đà Lạt – Đức Trọng – Lâm Hà (trạm dừng chân / quán café ngắm cảnh)' },
  { key: 'dinh-van', label: 'Đinh Văn — trung tâm Lâm Hà (café đẹp, chỗ họp nhóm)' },
  { key: 'tan-ha', label: 'Tân Hà, Lâm Hà (quán nước chill)' },
  { key: 'da-me', label: 'Đạ Me / vùng du lịch sinh thái Lâm Hà (cẩm nang ăn uống nghỉ chân)' }
];

const AREA_SCHEMA = {
  type: 'object',
  properties: {
    intro_blurb: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    gbp_post: { type: 'string' }
  },
  required: ['intro_blurb', 'keywords', 'gbp_post']
};
const FAQ_SCHEMA = {
  type: 'object',
  properties: { faqs: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } } },
  required: ['faqs']
};

async function main() {
  const dry = process.argv.includes('--dry-run');
  console.log(`SEO pack · model ${MODEL} @ ${PROJECT}/${REGION}${dry ? ' [DRY-RUN]' : ''}`);
  if (dry) { AREAS.forEach(a => console.log('  -', a.key, a.label)); console.log('  + ~15 FAQ Q&A'); return; }

  const pack = { generated_at: new Date().toISOString(), review_required: true, areas: {}, faqs: [] };

  for (const area of AREAS) {
    try {
      const out = await genJSON(
        `${BRAND}\n${RULE}\nVùng/chủ đề: "${area.label}".\nViết tiếng Việt, trả JSON: intro_blurb (3-4 câu giới thiệu Mitsu gắn vùng này, hữu ích cho người đang tìm quán ở đây); keywords (6 từ khoá tìm kiếm địa phương tự nhiên); gbp_post (1 bài đăng Google Business Profile ~60-80 từ, có CTA ghé quán).`,
        AREA_SCHEMA, { maxOutputTokens: 900 }
      );
      pack.areas[area.key] = { label: area.label, ...out };
      console.log(`  ✓ ${area.key} (${out.keywords.length} kw)`);
    } catch (e) { console.error(`  ✗ ${area.key}: ${e.message}`); }
  }

  try {
    const f = await genJSON(
      `${BRAND}\n${RULE}\nViết 15 cặp Hỏi-Đáp THẬT mà khách hay hỏi 1 quán café ở Lâm Hà (giờ mở cửa, chỗ đậu xe, wifi, đồ uống đặc trưng, có bánh không, đường đi từ Đà Lạt, không gian làm việc/họp nhóm, thanh toán, đặt trước, thú cưng...). Câu trả lời ngắn, thân thiện, đúng tinh thần Mitsu. Trả JSON {faqs:[{q,a}]}. Chỗ cần số liệu thật để [chủ điền: ...].`,
      FAQ_SCHEMA, { maxOutputTokens: 2048, temperature: 0.7 }
    );
    pack.faqs = f.faqs || [];
    console.log(`  ✓ FAQ: ${pack.faqs.length} cặp`);
  } catch (e) { console.error(`  ✗ FAQ: ${e.message}`); }

  fs.mkdirSync(path.join(__dirname, '../docs/content'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../docs/content/seo-pack.json'), JSON.stringify(pack, null, 2), 'utf8');

  // .md dễ đọc/duyệt
  let md = `# Kho SEO hyper-local — DRAFT (AI, duyệt trước khi đăng)\n\n> Sinh ${pack.generated_at} bởi ops/gen_seo.js. Chỗ [chủ điền:...] cần số liệu thật.\n`;
  for (const k in pack.areas) {
    const a = pack.areas[k];
    md += `\n## ${a.label}\n\n${a.intro_blurb}\n\n**Từ khoá:** ${a.keywords.join(' · ')}\n\n**GBP post:**\n> ${a.gbp_post}\n`;
  }
  md += `\n## FAQ (Google Maps Q&A — đăng dần, tự nhiên)\n`;
  pack.faqs.forEach((x, i) => { md += `\n**${i + 1}. ${x.q}**\n${x.a}\n`; });
  fs.writeFileSync(path.join(__dirname, '../docs/content/seo-pack.md'), md, 'utf8');

  console.log(`\n✅ ${Object.keys(pack.areas).length} vùng + ${pack.faqs.length} FAQ → docs/content/seo-pack.{json,md}`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
