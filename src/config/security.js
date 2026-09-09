const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      });
    }
  } catch (e) {
    console.warn('[Env] Could not load .env file:', e.message);
  }
}

// === AES-256-GCM Password Encryption Configuration ===
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const rawKey = process.env.PASSWORD_ENCRYPT_KEY || 'matchspace_default_encryption_key_32bytes!!';
// SHA-256 ensures key is strictly 32 bytes (256 bits)
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(rawKey)).digest();

function encryptPassword(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) {
    return null;
  }
  try {
    const [ivHex, authTagHex, encryptedHex] = cipherText.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) return null;
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[decryptPassword Error]', err.message);
    return null;
  }
}

function hashPassword(plainText) {
  return bcrypt.hashSync(String(plainText), 10);
}

function comparePassword(plainText, hash) {
  return bcrypt.compareSync(String(plainText), String(hash));
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'matchspace-session-secret-key-prod-2026';

module.exports = {
  encryptPassword,
  decryptPassword,
  hashPassword,
  comparePassword,
  SESSION_SECRET
};
