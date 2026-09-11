const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAuth, formatUser } = require('../middlewares/auth');
const { upload, multiUpload } = require('../middlewares/upload');
const { sendToUser } = require('../services/websocket');
const { sendPushNotification } = require('../services/notification');

const STUDENT_BADGES = {
  punctual: { key: 'punctual', label: 'ตรงต่อเวลา', icon: '⏰', desc: 'นัดหมายตรงเวลา ไม่ปล่อยให้รอ' },
  friendly: { key: 'friendly', label: 'คุยเก่งเป็นมิตร', icon: '😊', desc: 'คุยง่าย สุภาพ สดใส เป็นกันเอง' },
  guide: { key: 'guide', label: 'เจ้าถิ่นพาเที่ยว', icon: '🗺️', desc: 'รู้ทาง รู้ร้านอร่อย พาเที่ยวสนุก' },
  listener: { key: 'listener', label: 'นักฟังที่ดี', icon: '🎧', desc: 'ตั้งใจฟัง ใส่ใจ ให้คำปรึกษาดี' },
  helpful: { key: 'helpful', label: 'ช่วยเหลือดีเยี่ยม', icon: '🤝', desc: 'มีน้ำใจ คอยช่วยเหลือเพื่อนๆ' },
  positive: { key: 'positive', label: 'พลังบวกสดใส', icon: '🌟', desc: 'สร้างบรรยากาศรื่นเริง เพิ่มพลังใจ' }
};

router.get('/api/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  const photos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [req.session.user.id]);
  res.json({ user: formatUser(user), photos });
});

router.put('/api/me', requireAuth, multiUpload, async (req, res) => {
  const { name, gender, interested_gender, university, major, year, interests, bio, nickname, age, phone } = req.body || {};
  const userId = req.session.user.id;

  let cleanedPhone = req.session.user.phone || '';
  if (phone) {
    cleanedPhone = String(phone).trim().replace(/[-\s]/g, '');
    const existingPhone = await db.get('SELECT id FROM users WHERE phone = ? AND id != ?', [cleanedPhone, userId]);
    if (existingPhone) {
      return res.status(409).json({ message: 'เบอร์โทรศัพท์นี้มีผู้ใช้งานแล้ว' });
    }
  }

  let profileImage = req.session.user.profile_image || '';
  if (req.files && req.files.profile_image_file && req.files.profile_image_file[0]) {
    profileImage = `/uploads/${req.files.profile_image_file[0].filename}`;
    await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, profileImage]);
  }

  if (req.files && req.files.photos) {
    for (const f of req.files.photos) {
      const url = `/uploads/${f.filename}`;
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
      if (!profileImage) profileImage = url;
    }
  }

  await db.run(`
    UPDATE users
    SET name = ?, gender = ?, interested_gender = ?, university = ?, major = ?, year = ?, interests = ?, bio = ?, nickname = ?, age = ?, phone = ?, profile_image = ?
    WHERE id = ?
  `, [
    String(name || req.session.user.name).trim(),
    gender || req.session.user.gender || 'ไม่ระบุ',
    interested_gender || req.session.user.interested_gender || 'ทุกเพศ',
    university || req.session.user.university || 'มหาวิทยาลัยขอนแก่น',
    major || '',
    year || '',
    interests || '',
    bio || '',
    nickname || '',
    age ? Number(age) : null,
    cleanedPhone,
    profileImage,
    userId
  ]);

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  req.session.user = formatUser(user);
  res.json({ message: 'อัปเดตโปรไฟล์สำเร็จ', user: req.session.user });
});

router.get('/api/users/:id/profile', requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  const myId = req.session.user.id;
  const user = await db.get(`
    SELECT id, name, nickname, gender, interested_gender, university, age, major, year, interests, bio, profile_image, is_student_verified, created_at
    FROM users WHERE id = ? AND is_active != 0
  `, [targetId]);

  if (!user) {
    return res.status(404).json({ message: 'ไม่พบโปรไฟล์นี้' });
  }

  const blockRecord = await db.get('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [myId, targetId]);
  user.is_blocked_by_me = Boolean(blockRecord);

  const photos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [targetId]);
  let photoUrls = photos.map(p => p.photo_url);
  if (photoUrls.length === 0 && user.profile_image) {
    photoUrls = [user.profile_image];
  }

  // Aggregate student badges
  const badgeCounts = await db.all(`
    SELECT badge_key, COUNT(*) as count
    FROM user_badges
    WHERE recipient_id = ?
    GROUP BY badge_key
  `, [targetId]);
  const countMap = {};
  badgeCounts.forEach(c => { countMap[c.badge_key] = c.count; });
  const badges = Object.values(STUDENT_BADGES).map(b => ({
    ...b,
    count: countMap[b.key] || 0
  }));

  res.json({ user, photos: photoUrls, badges });
});

