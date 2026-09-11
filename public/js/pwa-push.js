/**
 * MatchSpace PWA & Web Push Notification Client Manager
 */

(function () {
  let swRegistration = null;
  let deferredInstallPrompt = null;
  let isPushSubscribed = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      swRegistration = reg;
      console.log('[PWA] Service Worker registered successfully:', reg.scope);
      await checkExistingSubscription();
      return reg;
    } catch (err) {
      console.warn('[PWA] Service Worker registration failed:', err.message);
      return null;
    }
  }

  async function checkExistingSubscription() {
    if (!swRegistration || !('PushManager' in window)) return false;
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      isPushSubscribed = !!sub;
      updatePushUIState(isPushSubscribed);
      return isPushSubscribed;
    } catch (e) {
      return false;
    }
  }

  async function subscribeUserToPush() {
    if (!('PushManager' in window)) {
      alert('เบราว์เซอร์นี้ไม่รองรับระบบ Web Push Notification');
      return false;
    }

    try {
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.ready;
      }

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('กรุณาอนุญาตการแจ้งเตือน (Allow Notifications) ในการตั้งค่าเบราว์เซอร์เพื่อรับการแจ้งเตือน');
        return false;
      }

      // Get VAPID public key from backend
      const res = await fetch('/api/notifications/vapid-public-key');
      const data = await res.json();
      if (!data.publicKey) {
        throw new Error('ไม่พบ VAPID Public Key จากเซิร์ฟเวอร์');
      }

      const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Send subscription to server
      const saveRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      if (!saveRes.ok) throw new Error('ไม่สามารถบันทึกการลงทะเบียนแจ้งเตือนได้');

      isPushSubscribed = true;
      updatePushUIState(true);
      alert('🎉 เปิดรับการแจ้งเตือน MatchSpace เรียบร้อยแล้ว!');

      // Send a test notification to verify
      fetch('/api/notifications/test', { method: 'POST' }).catch(() => {});

      return true;
    } catch (err) {
      console.error('[Push Subscription Error]', err);
      alert('เกิดข้อผิดพลาดในการเปิดแจ้งเตือน: ' + (err.message || 'โปรดลองใหม่'));
      return false;
    }
  }

  async function unsubscribeUserFromPush() {
    if (!swRegistration) return;
    try {
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      isPushSubscribed = false;
      updatePushUIState(false);
      alert('ปิดการรับการแจ้งเตือนเรียบร้อยแล้ว');
    } catch (e) {
      console.error('[Push Unsubscribe Error]', e);
    }
  }

  function updatePushUIState(subscribed) {
    const btn = document.getElementById('drawerBtnPushNotify');
    const pill = document.getElementById('drawerPushPill');
    if (pill) {
      pill.textContent = subscribed ? 'เปิดอยู่ ✔' : 'ปิดอยู่';
      pill.className = subscribed ? 'drawer-status-pill active' : 'drawer-status-pill';
    }
    if (btn) {
      btn.title = subscribed ? 'คลิกเพื่อปิดการแจ้งเตือน' : 'คลิกเพื่อเปิดการแจ้งเตือน';
    }
  }

  // PWA Install Prompt handling
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt fired and captured');
    const drawerInstallBtn = document.getElementById('drawerBtnInstallPwa');
    if (drawerInstallBtn) {
      drawerInstallBtn.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    console.log('[PWA] MatchSpace was installed successfully');
    const drawerInstallBtn = document.getElementById('drawerBtnInstallPwa');
    if (drawerInstallBtn) {
      drawerInstallBtn.classList.add('hidden');
    }
  });

  async function promptInstallPWA() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('[PWA] User response to install prompt:', outcome);
      deferredInstallPrompt = null;
    } else {
      // Check if iOS Safari
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

      if (isStandalone) {
        alert('คุณติดตั้งและเปิดใช้งาน MatchSpace บนหน้าจอโฮมเรียบร้อยแล้ว');
      } else if (isIos) {
        alert('วิธีติดตั้งบน iPhone / iPad:\n\n1. กดปุ่มแชร์ (Share ⎋) ด้านล่างของ Safari\n2. เลื่อนลงมาเลือก "เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen ➕)\n3. กด "เพิ่ม" (Add) ที่มุมขวาบน');
      } else {
        alert('วิธีติดตั้งบนมือถือ:\n\nกดปุ่มเมนู 3 จุด (⋮) ของเบราว์เซอร์ แล้วเลือก "ติดตั้งแอป" (Install app) หรือ "เพิ่มลงในหน้าจอโฮม"');
      }
    }
  }

  // Setup UI event listeners
  function setupPwaEventListeners() {
    const installBtn = document.getElementById('drawerBtnInstallPwa');
    if (installBtn) {
      installBtn.addEventListener('click', promptInstallPWA);
    }

    const pushBtn = document.getElementById('drawerBtnPushNotify');
    if (pushBtn) {
      pushBtn.addEventListener('click', () => {
        if (isPushSubscribed) {
          if (confirm('คุณต้องการปิดการแจ้งเตือนใช่หรือไม่?')) {
            unsubscribeUserFromPush();
          }
        } else {
          subscribeUserToPush();
        }
      });
    }
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
      setupPwaEventListeners();
    });
  } else {
    registerServiceWorker();
    setupPwaEventListeners();
  }

  window.matchSpacePWA = {
    subscribeUserToPush,
    unsubscribeUserFromPush,
    promptInstallPWA,
    isPushSubscribed: () => isPushSubscribed
  };
})();
