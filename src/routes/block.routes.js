const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');

// Block a user
router.post('/api/users/:id/block', requireAuth, async (req, res) => {
  try {
    const blockerId = req.session.user.id;
    const blockedId = Number(req.params.id);

    if (blockerId === blockedId) {
      return res.status(400).json({ message: 'คุณไม่สามารถบล็อกตัวเองได้' });
    }

    const targetUser = await db.get('SELECT id, name FROM users WHERE id = ?', [blockedId]);
    if (!targetUser) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้นี้' });
    }

    const existing = await db.get('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
    if (!existing) {
      await db.run('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [blockerId, blockedId]);
    }

    res.json({ message: `บล็อกผู้ใช้ ${targetUser.name} สำเร็จ`, blocked_id: blockedId });
  } catch (err) {
    console.error('[Block User Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการบล็อกผู้ใช้' });
  }
});

// Unblock a user
router.delete('/api/users/:id/unblock', requireAuth, async (req, res) => {
  try {
    const blockerId = req.session.user.id;
    const blockedId = Number(req.params.id);

    await db.run('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
    res.json({ message: 'ยกเลิกการบล็อกผู้ใช้สำเร็จ', unblocked_id: blockedId });
  } catch (err) {
    console.error('[Unblock User Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการยกเลิกบล็อก' });
  }
});

// Get blocked users list
router.get('/api/me/blocked', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const rows = await db.all(`
      SELECT b.id AS block_id, b.created_at AS blocked_at,
             u.id, u.name, u.nickname, u.profile_image, u.major, u.university
      FROM user_blocks b
      JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error('[Get Blocked Users Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้ที่บล็อก' });
  }
});

module.exports = router;
