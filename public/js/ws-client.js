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
