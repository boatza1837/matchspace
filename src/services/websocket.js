const { WebSocketServer, WebSocket } = require('ws');
const { ServerResponse } = require('http');
const { db } = require('../config/db');
const { getChatAccess } = require('./chat-access');

let wss = null;
const userSockets = new Map();
const chatRooms = new Map();

async function sessionUser(req) {
  await new Promise((resolve, reject) => req.session.reload(err => err ? reject(err) : resolve()));
  const id = req.session?.user?.id;
  if (!id) return null;
  const user = await db.get('SELECT id, name, is_active FROM users WHERE id = ?', [id]);
  return user && user.is_active !== 0 ? user : null;
}

function initWebSocketServer(httpServer, sessionMiddleware) {
  wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  httpServer.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const reject = () => { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); };
    try {
      if (new URL(req.url, 'http://localhost').pathname !== '/ws') return reject();
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reject();
    } catch { return reject(); }
    sessionMiddleware(req, new ServerResponse(req), async err => {
      try {
        if (err || !req.session?.user) return reject();
        const user = await sessionUser(req);
        if (!user) return reject();
        req.wsUser = user;
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
      } catch { reject(); }
    });
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.userId = Number(req.wsUser.id);
    ws.currentChatId = null;
    ws.request = req;
    if (!userSockets.has(ws.userId)) userSockets.set(ws.userId, new Set());
    userSockets.get(ws.userId).add(ws);
    ws.send(JSON.stringify({ type: 'auth_success', userId: ws.userId }));
    ws.on('pong', () => { ws.isAlive = true; });
    let queue = Promise.resolve();
    let pending = 0;
    ws.on('message', data => {
      if (++pending > 30) { ws.close(1008, 'Too many messages'); pending--; return; }
      queue = queue.then(async () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const msg = JSON.parse(data);
        const user = await sessionUser(req);
        if (!user || Number(user.id) !== ws.userId) return ws.close(1008, 'Session expired');
        await handleWsMessage(ws, msg, user);
      }).catch(() => {
        ws.close(1008, 'Invalid message or session');
      }).finally(() => { pending--; });
    });
    ws.on('close', () => cleanupSocket(ws));
    ws.on('error', () => cleanupSocket(ws));
  });

  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  interval.unref();
  wss.on('close', () => clearInterval(interval));
  return wss;
}

async function handleWsMessage(ws, msg, user) {
  // Older clients send auth; acknowledge only the identity from their session.
  if (msg.type === 'auth') {
    ws.send(JSON.stringify({ type: 'auth_success', userId: ws.userId }));
    return;
  }
  if (msg.type === 'leave_chat') { leaveRoom(ws); return; }
  if (!['join_chat', 'typing', 'stop_typing', 'mark_read'].includes(msg.type)) return;
  const chatId = Number(msg.chatId);
  if (!await getChatAccess(ws.userId, chatId)) {
    ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', chatId }));
    return;
  }
  if (msg.type === 'join_chat') {
    leaveRoom(ws);
    ws.currentChatId = chatId;
    if (!chatRooms.has(chatId)) chatRooms.set(chatId, new Set());
    chatRooms.get(chatId).add(ws);
  } else if (msg.type === 'mark_read') {
    const now = new Date().toISOString();
    await db.run('UPDATE chat_messages SET is_read = 1, read_at = ? WHERE chat_id = ? AND sender_id != ? AND (is_read = 0 OR is_read IS NULL)', [now, chatId, ws.userId]);
    broadcastToChat(chatId, { type: 'messages_read', chatId, readerId: ws.userId, readAt: now });
  } else if (ws.currentChatId === chatId) {
    broadcastToChat(chatId, { type: msg.type, chatId, userId: ws.userId, userName: user.name }, ws.userId);
  }
}

function leaveRoom(ws) {
  const room = chatRooms.get(ws.currentChatId);
  if (room) {
    room.delete(ws);
    if (!room.size) chatRooms.delete(ws.currentChatId);
  }
  ws.currentChatId = null;
}

function cleanupSocket(ws) {
  const sockets = userSockets.get(ws.userId);
  if (sockets) {
    sockets.delete(ws);
    if (!sockets.size) userSockets.delete(ws.userId);
  }
  leaveRoom(ws);
}

async function deliver(ws, payload, chatId) {
  try {
    const user = await sessionUser(ws.request);
    if (!user || Number(user.id) !== ws.userId) return ws.close(1008, 'Session expired');
    if (chatId && (!await getChatAccess(ws.userId, chatId) || ws.currentChatId !== chatId)) return;
    if (ws.readyState === WebSocket.OPEN) ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch { ws.close(1008, 'Session expired'); }
}

function broadcastToChat(chatId, payload, excludeUserId = null) {
  const id = Number(chatId);
  for (const ws of chatRooms.get(id) || []) {
    if (ws.userId !== Number(excludeUserId)) void deliver(ws, payload, id);
  }
}

function sendToUser(userId, payload) {
  for (const ws of userSockets.get(Number(userId)) || []) void deliver(ws, payload);
}

function broadcastGlobal(payload) {
  if (wss) for (const ws of wss.clients) void deliver(ws, payload);
}

module.exports = { initWebSocketServer, broadcastToChat, sendToUser, broadcastGlobal };
