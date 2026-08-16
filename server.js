const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

// === Persistent Storage (Railway Volume) ===
const isRailwayVolume = fs.existsSync('/data');
const dataDir = process.env.DATA_DIR || (isRailwayVolume ? '/data' : __dirname);
const dbPath = path.join(dataDir, 'matchspace.db');
const uploadsDir = (process.env.DATA_DIR || isRailwayVolume)
  ? path.join(dataDir, 'uploads')
  : path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

// === Turso Cloud & Local SQLite Unified Database Adapter ===
const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://matchspace-boatza1837.aws-ap-northeast-1.turso.io';
const tursoToken = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODY4Mjc4MzQsImlkIjoiMDFhMDA3M2MtZWUwMS03NDcxLTkyMzktMDVkYzgzMzJjNmYzIiwia2lkIjoiUHR0ZlBzcU5vWXBvbWg4R2k3MzNQNm5ybWVtcGxtYjNsb1lfV2pIVE1jcyIsInJpZCI6ImIxYTI3NjRiLTkzY2QtNGZhMi05NmJmLTQ1YzllNTZkMzdjYyJ9.JaFriD-yiTCKuTsfSEh3LkdqzTUzhla4L1iME92izKbElstDZPP4aRGMjbvj2RaA628odJ_XVprfoldIOSq2BA';

const useTurso = Boolean(tursoUrl && tursoUrl.startsWith('libsql://'));

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

function formatUser(row) {
  if (!row) return null;
  const { password, ...safeUser } = row;
  return { ...safeUser, is_admin: Boolean(safeUser.is_admin) };
}

async function requireAuth(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  const dbUser = await db.get('SELECT is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0) {
    req.session.destroy(() => {
      if (isHtmlReq) return res.redirect('/');
      res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล', banned: true });
    });
    return;
  }
  next();
}

async function requireAdmin(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  const dbUser = await db.get('SELECT is_admin, role, is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0 || (!dbUser.is_admin && dbUser.role !== 'admin' && dbUser.role !== 'owner')) {
    req.session.destroy(() => {
      if (isHtmlReq) return res.redirect('/');
      res.status(403).json({ message: 'ต้องเป็นผู้ดูแลระบบ (Admin/Owner)' });
    });
    return;
  }
  next();
}

async function requireOwner(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  const dbUser = await db.get('SELECT role, is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0 || dbUser.role !== 'owner') {
    if (isHtmlReq) return res.redirect('/');
    return res.status(403).json({ message: 'สิทธิ์การใช้งานระดับ Owner เท่านั้น' });
  }
  next();
}

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      major TEXT,
      year TEXT,
      interests TEXT,
      bio TEXT,
      nickname TEXT,
      age INTEGER,
      profile_image TEXT,
      is_admin INTEGER DEFAULT 0,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'INFO',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { await db.run("ALTER TABLE chats ADD COLUMN type TEXT DEFAULT 'direct'"); } catch(e) {}
  try { await db.run("ALTER TABLE chats ADD COLUMN activity_id INTEGER DEFAULT NULL"); } catch(e) {}

  if (!useTurso) {
    const userCols = await db.all("PRAGMA table_info(users)");
    const hasAdminFlag = userCols.some(col => col.name === 'is_admin');
    if (!hasAdminFlag) await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    const hasActiveFlag = userCols.some(col => col.name === 'is_active');
    if (!hasActiveFlag) await db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
    const hasNickname = userCols.some(col => col.name === 'nickname');
    if (!hasNickname) await db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
    const hasAge = userCols.some(col => col.name === 'age');
    if (!hasAge) await db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
    const hasProfileImage = userCols.some(col => col.name === 'profile_image');
    if (!hasProfileImage) await db.exec('ALTER TABLE users ADD COLUMN profile_image TEXT');
    const hasPhone = userCols.some(col => col.name === 'phone');
    if (!hasPhone) await db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
    const hasRoleCol = userCols.some(col => col.name === 'role');
    if (!hasRoleCol) {
      await db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      await db.exec("UPDATE users SET role = 'admin' WHERE is_admin = 1");
    }
    const hasPlainPassword = userCols.some(col => col.name === 'plain_password');
    if (!hasPlainPassword) await db.exec('ALTER TABLE users ADD COLUMN plain_password TEXT');
    const hasGender = userCols.some(col => col.name === 'gender');
    if (!hasGender) await db.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'ไม่ระบุ'");
  }

  // Seed Owner Account: samak.c@admin.com / Samak14.
  const ownerEmail = 'samak.c@admin.com';
  const ownerUser = await db.get('SELECT * FROM users WHERE email = ?', [ownerEmail]);
  if (!ownerUser) {
    const ownerPassword = bcrypt.hashSync('Samak14.', 10);
    await db.run(`
      INSERT INTO users (name, email, password, plain_password, major, year, interests, bio, is_admin, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'owner', 1)
    `, [
      'System Owner',
      ownerEmail,
      ownerPassword,
      'Samak14.',
      'Management',
      'Owner',
      'System, Ownership, Security',
      'System Owner with full administrative and account management rights'
    ]);
    console.log('[Seed] Created Owner account: samak.c@admin.com');
  } else {
    await db.run("UPDATE users SET role = 'owner', is_admin = 1, plain_password = 'Samak14.' WHERE email = ?", [ownerEmail]);
  }

  const adminUser = await db.get('SELECT * FROM users WHERE email = ?', ['admin@matchspace.com']);
  if (!adminUser) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    await db.run(`
      INSERT INTO users (name, email, password, plain_password, major, year, interests, bio, is_admin, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'admin')
    `, [
      'Admin MatchSpace',
      'admin@matchspace.com',
      adminPassword,
      'admin123',
      'Administration',
      'Admin',
      'System, Review, Safety',
      'Default administrator account'
    ]);
  }

  const demoUser = await db.get('SELECT * FROM users WHERE email = ?', ['demo@student.com']);
  if (!demoUser) {
    const demoPassword = bcrypt.hashSync('demo123', 10);
    await db.run(`
      INSERT INTO users (name, email, password, plain_password, major, year, interests, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'Demo User',
      'demo@student.com',
      demoPassword,
      'demo123',
      'Computer Science',
      'ปี 2',
      'หนัง, คาเฟ่, ดนตรี',
      'ชอบทำกิจกรรมชิล ๆ และคุยเรื่องหนังและสไตล์ชีวิต'
    ]);
  }
}

initDatabase().catch(err => console.error('[Init DB Error]', err));

async function getOrCreateActivityChat(activityId) {
  try {
    let chat = await db.get("SELECT * FROM chats WHERE activity_id = ? OR (type = 'group' AND activity_id = ?)", [Number(activityId), Number(activityId)]);
    if (!chat) {
      const activity = await db.get('SELECT * FROM activities WHERE id = ?', [Number(activityId)]);
      if (!activity) return null;
      const title = `กลุ่ม: ${activity.name}`;
      const result = await db.run(
        "INSERT INTO chats (user_a, user_b, title, type, activity_id) VALUES (?, 0, ?, 'group', ?)",
        [activity.created_by, title, activity.id]
      );
      chat = await db.get('SELECT * FROM chats WHERE id = ?', [result.lastInsertRowid]);
    }
    const activity = await db.get('SELECT * FROM activities WHERE id = ?', [Number(activityId)]);
    if (activity) {
      try {
        await db.run('INSERT OR IGNORE INTO activity_members (activity_id, user_id) VALUES (?, ?)', [activity.id, activity.created_by]);
      } catch(e) {}
    }
    return chat;
  } catch(e) {
    console.error('[getOrCreateActivityChat Error]', e);
    return null;
  }
}

async function dissolveActivityGroup(activityId) {
  try {
    const actId = Number(activityId);
    const chats = await db.all(
      "SELECT id FROM chats WHERE activity_id = ? OR (type = 'group' AND activity_id = ?)",
      [actId, actId]
    );
    for (const c of chats) {
      await db.run('DELETE FROM chat_messages WHERE chat_id = ?', [c.id]);
      await db.run('DELETE FROM chats WHERE id = ?', [c.id]);
    }
    await db.run('DELETE FROM activity_members WHERE activity_id = ?', [actId]);
  } catch (err) {
    console.error('[dissolveActivityGroup Error]', err);
  }
}

async function logAudit(level, message) {
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[Audit] [${level}] ${message}`);
    await db.run('INSERT INTO audit_logs (level, message) VALUES (?, ?)', [level, message]);
  } catch (err) {
    console.error('[logAudit Error]', err);
  }
}

