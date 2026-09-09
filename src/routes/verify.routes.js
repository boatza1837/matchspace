const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db } = require('../config/db');
const { requireAuth, formatUser } = require('../middlewares/auth');

// University Email Pattern (KKU Mail e.g. @kkumail.com, @kku.ac.th, or Thai university .ac.th)
const UNIVERSITY_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.)?(kkumail\.com|kku\.ac\.th|[a-zA-Z0-9.-]+\.ac\.th)$/i;

// Initialize mailer transporter (if configured in .env)
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
  return null;
}

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

    // Attempt to send email via SMTP if configured
    let emailSent = false;
    const transporter = getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"MatchSpace Student Verification" <verify@matchspace.com>',
          to: cleanEmail,
          subject: `[MatchSpace] รหัส OTP ยืนยันตัวตนนักศึกษา: ${otp}`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #6366f1; margin: 0;">🎓 ยืนยันสถานะนักศึกษา MatchSpace</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-top: 6px;">ระบบค้นหาเพื่อนและสังคมมหาวิทยาลัย</p>
              </div>
              <p>สวัสดีครับ/ค่ะ,</p>
              <p>นี่คือรหัสยืนยันตัวตน (OTP) เพื่อรับตราสัญลักษณ์ <strong>Verified Student (ติ๊กถูกสีฟ้า)</strong> บน MatchSpace:</p>
              <div style="text-align: center; margin: 24px 0;">
                <div style="display: inline-block; font-size: 2.2rem; font-weight: 800; letter-spacing: 8px; color: #4338ca; background: #e0e7ff; padding: 12px 28px; border-radius: 12px;">
                  ${otp}
                </div>
              </div>
              <p style="color: #dc2626; font-size: 0.85rem; text-align: center;">* รหัสมีอายุการใช้งาน 10 นาที กรุณาอย่าส่งต่อให้ผู้อื่น</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="color: #94a3b8; font-size: 0.8rem; text-align: center;">หากคุณไม่ได้ทำรายการนี้ สามารถละเว้นอีเมลฉบับนี้ได้ทันที</p>
            </div>
          `
        });
        emailSent = true;
      } catch (err) {
        console.warn('[SMTP Send Warning]', err.message);
      }
    }

    console.log(`[Student Verification OTP] User #${userId} (${cleanEmail}) OTP: ${otp} (Expires: ${expiresAt})`);

    // In dev mode / if SMTP not configured, return dev_otp so testing is seamless
    const responsePayload = {
      success: true,
      message: emailSent
        ? `รหัส OTP ถูกส่งไปยัง ${cleanEmail} แล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ`
        : `ระบบสร้างรหัส OTP สำหรับ ${cleanEmail} เรียบร้อยแล้ว (รหัสทดสอบ: ${otp})`,
      expires_at: expiresAt
    };

    if (!emailSent) {
      responsePayload.dev_otp = otp;
    }

    res.json(responsePayload);
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
