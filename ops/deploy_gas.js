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

  // 1. Push content (HEAD). QUAN TRỌNG: đây là bước MUTATION đầu tiên — nó ghi đè
  //    NGAY script sống (HEAD). Time-driven trigger (18 cái: cronDailyFinancials,
  //    refreshZaloToken, backupSpreadsheet, pullGa4Recent, …) chạy theo HEAD, KHÔNG
  //    theo deployment version — nên từ dòng này trở đi HEAD (và mọi cron) đã đổi,
  //    dù /exec (URL công khai, pin theo deployment version) vẫn còn phục vụ bản cũ
  //    cho tới bước retarget bên dưới.
  let r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });
  if (r.status !== 200) throw new Error(`[${name}] push failed: ${r.status} ${await r.text()}`);
  console.log('  ✓ pushed content (HEAD đã đổi — cron chạy code mới từ đây)');

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
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const prevVersion = r.status === 200 ? (((await r.json()).deploymentConfig || {}).versionNumber ?? null) : null;
  if (prevVersion === null) {
    // Tại đây CHƯA retarget deployment — /exec vẫn phục vụ version cũ, chưa bị đụng.
    // NHƯNG HEAD ĐÃ bị ghi đè ở bước 1 (PUT /content) rồi — không thể nói "prod chưa
    // bị đụng tới" chung chung, vì HEAD (thứ 18 trigger cron chạy) đã đổi thật, và
    // không có version cũ nào để khôi phục lại HEAD (đó chính là lỗi ta đang gặp ở
    // đây). Hủy retarget ở đây MIỄN PHÍ — tốt hơn retarget mù rồi kẹt không có đường
    // lùi nếu smoke đỏ (fail-closed, không fail-open) — nhưng phải nói đúng: /exec an
    // toàn, HEAD thì không, và không có cách tự động khôi phục HEAD trong tình huống này.
    const detail = r.status === 200 ? 'response thiếu versionNumber' : `HTTP ${r.status} ${await r.text()}`;
    throw new Error(`[${name}] DEPLOY HỦY: không đọc được version đang chạy (${detail}) — /exec CHƯA bị retarget (an toàn, vẫn phục vụ bản cũ), nhưng HEAD ĐÃ bị ghi đè bởi bước push content ở trên và KHÔNG có version cũ nào để khôi phục HEAD tự động — 18 trigger cron sẽ chạy code mới (chưa qua smoke). Vào editor kiểm tra HEAD + deployment rồi xử lý tay.`);
  }
  console.log(`  ✓ version đang chạy: #${prevVersion}`);

  // 3. Retarget deployment
  r = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deploymentConfig: { scriptId, versionNumber, manifestFileName: 'appsscript', description: `v${versionNumber} ${name}` } })
  });
  if (r.status !== 200) throw new Error(`[${name}] retarget failed: ${r.status} ${await r.text()}`);
  console.log('  ✓ retargeted');

  // 4. Smoke test. Retarget đã xảy ra → prod ĐANG chạy version mới. Đỏ = phải lùi ngay.
  //    Trả cả status/body khi lỗi — đây là lúc rollback tự nó hỏng, người cần chi tiết nhất.
  const retargetTo = async (v) => {
    const rr = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentConfig: { scriptId, versionNumber: v, manifestFileName: 'appsscript', description: `v${v} ${name}` } })
    });
    if (rr.status === 200) return { ok: true };
    return { ok: false, status: rr.status, body: await rr.text() };
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

  // Smoke đỏ → prod đang hỏng. prevVersion không thể null ở đây nữa — đã abort sớm ở
  // bước 2b nếu không đọc được.
  //
  // Retarget deployment CHỈ lùi /exec — nó KHÔNG đụng tới HEAD, mà HEAD mới là thứ 18
  // trigger cron (cronDailyFinancials, refreshZaloToken, backupSpreadsheet,
  // pullGa4Recent, …) chạy theo. Nên rollback thật sự cần khôi phục CẢ HAI.
  //
  // Thứ tự: khôi phục HEAD TRƯỚC, retarget /exec SAU. Lý do — khôi phục HEAD (GET nội
  // dung version cũ rồi PUT lại) không phụ thuộc gì vào deployment, nên làm trước
  // không mất gì; và nếu bước khôi phục HEAD thất bại, ta VẪN CÒN CƠ HỘI cứu /exec bằng
  // retarget ở dưới — không để 1 thất bại chặn luôn nỗ lực cứu cái còn lại. Ngược lại,
  // nếu retarget /exec làm trước và chính nó thất bại, code sẽ throw ngay (nhánh ROLLBACK
  // THẤT BẠI) và không bao giờ chạm tới bước khôi phục HEAD — bỏ lỡ cơ hội cứu ít nhất
  // 1 trong 2 thứ. Làm HEAD trước cũng cho phép mọi message lỗi ở dưới nói chính xác
  // HEAD đã cứu được hay chưa, thay vì đoán.
  console.error(`  ❌ ${smokeErr}`);
  console.error(`  ↩︎  đang khôi phục về v${prevVersion}…`);

  let headRestored = false;
  let headRestoreErr = null;
  const contentGet = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content?versionNumber=${prevVersion}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (contentGet.status !== 200) {
    headRestoreErr = `GET content?versionNumber=${prevVersion} failed: HTTP ${contentGet.status} ${await contentGet.text()}`;
  } else {
    const oldFiles = (await contentGet.json()).files;
    // HTTP 200 mà files rỗng/thiếu thì KHÔNG khôi phục được. PUT bừa lên HEAD = xoá
    // trắng project, rồi vẫn in "✓ đã khôi phục" — tuyên bố thành công không kiểm
    // chứng, đúng cái tội cả file này sinh ra để diệt. Coi như GET hỏng.
    if (!Array.isArray(oldFiles) || oldFiles.length === 0) {
      headRestoreErr = `GET content?versionNumber=${prevVersion} trả HTTP 200 nhưng files rỗng/thiếu — KHÔNG PUT gì lên HEAD (PUT rỗng sẽ xoá trắng project)`;
    } else {
      const contentPut = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: oldFiles })
      });
      if (contentPut.status !== 200) {
        headRestoreErr = `PUT content (khôi phục v${prevVersion}) failed: HTTP ${contentPut.status} ${await contentPut.text()}`;
      } else {
        headRestored = true;
        console.error(`  ✓ HEAD đã khôi phục về nội dung v${prevVersion}`);
      }
    }
  }
  if (headRestoreErr) {
    console.error(`  ⚠️  KHÔNG khôi phục được HEAD: ${headRestoreErr} — 18 trigger cron (cronDailyFinancials, refreshZaloToken, backupSpreadsheet, pullGa4Recent, …) vẫn chạy code MỚI (hỏng) dù /exec có lùi được ở bước dưới hay không. Vào editor sửa tay HEAD NGAY.`);
  }

  const backResult = await retargetTo(prevVersion);
  if (!backResult.ok) {
    throw new Error(`[${name}] ROLLBACK THẤT BẠI: ${smokeErr} — retarget /exec về v${prevVersion} không xong (HTTP ${backResult.status} ${backResult.body}), /exec ĐANG HỎNG ở v${versionNumber}${headRestored ? ' (HEAD đã khôi phục nhưng /exec thì chưa)' : ' và HEAD CŨNG chưa khôi phục được'}. Vào editor lùi tay NGAY.`);
  }
  const afterErr = await runSmoke();
  if (afterErr) {
    throw new Error(`[${name}] ROLLBACK xong nhưng v${prevVersion} vẫn đỏ: ${afterErr} — /exec đã lùi nhưng bản thân v${prevVersion} tự nó hỏng, cần người.${headRestored ? '' : ' HEAD cũng chưa khôi phục được — xem log phía trên.'}`);
  }

  if (headRestored) {
    console.error(`  ✓ ROLLBACK thành công: /exec VÀ HEAD đều đã về v${prevVersion}. 18 trigger cron an toàn. Version hỏng: v${versionNumber}.`);
    throw new Error(`[${name}] ROLLBACK: deploy v${versionNumber} smoke đỏ (${smokeErr}), đã khôi phục CẢ /exec và HEAD về v${prevVersion} — trigger cron cũng an toàn. Fix cần người xem.`);
  }
  console.error(`  ⚠️  ROLLBACK MỘT PHẦN: /exec đã về v${prevVersion} (an toàn cho khách) nhưng HEAD VẪN LÀ v${versionNumber} (hỏng) — 18 trigger cron sẽ CHẠY CODE HỎNG ở lần trigger tiếp theo. Vào editor khôi phục HEAD tay NGAY: ${headRestoreErr}`);
  throw new Error(`[${name}] ROLLBACK MỘT PHẦN: deploy v${versionNumber} smoke đỏ (${smokeErr}). /exec đã lùi về v${prevVersion} nhưng HEAD KHÔNG khôi phục được (${headRestoreErr}) — 18 trigger cron vẫn chạy code hỏng. Vào editor sửa tay HEAD NGAY.`);
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
