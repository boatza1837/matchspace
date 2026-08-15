const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

// === Persistent Storage (Railway Volume) ===
// Automatically detects Railway Volume mounted at /data or uses process.env.DATA_DIR
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

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

async function sendMatchEmail(toEmail, toName, matchedName) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email Skip] SMTP not configured. Would notify ${toEmail} about match with ${matchedName}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"MatchSpace" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `🎉 คุณกับ ${matchedName} แมตช์กันแล้ว!`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#4a4496;">💕 แมตช์สำเร็จ!</h2>
          <p>สวัสดี <strong>${toName}</strong>,</p>
          <p>คุณกับ <strong>${matchedName}</strong> สนใจกันทั้งคู่! ระบบได้สร้างห้องแชทให้แล้ว</p>
          <p>เข้าไปเริ่มบทสนทนาได้เลยที่ MatchSpace 🚀</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p style="color:#999;font-size:12px;">MatchSpace — หาคนที่ใช่ สำหรับการเริ่มต้นใหม่</p>
        </div>
      `
    });
    console.log(`[Email Sent] Match notification to ${toEmail}`);
  } catch (err) {
    console.error(`[Email Error] Failed to send to ${toEmail}:`, err.message);
  }
}
const db = new DatabaseSync(dbPath);

function formatUser(row) {
  if (!row) return null;
  const { password, ...safeUser } = row;
  return { ...safeUser, is_admin: Boolean(safeUser.is_admin) };
}

function requireAuth(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  const dbUser = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.user.id);
  if (!dbUser || dbUser.is_active === 0) {
    req.session.destroy(() => {
      if (isHtmlReq) return res.redirect('/');
      res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล', banned: true });
    });
    return;
  }
  next();
}

function requireAdmin(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user || !req.session.user.is_admin) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(403).json({ message: 'ต้องเป็นผู้ดูแลระบบ' });
  }
  next();
}

function initDatabase() {
  db.exec(`
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
  `);

  const userCols = db.prepare("PRAGMA table_info(users)").all();
  const hasAdminFlag = userCols.some(col => col.name === 'is_admin');
  if (!hasAdminFlag) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  }
  
  const hasActiveFlag = userCols.some(col => col.name === 'is_active');
  if (!hasActiveFlag) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
  }

  const hasNickname = userCols.some(col => col.name === 'nickname');
  if (!hasNickname) {
    db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
  }

  const hasAge = userCols.some(col => col.name === 'age');
  if (!hasAge) {
    db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
  }

  const hasProfileImage = userCols.some(col => col.name === 'profile_image');
  if (!hasProfileImage) {
    db.exec('ALTER TABLE users ADD COLUMN profile_image TEXT');
  }

  const hasPhone = userCols.some(col => col.name === 'phone');
  if (!hasPhone) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  const activityCols = db.prepare("PRAGMA table_info(activities)").all();
  const hasLocation = activityCols.some(col => col.name === 'location');
  if (!hasLocation) {
    db.exec('ALTER TABLE activities ADD COLUMN location TEXT');
  }

  const reportCols = db.prepare("PRAGMA table_info(reports)").all();
  const hasEvidence = reportCols.some(col => col.name === 'evidence_file');
  if (!hasEvidence) {
    db.exec('ALTER TABLE reports ADD COLUMN evidence_file TEXT');
  }

  const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@matchspace.com');
  if (!adminUser) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, major, year, interests, bio, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'Admin MatchSpace',
      'admin@matchspace.com',
      adminPassword,
      'Administration',
      'Admin',
      'System, Review, Safety',
      'Default administrator account'
    );
  } else if (!adminUser.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run('admin@matchspace.com');
  }

  const demoUser = db.prepare('SELECT * FROM users WHERE email = ?').get('demo@student.com');
  if (!demoUser) {
    const demoPassword = bcrypt.hashSync('demo123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, major, year, interests, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Demo User',
      'demo@student.com',
      demoPassword,
      'Computer Science',
      'ปี 2',
      'หนัง, คาเฟ่, ดนตรี',
      'ชอบทำกิจกรรมชิล ๆ และคุยเรื่องหนังและสไตล์ชีวิต'
    );
  }

  const reportCount = db.prepare('SELECT COUNT(*) AS total FROM reports').get().total;
  if (reportCount === 0) {
    db.prepare(`
      INSERT INTO reports (reporter_name, reporter_email, reported_user, report_type, description, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      'Demo User',
      'demo@student.com',
      'แอนนา',
      'spam',
      'มีข้อความส่งซ้ำ ๆ และก่อความรำคาญในแชท'
    );
  }
}

