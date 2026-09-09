const { db } = require('../config/db');

function formatUser(row) {
  if (!row) return null;
  const { password, plain_password, encrypted_password, ...safeUser } = row;
  return { ...safeUser, is_admin: Boolean(safeUser.is_admin) };
}

async function requireAuth(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }

  const dbUser = await db.get('SELECT is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0) {
    req.session.destroy(() => {
      if (isHtmlReq) return res.redirect('/');
      res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล', banned: true });
    });
    return;
  }
  next();
}

async function requireAdmin(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }

  const dbUser = await db.get('SELECT is_admin, role, is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0 || (!dbUser.is_admin && dbUser.role !== 'admin' && dbUser.role !== 'owner')) {
    req.session.destroy(() => {
      if (isHtmlReq) return res.redirect('/');
      res.status(403).json({ message: 'ต้องเป็นผู้ดูแลระบบ (Admin/Owner)' });
    });
    return;
  }
  next();
}

async function requireOwner(req, res, next) {
  const isHtmlReq = req.headers.accept && req.headers.accept.includes('text/html');
  if (!req.session || !req.session.user) {
    if (isHtmlReq) return res.redirect('/');
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }

  const dbUser = await db.get('SELECT role, is_active FROM users WHERE id = ?', [req.session.user.id]);
  if (!dbUser || dbUser.is_active === 0 || dbUser.role !== 'owner') {
    if (isHtmlReq) return res.redirect('/');
    return res.status(403).json({ message: 'สิทธิ์การใช้งานระดับ Owner เท่านั้น' });
  }
  next();
}

module.exports = {
  formatUser,
  requireAuth,
  requireAdmin,
  requireOwner
};
