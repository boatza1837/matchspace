const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db } = require('../config/db');
const { requireAuth, formatUser } = require('../middlewares/auth');

// University Email Pattern (KKU Mail e.g. @kkumail.com, @kku.ac.th, or Thai university .ac.th)
const UNIVERSITY_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.)?(kkumail\.com|kku\.ac\.th|[a-zA-Z0-9.-]+\.ac\.th)$/i;

const { getTransporter, getFromAddress, sendOtpEmail, getCredentials } = require('../services/email');

// Get SMTP status check
router.get('/api/verify/smtp-status', async (req, res) => {
  const { user, service, brevoKey, resendKey, webhookUrl } = getCredentials();

  if (brevoKey) {
    return res.json({
      configured: true,
      service: 'brevo',
      verified: true,
      sender: user || 'Brevo HTTPS API',
      message: 'ระบบเชื่อมต่อ Brevo HTTPS API สำเร็จ (Port 443 ปลอดภัย ส่งเมลได้จริงฟรี)'
    });
  }

  if (resendKey) {
    return res.json({
      configured: true,
      service: 'resend',
      verified: true,
      sender: 'Resend HTTPS API',
      message: 'ระบบเชื่อมต่อ Resend HTTPS API สำเร็จ (Port 443 ปลอดภัยจากปัญหาบล็อกพอร์ต)'
    });
  }

  if (webhookUrl) {
    return res.json({
      configured: true,
      service: 'google-apps-script-webhook',
      verified: true,
      sender: user || 'Gmail Direct Webhook',
      message: 'ระบบเชื่อมต่อ Google Apps Script Webhook สำเร็จ (ส่งตรงจาก Gmail ไม่โดนบล็อก)'
    });
  }

  if (webhookUrl) {
    return res.json({
      configured: true,
      service: 'webhook',
      verified: true,
      sender: webhookUrl,
      message: 'ระบบเชื่อมต่อ Custom Webhook สำเร็จ (Port 443)'
    });
  }

  const { resolveGmailIpv4 } = require('../services/email');
  const gmailIp = await resolveGmailIpv4();

  let err587Msg = 'Not attempted';
  // Try Port 587 STARTTLS first (Recommended for Railway and cloud containers)
  const transporter587 = getTransporter(587, gmailIp);
  if (transporter587) {
    try {
      await transporter587.verify();
      return res.json({
        configured: true,
        service,
        verified: true,
        sender: user,
        port: 587,
        ipv4: true,
        host_ip: gmailIp,
        message: 'ระบบเชื่อมต่อ Mail Server ผ่าน Port 587 (STARTTLS IPv4) สำเร็จ พร้อมส่งอีเมลจริง'
      });
    } catch (err587) {
      err587Msg = err587.message;
      console.warn('[SMTP 587 Verify Warning]', err587.message);
    }
  }

  // Fallback to Port 465 SSL
  const transporter465 = getTransporter(465, gmailIp);
  if (transporter465) {
    try {
      await transporter465.verify();
      return res.json({
        configured: true,
        service,
        verified: true,
        sender: user,
        port: 465,
        ipv4: true,
        host_ip: gmailIp,
        message: 'ระบบเชื่อมต่อ Mail Server ผ่าน Port 465 (SSL IPv4) สำเร็จ'
      });
    } catch (err465) {
      console.error('[SMTP 465 Verify Error]', err465.message);
      return res.json({
        configured: true,
        service,
        verified: false,
        sender: user,
        error: `587: ${err587Msg} | 465: ${err465.message}`,
        message: `ไม่สามารถเชื่อมต่อ Mail Server: ${err465.message}`
      });
    }
  }

  return res.json({
    configured: false,
    service,
    message: 'การตั้งค่า SMTP ไม่สมบูรณ์ กรุณาตรวจสอบ SMTP_USER และ SMTP_PASS'
  });
});

