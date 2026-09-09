const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db } = require('../config/db');
const { requireAuth, formatUser } = require('../middlewares/auth');

// University Email Pattern (KKU Mail e.g. @kkumail.com, @kku.ac.th, or Thai university .ac.th)
const UNIVERSITY_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.)?(kkumail\.com|kku\.ac\.th|[a-zA-Z0-9.-]+\.ac\.th)$/i;

// Initialize mailer transporter (Gmail App Password or Custom SMTP)
function getTransporter() {
  const service = process.env.SMTP_SERVICE?.toLowerCase();
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  // Strip spaces if user pasted 16-char Gmail app password formatted like 'abcd efgh ijkl mnop'
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

  if (!user || !pass) {
    return null;
  }

  // If service is gmail or host is smtp.gmail.com
  if (service === 'gmail' || (host && host.toLowerCase().includes('gmail'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 10000
    });
  }

  // Standard or Cloud SMTP (Resend, Brevo, AWS SES, University SMTP)
  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 10000
    });
  }

  return null;
}

// Get SMTP status check
router.get('/api/verify/smtp-status', async (req, res) => {
  const user = process.env.SMTP_USER;
  const service = process.env.SMTP_SERVICE || (process.env.SMTP_HOST ? 'custom_smtp' : 'none');

  if (!user) {
    return res.json({
      configured: false,
      service: 'none',
      message: 'ยังไม่ได้ตั้งค่า SMTP ใน Environment Variables (ระบบจะใช้ Dev OTP Mode ในการทดสอบ)'
    });
  }

  const transporter = getTransporter();
  if (!transporter) {
    return res.json({
      configured: false,
      service,
      message: 'การตั้งค่า SMTP ไม่สมบูรณ์ กรุณาตรวจสอบ SMTP_USER และ SMTP_PASS'
    });
  }

  try {
    await transporter.verify();
    return res.json({
      configured: true,
      service,
      verified: true,
      sender: user,
      message: 'ระบบเชื่อมต่อ Mail Server สำเร็จ พร้อมส่งอีเมลจริงไปยังนักศึกษา'
    });
  } catch (err) {
    console.error('[SMTP Verify Error]', err.message);
    return res.json({
      configured: true,
      service,
      verified: false,
      sender: user,
      error: err.message,
      message: `ไม่สามารถเชื่อมต่อ Mail Server: ${err.message}`
    });
  }
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

    // Attempt to send email via SMTP if configured
    let emailSent = false;
    let sendError = null;
    const transporter = getTransporter();
    const fromAddress = process.env.SMTP_FROM || (process.env.SMTP_USER ? `"MatchSpace Student Verification" <${process.env.SMTP_USER}>` : '"MatchSpace" <verify@matchspace.com>');

    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: `[MatchSpace] 🎓 รหัส OTP ยืนยันตัวตนนักศึกษา: ${otp}`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.4rem; margin-bottom: 6px;">🎓</div>
                <h2 style="color: #4338ca; margin: 0; font-size: 1.4rem;">MatchSpace Campus Verification</h2>
                <p style="color: #64748b; font-size: 0.92rem; margin-top: 4px;">ระบบค้นหาเพื่อนและสังคมมหาวิทยาลัยขอนแก่น</p>
              </div>
              
              <div style="background: #f8fafc; border-radius: 14px; padding: 18px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                <p style="margin: 0 0 10px 0; color: #1e293b; font-weight: 600;">สวัสดีครับ/ค่ะ,</p>
                <p style="margin: 0; color: #475569; font-size: 0.95rem; line-height: 1.6;">
                  คุณได้ทำรายการขอยืนยันสถานะนักศึกษาเพื่อรับเครื่องหมาย <strong>Verified Student (ติ๊กถูกสีฟ้า ✔️)</strong> บน MatchSpace โปรดใช้รหัส OTP ด้านล่างนี้เพื่อยืนยัน:
                </p>
              </div>

              <div style="text-align: center; margin: 26px 0;">
                <div style="display: inline-block; font-size: 2.5rem; font-weight: 800; letter-spacing: 10px; color: #4338ca; background: #e0e7ff; padding: 14px 32px; border-radius: 16px; border: 2px dashed #6366f1;">
                  ${otp}
                </div>
              </div>

              <p style="color: #dc2626; font-size: 0.85rem; text-align: center; font-weight: 600;">
                ⏳ รหัสนี้มีอายุการใช้งาน 10 นาที (เพื่อความปลอดภัยห้ามส่งต่อให้ผู้อื่น)
              </p>

              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 0.8rem; text-align: center; line-height: 1.5;">
                หากคุณไม่ได้ส่งคำขอยืนยันตัวตนนี้ กรุณาละเว้นอีเมลฉบับนี้ บัญชีของคุณยังคงปลอดภัยตามปกติ<br />
                © MatchSpace Community Team
              </p>
            </div>
          `
        });
        emailSent = true;
        console.log(`[SMTP Success] Sent OTP email to ${cleanEmail}`);
      } catch (err) {
        sendError = err.message;
        console.error('[SMTP Send Error]', err.message);
      }
    }

    console.log(`[Student Verification OTP] User #${userId} (${cleanEmail}) OTP: ${otp} (Expires: ${expiresAt})`);

    // Payload response
    const responsePayload = {
      success: true,
      email_sent: emailSent,
      target_email: cleanEmail,
      message: emailSent
        ? `รหัส OTP ถูกส่งไปยัง ${cleanEmail} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ`
        : `ระบบสร้างรหัส OTP เรียบร้อยแล้ว${sendError ? ' (หมายเหตุ: SMTP เกิดข้อผิดพลาด ใช้ Dev Mode)' : ' (รหัสทดสอบ: ' + otp + ')'}`,
      expires_at: expiresAt
    };

    if (!emailSent) {
      responsePayload.dev_otp = otp;
      if (sendError) {
        responsePayload.smtp_warning = sendError;
      }
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
