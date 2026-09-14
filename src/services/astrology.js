/**
 * MatchSpace Soulmate Astrology & Compatibility Engine
 * ศาสตร์วิเคราะห์ดวงเนื้อคู่เชิงลึก: Multi-dimensional Match Score & 8 Authentic Research Databases
 * 
 * อ้างอิงจาก 8 ฐานข้อมูลมาตรฐาน:
 * 1. โหราศาสตร์ไทย: ตำรามหาทักษาพยากรณ์ & ทักษาคู่มิตร 8 ทิศ
 * 2. โหราศาสตร์ไทย: คัมภีร์สุริยยาตร์ ดาวคู่ธาตุ & ดาวคู่สมพล
 * 3. โหราศาสตร์จีน: คัมภีร์ซาฮะ (三合 San He - สามประสานธาตุ)
 * 4. โหราศาสตร์จีน: คัมภีร์ลักฮะ (六合 Liu He - หกคู่มิตรสมพงษ์)
 * 5. โหราศาสตร์สากล: Western Synastry Astrology & The 4 Triplicities
 * 6. จิตวิทยาความสัมพันธ์: Sternberg’s Triangular Theory of Love (Passion, Intimacy, Commitment)
 * 7. ประสาทวิทยาความรัก: Dr. Helen Fisher’s Biological Chemistry of Love
 * 8. จิตวิทยาสังคม: Donn Byrne’s Similarity-Attraction Effect & Activity Theory
 */

const ASTROLOGY_SOURCES_DB = [
  {
    id: 1,
    icon: '📜',
    title: 'ตำรามหาทักษาพยากรณ์ & ทักษาคู่มิตร 8 ทิศ',
    category: 'โหราศาสตร์ไทยโบราณ',
    author: 'คัมภีร์โหราศาสตร์ไทยมหาทักษา',
    desc: 'คำนวณดาวคู่มิตรประจำวันเกิด 7 วัน (อาทิตย์-พฤหัส, จันทร์-พุธ, อังคาร-ศุกร์, เสาร์-ราหู) ชี้วัดความเข้าอกเข้าใจ ความไว้วางใจ และการเกื้อหนุนชีวิต'
  },
  {
    id: 2,
    icon: '☀️',
    title: 'คัมภีร์สุริยยาตร์ & ดาวคู่ธาตุคู่สมพล',
    category: 'โหราศาสตร์ไทยประยุกต์',
    author: 'ตำราโหรหลวงหลวงประเสริฐอักษรนิติ์',
    desc: 'ประเมินพลังงานดาวคู่ธาตุ 4 ธาตุ และดาวคู่สมพลที่ช่วยหนุนนำความเจริญก้าวหน้า โชคลาภ ทรัพย์สิน และความสำเร็จในชีวิตร่วมกัน'
  },
  {
    id: 3,
    icon: '🐉',
    title: 'คัมภีร์ซาฮะ (三合 San He - สามประสานธาตุ)',
    category: 'โหราศาสตร์จีน & ปาจื่อ (BaZi)',
    author: 'คัมภีร์ดวงจีนโบราณซำง้วนหล่อแก',
    desc: 'กลุ่ม 3 นักษัตรพันธมิตรเกื้อหนุน (ชวด-มะโรง-วอก, ขาล-มะเมีย-จอ, ฉลู-มะเส็ง-ระกา, เถาะ-มะแม-กุน) เสริมพลังความมั่นคงและชีวิตคู่ระยะยาว'
  },
  {
    id: 4,
    icon: '🤝',
    title: 'คัมภีร์ลักฮะ (六合 Liu He - หกคู่มิตรแท้)',
    category: 'โหราศาสตร์จีน & 12 นักษัตร',
    author: 'สมาคมโหรจีนและฮวงจุ้ยแห่งประเทศไทย',
    desc: 'คู่มิตรนักษัตรดูดซับพลังหยิน-หยางอย่างสมบูรณ์แบบ (ชวด-ฉลู, ขาล-กุน, เถาะ-จอ, มะโรง-ระกา, มะเส็ง-วอก, มะเมีย-มะแม) หนุนนำความสามัคคีและโชคลาภ'
  },
  {
    id: 5,
    icon: '🔮',
    title: 'Western Synastry Astrology & The 4 Triplicities',
    category: 'โหราศาสตร์สากล & Synastry',
    author: 'Ptolemy’s Tetrabiblos / Robert Hand',
    desc: 'วิเคราะห์ความสมดุลของ 4 ธาตุ (Fire, Earth, Air, Water) และพันธมิตร Yang (ไฟ-ลม) กับ Yin (ดิน-น้ำ) วัดพลังเสน่หาและแรงดึงดูดทางธรรมชาติ'
  },
  {
    id: 6,
    icon: '🔺',
    title: 'Sternberg’s Triangular Theory of Love',
    category: 'จิตวิทยาความสัมพันธ์',
    author: 'Prof. Robert J. Sternberg (Yale University)',
    desc: 'โมเดลสามเหลี่ยมแห่งความรัก 3 มิติหลัก: Passion (เสน่หา), Intimacy (ความใกล้ชิดผูกพัน), และ Commitment (ความมุ่งมั่นต่อยอดระยะยาว)'
  },
  {
    id: 7,
    icon: '🧬',
    title: 'The Biological Basis of Love & Neurochemistry Compatibility',
    category: 'ประสาทวิทยาและมานุษยวิทยา',
    author: 'Dr. Helen Fisher (Rutgers University / Match.com Advisor)',
    desc: 'ระบบจำแนกเคมีความเข้ากันได้ทางชีววิทยา 4 กลุ่มฮอร์โมน (Dopamine, Serotonin, Testosterone, Estrogen) วิเคราะห์สไตล์การสื่อสารและไลฟ์สไตล์'
  },
  {
    id: 8,
    icon: '🎯',
    title: 'Similarity-Attraction Effect & Activity Theory',
    category: 'จิตวิทยาสังคมและพฤติกรรมมนุษย์',
    author: 'Donn Byrne (Attraction Paradigm) & Campbell',
    desc: 'ทฤษฎีความดึงดูดจากความคล้ายคลึงของไลฟ์สไตล์ แท็กความสนใจร่วมกัน คณะวิชา และกิจกรรมในมหาวิทยาลัย ซึ่งเป็นกุญแจสำคัญของความสัมพันธ์ที่ราบรื่น'
  }
];

