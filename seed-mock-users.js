const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const TURSO_URL = 'libsql://matchspace-boatza1837.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODY4Mjc4MzQsImlkIjoiMDFhMDA3M2MtZWUwMS03NDcxLTkyMzktMDVkYzgzMzJjNmYzIiwia2lkIjoiUHR0ZlBzcU5vWXBvbWg4R2k3MzNQNm5ybWVtcGxtYjNsb1lfV2pIVE1jcyIsInJpZCI6ImIxYTI3NjRiLTkzY2QtNGZhMi05NmJmLTQ1YzllNTZkMzdjYyJ9.JaFriD-yiTCKuTsfSEh3LkdqzTUzhla4L1iME92izKbElstDZPP4aRGMjbvj2RaA628odJ_XVprfoldIOSq2BA';

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Generate colorful SVG avatar with initial letter
function makeSvgAvatar(letter, bgColor, textColor = '#fff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" rx="100" fill="${bgColor}"/>
  <text x="100" y="125" font-size="90" font-family="Arial,sans-serif" font-weight="bold"
        text-anchor="middle" fill="${textColor}">${letter}</text>
</svg>`;
}

const fakeUsers = [
  {
    name: 'นภัสสร พรมสุวรรณ',
    nickname: 'แนน',
    email: 'naphat.prom@gmail.com',
    password: 'User1234',
    gender: 'หญิง',
    age: 20,
    major: 'จิตวิทยา',
    year: 'ปี 2',
    interests: 'ดนตรี, ศิลปะ, คาเฟ่, การอ่าน',
    bio: 'ชอบฟังเพลง วาดรูป และชอบนั่งคาเฟ่น่าๆ ยินดีรู้จักทุกคนค่า 🌸',
    svgLetter: 'น',
    svgColor: '#e91e8c',
    filename: 'mock-nan-avatar.svg',
  },
  {
    name: 'ธนพล สิงห์ทอง',
    nickname: 'ต้น',
    email: 'thanapol.s@gmail.com',
    password: 'User1234',
    gender: 'ชาย',
    age: 22,
    major: 'วิศวกรรมคอมพิวเตอร์',
    year: 'ปี 4',
    interests: 'เกม, เทคโนโลยี, อนิเมะ, ปีนเขา',
    bio: 'โค้ดเดอร์ที่ชอบเล่นเกมหลังเลิกงาน ชอบดูอนิเมะและออกไปผจญภัยครับ ✌️',
    svgLetter: 'ต',
    svgColor: '#3f51b5',
    filename: 'mock-ton-avatar.svg',
  },
  {
    name: 'พิมพ์ชนก รัตนวงศ์',
    nickname: 'พิม',
    email: 'pimchanok.r@gmail.com',
    password: 'User1234',
    gender: 'หญิง',
    age: 21,
    major: 'บริหารธุรกิจ',
    year: 'ปี 3',
    interests: 'ท่องเที่ยว, ปรุงอาหาร, สัตว์เลี้ยง, ร้านชา',
    bio: 'ชอบท่องเที่ยวและทำอาหาร มีน้องหมา 2 ตัว รักสัตว์มาก ใครชอบเที่ยวมาคุยกันได้เลย ☕🐾',
    svgLetter: 'พ',
    svgColor: '#009688',
    filename: 'mock-pim-avatar.svg',
  },
];

async function main() {
  console.log('🚀 Creating 3 mock users with SVG avatars...\n');

  for (const u of fakeUsers) {
    // Write SVG avatar locally
    const localPath = path.join(uploadsDir, u.filename);
    fs.writeFileSync(localPath, makeSvgAvatar(u.svgLetter, u.svgColor));
    console.log(`🎨 Created SVG avatar: ${u.filename}`);

    // Check if email already exists
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [u.email] });
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id;
      console.log(`   ⚠️  Already exists as user #${id}, updating profile image...\n`);
      await db.execute({
        sql: 'UPDATE users SET profile_image = ? WHERE id = ?',
        args: [`/uploads/${u.filename}`, id]
      });
      continue;
    }

    const hash = bcrypt.hashSync(u.password, 10);
    const profileImage = `/uploads/${u.filename}`;

    const result = await db.execute({
      sql: `INSERT INTO users (name, email, password, gender, major, year, interests, bio, nickname, age, profile_image, is_admin, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'user', 1)`,
      args: [u.name, u.email, hash, u.gender, u.major, u.year, u.interests, u.bio, u.nickname, u.age, profileImage]
    });

    const userId = Number(result.lastInsertRowid);

    // Also insert into user_photos table
    await db.execute({
      sql: 'INSERT OR IGNORE INTO user_photos (user_id, photo_url) VALUES (?, ?)',
      args: [userId, profileImage]
    });

    console.log(`   ✅ Created user #${userId}: ${u.name} (${u.nickname}) — ${u.email}`);
    console.log(`      ${u.gender} | อายุ ${u.age} | ${u.major} ${u.year}`);
    console.log(`      ความสนใจ: ${u.interests}`);
    console.log(`      รูป: ${profileImage}\n`);
  }

  // Final summary
  const rows = await db.execute({
    sql: `SELECT id, name, nickname, email, gender, age, major, year, profile_image, is_active
          FROM users WHERE email IN ('naphat.prom@gmail.com','thanapol.s@gmail.com','pimchanok.r@gmail.com')`,
    args: []
  });

  console.log('='.repeat(60));
  console.log('✅ DONE — Mock users in Turso DB:');
  for (const r of rows.rows) {
    console.log(`  #${r.id} | ${r.name} (${r.nickname}) | ${r.email}`);
    console.log(`       ${r.gender} | ${r.age}y | ${r.major} ${r.year} | active:${r.is_active}`);
    console.log(`       img: ${r.profile_image}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