initDatabase();

app.use(session({
  secret: 'matchspace-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
// Serve uploads from volume (works whether DATA_DIR is set or not)
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

app.get('/api/session', (req, res) => {
  if (!req.session?.user) {
    return res.json({ user: null });
  }
  const dbUser = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.user.id);
  if (!dbUser || dbUser.is_active === 0) {
    req.session.destroy(() => {
      res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน', user: null, banned: true });
    });
    return;
  }
  res.json({ user: req.session.user });
});

app.get('/api/public/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, major
    FROM users
    WHERE is_active != 0 AND is_admin = 0
    ORDER BY name ASC
  `).all();
  res.json(users);
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'ไม่พบผู้ใช้นี้' });
  }

  const valid = bcrypt.compareSync(String(password), user.password);
  if (!valid) {
    return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
  }

  if (user.is_active === 0) {
    return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล' });
  }

  const safeUser = formatUser(user);
  req.session.user = { ...safeUser, is_admin: Boolean(user.is_admin) };
  res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: req.session.user });
});

app.post('/api/auth/google', (req, res) => {
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
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    // If not registered yet, send is_registered: false and redirect to register page with prefilled parameters
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
  req.session.user = { ...safeUser, is_admin: Boolean(user.is_admin) };

  res.json({
    is_registered: true,
    message: 'เข้าสู่ระบบด้วย Google สำเร็จ',
    user: req.session.user,
    redirect: user.is_admin ? '/admin' : '/app'
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'ออกจากระบบแล้ว' });
  });
});

app.post('/api/register', upload.single('profile_image_file'), (req, res) => {
  const { name, email, password, major, year, interests, bio, nickname, age, phone } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อ อีเมล และรหัสผ่าน' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ message: 'อีเมลนี้มีผู้ใช้งานแล้ว' });
  }

  const profileImage = req.file ? `/uploads/${req.file.filename}` : '';
  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password, major, year, interests, bio, nickname, age, phone, profile_image, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    String(name).trim(),
    normalizedEmail,
    passwordHash,
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    phone || '',
    profileImage
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const safeUser = formatUser(user);
  req.session.user = safeUser;
  res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: safeUser });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'MatchSpace API is running' });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.json({ user: formatUser(user) });
});

app.put('/api/me', requireAuth, upload.single('profile_image_file'), (req, res) => {
  const { name, major, year, interests, bio, nickname, age } = req.body || {};
  const userId = req.session.user.id;

  let profileImage = req.session.user.profile_image || '';
  if (req.file) {
    profileImage = `/uploads/${req.file.filename}`;
  }

  db.prepare(`
    UPDATE users
    SET name = ?, major = ?, year = ?, interests = ?, bio = ?, nickname = ?, age = ?, profile_image = ?
    WHERE id = ?
  `).run(
    String(name || req.session.user.name).trim(),
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    profileImage,
    userId
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  req.session.user = formatUser(user);
  res.json({ message: 'อัปเดตโปรไฟล์สำเร็จ', user: req.session.user });
});

app.get('/api/candidates', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, major, year, interests, bio, nickname, age, profile_image, is_active, created_at
    FROM users
    WHERE id != ? AND is_active != 0
      AND id NOT IN (SELECT matched_user_id FROM matches WHERE user_id = ?)
    ORDER BY created_at DESC
  `).all(req.session.user.id, req.session.user.id);
  res.json(rows);
});

