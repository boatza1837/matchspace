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

const app = express();
const httpServer = http.createServer(app);
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

// Initialize Real-time WebSocket server
initWebSocketServer(httpServer);

// Session configuration with Persistent Database Store
app.use(session({
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
}));

// Body parsers & static assets
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// Fallback image mirror from Railway for uploaded photos and avatars
app.use('/uploads', async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const filename = req.path;
  const railwayUrl = `https://matchspace-production-b035.up.railway.app/uploads${filename}`;
  try {
    const upstream = await fetch(railwayUrl);
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

// System Railway Inspection & Recovery endpoints
app.get('/api/system/inspect-railway', async (req, res) => {
  const token = req.query.token;
  if (token !== 'matchspace_owner_sync_2026') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const result = {
      cwd: process.cwd(),
      hasDataDir: fs.existsSync('/data'),
      dataFiles: [],
      uploadsFiles: [],
      dbCandidates: []
    };

    if (fs.existsSync('/data')) {
      try {
        result.dataFiles = fs.readdirSync('/data');
      } catch (e) {
        result.dataFilesError = e.message;
      }
      const dataUploads = '/data/uploads';
      if (fs.existsSync(dataUploads)) {
        try {
          result.uploadsFiles = fs.readdirSync(dataUploads);
        } catch (e) {
          result.uploadsFilesError = e.message;
        }
      }
    }

    const searchDirs = ['/data', process.cwd(), path.join(process.cwd(), 'public', 'uploads')];
    for (const d of searchDirs) {
      if (fs.existsSync(d)) {
        try {
          const files = fs.readdirSync(d);
          for (const f of files) {
            if (f.endsWith('.db') || f.endsWith('.sqlite') || f.endsWith('.bak')) {
              const full = path.join(d, f);
              const st = fs.statSync(full);
              result.dbCandidates.push({ path: full, size: st.size, modified: st.mtime });
            }
          }
        } catch (e) {}
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.get('/api/system/dump-railway-db', (req, res) => {
  const token = req.query.token;
  if (token !== 'matchspace_owner_sync_2026') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const targetPath = req.query.path || '/data/matchspace.db';
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `File not found: ${targetPath}` });
  }
  try {
    const { DatabaseSync } = require('node:sqlite');
    const localDb = new DatabaseSync(targetPath);
    const tables = localDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const data = {};
    for (const t of tables) {
      if (!t.name.startsWith('sqlite_')) {
        data[t.name] = localDb.prepare(`SELECT * FROM ${t.name}`).all();
      }
    }
    res.json({ ok: true, file: targetPath, tables: Object.keys(data), data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

app.get('/api/system/download-railway-file', (req, res) => {
  const token = req.query.token;
  if (token !== 'matchspace_owner_sync_2026') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});


// Mount modular API routes
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
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[Server] MatchSpace running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Server Init Error]', err);
  });

module.exports = { app, httpServer };
