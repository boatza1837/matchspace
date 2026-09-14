const fs = require('fs');
const cloudinary = require('cloudinary').v2;

function initCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || '497266731549786';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || 'btSjZhjzVjDldJ6V0x4GqXZUdKo';

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    return true;
  }
  return false;
}

function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME);
}

/**
 * Handle uploaded multer file: upload to Cloudinary if configured, else return /uploads/<filename>
 * @param {object} file - Express Multer file object
 * @returns {Promise<string>} Public URL of the uploaded image
 */
async function processUploadedFile(file) {
  if (!file) return '';
  const fallbackUrl = `/uploads/${file.filename}`;

  if (!isCloudinaryConfigured()) {
    return fallbackUrl;
  }

  try {
    initCloudinary();
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'matchspace/uploads',
      resource_type: 'image',
      format: 'webp',
      quality: 'auto:good'
    });

    if (result && result.secure_url) {
      // Clean up local temp file to keep container disk completely empty
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (e) {}
      return result.secure_url;
    }
  } catch (err) {
    console.error('[Cloudinary Upload Failed, using local disk fallback]:', err.message);
  }

  return fallbackUrl;
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  processUploadedFile
};
