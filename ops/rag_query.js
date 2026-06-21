/*
 * rag_query.js — Hỏi-đáp CSKH Mitsu bằng RAG (retrieval local + sinh câu trả lời Vertex Gemini).
 * Embed câu hỏi → cosine top-k chunk từ rag-index.json → Gemini trả lời CHỈ dựa context.
 * Đây là "bộ não" chatbot — sau nối vào Zalo OA / web widget khi sẵn sàng.
 *
 * Chạy: node ops/rag_query.js "Mitsu mở cửa mấy giờ?"
 *       node ops/rag_query.js "có chỗ đậu xe ô tô không" --k=5
 */
const fs = require('fs');
const path = require('path');
const { embed, genJSON } = require('./vertex');

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function answer(question, k) {
  const idxPath = path.join(__dirname, '../docs/content/rag-index.json');
  if (!fs.existsSync(idxPath)) throw new Error('Chưa có rag-index.json — chạy: node ops/rag_build.js');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const qv = await embed(question, 'RETRIEVAL_QUERY');
  const top = idx.chunks
    .map(c => ({ c, s: cosine(qv, c.vector) }))
    .sort((a, b) => b.s - a.s).slice(0, k);
  const context = top.map((t, i) => `[${i + 1}] (${t.c.source}) ${t.c.text}`).join('\n\n');
  const res = await genJSON(
    `Bạn là nhân viên CSKH quán Mitsu (cà phê/trà kissaten Nhật, Đinh Văn Lâm Hà), trả lời thân thiện, ngắn gọn, đúng giọng quán.\nCHỈ dùng thông tin trong NGỮ CẢNH dưới. Nếu ngữ cảnh KHÔNG đủ để trả lời → answer lịch sự mời khách liên hệ trực tiếp/để lại SĐT, và đặt grounded=false.\n\nNGỮ CẢNH:\n${context}\n\nCÂU HỎI: ${question}\n\nTrả JSON {answer, grounded}.`,
    { type: 'object', properties: { answer: { type: 'string' }, grounded: { type: 'boolean' } }, required: ['answer', 'grounded'] },
    { temperature: 0.4, maxOutputTokens: 400 }
  );
  return { ...res, top: top.map(t => ({ id: t.c.id, score: +t.s.toFixed(3) })) };
}

async function main() {
  const q = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  const kArg = process.argv.find(a => a.startsWith('--k='));
  const k = kArg ? parseInt(kArg.slice(4), 10) : 4;
  if (!q) { console.error('Dùng: node ops/rag_query.js "câu hỏi"'); process.exit(1); }
  const r = await answer(q, k);
  console.log(`\nQ: ${q}`);
  console.log(`A: ${r.answer}`);
  console.log(`   (grounded=${r.grounded} · nguồn: ${r.top.map(t => t.id + ':' + t.score).join(', ')})`);
}

if (require.main === module) main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
module.exports = { answer };
