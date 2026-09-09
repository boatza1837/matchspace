const { WebSocketServer, WebSocket } = require('ws');

let wss = null;
// Map: userId -> Set<WebSocket>
const userSockets = new Map();
// Map: chatId -> Set<WebSocket>
const chatRooms = new Map();

function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.currentChatId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleWsMessage(ws, msg);
      } catch (err) {
        console.error('[WS Parse Error]', err.message);
      }
    });

    ws.on('close', () => {
      cleanupSocket(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS Socket Error]', err.message);
      cleanupSocket(ws);
    });
  });

  // Heartbeat ping interval to prune dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('[WebSocket] Real-time WebSocket server initialized on /ws');
  return wss;
}

function handleWsMessage(ws, msg) {
  switch (msg.type) {
    case 'auth': {
      // Associate socket with userId
      const userId = Number(msg.userId);
      if (userId) {
        ws.userId = userId;
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(ws);
        ws.send(JSON.stringify({ type: 'auth_success', userId }));
      }
      break;
    }

    case 'join_chat': {
      const chatId = Number(msg.chatId);
      if (chatId) {
        if (ws.currentChatId && chatRooms.has(ws.currentChatId)) {
          chatRooms.get(ws.currentChatId).delete(ws);
        }
        ws.currentChatId = chatId;
        if (!chatRooms.has(chatId)) {
          chatRooms.set(chatId, new Set());
        }
        chatRooms.get(chatId).add(ws);
      }
      break;
    }

    case 'leave_chat': {
      if (ws.currentChatId && chatRooms.has(ws.currentChatId)) {
        chatRooms.get(ws.currentChatId).delete(ws);
        ws.currentChatId = null;
      }
      break;
    }

    case 'typing': {
      const chatId = Number(msg.chatId);
      if (chatId && chatRooms.has(chatId)) {
        const payload = JSON.stringify({
          type: 'typing',
          chatId,
          userId: ws.userId,
          userName: msg.userName || 'คู่สนทนา'
        });
        chatRooms.get(chatId).forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
      break;
    }

    case 'stop_typing': {
      const chatId = Number(msg.chatId);
      if (chatId && chatRooms.has(chatId)) {
        const payload = JSON.stringify({
          type: 'stop_typing',
          chatId,
          userId: ws.userId
        });
        chatRooms.get(chatId).forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
      break;
    }

    default:
      break;
  }
}

function cleanupSocket(ws) {
  if (ws.userId && userSockets.has(ws.userId)) {
    const sockets = userSockets.get(ws.userId);
    sockets.delete(ws);
    if (sockets.size === 0) userSockets.delete(ws.userId);
  }
  if (ws.currentChatId && chatRooms.has(ws.currentChatId)) {
    chatRooms.get(ws.currentChatId).delete(ws);
    if (chatRooms.get(ws.currentChatId).size === 0) chatRooms.delete(ws.currentChatId);
  }
}

function broadcastToChat(chatId, payload, excludeUserId = null) {
  const cId = Number(chatId);
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (chatRooms.has(cId)) {
    chatRooms.get(cId).forEach((client) => {
      if (client.readyState === WebSocket.OPEN && (!excludeUserId || client.userId !== Number(excludeUserId))) {
        client.send(data);
      }
    });
  }
}

function sendToUser(userId, payload) {
  const uId = Number(userId);
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (userSockets.has(uId)) {
    userSockets.get(uId).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

function broadcastGlobal(payload) {
  if (!wss) return;
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

module.exports = {
  initWebSocketServer,
  broadcastToChat,
  sendToUser,
  broadcastGlobal
};
