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

module.exports = { genJSON, token, PROJECT, REGION, MODEL };