function parseDevice(userAgent) {
  if (!userAgent) return 'Unknown Device';
  let device = 'Desktop';
  if (/mobile/i.test(userAgent)) device = 'Mobile';
  if (/android/i.test(userAgent)) device = 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) device = 'iOS';
  if (/windows/i.test(userAgent)) device = 'Windows PC';
  if (/macintosh|mac os x/i.test(userAgent)) device = 'Mac';
  if (/linux/i.test(userAgent)) device = 'Linux';

  if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) device += ' (Chrome)';
  else if (/edg/i.test(userAgent)) device += ' (Edge)';
  else if (/firefox/i.test(userAgent)) device += ' (Firefox)';
  else if (/safari/i.test(userAgent)) device += ' (Safari)';
  return device;
}

async function logLogin(req, email, userId, status = 'success') {
  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim().replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const device = parseDevice(userAgent);

    await db.run(
      'INSERT INTO login_logs (user_id, email, ip, device, status) VALUES (?, ?, ?, ?, ?)',
      [userId || null, email, ip, device, status]
    );

    const logMsg = status === 'success'
      ? `User '${email}' logged in successfully (IP: ${ip}, Device: ${device})`
      : `Failed login attempt for '${email}' (IP: ${ip}, Device: ${device})`;

    await logAudit(status === 'success' ? 'INFO' : 'WARN', logMsg);
  } catch (err) {
    console.error('[logLogin Error]', err);
  }
}

