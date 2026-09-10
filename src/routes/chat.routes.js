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

// ===================== CONVERSATION STARTERS / ICEBREAKERS SYSTEM =====================
const PROMPTS_BY_INTEREST = {
  cafe: [
    'เห็นว่าชอบคาเฟ่เหมือนกัน ปกติชอบนั่งร้านไหนรอบ มข. / แถวกังสดาลมั้ย? ☕',
    'ชอบสั่งกาแฟหรือเครื่องดื่มแนวไหนมากที่สุด เมนูประจำคืออะไร? 🧋',
    'มีคาเฟ่บรรยากาศเงียบๆ ไว้นั่งอ่านหนังสือหรือทำงานแนะนำมั้ย? 📖',
    'ชอบโทนร้านแบบมินิมอล หรือแบบธรรมชาติร่มรื่นมากกว่ากัน? 🌿'
  ],
  game: [
    'เห็นว่าชอบเล่นเกมเหมือนกัน ปกติเล่นในคอม มือถือ หรือคอนโซลเหรอ? 🎮',
    'ช่วงนี้ติดเกมอะไรอยู่มั้ย เผื่อเล่นเหมือนกันจะได้ชวนมาตี้! 🕹️',
    'มีบอร์ดเกมโปรดที่เล่นบ่อยๆ มั้ย ชอบแนววางแผนหรือแนวปาร์ตี้ฮาๆ? 🎲',
    'ถ้าว่างตรงกัน ชวนเล่นเกมสักตาสองตาได้มั้ยนะ? 👾'
  ],
  music: [
    'เห็นว่าชอบฟังเพลงเหมือนกัน ช่วงนี้เพลงที่ฟังวนบ่อยสุดคือเพลงอะไร? 🎵',
    'ชอบฟังเพลงแนวไหน มีศิลปินคนโปรดที่อยากป้ายยาให้ฟังตามมั้ย? 🎧',
    'ชอบฟังเพลงแบบใส่หูฟังคนเดียว หรือชอบไปฟังดนตรีสด/คอนเสิร์ต? 🎤',
    'มีเพลย์ลิสต์เพลงโปรดเวลาทำงานหรืออ่านหนังสือแนะนำมั้ย? 🎶'
  ],
  movie: [
    'เห็นว่าชอบดูหนังเหมือนกัน ช่วงนี้มีซีรีส์อะไรบน Netflix หรือสตรีมมิ่งแนะนำมั้ย? 🍿',
    'ถ้าให้แนะนำหนังหรืออนิเมะ 1 เรื่องที่ต้องดูในชีวิต จะแนะนำเรื่องอะไร? 🎬',
    'ชอบดูแนวระทึกขวัญ ไซไฟ สืบสวน ฟีลกู๊ด หรือคอมเมดี้มากกว่ากัน? 🎞️',
    'มีซีรีส์เรื่องไหนที่ดูแล้วติดจนไม่ได้นอนข้ามคืนมั้ย? 🌙'
  ],
  pet: [
    'เห็นว่าชอบสัตว์เหมือนกัน เป็นทาสแมวหรือทาสหมามากกว่ากันเนี่ย? 🐱🐶',
    'มีน้องเป็นของตัวเองมั้ย หรือชอบดูคลิปน้องในเน็ต? 🐾',
    'เคยไปคาเฟ่สัตว์เลี้ยงแถวมอมั้ย มีร้านไหนที่น้องน่ารักเป็นมิตรแนะนำมั้ย? 🤍'
  ],
  sports: [
    'เห็นว่าชอบออกกำลังกายเหมือนกัน ปกติไปออกกำลังกายที่ไหนเหรอ? 🏃‍♂️🏋️',
    'หาเพื่อนตีแบด/วิ่งรอบบึงสีฐานอยู่พอดีเลย ไว้ถ้าว่างชวนกันได้นะ! 🏸',
    'ชอบออกกำลังกายตอนเช้าหรือตอนเย็นมากกว่ากัน? ⏰',
    'สัปดาห์นึงออกกำลังกายกี่วัน มีทริคให้มีวินัยยังไงบ้าง? 💪'
  ],
  art: [
    'ชอบถ่ายรูปเหมือนกัน ใช้กล้องรุ่นไหนหรือเน้นใช้มือถือหามุมสวยๆ? 📸',
    'รอบ มข. หรือในขอนแก่น มีมุมถ่ายรูปสวยๆ แสงดีๆ ที่ชอบไปมั้ย? 🎨',
    'ชอบแต่งรูปสไตล์ไหน โทนฟิล์ม มินิมอล หรือสดใส? 🎞️'
  ],
  food: [
    'ชอบทำอาหาร/ขนมเหมือนกัน เมนูที่ทำบ่อยที่สุดหรือมั่นใจสุดคืออะไร? 🍳',
    'รอบ ม. มีร้านของกินเด็ดๆ หรือร้านลับที่ชอบไปกินมั้ย? 🍜',
    'สายชาบู หมูกระทะ หรือของหวานแก้ง่วงมากกว่ากัน? 🥓🍨'
  ],
  study: [
    'ชอบอ่านหนังสือเหมือนกัน ช่วงนี้กำลังอ่านเล่มไหนอยู่เหรอ? 📚',
    'ชอบอ่านแนวนิยาย พัฒนาตัวเอง หรือแนววิทยาศาสตร์/สารคดี? 📖',
    'ปกติชอบอ่านที่หอสมุด คอนโด หรือไปอ่านที่คาเฟ่? ✏️'
  ],
  travel: [
    'ชอบเที่ยวเหมือนกัน ทริปที่ประทับใจที่สุดที่เคยไปคือที่ไหน? ✈️',
    'ถ้าให้เลือกระหว่างไปพักผ่อนริมทะเลชิลๆ กับขึ้นดอยรับลมหนาว ชอบแบบไหน? 🏕️',
    'มีที่เที่ยวในไทยที่อยากไปแต่ยังไม่เคยไปมั้ย? 🌿'
  ],
  tech: [
    'สายเทคเหมือนกันเลย สนใจด้านไหนเป็นพิเศษเหรอ AI, เว็บ หรืออุปกรณ์ไอที? 💻',
    'เวลาติดบั๊กหรือเขียนโค้ดไม่ออก มีวิธีฮีลใจหรือแก้เบิร์นเอาท์ยังไงบ้าง? ⌨️'
  ]
};

