/**
 * MatchSpace Core Utilities
 * Contains shared helpers, DOM utilities, and API wrappers
 */

const RECOMMENDED_INTERESTS = [
  'หนัง', 'เพลง', 'ดนตรี', 'ศิลปะ', 'การออกแบบ',
  'ภาพถ่าย', 'ศาสตร์', 'เทคโนโลยี', 'คอมพิวเตอร์',
  'ฟิตเนส', 'โยคะ', 'ปีนเขา', 'กีฬา', 'การเดิน',
  'การอ่าน', 'การเขียน', 'ปรุงอาหาร', 'เบเกอรี่',
  'ท่องเที่ยว', 'พืช', 'สัตว์ส่วน', 'แมว', 'สุนัข',
  'เกม', 'อนิเมะ', 'คาเฟ่', 'ร้านชา', 'ศาสตร์อาหาร',
  'การพูด', 'ภาษา', 'ประวัติศาสตร์', 'วัฒนธรรม'
];

function initializeTagsContainer(containerId, hiddenInputId, selectedTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = RECOMMENDED_INTERESTS.map(tag => `
    <div class="tag ${selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${tag}">${tag}</div>
  `).join('');
  
  updateTagsInput(hiddenInputId);
  
  container.querySelectorAll('.tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      tagEl.classList.toggle('selected');
      updateTagsInput(hiddenInputId);
    });
  });
}

function updateTagsInput(hiddenInputId) {
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!hiddenInput) return;
  
  const container = hiddenInput.parentElement;
  const selectedTags = Array.from(container.querySelectorAll('.tag.selected')).map(el => el.dataset.tag);
  hiddenInput.value = selectedTags.join(', ');
}

async function apiRequest(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  
  const response = await fetch(url, {
    headers,
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};

  if (!response.ok) {
    if (response.status === 403 && data.banned) {
      alert(data.message || 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล');
      window.location.href = '/';
      throw new Error(data.message);
    }
    throw new Error(data.message || 'เกิดข้อผิดพลาด');
  }

  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsDataURL(file);
  });
}

function formatActivityDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const monthName = months[m - 1] || parts[1];
      const thaiYear = y + 543;
      return `${d} ${monthName} ${thaiYear}`;
    }
  } catch (e) {}
  return dateStr;
}

function formatChatTime(createdAt) {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch (e) {
    return '';
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showMatchToast(message) {
  const existing = document.getElementById('matchToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'matchToast';
  toast.className = 'match-toast-popup';
  toast.innerHTML = `
    <div class="match-toast-icon">✨</div>
    <div class="match-toast-content">
      <strong>การแจ้งเตือน</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/**
 * Check session and only display admin pill if role is 'admin' or 'owner' / 'own'
 */
async function checkAdminNavVisibility() {
  const adminLinks = document.querySelectorAll('.admin-pill, #adminNavLink');
  if (!adminLinks.length) return;

  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      const user = data?.user;
      const role = String(user?.role || '').toLowerCase();
      const isAdminOrOwner = Boolean(user?.is_admin || role === 'admin' || role === 'owner' || role === 'own');

      if (isAdminOrOwner) {
        adminLinks.forEach(el => {
          el.classList.add('visible');
          el.style.setProperty('display', 'inline-flex', 'important');
        });
        return;
      }
    }
  } catch (e) {}

  // Keep hidden for guests and regular users
  adminLinks.forEach(el => {
    el.classList.remove('visible');
    el.style.setProperty('display', 'none', 'important');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAdminNavVisibility);
} else {
  checkAdminNavVisibility();
}

/**
 * Generates an SVG Data URI for an initial/letter avatar with vibrant gradient
 */
function generateLetterAvatar(name = 'User') {
  const clean = (name || 'U').trim();
  const initial = (clean.charAt(0) || 'U').toUpperCase();

  const gradients = [
    ['#7c3aed', '#ec4899'], // Purple - Pink
    ['#6366f1', '#a855f7'], // Indigo - Violet
    ['#3b82f6', '#06b6d4'], // Blue - Cyan
    ['#10b981', '#059669'], // Emerald - Green
    ['#f59e0b', '#d97706'], // Amber - Orange
    ['#ec4899', '#f43f5e'], // Pink - Rose
    ['#8b5cf6', '#3b82f6']  // Violet - Blue
  ];

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const [c1, c2] = gradients[Math.abs(hash) % gradients.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="50" fill="url(#g_${Math.abs(hash)})"/>
    <text x="50" y="55" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="46">${initial}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Sets avatar src with automatic fallback to dynamic letter avatar if empty, default, or fails
 */
function setAvatarWithFallback(imgEl, src, name = 'User') {
  if (!imgEl) return;
  const fallback = generateLetterAvatar(name);

  imgEl.onerror = function() {
    this.onerror = null;
    this.src = fallback;
  };

  if (!src || src === 'uploads/avatars/default.png' || src === '/uploads/avatars/default.png' || src.includes('default.png') || src.includes('default.svg')) {
    imgEl.src = fallback;
  } else {
    const finalSrc = src.startsWith('uploads/') ? '/' + src : src;
    imgEl.src = finalSrc;
  }
}

window.generateLetterAvatar = generateLetterAvatar;
window.setAvatarWithFallback = setAvatarWithFallback;

