/**
 * MatchSpace Modular Script Bundle
 * Generated from public/js/* modules
 */

// ==================== public/js/core.js ====================
/**
 * MatchSpace Core Utilities
 * Contains shared helpers, DOM utilities, and API wrappers
 */

const RECOMMENDED_INTERESTS = [
  'หนัง', 'เพลง', 'ดนตรี', 'ศิลปะ', 'การออกแบบ',
  'ภาพถ่าย', 'ศาสตร์', 'เทคโนโลยี', 'คอมพิวเตอร์',
  'ฟิตเนส', 'โยคะ', 'ปีนเขา', 'กีฬา', 'การเดิน',
  'การอ่าน', 'การเขียน', 'ปรุงอาหาร', 'เบเกอรี่',
  'ท่องเที่ยว', 'พืช', 'สัตว์ส่วน', 'แมว', 'สุนัข',
  'เกม', 'อนิเมะ', 'คาเฟ่', 'ร้านชา', 'ศาสตร์อาหาร',
  'การพูด', 'ภาษา', 'ประวัติศาสตร์', 'วัฒนธรรม'
];

function initializeTagsContainer(containerId, hiddenInputId, selectedTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = RECOMMENDED_INTERESTS.map(tag => `
    <div class="tag ${selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${tag}">${tag}</div>
  `).join('');
  
  updateTagsInput(hiddenInputId);
  
  container.querySelectorAll('.tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      tagEl.classList.toggle('selected');
      updateTagsInput(hiddenInputId);
    });
  });
}

function updateTagsInput(hiddenInputId) {
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!hiddenInput) return;
  
  const container = hiddenInput.parentElement;
  const selectedTags = Array.from(container.querySelectorAll('.tag.selected')).map(el => el.dataset.tag);
  hiddenInput.value = selectedTags.join(', ');
}

async function apiRequest(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  
  const response = await fetch(url, {
    headers,
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};

  if (!response.ok) {
    if (response.status === 403 && data.banned) {
      alert(data.message || 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล');
      window.location.href = '/';
      throw new Error(data.message);
    }
    throw new Error(data.message || 'เกิดข้อผิดพลาด');
  }

  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsDataURL(file);
  });
}

function formatActivityDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const monthName = months[m - 1] || parts[1];
      const thaiYear = y + 543;
      return `${d} ${monthName} ${thaiYear}`;
    }
  } catch (e) {}
  return dateStr;
}

function formatChatTime(createdAt) {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch (e) {
    return '';
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showMatchToast(message) {
  const existing = document.getElementById('matchToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'matchToast';
  toast.className = 'match-toast-popup';
  toast.innerHTML = `
    <div class="match-toast-icon">✨</div>
    <div class="match-toast-content">
      <strong>การแจ้งเตือน</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}


// ==================== public/js/ws-client.js ====================
/**
 * MatchSpace Real-time WebSocket Client
 * Replaces resource-draining HTTP Polling with instant bidirectional messaging.
 */

class MatchSpaceWebSocketClient {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.currentChatId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 10000;
    this.reconnectTimer = null;
    this.listeners = new Map();
    this.isConnected = false;
  }

  connect(userId) {
    if (userId) this.userId = Number(userId);
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('[MatchSpace WS] Connected to Real-time WebSocket');

        // Authenticate socket with session user ID
        if (this.userId) {
          this.send({ type: 'auth', userId: this.userId });
        }

        // Rejoin active chat room if any
        if (this.currentChatId) {
          this.send({ type: 'join_chat', chatId: this.currentChatId });
        }

        this.emit('connected', { userId: this.userId });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingEvent(data);
        } catch (err) {
          console.error('[MatchSpace WS] Error parsing message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[MatchSpace WS] Connection error:', err);
        this.ws.close();
      };
    } catch (e) {
      console.error('[MatchSpace WS] Init failed:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      console.log(`[MatchSpace WS] Attempting reconnect (#${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  joinChat(chatId) {
    this.currentChatId = Number(chatId);
    this.send({ type: 'join_chat', chatId: this.currentChatId });
  }

  leaveChat() {
    if (this.currentChatId) {
      this.send({ type: 'leave_chat' });
      this.currentChatId = null;
    }
  }

  sendTyping(chatId, userName) {
    this.send({ type: 'typing', chatId: Number(chatId), userName });
  }

  sendStopTyping(chatId) {
    this.send({ type: 'stop_typing', chatId: Number(chatId) });
  }

  handleIncomingEvent(data) {
    if (!data || !data.type) return;

    // Dispatch typed event
    this.emit(data.type, data);

    // Global notifications
    if (data.type === 'mutual_match') {
      if (typeof showMatchToast === 'function') {
        showMatchToast(data.title || '🎉 แมตช์ใหม่สำเร็จ! เริ่มคุยกันได้เลย');
      }
    } else if (data.type === 'chat_notification') {
      if (this.currentChatId !== data.chatId && typeof showMatchToast === 'function') {
        showMatchToast(`💬 ${data.senderName}: ${data.messageSnippet || 'ส่งข้อความใหม่'}`);
      }
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[WS Event Error: ${event}]`, err);
        }
      });
    }
  }
}

// Singleton global instance
window.matchSpaceWS = new MatchSpaceWebSocketClient();


// ==================== public/js/auth.js ====================
/**
 * MatchSpace Authentication & Forms Controller
 * Handles Login, Google Sign-In, Multi-Step Registration, and User Reports.
 */

function initAuthModule() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const reportForm = document.getElementById('reportForm');

  // ===================== LOGIN FORM =====================
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(loginForm).entries());
      const messageEl = document.getElementById('loginMessage');
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ กำลังเข้าสู่ระบบ...';
        }
        if (messageEl) {
          messageEl.className = 'message success';
          messageEl.textContent = 'กำลังตรวจสอบข้อมูลรหัสผ่าน...';
        }

        const result = await apiRequest('/api/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (messageEl) {
          messageEl.className = 'message success';
          messageEl.textContent = result.message || 'เข้าสู่ระบบสำเร็จ กำลังนำเข้าสู่ระบบ...';
        }

        if (result.user && (result.user.is_admin || result.user.role === 'admin' || result.user.role === 'owner')) {
          window.location.href = '/admin';
        } else {
          window.location.href = '/app';
        }
      } catch (error) {
        if (messageEl) {
          messageEl.className = 'message error';
          messageEl.textContent = error.message;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'เข้าสู่ระบบ';
        }
      }
    });

    const GOOGLE_CLIENT_ID = '186015897078-3qtjge4dbi3e6sjvp4e4lbulolipioug.apps.googleusercontent.com';

    function initGoogleButton() {
      const btnContainer = document.getElementById('googleSignInButton');
      const fallbackContainer = document.getElementById('googleFallbackContainer');

      if (typeof google !== 'undefined' && google.accounts && google.accounts.id && btnContainer) {
        try {
          google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleLoginResponse,
            auto_select: false
          });

          btnContainer.innerHTML = '';
          google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            width: 340,
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
          });

          if (fallbackContainer && btnContainer.children.length > 0) {
            fallbackContainer.classList.add('hidden');
          }
        } catch (e) {
          if (fallbackContainer) fallbackContainer.classList.remove('hidden');
        }
      } else if (fallbackContainer) {
        fallbackContainer.classList.remove('hidden');
      }
    }

    initGoogleButton();
    setTimeout(initGoogleButton, 600);

    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    if (btnGoogleLogin) {
      btnGoogleLogin.addEventListener('click', () => {
        showGoogleLoginModal();
      });
    }
  }

  function processGoogleAuth(email, name, picture) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return;

    const messageEl = document.getElementById('loginMessage');
    if (messageEl) {
      messageEl.className = 'message success';
      messageEl.textContent = '⏳ กำลังตรวจสอบข้อมูลบัญชี Google...';
    }

    apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, name: name || cleanEmail.split('@')[0], picture: picture || '' })
    }).then((result) => {
      if (messageEl) {
        messageEl.className = 'message success';
        messageEl.textContent = result.message || 'กำลังนำคุณไปดำเนินการต่อ...';
      }
      window.location.href = result.redirect || '/app';
    }).catch((err) => {
      if (messageEl) {
        messageEl.className = 'message error';
        messageEl.textContent = err.message;
      }
    });
  }

  function showGoogleLoginModal() {
    const existingModal = document.getElementById('googleAuthModal');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'googleAuthModal';
    overlay.className = 'google-modal-overlay';

    overlay.innerHTML = `
      <div class="google-modal-card">
        <div class="google-modal-header">
          <svg width="36" height="36" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          <h3>ลงชื่อเข้าใช้ด้วย Google</h3>
          <p>กรอกหรือเลือกอีเมล Gmail ของคุณเพื่อดำเนินการต่อ</p>
        </div>

        <div style="margin-bottom:16px;">
          <input id="modalGoogleEmail" type="email" placeholder="name@gmail.com" style="width:100%; padding:12px 14px; border:1.5px solid var(--line); border-radius:12px; font-size:0.95rem; outline:none;" />
        </div>

        <div style="display:flex; gap:10px;">
          <button type="button" id="btnCancelGoogleModal" class="button secondary" style="flex:1;">ยกเลิก</button>
          <button type="button" id="btnSubmitGoogleModal" class="button primary" style="flex:1;">ดำเนินการต่อ</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const emailInput = overlay.querySelector('#modalGoogleEmail');
    const submitBtn = overlay.querySelector('#btnSubmitGoogleModal');
    const cancelBtn = overlay.querySelector('#btnCancelGoogleModal');

    setTimeout(() => emailInput?.focus(), 100);

    const submitAuth = () => {
      const emailVal = emailInput?.value.trim();
      if (!emailVal || !emailVal.includes('@')) {
        alert('กรุณากรอกอีเมลให้ถูกต้อง');
        return;
      }
      overlay.remove();
      processGoogleAuth(emailVal, emailVal.split('@')[0], '');
    };

    submitBtn?.addEventListener('click', submitAuth);
    cancelBtn?.addEventListener('click', () => overlay.remove());
    emailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAuth();
    });
  }

  // Handle official Google One-Tap / GIS callback
  window.handleGoogleLoginResponse = async (response) => {
    const messageEl = document.getElementById('loginMessage');
    if (messageEl) {
      messageEl.className = 'message success';
      messageEl.textContent = 'กำลังตรวจสอบข้อมูลบัญชี Google...';
    }

    if (response && response.credential) {
      try {
        const result = await apiRequest('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential: response.credential })
        });

        if (messageEl) {
          messageEl.className = 'message success';
          messageEl.textContent = result.message || 'กำลังนำคุณไปดำเนินการต่อ...';
        }

        setTimeout(() => {
          window.location.href = result.redirect || '/app';
        }, 400);
      } catch (err) {
        if (messageEl) {
          messageEl.className = 'message error';
          messageEl.textContent = err.message || 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี';
        }
      }
    }
  };

  // ===================== REGISTER FORM =====================
  if (registerForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const googleEmail = urlParams.get('google_email');
    const googleName = urlParams.get('google_name');
    const googlePic = urlParams.get('google_pic');

    if (googleEmail) {
      const emailInput = document.getElementById('email');
      const nameInput = document.getElementById('name');
      const googleProfileImageInput = document.getElementById('googleProfileImage');
      const googleAvatarSection = document.getElementById('googleAvatarSection');
      const googleAvatarImg = document.getElementById('googleAvatarImg');
      const messageEl = document.getElementById('registerMessage');

      if (emailInput) {
        emailInput.value = googleEmail;
        emailInput.readOnly = true;
        emailInput.style.background = '#f3f4f6';
      }
      if (nameInput && googleName) {
        nameInput.value = googleName;
      }
      if (googlePic) {
        if (googleProfileImageInput) googleProfileImageInput.value = googlePic;
        if (googleAvatarImg) googleAvatarImg.src = googlePic;
        if (googleAvatarSection) googleAvatarSection.classList.remove('hidden');
      }

      if (messageEl) {
        messageEl.className = 'message success';
        messageEl.textContent = 'ดึงข้อมูลและรูปโปรไฟล์จาก Google เรียบร้อยแล้ว กรุณากรอกข้อมูลเพิ่มเติมและยินยอมข้อตกลงเพื่อสมัครสมาชิก';
      }
    }

    const interestsTags = document.getElementById('interestsTags');
    if (interestsTags) {
      initializeTagsContainer('interestsTags', 'interests');
    }

    const consentCheckbox = document.getElementById('consentCheckbox');
    const btnAcceptConsent = document.getElementById('btnAcceptConsent');
    const btnDeclineConsent = document.getElementById('btnDeclineConsent');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');

    function updateRegisterSubmitState() {
      if (!registerSubmitBtn) return;
      if (consentCheckbox && consentCheckbox.checked) {
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.classList.remove('register-btn-disabled');
      } else {
        registerSubmitBtn.disabled = true;
        registerSubmitBtn.classList.add('register-btn-disabled');
      }
    }

    if (consentCheckbox) {
      consentCheckbox.addEventListener('change', updateRegisterSubmitState);
    }

    if (btnAcceptConsent) {
      btnAcceptConsent.addEventListener('click', () => {
        if (consentCheckbox) consentCheckbox.checked = true;
        updateRegisterSubmitState();
      });
    }

    if (btnDeclineConsent) {
      btnDeclineConsent.addEventListener('click', () => {
        if (consentCheckbox) consentCheckbox.checked = false;
        updateRegisterSubmitState();
        const messageEl = document.getElementById('registerMessage');
        if (messageEl) {
          messageEl.className = 'message error';
          messageEl.textContent = 'ท่านต้องยอมรับข้อตกลงความยินยอมข้อมูลส่วนบุคคลเพื่อสมัครสมาชิก';
        }
      });
    }

    updateRegisterSubmitState();

    const regUniversityEl = document.getElementById('university');
    const regCustomUniversityEl = document.getElementById('customUniversity');
    const regMajorEl = document.getElementById('major');
    const regCustomMajorEl = document.getElementById('customMajor');
    const regMajorLabelEl = document.getElementById('majorLabel');

    if (regUniversityEl) {
      regUniversityEl.addEventListener('change', () => {
        if (regUniversityEl.value === 'other') {
          if (regCustomUniversityEl) {
            regCustomUniversityEl.classList.remove('hidden');
            regCustomUniversityEl.focus();
          }
          if (regMajorEl) regMajorEl.classList.add('hidden');
          if (regCustomMajorEl) regCustomMajorEl.classList.remove('hidden');
          if (regMajorLabelEl) regMajorLabelEl.textContent = 'คณะ / สาขาวิชา (ระบุเอง)';
        } else {
          if (regCustomUniversityEl) regCustomUniversityEl.classList.add('hidden');
          if (regMajorEl) regMajorEl.classList.remove('hidden');
          if (regMajorLabelEl) regMajorLabelEl.textContent = 'คณะ / วิทยาลัย (ม.ขอนแก่น)';
          if (regMajorEl && regMajorEl.value === 'other') {
            if (regCustomMajorEl) regCustomMajorEl.classList.remove('hidden');
          } else {
            if (regCustomMajorEl) regCustomMajorEl.classList.add('hidden');
          }
        }
      });
    }

    if (regMajorEl) {
      regMajorEl.addEventListener('change', () => {
        if (regMajorEl.value === 'other') {
          if (regCustomMajorEl) {
            regCustomMajorEl.classList.remove('hidden');
            regCustomMajorEl.focus();
          }
        } else {
          if (regUniversityEl && regUniversityEl.value !== 'other') {
            if (regCustomMajorEl) regCustomMajorEl.classList.add('hidden');
          }
        }
      });
    }

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const messageEl = document.getElementById('registerMessage');

      if (!consentCheckbox || !consentCheckbox.checked) {
        messageEl.className = 'message error';
        messageEl.textContent = 'ท่านต้องยอมรับข้อตกลงความยินยอมข้อมูลส่วนบุคคลเพื่อสมัครสมาชิก';
        return;
      }

      try {
        const regUniValue = (regUniversityEl?.value === 'other')
          ? (regCustomUniversityEl?.value.trim() || 'อื่นๆ')
          : (regUniversityEl?.value || 'มหาวิทยาลัยขอนแก่น');

        let regMajorValue = '';
        if (regUniversityEl?.value === 'other') {
          regMajorValue = regCustomMajorEl?.value.trim() || 'ไม่ระบุ';
        } else if (regMajorEl?.value === 'other') {
          regMajorValue = regCustomMajorEl?.value.trim() || 'อื่นๆ';
        } else {
          regMajorValue = regMajorEl?.value || '';
        }

        const formData = new FormData();
        formData.append('name', document.getElementById('name').value);
        formData.append('email', document.getElementById('email').value);
        formData.append('password', document.getElementById('password').value);
        formData.append('gender', document.getElementById('gender')?.value || 'ชาย');
        formData.append('interested_gender', document.getElementById('interestedGender')?.value || 'ทุกเพศ');
        formData.append('university', regUniValue);
        formData.append('phone', document.getElementById('phone')?.value || '');
        formData.append('nickname', document.getElementById('nickname')?.value || '');
        formData.append('age', document.getElementById('age')?.value || '');
        formData.append('major', regMajorValue);
        formData.append('year', document.getElementById('year')?.value || '');
        formData.append('interests', document.getElementById('interests')?.value || '');
        formData.append('bio', document.getElementById('bio')?.value || '');
        formData.append('google_profile_image', document.getElementById('googleProfileImage')?.value || '');

        const fileInput = document.getElementById('profileImage');
        if (fileInput && fileInput.files.length > 0) {
          formData.append('profile_image_file', fileInput.files[0]);
        }

        const result = await apiRequest('/api/register', {
          method: 'POST',
          body: formData
        });

        messageEl.className = 'message success';
        messageEl.textContent = result.message || 'สมัครสมาชิกสำเร็จ';
        setTimeout(() => window.location.href = '/app', 600);
      } catch (error) {
        messageEl.className = 'message error';
        messageEl.textContent = error.message;
      }
    });
  }

  // ===================== REPORT FORM =====================
  if (reportForm) {
    async function loadReportUsers() {
      try {
        const users = await apiRequest('/api/public/users');
        const select = document.getElementById('reportedUser');
        if (select) {
          select.innerHTML = '<option value="">-- เลือกผู้ใช้งานที่ต้องการรายงาน --</option>' + 
            users.map(u => `<option value="${u.id}">${u.name} (${u.email})${u.major ? ' - ' + u.major : ''}</option>`).join('');
        }
      } catch (e) {
        console.error('Failed to load report users:', e);
      }
    }
    
    async function autoFillSessionInfo() {
      try {
        const session = await apiRequest('/api/session');
        if (session && session.user) {
          const reporterName = document.getElementById('reporterName');
          const reporterEmail = document.getElementById('reporterEmail');
          if (reporterName && !reporterName.value) reporterName.value = session.user.name || '';
          if (reporterEmail && !reporterEmail.value) reporterEmail.value = session.user.email || '';
        }
      } catch (e) { /* ignore */ }
    }

    loadReportUsers();
    autoFillSessionInfo();

    reportForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const messageEl = document.getElementById('reportMessage');
      const submitBtn = reportForm.querySelector('button[type="submit"]');

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ กำลังส่งรายงาน...';
        }

        const formData = new FormData();
        formData.append('reporter_name', document.getElementById('reporterName').value);
        formData.append('reporter_email', document.getElementById('reporterEmail').value);
        formData.append('reported_user', document.getElementById('reportedUser').value);
        formData.append('report_type', document.getElementById('reportType').value);
        formData.append('description', document.getElementById('description').value);

        const fileInput = document.getElementById('evidence');
        if (fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          if (file.size > 5 * 1024 * 1024) {
            messageEl.className = 'message error';
            messageEl.textContent = 'ไฟล์ต้องไม่เกิน 5MB';
            return;
          }
          formData.append('evidence_file', file);
        }

        const result = await apiRequest('/api/reports', {
          method: 'POST',
          body: formData
        });

        messageEl.className = 'message success';
        messageEl.innerHTML = `
          <div>${result.message || 'ส่งรายงานสำเร็จ'}</div>
          <div style="margin-top:10px;">
            <a href="/app" class="button secondary-action" style="display:inline-block; font-weight:600; text-decoration:none;">← กลับสู่แอป MatchSpace</a>
          </div>
        `;
        reportForm.reset();
        autoFillSessionInfo();
      } catch (error) {
        messageEl.className = 'message error';
        messageEl.textContent = error.message;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'ส่งรายงาน';
        }
      }
    });
  }
}

