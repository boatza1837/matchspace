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
