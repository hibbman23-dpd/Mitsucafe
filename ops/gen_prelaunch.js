/*
 * gen_prelaunch.js — Bộ nội dung "SẮP KHAI TRƯƠNG" cho Mitsu (tạo nhận biết TRƯỚC khi mở).
 * Lịch 4 giai đoạn dẫn tới ngày khai trương (~giữa tháng 7). Vertex Gemini sinh caption đa kênh.
 * Output docs/content/prelaunch-pack.{json,md}. AI DRAFT → chủ duyệt + điền [chủ điền:...] trước khi đăng.
 *
 * Chạy: node ops/gen_prelaunch.js   ·   --dry-run
 */
const fs = require('fs');
const path = require('path');
const { genJSON, PROJECT, REGION, MODEL } = require('./vertex');

const BRAND = 'Mitsu (蜜 = mật ong, hình tượng ong/mật) — quán cà phê/trà & bánh phong cách kissaten Nhật, ở Đinh Văn, Lâm Hà (cao nguyên Lâm Đồng). Tinh thần: ấm, mộc, tinh tế, ngọt ngào dịu dàng. Khai trương khoảng giữa tháng 7. Kênh: Facebook, Instagram, TikTok, Threads, Zalo OA.';
const RULE = 'Tiếng Việt. KHÔNG bịa ngày/giờ/giá cụ thể — dùng [chủ điền: ...] cho ngày khai trương, ưu đãi cụ thể, địa chỉ chi tiết. Giọng tự nhiên, không sáo. hashtag tiếng Việt không dấu cách.';

const PHASES = [
  { key: 'P1-teaser', name: 'Giai đoạn 1 — Úp mở (bí ẩn, gây tò mò)', n: 3,
    intent: 'Chưa lộ hết — gợi "có điều ngọt ngào sắp đến Lâm Hà", hint hình ảnh ong/mật, đếm ngược mơ hồ. Mục tiêu: tò mò + follow.' },
  { key: 'P2-reveal', name: 'Giai đoạn 2 — Lộ diện thương hiệu', n: 3,
    intent: 'Giới thiệu Mitsu 蜜: ý nghĩa cái tên (mật ong), concept kissaten Nhật, không gian mộc ấm, vị trí Đinh Văn. Vì sao Lâm Hà cần một nơi như vậy.' },
  { key: 'P3-hautruong', name: 'Giai đoạn 3 — Hậu trường', n: 3,
    intent: 'Behind-the-scenes: pha chế thử, set up quán, góc đẹp, đội ngũ. Tạo cảm giác chân thật, gần gũi, sắp xong.' },
  { key: 'P4-countdown', name: 'Giai đoạn 4 — Đếm ngược & khai trương', n: 4,
    intent: 'Đếm ngược (còn vài ngày), công bố ngày khai trương + ưu đãi khai trương, lời mời ghé. Bài cuối = thông báo khai trương chính thức.' }
];

const SCHEMA = {
  type: 'object',
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          hook: { type: 'string' },
          caption: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
          visual_idea: { type: 'string' },
          cta: { type: 'string' }
        },
        required: ['platform', 'hook', 'caption', 'hashtags', 'visual_idea', 'cta']
      }
    }
  },
  required: ['posts']
};

async function main() {
  const dry = process.argv.includes('--dry-run');
  console.log(`Pre-launch pack · model ${MODEL} @ ${PROJECT}/${REGION}${dry ? ' [DRY-RUN]' : ''}`);
  if (dry) { PHASES.forEach(p => console.log(`  - ${p.key}: ${p.n} bài`)); return; }

  const pack = { generated_at: new Date().toISOString(), review_required: true, phases: [] };
  for (const ph of PHASES) {
    try {
      const out = await genJSON(
        `${BRAND}\n${RULE}\n${ph.name}: ${ph.intent}\nSinh ${ph.n} bài đăng, phân bổ qua các kênh (FB/IG/TikTok/Threads/Zalo) hợp với từng nội dung. Mỗi bài: platform, hook (tiêu đề/câu mở ngắn), caption (đăng được luôn), hashtags (4-6), visual_idea (gợi ý ảnh/video để chụp hoặc tạo bằng Higgsfield), cta. Trả JSON {posts:[...]}.`,
        SCHEMA, { maxOutputTokens: 2048, temperature: 0.95 }
      );
      pack.phases.push({ key: ph.key, name: ph.name, posts: out.posts || [] });
      console.log(`  ✓ ${ph.key}: ${(out.posts || []).length} bài`);
    } catch (e) { console.error(`  ✗ ${ph.key}: ${e.message}`); }
  }

  fs.mkdirSync(path.join(__dirname, '../docs/content'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../docs/content/prelaunch-pack.json'), JSON.stringify(pack, null, 2), 'utf8');

  let md = `# Bộ nội dung SẮP KHAI TRƯƠNG — Mitsu (DRAFT, duyệt trước khi đăng)\n\n> Sinh ${pack.generated_at} bởi ops/gen_prelaunch.js. Điền [chủ điền:...] (ngày khai trương, ưu đãi, địa chỉ) trước khi đăng.\n> Gợi ý lịch: GĐ1 ~3 tuần trước → GĐ2 ~2 tuần → GĐ3 ~1 tuần → GĐ4 vài ngày cuối + ngày khai trương.\n`;
  for (const ph of pack.phases) {
    md += `\n## ${ph.name}\n`;
    ph.posts.forEach((p, i) => {
      md += `\n### ${ph.key}.${i + 1} · ${p.platform}\n**Hook:** ${p.hook}\n\n${p.caption}\n\n**Hashtag:** ${(p.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')}\n**Ảnh/Video:** ${p.visual_idea}\n**CTA:** ${p.cta}\n`;
    });
  }
  fs.writeFileSync(path.join(__dirname, '../docs/content/prelaunch-pack.md'), md, 'utf8');

  const total = pack.phases.reduce((s, p) => s + p.posts.length, 0);
  console.log(`\n✅ ${pack.phases.length} giai đoạn · ${total} bài → docs/content/prelaunch-pack.{json,md}`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