router.post('/api/me/photos', requireAuth, upload.array('photos', 6), async (req, res) => {
  try {
    const userId = req.session.user.id;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'กรุณาเลือกไฟล์รูปภาพเพื่ออัปโหลด' });
    }

    for (const f of req.files) {
      const url = `/uploads/${f.filename}`;
      await db.run('INSERT INTO user_photos (user_id, photo_url) VALUES (?, ?)', [userId, url]);
    }

    const allPhotos = await db.all('SELECT * FROM user_photos WHERE user_id = ? ORDER BY id ASC', [userId]);
    res.json({ message: 'เพิ่มรูปภาพโปรไฟล์เรียบร้อย', photos: allPhotos.map(p => p.photo_url) });
  } catch (err) {
    console.error('[Upload Photos Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
  }
});

router.delete('/api/me/photos/:photoId', requireAuth, async (req, res) => {
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

router.get('/api/candidates', requireAuth, async (req, res) => {
  try {
    const myId = req.session.user.id;
    const rows = await db.all(`
      SELECT id, name, email, gender, interested_gender, university, major, year, interests, bio, nickname, age, profile_image, is_student_verified, is_active, created_at
      FROM users
      WHERE id != ? 
        AND is_active != 0 
        AND (is_admin IS NULL OR is_admin = 0)
        AND (role IS NULL OR role = 'user' OR role = '')
        AND id NOT IN (SELECT matched_user_id FROM matches WHERE user_id = ?)
        AND id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
        AND id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)
      ORDER BY created_at DESC
      LIMIT 30
    `, [myId, myId, myId, myId]);
    res.json(rows);
  } catch (err) {
    console.error('[Candidates Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

router.get('/api/matches', requireAuth, async (req, res) => {
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

router.post('/api/matches', requireAuth, async (req, res) => {
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
    let matchId;
    if (existing) {
      await db.run('UPDATE matches SET status = ?, note = ? WHERE id = ?', [status || existing.status || 'pending', note || existing.note || '', existing.id]);
      matchId = existing.id;
    } else {
      const result = await db.run('INSERT INTO matches (user_id, matched_user_id, status, note) VALUES (?, ?, ?, ?)', [userId, Number(matched_user_id), status || 'pending', note || '']);
      matchId = result.lastInsertRowid;
    }

    let mutualMatch = false;
    if (status === 'liked') {
      const reverse = await db.get('SELECT * FROM matches WHERE user_id = ? AND matched_user_id = ? AND status = ?', [Number(matched_user_id), userId, 'liked']);
      if (reverse) {
        mutualMatch = true;
        await db.run('UPDATE matches SET status = ? WHERE id = ?', ['matched', matchId]);
        await db.run('UPDATE matches SET status = ? WHERE id = ?', ['matched', reverse.id]);

        const existingChat = await db.get(`
          SELECT * FROM chats
          WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
        `, [userId, Number(matched_user_id), Number(matched_user_id), userId]);

        let createdChat = existingChat;
        if (!existingChat) {
          const chatRes = await db.run('INSERT INTO chats (user_a, user_b, title) VALUES (?, ?, ?)', [userId, Number(matched_user_id), 'แมตช์สำเร็จ!']);
          createdChat = await db.get('SELECT * FROM chats WHERE id = ?', [chatRes.lastInsertRowid]);
        }

        // Real-time WebSocket notifications to both users
        const matchPayload = {
          type: 'mutual_match',
          title: '🎉 แมตช์ใหม่สำเร็จ!',
          message: 'คุณและอีกฝ่ายกดสนใจกันและกัน ระบบได้เปิดห้องแชทให้แล้ว',
          chatId: createdChat ? createdChat.id : null,
          partner: {
            id: req.session.user.id,
            name: req.session.user.name,
            profile_image: req.session.user.profile_image
          }
        };
        sendToUser(Number(matched_user_id), matchPayload);
        sendToUser(userId, { ...matchPayload, partner: { id: target.id, name: target.name, profile_image: target.profile_image } });

        // Web Push notification on mutual match
        try {
          const { sendPushNotification } = require('../services/notification');
          sendPushNotification(Number(matched_user_id), {
            title: '🎉 แมตช์ใหม่สำเร็จ!',
            body: `คุณและ ${req.session.user.name} ส่งความสนใจให้กันและกัน`,
            url: '/app'
          });
          sendPushNotification(userId, {
            title: '🎉 แมตช์ใหม่สำเร็จ!',
            body: `คุณและ ${target.name} ส่งความสนใจให้กันและกัน`,
            url: '/app'
          });
        } catch (e) {}

        // Email notifications on mutual match
        try {
          const { sendMatchEmailNotification } = require('../services/email');
          sendMatchEmailNotification(target, req.session.user);
          sendMatchEmailNotification(req.session.user, target);
        } catch (e) {
          console.warn('[Match Email Error]', e.message);
        }
      } else {
        // Send Web Push notification on single like
        try {
          sendPushNotification(Number(matched_user_id), {
            title: '❤️ มีคนกดสนใจโปรไฟล์คุณ!',
            body: `มีเพื่อนนักศึกษาแอบส่งความสนใจถึงคุณ ตรวจสอบได้ที่หน้าค้นหา`,
            icon: '/icon-192.png',
            url: '/app'
          });
        } catch (e) {}
      }
    }

    const updatedMatch = await db.get('SELECT * FROM matches WHERE id = ?', [matchId]);
    res.status(existing ? 200 : 201).json({
      message: mutualMatch ? '🎉 แมตช์สำเร็จ! ระบบสร้างแชทให้แล้ว' : (status === 'liked' ? 'บันทึกความสนใจแล้ว' : 'บันทึกการปัดผ่านแล้ว'),
      match: updatedMatch,
      mutual: mutualMatch
    });
  } catch (err) {
    console.error('[Post Match Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแมตช์' });
  }
});

router.get('/api/skipped', requireAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT m.id AS match_id, m.created_at AS skipped_at, m.note,
             u.id, u.name, u.nickname, u.email, u.gender, u.interested_gender, u.university, u.age, u.major, u.year, 
             u.interests, u.bio, u.profile_image, u.is_student_verified
      FROM matches m
      JOIN users u ON u.id = m.matched_user_id
      WHERE m.user_id = ? AND m.status = 'skipped'
        AND u.id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
        AND u.id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)
      ORDER BY m.created_at DESC
    `, [req.session.user.id, req.session.user.id, req.session.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[Skipped Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลคนที่ปัดผ่าน' });
  }
});

router.delete('/api/matches/:id', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const userId = req.session.user.id;
    const match = await db.get('SELECT * FROM matches WHERE id = ? AND user_id = ?', [matchId, userId]);
    if (!match) {
      return res.status(404).json({ message: 'ไม่พบรายการนี้' });
    }

    if (match.status === 'matched') {
      await db.run("UPDATE matches SET status = 'liked' WHERE user_id = ? AND matched_user_id = ?", [match.matched_user_id, userId]);
    }

    await db.run('DELETE FROM matches WHERE id = ?', [matchId]);
    res.json({ message: 'นำผู้ใช้นี้กลับไปที่หน้าค้นหาแล้ว' });
  } catch (err) {
    console.error('[Delete Match Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการลบรายการแมตช์' });
  }
});

router.post('/api/skipped/restore-all', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await db.run("DELETE FROM matches WHERE user_id = ? AND status = 'skipped'", [userId]);
    res.json({ message: 'นำทุกคนที่ปัดผ่านกลับสู่หน้าค้นหาเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('[Restore All Skipped Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาด' });
  }
});

router.get('/api/liked', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const rows = await db.all(`
      SELECT m.id AS match_id, m.created_at AS liked_at, m.status, m.note,
             u.id, u.name, u.nickname, u.email, u.gender, u.interested_gender, u.university, u.age, u.major, u.year, 
             u.interests, u.bio, u.profile_image, u.is_student_verified,
             (
               SELECT c.id FROM chats c 
               WHERE (c.user_a = ? AND c.user_b = u.id) 
                  OR (c.user_a = u.id AND c.user_b = ?)
               LIMIT 1
             ) AS chat_id
      FROM matches m
      JOIN users u ON u.id = m.matched_user_id
      WHERE m.user_id = ? AND (m.status = 'liked' OR m.status = 'matched')
        AND u.id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
        AND u.id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)
      ORDER BY m.created_at DESC
    `, [userId, userId, userId, userId, userId]);
    res.json(rows);
  } catch (err) {
    console.error('[Liked Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลคนที่กดสนใจ' });
  }
});

// Student Badges Endpoints
router.get('/api/users/:id/badges', requireAuth, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const myId = req.session.user.id;

    const counts = await db.all(`
      SELECT badge_key, COUNT(*) as count
      FROM user_badges
      WHERE recipient_id = ?
      GROUP BY badge_key
    `, [targetId]);

    const countMap = {};
    counts.forEach(c => { countMap[c.badge_key] = c.count; });

    const myGiven = await db.all(`
      SELECT badge_key FROM user_badges
      WHERE recipient_id = ? AND giver_id = ?
    `, [targetId, myId]);
    const myGivenSet = new Set(myGiven.map(g => g.badge_key));

    const badges = Object.values(STUDENT_BADGES).map(b => ({
      ...b,
      count: countMap[b.key] || 0,
      given_by_me: myGivenSet.has(b.key)
    }));

    const totalCount = counts.reduce((acc, curr) => acc + curr.count, 0);

    const recent = await db.all(`
      SELECT b.id, b.badge_key, b.comment, b.created_at,
             u.id AS giver_id, u.name AS giver_name, u.nickname AS giver_nickname, u.profile_image AS giver_profile_image
      FROM user_badges b
      JOIN users u ON u.id = b.giver_id
      WHERE b.recipient_id = ?
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [targetId]);

    res.json({
      target_user_id: targetId,
      total_badges: totalCount,
      badges,
      recent
    });
  } catch (err) {
    console.error('[Get Badges Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลป้ายความประทับใจ' });
  }
});

