const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { getOrCreateActivityChat, dissolveActivityGroup } = require('./chat.routes');
const { broadcastGlobal, sendToUser } = require('../services/websocket');

router.get('/api/activities', requireAuth, async (req, res) => {
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

router.post('/api/activities', requireAuth, async (req, res) => {
  try {
    const { name, description, member_count, location, event_date, event_time } = req.body || {};
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
      INSERT INTO activities (name, description, location, event_date, event_time, created_by, creator_name, creator_major, member_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      String(name).trim(),
      description || '',
      String(location).trim(),
      event_date ? String(event_date).trim() : null,
      event_time ? String(event_time).trim() : null,
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

router.delete('/api/activities/:id', requireAuth, async (req, res) => {
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

router.post('/api/activities/:id/join', requireAuth, async (req, res) => {
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

router.delete('/api/activities/:id/join', requireAuth, async (req, res) => {
  const activityId = Number(req.params.id);
  const userId = req.session.user.id;

  await db.run('DELETE FROM activity_members WHERE activity_id = ? AND user_id = ?', [activityId, userId]);
  const countObj = await db.get('SELECT COUNT(*) AS cnt FROM activity_members WHERE activity_id = ?', [activityId]);
  res.json({ message: 'ยกเลิกเข้าร่วมกิจกรรมสำเร็จ', member_count: countObj ? countObj.cnt : 0 });
});

// Admin activity endpoints
router.get('/api/admin/activities', requireAdmin, async (req, res) => {
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

router.patch('/api/admin/activities/:id', requireAdmin, async (req, res) => {
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
    sendToUser(activity.created_by, {
      type: 'activity_approved',
      title: '🎉 กิจกรรมได้รับการอนุมัติแล้ว!',
      message: `กิจกรรม "${activity.name}" ได้รับการอนุมัติและแสดงบนบอร์ดแล้ว`,
      activityId: actId
    });
  } else if (status === 'rejected') {
    await dissolveActivityGroup(actId);
  }

  res.json({ message: status === 'approved' ? 'อนุมัติกิจกรรมและสร้างแชทกลุ่มสำเร็จ' : 'ปฏิเสธกิจกรรมและยุบแชทกลุ่มเรียบร้อย' });
});

router.delete('/api/admin/activities/:id', requireAdmin, async (req, res) => {
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

module.exports = router;
