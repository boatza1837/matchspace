const { db } = require('../config/db');
const PRIVACY_VERSION = '2026-09-22';
const PURPOSES = ['analytics', 'matching', 'email'];

async function initPrivacy() {
  await db.exec(`CREATE TABLE IF NOT EXISTS privacy_preferences (
    user_id INTEGER PRIMARY KEY, notice_version TEXT NOT NULL,
    analytics INTEGER NOT NULL DEFAULT 0, matching INTEGER NOT NULL DEFAULT 0,
    email INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS privacy_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    notice_version TEXT NOT NULL, choices TEXT NOT NULL, source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  await db.get('SELECT COUNT(*) AS count FROM privacy_preferences');
  await db.get('SELECT COUNT(*) AS count FROM privacy_events');
}
async function getPreferences(userId) {
  const row = userId ? await db.get('SELECT * FROM privacy_preferences WHERE user_id = ?', [userId]) : null;
  return { version: PRIVACY_VERSION, acknowledged: row?.notice_version === PRIVACY_VERSION,
    analytics: row?.analytics === 1, matching: row?.matching === 1, email: row?.email === 1 };
}
function parseChoices(body) {
  const yes = value => value === true || value === 'true';
  return Object.fromEntries(PURPOSES.map(key => [key, yes(body[key])]));
}
async function savePreferences(userId, choices, source) {
  await db.run(`INSERT INTO privacy_preferences (user_id,notice_version,analytics,matching,email)
    VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET notice_version=excluded.notice_version,
    analytics=excluded.analytics,matching=excluded.matching,email=excluded.email,updated_at=CURRENT_TIMESTAMP`,
    [userId,PRIVACY_VERSION,Number(choices.analytics),Number(choices.matching),Number(choices.email)]);
  await db.run('INSERT INTO privacy_events (user_id,notice_version,choices,source) VALUES (?,?,?,?)',
    [userId,PRIVACY_VERSION,JSON.stringify(choices),source]);
}
async function analyticsAllowed(req) {
  if (req.session?.user?.id) return (await getPreferences(req.session.user.id)).analytics;
  return req.session?.privacy?.analytics === true;
}
module.exports = { PRIVACY_VERSION, initPrivacy, getPreferences, parseChoices, savePreferences, analyticsAllowed };
