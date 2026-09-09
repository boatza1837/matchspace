const nodemailer = require('nodemailer');

// Anti-spam throttling map: key = `${chatId}:${recipientId}`, value = timestamp
const chatEmailThrottle = new Map();
const THROTTLE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Clean up old throttle entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of chatEmailThrottle.entries()) {
    if (now - timestamp > THROTTLE_DURATION_MS * 2) {
      chatEmailThrottle.delete(key);
    }
  }
}, 15 * 60 * 1000).unref();

/**
 * Initialize mailer transporter (Gmail App Password or Custom SMTP)
 */
function getTransporter() {
  const service = process.env.SMTP_SERVICE?.toLowerCase();
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

  if (!user || !pass) return null;

  // Gmail SMTP
  if (service === 'gmail' || (host && host.toLowerCase().includes('gmail'))) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000
    });
  }

  // Custom / Cloud SMTP (Resend, Brevo, SES, etc.)
  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000
    });
  }

  return null;
}

function getFromAddress() {
  return process.env.SMTP_FROM || (process.env.SMTP_USER ? `"MatchSpace" <${process.env.SMTP_USER}>` : '"MatchSpace" <verify@matchspace.com>');
}

/**
 * Send Email Notification when two users match
 */
async function sendMatchEmailNotification(recipientUser, partnerUser) {
  try {
    const targetEmail = recipientUser?.student_email || recipientUser?.email;
    if (!targetEmail || !targetEmail.includes('@')) return;

    const transporter = getTransporter();
    if (!transporter) return;

    const partnerName = partnerUser?.name || 'ใครบางคน';
    const partnerMajor = partnerUser?.major || 'มหาวิทยาลัยขอนแก่น';
    const partnerInterests = partnerUser?.interests || '';

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: auto; padding: 28px; border: 1px solid #fecdd3; border-radius: 20px; background: #ffffff; box-shadow: 0 6px 24px rgba(225, 29, 72, 0.08);">
        <div style="text-align: center; margin-bottom: 22px;">
          <div style="font-size: 2.6rem; margin-bottom: 6px;">🎉 💖</div>
          <h2 style="color: #e11d48; margin: 0; font-size: 1.45rem;">ยินดีด้วย! คุณมีคู่แมตช์ใหม่</h2>
          <p style="color: #64748b; font-size: 0.95rem; margin-top: 6px;">คุณและอีกฝ่ายได้ส่งความสนใจให้กันและกันบน MatchSpace</p>
        </div>

        <div style="background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%); border-radius: 16px; padding: 20px; margin-bottom: 22px; border: 1px solid #fecdd3; text-align: center;">
          <h3 style="margin: 0 0 6px 0; color: #9f1239; font-size: 1.25rem;">
            ${escapeHtml(partnerName)}
          </h3>
          <p style="margin: 0 0 10px 0; color: #e11d48; font-size: 0.88rem; font-weight: 600;">
            🎓 ${escapeHtml(partnerMajor)}
          </p>
          ${partnerInterests ? `
            <div style="margin-top: 10px;">
              <span style="display: inline-block; background: #ffffff; color: #be123c; font-size: 0.78rem; font-weight: 600; padding: 4px 12px; border-radius: 999px; border: 1px solid #fbcfe8;">
                🏷️ ${escapeHtml(partnerInterests)}
              </span>
            </div>
          ` : ''}
        </div>

        <div style="text-align: center; margin: 26px 0;">
          <a href="${process.env.APP_URL || 'https://matchspace.up.railway.app'}/app" style="display: inline-block; background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 1rem; padding: 13px 32px; border-radius: 999px; box-shadow: 0 6px 20px rgba(225, 29, 72, 0.3);">
            💬 เข้าสู่ MatchSpace เพื่อทักทาย ↗
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 0.78rem; text-align: center; line-height: 1.5;">
          คุณได้รับการแจ้งเตือนนี้เนื่องจากมีคู่แมตช์ใหม่ในบัญชีของคุณบน MatchSpace<br />
          © MatchSpace Community Platform
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: getFromAddress(),
      to: targetEmail,
      subject: `[MatchSpace] 🎉 คุณมีคู่แมตช์ใหม่กับ ${partnerName}!`,
      html
    });

    console.log(`[Email] Match notification sent to ${targetEmail} for partner ${partnerName}`);
  } catch (err) {
    console.warn('[Email] Match notification send error:', err.message);
  }
}

/**
 * Send Email Notification when someone sends a chat message
 * With anti-spam throttle of 1 email per 5 minutes per chat
 */
async function sendChatMessageEmailNotification(recipientUser, senderUser, messageSnippet, chatId) {
  try {
    const targetEmail = recipientUser?.student_email || recipientUser?.email;
    if (!targetEmail || !targetEmail.includes('@')) return;

    // Check Throttling
    const throttleKey = `${chatId}:${recipientUser.id}`;
    const lastSent = chatEmailThrottle.get(throttleKey);
    const now = Date.now();

    if (lastSent && (now - lastSent) < THROTTLE_DURATION_MS) {
      // Throttled: User received an email for this conversation in the last 5 minutes
      return;
    }

    const transporter = getTransporter();
    if (!transporter) return;

    chatEmailThrottle.set(throttleKey, now);

    const senderName = senderUser?.name || 'เพื่อนใน MatchSpace';
    const previewText = String(messageSnippet || '').trim().slice(0, 100) || 'ส่งข้อความใหม่ถึงคุณ';

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 2.4rem; margin-bottom: 6px;">💬</div>
          <h2 style="color: #4338ca; margin: 0; font-size: 1.4rem;">คุณมีข้อความใหม่</h2>
          <p style="color: #64748b; font-size: 0.95rem; margin-top: 4px;">มีข้อความใหม่ส่งถึงคุณบน MatchSpace</p>
        </div>

        <div style="background: #f8fafc; border-radius: 16px; padding: 18px 22px; margin-bottom: 22px; border: 1px solid #e2e8f0;">
          <div style="font-weight: 700; color: #1e1b4b; font-size: 1rem; margin-bottom: 8px;">
            👤 ${escapeHtml(senderName)}
          </div>
          <div style="background: #ffffff; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 8px; color: #334155; font-size: 0.95rem; font-style: italic;">
            "${escapeHtml(previewText)}"
          </div>
        </div>

        <div style="text-align: center; margin: 26px 0;">
          <a href="${process.env.APP_URL || 'https://matchspace.up.railway.app'}/app" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 1rem; padding: 13px 32px; border-radius: 999px; box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);">
            ตอบกลับข้อความ ↗
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 0.78rem; text-align: center; line-height: 1.5;">
          ระบบจะจำกัดการแจ้งเตือนไม่เกิน 1 ครั้งต่อ 5 นาที เพื่อไม่ให้รบกวนกล่องข้อความของคุณ<br />
          © MatchSpace Community Platform
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: getFromAddress(),
      to: targetEmail,
      subject: `[MatchSpace] 💬 ข้อความใหม่จาก ${senderName}`,
      html
    });

    console.log(`[Email] Chat message notification sent to ${targetEmail} from ${senderName}`);
  } catch (err) {
    console.warn('[Email] Chat notification send error:', err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  getTransporter,
  getFromAddress,
  sendMatchEmailNotification,
  sendChatMessageEmailNotification
};