const ZODIAC_SIGNS = [
  { name: 'ราศีมังกร', en: 'Capricorn', symbol: '♑', element: 'ดิน', elementColor: '#92400e', bg: '#fef3c7', start: [12, 22], end: [1, 19], trait: 'มีความมุ่งมั่น มั่นคง มีวินัย จริงจังกับความรัก' },
  { name: 'ราศีกุมภ์', en: 'Aquarius', symbol: '♒', element: 'ลม', elementColor: '#0369a1', bg: '#e0f2fe', start: [1, 20], end: [2, 18], trait: 'รักอิสระ มีความคิดสร้างสรรค์ มีเสน่ห์ที่ความเปิดกว้าง' },
  { name: 'ราศีมีน', en: 'Pisces', symbol: '♓', element: 'น้ำ', elementColor: '#1d4ed8', bg: '#dbeafe', start: [2, 19], end: [3, 20], trait: 'อ่อนโยน ช่างเห็นอกเห็นใจ โรแมนติก อบอุ่นและซื่อสัตย์' },
  { name: 'ราศีเมษ', en: 'Aries', symbol: '♈', element: 'ไฟ', elementColor: '#b91c1c', bg: '#fee2e2', start: [3, 21], end: [4, 19], trait: 'กระตือรือร้น ตรงไปตรงมา มีพลังบวกสูง กล้าท้าทายสิ่งใหม่' },
  { name: 'ราศีพฤษภ', en: 'Taurus', symbol: '♉', element: 'ดิน', elementColor: '#92400e', bg: '#fef3c7', start: [4, 20], end: [5, 20], trait: 'หนักแน่น อดทน รักความสบาย จริงใจและรักใครรักจริง' },
  { name: 'ราศีเมถุน', en: 'Gemini', symbol: '♊', element: 'ลม', elementColor: '#0369a1', bg: '#e0f2fe', start: [5, 21], end: [6, 20], trait: 'คุยสนุก ฉลาดเฉลียว ปรับตัวเก่ง ไม่น่าเบื่อ สร้างสีสันเก่ง' },
  { name: 'ราศีกรกฎ', en: 'Cancer', symbol: '♋', element: 'น้ำ', elementColor: '#1d4ed8', bg: '#dbeafe', start: [6, 21], end: [7, 22], trait: 'ใส่ใจคนรอบข้าง อ่อนไหวลึกซึ้ง ชอบดูแลปกป้องคนที่รัก' },
  { name: 'ราศีสิงห์', en: 'Leo', symbol: '♌', element: 'ไฟ', elementColor: '#b91c1c', bg: '#fee2e2', start: [7, 23], end: [8, 22], trait: 'สง่างาม มั่นใจในตัวเอง อบอุ่น ใจกว้างและเป็นผู้นำที่ดี' },
  { name: 'ราศีกันย์', en: 'Virgo', symbol: '♍', element: 'ดิน', elementColor: '#92400e', bg: '#fef3c7', start: [8, 23], end: [9, 22], trait: 'ละเอียดรอบคอบ ช่างสังเกต ซื่อสัตย์ ไว้วางใจได้เสมอ' },
  { name: 'ราศีตุลย์', en: 'Libra', symbol: '♎', element: 'ลม', elementColor: '#0369a1', bg: '#e0f2fe', start: [9, 23], end: [10, 22], trait: 'รักความสงบ มีเสน่ห์ โรแมนติก ประนีประนอมเก่ง' },
  { name: 'ราศีพิจิก', en: 'Scorpio', symbol: '♏', element: 'น้ำ', elementColor: '#1d4ed8', bg: '#dbeafe', start: [10, 23], end: [11, 21], trait: 'ลุ่มลึก น่าค้นหา รักแรงหวงแรง ปกป้องคนที่รักสุดหัวใจ' },
  { name: 'ราศีธนู', en: 'Sagittarius', symbol: '♐', element: 'ไฟ', elementColor: '#b91c1c', bg: '#fee2e2', start: [11, 22], end: [12, 21], trait: 'มองโลกในแง่ดี ชอบการผจญภัย ร่าเริง จริงใจ ไม่ยึดติด' }
];

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

