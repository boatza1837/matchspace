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

  // PWA Install Prompt handling & UI Synchronization
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt fired and captured');
    updateInstallUI(true, false);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    console.log('[PWA] MatchSpace was installed successfully');
    updateInstallUI(false, true);
  });

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function updateInstallUI(canInstallDirectly, isInstalled) {
    const isStandalone = isInstalled || isStandaloneMode();

    const topbarBtn = document.getElementById('topbarInstallBtn');
    const heroStatus = document.getElementById('drawerHeroInstallStatus');
    const heroBtn = document.getElementById('drawerHeroInstallBtn');
    const homeStatus = document.getElementById('homePwaStatusPill');
    const homeBtn = document.getElementById('btnOpenHomeInstallPwa');
    const modalActionBtn = document.getElementById('pwaModalActionBtn');
    const modalActionText = document.getElementById('pwaModalActionText');

    if (isStandalone) {
      if (topbarBtn) {
        topbarBtn.innerHTML = '<span class="install-pill-icon">✔️</span> <span class="install-pill-text">เปิดในแอป</span>';
        topbarBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      }
      if (heroStatus) {
        heroStatus.textContent = '✔️ ติดตั้งแล้ว';
        heroStatus.className = 'pwa-status-pill';
        heroStatus.style.background = '#10b981';
      }
      if (heroBtn) {
        heroBtn.innerHTML = '<span>✔️ ใช้งานในโหมดแอปแล้ว</span>';
        heroBtn.style.opacity = '0.9';
      }
      if (homeStatus) {
        homeStatus.textContent = '✔️ ติดตั้งแล้ว';
        homeStatus.style.background = '#10b981';
      }
      if (homeBtn) {
        homeBtn.innerHTML = '<span>เปิดใช้เต็มจอ</span>';
      }
      if (modalActionBtn && modalActionText) {
        modalActionText.textContent = '✔️ คุณได้ติดตั้งแอป MatchSpace เรียบร้อยแล้ว';
        modalActionBtn.style.background = '#10b981';
      }
    } else {
      if (heroStatus) {
        heroStatus.textContent = canInstallDirectly ? '⚡ พร้อมติดตั้ง' : '📲 ติดตั้งง่าย';
        heroStatus.className = 'pwa-status-pill ready';
      }
    }
  }

  function openInstallModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;

    const iosGuide = document.getElementById('pwaIosGuide');
    const androidGuide = document.getElementById('pwaAndroidGuide');
    const isIos = isIosDevice();

    if (iosGuide && androidGuide) {
      if (isIos) {
        iosGuide.style.display = 'block';
        androidGuide.style.display = 'none';
      } else {
        iosGuide.style.display = 'none';
        androidGuide.style.display = 'block';
      }
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeInstallModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  async function promptInstallPWA() {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log('[PWA] User response to install prompt:', outcome);
        if (outcome === 'accepted') {
          updateInstallUI(false, true);
        }
        deferredInstallPrompt = null;
      } catch (err) {
        console.warn('[PWA] prompt error, falling back to modal:', err);
        openInstallModal();
      }
    } else {
      // If native deferred prompt is not available (e.g. iOS Safari or desktop browser)
      openInstallModal();
    }
  }

  // Setup UI event listeners
  function setupPwaEventListeners() {
    // Topbar Install Button
    document.getElementById('topbarInstallBtn')?.addEventListener('click', () => {
      promptInstallPWA();
    });

    // Drawer Hero Card Install Button
    document.getElementById('drawerHeroInstallBtn')?.addEventListener('click', () => {
      // Close drawer if open, then prompt
      document.getElementById('closeDrawerBtn')?.click();
      promptInstallPWA();
    });

    // Home Tab Promo Banner Button
    document.getElementById('btnOpenHomeInstallPwa')?.addEventListener('click', () => {
      promptInstallPWA();
    });

    // Drawer Install Guide Button
    document.getElementById('drawerBtnInstallGuide')?.addEventListener('click', () => {
      document.getElementById('closeDrawerBtn')?.click();
      openInstallModal();
    });

    // Install Modal Buttons
    document.getElementById('closePwaInstallModal')?.addEventListener('click', closeInstallModal);
    document.getElementById('pwaInstallModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'pwaInstallModal') closeInstallModal();
    });

    document.getElementById('pwaModalActionBtn')?.addEventListener('click', () => {
      if (deferredInstallPrompt) {
        closeInstallModal();
        deferredInstallPrompt.prompt();
        deferredInstallPrompt = null;
      } else if (isIosDevice()) {
        alert('สำหรับ iPhone / iPad: แตะปุ่มแชร์ ⎋ ของ Safari แล้วเลือก "เพิ่มไปยังหน้าจอโฮม" ➕');
      } else {
        alert('สำหรับเบราว์เซอร์: แตะเมนู 3 จุด (⋮) ของเบราว์เซอร์ แล้วเลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"');
      }
    });

    document.getElementById('pwaCopyLinkBtn')?.addEventListener('click', async () => {
      const url = window.location.origin + '/app.html';
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          alert('คัดลอกลิงก์ MatchSpace แล้ว:\n' + url);
        } else {
          prompt('คัดลอกลิงก์แอป MatchSpace:', url);
        }
      } catch (e) {
        prompt('คัดลอกลิงก์แอป MatchSpace:', url);
      }
    });

    // Push notification toggle button in drawer
    const pushBtn = document.getElementById('drawerBtnPushNotify');
    if (pushBtn) {
      pushBtn.addEventListener('click', () => {
        if (isPushSubscribed) {
          if (confirm('คุณต้องการปิดการแจ้งเตือนพุชใช่หรือไม่?')) {
            unsubscribeUserFromPush();
          }
        } else {
          subscribeUserToPush();
        }
      });
    }

    // Initial check for standalone mode
    if (isStandaloneMode()) {
      updateInstallUI(false, true);
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
    promptInstall: promptInstallPWA,
    promptInstallPWA,
    openInstallModal,
    closeInstallModal,
    isStandaloneMode,
    isPushSubscribed: () => isPushSubscribed
  };
})();