app.get('/api/matches', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, u.name AS matched_name, u.major, u.interests
    FROM matches m
    JOIN users u ON u.id = m.matched_user_id
    WHERE m.user_id = ?
    ORDER BY m.created_at DESC
  `).all(req.session.user.id);
  res.json(rows);
});

app.post('/api/matches', requireAuth, async (req, res) => {
  const { matched_user_id, note, status } = req.body || {};
  const userId = req.session.user.id;

  if (!matched_user_id) {
    return res.status(400).json({ message: 'กรุณาเลือกผู้ใช้งานที่ต้องการแมตช์' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(matched_user_id));
  if (!target) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  const existing = db.prepare('SELECT * FROM matches WHERE user_id = ? AND matched_user_id = ?').get(userId, Number(matched_user_id));
  if (existing) {
    db.prepare(`
      UPDATE matches SET status = ?, note = ? WHERE id = ?
    `).run(status || existing.status || 'pending', note || existing.note || '', existing.id);

    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(existing.id);
    return res.json({ message: 'อัปเดต match แล้ว', match: updated });
  }

  const result = db.prepare(`
    INSERT INTO matches (user_id, matched_user_id, status, note)
    VALUES (?, ?, ?, ?)
  `).run(userId, Number(matched_user_id), status || 'pending', note || '');

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(result.lastInsertRowid);

  // Check for mutual match
  let mutualMatch = false;
  if (status === 'liked') {
    const reverse = db.prepare(
      'SELECT * FROM matches WHERE user_id = ? AND matched_user_id = ? AND status = ?'
    ).get(Number(matched_user_id), userId, 'liked');

    if (reverse) {
      mutualMatch = true;
      // Update both to 'matched'
      db.prepare('UPDATE matches SET status = ? WHERE id = ?').run('matched', match.id);
      db.prepare('UPDATE matches SET status = ? WHERE id = ?').run('matched', reverse.id);

      // Create chat if not exists
      const existingChat = db.prepare(`
        SELECT * FROM chats
        WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
      `).get(userId, Number(matched_user_id), Number(matched_user_id), userId);

      if (!existingChat) {
        db.prepare(`
          INSERT INTO chats (user_a, user_b, title)
          VALUES (?, ?, ?)
        `).run(userId, Number(matched_user_id), 'แมตช์สำเร็จ!');
      }

      // Send emails to both users
      const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      sendMatchEmail(target.email, target.name, currentUser.name);
      sendMatchEmail(currentUser.email, currentUser.name, target.name);
    }
  }

  const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  res.status(201).json({
    message: mutualMatch ? '🎉 แมตช์สำเร็จ! ระบบสร้างแชทให้แล้ว' : 'เพิ่ม match สำเร็จ',
    match: updatedMatch,
    mutual: mutualMatch
  });
});

app.get('/api/chats', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const rows = db.prepare(`
    SELECT c.id, c.user_a, c.user_b, c.title, c.created_at,
           CASE WHEN c.user_a = ? THEN u2.name ELSE u1.name END AS partner_name,
           (SELECT content FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
    FROM chats c
    JOIN users u1 ON u1.id = c.user_a
    JOIN users u2 ON u2.id = c.user_b
    WHERE c.user_a = ? OR c.user_b = ?
    ORDER BY c.created_at DESC
  `).all(userId, userId, userId);

  res.json(rows);
});

app.post('/api/chats', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const { user_id } = req.body || {};

  if (!user_id) {
    return res.status(400).json({ message: 'กรุณาเลือกผู้ใช้งานก่อนเริ่มแชท' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(user_id));
  if (!target) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  const existing = db.prepare(`
    SELECT * FROM chats
    WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
  `).get(userId, Number(user_id), Number(user_id), userId);

  if (existing) {
    return res.json({ message: 'มีแชทนี้อยู่แล้ว', chat: existing });
  }

  const result = db.prepare(`
    INSERT INTO chats (user_a, user_b, title)
    VALUES (?, ?, ?)
  `).run(userId, Number(user_id), 'Chat');

  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'สร้างแชทสำเร็จ', chat });
});

app.get('/api/chats/:id/messages', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(Number(req.params.id));

  if (!chat) {
    return res.status(404).json({ message: 'ไม่พบแชทนี้' });
  }

  if (chat.user_a !== userId && chat.user_b !== userId) {
    return res.status(403).json({ message: 'คุณไม่ได้มีสิทธิ์เข้าถึงแชทนี้' });
  }

  const messages = db.prepare(`
    SELECT m.*, u.name AS sender_name
    FROM chat_messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ?
    ORDER BY m.created_at ASC
  `).all(Number(req.params.id));

  res.json({ chat, messages });
});

app.post('/api/chats/:id/messages', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(Number(req.params.id));

  if (!chat) {
    return res.status(404).json({ message: 'ไม่พบแชทนี้' });
  }

  if (chat.user_a !== userId && chat.user_b !== userId) {
    return res.status(403).json({ message: 'คุณไม่ได้มีสิทธิ์ส่งข้อความในแชทนี้' });
  }

  const { content } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  }

  const result = db.prepare(`
    INSERT INTO chat_messages (chat_id, sender_id, content)
    VALUES (?, ?, ?)
  `).run(Number(req.params.id), userId, String(content).trim());

  const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'ส่งข้อความสำเร็จ', message });
});

app.get('/api/users', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, major, year, interests, bio, is_admin, is_active, created_at
    FROM users
    ORDER BY id DESC
  `).all();
  res.json(rows);
});