const CHINESE_ZODIACS = [
  'ปีชวด (หนู)', 'ปีฉลู (วัว)', 'ปีขาล (เสือ)', 'ปีเถาะ (กระต่าย)',
  'ปีมะโรง (มังกร)', 'ปีมะเส็ง (งู)', 'ปีมะเมีย (ม้า)', 'ปีมะแม (แพะ)',
  'ปีวอก (ลิง)', 'ปีระกา (ไก่)', 'ปีจอ (หมา)', 'ปีกุน (หมู)'
];

// คู่มิตรตามหลักมหาทักษา (Day Compatibility)
const DAY_FRIENDS = {
  'วันอาทิตย์': ['วันพฤหัสบดี', 'วันจันทร์'],
  'วันจันทร์': ['วันพุธ', 'วันอาทิตย์', 'วันเสาร์'],
  'วันอังคาร': ['วันศุกร์', 'วันพฤหัสบดี'],
  'วันพุธ': ['วันจันทร์', 'วันเสาร์'],
  'วันพฤหัสบดี': ['วันอาทิตย์', 'วันอังคาร'],
  'วันศุกร์': ['วันอังคาร', 'วันพุธ'],
  'วันเสาร์': ['วันพุธ', 'วันจันทร์']
};

// ซาฮะ (三合 San He - 3 ประสาน)
const CHINESE_SAN_HE = {
  'ชวด': ['มะโรง', 'วอก'],
  'มะโรง': ['ชวด', 'วอก'],
  'วอก': ['ชวด', 'มะโรง'],
  'ขาล': ['มะเมีย', 'จอ'],
  'มะเมีย': ['ขาล', 'จอ'],
  'จอ': ['ขาล', 'มะเมีย'],
  'ฉลู': ['มะเส็ง', 'ระกา'],
  'มะเส็ง': ['ฉลู', 'ระกา'],
  'ระกา': ['ฉลู', 'มะเส็ง'],
  'เถาะ': ['มะแม', 'กุน'],
  'มะแม': ['เถาะ', 'กุน'],
  'กุน': ['เถาะ', 'มะแม']
};

