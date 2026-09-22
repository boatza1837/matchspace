/**
 * MatchSpace Authentication & Forms Controller
 * Handles Login, Google Sign-In, Multi-Step Registration, and User Reports.
 */

function initAuthModule() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const reportForm = document.getElementById('reportForm');
  const GOOGLE_CLIENT_ID = '186015897078-3qtjge4dbi3e6sjvp4e4lbulolipioug.apps.googleusercontent.com';

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
            width: Math.min(340, btnContainer.parentElement.clientWidth),
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

  function showGoogleLoginModal() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
    const message = document.getElementById('loginMessage');
    if (message) {
      message.className = 'message';
      message.textContent = 'เลือกบัญชีจากปุ่ม Google ด้านบน หากเปิดไม่ได้ กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน';
    }
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
    let usesGoogleRegistration = false;

    function applyGoogleRegistration({ email: googleEmail, name: googleName, picture: googlePic }) {
      usesGoogleRegistration = true;
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
        messageEl.textContent = 'เชื่อมต่อ Google แล้ว กรุณาตรวจชื่อและกรอกข้อมูลที่เหลือเพื่อสมัครสมาชิก';
      }
      const passwordField = document.getElementById('password')?.closest('.auth-input-field');
      if (passwordField) passwordField.classList.add('hidden');
      document.getElementById('password')?.removeAttribute('required');
      document.getElementById('googleRegisterButton')?.closest('.register-google-card')?.classList.add('hidden');
    }

    if (urlParams.get('google') === '1') {
      apiRequest('/api/auth/google/pending').then(applyGoogleRegistration).catch((error) => {
        const messageEl = document.getElementById('registerMessage');
        if (messageEl) { messageEl.className = 'message error'; messageEl.textContent = error.message; }
      });
    }

    function initGoogleRegisterButton() {
      const container = document.getElementById('googleRegisterButton');
      const fallback = document.getElementById('btnGoogleRegister');
      if (!container || !window.google?.accounts?.id) { fallback?.classList.remove('hidden'); return; }
      try {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleLoginResponse, auto_select: false });
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signup_with', shape: 'rectangular', logo_alignment: 'left', width: Math.min(320, container.parentElement.clientWidth) });
        fallback?.classList.add('hidden');
      } catch (_) { fallback?.classList.remove('hidden'); }
    }
    initGoogleRegisterButton();
    setTimeout(initGoogleRegisterButton, 800);
    document.getElementById('btnGoogleRegister')?.addEventListener('click', () => window.google?.accounts?.id?.prompt());

    const interestsTags = document.getElementById('interestsTags');
    if (interestsTags) {
      initializeTagsContainer('interestsTags', 'interests');
    }

    const birthdateInput = document.getElementById('birthdate');
    const zodiacWrap = document.getElementById('registerZodiacBadgeWrap');
    const zodiacBadge = document.getElementById('registerZodiacBadge');
    const elementBadge = document.getElementById('registerElementBadge');
    const agePreview = document.getElementById('registerAgePreview');
    const ageInput = document.getElementById('age');

    function getZodiacInfo(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const signs = [
        { name: 'ราศีมังกร ♑', element: '🌱 ธาตุดิน', color: '#92400e', bg: '#fef3c7', s: [12, 22], e: [1, 19] },
        { name: 'ราศีกุมภ์ ♒', element: '💨 ธาตุลม', color: '#0369a1', bg: '#e0f2fe', s: [1, 20], e: [2, 18] },
        { name: 'ราศีมีน ♓', element: '💧 ธาตุน้ำ', color: '#1d4ed8', bg: '#dbeafe', s: [2, 19], e: [3, 20] },
        { name: 'ราศีเมษ ♈', element: '🔥 ธาตุไฟ', color: '#b91c1c', bg: '#fee2e2', s: [3, 21], e: [4, 19] },
        { name: 'ราศีพฤษภ ♉', element: '🌱 ธาตุดิน', color: '#92400e', bg: '#fef3c7', s: [4, 20], e: [5, 20] },
        { name: 'ราศีเมถุน ♊', element: '💨 ธาตุลม', color: '#0369a1', bg: '#e0f2fe', s: [5, 21], e: [6, 20] },
        { name: 'ราศีกรกฎ ♋', element: '💧 ธาตุน้ำ', color: '#1d4ed8', bg: '#dbeafe', s: [6, 21], e: [7, 22] },
        { name: 'ราศีสิงห์ ♌', element: '🔥 ธาตุไฟ', color: '#b91c1c', bg: '#fee2e2', s: [7, 23], e: [8, 22] },
        { name: 'ราศีกันย์ ♍', element: '🌱 ธาตุดิน', color: '#92400e', bg: '#fef3c7', s: [8, 23], e: [9, 22] },
        { name: 'ราศีตุลย์ ♎', element: '💨 ธาตุลม', color: '#0369a1', bg: '#e0f2fe', s: [9, 23], e: [10, 22] },
        { name: 'ราศีพิจิก ♏', element: '💧 ธาตุน้ำ', color: '#1d4ed8', bg: '#dbeafe', s: [10, 23], e: [11, 21] },
        { name: 'ราศีธนู ♐', element: '🔥 ธาตุไฟ', color: '#b91c1c', bg: '#fee2e2', s: [11, 22], e: [12, 21] }
      ];
      for (const z of signs) {
        if (z.s[0] === 12 && z.e[0] === 1) {
          if ((m === 12 && day >= z.s[1]) || (m === 1 && day <= z.e[1])) return z;
        } else if ((m === z.s[0] && day >= z.s[1]) || (m === z.e[0] && day <= z.e[1])) {
          return z;
        }
      }
      return signs[0];
    }

    if (birthdateInput) {
      birthdateInput.addEventListener('change', () => {
        const val = birthdateInput.value;
        if (!val) {
          if (zodiacWrap) zodiacWrap.style.display = 'none';
          return;
        }
        const info = getZodiacInfo(val);
        const birthYear = new Date(val).getFullYear();
        const curYear = new Date().getFullYear();
        const calcAge = Math.max(16, curYear - birthYear);

        if (ageInput && (!ageInput.value || Number(ageInput.value) <= 0)) {
          ageInput.value = calcAge;
        }

        if (zodiacWrap && info) {
          zodiacWrap.style.display = 'flex';
          if (zodiacBadge) {
            zodiacBadge.textContent = `✨ ${info.name}`;
          }
          if (elementBadge) {
            elementBadge.textContent = `${info.element}`;
            elementBadge.style.color = info.color;
            elementBadge.style.background = info.bg;
          }
          if (agePreview) {
            agePreview.textContent = `(อายุ ${calcAge} ปี)`;
          }
        }
      });
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
          messageEl.textContent = 'โปรดอ่านและรับทราบประกาศความเป็นส่วนตัวก่อนสมัครสมาชิก';
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
        messageEl.textContent = 'โปรดอ่านและรับทราบประกาศความเป็นส่วนตัวก่อนสมัครสมาชิก';
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
        formData.append('privacy_version', '2026-09-22');
        formData.append('privacy_acknowledged', String(consentCheckbox.checked));
        formData.append('matching', 'false');
        formData.append('analytics', 'false');
        formData.append('email_consent', String(Boolean(document.getElementById('emailConsent')?.checked)));
        formData.append('name', document.getElementById('name').value);
        formData.append('email', document.getElementById('email').value);
        formData.append('password', usesGoogleRegistration ? '' : document.getElementById('password').value);
        formData.append('gender', document.getElementById('gender')?.value || 'ชาย');
        formData.append('interested_gender', 'ทุกเพศ');
        formData.append('birthdate', document.getElementById('birthdate')?.value || '');
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
            users.map(u => `<option value="${Number(u.id)}">${escapeHtml(u.name)}${u.major ? ' - ' + escapeHtml(u.major) : ''}</option>`).join('');
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
