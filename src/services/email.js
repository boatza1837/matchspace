const dns = require('dns');
if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const nodemailer = require('nodemailer');

// Patch Nodemailer's shared network interface list to eliminate IPv6 on cloud containers (e.g. Railway)
try {
  const shared = require('nodemailer/lib/shared');
  if (shared && shared.networkInterfaces) {
    const filtered = {};
    for (const [k, v] of Object.entries(shared.networkInterfaces)) {
      if (Array.isArray(v)) {
        filtered[k] = v.filter(i => i.family === 'IPv4' || i.family === 4);
      }
    }
    shared.networkInterfaces = filtered;
  }
} catch (e) {
  console.warn('[Email-IPv4-Patch] Notice:', e.message);
}

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

function getCredentials() {
  const service = (process.env.SMTP_SERVICE || 'gmail').toLowerCase();
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || 'matchspace89@gmail.com';
  const pass = (process.env.SMTP_PASS || 'hyawmdgqbfyinxxy').replace(/\s+/g, '');
  const brevoKey = process.env.BREVO_API_KEY || '';
  const resendKey = process.env.RESEND_API_KEY || '';
  const webhookUrl = process.env.MAIL_WEBHOOK_URL || '';

  return { service, host, port, user, pass, brevoKey, resendKey, webhookUrl };
}

let cachedGmailIp = null;
let lastLookupTime = 0;

async function resolveGmailIpv4() {
  const now = Date.now();
  if (cachedGmailIp && now - lastLookupTime < 10 * 60 * 1000) {
    return cachedGmailIp;
  }
  return new Promise((resolve) => {
    dns.lookup('smtp.gmail.com', { family: 4 }, (err, address) => {
      if (!err && address) {
        cachedGmailIp = address;
        lastLookupTime = now;
        resolve(address);
      } else {
        resolve('smtp.gmail.com');
      }
    });
  });
}

/**
 * Initialize mailer transporter (Gmail App Password or Custom SMTP)
 * Explicitly forces IPv4 (family: 4) to avoid ENETUNREACH in containers
 */
function getTransporter(customPort = null, overrideHost = null) {
  const { service, host, port: defaultPort, user, pass } = getCredentials();
  if (!user || !pass) return null;

  const port = customPort || defaultPort;

  // Gmail SMTP
  if (service === 'gmail' || (host && host.toLowerCase().includes('gmail'))) {
    const targetHost = overrideHost || host;
    if (port === 465) {
      return nodemailer.createTransport({
        host: targetHost,
        port: 465,
        secure: true,
        family: 4, // Force IPv4
        lookup: (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback),
        auth: { user, pass },
        tls: { servername: 'smtp.gmail.com', rejectUnauthorized: false },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 8000
      });
    } else {
      // Port 587 STARTTLS (Default for Cloud / Railway)
      return nodemailer.createTransport({
        host: targetHost,
        port: 587,
        secure: false,
        requireTLS: true,
        family: 4, // Force IPv4
        lookup: (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback),
        auth: { user, pass },
        tls: { servername: 'smtp.gmail.com', rejectUnauthorized: false },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 8000
      });
    }
  }

  // Custom / Cloud SMTP
  if (host) {
    return nodemailer.createTransport({
      host: overrideHost || host,
      port,
      secure: port === 465,
      family: 4,
      lookup: (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback),
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000
    });
  }

  return null;
}

function getFromAddress() {
  const { user } = getCredentials();
  return process.env.SMTP_FROM || `"MatchSpace" <${user}>`;
}

/**
 * Unified Mail Dispatcher:
 * Supports:
 * 1. Resend HTTPS API (Port 443)
 * 2. Brevo HTTPS API (Port 443)
 * 3. Custom Mail Webhook URL (Port 443)
 * 4. Gmail SMTP Port 465 (IPv4)
 * 5. Gmail SMTP Port 587 Fallback (IPv4)
 */