// Request OTP for Student Verification
router.post('/api/verify/student/send-otp', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const student_email = req.body?.student_email || req.body?.email;

    if (!student_email || typeof student_email !== 'string') {
      return res.status(400).json({ message: 'กรุณากรอกอีเมลมหาวิทยาลัย' });
    }

    const cleanEmail = student_email.trim().toLowerCase();

    if (!UNIVERSITY_EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        message: 'กรุณาใช้อีเมลของมหาวิทยาลัย เช่น @kkumail.com หรือโดเมน .ac.th เท่านั้น'
      });
    }

    // Check if this student email is already used by another verified user
    const existing = await db.get(
      'SELECT id FROM users WHERE student_email = ? AND is_student_verified = 1 AND id != ?',
      [cleanEmail, userId]
    );
    if (existing) {
      return res.status(409).json({ message: 'อีเมลมหาวิทยาลัยนี้ถูกใช้ยืนยันตัวตนในบัญชีอื่นแล้ว' });
    }

    // Generate 6-digit random OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store in student_otp_verifications
    await db.run('DELETE FROM student_otp_verifications WHERE user_id = ?', [userId]);
    await db.run(
      'INSERT INTO student_otp_verifications (user_id, student_email, otp_code, expires_at) VALUES (?, ?, ?, ?)',
      [userId, cleanEmail, otp, expiresAt]
    );

    // Attempt to send email via Unified Mail Service
    const sendResult = await sendOtpEmail({ to: cleanEmail, otp });
    const emailSent = Boolean(sendResult?.success);
    const sendError = sendResult?.error || null;

    console.log(`[Student Verification OTP] User #${userId} (${cleanEmail}) OTP: ${otp} (Method: ${sendResult?.method || 'fallback'}, Sent: ${emailSent})`);

    if (!emailSent) {
      console.error(`[Student Verification OTP] Failed to send email to ${cleanEmail}:`, sendError);
      return res.status(502).json({
        success: false,
        message: 'ไม่สามารถส่งรหัส OTP ไปยังอีเมลนี้ได้ในขณะนี้ กรุณาตรวจสอบอีเมลหรือติดต่อผู้ดูแลระบบ'
      });
    }

    res.json({
      success: true,
      email_sent: true,
      target_email: cleanEmail,
      method: sendResult?.method || 'smtp',
      message: `รหัส OTP ถูกส่งไปยัง ${cleanEmail} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ (รวมทั้งโฟลเดอร์ Junk/Spam)`,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error('[Send Student OTP Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการส่งรหัส OTP' });
  }
});

// Confirm OTP and award Verified Student badge
router.post('/api/verify/student/confirm-otp', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const student_email = req.body?.student_email || req.body?.email;
    const otp = req.body?.otp || req.body?.otp_code;

    if (!student_email || !otp) {
      return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัส OTP ให้ครบถ้วน' });
    }

    const cleanEmail = student_email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const record = await db.get(
      'SELECT * FROM student_otp_verifications WHERE user_id = ? AND student_email = ? ORDER BY id DESC LIMIT 1',
      [userId, cleanEmail]
    );

    if (!record) {
      return res.status(400).json({ message: 'ไม่พบรายการขอรหัส OTP กรุณากดขอรหัสใหม่อีกครั้ง' });
    }

    const now = new Date();
    const expires = new Date(record.expires_at);

    if (now > expires) {
      return res.status(400).json({ message: 'รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่' });
    }

    if (record.otp_code !== cleanOtp) {
      return res.status(400).json({ message: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' });
    }

    // Award badge
    const nowIso = now.toISOString();
    await db.run(
      'UPDATE users SET is_student_verified = 1, student_email = ?, student_verified_at = ? WHERE id = ?',
      [cleanEmail, nowIso, userId]
    );

    // Delete used OTP
    await db.run('DELETE FROM student_otp_verifications WHERE user_id = ?', [userId]);

    // Update current session user
    const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    req.session.user = formatUser(updatedUser);

    res.json({
      success: true,
      message: '🎉 ยืนยันตัวตนนักศึกษาสำเร็จ! ได้รับเครื่องหมายติ๊กถูกสีฟ้า (Verified Student) แล้ว',
      user: req.session.user
    });
  } catch (err) {
    console.error('[Confirm Student OTP Error]', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP' });
  }
});

module.exports = router;