const CATEGORIZED_PROMPTS = {
  campus: [
    'เรียนคณะอะไรเหรอ เทอมนี้ตารางเรียนหนักมั้ย? 🎓',
    'เวลาก่อนสอบ มีเคล็ดลับอ่านหนังสือหรือพึ่งสิ่งศักดิ์สิทธิ์อะไรบ้างมั้ย? 😆',
    'ชอบลงเรียนเซคเช้าหรือเซคบ่ายมากกว่ากัน? ⏰',
    'มีวิชาไหนในมอที่รู้สึกว่าเรียนแล้วสนุกหรือประทับใจอาจารย์บ้างมั้ย? 📝',
    'ปกติชอบไปอ่านหนังสือที่หอสมุดกลางหรือชอบอ่านที่ห้องคนเดียว? 🏛️',
    'เทอมนี้มีโปรเจกต์กลุ่มหรือฝึกงานมั้ย งานเยอะหรือเปล่า? 💼',
    'เคยไปวิ่งหรือเดินรับลมชิลๆ ที่บึงสีฐานตอนพระอาทิตย์ตกมั้ย บรรยากาศดีมากเลยนะ 🌅',
    'ชอบไปนั่งกินข้าวหรืออ่านหนังสือที่คอมเพล็กซ์ หรือศูนย์อาหารคณะไหนที่สุด? 🍛',
    'เวลารถติดแถวประตูกังสดาลช่วงเย็น มีวิธีแก้เบื่อยังไงบ้าง? 🛵'
  ],
  food: [
    'แถว มข. มีร้านอาหารตามสั่งหรือร้านของกินดึกๆ ร้านโปรดร้านไหนบ้าง? 🍛',
    'ชอบเครื่องดื่มหวานน้อย หรือหวานปกติ แล้วชอบชาเขียวหรือกาแฟมากกว่า? 🍵',
    'ถ้ามีเวลาว่างช่วงเย็น ชอบไปเดินเล่นตลาดมอดินแดง หรือตลาดเปิดท้าย? 🛍️',
    'ร้านหมูกระทะหรือชาบูในดวงใจรอบ ม. คือร้านไหน? 🥓',
    'ของหวานแก้ง่วงหลังเลิกเรียน ชอบกินอะไรที่สุด? 🍧',
    'ร้านอาหารแถวกังสดาลหรือหลัง ม. มีร้านไหนที่ไปกินซ้ำเกิน 10 ครั้งมั้ย? 🍜',
    'ถ้าให้เลือกของหวานรอบดึก 1 อย่าง ระหว่างบิงซู, ปังปิ้งนมสด, หรือโรตี จะเลือกอะไร? 🧇',
    'สายกินเผ็ดมั้ย เวลาสั่งส้มตำหรือกะเพราใส่พริกกี่เม็ด? 🌶️'
  ],
  hobbies: [
    'วันหยุดชอบทำอะไรมากที่สุด มีงานอดิเรกที่ชอบทำคนเดียวมั้ย? 🎨',
    'ชอบออกไปเที่ยวข้างนอกหรือชอบนอนพักผ่อนอยู่ห้องมากกว่า? 🛋️',
    'มีเกมหรือกิจกรรมอะไรที่อยากลองทำแต่ยังไม่เคยได้ลองมั้ย? 🎯',
    'ถ้ามีเวลาว่างเย็นนี้ อยากชวนไปทำอะไร? 🌇',
    'ชอบไปตีแบดที่ยิม หรือชอบเตะบอล/ว่ายน้ำมากกว่ากัน? 🏸',
    'มีงานอดิเรกอะไรที่คนอื่นอาจจะไม่ค่อยรู้ว่าเราชอบทำมั้ย? ✨',
    'ชอบปลูกต้นไม้ จัดโต๊ะคอม หรือแต่งห้องมั้ย? 🪴'
  ],
  entertainment: [
    'ถ้าให้เลือกซีรีส์ 1 เรื่องที่อยากลบความจำแล้วดูใหม่อีกรอบ จะเลือกเรื่องอะไร? 🍿',
    'ฟังเพลงแนวไหนเวลาเดินทาง หรือเวลาทำงานเหรอ? 🎶',
    'มีช่อง YouTube หรือพอดแคสต์โปรดที่เปิดฟังบ่อยๆ มั้ย? 📺',
    'คอนเสิร์ตล่าสุดที่ไปดูมาคือคอนเสิร์ตของใคร? 🎸',
    'เพลงที่ฟังวนซ้ำมากที่สุดในสัปดาห์นี้คือเพลงอะไร? 🎵',
    'ชอบดูหนังในโรงหนัง หรือนอนดูที่ห้องบนเตียงสบายๆ? 🎬',
    'ถ้าให้เลือกเพลงที่เป็น Soundtrack ประจำชีวิตช่วงนี้ จะเป็นเพลงอะไร? 📻'
  ],
  pets: [
    'เป็นทาสแมว ทาสหมา หรือชอบสัตว์ชนิดอื่นมากกว่า? 🐱🐶',
    'ชอบสัตว์เลี้ยงแนวขี้อ้อน หรือแนวอินดี้โลกส่วนตัวสูง? 🐾',
    'ถ้าสามารถเลี้ยงสัตว์อะไรก็ได้โดยไม่ต้องกังวลเรื่องสถานที่ อยากเลี้ยงอะไร? 🦔',
    'เคยพาน้องไปเดินเล่นที่สวนสาธารณะแถวไหนบ้างมั้ย? 🦮',
    'ชอบดูคลิปน้องสัตว์เลี้ยงพันธุ์อะไรใน TikTok/Reels บ่อยสุด? 🐾'
  ],
  fun: [
    'ถ้าถูกลอตเตอรี่รางวัลที่ 1 สิ่งแรกที่จะทำในวันรุ่งขึ้นคืออะไร? 💸',
    'ถ้าต้องกินอาหารเมนูเดิมทุกวันตลอด 1 เดือน จะเลือกกินเมนูอะไร? 🍜',
    'ถ้าเลือกมีพลังวิเศษได้ 1 อย่าง (เช่น วาร์ปได้, ย้อนเวลาได้) อยากได้อะไร? 🦸',
    'ถามแปลกๆ หน่อย: มีสิ่งของชิ้นไหนที่ซื้อมาแล้วรู้สึกคุ้มค่าเงินที่สุดในชีวิตมั้ย? 🛍️',
    'ถ้ามีโอกาสได้ไปจัดทริปเที่ยวที่ไหนก็ได้ในโลก 1 สัปดาห์ อยากไปประเทศไหน? 🗺️',
    'คิดว่าตัวเองเป็นคน Introvert, Extrovert หรือ Ambivert? 💭',
    'ถ้าสลับร่างกับใครก็ได้ในโลกเป็นเวลา 24 ชั่วโมง อยากสลับกับใคร? 🔄',
    'สิ่งประดิษฐ์ที่ยอดเยี่ยมที่สุดของมนุษยชาติคืออะไร (ห้ามตอบว่าอินเทอร์เน็ต!) 💡'
  ]
};