// ลักฮะ (六合 Liu He - 6 คู่มิตรแท้)
const CHINESE_LIU_HE = {
  'ชวด': 'ฉลู',
  'ฉลู': 'ชวด',
  'ขาล': 'กุน',
  'กุน': 'ขาล',
  'เถาะ': 'จอ',
  'จอ': 'เถาะ',
  'มะโรง': 'ระกา',
  'ระกา': 'มะโรง',
  'มะเส็ง': 'วอก',
  'วอก': 'มะเส็ง',
  'มะเมีย': 'มะแม',
  'มะแม': 'มะเมีย'
};

// คู่ชง (ปะทะ)
const CHINESE_CHONG = {
  'ชวด': 'มะเมีย',
  'มะเมีย': 'ชวด',
  'ฉลู': 'มะแม',
  'มะแม': 'ฉลู',
  'ขาล': 'วอก',
  'วอก': 'ขาล',
  'เถาะ': 'ระกา',
  'ระกา': 'เถาะ',
  'มะโรง': 'จอ',
  'จอ': 'มะโรง',
  'มะเส็ง': 'กุน',
  'กุน': 'มะเส็ง'
};

function cleanZodiacBaseName(zName) {
  if (!zName) return '';
  const match = zName.match(/ปี(ชวด|ฉลู|ขาล|เถาะ|มะโรง|มะเส็ง|มะเมีย|มะแม|วอก|ระกา|จอ|กุน)/);
  if (match) return match[1];
  return zName.replace(/[^\u0E00-\u0E7F]/g, '').trim();
}

/**
 * คำนวณราศีและธาตุจากวันเกิด
 */
function getZodiacSign(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const month = d.getMonth() + 1;
  const day = d.getDate();

  for (const z of ZODIAC_SIGNS) {
    const [sm, sd] = z.start;
    const [em, ed] = z.end;

    if (sm === 12 && em === 1) {
      if ((month === 12 && day >= sd) || (month === 1 && day <= ed)) {
        return z;
      }
    } else {
      if ((month === sm && day >= sd) || (month === em && day <= ed)) {
        return z;
      }
    }
  }
  return ZODIAC_SIGNS[0];
}

/**
 * คำนวณวันในสัปดาห์
 */
function getDayOfWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return THAI_DAYS[d.getDay()];
}

/**
 * คำนวณปีนักษัตร
 */
function getChineseZodiac(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const index = (year - 4) % 12;
  return CHINESE_ZODIACS[index >= 0 ? index : index + 12];
}

/**
 * คำนวณอายุจากวันเกิด
 */
