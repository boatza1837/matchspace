const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAdmin } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');
const { broadcastToChat, sendToUser } = require('../services/websocket');

router.post('/api/reports', upload.single('evidence_file'), async (req, res) => {
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

router.get('/api/reports', requireAdmin, async (req, res) => {
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

router.patch('/api/admin/reports/:id', requireAdmin, async (req, res) => {
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

router.post('/api/admin/reports/:id/warn', requireAdmin, async (req, res) => {
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
    const insertRes = await db.run('INSERT INTO chat_messages (chat_id, sender_id, content) VALUES (?, ?, ?)', [chat.id, adminId, warnText]);

    const createdMsg = await db.get('SELECT * FROM chat_messages WHERE id = ?', [insertRes.lastInsertRowid]);

    // Send real-time notification to warned user
    broadcastToChat(chat.id, {
      type: 'new_message',
      chatId: chat.id,
      message: createdMsg
    });
    sendToUser(targetUser.id, {
      type: 'warning_notification',
      title: '⚠️ คำเตือนจากผู้ดูแลระบบ',
      message: warning_message.trim(),
      chatId: chat.id
    });

    const noteEntry = `[ส่งเตือนผู้ใช้ (${targetUser.name})]: ${warning_message.trim()}`;
    const newNote = report.admin_note ? `${report.admin_note}\n${noteEntry}` : noteEntry;
    await db.run("UPDATE reports SET status = 'reviewed', admin_note = ? WHERE id = ?", [newNote, Number(id)]);

    res.json({ message: `ส่งข้อความเตือนไปยัง ${targetUser.name} เรียบร้อยแล้ว` });
  } catch (err) {
    console.error('[Warn User Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งคำเตือน' });
  }
});

module.exports = router;
