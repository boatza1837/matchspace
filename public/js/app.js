/**
 * MatchSpace Main Application Controller (app.html)
 * Coordinates Discover, Liked, Skipped, Activities, and Profile subsystems.
 */

window.matchSpaceApp = (function () {
  let sessionUser = null;
  const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#efe9ff"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="38" fill="#4a4496">♥</text></svg>');

  const tabOrder = ['home', 'discover', 'chat', 'activity', 'profile', 'liked', 'skipped'];
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
      setupMobileDrawer();
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

    // Discover Top Segmented Switcher
    document.getElementById('segBtnDiscover')?.addEventListener('click', () => switchTab('discover'));
    document.getElementById('segBtnLiked')?.addEventListener('click', () => switchTab('liked'));
    document.getElementById('segBtnSkipped')?.addEventListener('click', () => switchTab('skipped'));

    // Subpage Back to Discover Buttons
    document.getElementById('btnBackToDiscoverFromLiked')?.addEventListener('click', () => switchTab('discover'));
    document.getElementById('btnBackToDiscoverFromSkipped')?.addEventListener('click', () => switchTab('discover'));

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (window.matchSpaceWS) window.matchSpaceWS.leaveChat();
        await apiRequest('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }
  }

  function setupMobileDrawer() {
    const toggleBtn = document.getElementById('mobileMenuToggleBtn');
    const drawer = document.getElementById('mobileMenuDrawer');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const closeBtn = document.getElementById('closeDrawerBtn');

    function openDrawer() {
      if (!drawer || !backdrop) return;
      drawer.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      if (!drawer || !backdrop) return;
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
      document.body.style.overflow = '';
    }

    toggleBtn?.addEventListener('click', openDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer?.classList.contains('hidden')) {
        closeDrawer();
      }
    });

    document.getElementById('drawerBtnLiked')?.addEventListener('click', () => {
      closeDrawer();
      switchTab('liked');
    });

    document.getElementById('drawerBtnSkipped')?.addEventListener('click', () => {
      closeDrawer();
      switchTab('skipped');
    });

    document.getElementById('drawerBtnVerify')?.addEventListener('click', () => {
      closeDrawer();
      document.getElementById('btnOpenStudentVerify')?.click();
    });

    document.getElementById('drawerBtnBlocked')?.addEventListener('click', () => {
      closeDrawer();
      document.getElementById('btnOpenBlockedUsers')?.click();
    });

    document.getElementById('drawerLogoutBtn')?.addEventListener('click', () => {
      closeDrawer();
      document.getElementById('logoutBtn')?.click();
    });
  }

  function updateDrawerUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('drawerUserName');
    const majorEl = document.getElementById('drawerUserMajor');
    const avatarEl = document.getElementById('drawerAvatar');
    const verifyPill = document.getElementById('drawerVerifyPill');

    if (nameEl) nameEl.textContent = user.nickname || user.name || 'ผู้ใช้งาน';
    if (majorEl) majorEl.textContent = `${user.year ? user.year + ' · ' : ''}${user.major || 'มหาวิทยาลัยขอนแก่น'}`;
    if (avatarEl && user.profile_image) avatarEl.src = user.profile_image;
    if (verifyPill) {
      if (Number(user.is_student_verified) === 1) {
        verifyPill.textContent = '✔️ ยืนยันแล้ว';
        verifyPill.className = 'drawer-status-pill verified';
      } else {
        verifyPill.textContent = 'รอยืนยัน';
        verifyPill.className = 'drawer-status-pill';
      }
    }
  }

  function switchTab(tabName, forceAnim) {
    triggerTabSwitch(tabName, forceAnim);
  }

  function triggerTabSwitch(nextTab, customAnim) {
    if (!nextTab) return;

    // Leaving chat room resets in-chat-mobile state
    if (nextTab !== 'chat') {
      document.body.classList.remove('in-chat-mobile');
    }

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

    // Update Discover Matching Mode Segmented Bar
    const segBtnDiscover = document.getElementById('segBtnDiscover');
    const segBtnLiked = document.getElementById('segBtnLiked');
    const segBtnSkipped = document.getElementById('segBtnSkipped');
    if (segBtnDiscover) {
      segBtnDiscover.classList.toggle('active', nextTab === 'discover');
      segBtnDiscover.setAttribute('aria-selected', nextTab === 'discover');
    }
    if (segBtnLiked) {
      segBtnLiked.classList.toggle('active', nextTab === 'liked');
      segBtnLiked.setAttribute('aria-selected', nextTab === 'liked');
    }
    if (segBtnSkipped) {
      segBtnSkipped.classList.toggle('active', nextTab === 'skipped');
      segBtnSkipped.setAttribute('aria-selected', nextTab === 'skipped');
    }

    // Scroll to top smoothly when switching tabs on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });

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
    setupConversationStarterModal();
    setupWebPushNotifications();
  }

  function renderProfile(user) {
    if (!user) return;
    updateDrawerUserInfo(user);

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

    // Update Student Verification Banner in Discover Tab
    const discoverBanner = document.getElementById('studentVerificationDiscoverBanner');
    const discoverTitle = document.getElementById('studentVerifyDiscoverTitle');
    const discoverDesc = document.getElementById('studentVerifyDiscoverDesc');
    const discoverBtn = document.getElementById('btnOpenStudentVerifyDiscover');
    const discoverPill = document.getElementById('studentVerifyDiscoverPill');

    if (discoverBanner) {
      if (Number(user.is_student_verified) === 1) {
        // When user is verified, hide the banner completely to give full viewport to candidate cards
        discoverBanner.style.display = 'none';
      } else {
        discoverBanner.style.display = '';
        discoverBanner.classList.remove('verified');
        if (discoverTitle) discoverTitle.innerHTML = '🎓 ยืนยันตัวตนนักศึกษา (Verified Student)';
        if (discoverDesc) discoverDesc.textContent = 'รับเครื่องหมายติ๊กถูกสีฟ้า ยืนยันผ่านอีเมลมหาวิทยาลัย (@kkumail.com หรือสถาบัน) เพื่อเพิ่มความน่าเชื่อถือ';
        if (discoverPill) {
          discoverPill.className = 'badge-verified-preview';
          discoverPill.innerHTML = '✔️ มีติ๊กถูกสีฟ้า';
        }
        if (discoverBtn) {
          discoverBtn.textContent = 'ยืนยันทันที';
          discoverBtn.disabled = false;
          discoverBtn.style.opacity = '1';
          discoverBtn.style.cursor = 'pointer';
        }
      }
    }

    // Update Student Verification Banner in Home Tab
    const homeBanner = document.getElementById('studentVerificationHomeBanner');
    const homeTitle = document.getElementById('studentVerifyHomeTitle');
    const homeDesc = document.getElementById('studentVerifyHomeDesc');
    const homeBtn = document.getElementById('btnOpenStudentVerifyHome');
    const homePill = document.getElementById('studentVerifyHomePill');

    if (homeBanner) {
      if (Number(user.is_student_verified) === 1) {
        homeBanner.style.display = '';
        homeBanner.classList.add('verified');
        if (homeTitle) homeTitle.innerHTML = '🎓 ยืนยันสถานะนักศึกษาแล้ว';
        if (homeDesc) homeDesc.textContent = `${user.student_email || user.email || 'kkumail.com'}`;
        if (homePill) {
          homePill.className = 'badge-verified-preview verified';
          homePill.innerHTML = '✓ รับรองแล้ว';
        }
        if (homeBtn) {
          homeBtn.style.display = 'none';
        }
      } else {
        homeBanner.style.display = '';
        homeBanner.classList.remove('verified');
        if (homeTitle) homeTitle.innerHTML = '🎓 ยืนยันตัวตนนักศึกษา (Verified Student)';
        if (homeDesc) homeDesc.textContent = 'รับเครื่องหมายติ๊กถูกสีฟ้า ยืนยันผ่านอีเมลมหาวิทยาลัย (@kkumail.com หรือสถาบัน) เพื่อเพิ่มความน่าเชื่อถือ';
        if (homePill) {
          homePill.className = 'badge-verified-preview';
          homePill.innerHTML = '✔️ มีติ๊กถูกสีฟ้า';
        }
        if (homeBtn) {
          homeBtn.style.display = '';
          homeBtn.textContent = 'ยืนยันทันที';
          homeBtn.disabled = false;
          homeBtn.style.opacity = '1';
          homeBtn.style.cursor = 'pointer';
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

      const icebreakerBtn = document.getElementById('modalIcebreakerBtn');
      if (icebreakerBtn) {
        icebreakerBtn.onclick = () => {
          modal.classList.add('hidden');
          openIcebreakerModal(user.id);
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

  // ===================== CONVERSATION STARTERS QUESTION BANK =====================
  const DISCOVER_PROMPTS_DATABASE = {
    cafe: [
      { text: 'เห็นว่าชอบคาเฟ่เหมือนกัน ปกติชอบนั่งร้านไหนรอบ มข. / แถวกังสดาลมั้ย?', badge: '☕ คาเฟ่ & ชิล', icon: '☕' },
      { text: 'ชอบสั่งกาแฟหรือเครื่องดื่มแนวไหนมากที่สุด เมนูประจำคืออะไร?', badge: '🧋 เครื่องดื่มโปรด', icon: '🧋' },
      { text: 'มีคาเฟ่บรรยากาศเงียบๆ ไว้นั่งอ่านหนังสือหรือทำงานแนะนำมั้ย?', badge: '📖 คาเฟ่อ่านหนังสือ', icon: '📖' },
      { text: 'ชอบโทนร้านแบบมินิมอล หรือแบบธรรมชาติร่มรื่นมากกว่ากัน?', badge: '🌿 บรรยากาศคาเฟ่', icon: '🌿' }
    ],
    game: [
      { text: 'เห็นว่าชอบเล่นเกมเหมือนกัน ปกติเล่นในคอม มือถือ หรือคอนโซลเหรอ?', badge: '🎮 เล่นเกม', icon: '🎮' },
      { text: 'ช่วงนี้ติดเกมอะไรอยู่มั้ย เผื่อเล่นเหมือนกันจะได้ชวนมาตี้!', badge: '🕹️ ชวนเล่นเกม', icon: '🕹️' },
      { text: 'มีบอร์ดเกมโปรดที่เล่นบ่อยๆ มั้ย ชอบแนววางแผนหรือแนวปาร์ตี้ฮาๆ?', badge: '🎲 บอร์ดเกม', icon: '🎲' }
    ],
    music: [
      { text: 'เห็นว่าชอบฟังเพลงเหมือนกัน ช่วงนี้เพลงที่ฟังวนบ่อยสุดคือเพลงอะไร?', badge: '🎵 เพลงโปรด', icon: '🎵' },
      { text: 'ชอบฟังเพลงแนวไหน มีศิลปินคนโปรดที่อยากป้ายยาให้ฟังตามมั้ย?', badge: '🎧 ศิลปินในดวงใจ', icon: '🎧' },
      { text: 'ชอบฟังเพลงแบบใส่หูฟังคนเดียว หรือชอบไปฟังดนตรีสด/คอนเสิร์ต?', badge: '🎤 คอนเสิร์ต & ดนตรี', icon: '🎤' }
    ],
    movie: [
      { text: 'เห็นว่าชอบดูหนังเหมือนกัน ช่วงนี้มีซีรีส์อะไรบน Netflix หรือสตรีมมิ่งแนะนำมั้ย?', badge: '🍿 ซีรีส์น่าดู', icon: '🍿' },
      { text: 'ถ้าให้แนะนำหนังหรืออนิเมะ 1 เรื่องที่ต้องดูในชีวิต จะแนะนำเรื่องอะไร?', badge: '🎬 หนังในดวงใจ', icon: '🎬' },
      { text: 'ชอบดูแนวระทึกขวัญ ไซไฟ สืบสวน ฟีลกู๊ด หรือคอมเมดี้มากกว่ากัน?', badge: '🎞️ แนวหนังที่ชอบ', icon: '🎞️' }
    ],
    pet: [
      { text: 'เห็นว่าชอบสัตว์เหมือนกัน เป็นทาสแมวหรือทาสหมามากกว่ากันเนี่ย?', badge: '🐱 ทาสสัตว์เลี้ยง', icon: '🐱' },
      { text: 'มีน้องเป็นของตัวเองมั้ย หรือชอบดูคลิปน้องในเน็ต?', badge: '🐾 คนรักสัตว์', icon: '🐾' },
      { text: 'เคยไปคาเฟ่สัตว์เลี้ยงแถวมอมั้ย มีร้านไหนที่น้องน่ารักเป็นมิตรแนะนำมั้ย?', badge: '🤍 คาเฟ่สัตว์เลี้ยง', icon: '🤍' }
    ],
    sports: [
      { text: 'เห็นว่าชอบออกกำลังกายเหมือนกัน ปกติไปออกกำลังกายที่ไหนเหรอ?', badge: '🏃‍♂️ ออกกำลังกาย', icon: '🏃‍♂️' },
      { text: 'หาเพื่อนตีแบด/วิ่งรอบบึงสีฐานอยู่พอดีเลย ไว้ถ้าว่างชวนกันได้นะ!', badge: '🏸 ตีแบด & วิ่ง', icon: '🏸' }
    ],
    art: [
      { text: 'ชอบถ่ายรูปเหมือนกัน ใช้กล้องรุ่นไหนหรือเน้นใช้มือถือหามุมสวยๆ?', badge: '📸 ถ่ายรูป', icon: '📸' },
      { text: 'รอบ มข. หรือในขอนแก่น มีมุมถ่ายรูปสวยๆ แสงดีๆ ที่ชอบไปมั้ย?', badge: '🎨 โลเคชั่นสวย', icon: '🎨' }
    ],
    food: [
      { text: 'ชอบทำอาหาร/กินเหมือนกัน เมนูเด็ดที่ชอบที่สุดคืออะไร?', badge: '🍳 ของกิน', icon: '🍳' },
      { text: 'รอบ ม. มีร้านของกินเด็ดๆ หรือร้านลับที่ชอบไปกินมั้ย?', badge: '🍜 ร้านเด็ดรอบ ม.', icon: '🍜' },
      { text: 'สายชาบู หมูกระทะ หรือของหวานแก้ง่วงมากกว่ากัน?', badge: '🥓 ชาบู/หมูกระทะ', icon: '🥓' }
    ],
    campus: [
      { text: 'เรียนคณะอะไรเหรอ เทอมนี้ตารางเรียนหนักมั้ย?', badge: '🎓 ชีวิตมหาลัย', icon: '🎓' },
      { text: 'เวลาก่อนสอบ มีเคล็ดลับอ่านหนังสือหรือพึ่งสิ่งศักดิ์สิทธิ์อะไรบ้างมั้ย?', badge: '😆 เตรียมสอบ', icon: '😆' },
      { text: 'ชอบลงเรียนเซคเช้าหรือเซคบ่ายมากกว่ากัน?', badge: '⏰ ตารางเรียน', icon: '⏰' },
      { text: 'มีวิชาไหนในมอที่รู้สึกว่าเรียนแล้วสนุกหรือประทับใจอาจารย์บ้างมั้ย?', badge: '📝 วิชาโปรด', icon: '📝' }
    ],
    fun: [
      { text: 'ถ้าถูกลอตเตอรี่รางวัลที่ 1 สิ่งแรกที่จะทำในวันรุ่งขึ้นคืออะไร?', badge: '💸 ถ้าถูกหวย', icon: '💸' },
      { text: 'ถ้าต้องกินอาหารเมนูเดิมทุกวันตลอด 1 เดือน จะเลือกกินเมนูอะไร?', badge: '🍜 เมนูตลอดกาล', icon: '🍜' },
      { text: 'ถ้าเลือกมีพลังวิเศษได้ 1 อย่าง (เช่น วาร์ปได้, ย้อนเวลาได้) อยากได้อะไร?', badge: '🦸 พลังวิเศษ', icon: '🦸' },
      { text: 'ถ้าวันหยุดว่างทั้งวันแบบไม่ต้องทำอะไรเลย กิจกรรมในฝันคืออะไร?', badge: '🏖️ วันหยุดในฝัน', icon: '🏖️' }
    ]
  };

  function getPromptKeyForTag(tag) {
    const t = String(tag || '').toLowerCase();
    if (t.includes('กาแฟ') || t.includes('คาเฟ่') || t.includes('ชา') || t.includes('coffee')) return 'cafe';
    if (t.includes('เกม') || t.includes('game') || t.includes('บอร์ดเกม')) return 'game';
    if (t.includes('เพลง') || t.includes('ดนตรี') || t.includes('music')) return 'music';
    if (t.includes('หนัง') || t.includes('ซีรีส์') || t.includes('อนิเมะ') || t.includes('movie')) return 'movie';
    if (t.includes('แมว') || t.includes('สุนัข') || t.includes('หมา') || t.includes('สัตว์')) return 'pet';
    if (t.includes('ฟิตเนส') || t.includes('วิ่ง') || t.includes('กีฬา') || t.includes('แบด') || t.includes('โยคะ') || t.includes('ปีนเขา')) return 'sports';
    if (t.includes('รูป') || t.includes('ภาพถ่าย') || t.includes('ศิลปะ') || t.includes('ออกแบบ') || t.includes('photo')) return 'art';
    if (t.includes('อาหาร') || t.includes('ปรุง') || t.includes('เบเกอรี่') || t.includes('กิน') || t.includes('ชาบู')) return 'food';
    return null;
  }

  function generateDiscoverPrompts(currUser, targetUser) {
    const myInterests = (currUser?.interests || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const targetInterests = (targetUser?.interests || '').split(',').map(s => s.trim()).filter(Boolean);
    const sharedTags = targetInterests.filter(t => myInterests.some(m => m === t.toLowerCase() || m.includes(t.toLowerCase()) || t.toLowerCase().includes(m)));

    const prompts = [];
    const usedTexts = new Set();

    // 1. Shared interests priority
    sharedTags.forEach(tag => {
      const key = getPromptKeyForTag(tag);
      if (key && DISCOVER_PROMPTS_DATABASE[key]) {
        const pool = DISCOVER_PROMPTS_DATABASE[key];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick && !usedTexts.has(pick.text)) {
          usedTexts.add(pick.text);
          prompts.push({
            text: pick.text,
            badge: `🎯 ตรงใจ: ${tag}`,
            icon: pick.icon,
            isShared: true
          });
        }
      }
    });

    // 2. Target user's individual interests
    if (prompts.length < 2) {
      targetInterests.forEach(tag => {
        const key = getPromptKeyForTag(tag);
        if (key && DISCOVER_PROMPTS_DATABASE[key] && prompts.length < 2) {
          const pool = DISCOVER_PROMPTS_DATABASE[key];
          const pick = pool[Math.floor(Math.random() * pool.length)];
          if (pick && !usedTexts.has(pick.text)) {
            usedTexts.add(pick.text);
            prompts.push({
              text: pick.text,
              badge: `💡 เรื่อง ${tag}`,
              icon: pick.icon,
              isShared: false
            });
          }
        }
      });
    }

    // 3. Fill up to 4 with campus, food, fun
    const generalPool = [
      ...DISCOVER_PROMPTS_DATABASE.campus,
      ...DISCOVER_PROMPTS_DATABASE.food,
      ...DISCOVER_PROMPTS_DATABASE.fun
    ].sort(() => 0.5 - Math.random());

    for (const p of generalPool) {
      if (prompts.length >= 4) break;
      if (!usedTexts.has(p.text)) {
        usedTexts.add(p.text);
        prompts.push({
          text: p.text,
          badge: p.badge,
          icon: p.icon,
          isShared: false
        });
      }
    }

    return { prompts, sharedTags };
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

    const { prompts: dynamicPrompts, sharedTags } = generateDiscoverPrompts(sessionUser, user);

    discoverUserCard.innerHTML = `
      <div id="activeDiscoverCard" class="discover-match-card">
        <!-- Swipe Visual Stamps for Mobile Touch Gestures -->
        <div id="swipeStampLike" class="card-swipe-stamp like">LIKE 💕</div>
        <div id="swipeStampSkip" class="card-swipe-stamp skip">SKIP ✕</div>

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

        <!-- Ergonomic & Thumb-Friendly Action Buttons -->
        <div class="discover-match-actions">
          ${skippedHistory.length > 0 ? `
            <button class="btn-discover-round rewind" data-discover-action="rewind" type="button" title="ย้อนกลับไปดูคนที่ปัดผ่านก่อนหน้า" aria-label="ย้อนกลับ">
              ⏮️
            </button>
          ` : ''}
          <button class="btn-discover-round skip" data-discover-action="skip" type="button" title="ข้ามคนนี้ (หรือปัดซ้าย)" aria-label="ข้าม">
            ✕
          </button>
          <button class="btn-discover-round starters" id="btnOpenIcebreakerFromCard" type="button" title="ดูคำแนะนำเริ่มต้นคุยกับคนนี้" aria-label="ไอเดียคุย">
            💡
          </button>
          <button class="btn-discover-round like" data-discover-action="like" type="button" title="ส่งความสนใจ (หรือปัดขวา)" aria-label="สนใจ">
            💕
          </button>
        </div>
      </div>

      <div class="discover-prompts-col">
        <div class="discover-prompts-header-box">
          <span class="discover-prompts-title">
            💡 คำแนะนำเริ่มต้นคุย
          </span>
          <button type="button" class="discover-prompts-shuffle-btn" id="btnShuffleDiscoverPrompts" title="สุ่มคำถามชุดใหม่">
            🎲 สุ่มใหม่
          </button>
        </div>
        ${sharedTags.length > 0 ? `
          <div style="margin-bottom:8px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            <span style="font-size:0.75rem; font-weight:700; color:#7e22ce;">🎯 สนใจตรงกัน:</span>
            ${sharedTags.map(t => `<span class="shared-tag-pill" style="font-size:0.72rem; padding:2px 8px;">✨ ${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
        <div id="discoverPromptsListInner" style="display:flex; flex-direction:column; gap:8px;">
          ${dynamicPrompts.map(p => `
            <div class="discover-prompt-card ${p.isShared ? 'shared-match' : ''}" data-prompt="${escapeHtml(p.text)}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="prompt-badge ${p.isShared ? 'shared' : ''}" style="font-size:0.7rem; padding:2px 7px;">${p.badge}</span>
                <span style="font-size:0.88rem;">${p.icon}</span>
              </div>
              <span style="font-weight:600; font-size:0.86rem; color:#1e293b; line-height:1.4;">${escapeHtml(p.text)}</span>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn-all-icebreakers-discover" id="btnOpenAllIcebreakersDiscover">
          ✨ ดูคำแนะนำทั้งหมดสำหรับเริ่มคุย ↗
        </button>
      </div>
    `;

    updateSkippedCounters();

    const activeCard = document.getElementById('activeDiscoverCard');
    if (activeCard) {
      attachCardTouchController(activeCard, user);
    }

    // Open profile modal
    discoverUserCard.querySelector('.discover-match-header')?.addEventListener('click', () => {
      openProfileModal(user.id);
    });
    discoverUserCard.querySelector('.discover-album-pill')?.addEventListener('click', () => {
      openProfileModal(user.id);
    });

    // Quick icebreaker trigger button from card
    discoverUserCard.querySelector('#btnOpenIcebreakerFromCard')?.addEventListener('click', () => {
      openIcebreakerModal(user.id);
    });

    // Prompt cards click to copy
    function attachDiscoverPromptClickListeners() {
      discoverUserCard.querySelectorAll('.discover-prompt-card').forEach(card => {
        card.onclick = () => {
          const promptText = card.dataset.prompt;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(promptText).catch(() => {});
          }
          showMatchToast(`💡 คัดลอกคำถามชวนคุย: "${promptText}"`);
        };
      });
    }
    attachDiscoverPromptClickListeners();

    // Shuffle discover prompts
    discoverUserCard.querySelector('#btnShuffleDiscoverPrompts')?.addEventListener('click', () => {
      const { prompts: newPrompts } = generateDiscoverPrompts(sessionUser, user);
      const innerList = discoverUserCard.querySelector('#discoverPromptsListInner');
      if (innerList) {
        innerList.innerHTML = newPrompts.map(p => `
          <div class="discover-prompt-card ${p.isShared ? 'shared-match' : ''}" data-prompt="${escapeHtml(p.text)}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span class="prompt-badge ${p.isShared ? 'shared' : ''}" style="font-size:0.7rem; padding:2px 7px;">${p.badge}</span>
              <span style="font-size:0.88rem;">${p.icon}</span>
            </div>
            <span style="font-weight:600; font-size:0.86rem; color:#1e293b; line-height:1.4;">${escapeHtml(p.text)}</span>
          </div>
        `).join('');
        attachDiscoverPromptClickListeners();
      }
    });

    // Open full Icebreakers modal
    discoverUserCard.querySelector('#btnOpenAllIcebreakersDiscover')?.addEventListener('click', () => {
      openIcebreakerModal(user.id);
    });

    // Action buttons (like, skip, rewind)
    discoverUserCard.querySelectorAll('[data-discover-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.discoverAction;
        executeDiscoverAction(action, user);
      });
    });
  }

  // ===================== CARD TOUCH SWIPE CONTROLLER =====================
  function attachCardTouchController(cardEl, user) {
    if (!cardEl) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isHorizontalSwipe = false;
    const likeStamp = cardEl.querySelector('.card-swipe-stamp.like');
    const skipStamp = cardEl.querySelector('.card-swipe-stamp.skip');

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;
      isDragging = true;
      isHorizontalSwipe = false;
      cardEl.classList.remove('spring-back', 'swiped-left', 'swiped-right');
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!isHorizontalSwipe) {
        if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
          isHorizontalSwipe = true;
        } else if (Math.abs(deltaY) > 12) {
          isDragging = false;
          return;
        }
      }

      if (isHorizontalSwipe) {
        if (e.cancelable) e.preventDefault();
        cardEl.classList.add('swiping');
        currentX = touch.clientX;
        const rotateDeg = (deltaX / 16);
        cardEl.style.transform = `translate(${deltaX}px, ${deltaY * 0.2}px) rotate(${rotateDeg}deg)`;

        const progress = Math.min(1, Math.max(0, (Math.abs(deltaX) - 20) / 60));
        if (deltaX > 0) {
          if (likeStamp) {
            likeStamp.style.opacity = progress;
            likeStamp.style.transform = `rotate(15deg) scale(${0.8 + progress * 0.25})`;
          }
          if (skipStamp) skipStamp.style.opacity = '0';
        } else {
          if (skipStamp) {
            skipStamp.style.opacity = progress;
            skipStamp.style.transform = `rotate(-15deg) scale(${0.8 + progress * 0.25})`;
          }
          if (likeStamp) likeStamp.style.opacity = '0';
        }
      }
    };

    const onTouchEnd = () => {
      if (!isDragging || !isHorizontalSwipe) {
        isDragging = false;
        isHorizontalSwipe = false;
        return;
      }
      isDragging = false;
      cardEl.classList.remove('swiping');

      const deltaX = currentX - startX;
      const SWIPE_THRESHOLD = 70;

      if (deltaX > SWIPE_THRESHOLD) {
        executeDiscoverAction('like', user);
      } else if (deltaX < -SWIPE_THRESHOLD) {
        executeDiscoverAction('skip', user);
      } else {
        cardEl.classList.add('spring-back');
        cardEl.style.transform = '';
        if (likeStamp) likeStamp.style.opacity = '0';
        if (skipStamp) skipStamp.style.opacity = '0';
      }
      isHorizontalSwipe = false;
    };

    cardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    cardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    cardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    cardEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  async function executeDiscoverAction(action, user) {
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

    const cardEl = document.getElementById('activeDiscoverCard') || discoverUserCard.querySelector('.discover-match-card');
    if (cardEl) {
      if (action === 'like') {
        cardEl.classList.add('swiped-right');
        const stamp = cardEl.querySelector('.card-swipe-stamp.like');
        if (stamp) {
          stamp.style.opacity = '1';
          stamp.style.transform = 'rotate(15deg) scale(1.1)';
        }
      } else if (action === 'skip') {
        cardEl.classList.add('swiped-left');
        const stamp = cardEl.querySelector('.card-swipe-stamp.skip');
        if (stamp) {
          stamp.style.opacity = '1';
          stamp.style.transform = 'rotate(-15deg) scale(1.1)';
        }
      }
    }

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
    }, 240);
  }

  // ===================== LIKED USERS SUBSYSTEM =====================
  function updateLikedCounters() {
    const count = likedUsersList.length;
    const countTabBadge = document.getElementById('likedTabBadge');
    if (countTabBadge) {
      countTabBadge.textContent = count;
      countTabBadge.classList.toggle('hidden', count === 0);
    }
    const countDiscoverBtn = document.getElementById('likedCount');
    if (countDiscoverBtn) countDiscoverBtn.textContent = count;
    const countSegPill = document.getElementById('likedCountBadgePill');
    if (countSegPill) countSegPill.textContent = count;
    const drawerLikedBadge = document.getElementById('drawerLikedBadge');
    if (drawerLikedBadge) drawerLikedBadge.textContent = count;
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
    const countSegPill = document.getElementById('skippedCountBadgePill');
    if (countSegPill) countSegPill.textContent = count;
    const drawerSkippedBadge = document.getElementById('drawerSkippedBadge');
    if (drawerSkippedBadge) drawerSkippedBadge.textContent = count;
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

            // Check if activity date and time has passed
            const isPast = activity.event_date && (() => {
              const timeStr = activity.event_time ? String(activity.event_time).slice(0, 5) : '23:59';
              const eventMs = new Date(`${activity.event_date}T${timeStr}:00+07:00`).getTime();
              return !isNaN(eventMs) && eventMs < Date.now();
            })();

            return `
              <div class="activity-card ${isPast ? 'past-activity' : ''}">
                <h3>${escapeHtml(activity.name)}</h3>
                <p>${escapeHtml(activity.description || 'ไม่มีรายละเอียด')}</p>
                <div class="activity-location">${escapeHtml(activity.location || 'ไม่ระบุสถานที่')}</div>
                ${(activity.event_date || activity.event_time) ? `
                  <div class="activity-schedule-row">
                    ${activity.event_date ? `<span class="activity-schedule-pill date">📅 ${formatActivityDate(activity.event_date)}</span>` : ''}
                    ${activity.event_time ? `<span class="activity-schedule-pill time">⏰ ${escapeHtml(activity.event_time)} น.</span>` : ''}
                    ${isPast ? `<span class="activity-schedule-pill expired" style="background:#fee2e2; color:#b91c1c; font-weight:700;">⌛ สิ้นสุดแล้ว</span>` : ''}
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
                  ${isPast && !activity.has_joined ? `
                    <button class="button disabled" disabled type="button" style="opacity:0.65; cursor:not-allowed; background:#f1f5f9; color:#64748b; padding:9px 14px; font-size:0.84rem; border:1px solid #cbd5e1;">
                      ⌛ กิจกรรมสิ้นสุดแล้ว
                    </button>
                  ` : `
                    <button class="btn-join-activity ${activity.has_joined ? 'joined' : ''}" 
                      data-join-activity-id="${activity.id}" type="button">
                      ${activity.has_joined ? '✓ เข้าร่วมแล้ว' : '🙋 สนใจเข้าร่วม'}
                    </button>
                  `}
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
  const activityDateInput = document.getElementById('activityDate');
  const activityTimeInput = document.getElementById('activityTime');

  function updateActivityDateTimeLimits() {
    if (!activityDateInput) return;
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
    activityDateInput.min = todayStr;

    if (!activityDateInput.value || activityDateInput.value < todayStr) {
      activityDateInput.value = todayStr;
    }

    if (activityTimeInput) {
      if (activityDateInput.value === todayStr) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        activityTimeInput.min = `${hh}:${mm}`;
        if (!activityTimeInput.value || activityTimeInput.value < `${hh}:${mm}`) {
          // Default to next hour
          const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
          const nextHh = String(nextHour.getHours()).padStart(2, '0');
          const nextMm = String(Math.floor(nextHour.getMinutes() / 5) * 5).padStart(2, '0');
          activityTimeInput.value = `${nextHh}:${nextMm}`;
        }
      } else {
        activityTimeInput.removeAttribute('min');
      }
    }
  }

  if (activityDateInput) {
    activityDateInput.addEventListener('change', updateActivityDateTimeLimits);
    activityDateInput.addEventListener('input', updateActivityDateTimeLimits);
  }
  if (activityTimeInput) {
    activityTimeInput.addEventListener('change', updateActivityDateTimeLimits);
  }

  // Initialize limits on page load
  updateActivityDateTimeLimits();

  if (newActivityBtn && activityForm) {
    newActivityBtn.addEventListener('click', () => {
      activityForm.classList.toggle('hidden');
      if (!activityForm.classList.contains('hidden')) {
        updateActivityDateTimeLimits();
      }
    });

    activityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = activityForm.querySelector('button[type="submit"]');

      const dateVal = document.getElementById('activityDate')?.value;
      const timeVal = document.getElementById('activityTime')?.value;

      if (!dateVal) {
        alert('กรุณาระบุวันที่จัดกิจกรรม');
        return;
      }

      // Check if date or time is in the past
      const checkIso = timeVal ? `${dateVal}T${timeVal}:00` : `${dateVal}T23:59:59`;
      const selectedTimeMs = new Date(checkIso).getTime();
      const nowMs = Date.now();
      if (isNaN(selectedTimeMs) || selectedTimeMs < nowMs - 60000) {
        alert('ไม่สามารถเพิ่มคำขอที่มีวันหรือเวลาย้อนอดีตได้ กรุณาเลือกวันและเวลาที่เป็นปัจจุบันหรือในอนาคต');
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ กำลังส่งคำขอ...';
        }

        const payload = {
          name: document.getElementById('activityName')?.value,
          description: document.getElementById('activityDescription')?.value,
          member_count: Number(document.getElementById('activityMemberCount')?.value || 4),
          location: document.getElementById('activityLocation')?.value,
          event_date: dateVal,
          event_time: timeVal || null
        };

        const result = await apiRequest('/api/activities', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        activityForm.reset();
        activityForm.classList.add('hidden');
        alert(result.message || 'ส่งคำขอสร้างกิจกรรมเรียบร้อย รอการอนุมัติ');
        await loadActivities();
      } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาดในการสร้างกิจกรรม');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'ส่งคำขออนุมัติ';
        }
      }
    });
  }

  // ===================== STUDENT VERIFICATION =====================
  function setupStudentVerification() {
    const btnOpen = document.getElementById('btnOpenStudentVerify');
    const btnOpenDiscover = document.getElementById('btnOpenStudentVerifyDiscover');
    const btnOpenHome = document.getElementById('btnOpenStudentVerifyHome');
    const modal = document.getElementById('studentVerificationModal');
    const btnClose = document.getElementById('closeStudentVerifyModal');
    const btnSend = document.getElementById('btnSendStudentOtp');
    const btnConfirm = document.getElementById('btnConfirmStudentOtp');
    const btnBack = document.getElementById('btnBackToStep1');
    const emailInput = document.getElementById('studentEmailInput');
    const otpInput = document.getElementById('studentOtpInput');
    const step1 = document.getElementById('verifyStep1');
    const step2 = document.getElementById('verifyStep2');
    const stepSuccess = document.getElementById('verifyStepSuccess');
    const stepAlready = document.getElementById('verifyStepAlreadyVerified');
    const notice = document.getElementById('studentOtpNotice');
    const targetDisplay = document.getElementById('displayTargetEmail');
    const btnDone = document.getElementById('btnDoneStudentVerify');
    const btnCloseAlready = document.getElementById('btnCloseAlreadyVerified');

    let pendingEmail = '';

    function launchConfetti() {
      const container = document.getElementById('verifyConfettiContainer');
      if (!container) return;
      container.innerHTML = '';
      const colors = ['#3b82f6', '#2563eb', '#60a5fa', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#f43f5e'];
      const count = 42;
      for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const startX = Math.random() * 90 + 5; // percentage
        const destX = (Math.random() - 0.5) * 220; // px
        const destY = 220 + Math.random() * 120; // px
        const rot = (Math.random() - 0.5) * 720;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const delay = Math.random() * 0.4;
        const size = 6 + Math.random() * 6;

        piece.style.left = `${startX}%`;
        piece.style.top = '10px';
        piece.style.width = `${size}px`;
        piece.style.height = `${size * 1.2}px`;
        piece.style.backgroundColor = color;
        piece.style.setProperty('--confetti-x', `${destX}px`);
        piece.style.setProperty('--confetti-y', `${destY}px`);
        piece.style.setProperty('--confetti-rot', `${rot}deg`);
        piece.style.animationDelay = `${delay}s`;
        container.appendChild(piece);
      }
    }

    function openVerifyModal() {
      // If already verified, show elegant status view instead of rigid alert
      if (sessionUser && Number(sessionUser.is_student_verified) === 1) {
        step1?.classList.add('hidden');
        step2?.classList.add('hidden');
        stepSuccess?.classList.add('hidden');
        stepAlready?.classList.remove('hidden');

        const av = document.getElementById('alreadyVerifiedAvatar');
        const nm = document.getElementById('alreadyVerifiedName');
        const em = document.getElementById('alreadyVerifiedEmail');
        if (av) av.src = sessionUser.profile_image || DEFAULT_AVATAR;
        if (nm) nm.textContent = sessionUser.name + (sessionUser.nickname ? ` (${sessionUser.nickname})` : '');
        if (em) em.textContent = sessionUser.student_email || sessionUser.email || 'นักศึกษามหาวิทยาลัยขอนแก่น';

        modal?.classList.remove('hidden');
        return;
      }

      if (emailInput && !emailInput.value && sessionUser?.email) {
        if (sessionUser.email.includes('@')) {
          emailInput.value = sessionUser.email;
        }
      }
      step1?.classList.remove('hidden');
      step2?.classList.add('hidden');
      stepSuccess?.classList.add('hidden');
      stepAlready?.classList.add('hidden');
      if (notice) notice.textContent = '';
      modal?.classList.remove('hidden');
    }

    btnOpen?.addEventListener('click', openVerifyModal);
    btnOpenDiscover?.addEventListener('click', openVerifyModal);
    btnOpenHome?.addEventListener('click', openVerifyModal);

    btnClose?.addEventListener('click', () => modal?.classList.add('hidden'));
    btnCloseAlready?.addEventListener('click', () => modal?.classList.add('hidden'));
    btnDone?.addEventListener('click', () => {
      modal?.classList.add('hidden');
      showMatchToast('✨ บัญชีของคุณเปิดใช้งาน Verified Student เรียบร้อยแล้ว!');
    });

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
        alert('กรุณากรอกอีเมลมหาวิทยาลัยของคุณ เช่น yourname@kkumail.com');
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

        showMatchToast(`✉️ ส่งรหัส OTP ไปยัง ${res.target_email || email} แล้ว (ตรวจสอบกล่องจดหมาย/Junk)`);
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

        // SUCCESS ANIMATION TRANSITION (Replaces rigid alert!)
        step1?.classList.add('hidden');
        step2?.classList.add('hidden');
        stepAlready?.classList.add('hidden');
        stepSuccess?.classList.remove('hidden');

        // Populate user details in celebration card
        const celAvatar = document.getElementById('celebrateUserAvatar');
        const celName = document.getElementById('celebrateUserName');
        const celEmail = document.getElementById('celebrateUserEmail');
        if (celAvatar) celAvatar.src = sessionUser?.profile_image || DEFAULT_AVATAR;
        if (celName) celName.textContent = sessionUser?.name || 'นักศึกษา';
        if (celEmail) celEmail.textContent = pendingEmail;

        launchConfetti();

        // Refresh app state in background
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

  // ===================== CONVERSATION STARTERS (SMART ICEBREAKERS) =====================
  let currentIcebreakerPartnerId = null;
  let currentIcebreakerData = null;
  let currentIcebreakerCategory = 'mix';

  async function openIcebreakerModal(partnerId) {
    const modal = document.getElementById('conversationStarterModal');
    if (!modal) return;

    currentIcebreakerPartnerId = partnerId || null;
    currentIcebreakerCategory = 'mix';

    // Reset tabs UI
    document.querySelectorAll('.icebreaker-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.category === 'mix');
    });

    modal.classList.remove('hidden');
    await loadIcebreakerPrompts();
  }

  async function loadIcebreakerPrompts() {
    const listEl = document.getElementById('icebreakerPromptsList');
    const bannerEl = document.getElementById('icebreakerPartnerBanner');
    const avatarEl = document.getElementById('icebreakerPartnerAvatar');
    const nameEl = document.getElementById('icebreakerPartnerName');
    const majorEl = document.getElementById('icebreakerPartnerMajor');
    const tagsWrap = document.getElementById('icebreakerSharedTagsWrap');
    const countLabel = document.getElementById('icebreakerCountLabel');
    const tabShared = document.getElementById('tabIcebreakerShared');

    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center; padding:32px; color:#94a3b8;">⏳ กำลังสุ่มไอเดียเปิดบทสนทนา...</div>';

    try {
      const url = currentIcebreakerPartnerId 
        ? `/api/conversation-starters?target_user_id=${currentIcebreakerPartnerId}` 
        : '/api/conversation-starters';
      
      const data = await apiRequest(url);
      currentIcebreakerData = data;

      if (data.partner) {
        if (bannerEl) bannerEl.style.display = 'flex';
        if (avatarEl) avatarEl.src = data.partner.profile_image || 'uploads/avatars/default.png';
        if (nameEl) nameEl.textContent = data.partner.name + (data.partner.nickname ? ` (${data.partner.nickname})` : '');
        if (majorEl) majorEl.textContent = data.partner.major || 'มหาวิทยาลัยขอนแก่น';

        const shared = data.shared_interests || [];
        if (shared.length > 0) {
          if (tabShared) tabShared.style.display = 'inline-block';
          if (tagsWrap) {
            tagsWrap.innerHTML = `
              <span style="font-size:0.78rem; font-weight:700; color:#6b21a8; display:flex; align-items:center; gap:4px;">
                🎯 สนใจตรงกัน:
              </span>
              ${shared.map(t => `<span class="shared-tag-pill highlight">✨ ${escapeHtml(t)}</span>`).join('')}
            `;
          }
        } else {
          if (tabShared) tabShared.style.display = 'none';
          if (tagsWrap) {
            tagsWrap.innerHTML = `
              <span style="font-size:0.78rem; color:#64748b;">
                💡 สุ่มหัวข้อหลากหลายที่คัดสรรมาสำหรับเริ่มคุยกับ ${escapeHtml(data.partner.name)}
              </span>
            `;
          }
        }
      } else {
        if (bannerEl) bannerEl.style.display = 'none';
        if (tabShared) tabShared.style.display = 'none';
      }

      renderIcebreakerPromptsList();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#e11d48;">⚠️ ${err.message || 'ไม่สามารถโหลดคำแนะนำคุยได้'}</div>`;
      }
    }
  }

  function renderIcebreakerPromptsList() {
    const listEl = document.getElementById('icebreakerPromptsList');
    const countLabel = document.getElementById('icebreakerCountLabel');
    if (!listEl || !currentIcebreakerData) return;

    let items = [];
    const cat = currentIcebreakerCategory;

    if (cat === 'mix') {
      items = currentIcebreakerData.mixed_prompts || [];
    } else if (cat === 'shared') {
      items = currentIcebreakerData.categories?.shared || [];
    } else if (currentIcebreakerData.categories?.[cat]) {
      items = currentIcebreakerData.categories[cat];
    } else {
      items = currentIcebreakerData.mixed_prompts || [];
    }

    if (countLabel) {
      countLabel.textContent = `แสดง ${items.length} ไอเดียชวนคุย (${getCategoryTitle(cat)})`;
    }

    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:32px; color:#94a3b8;">
          <div style="font-size:2rem; margin-bottom:6px;">💭</div>
          <div>ยังไม่มีคำถามในหมวดนี้ ลองเลือก "สุ่มผสมทุกเรื่อง" หรือสุ่มใหม่ดูนะ!</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((p, idx) => `
      <div class="icebreaker-prompt-card ${p.badge?.includes('ตรงกัน') || p.badge?.includes('ร่วมกัน') ? 'shared-match' : ''}">
        <div class="prompt-badge-row">
          <span class="prompt-badge ${p.badge?.includes('ตรงกัน') || p.badge?.includes('ร่วมกัน') ? 'shared' : ''}">
            ${p.badge || '💡 ชวนคุย'}
          </span>
          <span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">#${idx + 1}</span>
        </div>
        <p class="prompt-text">${escapeHtml(p.text)}</p>
        <div class="prompt-card-actions">
          <button type="button" class="btn-prompt-copy" data-copy-text="${escapeHtml(p.text)}">
            📋 คัดลอก
          </button>
          <button type="button" class="btn-prompt-send" data-send-text="${escapeHtml(p.text)}">
            💬 ส่งเข้าแชท
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-copy-text]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copyText;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        btn.textContent = '✓ คัดลอกแล้ว';
        setTimeout(() => { btn.textContent = '📋 คัดลอก'; }, 2000);
        showMatchToast(`📋 คัดลอกคำถาม: "${text}"`);
      });
    });

    listEl.querySelectorAll('[data-send-text]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.sendText;
        document.getElementById('conversationStarterModal')?.classList.add('hidden');

        try {
          if (currentIcebreakerPartnerId) {
            const res = await apiRequest('/api/chats', {
              method: 'POST',
              body: JSON.stringify({ user_id: currentIcebreakerPartnerId })
            });
            if (res.chat?.id && window.matchSpaceChat) {
              await window.matchSpaceChat.openChatTabAndLoad(res.chat.id);
            } else {
              triggerTabSwitch('chat', 'slide-right');
            }
          } else {
            triggerTabSwitch('chat', 'slide-right');
          }
        } catch (e) {
          triggerTabSwitch('chat', 'slide-right');
        }

        setTimeout(() => {
          const msgInput = document.getElementById('messageInput');
          if (msgInput) {
            msgInput.value = text;
            msgInput.focus();
          }
        }, 250);

        showMatchToast(`💬 นำข้อความใส่ลงในช่องแชทแล้ว: "${text}"`);
      });
    });
  }

  function getCategoryTitle(cat) {
    const map = {
      mix: 'สุ่มผสมทุกเรื่อง',
      shared: 'ตรงกับความสนใจร่วมกัน',
      food: 'คาเฟ่ & อาหาร',
      campus: 'ชีวิตมหาลัย & เรียน',
      hobbies: 'กิจกรรม & เกม',
      entertainment: 'หนัง & เพลง',
      fun: 'ชวนคิด & สนุกๆ'
    };
    return map[cat] || 'ไอเดียชวนคุย';
  }

  function setupConversationStarterModal() {
    const modal = document.getElementById('conversationStarterModal');
    const btnClose = document.getElementById('closeConversationStarterModal');
    const btnShuffle = document.getElementById('btnShuffleIcebreakers');
    const tabsBar = document.getElementById('icebreakerTabsBar');

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'conversationStarterModal') modal.classList.add('hidden');
      });
    }

    if (btnShuffle) {
      btnShuffle.addEventListener('click', async () => {
        const icon = btnShuffle.querySelector('.shuffle-icon');
        if (icon) icon.style.transform = 'rotate(360deg)';
        await loadIcebreakerPrompts();
        setTimeout(() => { if (icon) icon.style.transform = ''; }, 400);
      });
    }

    if (tabsBar) {
      tabsBar.querySelectorAll('.icebreaker-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          tabsBar.querySelectorAll('.icebreaker-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentIcebreakerCategory = tab.dataset.category || 'mix';
          renderIcebreakerPromptsList();
        });
      });
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
    openIcebreakerModal,
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