function calculateAge(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * คำนวณโปรไฟล์ดวงชะตาของผู้ใช้
 */
function getUserAstrologyProfile(birthdate) {
  if (!birthdate) return null;
  const zodiac = getZodiacSign(birthdate);
  const day = getDayOfWeek(birthdate);
  const chinese = getChineseZodiac(birthdate);
  const age = calculateAge(birthdate);

  return {
    birthdate,
    age,
    zodiacName: zodiac?.name || 'ไม่ระบุราศี',
    zodiacEn: zodiac?.en || '',
    symbol: zodiac?.symbol || '✨',
    element: zodiac?.element || 'ไม่ระบุ',
    elementColor: zodiac?.elementColor || '#6366f1',
    elementBg: zodiac?.bg || '#f5f3ff',
    trait: zodiac?.trait || '',
    thaiDay: day || 'ไม่ระบุวัน',
    chineseZodiac: chinese || 'ไม่ระบุปี'
  };
}

/**
 * วิเคราะห์ความสมพงษ์ของดวงเนื้อคู่เชิงลึกแบบ Multi-dimensional Match Score
 * @param {object} userA - ข้อมูลผู้ใช้ฝ่ายแรก
 * @param {object} userB - ข้อมูลผู้ใช้ฝ่ายที่สอง
 * @param {object} options - ตัวเลือกการแมตช์ { dimension: 'normal'|'love'|'work'|'wealth', astromode: 'all'|'noduo'|'day'|'zodiac' }
 */
function calculateSoulmateCompatibility(userA, userB, options = {}) {
  const matchDimension = options.dimension || 'normal'; // 'normal' | 'love' | 'work' | 'wealth'
  const astroMode = options.astromode || 'all'; // 'all' | 'noduo' | 'day' | 'zodiac'

  if (!userA || !userB) {
    return {
      score: 88,
      level: '✨ ดวงคู่บุญหนุนนำ (Great Chemistry)',
      dimensions: {
        passion: { score: 90, label: '🔥 เสน่หาและแรงดึงดูด (Passion)', desc: 'มีเคมีและความประทับใจแรกพบในเกณฑ์ดีเยี่ยม' },
        emotional: { score: 87, label: '💖 ความเข้าใจและความรู้สึก (Emotional Connection)', desc: 'รับฟังและปลอบประโลมจิตใจกันได้ดี' },
        communication: { score: 89, label: '🗣️ การสื่อสารและไลฟ์สไตล์ (Communication)', desc: 'คุยภาษาเดียวกัน มีรสนิยมใกล้เคียงกัน' },
        longTerm: { score: 88, label: '💍 โอกาสต่อยอดระยะยาว (Long-Term Potential)', desc: 'เป้าหมายชีวิตและค่านิยมส่งเสริมกัน' }
      },
      summaryPoints: [
        'คุณทั้งคู่มีไลฟ์สไตล์ที่ส่งเสริมพลังงานเชิงบวกให้แก่กัน',
        'มีความสนใจที่สามารถเริ่มบทสนทนาและชวนไปทำกิจกรรมร่วมกันได้ง่าย'
      ],
      elementDynamic: 'ธาตุกลมกลืนเป็นธรรมชาติ',
      dayDynamic: 'มีมิตรภาพที่ราบรื่น',
      chineseDynamic: 'เกื้อหนุนชีวิตคู่ให้เจริญก้าวหน้า',
      advice: 'เปิดใจพูดคุยในสิ่งที่ชอบร่วมกัน จะช่วยให้สนิทกันไวยิ่งขึ้น',
      luckySpot: 'นั่งชิลคาเฟ่ริมบึงสีฐาน หรือห้องสมุด มข.',
      sources: ASTROLOGY_SOURCES_DB
    };
  }

  const astroA = getUserAstrologyProfile(userA.birthdate) || {
    zodiacName: userA.zodiac || 'ราศีเมษ',
    element: 'ไฟ',
    thaiDay: 'วันจันทร์',
    chineseZodiac: 'ปีชวด (หนู)',
    trait: 'สดใส มีพลัง'
  };

  const astroB = getUserAstrologyProfile(userB.birthdate) || {
    zodiacName: userB.zodiac || 'ราศีสิงห์',
    element: 'ไฟ',
    thaiDay: 'วันพุธ',
    chineseZodiac: 'ปีมะโรง (มังกร)',
    trait: 'อบอุ่น ใจกว้าง'
  };

  const elA = astroA.element;
  const elB = astroB.element;

  // Interests comparison
  const tagsA = (userA.interests || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const tagsB = (userB.interests || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const sharedCount = tagsA.filter(t => tagsB.some(tb => tb.includes(t) || t.includes(tb))).length;

  // 1. 🔥 Passion & Chemistry Score (70% - 98%)
  let passionScore = 84;
  let elementDynamic = '';
  if (elA === elB) {
    if (elA === 'ไฟ') {
      passionScore = 95;
      elementDynamic = `🔥 ธาตุไฟ + ธาตุไฟ: ความรักเต็มไปด้วยพลัง มีไฟในการทำตามฝัน ทะเยอทะยานและเข้าใจแรงขับเคลื่อนของกันและกัน`;
    } else if (elA === 'น้ำ') {
      passionScore = 91;
      elementDynamic = `💧 ธาตุน้ำ + ธาตุน้ำ: ความรักที่เต็มไปด้วยความเข้าอกเข้าใจ อ่อนโยน ปลอบประโลมจิตใจ เป็นที่พักพิงที่ปลอดภัย`;
    } else if (elA === 'ดิน') {
      passionScore = 89;
      elementDynamic = `🌱 ธาตุดิน + ธาตุดิน: ความรักที่มั่นคง หนักแน่น มีเป้าหมายอนาคตร่วมกันอย่างชัดเจนและซื่อสัตย์`;
    } else {
      passionScore = 92;
      elementDynamic = `💨 ธาตุลม + ธาตุลม: คุยสนุก แลกเปลี่ยนไอเดียได้ไม่รู้เบื่อ มีอิสระและเข้าใจพื้นที่ส่วนตัวของกันและกัน`;
    }
  } else if ((elA === 'ไฟ' && elB === 'ลม') || (elA === 'ลม' && elB === 'ไฟ')) {
    passionScore = 96;
    elementDynamic = `✨ ธาตุไฟ + ธาตุลม: คู่ธาตุส่งเสริมยอดเยี่ยม! ลมช่วยเติมเชื้อไฟแห่งแรงบันดาลใจ ส่วนไฟมอบความตื่นเต้นและอบอุ่น คุยสนุกและเข้ากันได้ลื่นไหล`;
  } else if ((elA === 'ดิน' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ดิน')) {
    passionScore = 92;
    elementDynamic = `🌿 ธาตุดิน + ธาตุน้ำ: คู่ธาตุเสริมสร้างความงอกงาม! น้ำช่วยให้ดินชุ่มชื้น ดินช่วยเป็นหลักยึดเหนี่ยว เป็นความรักที่เติบโตและมั่นคงยืนยาว`;
  } else if ((elA === 'ไฟ' && elB === 'ดิน') || (elA === 'ดิน' && elB === 'ไฟ')) {
    passionScore = 88;
    elementDynamic = `⛰️ ธาตุไฟ + ธาตุดิน: ไฟช่วยจุดประกายความฝัน ดินช่วยวางแผนให้เป็นจริง ช่วยดึงสติและเกื้อหนุนกันได้ดีเยี่ยม`;
  } else if ((elA === 'ลม' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ลม')) {
    passionScore = 87;
    elementDynamic = `🌊 ธาตุลม + ธาตุน้ำ: สายลมสร้างคลื่นแห่งจินตนาการ เป็นความสัมพันธ์ที่โรแมนติก อบอุ่น และใส่ใจความรู้สึกกันเสมอ`;
  } else {
    passionScore = 85;
    if ((elA === 'ไฟ' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ไฟ')) {
      elementDynamic = `⚖️ ธาตุไฟ + ธาตุน้ำ: มีเสน่ห์ตรงข้ามที่ดึงดูดกันอย่างรุนแรง น้ำช่วยลดความใจร้อนของไฟ ไฟช่วยเพิ่มพลังความกระตือรือร้น`;
    } else {
      elementDynamic = `🍃 ธาตุดิน + ธาตุลม: เรียนรู้ความต่างอย่างลงตัว ดินช่วยให้ลมมีทิศทาง ลมช่วยให้ดินเปิดรับมุมมองใหม่ๆ`;
    }
  }

  // 2. 💖 Emotional Connection Score (70% - 97%)
  let emotionalScore = 82;
  let dayDynamic = '';
  const dayFriendsA = DAY_FRIENDS[astroA.thaiDay] || [];
  if (dayFriendsA.includes(astroB.thaiDay)) {
    emotionalScore = 94;
    dayDynamic = `${astroA.thaiDay} กับ ${astroB.thaiDay} เป็น "คู่มิตรใหญ่ตามตำรามหาทักษา" มีดวงเกื้อหนุน เข้าหากันง่าย ไว้ใจกันได้รวดเร็ว`;
  } else if (astroA.thaiDay === astroB.thaiDay) {
    emotionalScore = 91;
    dayDynamic = `เกิด${astroA.thaiDay}เหมือนกัน สไตล์ความคิดและอุปนิสัยคล้ายกัน ทำให้เข้าใจความรู้สึกกันได้โดยไม่ต้องพูดเยอะ`;
  } else {
    emotionalScore = 85;
    dayDynamic = `${astroA.thaiDay} และ ${astroB.thaiDay} ต่างคนต่างมีเสน่ห์เฉพาะตัว การพูดคุยจะเปิดมุมมองใหม่ๆ ให้แก่กัน`;
  }

  // Boost for Yin water/earth harmony
  if (elA === 'น้ำ' || elB === 'น้ำ' || elA === 'ดิน' || elB === 'ดิน') {
    emotionalScore = Math.min(97, emotionalScore + 2);
  }

  // 3. 🗣️ Communication & Lifestyle Score (68% - 98%)
  let communicationScore = 78;
  if (sharedCount >= 3) {
    communicationScore = 95;
  } else if (sharedCount >= 1) {
    communicationScore = 90;
  } else {
    communicationScore = 83;
  }
  // If same faculty or university
  if (userA.major && userB.major && (userA.major === userB.major || (userA.faculty && userA.faculty === userB.faculty))) {
    communicationScore = Math.min(98, communicationScore + 3);
  }
  if (elA === 'ลม' || elB === 'ลม') {
    communicationScore = Math.min(98, communicationScore + 2);
  }

  // 4. 💍 Long-Term Potential Score (70% - 98%)
  let longTermScore = 80;
  let chineseDynamic = '';
  const cnA = cleanZodiacBaseName(astroA.chineseZodiac);
  const cnB = cleanZodiacBaseName(astroB.chineseZodiac);

  if (CHINESE_LIU_HE[cnA] === cnB) {
    longTermScore = 97;
    chineseDynamic = `ปี${cnA} กับ ปี${cnB} เป็น "คู่ลักฮะ (六合)" คู่มิตรแท้ระดับสูงสุดตามตำราจีน เกื้อหนุนชีวิตคู่และหน้าที่การงานให้เจริญก้าวหน้า`;
  } else if (CHINESE_SAN_HE[cnA] && CHINESE_SAN_HE[cnA].includes(cnB)) {
    longTermScore = 94;
    chineseDynamic = `ปี${cnA} กับ ปี${cnB} อยู่ในกลุ่ม "ซาฮะ (三合)" พันธมิตรสามประสาน ช่วยเติมเต็มเป้าหมายชีวิตและสร้างความมั่นคงร่วมกัน`;
  } else if (CHINESE_CHONG[cnA] === cnB) {
    longTermScore = 82;
    chineseDynamic = `ปี${cnA} กับ ปี${cnB} มีพลังเฉพาะตัวที่แตกต่างกัน ต้องอาศัยการสื่อสารและรับฟังกัน จะเปลี่ยนความต่างเป็นเสน่ห์ที่เติมเต็ม`;
  } else {
    longTermScore = 89;
    chineseDynamic = `ปี${cnA} กับ ปี${cnB} ดวงสมพงษ์ราบรื่น ไร้แรงปะทะ สามารถส่งเสริมกันและกันได้อย่างเป็นธรรมชาติ`;
  }

  // Compute Overall Score based on matchDimension and astroMode
  let finalScore = 85;

  if (astroMode === 'noduo') {
    // Non-astrology mode: 70% communication & shared lifestyle + 30% emotional/faculty
    finalScore = Math.round((communicationScore * 0.70) + (emotionalScore * 0.30));
  } else if (astroMode === 'day') {
    // Day of week focus
    finalScore = Math.round((emotionalScore * 0.50) + (passionScore * 0.25) + (communicationScore * 0.15) + (longTermScore * 0.10));
  } else if (astroMode === 'zodiac') {
    // Zodiac & Chinese element focus
    finalScore = Math.round((passionScore * 0.40) + (longTermScore * 0.35) + (communicationScore * 0.15) + (emotionalScore * 0.10));
  } else {
    // Standard mode with dimension weighting
    if (matchDimension === 'love') {
      finalScore = Math.round((passionScore * 0.40) + (emotionalScore * 0.35) + (longTermScore * 0.15) + (communicationScore * 0.10));
    } else if (matchDimension === 'work') {
      finalScore = Math.round((communicationScore * 0.45) + (longTermScore * 0.30) + (emotionalScore * 0.15) + (passionScore * 0.10));
    } else if (matchDimension === 'wealth') {
      finalScore = Math.round((longTermScore * 0.40) + (communicationScore * 0.30) + (emotionalScore * 0.20) + (passionScore * 0.10));
    } else {
      finalScore = Math.round((passionScore * 0.25) + (emotionalScore * 0.25) + (communicationScore * 0.25) + (longTermScore * 0.25));
    }
  }

  finalScore = Math.min(99, Math.max(65, finalScore));

  // Determine Match Level
  let level = '';
  let advice = '';
  let luckySpot = '';

  if (finalScore >= 93) {
    level = '💖 ดวงคู่แท้พรหมลิขิต (Destined Soulmate)';
    advice = 'ดวงสมพงษ์ระดับสูงสุด มีเคมีที่ส่งเสริมทั้งชีวิต การเรียน และความฝัน อย่าลังเลที่จะส่งข้อความทักทายคนนี้!';
    luckySpot = 'นัดเจอนั่งรับลมริมบึงสีฐานช่วงเย็น หรือชวนกันไปชิมของอร่อยแถวกังสดาล';
  } else if (finalScore >= 85) {
    level = '✨ ดวงคู่บุญหนุนนำ (Great Chemistry)';
    advice = 'ดวงชะตาเข้ากันได้อย่างยอดเยี่ยม มีความเข้าอกเข้าใจและเป็นพลังบวกให้แก่กัน คุยด้วยแล้วสบายใจ';
    luckySpot = 'ชวนกันไปหาคาเฟ่เงียบๆ ติวหนังสือหรืออ่านหนังสือด้วยกันที่สำนักหอสมุด มข.';
  } else if (finalScore >= 75) {
    level = '🌿 ดวงคู่ส่งเสริมเติมเต็ม (Harmonious Match)';
    advice = 'เป็นคู่ที่เกื้อกูลกันได้ดีมาก ความต่างในบางเรื่องจะกลายเป็นส่วนที่ช่วยเติมเต็มจุดบกพร่องของอีกฝ่าย';
    luckySpot = 'ชวนไปทำกิจกรรมตีแบด หรือออกกำลังกายเบาๆ แถวศูนย์กีฬา มข.';
  } else {
    level = '🤝 ดวงคู่เรียนรู้ร่วมเดินทาง (Complimentary Bond)';
    advice = 'ความสัมพันธ์จะพัฒนาได้อย่างมั่นคงหากเริ่มจากการเป็นเพื่อนที่ดี รับฟังและแลกเปลี่ยนเรื่องราวชีวิต';
    luckySpot = 'แวะกินข้าวหลังมอกันแบบสบายๆ ไม่ต้องเกร็ง';
  }

  // Summary points formatting
  const summaryPoints = [];
  if (sharedCount > 0) {
    summaryPoints.push(`คุณทั้งคู่มีแท็กสนใจร่วมกัน ${sharedCount} แท็ก ทำให้ปรับตัวและคุยได้ลื่นไหล`);
  } else {
    summaryPoints.push(`คุณทั้งคู่มีสไตล์และความชอบที่หลากหลาย ช่วยเปิดโลกและสร้างสีสันใหม่ๆ ให้แก่กัน`);
  }

  summaryPoints.push(`สมดุลธาตุประจำราศี (${elA} & ${elB}) หนุนนำพลังงานเชิงบวก ให้คุยกันเข้าขาได้รวดเร็ว`);

  if (dayDynamic) {
    summaryPoints.push(`ความสัมพันธ์ตามวันเกิด: ${dayDynamic}`);
  }

  if (chineseDynamic) {
    summaryPoints.push(`ปีนักษัตร (${astroA.chineseZodiac} & ${astroB.chineseZodiac}): ${chineseDynamic}`);
  }

  return {
    score: finalScore,
    level,
    dimensions: {
      passion: {
        score: passionScore,
        label: '🔥 เสน่หาและแรงดึงดูด (Passion)',
        desc: 'เคมีความดึงดูด พลังความกระตือรือร้น และความน่าค้นหาในตัวอีกฝ่าย'
      },
      emotional: {
        score: emotionalScore,
        label: '💖 ความเข้าใจและความรู้สึก (Emotional Connection)',
        desc: 'ความเข้าอกเข้าใจ ความอบอุ่นใจ และการเป็นพื้นที่ปลอดภัยให้แก่กัน'
      },
      communication: {
        score: communicationScore,
        label: '🗣️ การสื่อสารและไลฟ์สไตล์ (Communication)',
        desc: 'การคุยภาษาเดียวกัน ไลฟ์สไตล์ที่ตรงกัน และกิจกรรมที่ชอบทำร่วมกัน'
      },
      longTerm: {
        score: longTermScore,
        label: '💍 โอกาสต่อยอดระยะยาว (Long-Term Potential)',
        desc: 'ความสมพงษ์ตามปีนักษัตร ค่านิยม ความมั่นคง และเป้าหมายอนาคต'
      }
    },
    summaryPoints,
    elementDynamic,
    dayDynamic,
    chineseDynamic,
    advice,
    luckySpot,
    userA: astroA,
    userB: astroB,
    sources: ASTROLOGY_SOURCES_DB
  };
}

module.exports = {
  ZODIAC_SIGNS,
  THAI_DAYS,
  CHINESE_ZODIACS,
  ASTROLOGY_SOURCES_DB,
  getZodiacSign,
  getDayOfWeek,
  getChineseZodiac,
  calculateAge,
  getUserAstrologyProfile,
  calculateSoulmateCompatibility
};