// Auto-run if DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthModule);
} else {
  initAuthModule();
}


// ==================== public/js/admin.js ====================
/**
 * MatchSpace Admin & Owner Management Controller
 * Handles Admin Dashboard, Reports, Activities moderation, System Stats, Login Logs,
 * and User Management with Owner AES-256-GCM password reveal.
 */

function initAdminModule() {
  const reportsTableBody = document.getElementById('reportsTableBody');
  const userTableBody = document.getElementById('userTableBody');
  const activityTableBody = document.getElementById('activityTableBody');
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');

  // ===================== ADMIN DASHBOARD (admin.html) =====================
  if (reportsTableBody && userTableBody) {
    async function loadAdminDashboard() {
      try {
        const [summary, sessionState, users, activities, reports] = await Promise.all([
          apiRequest('/api/admin/summary').catch(() => ({})),
          apiRequest('/api/session').catch(() => ({ user: null })),
          apiRequest('/api/admin/users').catch(() => []),
          apiRequest('/api/admin/activities').catch(() => []),
          apiRequest('/api/reports').catch(() => [])
        ]);

        document.getElementById('totalUsers').textContent = summary.total_users || 0;
        document.getElementById('totalReports').textContent = summary.total_reports || 0;
        document.getElementById('pendingReports').textContent = summary.pending_reports || 0;
        document.getElementById('resolvedReports').textContent = summary.resolved_reports || 0;

        const isOwner = sessionState.user && sessionState.user.role === 'owner';
        const thUserPassOwner = document.getElementById('thUserPassOwner');
        if (thUserPassOwner) {
          thUserPassOwner.style.display = isOwner ? '' : 'none';
        }

        userTableBody.innerHTML = users.map((user) => {
          const userRole = user.role || (user.is_admin ? 'admin' : 'user');
          const isBanned = user.is_active === 0;

          const roleSelectHtml = isOwner ? `
            <div style="display:flex; gap:6px; align-items:center;">
              <select data-role-select-id="${user.id}" style="padding:4px 8px; border-radius:6px; border:1px solid #ccc; font-size:0.82rem;">
                <option value="user" ${userRole === 'user' ? 'selected' : ''}>User (ทั่วไป)</option>
                <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin (ตรวจรายงาน)</option>
                <option value="owner" ${userRole === 'owner' ? 'selected' : ''}>Owner (ผู้ดูแลสูงสุด)</option>
              </select>
              <button class="inline-button review" data-action-save-role="${user.id}" style="padding:4px 10px; font-size:0.78rem;">บันทึก</button>
            </div>
          ` : `<span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>`;

          const resetPasswordTd = isOwner ? `
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <span id="passText-${user.id}" style="font-family:monospace; font-weight:bold; color:var(--purple); background:#f0edff; padding:3px 8px; border-radius:6px; font-size:0.85rem;">••••••••</span>
                <button type="button" class="inline-button review" data-action-toggle-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:4px 8px; font-size:0.78rem;" title="ดู/ซ่อนรหัสผ่าน">👁️ ดูรหัส</button>
                <button type="button" class="inline-button review" data-action-reset-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:4px 8px; font-size:0.78rem;" title="เปลี่ยนรหัสผ่าน">🔑 เปลี่ยน</button>
              </div>
            </td>
          ` : '';

          return `
            <tr>
              <td>${user.id}</td>
              <td>
                <strong>${escapeHtml(user.name)}</strong>
                ${user.nickname && user.nickname !== user.name ? `<span class="skipped-card-nickname" style="font-size:0.76rem; margin-left:6px; vertical-align:middle;">${escapeHtml(user.nickname)}</span>` : ''}
              </td>
              <td>${user.email}</td>
              <td>${user.major || '-'}</td>
              <td><span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span></td>
              <td>${roleSelectHtml}</td>
              ${resetPasswordTd}
              <td>
                <button class="inline-button ${isBanned ? 'resolve' : 'reject'}" data-user-id="${user.id}" data-action="${isBanned ? 'enable' : 'disable'}" style="padding:4px 10px; font-size:0.78rem;">
                  ${isBanned ? '✅ ปลดแบน' : '🚫 แบนผู้ใช้'}
                </button>
              </td>
            </tr>
          `;
        }).join('');

        if (isOwner) {
          document.querySelectorAll('[data-action-toggle-pass]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const userId = btn.dataset.actionTogglePass;
              const passEl = document.getElementById(`passText-${userId}`);
              if (!passEl) return;

              if (passEl.dataset.revealed === 'true') {
                passEl.textContent = '••••••••';
                passEl.dataset.revealed = 'false';
                btn.textContent = '👁️ ดูรหัส';
                return;
              }

              if (passEl.dataset.plain) {
                passEl.textContent = passEl.dataset.plain;
                passEl.dataset.revealed = 'true';
                btn.textContent = '🔒 ซ่อน';
                return;
              }

              const origText = btn.textContent;
              btn.disabled = true;
              btn.textContent = '⏳';
              try {
                const res = await apiRequest(`/api/admin/users/${userId}/reveal-password`, { method: 'POST' });
                const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
                passEl.dataset.plain = pass;
                passEl.textContent = pass;
                passEl.dataset.revealed = 'true';
                btn.textContent = '🔒 ซ่อน';
              } catch (err) {
                alert('ไม่สามารถถอดรหัสผ่านได้: ' + err.message);
                btn.textContent = origText;
              } finally {
                btn.disabled = false;
              }
            });
          });
        }

        document.querySelectorAll('[data-action-save-role]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionSaveRole;
            const selectEl = document.querySelector(`[data-role-select-id="${userId}"]`);
            const newRole = selectEl ? selectEl.value : 'user';
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole })
              });
              alert(res.message);
              loadAdminDashboard();
            } catch (e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            }
          });
        });

        document.querySelectorAll('[data-action-reset-pass]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionResetPass;
            const userEmail = btn.dataset.userEmail;
            const newPassword = prompt(`กรอกรหัสผ่านใหม่สำหรับ ${userEmail}:`);
            if (newPassword && newPassword.trim()) {
              try {
                const res = await apiRequest(`/api/admin/users/${userId}/password`, {
                  method: 'PUT',
                  body: JSON.stringify({ new_password: newPassword.trim() })
                });
                alert(res.message);
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            const action = btn.dataset.action;
            try {
              const result = await apiRequest(`/api/users/${userId}/${action}`, { method: 'PATCH' });
              alert(result.message);
              loadAdminDashboard();
            } catch (error) {
              alert('Error: ' + error.message);
            }
          });
        });

        if (activityTableBody) {
          activityTableBody.innerHTML = activities.map((activity) => `
            <tr>
              <td>${activity.id}</td>
              <td>${activity.name}</td>
              <td>${activity.location || '-'}</td>
              <td>${activity.event_date ? (formatActivityDate(activity.event_date) + (activity.event_time ? ' ' + activity.event_time + ' น.' : '')) : '-'}</td>
              <td>${activity.creator_name || '-'}</td>
              <td>${activity.creator_major || '-'}</td>
              <td>${activity.actual_members || activity.member_count || 0}</td>
              <td><span class="badge ${activity.status}">${activity.status}</span></td>
              <td>
                <div class="actions">
                  <button class="inline-button resolve" data-activity-id="${activity.id}" data-activity-action="approved">Approve</button>
                  <button class="inline-button reject" data-activity-id="${activity.id}" data-activity-action="rejected">Reject (ยุบกลุ่ม)</button>
                  <button class="inline-button reject" data-activity-delete-id="${activity.id}" style="background:#d32f2f;">Delete</button>
                </div>
              </td>
            </tr>
          `).join('');

          document.querySelectorAll('[data-activity-action]').forEach((button) => {
            button.addEventListener('click', async () => {
              const id = button.dataset.activityId;
              const status = button.dataset.activityAction;
              const label = status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธและยุบกลุ่ม';
              try {
                button.disabled = true;
                button.textContent = '⏳ กำลังดำเนินการ...';
                const res = await apiRequest(`/api/admin/activities/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status })
                });
                alert(`✅ ${res.message || label + 'สำเร็จ!'}`);
                loadAdminDashboard();
              } catch (err) {
                button.disabled = false;
                button.textContent = status === 'approved' ? 'Approve' : 'Reject (ยุบกลุ่ม)';
                alert('เกิดข้อผิดพลาด: ' + err.message);
              }
            });
          });

          document.querySelectorAll('[data-activity-delete-id]').forEach((button) => {
            button.addEventListener('click', async () => {
              const id = button.dataset.activityDeleteId;
              if (confirm('คุณต้องการลบกิจกรรมนี้ออกจากระบบและยุบแชทกลุ่มใช่หรือไม่?')) {
                try {
                  button.disabled = true;
                  button.textContent = '⏳ กำลังลบ...';
                  const res = await apiRequest(`/api/admin/activities/${id}`, { method: 'DELETE' });
                  alert(`✅ ${res.message || 'ลบกิจกรรมและยุบแชทกลุ่มสำเร็จ'}`);
                  loadAdminDashboard();
                } catch (err) {
                  button.disabled = false;
                  button.textContent = 'Delete';
                  alert('เกิดข้อผิดพลาด: ' + err.message);
                }
              }
            });
          });
        }

        reportsTableBody.innerHTML = reports.map((report) => {
          const evidenceHtml = report.evidence_file
            ? `<a href="${report.evidence_file}" target="_blank" title="คลิกเปิดรูปขนาดเต็ม">
                 <img src="${report.evidence_file}" style="width:55px; height:55px; object-fit:cover; border-radius:8px; border:1px solid #ccc; cursor:pointer;" alt="หลักฐาน" />
               </a>`
            : '<span style="color:#aaa; font-size:0.85rem;">ไม่มี</span>';

          const targetName = report.target_user_name || report.reported_user;
          const isBanned = report.target_user_active === 0;
          const targetUserId = report.target_user_id;

          let reportedUserHtml = `<div><strong>${targetName}</strong></div>`;
          if (report.target_user_email) {
            reportedUserHtml += `<small style="color:#777;">${report.target_user_email}</small>`;
          }
          if (isBanned) {
            reportedUserHtml += `<div><span class="badge rejected" style="font-size:0.75rem; margin-top:2px;">ถูกแบนแล้ว</span></div>`;
          }

          let actionButtonsHtml = `
            <div class="actions">
              <button class="inline-button review" data-status-btn-id="${report.id}" data-status="reviewed">Review</button>
              <button class="inline-button resolve" data-status-btn-id="${report.id}" data-status="resolved">Resolve</button>
              <button class="inline-button reject" data-status-btn-id="${report.id}" data-status="rejected">Reject</button>
            </div>
            <div class="actions" style="margin-top:6px; gap:4px;">
              ${targetUserId && !report.target_user_is_admin ? (
                isBanned
                  ? `<button class="inline-button resolve" data-action-unban-user="${targetUserId}" data-report-id="${report.id}">✅ ยกเลิกแบน</button>`
                  : `<button class="inline-button reject" data-action-ban-user="${targetUserId}" data-report-id="${report.id}">🚫 แบนผู้ใช้</button>`
              ) : ''}
              <button class="inline-button review" data-action-warn-user="${report.id}" data-target-name="${targetName}" data-target-user-id="${targetUserId || ''}">⚠️ ส่งเตือน</button>
            </div>
          `;

          return `
            <tr>
              <td>${report.id}</td>
              <td>${report.reporter_name}<br><small>${report.reporter_email}</small></td>
              <td>${reportedUserHtml}</td>
              <td>${report.report_type}</td>
              <td>${report.description}</td>
              <td>${evidenceHtml}</td>
              <td><span class="badge ${report.status}">${report.status}</span></td>
              <td>
                ${actionButtonsHtml}
                <div style="margin-top:8px;">
                  <textarea data-note-id="${report.id}" rows="2" placeholder="Note for reviewer">${report.admin_note || ''}</textarea>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        document.querySelectorAll('[data-status-btn-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            const id = button.dataset.statusBtnId;
            const status = button.dataset.status;
            const note = document.querySelector(`[data-note-id="${id}"]`)?.value || '';
            await apiRequest(`/api/admin/reports/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status, admin_note: note })
            });
            loadAdminDashboard();
          });
        });

        document.querySelectorAll('[data-action-ban-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionBanUser;
            const reportId = btn.dataset.reportId;
            if (confirm('คุณต้องการแบนผู้ใช้งานคนนี้ใช่หรือไม่?')) {
              try {
                await apiRequest(`/api/users/${userId}/disable`, { method: 'PATCH' });
                await apiRequest(`/api/admin/reports/${reportId}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'resolved', admin_note: 'แบนผู้ใช้งานเรียบร้อยแล้ว' })
                });
                alert('แบนผู้ใช้งานสำเร็จ');
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action-unban-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionUnbanUser;
            if (confirm('คุณต้องการปลดแบนผู้ใช้งานคนนี้ใช่หรือไม่?')) {
              try {
                await apiRequest(`/api/users/${userId}/enable`, { method: 'PATCH' });
                alert('ปลดแบนผู้ใช้งานสำเร็จ');
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action-warn-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const reportId = btn.dataset.actionWarnUser;
            const targetName = btn.dataset.targetName;
            const targetUserId = btn.dataset.targetUserId;
            const msg = prompt(`ระบุข้อความตักเตือนที่จะส่งถึง ${targetName}:`, 'กรุณาปฏิบัติตามกฎกติกามารยาทของการใช้งาน MatchSpace');
            if (msg && msg.trim()) {
              try {
                btn.disabled = true;
                const res = await apiRequest(`/api/admin/reports/${reportId}/warn`, {
                  method: 'POST',
                  body: JSON.stringify({ warning_message: msg, target_user_id: targetUserId ? Number(targetUserId) : null })
                });
                alert('✅ ' + res.message);
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              } finally {
                btn.disabled = false;
              }
            }
          });
        });

        await loadSystemStats();
        await loadLoginLogs();

        const refreshStatsBtn = document.getElementById('refreshSystemStatsBtn');
        if (refreshStatsBtn && !refreshStatsBtn.dataset.bound) {
          refreshStatsBtn.dataset.bound = 'true';
          refreshStatsBtn.addEventListener('click', () => {
            loadSystemStats();
          });
        }

        const searchInput = document.getElementById('loginLogsSearchInput');
        if (searchInput && !searchInput.dataset.bound) {
          searchInput.dataset.bound = 'true';
          let timeout = null;
          searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
              loadLoginLogs(searchInput.value);
            }, 300);
          });
        }

        const refreshLogsBtn = document.getElementById('refreshLoginLogsBtn');
        if (refreshLogsBtn && !refreshLogsBtn.dataset.bound) {
          refreshLogsBtn.dataset.bound = 'true';
          refreshLogsBtn.addEventListener('click', () => {
            const q = searchInput ? searchInput.value : '';
            loadLoginLogs(q);
          });
        }
      } catch (error) {
        if (reportsTableBody) {
          reportsTableBody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
        }
      }
    }

    async function loadLoginLogs(searchQuery = '') {
      const tableBody = document.getElementById('loginLogsTableBody');
      if (!tableBody) return;

      try {
        const url = searchQuery ? `/api/admin/login-logs?q=${encodeURIComponent(searchQuery)}` : '/api/admin/login-logs';
        const logs = await apiRequest(url);

        tableBody.innerHTML = logs.length
          ? logs.map(log => {
              const isSuccess = log.status === 'success';
              const statusHtml = isSuccess
                ? '<span class="status-badge-success">✅ สำเร็จ</span>'
                : `<span class="status-badge-failed">❌ ${log.status || 'ล้มเหลว'}</span>`;

              return `
                <tr>
                  <td style="color:var(--muted); font-size:0.84rem;">${log.created_at || '-'}</td>
                  <td><strong>${log.email}</strong></td>
                  <td><span class="ip-pill">${log.ip || '127.0.0.1'}</span></td>
                  <td>${log.device || '💻 Google Chrome (Windows 10/11)'}</td>
                  <td><span class="action-text">${log.action || 'Login'}</span></td>
                  <td>${log.details || 'เข้าสู่ระบบ'}</td>
                  <td>${statusHtml}</td>
                </tr>
              `;
            }).join('')
          : '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--muted);">ไม่พบข้อมูลบันทึกประวัติการเข้าใช้งาน</td></tr>';
      } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#d32f2f;">${err.message}</td></tr>`;
      }
    }

    async function loadSystemStats() {
      const cpuText = document.getElementById('cpuUsageText');
      const memoryText = document.getElementById('memoryUsageText');
      const dbTypeText = document.getElementById('databaseTypeText');
      const apiLatencyText = document.getElementById('apiResponseTimeText');
      const auditTerminal = document.getElementById('auditLogTerminal');

      if (!cpuText) return;

      try {
        const stats = await apiRequest('/api/admin/system-stats');
        cpuText.textContent = stats.cpu_usage;
        memoryText.textContent = stats.memory_usage;
        dbTypeText.textContent = stats.database_type;
        apiLatencyText.textContent = stats.api_response_time;

        if (auditTerminal && Array.isArray(stats.audit_logs)) {
          auditTerminal.innerHTML = stats.audit_logs.length
            ? stats.audit_logs.map(log => `
                <div class="audit-log-line">
                  <span class="audit-log-time">[${log.created_at || 'NOW'}]</span>
                  <span class="audit-log-level ${log.level || 'INFO'}">[${log.level || 'INFO'}]</span>
                  <span>${log.message}</span>
                </div>
              `).join('')
            : '<div class="audit-log-line">ไม่มีบันทึก Audit Logs</div>';
          auditTerminal.scrollTop = 0;
        }
      } catch (err) {
        if (auditTerminal) {
          auditTerminal.innerHTML = `<div class="audit-log-line" style="color:#f38ba8;">[ERROR] Failed to fetch system stats: ${err.message}</div>`;
        }
      }
    }

    loadAdminDashboard();
  }

  // ===================== ADMIN USERS MANAGEMENT (admin-users.html) =====================
  if (adminUsersTableBody) {
    let allAdminUsers = [];
    const searchInput = document.getElementById('userSearchInput');
    const filterGender = document.getElementById('filterGender');
    const filterRole = document.getElementById('filterRole');
    const filterStatus = document.getElementById('filterStatus');
    const btnRefresh = document.getElementById('btnRefreshUsers');
    const modal = document.getElementById('userDetailModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalBody = document.getElementById('modalUserContent');
    const modalTitle = document.getElementById('modalUserName');
    const logoutBtn = document.getElementById('logoutButton');

    let currentUserSession = null;

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiRequest('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }

    if (modalCloseBtn && modal) {
      modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }

    async function loadAdminUsers() {
      try {
        const session = await apiRequest('/api/session');
        if (!session.user || (!session.user.is_admin && session.user.role !== 'admin' && session.user.role !== 'owner')) {
          window.location.href = '/';
          return;
        }
        currentUserSession = session.user;

        allAdminUsers = await apiRequest('/api/users');
        updateUserStats(allAdminUsers);
        renderFilteredUsers();
      } catch (err) {
        adminUsersTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--danger); padding:20px;">⚠️ ${escapeHtml(err.message || 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้')}</td></tr>`;
      }
    }

    function updateUserStats(users) {
      const total = users.length;
      let male = 0, female = 0, lgbtq = 0, active = 0, banned = 0;
      for (const u of users) {
        if (u.gender === 'ชาย') male++;
        else if (u.gender === 'หญิง') female++;
        else if (u.gender === 'เพศหลากหลาย') lgbtq++;

        if (u.is_active === 0) banned++;
        else active++;
      }

      const totalEl = document.getElementById('countTotalUsers');
      if (totalEl) totalEl.textContent = total;
      const maleEl = document.getElementById('countMaleUsers');
      if (maleEl) maleEl.textContent = male;
      const femaleEl = document.getElementById('countFemaleUsers');
      if (femaleEl) femaleEl.textContent = female;
      const lgbtqEl = document.getElementById('countLgbtqUsers');
      if (lgbtqEl) lgbtqEl.textContent = lgbtq;
      const activeEl = document.getElementById('countActiveUsers');
      if (activeEl) activeEl.textContent = active;
      const bannedEl = document.getElementById('countBannedUsers');
      if (bannedEl) bannedEl.textContent = banned;
    }

    function renderFilteredUsers() {
      const q = (searchInput?.value || '').toLowerCase().trim();
      const genderFilter = filterGender?.value || '';
      const roleFilter = filterRole?.value || '';
      const statusFilter = filterStatus?.value || '';

      const filtered = allAdminUsers.filter(u => {
        if (genderFilter && u.gender !== genderFilter) return false;
        if (roleFilter && (u.role || (u.is_admin ? 'admin' : 'user')) !== roleFilter) return false;
        if (statusFilter === 'active' && u.is_active === 0) return false;
        if (statusFilter === 'banned' && u.is_active !== 0) return false;
        if (q) {
          const matchName = (u.name || '').toLowerCase().includes(q);
          const matchEmail = (u.email || '').toLowerCase().includes(q);
          const matchPhone = (u.phone || '').toLowerCase().includes(q);
          const matchNick = (u.nickname || '').toLowerCase().includes(q);
          const matchMajor = (u.major || '').toLowerCase().includes(q);
          const matchInterests = (u.interests || '').toLowerCase().includes(q);
          if (!matchName && !matchEmail && !matchPhone && !matchNick && !matchMajor && !matchInterests) return false;
        }
        return true;
      });

      const countEl = document.getElementById('userCountDisplay');
      if (countEl) countEl.textContent = filtered.length;

      if (!filtered.length) {
        adminUsersTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--muted);">ไม่พบข้อมูลผู้ใช้ที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
        return;
      }

      const isOwner = currentUserSession && currentUserSession.role === 'owner';
      const thAdminUserPass = document.getElementById('thAdminUserPass');
      if (thAdminUserPass) {
        thAdminUserPass.style.display = isOwner ? '' : 'none';
      }

      adminUsersTableBody.innerHTML = filtered.map(user => {
        const userRole = user.role || (user.is_admin ? 'admin' : 'user');
        const isBanned = user.is_active === 0;
        const avatarImg = user.profile_image
          ? `<img src="${escapeHtml(user.profile_image)}" class="user-table-avatar" alt="${escapeHtml(user.name)}" data-view-detail-id="${user.id}" />`
          : `<div class="user-table-avatar-initial" data-view-detail-id="${user.id}">${escapeHtml((user.name || 'U').charAt(0))}</div>`;

        const resetPasswordTd = isOwner ? `
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:4px;">
                <span id="uPassText-${user.id}" style="font-family:monospace; font-weight:bold; color:var(--purple); background:#f0edff; padding:2px 6px; border-radius:4px; font-size:0.8rem;">••••••••</span>
                <button type="button" class="inline-button review" data-uaction-toggle-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:2px 6px; font-size:0.75rem;" title="ดู/ซ่อนรหัสผ่าน">👁️</button>
              </div>
              <button type="button" class="inline-button review" data-uaction-reset-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:2px 6px; font-size:0.75rem;">🔑 เปลี่ยนรหัส</button>
            </div>
          </td>
        ` : '';

        const roleSelectHtml = isOwner ? `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <select data-urole-select-id="${user.id}" style="padding:3px 6px; border-radius:6px; border:1px solid #ccc; font-size:0.8rem;">
              <option value="user" ${userRole === 'user' ? 'selected' : ''}>User (ทั่วไป)</option>
              <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแล)</option>
              <option value="owner" ${userRole === 'owner' ? 'selected' : ''}>Owner (ผู้ดูแลสูงสุด)</option>
            </select>
            <button class="inline-button review" data-uaction-save-role="${user.id}" style="padding:2px 6px; font-size:0.75rem;">บันทึกสิทธิ์</button>
          </div>
        ` : `<span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>`;

        const interestsList = (user.interests || '').split(',').map(s => s.trim()).filter(Boolean);
        const interestsHtml = interestsList.length
          ? interestsList.slice(0, 3).map(t => `<span class="interest-tag-pill">${escapeHtml(t)}</span>`).join('') + (interestsList.length > 3 ? `<span class="interest-tag-pill">+${interestsList.length - 3}</span>` : '')
          : '<span style="color:#bbb; font-size:0.75rem;">-</span>';

        return `
          <tr>
            <td>
              <div class="user-profile-cell">
                ${avatarImg}
                <div>
                  <div class="user-name-title">
                    <span style="cursor:pointer;" data-view-detail-id="${user.id}">${escapeHtml(user.name)}</span>
                    <span class="user-id-badge">#${user.id}</span>
                  </div>
                  ${user.nickname ? `<div class="user-nickname-pill">ชื่อเล่น: ${escapeHtml(user.nickname)}</div>` : ''}
                </div>
              </div>
            </td>
            <td>
              <div class="user-contact-email">${escapeHtml(user.email)}</div>
              ${user.phone ? `<div class="user-contact-phone">📞 ${escapeHtml(user.phone)}</div>` : '<div style="color:#bbb; font-size:0.75rem;">ไม่มีเบอร์</div>'}
            </td>
            <td>
              <div><strong>${escapeHtml(user.gender || 'ไม่ระบุ')}</strong></div>
              <div style="font-size:0.8rem; color:var(--muted);">${user.age ? user.age + ' ปี' : 'ไม่ระบุอายุ'} • ${escapeHtml(user.year || '-')}</div>
            </td>
            <td>
              <div style="font-weight:600; color:var(--purple-dark); font-size:0.86rem;">${escapeHtml(user.major || '-')}</div>
              ${user.university ? `<div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">🏫 ${escapeHtml(user.university)}</div>` : ''}
            </td>
            <td>
              <div>${interestsHtml}</div>
              ${user.bio ? `<div class="bio-snippet" title="${escapeHtml(user.bio)}">${escapeHtml(user.bio)}</div>` : ''}
            </td>
            ${resetPasswordTd}
            <td>${roleSelectHtml}</td>
            <td>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button class="inline-button ${isBanned ? 'resolve' : 'reject'}" data-uaction-ban="${user.id}" data-action="${isBanned ? 'enable' : 'disable'}" style="padding:4px 8px; font-size:0.78rem;">
                  ${isBanned ? '✅ ปลดแบน' : '🚫 แบนผู้ใช้'}
                </button>
                <button class="inline-button review" data-view-detail-id="${user.id}" style="padding:4px 8px; font-size:0.78rem; background:#6366f1; color:white;">
                  🔍 ดูข้อมูลเต็ม
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      attachUserTableEvents();
    }

    function attachUserTableEvents() {
      const isOwner = currentUserSession && currentUserSession.role === 'owner';
      if (isOwner) {
        adminUsersTableBody.querySelectorAll('[data-uaction-toggle-pass]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.uactionTogglePass;
            const passEl = document.getElementById(`uPassText-${userId}`);
            if (!passEl) return;

            if (passEl.dataset.revealed === 'true') {
              passEl.textContent = '••••••••';
              passEl.dataset.revealed = 'false';
              btn.textContent = '👁️';
              return;
            }

            if (passEl.dataset.plain) {
              passEl.textContent = passEl.dataset.plain;
              passEl.dataset.revealed = 'true';
              btn.textContent = '🔒';
              return;
            }

            btn.disabled = true;
            btn.textContent = '⏳';
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/reveal-password`, { method: 'POST' });
              const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
              passEl.dataset.plain = pass;
              passEl.textContent = pass;
              passEl.dataset.revealed = 'true';
              btn.textContent = '🔒';
            } catch (e) {
              alert('ไม่สามารถถอดรหัสผ่านได้: ' + e.message);
              btn.textContent = '👁️';
            } finally {
              btn.disabled = false;
            }
          });
        });
      }

      // Reset password
      adminUsersTableBody.querySelectorAll('[data-uaction-reset-pass]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionResetPass;
          const userEmail = btn.dataset.userEmail;
          const newPassword = prompt(`กรอกรหัสผ่านใหม่สำหรับ ${userEmail}:`);
          if (newPassword && newPassword.trim()) {
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/password`, {
                method: 'PUT',
                body: JSON.stringify({ new_password: newPassword.trim() })
              });
              alert(res.message);
              await loadAdminUsers();
            } catch(e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            }
          }
        });
      });

      // Save role
      adminUsersTableBody.querySelectorAll('[data-uaction-save-role]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionSaveRole;
          const selectEl = document.querySelector(`[data-urole-select-id="${userId}"]`);
          const newRole = selectEl ? selectEl.value : 'user';
          try {
            const res = await apiRequest(`/api/admin/users/${userId}/role`, {
              method: 'PUT',
              body: JSON.stringify({ role: newRole })
            });
            alert(res.message);
            await loadAdminUsers();
          } catch(e) {
            alert('เกิดข้อผิดพลาด: ' + e.message);
          }
        });
      });

      // Ban / Unban
      adminUsersTableBody.querySelectorAll('[data-uaction-ban]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionBan;
          const action = btn.dataset.action;
          try {
            const res = await apiRequest(`/api/users/${userId}/${action}`, { method: 'PATCH' });
            alert(res.message);
            await loadAdminUsers();
          } catch(e) {
            alert('เกิดข้อผิดพลาด: ' + e.message);
          }
        });
      });

      // View Detail Modal
      adminUsersTableBody.querySelectorAll('[data-view-detail-id]').forEach(el => {
        el.addEventListener('click', () => {
          const userId = Number(el.dataset.viewDetailId);
          const user = allAdminUsers.find(u => Number(u.id) === userId);
          if (user) openUserDetailModal(user);
        });
      });
    }

    function openUserDetailModal(user) {
      if (!modal || !modalBody) return;
      if (modalTitle) modalTitle.textContent = `ข้อมูลการสมัครสมาชิก: ${user.name} (#${user.id})`;

      const avatarSrc = user.profile_image
        ? `<img src="${escapeHtml(user.profile_image)}" class="modal-main-avatar" alt="${escapeHtml(user.name)}" />`
        : `<div class="modal-main-avatar-initial">${escapeHtml((user.name || 'U').charAt(0))}</div>`;

      const photos = user.photos && user.photos.length ? user.photos : (user.profile_image ? [user.profile_image] : []);
      const photosGridHtml = photos.length
        ? `
          <div style="margin-top:14px;">
            <div class="info-field-label">📸 รูปภาพทั้งหมด (${photos.length} รูป):</div>
            <div class="user-gallery-grid">
              ${photos.map(p => `
                <a href="${escapeHtml(p)}" target="_blank" title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <img src="${escapeHtml(p)}" class="gallery-thumb" alt="Photo" />
                </a>
              `).join('')}
            </div>
          </div>
        `
        : '<div style="color:var(--muted); font-size:0.85rem; margin:8px 0;">ไม่มีรูปภาพเพิ่มเติม</div>';

      const interestsList = (user.interests || '').split(',').map(s => s.trim()).filter(Boolean);
      const interestsTagsHtml = interestsList.length
        ? interestsList.map(t => `<span class="interest-tag-pill" style="font-size:0.85rem; padding:4px 10px;">${escapeHtml(t)}</span>`).join(' ')
        : '<span style="color:var(--muted);">-</span>';

      const userRole = user.role || (user.is_admin ? 'admin' : 'user');
      const isBanned = user.is_active === 0;
      const isOwner = currentUserSession && currentUserSession.role === 'owner';

      modalBody.innerHTML = `
        <div class="user-detail-header-card">
          ${avatarSrc}
          <div style="flex:1;">
            <h3 style="margin:0 0 4px; color:var(--purple-dark); font-size:1.25rem;">
              ${escapeHtml(user.name)} ${user.nickname ? `(${escapeHtml(user.nickname)})` : ''}
            </h3>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px;">
              <span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>
              <span class="badge ${isBanned ? 'reject' : 'resolve'}">${isBanned ? '🚫 ถูกระงับ' : '✅ ใช้งานปกติ'}</span>
              <span class="user-id-badge" style="font-size:0.8rem;">ID: ${user.id}</span>
            </div>
          </div>
        </div>

        <div class="user-info-grid-2col">
          <div class="info-field-card">
            <div class="info-field-label">📧 อีเมล (Email)</div>
            <div class="info-field-value">${escapeHtml(user.email)}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">📞 เบอร์โทรศัพท์ (Phone)</div>
            <div class="info-field-value" style="color:#059669; font-weight:700;">${escapeHtml(user.phone || 'ไม่ระบุ')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">👤 ชื่อเล่น & เพศ</div>
            <div class="info-field-value">${escapeHtml(user.nickname || '-')} (${escapeHtml(user.gender || 'ไม่ระบุ')})</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🎂 อายุ & ชั้นปี</div>
            <div class="info-field-value">${user.age ? user.age + ' ปี' : 'ไม่ระบุ'} • ${escapeHtml(user.year || 'ไม่ระบุชั้นปี')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🏫 มหาวิทยาลัย (University)</div>
            <div class="info-field-value" style="color:var(--purple); font-weight:600;">${escapeHtml(user.university || 'มหาวิทยาลัยขอนแก่น')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🎓 คณะ / สาขา (Faculty / Major)</div>
            <div class="info-field-value" style="font-weight:600;">${escapeHtml(user.major || 'ไม่ระบุ')}</div>
          </div>
          <div class="info-field-card" style="grid-column: 1 / -1;">
            <div class="info-field-label">💡 ความสนใจ (Interests)</div>
            <div class="info-field-value" style="margin-top:4px;">${interestsTagsHtml}</div>
          </div>
          <div class="info-field-card" style="grid-column: 1 / -1;">
            <div class="info-field-label">📝 ประวัติโดยย่อ (Bio)</div>
            <div class="info-field-value" style="font-weight:normal; line-height:1.5;">${escapeHtml(user.bio || 'ไม่มีข้อมูล')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🕒 วันที่ลงทะเบียน</div>
            <div class="info-field-value" style="font-size:0.85rem;">${escapeHtml(user.created_at || '-')}</div>
          </div>
          ${isOwner ? `
            <div class="info-field-card">
              <div class="info-field-label">🔐 รหัสผ่าน (Owner)</div>
              <div class="info-field-value" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <span id="modalPassText-${user.id}" style="font-family:monospace; color:var(--purple); font-weight:bold;">••••••••</span>
                <button type="button" class="inline-button review" id="btnModalRevealPass-${user.id}" style="padding:2px 8px; font-size:0.75rem;">👁️ ดูรหัส</button>
              </div>
            </div>
          ` : ''}
        </div>

        ${photosGridHtml}
      `;

      modal.classList.remove('hidden');

      if (isOwner) {
        const btnModalReveal = document.getElementById(`btnModalRevealPass-${user.id}`);
        const modalPassEl = document.getElementById(`modalPassText-${user.id}`);
        if (btnModalReveal && modalPassEl) {
          btnModalReveal.addEventListener('click', async () => {
            if (modalPassEl.dataset.revealed === 'true') {
              modalPassEl.textContent = '••••••••';
              modalPassEl.dataset.revealed = 'false';
              btnModalReveal.textContent = '👁️ ดูรหัส';
              return;
            }
            if (modalPassEl.dataset.plain) {
              modalPassEl.textContent = modalPassEl.dataset.plain;
              modalPassEl.dataset.revealed = 'true';
              btnModalReveal.textContent = '🔒 ซ่อน';
              return;
            }
            btnModalReveal.disabled = true;
            btnModalReveal.textContent = '⏳';
            try {
              const res = await apiRequest(`/api/admin/users/${user.id}/reveal-password`, { method: 'POST' });
              const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
              modalPassEl.dataset.plain = pass;
              modalPassEl.textContent = pass;
              modalPassEl.dataset.revealed = 'true';
              btnModalReveal.textContent = '🔒 ซ่อน';
            } catch (e) {
              alert('ไม่สามารถถอดรหัสผ่านได้: ' + e.message);
              btnModalReveal.textContent = '👁️ ดูรหัส';
            } finally {
              btnModalReveal.disabled = false;
            }
          });
        }
      }
    }

    if (searchInput) searchInput.addEventListener('input', renderFilteredUsers);
    if (filterGender) filterGender.addEventListener('change', renderFilteredUsers);
    if (filterRole) filterRole.addEventListener('change', renderFilteredUsers);
    if (filterStatus) filterStatus.addEventListener('change', renderFilteredUsers);
    if (btnRefresh) btnRefresh.addEventListener('click', loadAdminUsers);

    loadAdminUsers();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminModule);
} else {
  initAdminModule();
}