app.use(session({
  secret: 'matchspace-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'ไฟล์ต้องไม่เกิน 5MB' });
    }
    return res.status(400).json({ message: 'เกิดข้อผิดพลาดในการอัพโหลดไฟล์' });
  }
  if (err && err.message === 'อนุญาตเฉพาะไฟล์รูปภาพ') {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

app.get('/api/session', async (req, res) => {
  if (!req.session?.user) {
    return res.json({ user: null });
  }
  const dbUser = await db.get('SELECT is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0) {
    req.session.destroy(() => {
      res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน', user: null, banned: true });
    });
    return;
  }
  res.json({ user: req.session.user });
});

app.get('/api/public/users', async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, major
    FROM users
    WHERE is_active != 0 
      AND (is_admin IS NULL OR is_admin = 0)
      AND (role IS NULL OR role = 'user' OR role = '')
    ORDER BY name ASC
  `);
  res.json(users);
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (!user) {
      await logLogin(req, email, null, 'failed');
      return res.status(401).json({ message: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }

    const valid = bcrypt.compareSync(String(password), user.password);
    if (!valid) {
      await logLogin(req, email, user.id, 'failed');
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    if (user.is_active === 0) {
      await logLogin(req, email, user.id, 'failed (banned)');
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล' });
    }

    const safeUser = formatUser(user);
    req.session.user = { ...safeUser, is_admin: Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner') };

    await logLogin(req, email, user.id, 'success');

    req.session.save((err) => {
      if (err) {
        console.error('[Session Save Error]', err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกเซสชัน' });
      }
      res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: req.session.user });
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, email, name, picture } = req.body || {};

    let googleEmail = email;
    let googleName = name;
    let googlePicture = picture;

    if (credential) {
      try {
        const payloadBase64 = credential.split('.')[1];
        const decodedJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(decodedJson);
        googleEmail = payload.email;
        googleName = payload.name || payload.email.split('@')[0];
        googlePicture = payload.picture || '';
      } catch (e) {
        return res.status(400).json({ message: 'Token Google ไม่ถูกต้อง' });
      }
    }

    if (!googleEmail) {
      return res.status(400).json({ message: 'ไม่พบข้อมูลอีเมลจาก Google' });
    }

    const normalizedEmail = String(googleEmail).trim().toLowerCase();
    let user = await db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    if (!user) {
      return res.json({
        is_registered: false,
        message: 'โปรดกรอกข้อมูลเพิ่มเติมเพื่อสมัครสมาชิก',
        redirect: `/register?google_email=${encodeURIComponent(normalizedEmail)}&google_name=${encodeURIComponent(googleName || '')}&google_pic=${encodeURIComponent(googlePicture || '')}`
      });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล', banned: true });
    }

    const safeUser = formatUser(user);
    req.session.user = { ...safeUser, is_admin: Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner') };

    req.session.save((err) => {
      if (err) {
        console.error('[Session Save Error]', err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกเซสชัน' });
      }
      res.json({
        is_registered: true,
        message: 'เข้าสู่ระบบด้วย Google สำเร็จ',
        user: req.session.user,
        redirect: (user.role === 'admin' || user.role === 'owner' || user.is_admin) ? '/admin' : '/app'
      });
    });
  } catch (err) {
    console.error('[Google Auth Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการยืนยันตัวตน' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'ออกจากระบบแล้ว' });
  });
});

const multiUpload = upload.fields([
  { name: 'profile_image_file', maxCount: 1 },
  { name: 'photos', maxCount: 6 }
]);

app.post('/api/register', multiUpload, async (req, res) => {
  const { name, email, password, gender, major, year, interests, bio, nickname, age, phone, google_profile_image } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อ อีเมล และรหัสผ่าน' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existingUser) {
    return res.status(409).json({ message: 'อีเมลนี้มีผู้ใช้งานแล้ว' });
  }

  let profileImage = '';
  if (req.files && req.files.profile_image_file && req.files.profile_image_file[0]) {
    profileImage = `/uploads/${req.files.profile_image_file[0].filename}`;
  } else if (google_profile_image) {
    profileImage = String(google_profile_image).trim();
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = await db.run(`
    INSERT INTO users (name, email, password, plain_password, gender, major, year, interests, bio, nickname, age, phone, profile_image, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    String(name).trim(),
    normalizedEmail,
    passwordHash,
    String(password).trim(),
    gender || 'ไม่ระบุ',
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    phone || '',
    profileImage
  ]);

  const userId = result.lastInsertRowid;

  // Insert primary profile photo into user_photos table
  if (profileImage) {
    await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, profileImage]);
  }

  // Insert additional multi-photos if uploaded
  if (req.files && req.files.photos) {
    for (const f of req.files.photos) {
      const url = `/uploads/${f.filename}`;
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
    }
  }

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  const safeUser = formatUser(user);
  req.session.user = safeUser;
  res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: safeUser });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'MatchSpace API is running', turso: useTurso });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  const photos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [req.session.user.id]);
  res.json({ user: formatUser(user), photos });
});

app.put('/api/me', requireAuth, multiUpload, async (req, res) => {
  const { name, gender, major, year, interests, bio, nickname, age } = req.body || {};
  const userId = req.session.user.id;

  let profileImage = req.session.user.profile_image || '';
  if (req.files && req.files.profile_image_file && req.files.profile_image_file[0]) {
    profileImage = `/uploads/${req.files.profile_image_file[0].filename}`;
    await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, profileImage]);
  }

  // Handle multi-photos uploaded during profile edit
  if (req.files && req.files.photos) {
    for (const f of req.files.photos) {
      const url = `/uploads/${f.filename}`;
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
      if (!profileImage) profileImage = url;
    }
  }

  await db.run(`
    UPDATE users
    SET name = ?, gender = ?, major = ?, year = ?, interests = ?, bio = ?, nickname = ?, age = ?, profile_image = ?
    WHERE id = ?
  `, [
    String(name || req.session.user.name).trim(),
    gender || req.session.user.gender || 'ไม่ระบุ',
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    profileImage,
    userId
  ]);

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  req.session.user = formatUser(user);
  res.json({ message: 'อัปเดตโปรไฟล์สำเร็จ', user: req.session.user });
});

// --- Profile Detail API with Multi-Photo Gallery ---
app.get('/api/users/:id/profile', requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  const user = await db.get(`
    SELECT id, name, nickname, gender, age, major, year, interests, bio, profile_image, created_at
    FROM users WHERE id = ? AND is_active != 0
  `, [targetId]);

  if (!user) {
    return res.status(404).json({ message: 'ไม่พบโปรไฟล์นี้' });
  }

  const photos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [targetId]);
  
  // Ensure profile_image is in photos list if list is empty
  let photoUrls = photos.map(p => p.photo_url);
  if (photoUrls.length === 0 && user.profile_image) {
    photoUrls = [user.profile_image];
  }

  res.json({ user, photos: photoUrls });
});

