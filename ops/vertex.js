/*
 * vertex.js — helper gọi Vertex AI Gemini (dùng chung cho các script content/SEO/RAG).
 * Config verify 2026-06-21: project mitsucafe · us-central1 · gemini-2.5-flash · auth ADC.
 * Gotcha: 2.5-flash "thinking" ăn token → ép thinkingBudget:0 cho task sinh text.
 */
const { execSync } = require('child_process');

const PROJECT = process.env.GCP_PROJECT || 'mitsucafe';
const REGION = process.env.GCP_REGION || 'us-central1';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _token = null;
function token() {
  if (!_token) _token = execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
  return _token;
}

/** Gọi Vertex, trả JSON đã parse theo schema. */
async function genJSON(prompt, schema, opts = {}) {
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature != null ? opts.temperature : 0.85,
      maxOutputTokens: opts.maxOutputTokens || 1024,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status !== 200) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 220)}`);
  const d = await r.json();
  return JSON.parse(d.candidates[0].content.parts[0].text);
}

const EMBED_MODEL = process.env.EMBED_MODEL || 'text-multilingual-embedding-002';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Embed NHIỀU đoạn text trong 1 request (giảm số request → tránh 429 quota/phút).
 * Tự chia lô ≤ batchSize + retry 429 có backoff. taskType: RETRIEVAL_DOCUMENT|RETRIEVAL_QUERY.
 * @return {number[][]} vectors theo thứ tự texts.
 */
async function embedBatch(texts, taskType, batchSize) {
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/publishers/google/models/${EMBED_MODEL}:predict`;
  const out = [];
  const bs = batchSize || 25;
  for (let i = 0; i < texts.length; i += bs) {
    const slice = texts.slice(i, i + bs);
    const body = JSON.stringify({ instances: slice.map(t => ({ content: t, task_type: taskType || 'RETRIEVAL_DOCUMENT' })) });
    let r, tries = 0;
    while (true) {
      r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body });
      if (r.status === 200) break;
      if (r.status === 429 && tries < 4) { tries++; await sleep(15000 * tries); continue; }
      throw new Error(`Embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    (await r.json()).predictions.forEach(p => out.push(p.embeddings.values));
    if (i + bs < texts.length) await sleep(1500);
  }
  return out;
}

/** Embed 1 đoạn → vector. */
async function embed(text, taskType) { return (await embedBatch([text], taskType))[0]; }

module.exports = { genJSON, embed, embedBatch, token, PROJECT, REGION, MODEL, EMBED_MODEL };
