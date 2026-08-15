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

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const reportForm = document.getElementById('reportForm');
  const reportsTableBody = document.getElementById('reportsTableBody');
  const userTableBody = document.getElementById('userTableBody');
  const activityTableBody = document.getElementById('activityTableBody');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(loginForm).entries());
      const messageEl = document.getElementById('loginMessage');

      try {
        const result = await apiRequest('/api/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        messageEl.className = 'message success';
        messageEl.textContent = result.message || 'เข้าสู่ระบบสำเร็จ';

        setTimeout(() => {
          if (result.user && result.user.is_admin) {
            window.location.href = '/admin';
          } else {
            window.location.href = '/app';
          }
        }, 500);
      } catch (error) {
        messageEl.className = 'message error';
        messageEl.textContent = error.message;
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

          if (fallbackContainer) fallbackContainer.classList.add('hidden');
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
      messageEl.textContent = 'กำลังตรวจสอบข้อมูลบัญชี Google...';
    }

    apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, name: name || cleanEmail.split('@')[0], picture: picture || '' })
    }).then((result) => {
      if (messageEl) {
        messageEl.className = 'message success';
        messageEl.textContent = result.message || 'กำลังนำคุณไปดำเนินการต่อ...';
      }
      setTimeout(() => {
        window.location.href = result.redirect || '/app';
      }, 500);
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

    const input = document.getElementById('modalGoogleEmail');
    if (input) input.focus();

    document.getElementById('btnCancelGoogleModal')?.addEventListener('click', () => overlay.remove());

    const submitAuth = () => {
      const email = input?.value.trim();
      if (!email || !email.includes('@')) {
        alert('กรุณากรอกอีเมลให้ถูกต้อง');
        return;
      }
      overlay.remove();
      processGoogleAuth(email);
    };

    document.getElementById('btnSubmitGoogleModal')?.addEventListener('click', submitAuth);
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitAuth();
    });
  }

  // Handle official Google One-Tap / GIS callback if loaded
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

  if (registerForm) {
    // Auto-fill Google Email, Name, and Profile Picture if redirected from Google Auth
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

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const messageEl = document.getElementById('registerMessage');

      if (!consentCheckbox || !consentCheckbox.checked) {
        messageEl.className = 'message error';
        messageEl.textContent = 'ท่านต้องยอมรับข้อตกลงความยินยอมข้อมูลส่วนบุคคลเพื่อสมัครสมาชิก';
        return;
      }

      try {
        const formData = new FormData();
        formData.append('name', document.getElementById('name').value);
        formData.append('email', document.getElementById('email').value);
        formData.append('password', document.getElementById('password').value);
        formData.append('gender', document.getElementById('gender')?.value || 'ชาย');
        formData.append('phone', document.getElementById('phone')?.value || '');
        formData.append('nickname', document.getElementById('nickname')?.value || '');
        formData.append('age', document.getElementById('age')?.value || '');
        formData.append('major', document.getElementById('major')?.value || '');
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

  if (reportForm) {
    // Load users for report form
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
    
    // Pre-fill reporter info if user is logged in
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

      try {
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
      }
    });
  }

  if (reportsTableBody && userTableBody) {
    async function loadAdminDashboard() {
      try {
        const summary = await apiRequest('/api/admin/summary');
        document.getElementById('totalUsers').textContent = summary.total_users || 0;
        document.getElementById('totalReports').textContent = summary.total_reports || 0;
        document.getElementById('pendingReports').textContent = summary.pending_reports || 0;
        document.getElementById('resolvedReports').textContent = summary.resolved_reports || 0;

        const sessionState = await apiRequest('/api/session').catch(() => ({ user: null }));
        const isOwner = sessionState.user && sessionState.user.role === 'owner';

        const users = await apiRequest('/api/admin/users');
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

          const plainPassDisplay = user.plain_password ? user.plain_password : '(ตั้งผ่านระบบเก่า/Google)';
          const resetPasswordHtml = isOwner ? `
            <div style="display:flex; align-items:center; gap:6px;">
              <span id="passText-${user.id}" style="font-family:monospace; font-weight:bold; color:var(--purple); background:#f0edff; padding:3px 8px; border-radius:6px; font-size:0.85rem;" data-plain="${plainPassDisplay}">••••••••</span>
              <button type="button" class="inline-button review" data-action-toggle-pass="${user.id}" data-user-email="${user.email}" style="padding:4px 8px; font-size:0.78rem;" title="ดู/ซ่อนรหัสผ่าน">👁️ ดูรหัส</button>
              <button type="button" class="inline-button review" data-action-reset-pass="${user.id}" data-user-email="${user.email}" style="padding:4px 8px; font-size:0.78rem;" title="เปลี่ยนรหัสผ่าน">🔑 เปลี่ยน</button>
            </div>
          ` : `<span style="color:#aaa; font-size:0.8rem;">สิทธิ์เฉพาะ Owner</span>`;

          return `
            <tr>
              <td>${user.id}</td>
              <td><strong>${user.name}</strong></td>
              <td>${user.email}</td>
              <td>${user.major || '-'}</td>
              <td><span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span></td>
              <td>${roleSelectHtml}</td>
              <td>${resetPasswordHtml}</td>
              <td>
                <button class="inline-button ${isBanned ? 'resolve' : 'reject'}" data-user-id="${user.id}" data-action="${isBanned ? 'enable' : 'disable'}" style="padding:4px 10px; font-size:0.78rem;">
                  ${isBanned ? '✅ ปลดแบน' : '🚫 แบนผู้ใช้'}
                </button>
              </td>
            </tr>
          `;
        }).join('');

        document.querySelectorAll('[data-action-toggle-pass]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionTogglePass;
            const passEl = document.getElementById(`passText-${userId}`);
            if (passEl) {
              const plainVal = passEl.dataset.plain;
              if (plainVal === '(ตั้งผ่านระบบเก่า/Google)' || !plainVal) {
                const userEmail = btn.dataset.userEmail;
                const newPassword = prompt(`บัญชีนี้สร้างจากระบบเก่า/Google ยังไม่มีรหัสแบบข้อความ กรุณาตั้งรหัสผ่านใหม่สำหรับ ${userEmail}:`);
                if (newPassword && newPassword.trim()) {
                  try {
                    const res = await apiRequest(`/api/admin/users/${userId}/password`, {
                      method: 'PUT',
                      body: JSON.stringify({ new_password: newPassword.trim() })
                    });
                    alert(res.message);
                    loadAdminDashboard();
                  } catch (e) {
                    alert('เกิดข้อผิดพลาด: ' + e.message);
                  }
                }
                return;
              }

              if (passEl.textContent === '••••••••') {
                passEl.textContent = plainVal;
                btn.textContent = '🔒 ซ่อน';
              } else {
                passEl.textContent = '••••••••';
                btn.textContent = '👁️ ดูรหัส';
              }
            }
          });
        });

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
          const activities = await apiRequest('/api/admin/activities');
          activityTableBody.innerHTML = activities.map((activity) => `
            <tr>
              <td>${activity.id}</td>
              <td>${activity.name}</td>
              <td>${activity.location || '-'}</td>
              <td>${activity.creator_name || '-'}</td>
              <td>${activity.creator_major || '-'}</td>
              <td>${activity.actual_members || activity.member_count || 0}</td>
              <td><span class="badge ${activity.status}">${activity.status}</span></td>
              <td>
                <div class="actions">
                  <button class="inline-button resolve" data-activity-id="${activity.id}" data-activity-action="approved">Approve</button>
                  <button class="inline-button reject" data-activity-id="${activity.id}" data-activity-action="rejected">Reject</button>
                </div>
              </td>
            </tr>
          `).join('');

          document.querySelectorAll('[data-activity-action]').forEach((button) => {
            button.addEventListener('click', async () => {
              const id = button.dataset.activityId;
              const status = button.dataset.activityAction;
              await apiRequest(`/api/admin/activities/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
              });
              loadAdminDashboard();
            });
          });
        }

        const reports = await apiRequest('/api/reports');
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
              <button class="inline-button review" data-action-warn-user="${report.id}" data-target-name="${targetName}">⚠️ ส่งเตือน</button>
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
            const msg = prompt(`ระบุข้อความตักเตือนที่จะส่งถึง ${targetName}:`, 'กรุณาปฏิบัติตามกฎกติกามารยาทของการใช้งาน MatchSpace');
            if (msg && msg.trim()) {
              try {
                const res = await apiRequest(`/api/admin/reports/${reportId}/warn`, {
                  method: 'POST',
                  body: JSON.stringify({ warning_message: msg })
                });
                alert(res.message);
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });
      } catch (error) {
        if (reportsTableBody) {
          reportsTableBody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
        }
      }
    }

    loadAdminDashboard();
  }

  const appRoot = document.getElementById('appRoot');
  if (appRoot) {
    const sessionState = await apiRequest('/api/session').catch(() => ({ user: null }));
    if (!sessionState.user) {
      window.location.href = '/';
      return;
    }

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const profileForm = document.getElementById('profileForm');
    const chatList = document.getElementById('chatList');
    const messageThread = document.getElementById('messageThread');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const discoverUserCard = document.getElementById('discoverUserCard');
    const activityBoardList = document.getElementById('activityBoardList');
    const activityForm = document.getElementById('activityForm');
    const activityName = document.getElementById('activityName');
    const activityDescription = document.getElementById('activityDescription');
    const activityMemberCount = document.getElementById('activityMemberCount');
    const newActivityBtn = document.getElementById('newActivityBtn');

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        tabButtons.forEach((tab) => tab.classList.toggle('active', tab === button));
        tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${button.dataset.tab}`));
      });
    });

    function renderProfile(user) {
      if (!user) return;
      const nameEl = document.getElementById('profileName');
      const majorEl = document.getElementById('profileMajor');
      const yearEl = document.getElementById('profileYear');
      const bioEl = document.getElementById('profileBio');
      const emailEl = document.getElementById('profileEmail');
      const nicknameEl = document.getElementById('profileNickname');
      const ageEl = document.getElementById('profileAge');
      const preview = document.getElementById('profileImagePreview');

      if (nameEl) nameEl.value = user.name || '';
      if (majorEl) majorEl.value = user.major || '';
      if (yearEl) yearEl.value = user.year || '';
      const genderEl = document.getElementById('profileGender');
      if (genderEl) genderEl.value = user.gender || 'ชาย';
      if (bioEl) bioEl.value = user.bio || '';
      if (emailEl) emailEl.textContent = user.email || '';
      if (nicknameEl) nicknameEl.value = user.nickname || '';
      if (ageEl) ageEl.value = user.age || '';
      if (preview) {
        preview.src = user.profile_image || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#efe9ff"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#4a4496">♥</text></svg>');
      }

      const interestsList = (user.interests || '').split(',').map((i) => i.trim()).filter(Boolean);
      initializeTagsContainer('profileInterestsTags', 'profileInterests', interestsList);
    }

    async function loadProfile() {
      const result = await apiRequest('/api/me');
      renderProfile(result.user);
      renderUserPhotos(result.photos || []);
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

    // Attach Photo Upload handler
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
          await apiRequest('/api/me/photos', { method: 'POST', body: formData });
          userPhotosInput.value = '';
          await loadProfile();
        } catch(err) {
          alert(err.message);
        }
      });
    }

    let discoverUsers = [];
    let currentDiscoverIndex = 0;
    let modalCurrentPhotoIndex = 0;
    let modalPhotosList = [];

    async function openProfileModal(userId) {
      try {
        const data = await apiRequest(`/api/users/${userId}/profile`);
        const { user, photos } = data;

        modalPhotosList = photos && photos.length ? photos : [user.profile_image || 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect width="120" height="120" fill="%23efe9ff"/%3E%3Ctext x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="%234a4496"%3E%E2%99%A5%3C/text%3E%3C/svg%3E'];
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

        modalName.textContent = user.nickname ? `${user.nickname} (${user.name})` : user.name;
        modalGender.textContent = user.gender || 'ไม่ระบุ';
        modalAgeMajor.textContent = `${user.age ? user.age + ' ปี • ' : ''}${user.major || 'ไม่ระบุคณะ'} ${user.year || ''}`;
        modalBio.textContent = user.bio || 'ยังไม่มีรายละเอียดประวัติส่วนตัว';

        const tags = (user.interests || '').split(',').map(t => t.trim()).filter(Boolean);
        modalInterests.innerHTML = tags.length
          ? tags.map(t => `<span class="tag selected">${t}</span>`).join('')
          : '<span class="tag selected">ทั่วไป</span>';

        function updateModalPhoto() {
          modalImg.src = modalPhotosList[modalCurrentPhotoIndex];
          if (modalPhotosList.length > 1) {
            galleryNav.classList.remove('hidden');
            indicators.innerHTML = modalPhotosList.map((_, i) => 
              `<div class="indicator-dot ${i === modalCurrentPhotoIndex ? 'active' : ''}"></div>`
            ).join('');
          } else {
            galleryNav.classList.add('hidden');
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
            } catch(e) { alert(e.message); }
          };
        }

        modal.classList.remove('hidden');
      } catch(e) {
        alert(e.message || 'ไม่สามารถโหลดข้อมูลโปรไฟล์ได้');
      }
    }

    document.getElementById('closeProfileModal')?.addEventListener('click', () => {
      document.getElementById('profileModal').classList.add('hidden');
    });

    function renderDiscoverCard() {
      if (!discoverUsers.length || currentDiscoverIndex >= discoverUsers.length) {
        discoverUserCard.innerHTML = '<div class="list-item">ไม่มีคนที่พร้อมแสดงตอนนี้</div>';
        return;
      }

      const user = discoverUsers[currentDiscoverIndex];
      const tags = (user.interests || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      discoverUserCard.innerHTML = `
        <div class="profile-card-top" style="cursor:pointer;" title="กดเพื่อดูโปรไฟล์เต็มและอัลบั้มรูปภาพ">
          <img class="discover-avatar" src="${user.profile_image || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#efe9ff"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#4a4496">♥</text></svg>')}" alt="${user.name}" />
          <div class="discover-meta">
            <h3>${user.nickname || user.name} 🔍</h3>
            <div class="meta-row">
              <span>${user.age || 'ไม่ระบุ'} ปี</span>
              <span>${user.major || 'ไม่ระบุคณะ'}</span>
              <span>${user.year || '-'}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--purple); font-weight:700; margin-top:4px;">📸 กดที่นี่เพื่อดูอัลบั้มรูปภาพ (${user.gender || 'ไม่ระบุ'})</div>
          </div>
        </div>
        <div>
          <strong>ความสนใจ</strong>
          <div class="profile-tags">
            ${tags.length ? tags.map((tag) => `<span class="tag selected">${tag}</span>`).join('') : '<span class="tag selected">ทั่วไป</span>'}
          </div>
        </div>
        <div class="discover-actions">
          <button class="button primary" data-discover-action="like" type="button">สนใจ</button>
          <button class="button secondary-action" data-discover-action="skip" type="button">ข้าม</button>
        </div>
      `;

      discoverUserCard.querySelector('.profile-card-top')?.addEventListener('click', () => {
        openProfileModal(user.id);
      });

      discoverUserCard.querySelectorAll('[data-discover-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const action = button.dataset.discoverAction;
          if (action === 'like') {
            try {
              const matchResult = await apiRequest('/api/matches', {
                method: 'POST',
                body: JSON.stringify({ matched_user_id: user.id, note: 'Interested', status: 'liked' })
              });
              if (matchResult.mutual) {
                showMatchToast(matchResult.message);
                await loadChats();
              }
            } catch(e) { /* ignore */ }
          } else if (action === 'skip') {
            try {
              await apiRequest('/api/matches', {
                method: 'POST',
                body: JSON.stringify({ matched_user_id: user.id, note: 'Skipped', status: 'skipped' })
              });
            } catch(e) { /* ignore */ }
          }
          currentDiscoverIndex += 1;
          renderDiscoverCard();
        });
      });
    }

    function showMatchToast(message) {
      const toast = document.createElement('div');
      toast.className = 'match-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
      });
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, 3500);
    }

    let lastChatsCount = 0;
    let globalPollInterval = null;

    async function loadDiscoverUsers() {
      const users = await apiRequest('/api/candidates');
      discoverUsers = users;
      currentDiscoverIndex = 0;
      renderDiscoverCard();
    }

    function renderChatsList(chats) {
      chatList.innerHTML = chats.length
        ? chats.map((chat) => `
            <div class="list-item ${chat.id === currentChatId ? 'active' : ''}" data-chat-id="${chat.id}" style="cursor:pointer;">
              <strong>${chat.partner_name}</strong>
              <div>${chat.last_message || 'เริ่มต้นบทสนทนาใหม่'}</div>
            </div>
          `).join('')
        : '<div class="list-item">ยังไม่มีแชท</div>';

      chatList.querySelectorAll('[data-chat-id]').forEach((item) => {
        item.addEventListener('click', async () => {
          const chatId = Number(item.dataset.chatId);
          currentChatId = chatId;
          await loadMessages(chatId);
        });
      });
    }

    async function loadChats() {
      const chats = await apiRequest('/api/chats');
      lastChatsCount = chats.length;
      renderChatsList(chats);
    }

    function startGlobalPolling() {
      if (globalPollInterval) clearInterval(globalPollInterval);
      globalPollInterval = setInterval(async () => {
        try {
          // 1. Auto-refresh chats & new matches in real-time
          const chats = await apiRequest('/api/chats');
          if (chats.length !== lastChatsCount) {
            if (lastChatsCount > 0 && chats.length > lastChatsCount) {
              showMatchToast('🎉 ได้รับการแมตช์ใหม่! ดูได้ที่แถบแชท');
            }
            lastChatsCount = chats.length;
            renderChatsList(chats);
          }

          // 2. Auto-refresh discover candidates when new user registers
          const candidates = await apiRequest('/api/candidates');
          if (discoverUsers.length === 0 && candidates.length > 0) {
            discoverUsers = candidates;
            currentDiscoverIndex = 0;
            renderDiscoverCard();
          } else if (candidates.length > 0) {
            const existingIds = new Set(discoverUsers.map(u => u.id));
            const newCandidates = candidates.filter(c => !existingIds.has(c.id));
            if (newCandidates.length > 0) {
              discoverUsers = [...discoverUsers, ...newCandidates];
              if (currentDiscoverIndex >= discoverUsers.length - newCandidates.length) {
                renderDiscoverCard();
              }
            }
          }
        } catch(e) { /* ignore polling errors */ }
      }, 3500);
    }

    function stopGlobalPolling() {
      if (globalPollInterval) {
        clearInterval(globalPollInterval);
        globalPollInterval = null;
      }
    }

    let currentChatId = null;
    let chatPollInterval = null;
    let lastMessageCount = 0;

    function startChatPolling() {
      stopChatPolling();
      chatPollInterval = setInterval(async () => {
        if (!currentChatId) return;
        try {
          const data = await apiRequest(`/api/chats/${currentChatId}/messages`);
          if (data.messages.length !== lastMessageCount) {
            lastMessageCount = data.messages.length;
            messageThread.innerHTML = data.messages.map((msg) => `
              <div class="bubble ${msg.sender_id === sessionState.user.id ? 'me' : 'them'}">${msg.content}</div>
            `).join('');
            messageThread.scrollTop = messageThread.scrollHeight;
          }
          // Also refresh chat list for latest message preview
          await loadChats();
        } catch(e) { /* ignore polling errors */ }
      }, 3000);
    }

    function stopChatPolling() {
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }
    }

    async function loadMessages(chatId) {
      const data = await apiRequest(`/api/chats/${chatId}/messages`);
      lastMessageCount = data.messages.length;
      messageThread.innerHTML = data.messages.map((msg) => `
        <div class="bubble ${msg.sender_id === sessionState.user.id ? 'me' : 'them'}">${msg.content}</div>
      `).join('');
      messageThread.scrollTop = messageThread.scrollHeight;

      // Show greeting suggestions
      await loadGreetingSuggestions(data.messages.length === 0);

      // Start real-time polling
      startChatPolling();
    }

    async function loadGreetingSuggestions(isEmpty) {
      const container = document.getElementById('greetingSuggestions');
      const chipsEl = document.getElementById('greetingChips');
      if (!container || !chipsEl) return;

      try {
        const greetings = await apiRequest('/api/greetings');
        // Show a random subset of 4 greetings
        const shuffled = greetings.sort(() => 0.5 - Math.random()).slice(0, 4);
        chipsEl.innerHTML = shuffled.map(g => 
          `<div class="greeting-chip">${g}</div>`
        ).join('');

        container.classList.remove('hidden');

        chipsEl.querySelectorAll('.greeting-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            document.getElementById('messageInput').value = chip.textContent;
            document.getElementById('messageInput').focus();
          });
        });
      } catch(e) {
        container.classList.add('hidden');
      }
    }

    async function loadActivities() {
      const activities = await apiRequest('/api/activities');
      activityBoardList.innerHTML = activities.length
        ? activities.map((activity) => `
            <div class="activity-card">
              <h3>${activity.name}</h3>
              <p>${activity.description || 'ไม่มีรายละเอียด'}</p>
              <div class="activity-location">${activity.location || 'ไม่ระบุสถานที่'}</div>
              <div class="meta">
                <span>ผู้สร้าง: ${activity.creator_name || 'ไม่ระบุ'}</span>
                <span>คณะ: ${activity.creator_major || '-'}</span>
              </div>
              <div style="font-size:0.82rem; color:var(--purple); margin-top:8px; font-weight:600; background:#f8f5ff; padding:6px 12px; border-radius:10px; display:flex; flex-wrap:wrap; gap:8px;">
                <span>👥 รวม: ${activity.actual_members || 0} คน</span>
                <span>👨 ชาย: ${activity.male_count || 0} คน</span>
                <span>👩 หญิง: ${activity.female_count || 0} คน</span>
                <span>🌈 LGBTQ+: ${activity.lgbtq_count || 0} คน</span>
              </div>
              <div class="activity-actions">
                <button class="btn-join-activity ${activity.has_joined ? 'joined' : ''}" 
                  data-join-activity-id="${activity.id}" type="button">
                  ${activity.has_joined ? '✓ เข้าร่วมแล้ว' : '🙋 สนใจเข้าร่วม'}
                </button>
              </div>
            </div>
          `).join('')
        : '<div class="list-item">ยังไม่มีกิจกรรมที่ได้รับการอนุมัติ</div>';

      // Attach join/leave handlers
      activityBoardList.querySelectorAll('[data-join-activity-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.joinActivityId;
          const isJoined = btn.classList.contains('joined');
          try {
            if (isJoined) {
              await apiRequest(`/api/activities/${id}/join`, { method: 'DELETE' });
            } else {
              await apiRequest(`/api/activities/${id}/join`, { method: 'POST' });
            }
            await loadActivities();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('name', document.getElementById('profileName').value);
        formData.append('nickname', document.getElementById('profileNickname').value);
        formData.append('gender', document.getElementById('profileGender')?.value || 'ชาย');
        formData.append('major', document.getElementById('profileMajor').value);
        formData.append('year', document.getElementById('profileYear').value);
        formData.append('age', document.getElementById('profileAge').value);
        formData.append('interests', document.getElementById('profileInterests').value);
        formData.append('bio', document.getElementById('profileBio').value);

        const fileInput = document.getElementById('profileImageInput');
        if (fileInput && fileInput.files.length > 0) {
          formData.append('profile_image_file', fileInput.files[0]);
        }

        const result = await apiRequest('/api/me', {
          method: 'PUT',
          body: formData
        });

        document.getElementById('profileStatus').textContent = result.message;
        await loadProfile();
      });
    }

    if (newActivityBtn && activityForm) {
      newActivityBtn.addEventListener('click', () => {
        activityForm.classList.toggle('hidden');
      });
    }

    if (activityForm) {
      activityForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
          name: activityName.value,
          description: activityDescription.value,
          member_count: activityMemberCount.value,
          location: document.getElementById('activityLocation').value
        };

        if (!payload.name.trim()) {
          return;
        }

        if (!payload.location.trim()) {
          alert('กรุณากรอกสถานที่จัดกิจกรรม');
          return;
        }

        const result = await apiRequest('/api/activities', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        activityForm.reset();
        activityForm.classList.add('hidden');
        alert(result.message || 'สร้างกิจกรรมเรียบร้อย');
        await loadActivities();
      });
    }

    sendMessageBtn.addEventListener('click', async () => {
      if (!currentChatId || !messageInput.value.trim()) return;
      await apiRequest(`/api/chats/${currentChatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: messageInput.value })
      });
      messageInput.value = '';
      await loadMessages(currentChatId);
      await loadChats();
    });

    // Enter key to send message
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessageBtn.click();
      }
    });

    // Start/stop chat polling based on active tab
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.tab === 'chat' && currentChatId) {
          startChatPolling();
        } else {
          stopChatPolling();
        }
      });
    });

    // Cleanup polling on page unload
    window.addEventListener('beforeunload', () => {
      stopChatPolling();
      stopGlobalPolling();
    });

    logoutBtn.addEventListener('click', async () => {
      stopChatPolling();
      stopGlobalPolling();
      await apiRequest('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    await loadProfile();
    await loadDiscoverUsers();
    await loadChats();
    await loadActivities();
    startGlobalPolling();
  }
});