// Upload Extra Photos
app.post('/api/me/photos', requireAuth, upload.array('photos', 6), async (req, res) => {
  try {
    const userId = req.session.user.id;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'กรุณาเลือกไฟล์รูปภาพเพื่ออัปโหลด' });
    }

    const newPhotos = [];
    for (const f of req.files) {
      const url = `/uploads/${f.filename}`;
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
      newPhotos.push(url);
    }

    const allPhotos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [userId]);
    res.json({ message: 'เพิ่มรูปภาพโปรไฟล์เรียบร้อย', photos: allPhotos.map(p => p.photo_url) });
  } catch (err) {
    console.error('[Upload Photos Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
  }
});

// Delete Extra Photo
app.delete('/api/me/photos/:photoId', requireAuth, async (req, res) => {
  try {
    const photoId = Number(req.params.photoId);
    const userId = req.session.user.id;

    await db.run('DELETE FROM user_photos WHERE id = ? AND user_id = ?', [photoId, userId]);
    const allPhotos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [userId]);
    res.json({ message: 'ลบรูปภาพสำเร็จ', photos: allPhotos.map(p => p.photo_url) });
  } catch (err) {
    console.error('[Delete Photo Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบรูปภาพ' });
  }
});

app.get('/api/candidates', requireAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id, name, email, gender, major, year, interests, bio, nickname, age, profile_image, is_active, created_at
      FROM users
      WHERE id != ? 
        AND is_active != 0 
        AND (is_admin IS NULL OR is_admin = 0)
        AND (role IS NULL OR role = 'user' OR role = '')
        AND id NOT IN (SELECT matched_user_id FROM matches WHERE user_id = ?)
      ORDER BY created_at DESC
      LIMIT 30
    `, [req.session.user.id, req.session.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[Candidates Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT m.*, u.name AS matched_name, u.major, u.interests, u.profile_image
      FROM matches m
      JOIN users u ON u.id = m.matched_user_id
      WHERE m.user_id = ?
      ORDER BY m.created_at DESC
    `, [req.session.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[Matches Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

app.post('/api/matches', requireAuth, async (req, res) => {
  try {
    const { matched_user_id, note, status } = req.body || {};
    const userId = req.session.user.id;

    if (!matched_user_id) {
      return res.status(400).json({ message: 'กรุณาเลือกผู้ใช้งานที่ต้องการแมตช์' });
    }

    const target = await db.get('SELECT * FROM users WHERE id = ?', [Number(matched_user_id)]);
    if (!target) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
    }

    const existing = await db.get('SELECT * FROM matches WHERE user_id = ? AND matched_user_id = ?', [userId, Number(matched_user_id)]);
    if (existing) {
      await db.run('UPDATE matches SET status = ?, note = ? WHERE id = ?', [status || existing.status || 'pending', note || existing.note || '', existing.id]);
      const updated = await db.get('SELECT * FROM matches WHERE id = ?', [existing.id]);
      return res.json({ message: 'อัปเดต match แล้ว', match: updated });
    }

    const result = await db.run('INSERT INTO matches (user_id, matched_user_id, status, note) VALUES (?, ?, ?, ?)', [userId, Number(matched_user_id), status || 'pending', note || '']);
    const match = await db.get('SELECT * FROM matches WHERE id = ?', [result.lastInsertRowid]);

    let mutualMatch = false;
    if (status === 'liked') {
      const reverse = await db.get('SELECT * FROM matches WHERE user_id = ? AND matched_user_id = ? AND status = ?', [Number(matched_user_id), userId, 'liked']);
      if (reverse) {
        mutualMatch = true;
        await db.run('UPDATE matches SET status = ? WHERE id = ?', ['matched', match.id]);
        await db.run('UPDATE matches SET status = ? WHERE id = ?', ['matched', reverse.id]);

        const existingChat = await db.get(`
          SELECT * FROM chats
          WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
        `, [userId, Number(matched_user_id), Number(matched_user_id), userId]);

        if (!existingChat) {
          await db.run('INSERT INTO chats (user_a, user_b, title) VALUES (?, ?, ?)', [userId, Number(matched_user_id), 'แมตช์สำเร็จ!']);
        }
      }
    }

    const updatedMatch = await db.get('SELECT * FROM matches WHERE id = ?', [match.id]);
    res.status(201).json({
      message: mutualMatch ? '🎉 แมตช์สำเร็จ! ระบบสร้างแชทให้แล้ว' : 'เพิ่ม match สำเร็จ',
      match: updatedMatch,
      mutual: mutualMatch
    });
  } catch (err) {
    console.error('[Post Match Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแมตช์' });
  }
});

app.get('/api/chats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isOwner = req.session.user.role === 'owner';

    // Ensure all approved activities have group chats
    const approvedActivities = await db.all("SELECT id FROM activities WHERE status = 'approved'");
    for (const act of approvedActivities) {
      await getOrCreateActivityChat(act.id);
    }

    let rows = [];
    if (isOwner) {
      rows = await db.all(`
        SELECT c.id, c.user_a, c.user_b, c.title, c.type, c.activity_id, c.created_at,
               a.name AS activity_name, a.created_by AS creator_id, u_creator.name AS creator_name,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN COALESCE(c.title, a.name, 'แชทกลุ่มกิจกรรม')
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.name 
                 WHEN CAST(c.user_b AS INTEGER) = CAST(? AS INTEGER) THEN u1.name 
                 ELSE u1.name || ' 💕 ' || u2.name 
               END AS partner_name,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN NULL
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.id 
                 WHEN CAST(c.user_b AS INTEGER) = CAST(? AS INTEGER) THEN u1.id 
                 ELSE u2.id 
               END AS partner_id,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN NULL
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.profile_image 
                 WHEN CAST(c.user_b AS INTEGER) = CAST(? AS INTEGER) THEN u1.profile_image 
                 ELSE u2.profile_image 
               END AS partner_profile_image,
               (SELECT content FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
               (SELECT created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_time
        FROM chats c
        LEFT JOIN users u1 ON u1.id = c.user_a
        LEFT JOIN users u2 ON u2.id = c.user_b
        LEFT JOIN activities a ON a.id = c.activity_id
        LEFT JOIN users u_creator ON u_creator.id = a.created_by
        WHERE ((c.type = 'group' OR c.activity_id IS NOT NULL) AND a.status = 'approved')
           OR ((c.type IS NULL OR c.type != 'group') AND c.activity_id IS NULL)
        ORDER BY COALESCE(last_message_time, c.created_at) DESC
      `, [userId, userId, userId, userId, userId, userId]);
    } else {
      rows = await db.all(`
        SELECT c.id, c.user_a, c.user_b, c.title, c.type, c.activity_id, c.created_at,
               a.name AS activity_name, a.created_by AS creator_id, u_creator.name AS creator_name,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN COALESCE(c.title, a.name, 'แชทกลุ่มกิจกรรม')
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.name 
                 ELSE u1.name 
               END AS partner_name,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN NULL
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.id 
                 ELSE u1.id 
               END AS partner_id,
               CASE 
                 WHEN c.type = 'group' OR c.activity_id IS NOT NULL THEN NULL
                 WHEN CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) THEN u2.profile_image 
                 ELSE u1.profile_image 
               END AS partner_profile_image,
               (SELECT content FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
               (SELECT created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_time
        FROM chats c
        LEFT JOIN users u1 ON u1.id = c.user_a
        LEFT JOIN users u2 ON u2.id = c.user_b
        LEFT JOIN activities a ON a.id = c.activity_id
        LEFT JOIN users u_creator ON u_creator.id = a.created_by
        WHERE (
          (c.type = 'group' OR c.activity_id IS NOT NULL) AND a.status = 'approved' AND (
            CAST(a.created_by AS INTEGER) = CAST(? AS INTEGER)
            OR EXISTS (SELECT 1 FROM activity_members am WHERE am.activity_id = c.activity_id AND CAST(am.user_id AS INTEGER) = CAST(? AS INTEGER))
          )
        ) OR (
          (c.type IS NULL OR c.type != 'group') AND c.activity_id IS NULL AND (
            CAST(c.user_a AS INTEGER) = CAST(? AS INTEGER) OR CAST(c.user_b AS INTEGER) = CAST(? AS INTEGER)
          )
        )
        ORDER BY COALESCE(last_message_time, c.created_at) DESC
      `, [userId, userId, userId, userId, userId, userId, userId]);
    }

    res.json(rows);
  } catch (err) {
    console.error('[Get Chats Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงรายการแชท' });
  }
});

