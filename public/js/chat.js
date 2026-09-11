/**
 * MatchSpace Real-Time Chat Controller
 * Powered by WebSockets - replaces HTTP polling with zero lag and instant messaging.
 */

window.matchSpaceChat = (function () {
  let currentChatId = null;
  let currentPartnerId = null;
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

    // Real-time messages read receipts
    ws.on('messages_read', (data) => {
      if (Number(data.chatId) === Number(currentChatId)) {
        document.querySelectorAll('.msg-wrapper.me .read-check').forEach(el => {
          el.className = 'read-check is-read';
          el.title = 'อ่านแล้ว';
          el.textContent = '✓✓ อ่านแล้ว';
        });
      }
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
    const isRead = Number(msg.is_read) === 1;

    const deleteBtnHtml = canDelete ? `<button type="button" class="btn-delete-msg" data-msg-id="${msg.id}" title="ลบข้อความ"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';

    const wrapper = document.createElement('div');
    wrapper.dataset.msgItemId = msg.id;

    if (isMe) {
      wrapper.className = 'msg-wrapper me fade-in';
      const readStatusHtml = `<span class="msg-read-status"><span class="read-check ${isRead ? 'is-read' : ''}">${isRead ? '✓✓ อ่านแล้ว' : '✓ ส่งแล้ว'}</span></span>`;
      wrapper.innerHTML = `
        <div class="msg-content-col">
          <div class="bubble me">
            <div class="bubble-text">${escapeHtml(msg.content)}</div>
            <div class="bubble-meta">
              <span class="msg-time me-time">${timeStr}</span>
              ${readStatusHtml}
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
        if (chatLayout) {
          chatLayout.classList.add('chat-open');
          document.body.classList.add('in-chat-mobile');
        }
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
        const isBlocked = !!data.chat.is_blocked;
        const blockedByMe = !!data.chat.blocked_by_me;
        const blockLabel = blockedByMe ? 'ปลดบล็อก' : 'บล็อก';
        const blockIcon = blockedByMe ? '🔓' : '🚫';

        headerActions.innerHTML = `
          <button type="button" class="btn-chat-icebreaker-trigger" id="btnChatIcebreakerTrigger" title="คำแนะนำเริ่มต้นคุย" aria-label="คำแนะนำเริ่มต้นคุย">
            <span class="btn-chat-icon">💡</span><span class="btn-chat-label">ไอเดียคุย</span>
          </button>
          <button type="button" class="btn-chat-view-profile" data-open-profile-id="${data.chat.partner_id}" title="ดูโปรไฟล์" aria-label="ดูโปรไฟล์">
            <span class="btn-chat-icon">🔍</span><span class="btn-chat-label">ดูโปรไฟล์</span>
          </button>
          <button type="button" class="btn-chat-block" data-chat-block-action="${blockBtnAction}" data-partner-id="${data.chat.partner_id}" title="${blockIcon} ${blockLabel}" aria-label="${blockLabel}">
            <span class="btn-chat-icon">${blockIcon}</span><span class="btn-chat-label">${blockLabel}</span>
          </button>
        `;

        headerActions.querySelector('#btnChatIcebreakerTrigger')?.addEventListener('click', () => {
          if (window.matchSpaceApp?.openIcebreakerModal) {
            window.matchSpaceApp.openIcebreakerModal(Number(data.chat.partner_id));
          }
        });

        headerActions.querySelector('[data-open-profile-id]')?.addEventListener('click', () => {
          if (window.matchSpaceApp?.openProfileModal) {
            window.matchSpaceApp.openProfileModal(Number(data.chat.partner_id));
          }
        });

        headerActions.querySelector('[data-chat-block-action]')?.addEventListener('click', async () => {
          if (blockBtnAction === 'block') {
            if (confirm(`คุณต้องการบล็อก ${data.chat.partner_name || 'ผู้ใช้นี้'} ใช่หรือไม่?\nหลังจากบล็อกแล้วจะไม่สามารถมองเห็นโปรไฟล์และส่งข้อความหากันได้`)) {
              try {
                await apiRequest(`/api/users/${data.chat.partner_id}/block`, { method: 'POST' });
                alert('บล็อกผู้ใช้เรียบร้อยแล้ว');
                await loadChats();
                await loadMessages(currentChatId);
              } catch(e) {
                alert(e.message || 'เกิดข้อผิดพลาดในการบล็อก');
              }
            }
          } else {
            if (confirm(`คุณต้องการปลดบล็อก ${data.chat.partner_name || 'ผู้ใช้นี้'} ใช่หรือไม่?`)) {
              try {
                await apiRequest(`/api/users/${data.chat.partner_id}/unblock`, { method: 'DELETE' });
                alert('ปลดบล็อกผู้ใช้เรียบร้อยแล้ว');
                await loadChats();
                await loadMessages(currentChatId);
              } catch(e) {
                alert(e.message || 'เกิดข้อผิดพลาดในการปลดบล็อก');
              }
            }
          }
        });
      } else {
        headerActions.innerHTML = '';
      }
    }

    // Handle blocked chat state for inputs
    const isBlocked = !!data.chat.is_blocked;
    const blockedByMe = !!data.chat.blocked_by_me;
    if (messageInput) {
      if (isBlocked) {
        messageInput.disabled = true;
        messageInput.placeholder = blockedByMe ? 'คุณได้บล็อกผู้ใช้นี้ ไม่สามารถส่งข้อความได้' : 'การสนทนานี้ถูกระงับเนื่องจากการบล็อก';
      } else {
        messageInput.disabled = false;
        messageInput.placeholder = 'พิมพ์ข้อความ...';
      }
    }
    if (sendMessageBtn) {
      sendMessageBtn.disabled = isBlocked;
    }

    let blockBannerHtml = '';
    if (isBlocked) {
      blockBannerHtml = `
        <div class="chat-blocked-banner">
          <span>🚫 ${blockedByMe ? 'คุณได้บล็อกผู้ใช้นี้ คุณจะไม่ได้รับข้อความจากกัน' : 'การสนทนานี้ถูกระงับเนื่องจากมีการบล็อกผู้ใช้งาน'}</span>
          ${blockedByMe && data.chat.partner_id ? `<button type="button" class="btn-unblock-inline" data-inline-unblock-id="${data.chat.partner_id}">ปลดบล็อก</button>` : ''}
        </div>
      `;
    }

    const isHost = data.chat.activity_id && Number(data.chat.creator_id) === Number(currentUser?.id);
    const isOwner = currentUser && currentUser.role === 'owner';

    if (!data.messages || data.messages.length === 0) {
      messageThread.innerHTML = `
        ${blockBannerHtml}
        <div class="chat-empty-placeholder">
          <div class="chat-empty-icon">✨</div>
          <div class="chat-empty-title">เริ่มต้นการสนทนา</div>
          <div class="chat-empty-desc">ส่งข้อความทักทายแรกเพื่อเริ่มต้นมิตรภาพดีๆ ได้เลย!</div>
        </div>
      `;
      setupBlockInlineHandler(data.chat.partner_id);
      return;
    }

    const messagesHtml = data.messages.map((msg) => {
      const isMe = Number(msg.sender_id) === Number(currentUser?.id);
      const isMsgHost = data.chat.activity_id && Number(msg.sender_id) === Number(data.chat.creator_id);
      const canDelete = isMe || isHost || isOwner;
      const timeStr = formatChatTime(msg.created_at);
      const isRead = Number(msg.is_read) === 1;

      const hostBadgeHtml = isMsgHost ? '<span class="host-badge">👑 หัวหน้า</span>' : '';
      const deleteBtnHtml = canDelete ? `<button type="button" class="btn-delete-msg" data-msg-id="${msg.id}" title="ลบข้อความ"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';

      const senderAvatar = msg.sender_profile_image
        ? `<img src="${escapeHtml(msg.sender_profile_image)}" class="chat-msg-avatar" alt="${escapeHtml(msg.sender_name || '')}" />`
        : `<div class="chat-msg-avatar-initial">${escapeHtml((msg.sender_name || 'U').charAt(0).toUpperCase())}</div>`;

      if (isMe) {
        const readStatusHtml = `<span class="msg-read-status"><span class="read-check ${isRead ? 'is-read' : ''}" title="${isRead ? 'อ่านแล้ว' : 'ส่งแล้ว'}">${isRead ? '✓✓ อ่านแล้ว' : '✓ ส่งแล้ว'}</span></span>`;
        return `
          <div class="msg-wrapper me" data-msg-item-id="${msg.id}">
            <div class="msg-content-col">
              <div class="bubble me">
                <div class="bubble-text">${escapeHtml(msg.content)}</div>
                <div class="bubble-meta">
                  <span class="msg-time me-time">${timeStr}</span>
                  ${readStatusHtml}
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

    messageThread.innerHTML = blockBannerHtml + messagesHtml;
    messageThread.scrollTop = messageThread.scrollHeight;

    setupBlockInlineHandler(data.chat.partner_id);

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

  function setupBlockInlineHandler(partnerId) {
    const inlineBtn = messageThread?.querySelector('[data-inline-unblock-id]');
    if (inlineBtn) {
      inlineBtn.addEventListener('click', async () => {
        const targetId = inlineBtn.dataset.inlineUnblockId || partnerId;
        if (confirm('คุณต้องการปลดบล็อกผู้ใช้นี้ใช่หรือไม่?')) {
          try {
            await apiRequest(`/api/users/${targetId}/unblock`, { method: 'DELETE' });
            alert('ปลดบล็อกสำเร็จ');
            await loadChats();
            await loadMessages(currentChatId);
          } catch(e) {
            alert(e.message || 'เกิดข้อผิดพลาดในการปลดบล็อก');
          }
        }
      });
    }
  }

  async function loadMessages(chatId) {
    try {
      currentChatId = Number(chatId);

      // Join real-time WebSocket room
      if (window.matchSpaceWS) {
        window.matchSpaceWS.joinChat(currentChatId);
        window.matchSpaceWS.markRead(currentChatId);
      }

      // Mark read via API
      apiRequest(`/api/chats/${currentChatId}/read`, { method: 'POST' }).catch(() => {});

      const data = await apiRequest(`/api/chats/${currentChatId}/messages`);
      renderMessageList(data);

      if (!data.chat.activity_id && data.chat.type !== 'group' && !data.chat.is_blocked) {
        currentPartnerId = Number(data.chat.partner_id) || null;
        await loadGreetingSuggestions(currentPartnerId);
      } else {
        currentPartnerId = null;
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
    if (chatLayout) {
      chatLayout.classList.add('chat-open');
      document.body.classList.add('in-chat-mobile');
    }
    await loadChats();
    await loadMessages(chatId);
  }

  async function loadGreetingSuggestions(partnerId) {
    const container = document.getElementById('greetingSuggestions');
    const chipsEl = document.getElementById('greetingChips');
    if (!container || !chipsEl) return;

    try {
      const pid = partnerId || currentPartnerId;
      const url = pid ? `/api/greetings?target_user_id=${pid}` : '/api/greetings';
      const greetings = await apiRequest(url);
      const shuffled = greetings.sort(() => 0.5 - Math.random()).slice(0, 4);
      chipsEl.innerHTML = shuffled.map(g => `<div class="greeting-chip" title="${escapeHtml(g)}">${escapeHtml(g)}</div>`).join('');
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
        document.body.classList.remove('in-chat-mobile');
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

    const shuffleGreetingsBtn = document.getElementById('btnShuffleGreetingChips');
    if (shuffleGreetingsBtn) {
      shuffleGreetingsBtn.addEventListener('click', () => {
        loadGreetingSuggestions(currentPartnerId);
      });
    }

    const viewAllIcebreakersBtn = document.getElementById('btnViewAllIcebreakers');
    if (viewAllIcebreakersBtn) {
      viewAllIcebreakersBtn.addEventListener('click', () => {
        if (window.matchSpaceApp?.openIcebreakerModal) {
          window.matchSpaceApp.openIcebreakerModal(currentPartnerId);
        }
      });
    }

    const topIcebreakerBtn = document.getElementById('btnOpenIcebreakerChat');
    if (topIcebreakerBtn) {
      topIcebreakerBtn.addEventListener('click', () => {
        if (window.matchSpaceApp?.openIcebreakerModal) {
          window.matchSpaceApp.openIcebreakerModal(currentPartnerId);
        }
      });
    }
  }

  return {
    initChat,
    loadChats,
    loadMessages,
    openChatTabAndLoad,
    getCurrentChatId: () => currentChatId,
    getCurrentPartnerId: () => currentPartnerId,
    loadGreetingSuggestions
  };
})();
