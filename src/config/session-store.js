const session = require('express-session');
const { db } = require('./db');

class DatabaseSessionStore extends session.Store {
  constructor() {
    super();
    // Periodically clean up expired sessions once every 6 hours
    setInterval(() => {
      this.clearExpired().catch(() => {});
    }, 1000 * 60 * 60 * 6).unref();
  }

  async get(sid, callback) {
    try {
      const row = await db.get('SELECT sess, expired_at FROM user_sessions WHERE sid = ?', [sid]);
      if (!row) return callback(null, null);

      if (row.expired_at && Date.now() > row.expired_at) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      const sessData = JSON.parse(row.sess);
      return callback(null, sessData);
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge || (1000 * 60 * 60 * 24 * 7);
      const expiredAt = Date.now() + maxAge;
      const sessJson = JSON.stringify(sess);

      // Upsert into user_sessions
      const existing = await db.get('SELECT sid FROM user_sessions WHERE sid = ?', [sid]);
      if (existing) {
        await db.run('UPDATE user_sessions SET sess = ?, expired_at = ? WHERE sid = ?', [sessJson, expiredAt, sid]);
      } else {
        await db.run('INSERT INTO user_sessions (sid, sess, expired_at) VALUES (?, ?, ?)', [sid, sessJson, expiredAt]);
      }

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await db.run('DELETE FROM user_sessions WHERE sid = ?', [sid]);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async touch(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge || (1000 * 60 * 60 * 24 * 7);
      const expiredAt = Date.now() + maxAge;
      await db.run('UPDATE user_sessions SET expired_at = ? WHERE sid = ?', [expiredAt, sid]);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async clearExpired() {
    try {
      await db.run('DELETE FROM user_sessions WHERE expired_at < ?', [Date.now()]);
    } catch (e) {}
  }
}

module.exports = DatabaseSessionStore;