app.post('/api/chats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ message: 'กรุณาเลือกผู้ใช้งานก่อนเริ่มแชท' });
    }

    const target = await db.get('SELECT id FROM users WHERE id = ?', [Number(user_id)]);
    if (!target) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
    }

    const existing = await db.get(`
      SELECT * FROM chats
      WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
    `, [userId, Number(user_id), Number(user_id), userId]);

    if (existing) {
      return res.json({ message: 'มีแชทนี้อยู่แล้ว', chat: existing });
    }

    const result = await db.run("INSERT INTO chats (user_a, user_b, title, type) VALUES (?, ?, ?, 'direct')", [userId, Number(user_id), 'Chat']);
    const chat = await db.get('SELECT * FROM chats WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'สร้างแชทสำเร็จ', chat });
  } catch (err) {
    console.error('[Create Chat Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการสร้างแชท' });
  }
});

app.get('/api/chats/:id/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isOwner = req.session.user.role === 'owner';
    const chatId = Number(req.params.id);

    const chat = await db.get(`
      SELECT c.*, a.name AS activity_name, a.created_by AS creator_id, u_creator.name AS creator_name
      FROM chats c
      LEFT JOIN activities a ON a.id = c.activity_id
      LEFT JOIN users u_creator ON u_creator.id = a.created_by
      WHERE c.id = ?
    `, [chatId]);

    if (!chat) {
      return res.status(404).json({ message: 'ไม่พบแชทนี้' });
    }

    let hasAccess = isOwner;
    if (!hasAccess) {
      if (chat.activity_id || chat.type === 'group') {
        const isCreator = Number(chat.creator_id) === Number(userId);
        const isMember = await db.get('SELECT 1 FROM activity_members WHERE activity_id = ? AND user_id = ?', [chat.activity_id, userId]);
        if (isCreator || isMember) hasAccess = true;
      } else {
        if (Number(chat.user_a) === Number(userId) || Number(chat.user_b) === Number(userId)) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงแชทนี้' });
    }

    const messages = await db.all(`
      SELECT m.*, u.name AS sender_name, u.profile_image AS sender_profile_image, u.role AS sender_role
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
    `, [chatId]);

    res.json({ chat, messages });
  } catch (err) {
    console.error('[Get Messages Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อความแชท' });
  }
});

app.post('/api/chats/:id/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isOwner = req.session.user.role === 'owner';
    const chatId = Number(req.params.id);

    const chat = await db.get(`
      SELECT c.*, a.created_by AS creator_id
      FROM chats c
      LEFT JOIN activities a ON a.id = c.activity_id
      WHERE c.id = ?
    `, [chatId]);

    if (!chat) {
      return res.status(404).json({ message: 'ไม่พบแชทนี้' });
    }

    let hasAccess = isOwner;
    if (!hasAccess) {
      if (chat.activity_id || chat.type === 'group') {
        const isCreator = Number(chat.creator_id) === Number(userId);
        const isMember = await db.get('SELECT 1 FROM activity_members WHERE activity_id = ? AND user_id = ?', [chat.activity_id, userId]);
        if (isCreator || isMember) hasAccess = true;
      } else {
        if (Number(chat.user_a) === Number(userId) || Number(chat.user_b) === Number(userId)) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ส่งข้อความในแชทนี้' });
    }

    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
    }

    const result = await db.run('INSERT INTO chat_messages (chat_id, sender_id, content) VALUES (?, ?, ?)', [
      chatId, userId, String(content).trim()
    ]);

    const message = await db.get('SELECT * FROM chat_messages WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'ส่งข้อความสำเร็จ', message });
  } catch (err) {
    console.error('[Send Message Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งข้อความ' });
  }
});

