const fs = require('fs');
const path = require('path');
const { hashPassword, encryptPassword } = require('./security');

const isRailwayVolume = fs.existsSync('/data');
const dataDir = process.env.DATA_DIR || (isRailwayVolume ? '/data' : path.join(__dirname, '..', '..'));
const dbPath = path.join(dataDir, 'matchspace.db');

// Turso Cloud or Local SQLite Database Adapter
const tursoUrl = process.env.TURSO_DATABASE_URL || '';
const tursoToken = process.env.TURSO_AUTH_TOKEN || '';
const useTurso = Boolean(tursoUrl && tursoUrl.startsWith('libsql://') && tursoToken);

let sqliteDb = null;
let tursoClient = null;

if (useTurso) {
  const { createClient } = require('@libsql/client');
  tursoClient = createClient({
    url: tursoUrl,
    authToken: tursoToken
  });
  console.log('[Database] Connected to Turso Cloud DB:', tursoUrl);
} else {
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(dbPath);
  console.log('[Database] Connected to local SQLite DB:', dbPath);
}

const db = {
  async get(sql, params = []) {
    if (useTurso) {
      const res = await tursoClient.execute({ sql, args: params });
      return res.rows[0] ? { ...res.rows[0] } : null;
    } else {
      const row = sqliteDb.prepare(sql).get(...params);
      return row ? { ...row } : null;
    }
  },
  async all(sql, params = []) {
    if (useTurso) {
      const res = await tursoClient.execute({ sql, args: params });
      return (res.rows || []).map(r => ({ ...r }));
    } else {
      const rows = sqliteDb.prepare(sql).all(...params);
      return rows.map(r => ({ ...r }));
    }
  },
  async run(sql, params = []) {
    if (useTurso) {
      const res = await tursoClient.execute({ sql, args: params });
      return {
        lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
        changes: Number(res.rowsAffected || 0)
      };
    } else {
      const res = sqliteDb.prepare(sql).run(...params);
      return {
        lastInsertRowid: res.lastInsertRowid,
        changes: res.changes
      };
    }
  },
  async exec(sql) {
    if (useTurso) {
      const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        try {
          await tursoClient.execute(stmt);
        } catch(e) {
          // ignore DDL exists errors
        }
      }
    } else {
      sqliteDb.exec(sql);
    }
  }
};

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      encrypted_password TEXT,
      plain_password TEXT,
      gender TEXT DEFAULT 'ไม่ระบุ',
      interested_gender TEXT DEFAULT 'ทุกเพศ',
      university TEXT DEFAULT 'มหาวิทยาลัยขอนแก่น',
      major TEXT,
      year TEXT,
      interests TEXT,
      bio TEXT,
      nickname TEXT,
      age INTEGER,
      phone TEXT,
      profile_image TEXT,
      is_admin INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      photo_url TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT NOT NULL,
      reported_user TEXT NOT NULL,
      report_type TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_file TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      matched_user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      title TEXT,
      type TEXT DEFAULT 'direct',
      activity_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS student_otp_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      student_email TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      event_date TEXT,
      event_time TEXT,
      created_by INTEGER NOT NULL,
      creator_name TEXT,
      creator_major TEXT,
      member_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(activity_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      ip TEXT,
      device TEXT,
      status TEXT DEFAULT 'success',
      action TEXT DEFAULT 'Login',
      details TEXT DEFAULT 'เข้าสู่ระบบ',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'INFO',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      giver_id INTEGER NOT NULL,
      badge_key TEXT NOT NULL,
      activity_id INTEGER,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(recipient_id, giver_id, badge_key)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired_at INTEGER NOT NULL
    );
  `);

  try { await db.run("ALTER TABLE users ADD COLUMN encrypted_password TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'ไม่ระบุ'"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN interested_gender TEXT DEFAULT 'ทุกเพศ'"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN university TEXT DEFAULT 'มหาวิทยาลัยขอนแก่น'"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN phone TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN is_student_verified INTEGER DEFAULT 0"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN student_email TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE users ADD COLUMN student_verified_at TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE chat_messages ADD COLUMN is_read INTEGER DEFAULT 0"); } catch(e) {}
  try { await db.run("ALTER TABLE chat_messages ADD COLUMN read_at TEXT"); } catch(e) {}

  // Automatic Migration: Encrypt any legacy plain_password with AES-256-GCM and clear plain_password
  try {
    const usersToMigrate = await db.all("SELECT id, plain_password FROM users WHERE (encrypted_password IS NULL OR encrypted_password = '') AND plain_password IS NOT NULL AND plain_password != ''");
    for (const u of usersToMigrate) {
      const enc = encryptPassword(u.plain_password);
      if (enc) {
        await db.run("UPDATE users SET encrypted_password = ?, plain_password = NULL WHERE id = ?", [enc, u.id]);
      }
    }
    await db.run("UPDATE users SET plain_password = NULL WHERE encrypted_password IS NOT NULL");
  } catch (err) {
    console.error('[Password Migration Warning]', err.message);
  }

  // Seed Owner Account: samak.c@admin.com / Samak14.
  const ownerEmail = 'samak.c@admin.com';
  const ownerUser = await db.get('SELECT * FROM users WHERE email = ?', [ownerEmail]);
  const ownerEncrypted = encryptPassword('Samak14.');
  if (!ownerUser) {
    const ownerPassword = hashPassword('Samak14.');
    await db.run(`
      INSERT INTO users (name, email, password, encrypted_password, major, year, interests, bio, is_admin, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'owner', 1)
    `, [
      'System Owner',
      ownerEmail,
      ownerPassword,
      ownerEncrypted,
      'Management',
      'Owner',
      'System, Ownership, Security',
      'System Owner with full administrative and account management rights'
    ]);
    console.log('[Seed] Created Owner account: samak.c@admin.com');
  } else {
    await db.run("UPDATE users SET role = 'owner', is_admin = 1, encrypted_password = ?, plain_password = NULL WHERE email = ?", [ownerEncrypted, ownerEmail]);
  }

  // Seed Admin Account: admin@matchspace.com / admin123
  const adminUser = await db.get('SELECT * FROM users WHERE email = ?', ['admin@matchspace.com']);
  const adminEncrypted = encryptPassword('admin123');
  if (!adminUser) {
    const adminPassword = hashPassword('admin123');
    await db.run(`
      INSERT INTO users (name, email, password, encrypted_password, major, year, interests, bio, is_admin, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'admin')
    `, [
      'Admin MatchSpace',
      'admin@matchspace.com',
      adminPassword,
      adminEncrypted,
      'Administration',
      'Admin',
      'System, Review, Safety',
      'Default administrator account'
    ]);
  } else {
    await db.run("UPDATE users SET encrypted_password = ?, plain_password = NULL WHERE email = ?", [adminEncrypted, 'admin@matchspace.com']);
  }

  // Seed Demo User: demo@student.com / demo123
  const demoUser = await db.get('SELECT * FROM users WHERE email = ?', ['demo@student.com']);
  const demoEncrypted = encryptPassword('demo123');
  if (!demoUser) {
    const demoPassword = hashPassword('demo123');
    await db.run(`
      INSERT INTO users (name, email, password, encrypted_password, major, year, interests, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'Demo User',
      'demo@student.com',
      demoPassword,
      demoEncrypted,
      'Computer Science',
      'ปี 2',
      'หนัง, คาเฟ่, ดนตรี',
      'ชอบทำกิจกรรมชิล ๆ และคุยเรื่องหนังและสไตล์ชีวิต'
    ]);
  } else {
    await db.run("UPDATE users SET encrypted_password = ?, plain_password = NULL WHERE email = ?", [demoEncrypted, 'demo@student.com']);
  }
}

module.exports = {
  db,
  useTurso,
  dbPath,
  dataDir,
  initDatabase
};
