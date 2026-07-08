/*
 * kb_query.js — Truy vấn tìm kiếm ngữ nghĩa (RAG retrieval) cục bộ.
 * Nhận câu hỏi, gọi Ollama bge-m3 để embed, so sánh cosine và trả về top-k chunks.
 *
 * Chạy: node ops/local/kb_query.js "Mitsu mở cửa mấy giờ?" --ns insight --k 3
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const LOCAL = path.join(ROOT, 'local');
const OLLAMA_URL = 'http://localhost:11434/api/embed';
const EMBED_MODEL = 'nomic-embed-text:latest';

// Tính cosine similarity giữa hai vector
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Gọi API embed của Ollama cho câu hỏi
async function embedQuery(text) {
  const r = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text] })
  });
  if (r.status !== 200) {
    throw new Error(`Ollama Embed HTTP ${r.status}: ${await r.text()}`);
  }
  const d = await r.json();
  return d.embeddings[0];
}

async function query(question, ns, k) {
  const idxPath = path.join(LOCAL, 'kb-index.json');
  if (!fs.existsSync(idxPath)) {
    throw new Error('Chưa có chỉ mục local/kb-index.json — Hãy chạy: node ops/local/kb_build.js trước.');
  }
  
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const qv = await embedQuery(question);
  
  // Lọc theo namespace nếu có yêu cầu
  let candidates = idx.chunks;
  if (ns) {
    candidates = candidates.filter(c => c.ns === ns);
  }
  
  const scored = candidates.map(c => {
    return {
      id: c.id,
      ns: c.ns,
      source: c.source,
      text: c.text,
      score: cosine(qv, c.vector)
    };
  });
  
  // Sắp xếp giảm dần và lấy top-k
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const q = args.filter(a => !a.startsWith('--')).join(' ');
  
  const nsArg = args.find(a => a.startsWith('--ns='));
  const ns = nsArg ? nsArg.slice(5) : null;
  
  const kArg = args.find(a => a.startsWith('--k='));
  const k = kArg ? parseInt(kArg.slice(4), 10) : 4;
  
  if (!q) {
    console.error('Dùng: node ops/local/kb_query.js "câu hỏi" [--ns=insight|sop|memory] [--k=5]');
    process.exit(1);
  }
  
  try {
    const results = await query(q, ns, k);
    console.log(JSON.stringify(results.map(r => ({
      id: r.id,
      ns: r.ns,
      source: r.source,
      text: r.text,
      score: +r.score.toFixed(3)
    })), null, 2));
  } catch (err) {
    console.error('❌ Lỗi truy vấn:', err.message || err);
    process.exit(1);
  }
}

// Chạy trực tiếp CLI hoặc export hàm để import trong python/node khác
if (require.main === module) {
  main();
} else {
  module.exports = { query };
}
