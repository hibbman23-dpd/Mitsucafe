const fs = require('fs');
const path = require('path');

const GAS_DIR = path.join(__dirname, '../gas');
const DEPLOYMENT_ID = 'AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i';

async function getValidAccessToken(rc, rcPath) {
  const tokenObj = rc.tokens && rc.tokens.default;
  if (!tokenObj) {
    throw new Error('Could not find default credentials in .clasprc.json');
  }

  const now = Date.now();
  const expiry = tokenObj.expiry_date || 0;

  // If token is expired or expires in less than 5 minutes, refresh it
  if (now > (expiry - 300000)) {
    console.log('Access token is expired or expiring soon. Refreshing...');
    const refreshUrl = 'https://oauth2.googleapis.com/token';
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: tokenObj.client_id,
        client_secret: tokenObj.client_secret,
        refresh_token: tokenObj.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    if (response.status !== 200) {
      throw new Error(`Failed to refresh token: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    tokenObj.access_token = data.access_token;
    tokenObj.expiry_date = Date.now() + (data.expires_in * 1000);
    
    // Save updated token back to .clasprc.json
    fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), 'utf8');
    console.log('🎉 Access token refreshed and saved successfully.');
  } else {
    console.log('Using existing cached access token (still valid).');
  }

  return tokenObj.access_token;
}

async function deploy() {
  try {
    // 1. Get Access Token
    const rcPath = path.join(process.env.HOME, '.clasprc.json');
    if (!fs.existsSync(rcPath)) {
      throw new Error(`Credentials file not found at ${rcPath}`);
    }
    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    const accessToken = await getValidAccessToken(rc, rcPath);

    // 2. Get Script ID
    const claspJsonPath = path.join(GAS_DIR, '.clasp.json');
    if (!fs.existsSync(claspJsonPath)) {
      throw new Error(`.clasp.json not found in ${GAS_DIR}`);
    }
    const claspJson = JSON.parse(fs.readFileSync(claspJsonPath, 'utf8'));
    const scriptId = claspJson.scriptId;
    if (!scriptId) {
      throw new Error('scriptId not found in .clasp.json');
    }
    console.log(`Script ID: ${scriptId}`);
    console.log(`Deployment ID: ${DEPLOYMENT_ID}`);

    // 3. Scan & Read Files
    const files = [];
    const dirFiles = fs.readdirSync(GAS_DIR);
    for (const f of dirFiles) {
      const fullPath = path.join(GAS_DIR, f);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      if (f === 'appsscript.json') {
        const source = fs.readFileSync(fullPath, 'utf8');
        files.push({
          name: 'appsscript',
          type: 'JSON',
          source: source
        });
        console.log(`Added: ${f} (JSON)`);
      } else if (f.endsWith('.gs')) {
        const source = fs.readFileSync(fullPath, 'utf8');
        const name = f.slice(0, -3); // remove .gs
        files.push({
          name: name,
          type: 'SERVER_JS',
          source: source
        });
        console.log(`Added: ${f} (SERVER_JS)`);
      }
    }

    // 4. Send PUT Request to update project files (HEAD version)
    console.log('Pushing code to Google Apps Script API...');
    const contentUrl = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const contentResponse = await fetch(contentUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files })
    });

    if (contentResponse.status !== 200) {
      throw new Error(`Push code failed: ${contentResponse.status} ${await contentResponse.text()}`);
    }
    console.log('🎉 Code successfully pushed (HEAD version updated).');

    // 5. Create a new version
    console.log('Creating a new script version...');
    const versionUrl = `https://script.googleapis.com/v1/projects/${scriptId}/versions`;
    const versionResponse = await fetch(versionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Auto deployment from ops/deploy_gas.js'
      })
    });

    if (versionResponse.status !== 200) {
      throw new Error(`Create version failed: ${versionResponse.status} ${await versionResponse.text()}`);
    }

    const versionData = await versionResponse.json();
    const newVersionNumber = versionData.versionNumber;
    console.log(`🎉 Created Version #${newVersionNumber}`);

    // 6. Update the deployment to point to the new version
    console.log(`Updating deployment ${DEPLOYMENT_ID} to Version #${newVersionNumber}...`);
    const deployUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments/${DEPLOYMENT_ID}`;
    const deployResponse = await fetch(deployUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: scriptId,
          versionNumber: newVersionNumber,
          manifestFileName: 'appsscript',
          description: `Deploy version ${newVersionNumber}`
        }
      })
    });

    if (deployResponse.status !== 200) {
      throw new Error(`Retarget deployment failed: ${deployResponse.status} ${await deployResponse.text()}`);
    }
    console.log('🎉 Deployment successfully updated! Deployment version retargeted.');

    // 7. Smoke test verification request
    console.log('Running smoke-test query on meta_health...');
    // Đọc REPORT_API_TOKEN từ file auth (KHÔNG hardcode — luật §4 CLAUDE.md).
    let reportToken = '';
    try {
      const authPath = path.join(__dirname, '../.claude/.dispatcher-auth.json');
      reportToken = (JSON.parse(fs.readFileSync(authPath, 'utf8')).report_api_token) || '';
    } catch (e) {
      console.warn('⚠️ Không đọc được REPORT_API_TOKEN từ .claude/.dispatcher-auth.json — bỏ qua smoke test.');
    }
    const cb = Math.floor(Math.random() * 1000000);
    const smokeUrl = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec?action=meta_health&token=${reportToken}&_cb=${cb}`;
    const smokeResp = await fetch(smokeUrl);
    const smokeStatus = smokeResp.status;
    const smokeBody = await smokeResp.text();
    console.log(`Smoke test status: ${smokeStatus}`);
    console.log(`Smoke test body: ${smokeBody}`);

    if (smokeStatus === 200 && smokeBody.indexOf('"ok":true') !== -1) {
      console.log('🎉 Deploy verified! System is healthy and running the new version.');
    } else {
      throw new Error(`Smoke test failed: HTTP ${smokeStatus} - ${smokeBody}`);
    }
  } catch (error) {
    console.error('❌ Error during deploy:', error);
    process.exit(1);
  }
}

deploy();
