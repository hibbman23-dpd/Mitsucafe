/*
 * rag_build.js — Dựng RAG index cho chatbot CSKH Mitsu (embeddings Vertex, lưu LOCAL).
 * Nguồn kiến thức: docs/content/seo-pack.json (FAQ + intro vùng) + docs/content/store-facts.md (nếu có).
 * Output: docs/content/rag-index.json {model, dim, chunks:[{id,text,source,vector}]}.
 * Retrieval chạy local (rag_query.js) → FREE sau khi build. Build lại khi cập nhật kiến thức.
 *
 * Chạy: node ops/rag_build.js
 */
const fs = require('fs');
const path = require('path');
const { embedBatch, EMBED_MODEL } = require('./vertex');

const C = path.join(__dirname, '../docs/content');

function loadChunks() {
  const chunks = [];
  // 1) seo-pack: FAQ + intro vùng
  const sp = path.join(C, 'seo-pack.json');
  if (fs.existsSync(sp)) {
    const d = JSON.parse(fs.readFileSync(sp, 'utf8'));
    (d.faqs || []).forEach((f, i) => chunks.push({ id: `faq-${i + 1}`, source: 'seo-pack/faq', text: `Hỏi: ${f.q}\nĐáp: ${f.a}` }));
    for (const k in (d.areas || {})) chunks.push({ id: `area-${k}`, source: 'seo-pack/area', text: d.areas[k].intro_blurb });
  }
  // 2) store-facts.md (tuỳ chọn — chủ bổ sung fact ngoài FAQ): mỗi đoạn cách nhau dòng trống = 1 chunk
  const sf = path.join(C, 'store-facts.md');
  if (fs.existsSync(sf)) {
    fs.readFileSync(sf, 'utf8').split(/\n\s*\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
      .forEach((t, i) => chunks.push({ id: `fact-${i + 1}`, source: 'store-facts', text: t }));
  }
  return chunks;
}

async function main() {
  const chunks = loadChunks();
  if (!chunks.length) { console.error('❌ Không có nguồn kiến thức (seo-pack.json / store-facts.md).'); process.exit(1); }
  console.log(`Embedding ${chunks.length} chunk · ${EMBED_MODEL} (batch)…`);
  const vecs = await embedBatch(chunks.map(c => c.text), 'RETRIEVAL_DOCUMENT');
  chunks.forEach((c, i) => { c.vector = vecs[i]; });
  const dim = chunks[0].vector.length;
  const out = { built_at: new Date().toISOString(), model: EMBED_MODEL, dim, chunks };
  fs.writeFileSync(path.join(C, 'rag-index.json'), JSON.stringify(out), 'utf8');
  console.log(`\n✅ ${chunks.length} chunk (dim ${dim}) → docs/content/rag-index.json`);
}

main().catch(e => { console.error('\n❌', e.message || e); process.exit(1); });
