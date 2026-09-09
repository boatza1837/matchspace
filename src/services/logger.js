const { db } = require('../config/db');

function parseDevice(userAgent) {
  if (!userAgent) return '💻 Google Chrome (Windows 10/11)';
  let os = 'Windows 10/11';
  let isMobile = false;

  if (/iphone/i.test(userAgent)) { os = 'iPhone (iOS)'; isMobile = true; }
  else if (/ipad/i.test(userAgent)) { os = 'iPad (iPadOS)'; isMobile = true; }
  else if (/android/i.test(userAgent)) { os = 'Android'; isMobile = true; }
  else if (/macintosh|mac os x/i.test(userAgent)) { os = 'macOS'; }
  else if (/linux/i.test(userAgent)) { os = 'Linux'; }
  else if (/windows/i.test(userAgent)) { os = 'Windows 10/11'; }

  let browser = 'Google Chrome';
  if (/edg/i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/firefox/i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Apple Safari';
  else if (/chrome/i.test(userAgent)) browser = 'Google Chrome';

  const icon = isMobile ? '📱' : '💻';
  return `${icon} ${browser} (${os})`;
}

async function logAudit(level, message) {
  try {
    console.log(`[Audit] [${level}] ${message}`);
    await db.run('INSERT INTO audit_logs (level, message) VALUES (?, ?)', [level, message]);
  } catch (err) {
    console.error('[logAudit Error]', err);
  }
}

async function logLogin(req, email, userId, status = 'success', action = 'Login', details = 'เข้าสู่ระบบ') {
  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim().replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const device = parseDevice(userAgent);

    await db.run(
      'INSERT INTO login_logs (user_id, email, ip, device, status, action, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId || null, email, ip, device, status, action, details]
    );

    const logMsg = status === 'success'
      ? `[${action}] '${email}' ${details} (IP: ${ip}, Device: ${device})`
      : `[${action} Failed] '${email}' ${details} (IP: ${ip}, Device: ${device})`;

    await logAudit(status === 'success' ? 'INFO' : 'WARN', logMsg);
  } catch (err) {
    console.error('[logLogin Error]', err);
  }
}

module.exports = {
  parseDevice,
  logAudit,
  logLogin
};
