const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { getVapidPublicKey, saveSubscription, removeSubscription, sendPushNotification } = require('../services/notification');

router.get('/api/notifications/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/api/notifications/subscribe', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const subscription = req.body;
    await saveSubscription(userId, subscription);
    res.json({ success: true, message: 'ลงทะเบียนรับการแจ้งเตือนสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/api/notifications/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await removeSubscription(endpoint);
    }
    res.json({ success: true, message: 'ยกเลิกการรับแจ้งเตือนสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/api/notifications/test', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await sendPushNotification(userId, {
      title: 'MatchSpace แจ้งเตือนทดสอบ 🔔',
      body: 'ระบบ Web Push Notification ของคุณทำงานสมบูรณ์แล้ว!',
      url: '/app'
    });
    res.json({ success: true, message: 'ส่งการแจ้งเตือนทดสอบแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