async function sendMailUnified({ to, subject, html, text }) {
  const { brevoKey, resendKey, webhookUrl, user } = getCredentials();
  const from = getFromAddress();

  // 1. Brevo HTTPS API (Port 443 - Verified & Reliable)
  if (brevoKey) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'MatchSpace Student Verification', email: user },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text || ''
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        console.log(`[Email-Brevo] Sent successfully to ${to} (MessageId: ${data.messageId})`);
        return { success: true, method: 'brevo', messageId: data.messageId };
      }
      console.warn('[Email-Brevo] API Error:', data);
    } catch (err) {
      console.warn('[Email-Brevo] Network error:', err.message);
    }
  }

  // 2. Google Apps Script / Custom Mail Webhook (Port 443 HTTPS)
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ to, subject, html, text, from }),
        redirect: 'follow'
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && (!data || data.success !== false)) {
        console.log(`[Email-Webhook] Sent successfully to ${to}`);
        return { success: true, method: 'webhook' };
      }
      console.warn('[Email-Webhook] Response error:', data);
    } catch (err) {
      console.warn('[Email-Webhook] Error:', err.message);
    }
  }

  // 3. Resend HTTPS API (Port 443)
  if (resendKey) {
    try {
      // Resend strictly requires a verified custom domain or 'onboarding@resend.dev'
      let resendFrom = process.env.RESEND_FROM || '';
      if (!resendFrom || !resendFrom.includes('@') || resendFrom.includes('@gmail.com')) {
        resendFrom = 'MatchSpace <onboarding@resend.dev>';
      } else if (!resendFrom.includes('<')) {
        resendFrom = `MatchSpace <${resendFrom}>`;
      }

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [to],
          subject,
          html,
          text: text || ''
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        console.log(`[Email-Resend] Sent successfully to ${to} (ID: ${data.id})`);
        return { success: true, method: 'resend', id: data.id };
      }
      console.warn('[Email-Resend] API Error:', data);
    } catch (err) {
      console.warn('[Email-Resend] Network error:', err.message);
    }
  }

  // 4. Nodemailer IPv4 via Port 587 (Preferred for Railway & Cloud)
  let lastError = null;
  const gmailIp = await resolveGmailIpv4();

  const transporter587 = getTransporter(587, gmailIp);
  if (transporter587) {
    try {
      const info = await transporter587.sendMail({
        from,
        to,
        subject,
        html,
        text: text || ''
      });
      console.log(`[Email-SMTP-587] Sent to ${to} (MessageID: ${info.messageId})`);
      return { success: true, method: 'smtp-587', messageId: info.messageId };
    } catch (err) {
      lastError = err;
      console.warn('[Email-SMTP-587] Port 587 failed:', err.message);
    }
  }

  // 5. Nodemailer IPv4 Fallback (Port 465 SSL)
  const transporter465 = getTransporter(465, gmailIp);
  if (transporter465) {
    try {
      const info = await transporter465.sendMail({
        from,
        to,
        subject,
        html,
        text: text || ''
      });
      console.log(`[Email-SMTP-465] Sent to ${to} (MessageID: ${info.messageId})`);
      return { success: true, method: 'smtp-465', messageId: info.messageId };
    } catch (err) {
      lastError = err;
      console.warn('[Email-SMTP-465] Port 465 failed:', err.message);
    }
  }

  return { success: false, error: lastError ? lastError.message : 'No mailer configured or all transports unreachable' };
}

async function sendOtpEmail(arg1, arg2) {
  const to = (typeof arg1 === 'object' && arg1 !== null) ? arg1.to : arg1;
  const otp = (typeof arg1 === 'object' && arg1 !== null) ? arg1.otp : arg2;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 2.5rem; margin-bottom: 6px;">🎓</div>
        <h2 style="color: #4338ca; margin: 0; font-size: 1.4rem;">MatchSpace Student Verification</h2>
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
  `;

  return await sendMailUnified({
    to,
    subject: `[MatchSpace] 🎓 รหัส OTP ยืนยันตัวตนนักศึกษา: ${otp}`,
    html,
    text: `รหัส OTP ยืนยันตัวตนนักศึกษาของคุณคือ: ${otp} (มีอายุ 10 นาที)`
  });
}

/**
 * Send Email Notification when two users match
 */
async function sendMatchEmailNotification(recipientUser, partnerUser) {
  try {
    const targetEmail = recipientUser?.student_email || recipientUser?.email;
    if (!targetEmail || !targetEmail.includes('@')) return;

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
          <a href="${process.env.APP_URL || 'https://matchspace-production.up.railway.app'}/app" style="display: inline-block; background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 1rem; padding: 13px 32px; border-radius: 999px; box-shadow: 0 6px 20px rgba(225, 29, 72, 0.3);">
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

    await sendMailUnified({
      to: targetEmail,
      subject: `[MatchSpace] 🎉 คุณมีคู่แมตช์ใหม่กับ ${partnerName}!`,
      html
    });
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
      return;
    }

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
          <a href="${process.env.APP_URL || 'https://matchspace-production.up.railway.app'}/app" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 1rem; padding: 13px 32px; border-radius: 999px; box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);">
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

    await sendMailUnified({
      to: targetEmail,
      subject: `[MatchSpace] 💬 ข้อความใหม่จาก ${senderName}`,
      html
    });
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
  getCredentials,
  getTransporter,
  getFromAddress,
  resolveGmailIpv4,
  sendMailUnified,
  sendOtpEmail,
  sendMatchEmailNotification,
  sendChatMessageEmailNotification
};