// ==================== public/js/chat.js ====================
/**
 * MatchSpace Real-Time Chat Controller
 * Powered by WebSockets - replaces HTTP polling with zero lag and instant messaging.
 */

window.matchSpaceChat = (function () {
  let currentChatId = null;
  let currentUser = null;
  let allLoadedChats = [];
  let typingTimeout = null;
  let isCurrentlyTyping = false;

  const chatList = document.getElementById('chatList');
  const messageThread = document.getElementById('messageThread');
  const messageInput = document.getElementById('messageInput');
  const sendMessageBtn = document.getElementById('sendMessageBtn');
  const searchInput = document.getElementById('chatSearchInput');
  const mobileBackBtn = document.getElementById('chatMobileBackBtn');
  const closeGreetingsBtn = document.getElementById('btnCloseGreetings');
  const chatLayout = document.getElementById('chatLayoutContainer');

  function initChat(user) {
    currentUser = user;
    if (!chatList || !messageThread) return;

    // Connect WebSocket if not already connected
    if (window.matchSpaceWS && currentUser?.id) {
      window.matchSpaceWS.connect(currentUser.id);
      setupWebSocketListeners();
    }

    setupChatEventListeners();
  }

  function setupWebSocketListeners() {
    const ws = window.matchSpaceWS;
    if (!ws) return;

    // Real-time new message incoming
    ws.on('new_message', (data) => {
      if (data.chatId === currentChatId && data.message) {
        appendIncomingMessage(data.message);
      }
      updateChatSnippet(data.chatId, data.message);
    });

    // Real-time message deletion
    ws.on('delete_message', (data) => {
      if (data.chatId === currentChatId && data.messageId) {
        const msgEl = document.querySelector(`[data-msg-item-id="${data.messageId}"]`);
        if (msgEl) {
          msgEl.style.transition = 'all 0.25s ease';
          msgEl.style.opacity = '0';
          msgEl.style.transform = 'scale(0.9)';
          setTimeout(() => msgEl.remove(), 250);
        }
      }
      loadChats();
    });

    // Typing indicator
    ws.on('typing', (data) => {
      if (data.chatId === currentChatId && Number(data.userId) !== Number(currentUser?.id)) {
        showTypingIndicator(data.userName || 'คู่สนทนา');
      }
    });

    // Stop typing
    ws.on('stop_typing', (data) => {
      if (data.chatId === currentChatId) {
        hideTypingIndicator();
      }
    });

    // Mutual match event -> update chats and show notification
    ws.on('mutual_match', () => {
      loadChats();
    });
  }

  function showTypingIndicator(userName) {
    const subHeader = document.getElementById('chatSubHeader');
    if (subHeader) {
      subHeader.innerHTML = `<span class="header-status-typing"><span class="status-pulse-dot"></span> <em>${escapeHtml(userName)} กำลังพิมพ์...</em></span>`;
    }
  }

  function hideTypingIndicator() {
    const subHeader = document.getElementById('chatSubHeader');
    if (subHeader) {
      subHeader.innerHTML = `<span class="header-status-online"><span class="status-pulse-dot"></span> พร้อมสนทนา</span>`;
    }
  }

  function appendIncomingMessage(msg) {
    if (!messageThread) return;
    const emptyPlaceholder = messageThread.querySelector('.chat-empty-placeholder');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    // Check if message already rendered (prevent duplicate on self-send)
    if (messageThread.querySelector(`[data-msg-item-id="${msg.id}"]`)) return;

    const isMe = Number(msg.sender_id) === Number(currentUser?.id);
    const isOwner = currentUser && currentUser.role === 'owner';
    const canDelete = isMe || isOwner;
    const timeStr = formatChatTime(msg.created_at);

    const deleteBtnHtml = canDelete ? `<button type="button" class="btn-delete-msg" data-msg-id="${msg.id}" title="ลบข้อความ"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';

    const wrapper = document.createElement('div');
    wrapper.dataset.msgItemId = msg.id;

    if (isMe) {
      wrapper.className = 'msg-wrapper me fade-in';
      wrapper.innerHTML = `
        <div class="msg-content-col">
          <div class="bubble me">
            <div class="bubble-text">${escapeHtml(msg.content)}</div>
            <div class="bubble-meta">
              <span class="msg-time me-time">${timeStr}</span>
              ${deleteBtnHtml}
            </div>
          </div>
        </div>
      `;
    } else {
      wrapper.className = 'msg-wrapper them fade-in';
      const senderAvatar = msg.sender_profile_image
        ? `<img src="${escapeHtml(msg.sender_profile_image)}" class="chat-msg-avatar" alt="${escapeHtml(msg.sender_name || '')}" />`
        : `<div class="chat-msg-avatar-initial">${escapeHtml((msg.sender_name || 'U').charAt(0).toUpperCase())}</div>`;

      wrapper.innerHTML = `
        <div class="msg-avatar-col">${senderAvatar}</div>
        <div class="msg-content-col">
          <div class="msg-sender-name"><span>${escapeHtml(msg.sender_name || 'สมาชิก')}</span></div>
          <div class="bubble them">
            <div class="bubble-text">${escapeHtml(msg.content)}</div>
            <div class="bubble-meta">
              <span class="msg-time">${timeStr}</span>
              ${deleteBtnHtml}
            </div>
          </div>
        </div>
      `;
    }

    // Attach delete handler
    const delBtn = wrapper.querySelector('.btn-delete-msg');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('คุณต้องการลบข้อความนี้ใช่หรือไม่?')) {
          try {
            await apiRequest(`/api/chats/${currentChatId}/messages/${msg.id}`, { method: 'DELETE' });
            wrapper.remove();
          } catch(err) {
            alert(err.message);
          }
        }
      });
    }

    messageThread.appendChild(wrapper);
    messageThread.scrollTop = messageThread.scrollHeight;
    hideTypingIndicator();
  }

  function updateChatSnippet(chatId, message) {
    const chat = allLoadedChats.find(c => Number(c.id) === Number(chatId));
    if (chat && message) {
      chat.last_message = message.content;
      chat.last_message_time = message.created_at;
      filterAndRenderChats();
    } else {
      loadChats();
    }
  }

  function renderChatsList(chats) {
    if (!chatList) return;
    chatList.innerHTML = chats.length
      ? chats.map((chat) => {
          const isGroup = chat.type === 'group' || chat.activity_id;
          const badge = isGroup ? '<span class="chat-badge-group">กลุ่ม</span>' : '';
          const timeStr = formatChatTime(chat.last_message_time);
          const isActive = chat.id === currentChatId;

          const avatarHtml = isGroup
            ? `<div class="chat-list-avatar group">👥</div>`
            : (chat.partner_profile_image
                ? `<img src="${escapeHtml(chat.partner_profile_image)}" class="chat-list-avatar" alt="${escapeHtml(chat.partner_name || '')}" />`
                : `<div class="chat-list-avatar initial">${escapeHtml((chat.partner_name || 'U').charAt(0).toUpperCase())}</div>`);

          return `
            <div class="chat-list-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
              <div class="chat-list-avatar-wrap">
                ${avatarHtml}
                ${!isGroup ? '<span class="chat-online-dot" title="พร้อมคุย"></span>' : ''}
              </div>
              <div class="chat-list-info">
                <div class="chat-list-top">
                  <div class="chat-list-title">
                    <span class="chat-list-title-text">${escapeHtml(chat.partner_name || (isGroup ? 'แชทกลุ่ม' : 'แชท'))}</span>
                    ${badge}
                  </div>
                  ${timeStr ? `<span class="chat-list-time">${timeStr}</span>` : ''}
                </div>
                <div class="chat-list-preview">
                  ${escapeHtml(chat.last_message || 'ยังไม่มีข้อความ เริ่มต้นคุยกันได้เลย')}
                </div>
              </div>
            </div>
          `;
        }).join('')
      : '<div class="chat-empty-list"><div style="font-size:1.6rem; margin-bottom:6px;">💬</div>ยังไม่มีการสนทนาในขณะนี้</div>';

    chatList.querySelectorAll('[data-chat-id]').forEach((item) => {
      item.addEventListener('click', async () => {
        const chatId = Number(item.dataset.chatId);
        currentChatId = chatId;
        if (chatLayout) chatLayout.classList.add('chat-open');
        filterAndRenderChats();
        await loadMessages(chatId);
      });
    });
  }

  function filterAndRenderChats() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    let list = allLoadedChats;
    if (query) {
      list = allLoadedChats.filter(c => {
        const name = (c.partner_name || c.title || c.activity_name || '').toLowerCase();
        const lastMsg = (c.last_message || '').toLowerCase();
        return name.includes(query) || lastMsg.includes(query);
      });
    }
    renderChatsList(list);
  }

  async function loadChats() {
    try {
      const chats = await apiRequest('/api/chats');
      allLoadedChats = chats;
      const countEl = document.getElementById('chatTotalCountBadge');
      if (countEl) countEl.textContent = chats.length;
      if (window.matchSpaceApp?.updateHomeStats) {
        window.matchSpaceApp.updateHomeStats();
      }
      filterAndRenderChats();
      return chats;
    } catch (e) {
      return [];
    }
  }

  function renderMessageList(data) {
    const titleHeader = document.getElementById('chatTitleHeader');
    const subHeader = document.getElementById('chatSubHeader');
    const headerAvatarWrap = document.getElementById('chatActiveAvatarWrap');
    const headerActions = document.getElementById('chatHeaderActions');
    const isGroup = data.chat.type === 'group' || data.chat.activity_id;

    if (titleHeader) {
      titleHeader.textContent = isGroup ? `👥 ${data.chat.title || data.chat.activity_name || 'แชทกลุ่ม'}` : (data.chat.partner_name || 'ข้อความ');
    }

    if (headerAvatarWrap) {
      if (isGroup) {
        headerAvatarWrap.innerHTML = `<div class="chat-room-header-avatar group">👥</div>`;
      } else if (data.chat.partner_profile_image) {
        headerAvatarWrap.innerHTML = `<img src="${escapeHtml(data.chat.partner_profile_image)}" class="chat-room-header-avatar" alt="" />`;
      } else {
        headerAvatarWrap.innerHTML = `<div class="chat-room-header-avatar initial">${escapeHtml((data.chat.partner_name || 'U').charAt(0).toUpperCase())}</div>`;
      }
    }

    if (subHeader) {
      if (data.chat.activity_id) {
        subHeader.innerHTML = `<span class="header-status-host">👑 หัวหน้ากิจกรรม: <strong>${escapeHtml(data.chat.creator_name || 'ผู้ขอสร้าง')}</strong></span>`;
      } else {
        subHeader.innerHTML = `<span class="header-status-online"><span class="status-pulse-dot"></span> พร้อมสนทนา</span>`;
      }
    }

    if (headerActions) {
      if (!isGroup && data.chat.partner_id) {
        headerActions.innerHTML = `
          <button type="button" class="btn-chat-view-profile" data-open-profile-id="${data.chat.partner_id}">
            🔍 ดูโปรไฟล์
          </button>
        `;
        headerActions.querySelector('[data-open-profile-id]')?.addEventListener('click', () => {
          if (window.matchSpaceApp?.openProfileModal) {
            window.matchSpaceApp.openProfileModal(Number(data.chat.partner_id));
          }
        });
      } else {
        headerActions.innerHTML = '';
      }
    }

    const isHost = data.chat.activity_id && Number(data.chat.creator_id) === Number(currentUser?.id);
    const isOwner = currentUser && currentUser.role === 'owner';

    if (!data.messages || data.messages.length === 0) {
      messageThread.innerHTML = `
        <div class="chat-empty-placeholder">
          <div class="chat-empty-icon">✨</div>
          <div class="chat-empty-title">เริ่มต้นการสนทนา</div>
          <div class="chat-empty-desc">ส่งข้อความทักทายแรกเพื่อเริ่มต้นมิตรภาพดีๆ ได้เลย!</div>
        </div>
      `;
      return;
    }

    messageThread.innerHTML = data.messages.map((msg) => {
      const isMe = Number(msg.sender_id) === Number(currentUser?.id);
      const isMsgHost = data.chat.activity_id && Number(msg.sender_id) === Number(data.chat.creator_id);
      const canDelete = isMe || isHost || isOwner;
      const timeStr = formatChatTime(msg.created_at);

      const hostBadgeHtml = isMsgHost ? '<span class="host-badge">👑 หัวหน้า</span>' : '';
      const deleteBtnHtml = canDelete ? `<button type="button" class="btn-delete-msg" data-msg-id="${msg.id}" title="ลบข้อความ"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';

      const senderAvatar = msg.sender_profile_image
        ? `<img src="${escapeHtml(msg.sender_profile_image)}" class="chat-msg-avatar" alt="${escapeHtml(msg.sender_name || '')}" />`
        : `<div class="chat-msg-avatar-initial">${escapeHtml((msg.sender_name || 'U').charAt(0).toUpperCase())}</div>`;

      if (isMe) {
        return `
          <div class="msg-wrapper me" data-msg-item-id="${msg.id}">
            <div class="msg-content-col">
              <div class="bubble me">
                <div class="bubble-text">${escapeHtml(msg.content)}</div>
                <div class="bubble-meta">
                  <span class="msg-time me-time">${timeStr}</span>
                  ${deleteBtnHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="msg-wrapper them" data-msg-item-id="${msg.id}">
          <div class="msg-avatar-col">${senderAvatar}</div>
          <div class="msg-content-col">
            <div class="msg-sender-name">
              <span>${escapeHtml(msg.sender_name || 'สมาชิก')}</span>
              ${hostBadgeHtml}
            </div>
            <div class="bubble them">
              <div class="bubble-text">${escapeHtml(msg.content)}</div>
              <div class="bubble-meta">
                <span class="msg-time">${timeStr}</span>
                ${deleteBtnHtml}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    messageThread.scrollTop = messageThread.scrollHeight;

    // Attach delete handlers
    messageThread.querySelectorAll('.btn-delete-msg').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgId = btn.dataset.msgId;
        if (confirm('คุณต้องการลบข้อความนี้ใช่หรือไม่?')) {
          try {
            await apiRequest(`/api/chats/${data.chat.id}/messages/${msgId}`, { method: 'DELETE' });
            btn.closest('.msg-wrapper')?.remove();
          } catch(err) {
            alert(err.message);
          }
        }
      });
    });
  }

  async function loadMessages(chatId) {
    try {
      currentChatId = Number(chatId);

      // Join real-time WebSocket room
      if (window.matchSpaceWS) {
        window.matchSpaceWS.joinChat(currentChatId);
      }

      const data = await apiRequest(`/api/chats/${currentChatId}/messages`);
      renderMessageList(data);

      if (!data.chat.activity_id && data.chat.type !== 'group') {
        await loadGreetingSuggestions(data.messages.length === 0);
      } else {
        const container = document.getElementById('greetingSuggestions');
        if (container) container.classList.add('hidden');
      }
    } catch (e) {
      if (messageThread) {
        messageThread.innerHTML = `<div class="list-item" style="color:var(--muted); text-align:center; padding:20px;">⚠️ ${e.message || 'ไม่สามารถโหลดข้อความได้'}</div>`;
      }
    }
  }

  async function openChatTabAndLoad(chatId) {
    if (window.matchSpaceApp?.triggerTabSwitch) {
      window.matchSpaceApp.triggerTabSwitch('chat', 'slide-right');
    }
    currentChatId = Number(chatId);
    if (chatLayout) chatLayout.classList.add('chat-open');
    await loadChats();
    await loadMessages(chatId);
  }

  async function loadGreetingSuggestions(isEmpty) {
    const container = document.getElementById('greetingSuggestions');
    const chipsEl = document.getElementById('greetingChips');
    if (!container || !chipsEl) return;

    try {
      const greetings = await apiRequest('/api/greetings');
      const shuffled = greetings.sort(() => 0.5 - Math.random()).slice(0, 4);
      chipsEl.innerHTML = shuffled.map(g => `<div class="greeting-chip">${g}</div>`).join('');
      container.classList.remove('hidden');

      chipsEl.querySelectorAll('.greeting-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          if (messageInput) {
            messageInput.value = chip.textContent;
            messageInput.focus();
          }
        });
      });
    } catch (e) {
      container.classList.add('hidden');
    }
  }

  async function sendMessage() {
    if (!currentChatId || !messageInput || !messageInput.value.trim()) return;

    const content = messageInput.value.trim();
    messageInput.value = '';

    // Stop typing event
    if (window.matchSpaceWS && isCurrentlyTyping) {
      isCurrentlyTyping = false;
      window.matchSpaceWS.sendStopTyping(currentChatId);
    }

    try {
      const res = await apiRequest(`/api/chats/${currentChatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content })
      });

      if (res.message && typeof res.message === 'object') {
        appendIncomingMessage(res.message);
      }
      updateChatSnippet(currentChatId, { content, created_at: new Date().toISOString() });
    } catch (err) {
      alert(err.message || 'ไม่สามารถส่งข้อความได้');
    }
  }

  function setupChatEventListeners() {
    if (sendMessageBtn) {
      sendMessageBtn.addEventListener('click', sendMessage);
    }

    if (messageInput) {
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Handle real-time typing indicator
      messageInput.addEventListener('input', () => {
        if (!currentChatId || !window.matchSpaceWS) return;

        if (!isCurrentlyTyping) {
          isCurrentlyTyping = true;
          window.matchSpaceWS.sendTyping(currentChatId, currentUser?.name || 'คู่สนทนา');
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          isCurrentlyTyping = false;
          window.matchSpaceWS.sendStopTyping(currentChatId);
        }, 1500);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', filterAndRenderChats);
    }

    if (mobileBackBtn && chatLayout) {
      mobileBackBtn.addEventListener('click', () => {
        chatLayout.classList.remove('chat-open');
        if (window.matchSpaceWS) {
          window.matchSpaceWS.leaveChat();
        }
      });
    }

    if (closeGreetingsBtn) {
      closeGreetingsBtn.addEventListener('click', () => {
        document.getElementById('greetingSuggestions')?.classList.add('hidden');
      });
    }
  }

  return {
    initChat,
    loadChats,
    loadMessages,
    openChatTabAndLoad,
    getCurrentChatId: () => currentChatId
  };
})();


