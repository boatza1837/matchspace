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
