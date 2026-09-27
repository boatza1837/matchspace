const dns = require('dns');
if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const http = require('http');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Core configurations
const { SESSION_SECRET } = require('./src/config/security');
const { initDatabase } = require('./src/config/db');
const DatabaseSessionStore = require('./src/config/session-store');

// Middlewares
const { requireAuth, requireAdmin } = require('./src/middlewares/auth');
const { uploadsDir, handleMulterError } = require('./src/middlewares/upload');

// Services
const { initWebSocketServer } = require('./src/services/websocket');
const { recordPageVisit } = require('./src/services/analytics.service');

// Route Modules
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const { router: chatRoutes } = require('./src/routes/chat.routes');
const activityRoutes = require('./src/routes/activity.routes');
const reportRoutes = require('./src/routes/report.routes');
const adminRoutes = require('./src/routes/admin.routes');
const blockRoutes = require('./src/routes/block.routes');
const verifyRoutes = require('./src/routes/verify.routes');
const notificationRoutes = require('./src/routes/notification.routes');

const privacyRoutes = require('./src/routes/privacy.routes');
const { initPrivacy } = require('./src/services/privacy');
const app = express();
const httpServer = http.createServer(app);
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');



// Session configuration with Persistent Database Store
const sessionMiddleware = session({
  name: 'matchspace.sid.v2',
  store: new DatabaseSessionStore(),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
});
app.use(sessionMiddleware);
initWebSocketServer(httpServer, sessionMiddleware);

// Body parsers & static assets
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// Analytics Visitor Tracking Middleware for HTML/Page requests
app.use((req, res, next) => {
  if (req.method === 'GET') {
    const p = req.path;
    const isAsset = p.includes('.') || p.startsWith('/uploads') || p.startsWith('/api') || p.startsWith('/ws');
    if (!isAsset) {
      recordPageVisit(req, p).catch(() => {});
    }
  }
  next();
});

// Client-side analytics ping endpoint
app.post('/api/analytics/track', (req, res) => {
  const { path: pagePath } = req.body || {};
  if (pagePath) {
    recordPageVisit(req, String(pagePath)).catch(() => {});
  }
  res.json({ ok: true });
});

// Bidirectional image mirror fallback between Railway and Render
app.use('/uploads', async (req, res, next) => {
  if (req.method !== 'GET' || req.get('X-MatchSpace-Mirror') === '1') return next();
  const filename = req.path;
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || fs.existsSync('/data'));
  const remoteBase = isRailway
    ? 'https://matchspace.onrender.com'
    : 'https://matchspace-production-b035.up.railway.app';
  const remoteUrl = `${remoteBase}/uploads${filename}`;
  try {
    const upstream = await fetch(remoteUrl, { headers: { 'X-MatchSpace-Mirror': '1' }, signal: AbortSignal.timeout(4000) });
    if (upstream.ok) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const localFilePath = path.join(uploadsDir, filename);
      try {
        fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
        fs.writeFileSync(localFilePath, buffer);
      } catch (e) {}
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }
  } catch (e) {}
  next();
});

// Health check & System sync trigger
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'MatchSpace API is running', timestamp: new Date() });
});

// Mount modular API routes
app.use(privacyRoutes);
app.use(authRoutes);
app.use(userRoutes);
app.use(chatRoutes);
app.use(activityRoutes);
app.use(reportRoutes);
app.use(adminRoutes);
app.use(blockRoutes);
app.use(verifyRoutes);
app.use(notificationRoutes);

// Multer error handling middleware
app.use(handleMulterError);

// Page HTML routes
app.get('/privacy', (req,res) => res.sendFile(path.join(publicDir, 'privacy.html')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'app.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get(['/admin/users', '/admin-users'], requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin-users.html'));
});

app.get('/report', (req, res) => {
  res.sendFile(path.join(publicDir, 'report.html'));
});

app.get(['/survey', '/evaluation', '/feedback', '/satisfaction'], (req, res) => {
  res.redirect('https://kku-creative.my.canva.site/matchspace-satisfaction-survey');
});

app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.is_admin) return res.redirect('/admin');
    return res.redirect('/app');
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Boot Database then start HTTP & WebSocket Server
initDatabase()
  .then(async () => {
    await initPrivacy();

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] MatchSpace running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Server Init Error]', err);
  });

module.exports = { app, httpServer };
