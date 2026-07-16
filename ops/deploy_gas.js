const fs = require('fs');
const path = require('path');

/*
 * deploy_gas.js — Deploy GAS cho 1 hoặc NHIỀU chi nhánh (M34 deploy fan-out).
 *
 * Dùng:
 *   node ops/deploy_gas.js                 # deploy chi nhánh mặc định (branches.json .default)
 *   node ops/deploy_gas.js --branch=lamha  # deploy 1 chi nhánh cụ thể
 *   node ops/deploy_gas.js --all           # deploy TẤT CẢ chi nhánh trong branches.json
 *   node ops/deploy_gas.js --all --dry-run # chỉ in ra sẽ deploy gì, KHÔNG gọi API
 *
 * Mỗi branch trong ops/branches.json: { location_id, scriptId, deploymentId }.
 * Cùng code gas/ push tới từng scriptId → tạo version → retarget deploymentId → smoke-test.
 */

const GAS_DIR = path.join(__dirname, '../gas');
const BRANCHES_PATH = path.join(__dirname, 'branches.json');

function parseArgs() {
  const args = { branch: null, all: false, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--all') args.all = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--branch=')) args.branch = a.slice('--branch='.length);
  }
  return args;
}

async function getValidAccessToken(rc, rcPath) {
  const tokenObj = rc.tokens && rc.tokens.default;
  if (!tokenObj) throw new Error('Could not find default credentials in .clasprc.json');
  const now = Date.now();
  const expiry = tokenObj.expiry_date || 0;
  if (now > (expiry - 300000)) {
    console.log('Access token expired/expiring — refreshing...');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: tokenObj.client_id,
        client_secret: tokenObj.client_secret,
        refresh_token: tokenObj.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    if (response.status !== 200) throw new Error(`Failed to refresh token: ${response.status} ${await response.text()}`);
    const data = await response.json();
    tokenObj.access_token = data.access_token;
    tokenObj.expiry_date = Date.now() + (data.expires_in * 1000);
    fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), 'utf8');
    console.log('🎉 Access token refreshed.');
  } else {
    console.log('Using cached access token (still valid).');
  }
  return tokenObj.access_token;
}

/** Đọc toàn bộ file gas/ → payload content API (dùng chung cho mọi branch). */
function readGasFiles() {
  const files = [];
  for (const f of fs.readdirSync(GAS_DIR)) {
    const full = path.join(GAS_DIR, f);
    if (!fs.statSync(full).isFile()) continue;
    if (f === 'appsscript.json') files.push({ name: 'appsscript', type: 'JSON', source: fs.readFileSync(full, 'utf8') });
    else if (f.endsWith('.gs')) files.push({ name: f.slice(0, -3), type: 'SERVER_JS', source: fs.readFileSync(full, 'utf8') });
  }
  return files;
}

function getReportToken() {
  try {
    const authPath = path.join(__dirname, '../.claude/.dispatcher-auth.json');
    return (JSON.parse(fs.readFileSync(authPath, 'utf8')).report_api_token) || '';
  } catch (e) { return ''; }
}