function mapInterestToKey(tag) {
  const t = String(tag || '').toLowerCase();
  if (t.includes('กาแฟ') || t.includes('คาเฟ่') || t.includes('ชา') || t.includes('coffee')) return 'cafe';
  if (t.includes('เกม') || t.includes('game') || t.includes('บอร์ดเกม')) return 'game';
  if (t.includes('เพลง') || t.includes('ดนตรี') || t.includes('music')) return 'music';
  if (t.includes('หนัง') || t.includes('ซีรีส์') || t.includes('อนิเมะ') || t.includes('movie')) return 'movie';
  if (t.includes('แมว') || t.includes('สุนัข') || t.includes('หมา') || t.includes('สัตว์')) return 'pet';
  if (t.includes('ฟิตเนส') || t.includes('วิ่ง') || t.includes('กีฬา') || t.includes('แบด') || t.includes('โยคะ') || t.includes('ปีนเขา')) return 'sports';
  if (t.includes('รูป') || t.includes('ภาพถ่าย') || t.includes('ศิลปะ') || t.includes('ออกแบบ') || t.includes('photo')) return 'art';
  if (t.includes('อาหาร') || t.includes('ปรุง') || t.includes('เบเกอรี่') || t.includes('กิน') || t.includes('ชาบู')) return 'food';
  if (t.includes('อ่าน') || t.includes('เขียน') || t.includes('ประวัติศาสตร์') || t.includes('ภาษา') || t.includes('book')) return 'study';
  if (t.includes('เที่ยว') || t.includes('ท่องเที่ยว') || t.includes('พืช') || t.includes('travel')) return 'travel';
  if (t.includes('คอมพิวเตอร์') || t.includes('เทคโนโลยี') || t.includes('โค้ด') || t.includes('tech')) return 'tech';
  return null;
}

