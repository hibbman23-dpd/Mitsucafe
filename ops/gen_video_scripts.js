/*
 * gen_video_scripts.js — Kịch bản VIDEO ngắn pre-launch cho Mitsu (KHÔNG gồm phim story chính —
 * chủ làm riêng bên Higgsfield). Sinh shot-by-shot để quay điện thoại / dựng CapCut, có gợi ý
 * Higgsfield cho cảnh cần. Output docs/content/video-scripts.{json,md}.
 *
 * Chạy: node ops/gen_video_scripts.js   ·   --dry-run
 */
const fs = require('fs');
const path = require('path');
const { genJSON, PROJECT, REGION, MODEL } = require('./vertex');

const BRAND = 'Mitsu (蜜 = mật ong) — cà phê/trà & bánh kissaten Nhật ở Đinh Văn, Lâm Hà. Tông màu mật ong/gỗ ấm, ánh sáng dịu, mộc, tinh tế. Khai trương ~giữa tháng 7.';
const RULE = 'Tiếng Việt. KHÔNG bịa ngày/giá/tên món cụ thể → [chủ điền: ...]. Mỗi cảnh ngắn (2-4s), tổng đúng duration. text_overlay ngắn gọn. higgsfield_hint = mô tả cảnh nếu muốn tạo bằng AI (nếu quay thật thì ghi "quay thật").';

// 6 kịch bản short-form (KHÔNG gồm phim story chính)
const BRIEFS = [
  { key: 'VS1-teaser', dur: 15, brief: 'Teaser bí ẩn: giọt mật ong vàng nhỏ giọt, hint chữ 蜜, chưa lộ quán — "điều ngọt ngào sắp đến Lâm Hà". Gây tò mò.' },
  { key: 'VS2-hautruong', dur: 25, brief: 'Hậu trường dựng quán: montage set up bàn ghế gỗ, kệ, cây xanh, ánh sáng — cảm giác sắp xong, tâm huyết.' },
  { key: 'VS3-countdown', dur: 12, brief: 'Đếm ngược nhanh, cắt dồn dập theo nhịp nhạc, số ngày còn lại, kết bằng logo + [chủ điền: ngày khai trương].' },
  { key: 'VS4-khaitruong', dur: 20, brief: 'Mời ghé khai trương: không gian hoàn thiện, ly đồ uống bốc khói/đá, nụ cười nhân viên, công bố ưu đãi [chủ điền].' },
  { key: 'VS5-POV-trend', dur: 15, brief: 'POV trend: "POV: bạn vừa tìm thấy một góc Nhật yên bình giữa Lâm Hà" — góc quay thứ nhất, chill, bắt trend TikTok.' },
  { key: 'VS6-tour', dur: 20, brief: 'Tour không gian: lia máy mượt qua các góc đẹp của quán, nhấn chi tiết kissaten/mật ong, mời khách đến trải nghiệm.' }
];

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    platform: { type: 'string' },
    duration_sec: { type: 'number' },
    concept: { type: 'string' },
    music_vibe: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shot: { type: 'number' },
          seconds: { type: 'string' },
          visual: { type: 'string' },
          text_overlay: { type: 'string' },
          audio_vo: { type: 'string' },
          higgsfield_hint: { type: 'string' },
          transition: { type: 'string' }
        },
        required: ['shot', 'seconds', 'visual', 'text_overlay', 'audio_vo', 'higgsfield_hint', 'transition']
      }
    },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    cta: { type: 'string' }
  },
  required: ['title', 'platform', 'duration_sec', 'concept', 'music_vibe', 'scenes', 'caption', 'hashtags', 'cta']
};

async function main() {
  const dry = process.argv.includes('--dry-run');
  console.log(`Video scripts · model ${MODEL} @ ${PROJECT}/${REGION}${dry ? ' [DRY-RUN]' : ''}`);
  if (dry) { BRIEFS.forEach(b => console.log(`  - ${b.key} (${b.dur}s): ${b.brief.slice(0, 50)}…`)); return; }

  const pack = { generated_at: new Date().toISOString(), review_required: true, scripts: [] };
  for (const b of BRIEFS) {
    try {
      const out = await genJSON(
        `${BRAND}\n${RULE}\nKịch bản video ngắn ~${b.dur}s cho ${b.key}: ${b.brief}\nChia cảnh (shot 1..n, mỗi cảnh có mốc giây "0-3s", visual, text_overlay, audio_vo (lời/âm thanh), higgsfield_hint, transition). Thêm music_vibe, caption đăng kèm, hashtags (4-6), cta. Trả JSON đúng schema.`,
        SCHEMA, { maxOutputTokens: 2048, temperature: 0.9 }
      );
      out._key = b.key;
      pack.scripts.push(out);
      console.log(`  ✓ ${b.key}: ${out.scenes.length} cảnh / ${out.duration_sec}s`);
    } catch (e) { console.error(`  ✗ ${b.key}: ${e.message}`); }
  }

  fs.mkdirSync(path.join(__dirname, '../docs/content'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../docs/content/video-scripts.json'), JSON.stringify(pack, null, 2), 'utf8');

  let md = `# Kịch bản VIDEO ngắn pre-launch — Mitsu (DRAFT)\n\n> Sinh ${pack.generated_at} bởi ops/gen_video_scripts.js. KHÔNG gồm phim story chính (chủ làm riêng).\n> Quay điện thoại / dựng CapCut; cảnh cần AI thì dùng higgsfield_hint. Điền [chủ điền:...] trước khi đăng.\n`;
  for (const s of pack.scripts) {
    md += `\n## ${s._key} — ${s.title}\n**Kênh:** ${s.platform} · **Thời lượng:** ${s.duration_sec}s · **Nhạc:** ${s.music_vibe}\n**Concept:** ${s.concept}\n\n| # | Giây | Hình | Chữ trên màn | Âm/Lời | Higgsfield/Quay | Chuyển |\n|---|---|---|---|---|---|---|\n`;
    s.scenes.forEach(c => { md += `| ${c.shot} | ${c.seconds} | ${c.visual} | ${c.text_overlay} | ${c.audio_vo} | ${c.higgsfield_hint} | ${c.transition} |\n`; });
    md += `\n**Caption:** ${s.caption}\n**Hashtag:** ${(s.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')}\n**CTA:** ${s.cta}\n`;
  }
  fs.writeFileSync(path.join(__dirname, '../docs/content/video-scripts.md'), md, 'utf8');

  console.log(`\n✅ ${pack.scripts.length} kịch bản → docs/content/video-scripts.{json,md}`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
