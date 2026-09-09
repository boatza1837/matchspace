const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const { db } = require('../config/db');

// VAPID keys configuration
const keysPath = path.join(__dirname, '..', '..', 'vapid-keys.json');
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(keysPath)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    } catch (e) {}
  }
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    vapidKeys = webpush.generateVAPIDKeys();
    try {
      fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2), 'utf8');
      console.log('[Push] Generated and saved new VAPID keys for Web Push');
    } catch (e) {}
  }
}

webpush.setVapidDetails(
  'mailto:admin@matchspace.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

async function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint || !sub.keys) return;
  const endpoint = sub.endpoint;
  const p256dh = sub.keys.p256dh || '';
  const auth = sub.keys.auth || '';

  const existing = await db.get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  if (existing) {
    await db.run('UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE endpoint = ?', [
      Number(userId), p256dh, auth, endpoint
    ]);
  } else {
    await db.run('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)', [
      Number(userId), endpoint, p256dh, auth
    ]);
  }
}

async function removeSubscription(endpoint) {
  await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

async function sendPushNotification(userId, payload) {
  try {
    const subs = await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [Number(userId)]);
    if (!subs || subs.length === 0) return;

    const data = JSON.stringify({
      title: payload.title || 'MatchSpace',
      body: payload.body || 'คุณมีการแจ้งเตือนใหม่',
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      url: payload.url || '/app'
    });

    for (const sub of subs) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      webpush.sendNotification(pushSubscription, data).catch(async (err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription has expired or is no longer valid
          await removeSubscription(sub.endpoint);
        } else {
          console.warn('[Push Send Warning]', err.message);
        }
      });
    }
  } catch (err) {
    console.error('[sendPushNotification Error]', err.message);
  }
}

module.exports = {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendPushNotification
};