// Full Conversation Starters API
router.get('/api/conversation-starters', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.session.user.id;
    const targetUserId = req.query.target_user_id || req.query.partner_id;

    let targetUser = null;
    let currentUser = null;
    let sharedInterests = [];
    let tailoredPrompts = [];

    if (targetUserId) {
      targetUser = await db.get(
        'SELECT id, name, nickname, major, year, university, interests, profile_image FROM users WHERE id = ?',
        [targetUserId]
      );
      currentUser = await db.get(
        'SELECT id, name, nickname, major, year, university, interests FROM users WHERE id = ?',
        [currentUserId]
      );
    }

    if (targetUser && currentUser) {
      const myTags = (currentUser.interests || '').split(',').map(s => s.trim()).filter(Boolean);
      const targetTags = (targetUser.interests || '').split(',').map(s => s.trim()).filter(Boolean);

      // Find matching/overlapping tags
      sharedInterests = targetTags.filter(tTag =>
        myTags.some(mTag =>
          mTag.toLowerCase() === tTag.toLowerCase() ||
          mTag.toLowerCase().includes(tTag.toLowerCase()) ||
          tTag.toLowerCase().includes(mTag.toLowerCase())
        )
      );

      // Generate tailored prompts based on shared interests
      const matchedKeys = new Set();
      sharedInterests.forEach(tag => {
        const key = mapInterestToKey(tag);
        if (key && PROMPTS_BY_INTEREST[key]) {
          matchedKeys.add(key);
          PROMPTS_BY_INTEREST[key].forEach(text => {
            tailoredPrompts.push({
              topic: tag,
              key,
              text,
              is_tailored: true
            });
          });
        }
      });

      // If no direct shared tags matched, check partner's individual interests
      if (tailoredPrompts.length === 0) {
        targetTags.forEach(tag => {
          const key = mapInterestToKey(tag);
          if (key && PROMPTS_BY_INTEREST[key]) {
            PROMPTS_BY_INTEREST[key].forEach(text => {
              tailoredPrompts.push({
                topic: tag,
                key,
                text,
                is_tailored: false
              });
            });
          }
        });
      }
    }

    // Shuffle helper
    const shuffle = arr => [...arr].sort(() => 0.5 - Math.random());

    // Build curated 6 mixed prompts
    const mixed = [];
    if (tailoredPrompts.length > 0) {
      mixed.push(...shuffle(tailoredPrompts).slice(0, 3).map(p => ({
        topic: `ความสนใจ: ${p.topic}`,
        text: p.text,
        badge: '🎯 ความสนใจร่วมกัน'
      })));
    }
    mixed.push(...shuffle(CATEGORIZED_PROMPTS.campus).slice(0, 2).map(text => ({
      topic: 'ชีวิตมหาวิทยาลัย',
      text,
      badge: '🎓 มหาลัย & เรียน'
    })));
    mixed.push(...shuffle(CATEGORIZED_PROMPTS.food).slice(0, 2).map(text => ({
      topic: 'ของกิน & คาเฟ่',
      text,
      badge: '☕ คาเฟ่ & อาหาร'
    })));
    mixed.push(...shuffle(CATEGORIZED_PROMPTS.entertainment).slice(0, 2).map(text => ({
      topic: 'บันเทิง & ดนตรี',
      text,
      badge: '🎬 หนัง & เพลง'
    })));
    mixed.push(...shuffle(CATEGORIZED_PROMPTS.fun).slice(0, 2).map(text => ({
      topic: 'ชวนคิดสนุกๆ',
      text,
      badge: '💭 สนุกๆ ชวนคุย'
    })));

    res.json({
      partner: targetUser ? {
        id: targetUser.id,
        name: targetUser.name,
        nickname: targetUser.nickname,
        major: targetUser.major,
        interests: (targetUser.interests || '').split(',').map(s => s.trim()).filter(Boolean),
        profile_image: targetUser.profile_image
      } : null,
      shared_interests: sharedInterests,
      tailored_prompts: tailoredPrompts,
      categories: {
        shared: tailoredPrompts.map(p => ({ topic: p.topic, text: p.text, badge: '🎯 สนใจตรงกัน' })),
        campus: CATEGORIZED_PROMPTS.campus.map(text => ({ topic: 'ชีวิตมหาวิทยาลัย', text, badge: '🎓 มหาลัย & เรียน' })),
        food: CATEGORIZED_PROMPTS.food.map(text => ({ topic: 'ของกิน & คาเฟ่', text, badge: '☕ คาเฟ่ & อาหาร' })),
        hobbies: CATEGORIZED_PROMPTS.hobbies.map(text => ({ topic: 'งานอดิเรก & กิจกรรม', text, badge: '🎮 กิจกรรม & งานอดิเรก' })),
        entertainment: CATEGORIZED_PROMPTS.entertainment.map(text => ({ topic: 'หนัง ซีรีส์ & เพลง', text, badge: '🎬 บันเทิง & เพลง' })),
        pets: CATEGORIZED_PROMPTS.pets.map(text => ({ topic: 'สัตว์เลี้ยง & ไลฟ์สไตล์', text, badge: '🐾 สัตว์เลี้ยง & ไลฟ์สไตล์' })),
        fun: CATEGORIZED_PROMPTS.fun.map(text => ({ topic: 'คำถามสนุกๆ', text, badge: '💭 ชวนคิด & ฮาๆ' }))
      },
      mixed_prompts: shuffle(mixed).slice(0, 8)
    });
  } catch (err) {
    console.error('[Conversation Starters Error]', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการโหลดคำแนะนำเริ่มต้นคุย' });
  }
});