async function deployBranch(name, cfg, accessToken, files, reportToken, dryRun) {
  const { scriptId, deploymentId, location_id } = cfg;
  console.log(`\n── Branch ${name} (${location_id}) · script ${scriptId.slice(0, 12)}… · deploy ${deploymentId.slice(0, 12)}…`);
  if (!scriptId || !deploymentId) throw new Error(`branch ${name} thiếu scriptId/deploymentId`);
  if (dryRun) { console.log('  [dry-run] sẽ push + version + retarget + smoke-test (bỏ qua API).'); return; }

  // 1. Push content (HEAD)
  let r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });
  if (r.status !== 200) throw new Error(`[${name}] push failed: ${r.status} ${await r.text()}`);
  console.log('  ✓ pushed content');

  // 2. Create version
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/versions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: `Auto deploy ${name} ${new Date().toISOString()}` })
  });
  if (r.status !== 200) throw new Error(`[${name}] version failed: ${r.status} ${await r.text()}`);
  const versionNumber = (await r.json()).versionNumber;
  console.log(`  ✓ version #${versionNumber}`);

  // 2b. Đọc version deployment ĐANG trỏ tới, TRƯỚC khi retarget — để còn đường lùi.
  //     Phải lấy ở đây: sau khi retarget thì API trả về chính version mới, mất mốc cũ.
  let prevVersion = null;
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (r.status === 200) {
    prevVersion = ((await r.json()).deploymentConfig || {}).versionNumber ?? null;
    console.log(`  ✓ version đang chạy: #${prevVersion}`);
  } else {
    console.log(`  ⚠️  không đọc được version cũ (HTTP ${r.status}) — sẽ KHÔNG rollback được nếu smoke đỏ`);
  }

  // 3. Retarget deployment
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deploymentConfig: { scriptId, versionNumber, manifestFileName: 'appsscript', description: `v${versionNumber} ${name}` } })
  });
  if (r.status !== 200) throw new Error(`[${name}] retarget failed: ${r.status} ${await r.text()}`);
  console.log('  ✓ retargeted');

  // 4. Smoke test. Retarget đã xảy ra → prod ĐANG chạy version mới. Đỏ = phải lùi ngay.
  const retargetTo = async (v) => {
    const rr = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentConfig: { scriptId, versionNumber: v, manifestFileName: 'appsscript', description: `v${v} ${name}` } })
    });
    return rr.status === 200;
  };

  const runSmoke = async () => {
    const cb = Math.floor(Math.random() * 1e9);
    const smoke = await fetch(`https://script.google.com/macros/s/${deploymentId}/exec?action=ping&_cb=${cb}`);
    const body = await smoke.text();
    if (smoke.status !== 200 || body.indexOf('"ok":true') === -1) {
      return `public smoke failed: HTTP ${smoke.status} - ${body.slice(0, 120)}`;
    }
    if (reportToken) {
      const authSmoke = await fetch(`https://script.google.com/macros/s/${deploymentId}/exec?action=orders&token=${reportToken}&_cb=${cb}`);
      const authBody = await authSmoke.text();
      if (authSmoke.status !== 200 || authBody.indexOf('"ok":true') === -1) {
        return `auth smoke failed (token connectivity check): HTTP ${authSmoke.status} - ${authBody.slice(0, 120)}`;
      }
    }
    return null;
  };

  const smokeErr = await runSmoke();
  if (!smokeErr) { console.log('  🎉 smoke OK'); return; }

  // Smoke đỏ → prod đang hỏng. Lùi về version cũ trước, kể chuyện sau.
  console.error(`  ❌ ${smokeErr}`);
  if (prevVersion === null) {
    throw new Error(`[${name}] ROLLBACK BẤT KHẢ: ${smokeErr} — không biết version cũ, prod ĐANG HỎNG ở v${versionNumber}. Vào editor lùi tay NGAY.`);
  }
  console.error(`  ↩︎  đang lùi về v${prevVersion}…`);
  const backOk = await retargetTo(prevVersion);
  if (!backOk) {
    throw new Error(`[${name}] ROLLBACK THẤT BẠI: ${smokeErr} — retarget về v${prevVersion} không xong, prod ĐANG HỎNG ở v${versionNumber}. Vào editor lùi tay NGAY.`);
  }
  const afterErr = await runSmoke();
  if (afterErr) {
    throw new Error(`[${name}] ROLLBACK xong nhưng v${prevVersion} vẫn đỏ: ${afterErr} — prod HỎNG, cần người.`);
  }
  console.error(`  ✓ ROLLBACK thành công về v${prevVersion}. Prod đã sống. Version hỏng: v${versionNumber}.`);
  throw new Error(`[${name}] ROLLBACK: deploy v${versionNumber} smoke đỏ (${smokeErr}), đã lùi về v${prevVersion}. Prod ổn, fix cần người xem.`);
}

async function main() {
  const args = parseArgs();
  const reg = JSON.parse(fs.readFileSync(BRANCHES_PATH, 'utf8'));
  let targets;
  if (args.all) targets = Object.keys(reg.branches);
  else if (args.branch) targets = [args.branch];
  else targets = [reg.default];

  for (const t of targets) if (!reg.branches[t]) throw new Error(`Branch '${t}' không có trong branches.json (có: ${Object.keys(reg.branches).join(', ')})`);
  console.log(`Targets: ${targets.join(', ')}${args.dryRun ? ' [DRY-RUN]' : ''}`);

  let accessToken = '', files = [], reportToken = '';
  if (!args.dryRun) {
    const rcPath = path.join(process.env.HOME, '.clasprc.json');
    if (!fs.existsSync(rcPath)) throw new Error(`Credentials not found at ${rcPath}`);
    accessToken = await getValidAccessToken(JSON.parse(fs.readFileSync(rcPath, 'utf8')), rcPath);
    files = readGasFiles();
    reportToken = getReportToken();
    console.log(`Loaded ${files.length} gas files.`);
  }

  for (const t of targets) await deployBranch(t, reg.branches[t], accessToken, files, reportToken, args.dryRun);
  console.log(`\n✅ Done (${targets.length} branch).`);
}

// Chỉ chạy khi gọi trực tiếp từ CLI. Khi bị require (test, healer) thì chỉ export —
// nếu không, require vào là deploy thật lên prod.
if (require.main === module) {
  main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
}

module.exports = { deployBranch };
