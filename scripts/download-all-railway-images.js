const fs = require('fs');
const path = require('path');
const https = require('https');

const dump = require('../railway_dump.json');
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Extract all image paths referenced in users and user_photos
const imageFilenames = new Set();

if (dump.data && dump.data.users) {
  for (const u of dump.data.users) {
    if (u.profile_image && u.profile_image.startsWith('/uploads/')) {
      imageFilenames.add(u.profile_image.replace('/uploads/', ''));
    }
  }
}

if (dump.data && dump.data.user_photos) {
  for (const p of dump.data.user_photos) {
    if (p.photo_url && p.photo_url.startsWith('/uploads/')) {
      imageFilenames.add(p.photo_url.replace('/uploads/', ''));
    }
  }
}

// Also add all known files from uploadsFiles
const knownUploads = [
  "1786811090629-yts44q.jpg",
  "1786811145080-0d7hov.jpg",
  "1786811254134-q4uq4r.png",
  "1786811348593-5t3hyg.png",
  "1786811466739-h9hay1.png",
  "1786811472502-xscoet.png",
  "1786811538080-tutzl6.png",
  "1786816246966-28i0s8.jpg",
  "1786829143918-j1e0qb.png",
  "1786829145458-rezumd.png",
  "1786829145860-wavhxk.png",
  "1786829146092-1qb4ig.png",
  "1786829345050-qta82j.png",
  "1786829351173-pu9bi7.jpg",
  "1786829360026-nnn7ss.png",
  "1786829424748-rue0kt.jpg",
  "1786829431815-m8gh1u.jpg",
  "1786829436228-d9ts24.jpg",
  "1786835824983-8jhl15.jpg",
  "1786883169707-afrjmx.png",
  "1788424233159-z4a808.jpg",
  "1789012605729-kn1r4c.jpg",
  "1789012611498-726eub.jpg",
  "1789012695367-8ij66t.jpg",
  "1789012727520-xyz2nl.jpg",
  "1789012775663-1yw9zf.jpeg",
  "1789012811221-4rnm3o.jpg",
  "1789013057963-hwku8l.jpg",
  "1789015701726-cgoh1y.jpeg",
  "1789015711468-m0uc7v.jpeg",
  "1789022659784-7mwh01.jpeg",
  "1789028112511-95j2ug.jpeg",
  "1789043270830-jptc80.png"
];
for (const k of knownUploads) {
  imageFilenames.add(k);
}

console.log(`Total files to download: ${imageFilenames.size}`);

async function downloadFile(filename) {
  const targetPath = path.join(uploadsDir, filename);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    console.log(`Already exists: ${filename}`);
    return;
  }
  const url = `https://matchspace-production-b035.up.railway.app/uploads/${filename}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(targetPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Downloaded: ${filename} (${fs.statSync(targetPath).size} bytes)`);
          resolve();
        });
      } else {
        console.warn(`Failed ${filename}: HTTP ${res.statusCode}`);
        resolve(); // don't reject to continue others
      }
    }).on('error', (err) => {
      console.error(`Error downloading ${filename}:`, err.message);
      resolve();
    });
  });
}

async function run() {
  for (const f of imageFilenames) {
    await downloadFile(f);
  }
  console.log('All image downloads completed!');
}

run();