app.post('/api/reports', upload.single('evidence_file'), (req, res) => {
  const { reporter_name, reporter_email, reported_user, report_type, description } = req.body || {};

  if (!reporter_name || !reporter_email || !reported_user || !report_type || !description) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลรายงานให้ครบถ้วน' });
  }

  const evidenceFilename = req.file ? `/uploads/${req.file.filename}` : null;

  const result = db.prepare(`
    INSERT INTO reports (reporter_name, reporter_email, reported_user, report_type, description, status, evidence_file)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    String(reporter_name).trim(),
    String(reporter_email).trim().toLowerCase(),
    String(reported_user).trim(),
    String(report_type).trim(),
    String(description).trim(),
    evidenceFilename
  );

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'ส่งรายงานสำเร็จ', report });
});

app.get('/api/reports', requireAdmin, (req, res) => {
  const rows = db.prepare(`
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
  `).all();
  res.json(rows);
});

app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM reports) AS total_reports,
      (SELECT COUNT(*) FROM reports WHERE status = 'pending') AS pending_reports,
      (SELECT COUNT(*) FROM reports WHERE status = 'resolved') AS resolved_reports
  `).get();

  res.json(counts);
});

app.get('/api/activities', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const rows = db.prepare(`
    SELECT a.*, u.name AS creator_name, u.major AS creator_major,
      (SELECT COUNT(*) FROM activity_members am WHERE am.activity_id = a.id) AS actual_members
    FROM activities a
    JOIN users u ON u.id = a.created_by
    WHERE a.status = 'approved'
    ORDER BY a.created_at DESC
  `).all();

  // Check which activities the current user has joined
  const joined = db.prepare('SELECT activity_id FROM activity_members WHERE user_id = ?').all(userId);
  const joinedSet = new Set(joined.map(j => j.activity_id));

  const result = rows.map(r => ({ ...r, has_joined: joinedSet.has(r.id) }));
  res.json(result);
});

app.post('/api/activities', requireAuth, (req, res) => {
  const { name, description, member_count, location } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อกิจกรรม' });
  }

  if (!location || !String(location).trim()) {
    return res.status(400).json({ message: 'กรุณากรอกสถานที่จัดกิจกรรม' });
  }

  const result = db.prepare(`
    INSERT INTO activities (name, description, location, created_by, creator_name, creator_major, member_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    String(name).trim(),
    description || '',
    String(location).trim(),
    user.id,
    user.name,
    user.major || '-',
    Number(member_count || 0),
  );

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'สร้างกิจกรรมเรียบร้อย รอการอนุมัติจากผู้ดูแล', activity });
});

app.get('/api/admin/activities', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name AS creator_name, u.major AS creator_major,
      (SELECT COUNT(*) FROM activity_members am WHERE am.activity_id = a.id) AS actual_members
    FROM activities a
    JOIN users u ON u.id = a.created_by
    ORDER BY a.created_at DESC
  `).all();
  res.json(rows);
});

app.patch('/api/admin/activities/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'สถานะการอนุมัติไม่ถูกต้อง' });
  }

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(Number(id));
  if (!activity) {
    return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
  }

  db.prepare('UPDATE activities SET status = ? WHERE id = ?').run(status, Number(id));
  res.json({ message: status === 'approved' ? 'อนุมัติกิจกรรมสำเร็จ' : 'ปฏิเสธกิจกรรมสำเร็จ' });
});

app.patch('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, admin_note } = req.body || {};
  const validStatus = ['pending', 'reviewed', 'resolved', 'rejected'];

  if (!validStatus.includes(status)) {
    return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
  }

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(id));
  if (!report) {
    return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
  }

  db.prepare(`
    UPDATE reports SET status = ?, admin_note = ? WHERE id = ?
  `).run(status, admin_note || '', Number(id));

  const updated = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(id));
  res.json({ message: 'อัปเดตรายงานสำเร็จ', report: updated });
});

