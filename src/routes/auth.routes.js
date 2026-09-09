const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { formatUser } = require('../middlewares/auth');
const { multiUpload } = require('../middlewares/upload');
const { comparePassword, hashPassword, encryptPassword } = require('../config/security');
const { logLogin } = require('../services/logger');

router.get('/api/session', async (req, res) => {
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

router.get('/api/public/users', async (req, res) => {
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

router.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (!user) {
      await logLogin(req, email, null, 'failed', 'Email Login', 'ไม่พบผู้ใช้ในระบบ');
      return res.status(401).json({ message: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }

    const valid = comparePassword(String(password), user.password);
    if (!valid) {
      await logLogin(req, email, user.id, 'failed', 'Email Login', 'รหัสผ่านไม่ถูกต้อง');
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    if (user.is_active === 0) {
      await logLogin(req, email, user.id, 'failed', 'Email Login', 'บัญชีถูกแบน/ระงับการใช้งาน');
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล' });
    }

    const safeUser = formatUser(user);
    const isAdmin = Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner');
    req.session.user = { ...safeUser, is_admin: isAdmin };

    const actionName = isAdmin ? 'Admin Login' : 'Email Login';
    const detailText = isAdmin ? 'เข้าสู่ระบบผู้ดูแลระบบ' : 'เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน';
    await logLogin(req, email, user.id, 'success', actionName, detailText);

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

router.post('/api/auth/google', async (req, res) => {
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
      await logLogin(req, normalizedEmail, user.id, 'failed', 'Google OAuth', 'บัญชีถูกระงับการใช้งาน');
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล', banned: true });
    }

    const safeUser = formatUser(user);
    const isAdmin = Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner');
    req.session.user = { ...safeUser, is_admin: isAdmin };

    await logLogin(req, normalizedEmail, user.id, 'success', 'Google OAuth', 'เข้าสู่ระบบด้วย Google');

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

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'ออกจากระบบแล้ว' });
  });
});

router.post('/api/register', multiUpload, async (req, res) => {
  const { name, email, password, gender, interested_gender, university, major, year, interests, bio, nickname, age, phone, google_profile_image } = req.body || {};

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อ อีเมล รหัสผ่าน และเบอร์โทรศัพท์' });
  }

  const cleanedPhone = String(phone).trim().replace(/[-\s]/g, '');
  if (!cleanedPhone || cleanedPhone.length < 9 || cleanedPhone.length > 10) {
    return res.status(400).json({ message: 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลักให้ถูกต้อง' });
  }

  const existingPhone = await db.get('SELECT id FROM users WHERE phone = ?', [cleanedPhone]);
  if (existingPhone) {
    return res.status(409).json({ message: 'เบอร์โทรศัพท์นี้มีผู้ใช้งานในระบบแล้ว' });
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

  const passwordHash = hashPassword(String(password));
  const encPassword = encryptPassword(String(password).trim());

  const result = await db.run(`
    INSERT INTO users (name, email, password, encrypted_password, gender, interested_gender, university, major, year, interests, bio, nickname, age, phone, profile_image, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    String(name).trim(),
    normalizedEmail,
    passwordHash,
    encPassword,
    gender || 'ไม่ระบุ',
    interested_gender || 'ทุกเพศ',
    university || 'มหาวิทยาลัยขอนแก่น',
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    cleanedPhone,
    profileImage
  ]);

  const userId = result.lastInsertRowid;

  if (profileImage) {
    await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, profileImage]);
  }

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

module.exports = router;
