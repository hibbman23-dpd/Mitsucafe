/*
 * kb_build.js — Dựng RAG index cục bộ cho Mitsu Café (embeddings Ollama nomic-embed-text).
 * Nguồn kiến thức: kb/core/*.md, kb/core/sop/*.md, kb/shop/*.md, local/memory/confirmed_patterns.jsonl.
 * Output: local/kb-index.json {built_at, model, dim, chunks:[{id,text,ns,source,vector}]}.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const LOCAL = path.join(ROOT, 'local');
const KB_DIR = path.join(ROOT, 'kb');

const OLLAMA_URL = 'http://localhost:11434/api/embed';
const EMBED_MODEL = 'nomic-embed-text:latest';

// Trích xuất namespace từ frontmatter hoặc đường dẫn thư mục
function getNamespaceAndSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/<!--\s*ns:\s*(\w+)\s*-->/);
  let ns = 'insight'; // mặc định
  if (match) {
    ns = match[1];
  } else {
    // Fallback theo thư mục
    const rel = path.relative(KB_DIR, filePath);
    if (rel.startsWith('core/sop') || rel.startsWith('sop')) {
      ns = 'sop';
    }
  }
  
  // Tên nguồn rút gọn
  const source = path.relative(ROOT, filePath);
  return { ns, source, content };
}

// Đọc toàn bộ file trong thư mục đệ quy
function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else if (file.endsWith('.md')) {
      results.push(filePath);
    }
  });
  return results;
}

// Cắt nhỏ file thành các chunk theo tiêu đề ##
function chunkFile(filePath) {
  const { ns, source, content } = getNamespaceAndSource(filePath);
  const chunks = [];
  
  // Tách theo tiêu đề ## hoặc dòng trống nếu không có tiêu đề
  const parts = content.split(/\n(?=##\s+)/);
  
  parts.forEach((part, i) => {
    const text = part.trim();
    if (!text || text.startsWith('<!--')) return; // Bỏ qua block comment/metadata đầu file
    
    chunks.push({
      id: `${path.basename(filePath, '.md')}-${i + 1}`,
      ns,
      source,
      text
    });
  });
  
  return chunks;
}

// Tải bộ nhớ đã xác nhận (confirmed_patterns.jsonl)
function loadConfirmedMemory() {
  const chunks = [];
  const memPath = path.join(LOCAL, 'memory', 'confirmed_patterns.jsonl');
  if (!fs.existsSync(memPath)) return chunks;
  
  const lines = fs.readFileSync(memPath, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const data = JSON.parse(trimmed);
      chunks.push({
        id: `memory-${data.id || (i + 1)}`,
        ns: 'memory',
        source: 'local/memory/confirmed_patterns.jsonl',
        text: data.text
      });
    } catch (e) {
      console.warn(`[warning] Bỏ qua dòng lỗi trong confirmed_patterns.jsonl: ${e.message}`);
    }
  });
  return chunks;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gọi API embed của Ollama
async function embedBatch(texts) {
  const r = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts })
  });
  if (r.status !== 200) {
    throw new Error(`Ollama Embed HTTP ${r.status}: ${await r.text()}`);
  }
  const d = await r.json();
  return d.embeddings; // Trả về mảng các vector
}

async function main() {
  // 1) Gom toàn bộ chunks từ kb/
  let chunks = [];
  const kbFiles = getFiles(KB_DIR);
  kbFiles.forEach(file => {
    chunks = chunks.concat(chunkFile(file));
  });
  
  // 2) Gom chunks từ bộ nhớ confirmed
  const memChunks = loadConfirmedMemory();
  chunks = chunks.concat(memChunks);
  
  if (!chunks.length) {
    console.error('❌ Không tìm thấy tài liệu kiến thức nào trong kb/ hoặc local/memory/.');
    process.exit(1);
  }
  
  console.log(`Bắt đầu nhúng (embed) ${chunks.length} chunks bằng model ${EMBED_MODEL}...`);
  
  // Nhúng theo batch 16 để tránh quá tải
  const batchSize = 16;
  const vectors = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    let tries = 0;
    while (true) {
      try {
        const batchVectors = await embedBatch(texts);
        vectors.push(...batchVectors);
        break;
      } catch (err) {
        tries++;
        if (tries >= 3) throw err;
        console.warn(`[warning] Embed batch thất bại (lần thử ${tries}), đang thử lại: ${err.message}`);
        await sleep(2000 * tries);
      }
    }
    process.stdout.write(`Đã xong ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks...\r`);
  }
  console.log('\nNhúng xong tất cả các chunks.');
  
  // Ghép vector vào chunks
  chunks.forEach((c, idx) => {
    c.vector = vectors[idx];
  });
  
  const dim = chunks[0].vector.length;
  const out = {
    built_at: new Date().toISOString(),
    model: EMBED_MODEL,
    dim,
    chunks
  };
  
  // Ghi file atomic (ghi file tạm trước rồi rename)
  const tmpPath = path.join(LOCAL, 'kb-index.tmp.json');
  const finalPath = path.join(LOCAL, 'kb-index.json');
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(out, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);
  
  console.log(`✅ Thành công! Đã ghi ${chunks.length} chunks (chiều vector ${dim}) vào local/kb-index.json`);
}

main().catch(e => {
  console.error('\n❌ Thất bại:', e.message || e);
  process.exit(1);
});
