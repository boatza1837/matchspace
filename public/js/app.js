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

    setupStudentVerification();
    setupBlockedUsersModal();
    setupWebPushNotifications();
  }

  function renderProfile(user) {
    if (!user) return;

    // Update Student Verification UI Card
    const verifyCard = document.getElementById('studentVerificationCard');
    const verifyTitle = document.getElementById('studentVerifyTitle');
    const verifyDesc = document.getElementById('studentVerifyDesc');
    const verifyBtn = document.getElementById('btnOpenStudentVerify');
    if (verifyCard) {
      if (Number(user.is_student_verified) === 1) {
        verifyCard.classList.add('verified');
        if (verifyTitle) verifyTitle.innerHTML = '🎓 ยืนยันตัวตนแล้ว (Verified Student)';
        if (verifyDesc) verifyDesc.textContent = `ยืนยันสถานะนักศึกษาผ่าน ${user.student_email || user.email}`;
        if (verifyBtn) {
          verifyBtn.textContent = '✓ ยืนยันแล้ว';
          verifyBtn.disabled = true;
          verifyBtn.style.opacity = '0.7';
          verifyBtn.style.cursor = 'default';
        }
      } else {
        verifyCard.classList.remove('verified');
        if (verifyTitle) verifyTitle.innerHTML = '🎓 ยืนยันตัวตนนักศึกษา (Verified Student)';
        if (verifyDesc) verifyDesc.textContent = 'รับเครื่องหมายติ๊กถูกสีฟ้า ยืนยันผ่านอีเมลมหาวิทยาลัย (@kkumail.com หรือสถาบัน)';
        if (verifyBtn) {
          verifyBtn.textContent = 'ยืนยันอีเมล';
          verifyBtn.disabled = false;
          verifyBtn.style.opacity = '1';
          verifyBtn.style.cursor = 'pointer';
        }
      }
    }

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

      const isVerified = Number(user.is_student_verified) === 1;
      const verifiedBadgeHtml = isVerified ? `<span class="student-verified-badge" title="นักศึกษาที่ผ่านการยืนยันตัวตน (Verified Student)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> นักศึกษา มข.</span>` : '';

      modalName.innerHTML = `
        <span class="modal-nickname">${escapeHtml(user.name)}</span>
        ${user.nickname && user.nickname !== user.name ? `<span class="modal-fullname">(${escapeHtml(user.nickname)})</span>` : ''}
        ${verifiedBadgeHtml}
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

      const blockBtn = document.getElementById('modalBlockBtn');
      if (blockBtn) {
        blockBtn.onclick = async () => {
          if (confirm(`คุณต้องการบล็อก ${user.name} ใช่หรือไม่?\nหลังจากบล็อกแล้วจะไม่สามารถมองเห็นโปรไฟล์และส่งข้อความหากันได้`)) {
            try {
              await apiRequest(`/api/users/${user.id}/block`, { method: 'POST' });
              alert('บล็อกผู้ใช้เรียบร้อยแล้ว');
              modal.classList.add('hidden');
              await loadDiscoverUsers();
              await loadLikedUsers();
              await loadSkippedUsers();
              if (window.matchSpaceChat) await window.matchSpaceChat.loadChats();
            } catch(err) {
              alert(err.message || 'เกิดข้อผิดพลาดในการบล็อก');
            }
          }
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
              ${Number(user.is_student_verified) === 1 ? `<span class="student-verified-badge" title="นักศึกษาที่ผ่านการยืนยันตัวตน (Verified Student)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> นักศึกษา มข.</span>` : ''}
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
                ${Number(u.is_student_verified) === 1 ? `<span class="student-verified-badge" title="นักศึกษาที่ผ่านการยืนยันตัวตน"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> นศ. มข.</span>` : ''}
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
                ${Number(u.is_student_verified) === 1 ? `<span class="student-verified-badge" title="นักศึกษาที่ผ่านการยืนยันตัวตน"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> นศ. มข.</span>` : ''}
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

  // ===================== STUDENT VERIFICATION =====================
  function setupStudentVerification() {
    const btnOpen = document.getElementById('btnOpenStudentVerify');
    const modal = document.getElementById('studentVerificationModal');
    const btnClose = document.getElementById('closeStudentVerifyModal');
    const btnSend = document.getElementById('btnSendStudentOtp');
    const btnConfirm = document.getElementById('btnConfirmStudentOtp');
    const btnBack = document.getElementById('btnBackToStep1');
    const emailInput = document.getElementById('studentEmailInput');
    const otpInput = document.getElementById('studentOtpInput');
    const step1 = document.getElementById('verifyStep1');
    const step2 = document.getElementById('verifyStep2');
    const notice = document.getElementById('studentOtpNotice');
    const targetDisplay = document.getElementById('displayTargetEmail');

    let pendingEmail = '';

    btnOpen?.addEventListener('click', () => {
      if (sessionUser && Number(sessionUser.is_student_verified) === 1) {
        alert('บัญชีนี้ได้รับการยืนยันตัวตนนักศึกษาเรียบร้อยแล้ว');
        return;
      }
      if (emailInput && !emailInput.value && sessionUser?.email) {
        if (sessionUser.email.includes('@')) {
          emailInput.value = sessionUser.email;
        }
      }
      step1?.classList.remove('hidden');
      step2?.classList.add('hidden');
      if (notice) notice.textContent = '';
      modal?.classList.remove('hidden');
    });

    btnClose?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target.id === 'studentVerificationModal') modal?.classList.add('hidden');
    });

    btnBack?.addEventListener('click', () => {
      step2?.classList.add('hidden');
      step1?.classList.remove('hidden');
    });

    btnSend?.addEventListener('click', async () => {
      const email = emailInput?.value.trim();
      if (!email) {
        alert('กรุณากรอกอีเมลมหาวิทยาลัยของคุณ');
        return;
      }

      try {
        btnSend.disabled = true;
        btnSend.textContent = '⏳ กำลังส่งรหัส OTP...';
        const res = await apiRequest('/api/verify/student/send-otp', {
          method: 'POST',
          body: JSON.stringify({ email })
        });

        pendingEmail = email;
        if (targetDisplay) targetDisplay.textContent = email;

        step1?.classList.add('hidden');
        step2?.classList.remove('hidden');
        if (otpInput) {
          otpInput.value = '';
          otpInput.focus();
        }

        if (res.dev_otp) {
          alert(`[ระบบทดสอบ] รหัส OTP ของคุณคือ: ${res.dev_otp}`);
        } else {
          alert(res.message || 'ส่งรหัส OTP ไปยังอีเมลเรียบร้อยแล้ว');
        }
      } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาดในการส่ง OTP');
      } finally {
        btnSend.disabled = false;
        btnSend.textContent = 'ขอรับรหัส OTP ✉️';
      }
    });

    btnConfirm?.addEventListener('click', async () => {
      const otp = otpInput?.value.trim();
      if (!otp || otp.length < 6) {
        alert('กรุณากรอกรหัส OTP 6 หลัก');
        return;
      }

      try {
        btnConfirm.disabled = true;
        btnConfirm.textContent = '⏳ กำลังตรวจสอบ...';
        const res = await apiRequest('/api/verify/student/confirm-otp', {
          method: 'POST',
          body: JSON.stringify({ email: pendingEmail, otp })
        });

        alert(res.message || '🎉 ยืนยันตัวตนนักศึกษาสำเร็จ! คุณได้รับตรา Verified Student เรียบร้อยแล้ว');
        modal?.classList.add('hidden');
        await loadProfile();
        await loadDiscoverUsers();
      } catch (err) {
        alert(err.message || 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = 'ยืนยันรหัส ✓';
      }
    });
  }

  // ===================== BLOCKED USERS MANAGEMENT =====================
  function setupBlockedUsersModal() {
    const btnOpen = document.getElementById('btnOpenBlockedUsers');
    const modal = document.getElementById('blockedUsersModal');
    const btnClose = document.getElementById('closeBlockedUsersModal');
    const listEl = document.getElementById('blockedUsersList');

    btnOpen?.addEventListener('click', async () => {
      modal?.classList.remove('hidden');
      await loadBlockedList();
    });

    btnClose?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target.id === 'blockedUsersModal') modal?.classList.add('hidden');
    });

    async function loadBlockedList() {
      if (!listEl) return;
      listEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--muted);">กำลังโหลดรายชื่อ...</div>';
      try {
        const users = await apiRequest('/api/me/blocked');
        if (!users.length) {
          listEl.innerHTML = `
            <div style="text-align:center; padding:24px; color:var(--muted);">
              <div style="font-size:2rem; margin-bottom:8px;">🕊️</div>
              <div>ไม่มีผู้ใช้ที่คุณบล็อกไว้</div>
            </div>
          `;
          return;
        }

        listEl.innerHTML = users.map(u => `
          <div class="blocked-user-row">
            <div class="blocked-user-left">
              <img src="${u.profile_image || DEFAULT_AVATAR}" class="blocked-user-avatar" alt="${escapeHtml(u.name)}" />
              <div>
                <div class="blocked-user-name">${escapeHtml(u.name)}</div>
                <div class="blocked-user-time">บล็อกเมื่อ: ${new Date(u.blocked_at).toLocaleDateString('th-TH')}</div>
              </div>
            </div>
            <button type="button" class="btn-unblock-inline" data-unblock-user-id="${u.id}">
              ปลดบล็อก
            </button>
          </div>
        `).join('');

        listEl.querySelectorAll('[data-unblock-user-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.dataset.unblockUserId;
            if (confirm('คุณต้องการปลดบล็อกผู้ใช้นี้ใช่หรือไม่?')) {
              try {
                await apiRequest(`/api/users/${targetId}/unblock`, { method: 'DELETE' });
                alert('ปลดบล็อกเรียบร้อยแล้ว');
                await loadBlockedList();
                await loadDiscoverUsers();
                await loadLikedUsers();
                await loadSkippedUsers();
                if (window.matchSpaceChat) await window.matchSpaceChat.loadChats();
              } catch(e) {
                alert(e.message || 'เกิดข้อผิดพลาดในการปลดบล็อก');
              }
            }
          });
        });
      } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; padding:16px; color:#e11d48;">⚠️ ${err.message}</div>`;
      }
    }
  }

  // ===================== WEB PUSH NOTIFICATIONS =====================
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function setupWebPushNotifications() {
    const btnSubscribePush = document.getElementById('btnSubscribePush');
    if (!btnSubscribePush) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      btnSubscribePush.disabled = true;
      btnSubscribePush.textContent = '🔔 ไม่รองรับ Push';
      return;
    }

    // Register service worker if not already registered
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));

    btnSubscribePush.addEventListener('click', async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('กรุณาอนุญาตการแจ้งเตือน (Notifications) ในเบราว์เซอร์ของคุณ');
          return;
        }

        btnSubscribePush.disabled = true;
        btnSubscribePush.textContent = '⏳ กำลังเปิดรับแจ้งเตือน...';

        const keyRes = await apiRequest('/api/notifications/vapid-public-key');
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
          });
        }

        await apiRequest('/api/notifications/subscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription })
        });

        btnSubscribePush.textContent = '✓ แจ้งเตือนเปิดอยู่ (ทดสอบ)';
        btnSubscribePush.disabled = false;
        btnSubscribePush.onclick = async () => {
          try {
            await apiRequest('/api/notifications/test', { method: 'POST' });
          } catch(e) { alert(e.message); }
        };
        alert('เปิดรับการแจ้งเตือน Web Push สำเร็จแล้ว! คุณจะได้รับการแจ้งเตือนข้อความใหม่และคนถูกใจทันที');
      } catch(err) {
        btnSubscribePush.disabled = false;
        btnSubscribePush.textContent = '🔔 เปิด Web Push Notification';
        alert('เกิดข้อผิดพลาดในการเปิดการแจ้งเตือน: ' + err.message);
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