app.delete('/api/chats/:chatId/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isOwner = req.session.user.role === 'owner';
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);

    const chat = await db.get('SELECT c.*, a.created_by AS creator_id FROM chats c LEFT JOIN activities a ON a.id = c.activity_id WHERE c.id = ?', [chatId]);
    if (!chat) return res.status(404).json({ message: 'ไม่พบแชทนี้' });

    const message = await db.get('SELECT * FROM chat_messages WHERE id = ? AND chat_id = ?', [messageId, chatId]);
    if (!message) return res.status(404).json({ message: 'ไม่พบข้อความนี้' });

    const isSender = Number(message.sender_id) === Number(userId);
    const isHost = chat.activity_id && Number(chat.creator_id) === Number(userId);

    if (!isSender && !isHost && !isOwner) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ลบข้อความนี้' });
    }

    await db.run('DELETE FROM chat_messages WHERE id = ?', [messageId]);
    res.json({ message: 'ลบข้อความสำเร็จ' });
  } catch (err) {
    console.error('[Delete Message Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบข้อความ' });
  }
});

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id, name, email, major, year, interests, bio, is_admin, is_active, created_at
      FROM users
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Admin Users Error]', err);
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/reports', upload.single('evidence_file'), async (req, res) => {
  try {
    const { reporter_name, reporter_email, reported_user, report_type, description } = req.body || {};

    if (!reporter_name || !reporter_email || !reported_user || !report_type || !description) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลรายงานให้ครบถ้วน' });
    }

    const evidenceFilename = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await db.run(`
      INSERT INTO reports (reporter_name, reporter_email, reported_user, report_type, description, status, evidence_file)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `, [
      String(reporter_name).trim(),
      String(reporter_email).trim().toLowerCase(),
      String(reported_user).trim(),
      String(report_type).trim(),
      String(description).trim(),
      evidenceFilename
    ]);

    const report = await db.get('SELECT * FROM reports WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'ส่งรายงานสำเร็จ', report });
  } catch (err) {
    console.error('[Report Submission Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งรายงาน' });
  }
});

app.get('/api/reports', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT r.*, 
        u.id AS target_user_id,
        u.name AS target_user_name,
        u.email AS target_user_email,
        u.is_active AS target_user_active,
        u.is_admin AS target_user_is_admin
      FROM reports r
      LEFT JOIN users u ON (
        CAST(r.reported_user AS TEXT) = CAST(u.id AS TEXT) 
        OR r.reported_user = u.name 
        OR r.reported_user = u.email
      )
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Admin Reports Error]', err);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const counts = await db.get(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM reports) AS total_reports,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') AS pending_reports,
        (SELECT COUNT(*) FROM reports WHERE status = 'resolved') AS resolved_reports
    `);
    res.json(counts);
  } catch (err) {
    console.error('[Admin Summary Error]', err);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/activities', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const rows = await db.all(`
      SELECT a.*, u.name AS creator_name, u.major AS creator_major,
        (SELECT COUNT(*) FROM activity_members am WHERE am.activity_id = a.id) AS actual_members,
        (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'ชาย') AS male_count,
        (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'หญิง') AS female_count,
        (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'เพศหลากหลาย') AS lgbtq_count
      FROM activities a
      JOIN users u ON u.id = a.created_by
      WHERE a.status = 'approved'
      ORDER BY a.created_at DESC
    `);

    const joined = await db.all('SELECT activity_id FROM activity_members WHERE user_id = ?', [userId]);
    const joinedSet = new Set(joined.map(j => j.activity_id));

    const result = [];
    for (const r of rows) {
      const chat = await getOrCreateActivityChat(r.id);
      result.push({
        ...r,
        has_joined: joinedSet.has(r.id),
        chat_id: chat ? chat.id : null
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[Get Activities Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม' });
  }
});

app.post('/api/activities', requireAuth, async (req, res) => {
  try {
    const { name, description, member_count, location } = req.body || {};
    const userId = req.session.user.id;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(401).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'กรุณากรอกชื่อกิจกรรม' });
    }

    if (!location || !String(location).trim()) {
      return res.status(400).json({ message: 'กรุณากรอกสถานที่จัดกิจกรรม' });
    }

    const result = await db.run(`
      INSERT INTO activities (name, description, location, created_by, creator_name, creator_major, member_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      String(name).trim(),
      description || '',
      String(location).trim(),
      user.id,
      user.name || 'ไม่ระบุ',
      user.major || '-',
      Number(member_count || 0)
    ]);

    const activity = await db.get('SELECT * FROM activities WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'สร้างกิจกรรมเรียบร้อย รอการอนุมัติจากผู้ดูแล', activity });
  } catch (err) {
    console.error('[Create Activity Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการสร้างกิจกรรม' });
  }
});

