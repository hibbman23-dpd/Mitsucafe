const fs = require('fs');
const path = require('path');

const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';

async function refreshAccessToken(refreshToken) {
  console.log('Refreshing access token...');
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to refresh token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function main() {
  const clasprcPath = '/Users/dpd/.clasprc.json';
  const claspJsonPath = '/Users/dpd/Projects/lamha-kissaten/gas/.clasp.json';

  if (!fs.existsSync(clasprcPath)) {
    console.error('Error: Credentials file ~/.clasprc.json not found. Please log in first.');
    process.exit(1);
  }
  if (!fs.existsSync(claspJsonPath)) {
    console.error('Error: .clasp.json not found in gas directory.');
    process.exit(1);
  }

  const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
  const claspJson = JSON.parse(fs.readFileSync(claspJsonPath, 'utf8'));
  const scriptId = claspJson.scriptId;

  if (!scriptId) {
    console.error('Error: scriptId not found in .clasp.json');
    process.exit(1);
  }

  let accessToken = clasprc.token.access_token;
  const expiryDate = clasprc.token.expiry_date;
  const refreshToken = clasprc.token.refresh_token;

  // Refresh if token is expired or expiring in 5 minutes
  if (!accessToken || !expiryDate || Date.now() > (expiryDate - 300000)) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
      clasprc.token.access_token = accessToken;
      clasprc.token.expiry_date = Date.now() + 3600000;
      fs.writeFileSync(clasprcPath, JSON.stringify(clasprc, null, 2), { mode: 0o600 });
      console.log('Access token refreshed successfully.');
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  }

  console.log(`Script ID: ${scriptId}`);
  console.log('Collecting files in gas/ directory...');

  const gasDir = '/Users/dpd/Projects/lamha-kissaten/gas';
  const fileNames = fs.readdirSync(gasDir);
  const filesToSend = [];

  for (const name of fileNames) {
    const filePath = path.join(gasDir, name);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const ext = path.extname(name);
      let type = null;
      let apiName = path.basename(name, ext);

      if (name === 'appsscript.json') {
        type = 'JSON';
        apiName = 'appsscript'; // Google requires exactly "appsscript" name for this file
      } else if (ext === '.gs' || ext === '.js') {
        type = 'SERVER_JS';
      } else if (ext === '.html') {
        type = 'HTML';
      }

      if (type) {
        const source = fs.readFileSync(filePath, 'utf8');
        filesToSend.push({
          name: apiName,
          type: type,
          source: source
        });
      }
    }
  }

  console.log(`Found ${filesToSend.length} files to push.`);
  console.log('Pushing files to Google Apps Script via direct HTTP/2 PUT...');

  try {
    const res = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: filesToSend })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Error from Google Apps Script API:', data);
      process.exit(1);
    }

    console.log('\n🎉 Push successful!');
    console.log(`Uploaded ${filesToSend.length} files to Apps Script Project.`);
  } catch (err) {
    console.error('Network error during push:', err.message);
  }
}

main();