// Legacy and lightweight greetings API with targetUser support
router.get('/api/greetings', requireAuth, async (req, res) => {
  try {
    const targetUserId = req.query.target_user_id || req.query.partner_id;
    const currentUserId = req.session.user.id;

    let dynamicList = [];

    if (targetUserId) {
      const targetUser = await db.get('SELECT interests FROM users WHERE id = ?', [targetUserId]);
      const currentUser = await db.get('SELECT interests FROM users WHERE id = ?', [currentUserId]);

      if (targetUser && currentUser) {
        const myTags = (currentUser.interests || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const targetTags = (targetUser.interests || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const shared = targetTags.filter(t => myTags.some(m => m === t || m.includes(t) || t.includes(m)));

        shared.forEach(tag => {
          const key = mapInterestToKey(tag);
          if (key && PROMPTS_BY_INTEREST[key]) {
            dynamicList.push(...PROMPTS_BY_INTEREST[key]);
          }
        });
      }
    }

    const defaultGreetings = [
      'สวัสดีค่า/ครับ ยินดีที่ได้แมตช์กัน 😊',
      'เห็นว่าเราสนใจเรื่องเดียวกัน เล่าให้ฟังหน่อยได้มั้ย?',
      'ช่วงนี้ทำอะไรอยู่คะ/ครับ?',
      'ปกติชอบไปคาเฟ่แถวไหนอ่ะ? ☕',
      'ดูซีรีส์หรือหนังเรื่องไหนอยู่เหรอ? 🎬',
      'วันหยุดชอบทำอะไรมากที่สุด?',
      'เพลงที่ฟังวนล่าสุดคือเพลงอะไร? 🎵',
      'ถ้ามีเวลาว่างเย็นนี้ อยากชวนไปทำอะไร?',
      'เรียนคณะอะไรเหรอ เทอมนี้เรียนเป็นยังไงบ้าง? 🎓',
      'แถว มข. มีร้านของกินร้านโปรดร้านไหนแนะนำมั้ย? 🍜',
      'ชอบฟังเพลงแนวไหน มีศิลปินที่ชอบมั้ย? 🎧'
    ];

    const combined = [...dynamicList, ...defaultGreetings];
    res.json(combined);
  } catch (err) {
    res.json([
      'สวัสดีค่า/ครับ ยินดีที่ได้แมตช์กัน 😊',
      'ช่วงนี้ทำอะไรอยู่คะ/ครับ?',
      'ปกติชอบไปคาเฟ่แถวไหนอ่ะ? ☕',
      'เพลงที่ฟังวนล่าสุดคือเพลงอะไร? 🎵'
    ]);
  }
});

module.exports = {
  router,
  getOrCreateActivityChat,
  dissolveActivityGroup
};