app.get('/api/admin/activities', requireAdmin, async (req, res) => {
  const rows = await db.all(`
    SELECT a.*, u.name AS creator_name, u.major AS creator_major,
      (SELECT COUNT(*) FROM activity_members am WHERE am.activity_id = a.id) AS actual_members,
      (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'ชาย') AS male_count,
      (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'หญิง') AS female_count,
      (SELECT COUNT(*) FROM activity_members am JOIN users u2 ON u2.id = am.user_id WHERE am.activity_id = a.id AND u2.gender = 'เพศหลากหลาย') AS lgbtq_count
    FROM activities a
    JOIN users u ON u.id = a.created_by
    ORDER BY a.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/admin/system-stats', requireAdmin, async (req, res) => {
  try {
    const cpus = os.cpus();
    let cpuPercent = 16;
    if (cpus && cpus.length > 0) {
      const load = os.loadavg()[0];
      cpuPercent = Math.min(100, Math.max(4, Math.round((load / cpus.length) * 100))) || (12 + (Date.now() % 8));
    }

    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const dbType = useTurso ? 'Turso LibSQL' : 'SQLite Local';

    const startMs = Date.now();
    await db.get('SELECT 1');
    const responseTimeMs = Math.max(1, Date.now() - startMs);

    const auditLogs = await db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 30');
    const loginLogs = await db.all('SELECT * FROM login_logs ORDER BY id DESC LIMIT 30');

    res.json({
      cpu_usage: `${cpuPercent}%`,
      memory_usage: `${rssMB} MB`,
      database_type: dbType,
      api_response_time: `${responseTimeMs} ms`,
      uptime: `${(process.uptime() / 3600).toFixed(1)} ชม.`,
      audit_logs: auditLogs,
      login_logs: loginLogs
    });
  } catch (err) {
    console.error('[System Stats Error]', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลระบบ' });
  }
});

app.patch('/api/admin/activities/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const actId = Number(id);

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'สถานะการอนุมัติไม่ถูกต้อง' });
  }

  const activity = await db.get('SELECT * FROM activities WHERE id = ?', [actId]);
  if (!activity) {
    return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
  }

  await db.run('UPDATE activities SET status = ? WHERE id = ?', [status, actId]);

  if (status === 'approved') {
    await getOrCreateActivityChat(actId);
  } else if (status === 'rejected') {
    await dissolveActivityGroup(actId);
  }

  res.json({ message: status === 'approved' ? 'อนุมัติกิจกรรมและสร้างแชทกลุ่มสำเร็จ' : 'ปฏิเสธกิจกรรมและยุบแชทกลุ่มเรียบร้อย' });
});

app.delete('/api/activities/:id', requireAuth, async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const userId = req.session.user.id;
    const isOwnerOrAdmin = req.session.user.role === 'owner' || req.session.user.role === 'admin' || req.session.user.is_admin;

    const activity = await db.get('SELECT * FROM activities WHERE id = ?', [activityId]);
    if (!activity) {
      return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
    }

    const isCreator = Number(activity.created_by) === Number(userId);
    if (!isCreator && !isOwnerOrAdmin) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ลบกิจกรรมนี้' });
    }

    await db.run('DELETE FROM activities WHERE id = ?', [activityId]);
    await dissolveActivityGroup(activityId);

    res.json({ message: 'ลบกิจกรรมและยุบแชทกลุ่มเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('[Delete Activity Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบกิจกรรม' });
  }
});

app.delete('/api/admin/activities/:id', requireAdmin, async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const activity = await db.get('SELECT * FROM activities WHERE id = ?', [activityId]);
    if (!activity) {
      return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
    }

    await db.run('DELETE FROM activities WHERE id = ?', [activityId]);
    await dissolveActivityGroup(activityId);

    res.json({ message: 'ลบกิจกรรมและยุบแชทกลุ่มเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('[Admin Delete Activity Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบกิจกรรม' });
  }
});

app.patch('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, admin_note } = req.body || {};
  const validStatus = ['pending', 'reviewed', 'resolved', 'rejected'];

  if (!validStatus.includes(status)) {
    return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
  }

  const report = await db.get('SELECT * FROM reports WHERE id = ?', [Number(id)]);
  if (!report) {
    return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
  }

  await db.run('UPDATE reports SET status = ?, admin_note = ? WHERE id = ?', [status, admin_note || '', Number(id)]);
  const updated = await db.get('SELECT * FROM reports WHERE id = ?', [Number(id)]);
  res.json({ message: 'อัปเดตรายงานสำเร็จ', report: updated });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, major, year, interests, bio, nickname, age, profile_image, is_admin, is_active, role, plain_password, created_at
    FROM users
    ORDER BY id ASC
  `);
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireOwner, async (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body || {};

  if (!['user', 'admin', 'owner'].includes(role)) {
    return res.status(400).json({ message: 'กลุ่มผู้ใช้งานไม่ถูกต้อง (ต้องเป็น user, admin, หรือ owner)' });
  }

  const isAdminVal = role === 'user' ? 0 : 1;
  await db.run('UPDATE users SET role = ?, is_admin = ? WHERE id = ?', [role, isAdminVal, targetId]);
  const updatedUser = await db.get('SELECT id, name, email, role, is_admin FROM users WHERE id = ?', [targetId]);
  res.json({ message: `อัปเดตกลุ่มผู้ใช้งานเป็น ${role} เรียบร้อยแล้ว`, user: updatedUser });
});

app.put('/api/admin/users/:id/password', requireOwner, async (req, res) => {
  const targetId = Number(req.params.id);
  const { new_password } = req.body || {};

  if (!new_password || String(new_password).trim().length < 4) {
    return res.status(400).json({ message: 'กรุณากรอกรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร' });
  }

  const plain = String(new_password).trim();
  const hash = bcrypt.hashSync(plain, 10);
  await db.run('UPDATE users SET password = ?, plain_password = ? WHERE id = ?', [hash, plain, targetId]);

  res.json({ message: `เปลี่ยนรหัสผ่านของผู้ใช้เรียบร้อยแล้ว (รหัสผ่านใหม่: ${plain})`, plain_password: plain });
});

app.post('/api/admin/reports/:id/warn', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { warning_message, target_user_id } = req.body || {};

    if (!warning_message || !String(warning_message).trim()) {
      return res.status(400).json({ message: 'กรุณากรอกข้อความตักเตือน' });
    }

    const report = await db.get('SELECT * FROM reports WHERE id = ?', [Number(id)]);
    if (!report) {
      return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
    }

    // Try target_user_id from frontend first, fall back to reported_user lookup
    let targetUser = null;
    if (target_user_id) {
      targetUser = await db.get('SELECT * FROM users WHERE id = ?', [Number(target_user_id)]);
    }
    if (!targetUser) {
      targetUser = await db.get(`
        SELECT * FROM users
        WHERE CAST(id AS TEXT) = CAST(? AS TEXT) OR name = ? OR email = ?
      `, [report.reported_user, report.reported_user, report.reported_user]);
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'ไม่พบผู้ถูกรายงานในระบบ กรุณาตรวจสอบข้อมูลผู้ถูกรายงาน' });
    }

    const adminId = req.session.user.id;

    let chat = await db.get(`
      SELECT * FROM chats
      WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
    `, [adminId, targetUser.id, targetUser.id, adminId]);

    if (!chat) {
      const chatResult = await db.run(`
        INSERT INTO chats (user_a, user_b, title)
        VALUES (?, ?, 'แจ้งเตือนจากผู้ดูแลระบบ')
      `, [adminId, targetUser.id]);
      chat = await db.get('SELECT * FROM chats WHERE id = ?', [chatResult.lastInsertRowid]);
    }

    const warnText = `⚠️ [คำเตือนจากผู้ดูแลระบบ (${report.report_type})]: ${warning_message.trim()}`;
    await db.run('INSERT INTO chat_messages (chat_id, sender_id, content) VALUES (?, ?, ?)', [chat.id, adminId, warnText]);

    const noteEntry = `[ส่งเตือนผู้ใช้ (${targetUser.name})]: ${warning_message.trim()}`;
    const newNote = report.admin_note ? `${report.admin_note}\n${noteEntry}` : noteEntry;
    await db.run("UPDATE reports SET status = 'reviewed', admin_note = ? WHERE id = ?", [newNote, Number(id)]);

    res.json({ message: `ส่งข้อความเตือนไปยัง ${targetUser.name} เรียบร้อยแล้ว` });
  } catch (err) {
    console.error('[Warn User Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งคำเตือน' });
  }
});

