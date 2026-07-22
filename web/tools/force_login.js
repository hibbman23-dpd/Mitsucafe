const fs = require('fs');
const path = require('path');

// Default clasp credentials
const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';

async function main() {
  const urlInput = process.argv[2];

  if (!urlInput) {
    console.error('Usage: node force_login.js "<entire_redirect_url_from_browser>"');
    process.exit(1);
  }

  let code, redirectUri;
  try {
    const urlObj = new URL(urlInput);
    code = urlObj.searchParams.get('code');
    // Reconstruct the redirect URI: Google requires exact match.
    // Usually it is the origin + pathname (without trailing slash if it was not in the original)
    // But since Chrome strips trailing slashes or adds them, we can try both or keep it exactly.
    redirectUri = urlObj.pathname === '/' ? urlObj.origin : (urlObj.origin + urlObj.pathname);
  } catch (e) {
    console.error('Invalid URL provided. Please copy the entire localhost link from your browser.');
    process.exit(1);
  }

  if (!code) {
    console.error('Could not find the "code" query parameter in the provided URL.');
    process.exit(1);
  }

  console.log(`Extracted Code: ${code.substring(0, 15)}...`);
  console.log(`Extracted Redirect URI: ${redirectUri}`);
  console.log('Exchanging auth code for tokens via direct HTTP/2 fetch...');
  
  const params = new URLSearchParams();
  params.append('code', code);
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('redirect_uri', redirectUri);
  params.append('grant_type', 'authorization_code');

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Error from Google OAuth:', data);
      console.log('\nTip: Authorization codes are single-use only. If you ran clasp login before, you MUST close the Terminal prompt, run `clasp login --no-localhost` again to get a fresh URL, authorize in browser, and paste the NEW URL.');
      process.exit(1);
    }

    console.log('Exchange successful!');
    console.log('Access token acquired.');
    console.log('Refresh token acquired:', data.refresh_token ? 'Yes' : 'No');

    const clasprcPath = '/Users/dpd/.clasprc.json';
    
    // Read existing clasprc if exists to preserve other settings
    let clasprc = {};
    if (fs.existsSync(clasprcPath)) {
      try {
        clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
      } catch (e) {}
    }

    // Update tokens
    clasprc.token = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || (clasprc.token && clasprc.token.refresh_token),
      scope: data.scope,
      token_type: data.token_type,
      expiry_date: Date.now() + (data.expires_in * 1000)
    };

    // Ensure client settings match
    clasprc.oauth2ClientSettings = {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: 'http://localhost'
    };
    clasprc.isLocalCreds = false;

    fs.writeFileSync(clasprcPath, JSON.stringify(clasprc, null, 2), { mode: 0o600 });
    console.log(`\n🎉 Saved credentials to ${clasprcPath} successfully!`);
    console.log('You can now run `clasp push` on your Terminal!');

  } catch (err) {
    console.error('Network error during fetch:', err.message);
  }
}

main();
