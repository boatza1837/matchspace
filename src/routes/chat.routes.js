const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { broadcastToChat, sendToUser } = require('../services/websocket');

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

router.get('/api/chats', requireAuth, async (req, res) => {
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

router.post('/api/chats', requireAuth, async (req, res) => {
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

router.get('/api/chats/:id/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isOwner = req.session.user.role === 'owner';
    const chatId = Number(req.params.id);

    const chat = await db.get(`
      SELECT c.*, a.name AS activity_name, a.created_by AS creator_id, u_creator.name AS creator_name,
             u1.name AS u1_name, u1.profile_image AS u1_profile_image,
             u2.name AS u2_name, u2.profile_image AS u2_profile_image
      FROM chats c
      LEFT JOIN users u1 ON u1.id = c.user_a
      LEFT JOIN users u2 ON u2.id = c.user_b
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

    let partnerId = null;
    if (chat.type !== 'group' && !chat.activity_id) {
      const isA = Number(chat.user_a) === Number(userId);
      partnerId = isA ? chat.user_b : chat.user_a;
      chat.partner_id = partnerId;
      chat.partner_name = isA ? chat.u2_name : chat.u1_name;
      chat.partner_profile_image = isA ? chat.u2_profile_image : chat.u1_profile_image;

      const block = await db.get(`
        SELECT * FROM user_blocks 
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `, [userId, partnerId, partnerId, userId]);

      if (block) {
        chat.is_blocked = true;
        chat.blocked_by_me = Number(block.blocker_id) === Number(userId);
      }
    }

    // Auto mark incoming unread messages as read
    const now = new Date().toISOString();
    await db.run(`
      UPDATE chat_messages 
      SET is_read = 1, read_at = ? 
      WHERE chat_id = ? AND sender_id != ? AND (is_read = 0 OR is_read IS NULL)
    `, [now, chatId, userId]);

    // Broadcast messages_read event over WebSocket
    broadcastToChat(chatId, {
      type: 'messages_read',
      chatId,
      readerId: userId,
      readAt: now
    });

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

router.post('/api/chats/:id/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const chatId = Number(req.params.id);
    const now = new Date().toISOString();

    await db.run(`
      UPDATE chat_messages 
      SET is_read = 1, read_at = ? 
      WHERE chat_id = ? AND sender_id != ? AND (is_read = 0 OR is_read IS NULL)
    `, [now, chatId, userId]);

    broadcastToChat(chatId, {
      type: 'messages_read',
      chatId,
      readerId: userId,
      readAt: now
    });

    res.json({ success: true, read_at: now });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/api/chats/:id/messages', requireAuth, async (req, res) => {
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

    // Check if blocked in direct chat
    if (chat.type !== 'group' && !chat.activity_id) {
      const recipientId = Number(chat.user_a) === Number(userId) ? chat.user_b : chat.user_a;
      const block = await db.get(`
        SELECT * FROM user_blocks 
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `, [userId, recipientId, recipientId, userId]);

      if (block) {
        return res.status(403).json({ message: 'ไม่สามารถส่งข้อความได้เนื่องจากมีการบล็อกผู้ใช้งาน' });
      }
    }

    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
    }

    const result = await db.run('INSERT INTO chat_messages (chat_id, sender_id, content) VALUES (?, ?, ?)', [
      chatId, userId, String(content).trim()
    ]);

    const message = await db.get(`
      SELECT m.*, u.name AS sender_name, u.profile_image AS sender_profile_image, u.role AS sender_role
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `, [result.lastInsertRowid]);

    // Real-Time WebSocket broadcast to participants
    broadcastToChat(chatId, {
      type: 'new_message',
      chatId,
      message
    });

    // Notify partner directly if direct chat
    if (chat.type !== 'group' && !chat.activity_id) {
      const recipientId = Number(chat.user_a) === Number(userId) ? chat.user_b : chat.user_a;
      sendToUser(recipientId, {
        type: 'chat_notification',
        chatId,
        senderName: req.session.user.name,
        messageSnippet: String(content).trim().slice(0, 50)
      });

      // Web Push Notification to recipient
      try {
        const { sendPushNotification } = require('../services/notification');
        sendPushNotification(recipientId, {
          title: `💬 ข้อความใหม่จาก ${req.session.user.name}`,
          body: String(content).trim().slice(0, 80),
          url: '/app'
        });
      } catch (e) {}

      // Email Notification to recipient (anti-spam throttled to 1 email per 5 mins per chat)
      try {
        const { sendChatMessageEmailNotification } = require('../services/email');
        db.get('SELECT id, name, email, student_email FROM users WHERE id = ?', [Number(recipientId)])
          .then((recipientUser) => {
            if (recipientUser) {
              sendChatMessageEmailNotification(recipientUser, req.session.user, String(content).trim(), chatId);
            }
          })
          .catch((err) => console.warn('[Chat Email Error]', err.message));
      } catch (e) {}
    }

    res.status(201).json({ message: 'ส่งข้อความสำเร็จ', message });
  } catch (err) {
    console.error('[Send Message Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งข้อความ' });
  }
});

router.delete('/api/chats/:chatId/messages/:messageId', requireAuth, async (req, res) => {
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

    // Broadcast deletion via WebSocket
    broadcastToChat(chatId, {
      type: 'delete_message',
      chatId,
      messageId
    });

    res.json({ message: 'ลบข้อความสำเร็จ' });
  } catch (err) {
    console.error('[Delete Message Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบข้อความ' });
  }
});

router.get('/api/greetings', requireAuth, (req, res) => {
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

module.exports = {
  router,
  getOrCreateActivityChat,
  dissolveActivityGroup
};