app.patch('/api/users/:id/disable', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await db.get('SELECT * FROM users WHERE id = ?', [Number(id)]);
  
  if (!user) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  if (user.is_admin) {
    return res.status(403).json({ message: 'ไม่สามารถปิดการใช้งานผู้ดูแลได้' });
  }

  await db.run('UPDATE users SET is_active = 0 WHERE id = ?', [Number(id)]);
  res.json({ message: 'ปิดการใช้งานผู้ใช้งานสำเร็จ', user: { ...user, is_active: 0 } });
});

app.patch('/api/users/:id/enable', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await db.get('SELECT * FROM users WHERE id = ?', [Number(id)]);
  
  if (!user) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  await db.run('UPDATE users SET is_active = 1 WHERE id = ?', [Number(id)]);
  res.json({ message: 'เปิดการใช้งานผู้ใช้งานสำเร็จ', user: { ...user, is_active: 1 } });
});

app.post('/api/activities/:id/join', requireAuth, async (req, res) => {
  const activityId = Number(req.params.id);
  const userId = req.session.user.id;

  const activity = await db.get('SELECT * FROM activities WHERE id = ? AND status = ?', [activityId, 'approved']);
  if (!activity) {
    return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
  }

  try {
    await db.run('INSERT INTO activity_members (activity_id, user_id) VALUES (?, ?)', [activityId, userId]);
  } catch (e) {
    // Already joined
  }

  const chat = await getOrCreateActivityChat(activityId);
  const countObj = await db.get('SELECT COUNT(*) AS cnt FROM activity_members WHERE activity_id = ?', [activityId]);
  res.json({
    message: 'เข้าร่วมกิจกรรมสำเร็จ',
    member_count: countObj ? countObj.cnt : 0,
    chat_id: chat ? chat.id : null
  });
});

app.delete('/api/activities/:id/join', requireAuth, async (req, res) => {
  const activityId = Number(req.params.id);
  const userId = req.session.user.id;

  await db.run('DELETE FROM activity_members WHERE activity_id = ? AND user_id = ?', [activityId, userId]);
  const countObj = await db.get('SELECT COUNT(*) AS cnt FROM activity_members WHERE activity_id = ?', [activityId]);
  res.json({ message: 'ยกเลิกเข้าร่วมกิจกรรมสำเร็จ', member_count: countObj ? countObj.cnt : 0 });
});

app.get('/api/greetings', requireAuth, (req, res) => {
  const greetings = [
    'สวัสดีค่า/ครับ ยินดีที่ได้แมตช์กัน 😊',
    'เห็นว่าเราสนใจเรื่องเดียวกัน เล่าให้ฟังหน่อยได้มั้ย?',
    'ช่วงนี้ทำอะไรอยู่คะ/ครับ?',
    'ปกติชอบไปคาเฟ่แถวไหนอ่ะ? ☕',
    'ดูซีรีส์/หนังเรื่องไหนอยู่เหรอ? 🎬',
    'วันหยุดชอบทำอะไรมากที่สุด?',
    'เพลงที่ฟังวนล่าสุดคือเพลงอะไร? 🎵',
    'ถ้ามีเวลาว่างเย็นนี้ อยากชวนไปทำอะไร?'
  ];
  res.json(greetings);
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'app.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/report', (req, res) => {
  res.sendFile(path.join(publicDir, 'report.html'));
});

app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.is_admin) return res.redirect('/admin');
    return res.redirect('/app');
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MatchSpace app running at http://localhost:${PORT}`);
});
