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
  }

  if (registerForm) {
    const interestsTags = document.getElementById('interestsTags');
    if (interestsTags) {
      initializeTagsContainer('interestsTags', 'interests');
    }

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const messageEl = document.getElementById('registerMessage');

      try {
        const formData = new FormData();
        formData.append('name', document.getElementById('name').value);
        formData.append('email', document.getElementById('email').value);
        formData.append('password', document.getElementById('password').value);
        formData.append('nickname', document.getElementById('nickname')?.value || '');
        formData.append('age', document.getElementById('age')?.value || '');
        formData.append('major', document.getElementById('major')?.value || '');
        formData.append('year', document.getElementById('year')?.value || '');
        formData.append('interests', document.getElementById('interests')?.value || '');
        formData.append('bio', document.getElementById('bio')?.value || '');

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
        const users = await apiRequest('/api/candidates');
        const select = document.getElementById('reportedUser');
        if (select) {
          select.innerHTML = '<option value="">-- เลือกผู้ใช้งาน --</option>' + 
            users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('');
        }
      } catch (e) {
        // If fails, allow manual entry
      }
    }
    
    loadReportUsers();

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
        messageEl.textContent = result.message || 'ส่งรายงานสำเร็จ';
        reportForm.reset();
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

        const users = await apiRequest('/api/users');
        userTableBody.innerHTML = users.map((user) => `
          <tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.major || '-'}</td>
            <td>${user.year || '-'}</td>
            <td>${user.interests || '-'}</td>
            <td>${user.is_admin ? 'Admin' : 'User'}</td>
            <td>
              ${!user.is_admin ? `
                <button class="inline-button ${user.is_active === 0 ? 'resolve' : 'reject'}" data-user-id="${user.id}" data-action="${user.is_active === 0 ? 'enable' : 'disable'}">
                  ${user.is_active === 0 ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </button>
              ` : ''}
            </td>
          </tr>
        `).join('');

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
    }

    let discoverUsers = [];
    let currentDiscoverIndex = 0;

    function renderDiscoverCard() {
      if (!discoverUsers.length || currentDiscoverIndex >= discoverUsers.length) {
        discoverUserCard.innerHTML = '<div class="list-item">ไม่มีคนที่พร้อมแสดงตอนนี้</div>';
        return;
      }

      const user = discoverUsers[currentDiscoverIndex];
      const tags = (user.interests || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      discoverUserCard.innerHTML = `
        <div class="profile-card-top">
          <img class="discover-avatar" src="${user.profile_image || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#efe9ff"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#4a4496">♥</text></svg>')}" alt="${user.name}" />
          <div class="discover-meta">
            <h3>${user.nickname || user.name}</h3>
            <div class="meta-row">
              <span>${user.age || 'ไม่ระบุ'} ปี</span>
              <span>${user.major || 'ไม่ระบุคณะ'}</span>
              <span>${user.year || '-'}</span>
            </div>
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

    async function loadDiscoverUsers() {
      const users = await apiRequest('/api/candidates');
      discoverUsers = users;
      currentDiscoverIndex = 0;
      renderDiscoverCard();
    }

    async function loadChats() {
      const chats = await apiRequest('/api/chats');
      chatList.innerHTML = chats.length
        ? chats.map((chat) => `
            <div class="list-item" data-chat-id="${chat.id}" style="cursor:pointer;">
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
                <span class="activity-member-count">ผู้เข้าร่วม: ${activity.actual_members || 0} คน</span>
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
    window.addEventListener('beforeunload', stopChatPolling);

    logoutBtn.addEventListener('click', async () => {
      stopChatPolling();
      await apiRequest('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    await loadProfile();
    await loadDiscoverUsers();
    await loadChats();
    await loadActivities();
  }
});
