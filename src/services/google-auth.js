const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '186015897078-3qtjge4dbi3e6sjvp4e4lbulolipioug.apps.googleusercontent.com';

async function verifyGoogleCredential(credential) {
  if (typeof credential !== 'string' || !credential || credential.length > 8192) {
    throw new Error('Google credential required');
  }
  const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('Verified Google email required');
  }
  // Google does not guarantee continued ownership of third-party email accounts.
  if (!payload.email.toLowerCase().endsWith('@gmail.com') && !payload.hd) {
    throw new Error('Use password sign-in for this email');
  }
  return payload;
}

module.exports = { verifyGoogleCredential };
