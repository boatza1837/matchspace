const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isRailwayVolume = fs.existsSync('/data');
const dataDir = process.env.DATA_DIR || (isRailwayVolume ? '/data' : path.join(__dirname, '..', '..'));
const uploadsDir = (process.env.DATA_DIR || isRailwayVolume)
  ? path.join(dataDir, 'uploads')
  : path.join(__dirname, '..', '..', 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const avatarsDir = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}
const defaultIconSrc = path.join(__dirname, '..', '..', 'public', 'icons', 'default-avatar.svg');
const defaultSvgTarget = path.join(avatarsDir, 'default.svg');
if (fs.existsSync(defaultIconSrc) && !fs.existsSync(defaultSvgTarget)) {
  try { fs.copyFileSync(defaultIconSrc, defaultSvgTarget); } catch (e) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

const multiUpload = upload.fields([
  { name: 'profile_image_file', maxCount: 1 },
  { name: 'photos', maxCount: 6 }
]);

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'ไฟล์ต้องไม่เกิน 5MB' });
    }
    return res.status(400).json({ message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' });
  }
  if (err && err.message === 'อนุญาตเฉพาะไฟล์รูปภาพ') {
    return res.status(400).json({ message: err.message });
  }
  next(err);
}

module.exports = {
  upload,
  multiUpload,
  uploadsDir,
  handleMulterError
};