app.post('/api/admin/reports/:id/warn', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { warning_message } = req.body || {};

  if (!warning_message || !String(warning_message).trim()) {
    return res.status(400).json({ message: 'กรุณากรอกข้อความตักเตือน' });
  }

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(id));
  if (!report) {
    return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
  }

  const targetUser = db.prepare(`
    SELECT * FROM users 
    WHERE CAST(id AS TEXT) = CAST(? AS TEXT) OR name = ? OR email = ?
  `).get(report.reported_user, report.reported_user, report.reported_user);

  if (!targetUser) {
    return res.status(404).json({ message: 'ไม่พบผู้ถูกรายงานในระบบ' });
  }

  const adminId = req.session.user.id;

  // Find or create chat between Admin and Target User
  let chat = db.prepare(`
    SELECT * FROM chats
    WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
  `).get(adminId, targetUser.id, targetUser.id, adminId);

  if (!chat) {
    const chatResult = db.prepare(`
      INSERT INTO chats (user_a, user_b, title)
      VALUES (?, ?, 'แจ้งเตือนจากผู้ดูแลระบบ')
    `).run(adminId, targetUser.id);
    chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatResult.lastInsertRowid);
  }

  const warnText = `⚠️ [คำเตือนจากผู้ดูแลระบบเนื่องจากได้รับการรายงาน (${report.report_type})]: ${warning_message.trim()}`;
  db.prepare(`
    INSERT INTO chat_messages (chat_id, sender_id, content)
    VALUES (?, ?, ?)
  `).run(chat.id, adminId, warnText);

  if (process.env.SMTP_USER && targetUser.email) {
    try {
      await transporter.sendMail({
        from: `"MatchSpace Admin" <${process.env.SMTP_USER}>`,
        to: targetUser.email,
        subject: `⚠️ คำเตือนจากผู้ดูแลระบบ MatchSpace`,
        text: warnText
      });
    } catch (e) {
      console.error('[Email Warning Error]', e.message);
    }
  }

  const noteEntry = `[ส่งเตือนผู้ใช้ (${targetUser.name})]: ${warning_message.trim()}`;
  const newNote = report.admin_note ? `${report.admin_note}\n${noteEntry}` : noteEntry;
  db.prepare(`
    UPDATE reports SET status = 'reviewed', admin_note = ? WHERE id = ?
  `).run(newNote, Number(id));

  res.json({ message: `ส่งข้อความเตือนไปยัง ${targetUser.name} เรียบร้อยแล้ว` });
});

app.patch('/api/users/:id/disable', requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  
  if (!user) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  if (user.is_admin) {
    return res.status(403).json({ message: 'ไม่สามารถปิดการใช้งานผู้ดูแลได้' });
  }

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(Number(id));
  res.json({ message: 'ปิดการใช้งานผู้ใช้งานสำเร็จ', user: { ...user, is_active: 0 } });
});

app.patch('/api/users/:id/enable', requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  
  if (!user) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(Number(id));
  res.json({ message: 'เปิดการใช้งานผู้ใช้งานสำเร็จ', user: { ...user, is_active: 1 } });
});

// --- Activity Join/Leave ---
app.post('/api/activities/:id/join', requireAuth, (req, res) => {
  const activityId = Number(req.params.id);
  const userId = req.session.user.id;

  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND status = ?').get(activityId, 'approved');
  if (!activity) {
    return res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
  }

  try {
    db.prepare('INSERT INTO activity_members (activity_id, user_id) VALUES (?, ?)').run(activityId, userId);
  } catch (e) {
    return res.status(409).json({ message: 'คุณเข้าร่วมกิจกรรมนี้แล้ว' });
  }

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM activity_members WHERE activity_id = ?').get(activityId).cnt;
  res.json({ message: 'เข้าร่วมกิจกรรมสำเร็จ', member_count: count });
});

app.delete('/api/activities/:id/join', requireAuth, (req, res) => {
  const activityId = Number(req.params.id);
  const userId = req.session.user.id;

  db.prepare('DELETE FROM activity_members WHERE activity_id = ? AND user_id = ?').run(activityId, userId);
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM activity_members WHERE activity_id = ?').get(activityId).cnt;
  res.json({ message: 'ยกเลิกเข้าร่วมกิจกรรมสำเร็จ', member_count: count });
});

// --- Greeting Suggestions API ---
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
