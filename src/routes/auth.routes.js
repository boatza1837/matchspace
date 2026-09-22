const express = require('express');
const router = express.Router();
const { PRIVACY_VERSION, parseChoices, savePreferences, getPreferences } = require('../services/privacy');
const { verifyGoogleCredential } = require('../services/google-auth');
const { db } = require('../config/db');
const { formatUser } = require('../middlewares/auth');
const { multiUpload } = require('../middlewares/upload');
const { comparePassword, hashPassword, encryptPassword } = require('../config/security');
const { logLogin } = require('../services/logger');
const { processUploadedFile } = require('../services/cloudinary');
const { calculateAge, getZodiacSign } = require('../services/astrology');

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
  const privacy = await getPreferences(req.session.user.id);
  res.json({ user: { ...req.session.user, interested_gender: privacy.matching ? req.session.user.interested_gender : 'ทุกเพศ', matching_consent: privacy.matching } });
});

router.get('/api/public/users', async (req, res) => {
  const users = await db.all(`
    SELECT id, name, major
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

    const privacy = await getPreferences(user.id);
    const safeUser = formatUser({ ...user, interested_gender: privacy.matching ? user.interested_gender : 'ทุกเพศ', matching_consent: privacy.matching });
    const isAdmin = Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner');
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
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
    let payload;
    try {
      payload = await verifyGoogleCredential(req.body?.credential);
    } catch (err) {
      return res.status(401).json({ message: 'ยืนยันบัญชี Google ไม่สำเร็จ กรุณาลองอีกครั้งหรือเข้าสู่ระบบด้วยรหัสผ่าน' });
    }
    const googleEmail = payload.email;
    const googleName = payload.name || payload.email.split('@')[0];
    const googlePicture = payload.picture || '';

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

    const privacy = await getPreferences(user.id);
    const safeUser = formatUser({ ...user, interested_gender: privacy.matching ? user.interested_gender : 'ทุกเพศ', matching_consent: privacy.matching });
    const isAdmin = Boolean(user.is_admin || user.role === 'admin' || user.role === 'owner');
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
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

router.post('/api/register', multiUpload, async (req, res, next) => {
  try {
  if (req.body?.privacy_version !== PRIVACY_VERSION || req.body?.privacy_acknowledged !== 'true') {
    const fs = require('fs/promises');
    await Promise.all(Object.values(req.files || {}).flat().map(file => fs.unlink(file.path).catch(() => {})));
    return res.status(400).json({ message: 'โปรดอ่านและรับทราบประกาศความเป็นส่วนตัวฉบับปัจจุบันก่อนสมัครสมาชิก' });
  }
  const privacyChoices = parseChoices({ ...req.body, email: req.body.email_consent });
  if (!privacyChoices.matching) req.body.interested_gender = 'ทุกเพศ';
  const { name, email, password, gender, interested_gender, birthdate, university, major, year, interests, bio, nickname, age, phone, google_profile_image } = req.body || {};

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
    profileImage = await processUploadedFile(req.files.profile_image_file[0]);
  } else if (google_profile_image) {
    profileImage = String(google_profile_image).trim();
  }

  const passwordHash = hashPassword(String(password));
  const encPassword = encryptPassword(String(password).trim());

  let calculatedAge = age ? Number(age) : null;
  let zodiacName = '';
  if (birthdate) {
    const ageFromBirth = calculateAge(birthdate);
    if (ageFromBirth !== null) calculatedAge = ageFromBirth;
    const z = getZodiacSign(birthdate);
    if (z) zodiacName = z.name;
  }

  const result = await db.run(`
    INSERT INTO users (name, email, password, encrypted_password, gender, interested_gender, birthdate, zodiac, university, major, year, interests, bio, nickname, age, phone, profile_image, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    String(name).trim(),
    normalizedEmail,
    passwordHash,
    encPassword,
    gender || 'ไม่ระบุ',
    interested_gender || 'ทุกเพศ',
    birthdate || null,
    zodiacName || null,
    university || 'มหาวิทยาลัยขอนแก่น',
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    calculatedAge,
    cleanedPhone,
    profileImage
  ]);

  const userId = Number(result.lastInsertRowid);
  await savePreferences(userId, privacyChoices, 'registration');

  if (profileImage) {
    await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, profileImage]);
  }

  if (req.files && req.files.photos) {
    for (const f of req.files.photos) {
      const url = await processUploadedFile(f);
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
    }
  }

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  const privacy = await getPreferences(user.id);
    const safeUser = formatUser({ ...user, interested_gender: privacy.matching ? user.interested_gender : 'ทุกเพศ', matching_consent: privacy.matching });
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.user = safeUser;
  req.session.save(err => err ? next(err) : res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: safeUser }));
  } catch (err) { next(err); }
});

module.exports = router;
