const express = require('express');
const router = express.Router();
const os = require('os');
const { db, useTurso } = require('../config/db');
const { requireAdmin, requireOwner } = require('../middlewares/auth');
const { encryptPassword, decryptPassword, hashPassword } = require('../config/security');
const { logAudit } = require('../services/logger');

router.get('/api/admin/summary', requireAdmin, async (req, res) => {
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

router.get('/api/admin/system-stats', requireAdmin, async (req, res) => {
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

router.get('/api/admin/login-logs', requireAdmin, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    let sql = 'SELECT * FROM login_logs';
    let params = [];
    if (q) {
      sql += ' WHERE email LIKE ? OR ip LIKE ? OR device LIKE ? OR action LIKE ? OR details LIKE ?';
      const pattern = `%${q}%`;
      params = [pattern, pattern, pattern, pattern, pattern];
    }
    sql += ' ORDER BY id DESC LIMIT 100';

    const logs = await db.all(sql, params);
    res.json(logs);
  } catch (err) {
    console.error('[Get Login Logs Error]', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการเข้าใช้งาน' });
  }
});

router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id, name, email, phone, nickname, gender, interested_gender, university, age, major, year, interests, bio, profile_image, is_admin, role, is_active, created_at
      FROM users
      ORDER BY id DESC
    `);

    const allPhotos = await db.all('SELECT user_id, photo_url FROM user_photos ORDER BY id ASC');
    const photosMap = {};
    for (const p of allPhotos) {
      if (!photosMap[p.user_id]) photosMap[p.user_id] = [];
      photosMap[p.user_id].push(p.photo_url);
    }

    const result = rows.map(u => ({
      ...u,
      role: u.role || (u.is_admin ? 'admin' : 'user'),
      photos: (photosMap[u.id] && photosMap[u.id].length) ? photosMap[u.id] : (u.profile_image ? [u.profile_image] : [])
    }));

    res.json(result);
  } catch (err) {
    console.error('[Admin Users Error]', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, major, year, interests, bio, nickname, age, profile_image, is_admin, is_active, role, created_at
    FROM users
    ORDER BY id ASC
  `);
  res.json(users);
});

router.put('/api/admin/users/:id/role', requireOwner, async (req, res) => {
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

router.put('/api/admin/users/:id/password', requireOwner, async (req, res) => {
  const targetId = Number(req.params.id);
  const { new_password } = req.body || {};

  if (!new_password || String(new_password).trim().length < 4) {
    return res.status(400).json({ message: 'กรุณากรอกรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร' });
  }

  const plain = String(new_password).trim();
  const hash = hashPassword(plain);
  const enc = encryptPassword(plain);
  await db.run('UPDATE users SET password = ?, encrypted_password = ?, plain_password = NULL WHERE id = ?', [hash, enc, targetId]);

  res.json({ message: 'เปลี่ยนรหัสผ่านของผู้ใช้เรียบร้อยแล้ว' });
});

router.post('/api/admin/users/:id/reveal-password', requireOwner, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const user = await db.get('SELECT id, name, email, encrypted_password, plain_password FROM users WHERE id = ?', [targetId]);
    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
    }

    let password = null;
    if (user.encrypted_password) {
      password = decryptPassword(user.encrypted_password);
    } else if (user.plain_password) {
      password = user.plain_password;
      const enc = encryptPassword(password);
      await db.run('UPDATE users SET encrypted_password = ?, plain_password = NULL WHERE id = ?', [enc, targetId]);
    }

    if (!password) {
      return res.json({ password: null, message: 'ผู้ใช้นี้สมัครผ่าน Google หรือไม่ได้ตั้งรหัสผ่าน' });
    }

    await logAudit('WARN', `[Owner Password Reveal] Owner '${req.session.user.email}' revealed password of user '${user.email}' (ID: ${user.id})`);

    res.json({ password, message: 'ถอดรหัสสำเร็จ' });
  } catch (err) {
    console.error('[Reveal Password Error]', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการถอดรหัสผ่าน' });
  }
});

router.patch('/api/users/:id/disable', requireAdmin, async (req, res) => {
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

router.patch('/api/users/:id/enable', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await db.get('SELECT * FROM users WHERE id = ?', [Number(id)]);

  if (!user) {
    return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
  }

  await db.run('UPDATE users SET is_active = 1 WHERE id = ?', [Number(id)]);
  res.json({ message: 'เปิดการใช้งานผู้ใช้งานสำเร็จ', user: { ...user, is_active: 1 } });
});

module.exports = router;