// ==================== public/js/app.js ====================
/**
 * MatchSpace Main Application Controller (app.html)
 * Coordinates Discover, Liked, Skipped, Activities, and Profile subsystems.
 */

window.matchSpaceApp = (function () {
  let sessionUser = null;
  const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#efe9ff"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#4a4496">♥</text></svg>');

  const tabOrder = ['home', 'discover', 'liked', 'skipped', 'activity', 'chat', 'profile'];
  let currentActiveTab = 'home';
  let latestActivitiesList = [];
  let discoverUsers = [];
  let currentDiscoverIndex = 0;
  let skippedHistory = [];
  let currentCategoryFilter = 'ทั้งหมด';
  let likedUsersList = [];
  let skippedUsersList = [];
  let modalPhotosList = [];
  let modalCurrentPhotoIndex = 0;

  async function initApp() {
    const appRoot = document.getElementById('appRoot');
    if (!appRoot) return;

    try {
      const sessionState = await apiRequest('/api/session');
      if (!sessionState || !sessionState.user) {
        window.location.href = '/';
        return;
      }
      sessionUser = sessionState.user;

      // Connect real-time WebSocket
      if (window.matchSpaceWS) {
        window.matchSpaceWS.connect(sessionUser.id);

        // Listen for real-time mutual matches (replaces polling!)
        window.matchSpaceWS.on('mutual_match', async (data) => {
          await loadLikedUsers();
          await loadDiscoverUsers();
          updateHomeStats();
        });
      }

      // Initialize real-time chat
      if (window.matchSpaceChat) {
        window.matchSpaceChat.initChat(sessionUser);
      }

      setupTabs();
      setupHomeInteractions();
      setupProfile();
      setupCategoryFilterChips();

      await Promise.all([
        loadProfile(),
        loadDiscoverUsers(),
        loadLikedUsers(),
        loadSkippedUsers(),
        window.matchSpaceChat?.loadChats() || Promise.resolve(),
        loadActivities()
      ]);

      loadHomeScreen();
    } catch (err) {
      console.error('App init error:', err);
      window.location.href = '/';
    }
  }

  // ===================== TABS & NAVIGATION =====================
  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        triggerTabSwitch(button.dataset.tab);
      });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (window.matchSpaceWS) window.matchSpaceWS.leaveChat();
        await apiRequest('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }
  }

  function switchTab(tabName, forceAnim) {
    triggerTabSwitch(tabName, forceAnim);
  }

  function triggerTabSwitch(nextTab, customAnim) {
    if (!nextTab) return;
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    const prevIndex = tabOrder.indexOf(currentActiveTab);
    const nextIndex = tabOrder.indexOf(nextTab);
    let animClass = customAnim || 'fade-up';
    if (!customAnim && prevIndex !== -1 && nextIndex !== -1 && prevIndex !== nextIndex) {
      animClass = nextIndex > prevIndex ? 'slide-right' : 'slide-left';
    }
    currentActiveTab = nextTab;

    tabButtons.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === nextTab));
    tabPanels.forEach((panel) => {
      const isTarget = panel.id === `tab-${nextTab}`;
      panel.classList.remove('slide-right', 'slide-left', 'fade-up');
      if (isTarget) {
        void panel.offsetWidth;
        panel.classList.add('active', animClass);
      } else {
        panel.classList.remove('active');
      }
    });

    if (nextTab === 'home') loadHomeScreen();
    if (nextTab === 'activity') loadActivities();
    if (nextTab === 'liked') loadLikedUsers();
    if (nextTab === 'skipped') loadSkippedUsers();
  }

  // ===================== HOME SCREEN =====================
  function updateHomeStats() {
    const homeUserNameEl = document.getElementById('homeUserName');
    const homeCompatibleCountEl = document.getElementById('homeCompatibleCount');
    const homeActivitiesCountEl = document.getElementById('homeActivitiesCount');
    const homeNewMessagesCountEl = document.getElementById('homeNewMessagesCount');

    if (homeUserNameEl && sessionUser) {
      homeUserNameEl.textContent = sessionUser.nickname || sessionUser.name || 'คุณผู้ใช้';
    }
    if (homeCompatibleCountEl) {
      homeCompatibleCountEl.textContent = discoverUsers ? discoverUsers.length : 0;
    }
    if (homeActivitiesCountEl) {
      homeActivitiesCountEl.textContent = latestActivitiesList ? latestActivitiesList.length : 0;
    }
    if (homeNewMessagesCountEl) {
      const countEl = document.getElementById('chatTotalCountBadge');
      homeNewMessagesCountEl.textContent = countEl ? countEl.textContent : 0;
    }
  }

  function loadHomeScreen() {
    updateHomeStats();
  }

  function setupHomeInteractions() {
    document.getElementById('homeBtnGoDiscover')?.addEventListener('click', () => switchTab('discover'));
    document.getElementById('homeCardCandidates')?.addEventListener('click', () => switchTab('discover'));
    document.getElementById('homeCardActivities')?.addEventListener('click', () => switchTab('activity'));
    document.getElementById('homeCardMessages')?.addEventListener('click', () => switchTab('chat'));
    document.getElementById('viewLikedBtn')?.addEventListener('click', () => switchTab('liked'));
    document.getElementById('viewSkippedBtn')?.addEventListener('click', () => switchTab('skipped'));

    const homeNotificationBtn = document.getElementById('homeNotificationBtn');
    const homeNotificationModal = document.getElementById('homeNotificationModal');
    const closeNotificationModal = document.getElementById('closeNotificationModal');

    if (homeNotificationBtn && homeNotificationModal) {
      homeNotificationBtn.addEventListener('click', () => {
        homeNotificationModal.classList.remove('hidden');
      });
    }

    if (closeNotificationModal && homeNotificationModal) {
      closeNotificationModal.addEventListener('click', () => {
        homeNotificationModal.classList.add('hidden');
      });
      homeNotificationModal.addEventListener('click', (e) => {
        if (e.target === homeNotificationModal) {
          homeNotificationModal.classList.add('hidden');
        }
      });
    }
  }

  // ===================== PROFILE SUBSYSTEM =====================
  function setupProfile() {
    const profileForm = document.getElementById('profileForm');
    const addPhotosBtn = document.getElementById('addPhotosBtn');
    const userPhotosInput = document.getElementById('userPhotosInput');

    if (addPhotosBtn && userPhotosInput) {
      addPhotosBtn.addEventListener('click', () => userPhotosInput.click());
      userPhotosInput.addEventListener('change', async () => {
        if (!userPhotosInput.files || userPhotosInput.files.length === 0) return;
        const formData = new FormData();
        for (let i = 0; i < userPhotosInput.files.length; i++) {
          formData.append('photos', userPhotosInput.files[i]);
        }
        try {
          addPhotosBtn.disabled = true;
          addPhotosBtn.textContent = '⏳ กำลังอัปโหลด...';
          await apiRequest('/api/me/photos', { method: 'POST', body: formData });
          userPhotosInput.value = '';
          await loadProfile();
        } catch(err) {
          alert(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูป');
        } finally {
          addPhotosBtn.disabled = false;
          addPhotosBtn.textContent = '📸 เพิ่มรูปภาพโปรไฟล์';
        }
      });
    }

    if (profileForm) {
      const profileUniEl = document.getElementById('profileUniversity');
      const profileCustomUniEl = document.getElementById('profileCustomUniversity');
      const profileMajorEl = document.getElementById('profileMajor');
      const profileCustomMajorEl = document.getElementById('profileCustomMajor');
      const profileMajorLabelEl = document.getElementById('profileMajorLabel');

      if (profileUniEl) {
        profileUniEl.addEventListener('change', () => {
          if (profileUniEl.value === 'other') {
            if (profileCustomUniEl) {
              profileCustomUniEl.classList.remove('hidden');
              profileCustomUniEl.focus();
            }
            if (profileMajorEl) profileMajorEl.classList.add('hidden');
            if (profileCustomMajorEl) profileCustomMajorEl.classList.remove('hidden');
            if (profileMajorLabelEl) profileMajorLabelEl.textContent = 'คณะ / สาขาวิชา (ระบุเอง)';
          } else {
            if (profileCustomUniEl) profileCustomUniEl.classList.add('hidden');
            if (profileMajorEl) profileMajorEl.classList.remove('hidden');
            if (profileMajorLabelEl) profileMajorLabelEl.textContent = 'คณะ / วิทยาลัย (ม.ขอนแก่น)';
            if (profileMajorEl && profileMajorEl.value === 'other') {
              if (profileCustomMajorEl) profileCustomMajorEl.classList.remove('hidden');
            } else {
              if (profileCustomMajorEl) profileCustomMajorEl.classList.add('hidden');
            }
          }
        });
      }

      if (profileMajorEl) {
        profileMajorEl.addEventListener('change', () => {
          if (profileMajorEl.value === 'other') {
            if (profileCustomMajorEl) {
              profileCustomMajorEl.classList.remove('hidden');
              profileCustomMajorEl.focus();
            }
          } else {
            if (profileUniEl && profileUniEl.value !== 'other') {
              if (profileCustomMajorEl) profileCustomMajorEl.classList.add('hidden');
            }
          }
        });
      }

      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const messageEl = document.getElementById('profileMessage');

        try {
          const uniValue = (profileUniEl?.value === 'other')
            ? (profileCustomUniEl?.value.trim() || 'อื่นๆ')
            : (profileUniEl?.value || 'มหาวิทยาลัยขอนแก่น');

          let majorValue = '';
          if (profileUniEl?.value === 'other') {
            majorValue = profileCustomMajorEl?.value.trim() || 'ไม่ระบุ';
          } else if (profileMajorEl?.value === 'other') {
            majorValue = profileCustomMajorEl?.value.trim() || 'อื่นๆ';
          } else {
            majorValue = profileMajorEl?.value || '';
          }

          const formData = new FormData();
          formData.append('name', document.getElementById('profileName').value);
          formData.append('year', document.getElementById('profileYear').value);
          formData.append('gender', document.getElementById('profileGender')?.value || 'ชาย');
          formData.append('interested_gender', document.getElementById('profileInterestedGender')?.value || 'ทุกเพศ');
          formData.append('university', uniValue);
          formData.append('major', majorValue);
          formData.append('phone', document.getElementById('profilePhone')?.value || '');
          formData.append('nickname', document.getElementById('profileNickname')?.value || '');
          formData.append('age', document.getElementById('profileAge')?.value || '');
          formData.append('interests', document.getElementById('profileInterests')?.value || '');
          formData.append('bio', document.getElementById('profileBio')?.value || '');

          const fileInput = document.getElementById('profileImageInput');
          if (fileInput && fileInput.files.length > 0) {
            formData.append('profile_image_file', fileInput.files[0]);
          }

          const result = await apiRequest('/api/me', {
            method: 'PUT',
            body: formData
          });

          if (messageEl) {
            messageEl.className = 'message success';
            messageEl.textContent = result.message || 'บันทึกโปรไฟล์สำเร็จ';
          }
          await loadProfile();
        } catch (error) {
          if (messageEl) {
            messageEl.className = 'message error';
            messageEl.textContent = error.message;
          }
        }
      });
    }

    // Modal close listeners
    document.getElementById('closeProfileModal')?.addEventListener('click', () => {
      document.getElementById('profileModal')?.classList.add('hidden');
    });

    document.getElementById('profileModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'profileModal') {
        document.getElementById('profileModal')?.classList.add('hidden');
      }
    });
  }

  function renderProfile(user) {
    if (!user) return;
    const nameEl = document.getElementById('profileName');
    const yearEl = document.getElementById('profileYear');
    const bioEl = document.getElementById('profileBio');
    const emailEl = document.getElementById('profileEmail');
    const nicknameEl = document.getElementById('profileNickname');
    const ageEl = document.getElementById('profileAge');
    const preview = document.getElementById('profileImagePreview');

    if (nameEl) nameEl.value = user.name || '';
    if (yearEl) yearEl.value = user.year || '';
    const genderEl = document.getElementById('profileGender');
    if (genderEl) genderEl.value = user.gender || 'ชาย';
    const interestedGenderEl = document.getElementById('profileInterestedGender');
    if (interestedGenderEl) interestedGenderEl.value = user.interested_gender || 'ทุกเพศ';
    const universityEl = document.getElementById('profileUniversity');
    const customUniversityEl = document.getElementById('profileCustomUniversity');
    const majorEl = document.getElementById('profileMajor');
    const customMajorEl = document.getElementById('profileCustomMajor');
    const majorLabelEl = document.getElementById('profileMajorLabel');

    if (user.university && user.university !== 'มหาวิทยาลัยขอนแก่น') {
      if (universityEl) universityEl.value = 'other';
      if (customUniversityEl) {
        customUniversityEl.value = user.university;
        customUniversityEl.classList.remove('hidden');
      }
      if (majorEl) majorEl.classList.add('hidden');
      if (customMajorEl) {
        customMajorEl.value = user.major || '';
        customMajorEl.classList.remove('hidden');
      }
      if (majorLabelEl) majorLabelEl.textContent = 'คณะ / สาขาวิชา (ระบุเอง)';
    } else {
      if (universityEl) universityEl.value = 'มหาวิทยาลัยขอนแก่น';
      if (customUniversityEl) {
        customUniversityEl.value = '';
        customUniversityEl.classList.add('hidden');
      }
      if (majorEl) {
        majorEl.classList.remove('hidden');
        const options = Array.from(majorEl.options).map(o => o.value);
        if (options.includes(user.major) && user.major !== 'other' && user.major !== '') {
          majorEl.value = user.major;
          if (customMajorEl) {
            customMajorEl.value = '';
            customMajorEl.classList.add('hidden');
          }
        } else if (user.major) {
          majorEl.value = 'other';
          if (customMajorEl) {
            customMajorEl.value = user.major;
            customMajorEl.classList.remove('hidden');
          }
        } else {
          majorEl.value = '';
          if (customMajorEl) {
            customMajorEl.value = '';
            customMajorEl.classList.add('hidden');
          }
        }
      }
      if (majorLabelEl) majorLabelEl.textContent = 'คณะ / วิทยาลัย (ม.ขอนแก่น)';
    }
    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) phoneEl.value = user.phone || '';
    if (bioEl) bioEl.value = user.bio || '';
    if (emailEl) emailEl.textContent = user.email || '';
    if (nicknameEl) nicknameEl.value = user.nickname || '';
    if (ageEl) ageEl.value = user.age || '';
    if (preview) {
      preview.src = user.profile_image || DEFAULT_AVATAR;
    }

    const interestsList = (user.interests || '').split(',').map((i) => i.trim()).filter(Boolean);
    initializeTagsContainer('profileInterestsTags', 'profileInterests', interestsList);
  }

  async function loadProfile() {
    const result = await apiRequest('/api/me');
    sessionUser = result.user;
    renderProfile(result.user);
    renderUserPhotos(result.photos || []);
    updateHomeStats();
  }

  function renderUserPhotos(photos) {
    const grid = document.getElementById('userPhotosGrid');
    if (!grid) return;
    grid.innerHTML = photos.map(p => `
      <div class="photo-thumb-box">
        <img src="${p.photo_url}" alt="Photo" />
        <button class="btn-delete-photo" data-photo-id="${p.id}" type="button" title="ลบรูปภาพ">✕</button>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-delete-photo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const photoId = btn.dataset.photoId;
        try {
          await apiRequest(`/api/me/photos/${photoId}`, { method: 'DELETE' });
          await loadProfile();
        } catch(err) {
          alert(err.message);
        }
      });
    });
  }

  // ===================== PROFILE MODAL =====================
  async function openProfileModal(userId) {
    try {
      const data = await apiRequest(`/api/users/${userId}/profile`);
      const { user, photos } = data;

      modalPhotosList = photos && photos.length ? photos : [user.profile_image || DEFAULT_AVATAR];
      modalCurrentPhotoIndex = 0;

      const modal = document.getElementById('profileModal');
      const modalImg = document.getElementById('modalProfileImg');
      const modalName = document.getElementById('modalProfileName');
      const modalGender = document.getElementById('modalProfileGender');
      const modalAgeMajor = document.getElementById('modalProfileAgeMajor');
      const modalBio = document.getElementById('modalProfileBio');
      const modalInterests = document.getElementById('modalProfileInterests');
      const galleryNav = document.getElementById('modalGalleryNav');
      const indicators = document.getElementById('galleryIndicators');
      const photoCounter = document.getElementById('modalPhotoCounter');

      modalName.innerHTML = `
        <span class="modal-nickname">${escapeHtml(user.name)}</span>
        ${user.nickname && user.nickname !== user.name ? `<span class="modal-fullname">(${escapeHtml(user.nickname)})</span>` : ''}
      `;

      const genderIcon = user.gender === 'ชาย' ? '👨 ชาย' : (user.gender === 'หญิง' ? '👩 หญิง' : (user.gender ? '🌈 ' + user.gender : '👤 ไม่ระบุเพศ'));
      modalGender.innerHTML = genderIcon;

      const modalInterestedGender = document.getElementById('modalProfileInterestedGender');
      if (modalInterestedGender) {
        modalInterestedGender.textContent = `🎯 สนใจ: ${user.interested_gender || 'ทุกเพศ'}`;
      }
      
      const detailsArr = [];
      if (user.age) detailsArr.push(`🎂 ${user.age} ปี`);
      if (user.university) detailsArr.push(`🏫 ${escapeHtml(user.university)}`);
      if (user.major) detailsArr.push(`🎓 ${escapeHtml(user.major)}`);
      if (user.year) detailsArr.push(escapeHtml(user.year));
      modalAgeMajor.innerHTML = detailsArr.length ? detailsArr.join(' • ') : 'ข้อมูลทั่วไป';

      if (user.bio && user.bio.trim()) {
        modalBio.textContent = `"${user.bio.trim()}"`;
        modalBio.classList.remove('bio-empty-hint');
      } else {
        modalBio.textContent = 'ยังไม่มีข้อความแนะนำตัว';
        modalBio.classList.add('bio-empty-hint');
      }

      const tags = (user.interests || '').split(',').map(t => t.trim()).filter(Boolean);
      modalInterests.innerHTML = tags.length
        ? tags.map(t => `<span class="modal-interest-chip">${escapeHtml(t)}</span>`).join('')
        : '<span class="modal-interest-chip">ทั่วไป</span>';

      function updateModalPhoto() {
        modalImg.src = modalPhotosList[modalCurrentPhotoIndex];
        if (modalPhotosList.length > 1) {
          galleryNav.classList.remove('hidden');
          if (photoCounter) {
            photoCounter.style.display = 'inline-flex';
            photoCounter.textContent = `📸 ${modalCurrentPhotoIndex + 1}/${modalPhotosList.length}`;
          }
          indicators.innerHTML = modalPhotosList.map((_, i) => 
            `<div class="story-indicator-bar ${i === modalCurrentPhotoIndex ? 'active' : ''}"></div>`
          ).join('');
        } else {
          galleryNav.classList.add('hidden');
          indicators.innerHTML = '';
          if (photoCounter) photoCounter.style.display = 'none';
        }
      }

      updateModalPhoto();

      document.getElementById('prevPhotoBtn').onclick = () => {
        modalCurrentPhotoIndex = (modalCurrentPhotoIndex - 1 + modalPhotosList.length) % modalPhotosList.length;
        updateModalPhoto();
      };

      document.getElementById('nextPhotoBtn').onclick = () => {
        modalCurrentPhotoIndex = (modalCurrentPhotoIndex + 1) % modalPhotosList.length;
        updateModalPhoto();
      };

      const actionBtn = document.getElementById('modalActionBtn');
      if (actionBtn) {
        actionBtn.textContent = '💕 ส่งความสนใจ';
        actionBtn.onclick = async () => {
          try {
            const res = await apiRequest('/api/matches', {
              method: 'POST',
              body: JSON.stringify({ matched_user_id: user.id, note: 'Interested', status: 'liked' })
            });
            if (res.mutual) showMatchToast(res.message);
            modal.classList.add('hidden');
            await loadDiscoverUsers();
            await loadLikedUsers();
            await loadSkippedUsers();
          } catch(e) { alert(e.message); }
        };
      }

      modal.classList.remove('hidden');
    } catch(e) {
      alert(e.message || 'ไม่สามารถโหลดข้อมูลโปรไฟล์ได้');
    }
  }

  // ===================== DISCOVER SUBSYSTEM =====================
  function setupCategoryFilterChips() {
    const container = document.getElementById('discoverCategoryChips');
    if (!container) return;

    container.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategoryFilter = chip.dataset.category || 'ทั้งหมด';
        currentDiscoverIndex = 0;
        renderDiscoverCard();
      });
    });
  }

  function getFilteredDiscoverUsers() {
    if (!currentCategoryFilter || currentCategoryFilter === 'ทั้งหมด') {
      return discoverUsers;
    }
    return discoverUsers.filter(u => {
      const text = `${u.interests || ''} ${u.bio || ''} ${u.major || ''}`.toLowerCase();
      const cat = currentCategoryFilter.toLowerCase();
      const catAliases = {
        'อ่านหนังสือ': ['อ่านหนังสือ', 'หนังสือ', 'ติว', 'ห้องสมุด', 'book'],
        'คาเฟ่': ['คาเฟ่', 'กาแฟ', 'ชา', 'cafe', 'coffee'],
        'ดนตรี': ['ดนตรี', 'ฟังเพลง', 'เพลง', 'กีต้าร์', 'ร้องเพลง', 'music', 'concert'],
        'เกม': ['เกม', 'game', 'gaming', 'e-sport', 'rov', 'valorant', 'บอร์ดเกม'],
        'ออกกำลังกาย': ['ออกกำลังกาย', 'ฟิตเนส', 'วิ่ง', 'ยิม', 'กีฬา', 'แบด', 'บอล', 'workout'],
        'ถ่ายรูป': ['ถ่ายรูป', 'กล้อง', 'ภาพ', 'photo', 'film', 'ตากล้อง'],
        'ดูหนัง': ['ดูหนัง', 'หนัง', 'ซีรีส์', 'netflix', 'movie', 'series'],
        'ศิลปะ': ['ศิลปะ', 'วาดรูป', 'art', 'ดีไซน์', 'งานประดิษฐ์', 'วาดภาพ']
      };
      const keywords = catAliases[cat] || [cat];
      return keywords.some(kw => text.includes(kw));
    });
  }

  async function loadDiscoverUsers() {
    const users = await apiRequest('/api/candidates');
    discoverUsers = users;
    updateHomeStats();
    currentDiscoverIndex = 0;
    renderDiscoverCard();
  }

  function renderDiscoverCard() {
    const discoverUserCard = document.getElementById('discoverUserCard');
    if (!discoverUserCard) return;

    const filteredUsers = getFilteredDiscoverUsers();

    if (!filteredUsers.length || currentDiscoverIndex >= filteredUsers.length) {
      discoverUserCard.innerHTML = `
        <div class="list-item" style="grid-column: 1 / -1; text-align:center; padding:38px 20px; background:#ffffff; border-radius:24px; border:1.5px dashed var(--line); box-shadow:0 6px 20px rgba(45,35,80,0.03);">
          <div style="font-size:2.5rem; margin-bottom:10px;">${currentCategoryFilter === 'ทั้งหมด' ? '✨' : '🔍'}</div>
          <div style="font-weight:700; color:var(--purple); font-size:1.15rem; margin-bottom:6px;">
            ${currentCategoryFilter === 'ทั้งหมด' ? 'สำรวจครบทุกคนแล้ว!' : `ยังไม่มีโปรไฟล์ในหมวด "${escapeHtml(currentCategoryFilter)}"`}
          </div>
          <div style="color:var(--muted); font-size:0.88rem; margin-bottom:16px;">
            ${currentCategoryFilter === 'ทั้งหมด' ? 'คุณได้ดูโปรไฟล์แนะนำครบแล้วในขณะนี้' : 'ลองเลือกหมวดหมู่อื่นเพื่อค้นหาเพื่อนใหม่ที่เข้ากันได้'}
          </div>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            ${currentCategoryFilter !== 'ทั้งหมด' ? `<button id="btnResetCategoryFilter" class="button primary" type="button" style="border-radius:999px; padding:8px 18px;">ดูหมวดทั้งหมด</button>` : ''}
            ${skippedUsersList.length > 0 ? `<button id="btnOpenSkippedEmpty" class="button secondary-action" type="button" style="border-radius:999px; padding:8px 18px;">📜 ดูคนที่เคยปัดผ่าน (${skippedUsersList.length} คน)</button>` : ''}
          </div>
        </div>
      `;
      document.getElementById('btnResetCategoryFilter')?.addEventListener('click', () => {
        const chips = document.querySelectorAll('#discoverCategoryChips .category-chip');
        chips.forEach(c => {
          if (c.dataset.category === 'ทั้งหมด') c.classList.add('active');
          else c.classList.remove('active');
        });
        currentCategoryFilter = 'ทั้งหมด';
        currentDiscoverIndex = 0;
        renderDiscoverCard();
      });
      document.getElementById('btnOpenSkippedEmpty')?.addEventListener('click', () => switchTab('skipped'));
      updateSkippedCounters();
      return;
    }

    const user = filteredUsers[currentDiscoverIndex];
    const tags = (user.interests || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    const avatarSrc = user.profile_image || '';

    let sharedPercent = 86;
    try {
      if (sessionUser && sessionUser.interests) {
        const myTags = sessionUser.interests.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        const userTags = tags.map(t => t.toLowerCase());
        const matchCount = userTags.filter(ut => myTags.some(mt => mt.includes(ut) || ut.includes(mt))).length;
        if (matchCount > 0) {
          sharedPercent = Math.min(96, Math.max(68, 65 + (matchCount * 12)));
        } else {
          sharedPercent = 70 + ((Number(user.id || 1) * 17) % 24);
        }
      } else {
        sharedPercent = 72 + ((Number(user.id || 1) * 19) % 22);
      }
    } catch (e) {
      sharedPercent = 86;
    }

    discoverUserCard.innerHTML = `
      <div class="discover-match-card">
        <div class="discover-match-header" style="cursor:pointer;" title="กดเพื่อดูรูปภาพและโปรไฟล์เต็ม">
          ${avatarSrc 
            ? `<img class="discover-match-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(user.name)}" />`
            : `<div class="discover-match-avatar-fallback">${escapeHtml((user.nickname || user.name || 'U').charAt(0).toUpperCase())}</div>`
          }
          <div class="discover-match-info">
            <h3 class="discover-match-name">
              ${escapeHtml(user.name)}
              ${user.nickname && user.nickname !== user.name ? `<span class="skipped-card-nickname" style="font-size:0.75rem; vertical-align:middle; margin-left:4px;">${escapeHtml(user.nickname)}</span>` : ''}
              <svg class="discover-verified-badge" width="19" height="19" viewBox="0 0 24 24" fill="#7c3aed" title="ยืนยันตัวตนแล้ว">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </h3>
            <div class="discover-match-sub">
              ${user.year ? escapeHtml(user.year) + ' · ' : ''}${escapeHtml(user.major || 'มหาวิทยาลัยขอนแก่น')}
            </div>
            <div class="discover-match-tags">
              ${tags.length ? tags.map(t => `<span class="discover-tag-chip">#${escapeHtml(t)}</span>`).join('') : '<span class="discover-tag-chip">#ทั่วไป</span>'}
            </div>
          </div>
        </div>

        <div class="discover-album-pill" style="margin:0; cursor:pointer;" title="กดเพื่อดูรูปภาพและโปรไฟล์เต็ม">
          <span class="pill-camera">📸</span>
          <span>ดูรูปภาพ &amp; ข้อมูลโปรไฟล์</span>
          <span class="pill-gender-tag">${escapeHtml(user.gender || 'ไม่ระบุ')}</span>
          <span class="preference-badge" style="background:#fff1f2; color:#e11d48; font-weight:700; font-size:0.75rem; padding:2px 8px; border-radius:999px;">
            🎯 สนใจ: ${escapeHtml(user.interested_gender || 'ทุกเพศ')}
          </span>
        </div>

        <div class="discover-shared-box">
          <span class="discover-shared-label">ความสนใจร่วมกัน</span>
          <span class="discover-shared-percent">${sharedPercent}%</span>
        </div>

        <div class="discover-match-actions">
          <button class="btn-discover-skip" data-discover-action="skip" type="button">ข้าม</button>
          <button class="btn-discover-like" data-discover-action="like" type="button">สนใจ</button>
          ${skippedHistory.length > 0 ? `<button class="button secondary-action" data-discover-action="rewind" type="button" title="ย้อนกลับไปดูคนที่ปัดผ่านก่อนหน้า" style="border-radius:14px; padding:12px 16px; background:#f0ebff; color:var(--purple); font-weight:700;">⏮️</button>` : ''}
        </div>
      </div>

      <div class="discover-prompts-col">
        <div class="discover-prompt-card" data-prompt="ถ้ามีเวลาว่างเย็นนี้ อยากไปทำอะไร">
          <span>ถ้ามีเวลาว่างเย็นนี้ อยากไปทำอะไร</span>
          <span>💬</span>
        </div>
        <div class="discover-prompt-card" data-prompt="เพลงที่ฟังช่วงนี้คืออะไร">
          <span>เพลงที่ฟังช่วงนี้คืออะไร</span>
          <span>🎵</span>
        </div>
        <div class="discover-prompt-card" data-prompt="คาเฟ่โปรดในมหาวิทยาลัยคือที่ไหน">
          <span>คาเฟ่โปรดในมหาวิทยาลัยคือที่ไหน</span>
          <span>☕</span>
        </div>
        <div class="discover-prompt-card" data-prompt="วิชาที่ชอบที่สุดในเทอมนี้คืออะไร">
          <span>วิชาที่ชอบที่สุดในเทอมนี้คืออะไร</span>
          <span>📚</span>
        </div>
      </div>
    `;

    updateSkippedCounters();

    // Open profile modal
    discoverUserCard.querySelector('.discover-match-header')?.addEventListener('click', () => {
      openProfileModal(user.id);
    });
    discoverUserCard.querySelector('.discover-album-pill')?.addEventListener('click', () => {
      openProfileModal(user.id);
    });

    // Prompt cards click to copy
    discoverUserCard.querySelectorAll('.discover-prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(promptText).catch(() => {});
        }
        showMatchToast(`💡 คัดลอกคำถามชวนคุย: "${promptText}"`);
      });
    });

    // Action buttons (like, skip, rewind)
    discoverUserCard.querySelectorAll('[data-discover-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.discoverAction;
        
        if (action === 'rewind') {
          if (skippedHistory.length > 0) {
            const lastSkipped = skippedHistory.pop();
            currentDiscoverIndex = Math.max(0, currentDiscoverIndex - 1);
            const idx = discoverUsers.findIndex(u => u.id === lastSkipped.id);
            if (idx === -1) {
              discoverUsers.splice(currentDiscoverIndex, 0, lastSkipped);
            }
            renderDiscoverCard();
          }
          return;
        }

        const cardEl = discoverUserCard.querySelector('.discover-match-card');
        if (cardEl) cardEl.classList.add('card-slide-out');

        if (action === 'like') {
          try {
            const matchResult = await apiRequest('/api/matches', {
              method: 'POST',
              body: JSON.stringify({ matched_user_id: user.id, note: 'Interested', status: 'liked' })
            });
            if (matchResult.mutual) {
              showMatchToast(matchResult.message);
              if (window.matchSpaceChat) await window.matchSpaceChat.loadChats();
            }
            await loadLikedUsers();
          } catch(e) { /* ignore */ }
        } else if (action === 'skip') {
          skippedHistory.push(user);
          try {
            await apiRequest('/api/matches', {
              method: 'POST',
              body: JSON.stringify({ matched_user_id: user.id, note: 'Skipped', status: 'skipped' })
            });
            await loadSkippedUsers();
          } catch(e) { /* ignore */ }
        }

        setTimeout(() => {
          currentDiscoverIndex += 1;
          renderDiscoverCard();
        }, 180);
      });
    });
  }

  // ===================== LIKED USERS SUBSYSTEM =====================
  function updateLikedCounters() {
    const count = likedUsersList.length;
    const countTabBadge = document.getElementById('likedTabBadge');
    if (countTabBadge) {
      countTabBadge.textContent = count;
      countTabBadge.classList.toggle('hidden', count === 0);
    }
    const countHeader = document.getElementById('likedHeaderCountBadge');
    if (countHeader) countHeader.textContent = `${count} คน`;
  }

  async function loadLikedUsers() {
    try {
      const data = await apiRequest('/api/liked');
      likedUsersList = Array.isArray(data) ? data : [];
      updateLikedCounters();
      renderLikedGrid();
    } catch (err) {
      console.error('Failed to load liked users:', err);
    }
  }

  function renderLikedGrid() {
    const grid = document.getElementById('likedCardsGrid');
    if (!grid) return;

    const q = (document.getElementById('likedSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('likedStatusFilter')?.value || '';
    const genderFilter = document.getElementById('likedGenderFilter')?.value || '';

    const filtered = likedUsersList.filter(u => {
      if (genderFilter && u.gender !== genderFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (q) {
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchNick = (u.nickname || '').toLowerCase().includes(q);
        const matchMajor = (u.major || '').toLowerCase().includes(q);
        const matchInterests = (u.interests || '').toLowerCase().includes(q);
        if (!matchName && !matchNick && !matchMajor && !matchInterests) return false;
      }
      return true;
    });

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="skipped-empty-state">
          <div class="skipped-empty-icon">💖</div>
          <div class="skipped-empty-title">${q || statusFilter || genderFilter ? 'ไม่พบคนที่ตรงกับเงื่อนไขการค้นหา' : 'ยังไม่มีคนที่คุณกดสนใจ'}</div>
          <div class="skipped-empty-desc">${q || statusFilter || genderFilter ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : 'เมื่อคุณกด "💕 สนใจ" ใครสักคนในหน้าค้นหา (Discover) รายชื่อจะมาแสดงที่นี่'}</div>
          ${!q && !statusFilter && !genderFilter ? `<button class="button primary" id="btnGoDiscoverFromLikedEmpty" type="button">👉 ไปค้นหาคนที่ใช่ (Discover)</button>` : ''}
        </div>
      `;
      document.getElementById('btnGoDiscoverFromLikedEmpty')?.addEventListener('click', () => switchTab('discover'));
      return;
    }

    grid.innerHTML = filtered.map((u) => {
      const avatarSrc = u.profile_image || DEFAULT_AVATAR;
      const tags = (u.interests || '').split(',').map(t => t.trim()).filter(Boolean);
      const isMatched = u.status === 'matched';

      return `
        <div class="liked-profile-card">
          <div class="liked-card-header">
            <img src="${avatarSrc}" class="liked-card-avatar" alt="${escapeHtml(u.name)}" data-open-profile-id="${u.id}" title="คลิกเพื่อดูโปรไฟล์เต็ม" />
            <div class="liked-card-user-info">
              <div class="liked-card-name" data-open-profile-id="${u.id}">
                <span>${escapeHtml(u.name)}</span>
                ${u.nickname && u.nickname !== u.name ? `<span class="skipped-card-nickname">${escapeHtml(u.nickname)}</span>` : ''}
              </div>
              <div class="skipped-card-sub">
                <span>${u.gender ? (u.gender === 'ชาย' ? '👨 ชาย' : (u.gender === 'หญิง' ? '👩 หญิง' : '🌈 LGBTQ+')) : 'ไม่ระบุเพศ'}</span>
                <span>•</span>
                <span>${u.age ? u.age + ' ปี' : 'ไม่ระบุอายุ'}</span>
                <span>•</span>
                <span>🎯 ${escapeHtml(u.interested_gender || 'ทุกเพศ')}</span>
              </div>
              <div style="margin-top:4px;">
                <span class="match-status-pill ${isMatched ? 'matched' : 'pending'}">
                  ${isMatched ? '🎉 แมตช์สำเร็จแล้ว!' : '⏳ รออีกฝ่ายกดสนใจกลับ'}
                </span>
              </div>
            </div>
          </div>

          <div style="font-size:0.84rem; color:var(--purple-dark); font-weight:600;">
            🎓 ${escapeHtml(u.major || 'ไม่ระบุคณะ')}
          </div>

          ${tags.length ? `
            <div class="liked-card-tags">
              ${tags.map(t => `<span class="tag selected" style="font-size:0.75rem; padding:3px 8px;">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}

          ${u.bio ? `<div class="liked-card-bio">💬 "${escapeHtml(u.bio)}"</div>` : ''}

          <div class="liked-card-time">
            <span>🕒 ส่งความสนใจเมื่อ: ${escapeHtml(u.liked_at || 'ไม่ระบุ')}</span>
          </div>

          <div class="liked-card-actions">
            ${isMatched && u.chat_id ? `
              <button class="button primary" data-action-chat-liked="${u.chat_id}" type="button" style="flex:2; font-size:0.84rem; padding:8px 12px; background:linear-gradient(135deg, #10b981, #059669);">
                💬 ทักแชทเลย
              </button>
            ` : `
              <button class="button secondary-action" data-action-cancel-liked="${u.match_id}" type="button" style="flex:2; font-size:0.82rem; padding:8px 10px; color:#e11d48;" title="ยกเลิกความสนใจ">
                ❌ ยกเลิกสนใจ
              </button>
            `}
            <button class="button secondary-action" data-open-profile-id="${u.id}" type="button" style="padding:8px 10px; font-size:0.82rem;" title="ดูอัลบั้มและโปรไฟล์เต็ม">
              🔍
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-action-chat-liked]').forEach(btn => {
      btn.addEventListener('click', () => {
        const chatId = btn.dataset.actionChatLiked;
        if (chatId && window.matchSpaceChat) {
          window.matchSpaceChat.openChatTabAndLoad(Number(chatId));
        }
      });
    });

    grid.querySelectorAll('[data-action-cancel-liked]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const matchId = btn.dataset.actionCancelLiked;
        if (confirm('คุณต้องการยกเลิกการส่งความสนใจให้ผู้ใช้นี้ใช่หรือไม่?')) {
          try {
            await apiRequest(`/api/matches/${matchId}`, { method: 'DELETE' });
            showMatchToast('ยกเลิกความสนใจเรียบร้อยแล้ว');
            await loadLikedUsers();
            await loadDiscoverUsers();
          } catch (err) {
            alert(err.message || 'เกิดข้อผิดพลาด');
          }
        }
      });
    });

    grid.querySelectorAll('[data-open-profile-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = el.dataset.openProfileId;
        if (userId) openProfileModal(Number(userId));
      });
    });
  }

  document.getElementById('likedSearchInput')?.addEventListener('input', renderLikedGrid);
  document.getElementById('likedStatusFilter')?.addEventListener('change', renderLikedGrid);
  document.getElementById('likedGenderFilter')?.addEventListener('change', renderLikedGrid);
  document.getElementById('btnRefreshLiked')?.addEventListener('click', loadLikedUsers);

  // ===================== SKIPPED USERS SUBSYSTEM =====================
  function updateSkippedCounters() {
    const count = skippedUsersList.length;
    const countTabBadge = document.getElementById('skippedTabBadge') || document.getElementById('skippedTabCount');
    if (countTabBadge) {
      countTabBadge.textContent = count;
      countTabBadge.classList.toggle('hidden', count === 0);
    }
    const countDiscoverBtn = document.getElementById('skippedCount');
    if (countDiscoverBtn) countDiscoverBtn.textContent = count;
    const countHeader = document.getElementById('skippedHeaderCountBadge');
    if (countHeader) countHeader.textContent = `${count} คน`;
  }

  async function loadSkippedUsers() {
    try {
      const data = await apiRequest('/api/skipped');
      skippedUsersList = Array.isArray(data) ? data : [];
      skippedHistory = [...skippedUsersList];
      updateSkippedCounters();
      renderSkippedGrid();
    } catch (err) {
      console.error('Failed to load skipped users:', err);
    }
  }

  function renderSkippedGrid() {
    const grid = document.getElementById('skippedCardsGrid');
    if (!grid) return;

    const q = (document.getElementById('skippedSearchInput')?.value || '').toLowerCase().trim();
    const genderFilter = document.getElementById('skippedGenderFilter')?.value || '';

    const filtered = skippedUsersList.filter(u => {
      if (genderFilter && u.gender !== genderFilter) return false;
      if (q) {
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchNick = (u.nickname || '').toLowerCase().includes(q);
        const matchMajor = (u.major || '').toLowerCase().includes(q);
        const matchInterests = (u.interests || '').toLowerCase().includes(q);
        if (!matchName && !matchNick && !matchMajor && !matchInterests) return false;
      }
      return true;
    });

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="skipped-empty-state">
          <div class="skipped-empty-icon">✨</div>
          <div class="skipped-empty-title">${q || genderFilter ? 'ไม่พบคนที่ตรงกับเงื่อนไขการค้นหา' : 'ยังไม่มีคนที่คุณปัดผ่าน'}</div>
          <div class="skipped-empty-desc">${q || genderFilter ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองเพศ' : 'เมื่อคุณกดข้ามผู้ใช้งานในหน้าค้นหา (Discover) รายชื่อทั้งหมดจะถูกรวบรวมไว้ที่นี่'}</div>
          ${!q && !genderFilter ? `<button class="button primary" id="btnGoDiscoverFromEmpty" type="button">👉 ไปค้นหาคนที่ใช่ (Discover)</button>` : ''}
        </div>
      `;
      document.getElementById('btnGoDiscoverFromEmpty')?.addEventListener('click', () => switchTab('discover'));
      return;
    }

    grid.innerHTML = filtered.map((u) => {
      const avatarSrc = u.profile_image || DEFAULT_AVATAR;
      const tags = (u.interests || '').split(',').map(t => t.trim()).filter(Boolean);

      return `
        <div class="skipped-profile-card">
          <div class="skipped-card-header">
            <img src="${avatarSrc}" class="skipped-card-avatar" alt="${escapeHtml(u.name)}" data-open-profile-id="${u.id}" title="คลิกเพื่อดูโปรไฟล์เต็ม" />
            <div class="skipped-card-user-info">
              <div class="skipped-card-name" data-open-profile-id="${u.id}">
                <span>${escapeHtml(u.name)}</span>
                ${u.nickname && u.nickname !== u.name ? `<span class="skipped-card-nickname">${escapeHtml(u.nickname)}</span>` : ''}
              </div>
              <div class="skipped-card-sub">
                <span>${u.gender ? (u.gender === 'ชาย' ? '👨 ชาย' : (u.gender === 'หญิง' ? '👩 หญิง' : '🌈 LGBTQ+')) : 'ไม่ระบุเพศ'}</span>
                <span>•</span>
                <span>${u.age ? u.age + ' ปี' : 'ไม่ระบุอายุ'}</span>
                <span>•</span>
                <span>🎯 ${escapeHtml(u.interested_gender || 'ทุกเพศ')}</span>
              </div>
              <div style="font-size:0.82rem; color:var(--purple-dark); font-weight:600; margin-top:2px;">
                ${escapeHtml(u.major || 'ไม่ระบุคณะ')}
              </div>
            </div>
          </div>

          ${tags.length ? `
            <div class="skipped-card-tags">
              ${tags.map(t => `<span class="tag selected" style="font-size:0.75rem; padding:3px 8px;">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}

          ${u.bio ? `<div class="skipped-card-bio">💬 "${escapeHtml(u.bio)}"</div>` : ''}

          <div class="skipped-card-time">
            <span>🕒 ปัดผ่านเมื่อ: ${escapeHtml(u.skipped_at || 'ไม่ระบุ')}</span>
          </div>

          <div class="skipped-card-actions">
            <button class="button primary" data-action-like-skipped="${u.id}" type="button" style="flex:2; font-size:0.84rem; padding:8px 12px;">
              💕 สนใจ
            </button>
            <button class="button secondary-action" data-action-restore-skipped="${u.match_id}" type="button" style="flex:1; font-size:0.82rem; padding:8px 10px;" title="นำกลับไปแสดงในหน้าค้นหาอีกครั้ง">
              🔄 ดึงกลับ
            </button>
            <button class="button secondary-action" data-open-profile-id="${u.id}" type="button" style="padding:8px 10px; font-size:0.82rem;" title="ดูอัลบั้มและโปรไฟล์เต็ม">
              🔍
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-action-like-skipped]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.actionLikeSkipped;
        btn.disabled = true;
        btn.textContent = '⏳ กำลังส่ง...';
        try {
          const res = await apiRequest('/api/matches', {
            method: 'POST',
            body: JSON.stringify({ matched_user_id: Number(targetId), note: 'Interested from Skipped', status: 'liked' })
          });
          if (res.mutual) {
            showMatchToast(res.message);
            if (window.matchSpaceChat) await window.matchSpaceChat.loadChats();
          } else {
            showMatchToast('บันทึกความสนใจเรียบร้อยแล้ว 💕');
          }
          await loadSkippedUsers();
          await loadLikedUsers();
          await loadDiscoverUsers();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '💕 สนใจ';
          alert(err.message || 'เกิดข้อผิดพลาด');
        }
      });
    });

    grid.querySelectorAll('[data-action-restore-skipped]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const matchId = btn.dataset.actionRestoreSkipped;
        btn.disabled = true;
        try {
          await apiRequest(`/api/matches/${matchId}`, { method: 'DELETE' });
          showMatchToast('นำกลับไปที่หน้าค้นหาแล้ว 🔄');
          await loadSkippedUsers();
          await loadDiscoverUsers();
        } catch (err) {
          btn.disabled = false;
          alert(err.message || 'เกิดข้อผิดพลาด');
        }
      });
    });

    grid.querySelectorAll('[data-open-profile-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = el.dataset.openProfileId;
        if (userId) openProfileModal(Number(userId));
      });
    });
  }

  document.getElementById('skippedSearchInput')?.addEventListener('input', renderSkippedGrid);
  document.getElementById('skippedGenderFilter')?.addEventListener('change', renderSkippedGrid);
  document.getElementById('btnRefreshSkipped')?.addEventListener('click', loadSkippedUsers);
  document.getElementById('btnRestoreAllSkipped')?.addEventListener('click', async () => {
    if (skippedUsersList.length === 0) {
      alert('ไม่มีคนที่ปัดผ่านอยู่ในขณะนี้');
      return;
    }
    if (confirm('คุณต้องการนำทุกคนที่เคยปัดผ่านกลับสู่หน้าค้นหาใช่หรือไม่?')) {
      try {
        const res = await apiRequest('/api/skipped/restore-all', { method: 'POST' });
        showMatchToast(res.message || 'นำทุกคนกลับสู่หน้าค้นหาแล้ว');
        await loadSkippedUsers();
        await loadDiscoverUsers();
      } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาด');
      }
    }
  });

  // ===================== ACTIVITIES SUBSYSTEM =====================
  async function loadActivities() {
    const activityBoardList = document.getElementById('activityBoardList');
    if (!activityBoardList) return;

    try {
      const activities = await apiRequest('/api/activities');
      latestActivitiesList = activities;
      updateHomeStats();
      const isOwnerOrAdmin = sessionUser && (sessionUser.role === 'owner' || sessionUser.role === 'admin' || sessionUser.is_admin);

      activityBoardList.innerHTML = activities.length
        ? activities.map((activity) => {
            const isCreator = Number(activity.created_by) === Number(sessionUser.id);
            const canAccessChat = activity.has_joined || isCreator || isOwnerOrAdmin;
            const canDeleteActivity = isCreator || isOwnerOrAdmin;

            return `
              <div class="activity-card">
                <h3>${escapeHtml(activity.name)}</h3>
                <p>${escapeHtml(activity.description || 'ไม่มีรายละเอียด')}</p>
                <div class="activity-location">${escapeHtml(activity.location || 'ไม่ระบุสถานที่')}</div>
                ${(activity.event_date || activity.event_time) ? `
                  <div class="activity-schedule-row">
                    ${activity.event_date ? `<span class="activity-schedule-pill date">📅 ${formatActivityDate(activity.event_date)}</span>` : ''}
                    ${activity.event_time ? `<span class="activity-schedule-pill time">⏰ ${escapeHtml(activity.event_time)} น.</span>` : ''}
                  </div>
                ` : ''}
                <div class="meta">
                  <span>ผู้สร้าง: ${escapeHtml(activity.creator_name || 'ไม่ระบุ')} ${isCreator ? '👑' : ''}</span>
                  <span>คณะ: ${escapeHtml(activity.creator_major || '-')}</span>
                </div>
                <div style="font-size:0.82rem; color:var(--purple); margin-top:8px; font-weight:600; background:#f8f5ff; padding:6px 12px; border-radius:10px; display:flex; flex-wrap:wrap; gap:8px;">
                  <span>👥 รวม: ${activity.actual_members || 0} คน</span>
                  <span>👨 ชาย: ${activity.male_count || 0} คน</span>
                  <span>👩 หญิง: ${activity.female_count || 0} คน</span>
                  <span>🌈 LGBTQ+: ${activity.lgbtq_count || 0} คน</span>
                </div>
                <div class="activity-actions" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                  <button class="btn-join-activity ${activity.has_joined ? 'joined' : ''}" 
                    data-join-activity-id="${activity.id}" type="button">
                    ${activity.has_joined ? '✓ เข้าร่วมแล้ว' : '🙋 สนใจเข้าร่วม'}
                  </button>
                  ${canAccessChat && activity.chat_id ? `
                    <button class="button secondary-action btn-open-group-chat" data-chat-id="${activity.chat_id}" type="button" style="padding:10px 16px; font-size:0.85rem;">
                      💬 เข้าแชทกลุ่ม
                    </button>
                  ` : ''}
                  ${canDeleteActivity ? `
                    <button class="button outline btn-delete-activity" data-delete-activity-id="${activity.id}" type="button" style="padding:8px 14px; font-size:0.82rem; color:#d32f2f; border-color:#ffcdd2;">
                      🗑️ ลบกิจกรรม
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')
        : '<div class="list-item">ยังไม่มีกิจกรรมที่ได้รับการอนุมัติ</div>';

      activityBoardList.querySelectorAll('[data-join-activity-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.joinActivityId;
          const isJoined = btn.classList.contains('joined');
          try {
            if (isJoined) {
              await apiRequest(`/api/activities/${id}/join`, { method: 'DELETE' });
              await loadActivities();
            } else {
              const res = await apiRequest(`/api/activities/${id}/join`, { method: 'POST' });
              if (res.chat_id && window.matchSpaceChat) {
                await window.matchSpaceChat.openChatTabAndLoad(res.chat_id);
              } else {
                await loadActivities();
              }
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });

      activityBoardList.querySelectorAll('.btn-open-group-chat').forEach(btn => {
        btn.addEventListener('click', async () => {
          const chatId = Number(btn.dataset.chatId);
          if (chatId && window.matchSpaceChat) {
            await window.matchSpaceChat.openChatTabAndLoad(chatId);
          }
        });
      });

      activityBoardList.querySelectorAll('[data-delete-activity-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.deleteActivityId;
          if (confirm('คุณต้องการลบกิจกรรมนี้และยุบแชทกลุ่มใช่หรือไม่?')) {
            try {
              const res = await apiRequest(`/api/activities/${id}`, { method: 'DELETE' });
              alert(res.message || 'ลบกิจกรรมและยุบกลุ่มเรียบร้อย');
              await loadActivities();
              if (window.matchSpaceChat) await window.matchSpaceChat.loadChats();
            } catch(err) {
              alert('เกิดข้อผิดพลาด: ' + err.message);
            }
          }
        });
      });
    } catch (e) {}
  }

  // Setup Activity Form
  const newActivityBtn = document.getElementById('newActivityBtn');
  const activityForm = document.getElementById('activityForm');
  if (newActivityBtn && activityForm) {
    newActivityBtn.addEventListener('click', () => {
      activityForm.classList.toggle('hidden');
    });

    activityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = activityForm.querySelector('button[type="submit"]');
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ กำลังสร้างกิจกรรม...';
        }

        const payload = {
          name: document.getElementById('activityName')?.value,
          description: document.getElementById('activityDescription')?.value,
          member_count: Number(document.getElementById('activityMemberCount')?.value || 4),
          location: document.getElementById('activityLocation')?.value,
          event_date: document.getElementById('activityDate')?.value || null,
          event_time: document.getElementById('activityTime')?.value || null
        };

        const result = await apiRequest('/api/activities', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        activityForm.reset();
        activityForm.classList.add('hidden');
        alert(result.message || 'สร้างกิจกรรมเรียบร้อย');
        await loadActivities();
      } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาดในการสร้างกิจกรรม');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'สร้างกิจกรรม';
        }
      }
    });
  }

  return {
    initApp,
    switchTab,
    triggerTabSwitch,
    openProfileModal,
    updateHomeStats,
    loadDiscoverUsers,
    loadLikedUsers,
    loadSkippedUsers,
    loadActivities
  };
})();

// Auto-run if DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.matchSpaceApp.initApp());
} else {
  window.matchSpaceApp.initApp();
}