router.post('/api/users/:id/badges', requireAuth, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const giverId = req.session.user.id;
    const { badge_key, comment, activity_id } = req.body || {};

    if (giverId === targetId) {
      return res.status(400).json({ message: 'คุณไม่สามารถมอบป้ายให้ตนเองได้' });
    }

    if (!badge_key || !STUDENT_BADGES[badge_key]) {
      return res.status(400).json({ message: 'ประเภทป้ายความประทับใจไม่ถูกต้อง' });
    }

    const targetUser = await db.get('SELECT id, name FROM users WHERE id = ?', [targetId]);
    if (!targetUser) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้นี้' });
    }

    const existing = await db.get(`
      SELECT id FROM user_badges
      WHERE recipient_id = ? AND giver_id = ? AND badge_key = ?
    `, [targetId, giverId, badge_key]);

    if (existing) {
      return res.status(400).json({ message: 'คุณเคยมอบป้ายนี้ให้เพื่อนคนนี้แล้ว' });
    }

    await db.run(`
      INSERT INTO user_badges (recipient_id, giver_id, badge_key, comment, activity_id)
      VALUES (?, ?, ?, ?, ?)
    `, [targetId, giverId, badge_key, comment ? String(comment).trim().slice(0, 200) : null, activity_id ? Number(activity_id) : null]);

    const badgeInfo = STUDENT_BADGES[badge_key];

    // Realtime notification via WebSocket
    sendToUser(targetId, {
      type: 'badge_received',
      title: '🎉 ได้รับป้ายความประทับใจใหม่!',
      message: `${req.session.user.name} ได้มอบป้าย "${badgeInfo.icon} ${badgeInfo.label}" ให้คุณ`,
      badge: badgeInfo,
      giver: {
        id: req.session.user.id,
        name: req.session.user.name,
        profile_image: req.session.user.profile_image
      }
    });

    // Web Push notification
    try {
      sendPushNotification(targetId, {
        title: '🎉 ได้รับป้ายความประทับใจใหม่!',
        body: `${req.session.user.name} ได้มอบป้าย "${badgeInfo.icon} ${badgeInfo.label}" ให้คุณ`,
        icon: '/icon-192.png',
        url: '/app'
      });
    } catch (e) {}

    res.status(201).json({
      message: `มอบป้าย "${badgeInfo.icon} ${badgeInfo.label}" ให้ ${targetUser.name} เรียบร้อยแล้ว!`,
      badge: badgeInfo
    });
  } catch (err) {
    console.error('[Give Badge Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการมอบป้ายความประทับใจ' });
  }
});

module.exports = router;
