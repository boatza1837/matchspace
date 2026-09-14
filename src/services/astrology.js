/**
 * MatchSpace Soulmate Astrology & Compatibility Engine
 * ศาสตร์วิเคราะห์ดวงเนื้อคู่เชิงลึก: ราศี, ธาตุ, วันเกิดในสัปดาห์, และปีนักษัตร
 */

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

/**
 * คำนวณราศีและธาตุจากวันเกิด
 * @param {string|Date} dateStr - รูปแบบ YYYY-MM-DD
 */
function getZodiacSign(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const month = d.getMonth() + 1; // 1-12
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
  // 1900 is Year of the Rat (ชวด) -> index 0
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
 * วิเคราะห์ความสมพงษ์ของดวงเนื้อคู่ระหว่าง 2 คน (Deep Soulmate Compatibility)
 * @param {object} userA - ข้อมูลผู้ใช้ฝ่ายแรก (ต้องมี birthdate หรือ zodiac)
 * @param {object} userB - ข้อมูลผู้ใช้ฝ่ายที่สอง
 */
function calculateSoulmateCompatibility(userA, userB) {
  if (!userA || !userB) {
    return {
      score: 85,
      level: 'ดวงคู่มิตรสมพงษ์',
      summary: 'มีพลังงานส่งเสริมกันได้ดี เป็นคู่คิดที่คุยกันรู้เรื่อง',
      elementHarmony: 'ธาตุกลมกลืนเป็นธรรมชาติ',
      dayHarmony: 'มีมิตรภาพที่ราบรื่น',
      advice: 'เปิดใจพูดคุยในสิ่งที่ชอบร่วมกัน จะช่วยให้สนิทกันไวยิ่งขึ้น',
      luckySpot: 'นั่งชิลคาเฟ่ริมบึงสีฐาน หรือห้องสมุด มข.'
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

  // 1. ธาตุคู่สมพงษ์ (Element Chemistry) - Base 40%
  let elementScore = 32;
  let elementDynamic = '';

  if (elA === elB) {
    elementScore = 38;
    if (elA === 'ไฟ') elementDynamic = '🔥 ธาตุไฟ + ธาตุไฟ: ความรักเต็มไปด้วยพลัง มีไฟในการทำตามฝัน ทะเยอทะยานและเข้าใจแรงขับเคลื่อนของกันและกัน';
    else if (elA === 'น้ำ') elementDynamic = '💧 ธาตุน้ำ + ธาตุน้ำ: ความรักที่เต็มไปด้วยความเข้าอกเข้าใจ อ่อนโยน ปลอบประโลมจิตใจ เป็นที่พักพิงที่ปลอดภัย';
    else if (elA === 'ดิน') elementDynamic = '🌱 ธาตุดิน + ธาตุดิน: ความรักที่มั่นคง หนักแน่น มีเป้าหมายอนาคตร่วมกันอย่างชัดเจนและซื่อสัตย์';
    else if (elA === 'ลม') elementDynamic = '💨 ธาตุลม + ธาตุลม: คุยสนุก แลกเปลี่ยนไอเดียได้ไม่รู้เบื่อ มีอิสระและเข้าใจพื้นที่ส่วนตัวของกันและกัน';
  } else if ((elA === 'ไฟ' && elB === 'ลม') || (elA === 'ลม' && elB === 'ไฟ')) {
    elementScore = 40;
    elementDynamic = '✨ ธาตุไฟ + ธาตุลม: คู่ธาตุส่งเสริมยอดเยี่ยม! ลมช่วยเติมเชื้อไฟแห่งแรงบันดาลใจ ส่วนไฟมอบความตื่นเต้นและอบอุ่น คุยสนุกและเข้ากันได้ลื่นไหล';
  } else if ((elA === 'ดิน' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ดิน')) {
    elementScore = 40;
    elementDynamic = '🌿 ธาตุดิน + ธาตุน้ำ: คู่ธาตุเสริมสร้างความงอกงาม! น้ำช่วยให้ดินชุ่มชื้น ดินช่วยเป็นหลักยึดเหนี่ยว เป็นความรักที่เติบโตและมั่นคงยืนยาว';
  } else if ((elA === 'ไฟ' && elB === 'ดิน') || (elA === 'ดิน' && elB === 'ไฟ')) {
    elementScore = 34;
    elementDynamic = '⛰️ ธาตุไฟ + ธาตุดิน: ไฟช่วยจุดประกายความฝัน ดินช่วยวางแผนให้เป็นจริง ช่วยดึงสติและเกื้อหนุนกันได้ดีเยี่ยม';
  } else if ((elA === 'ลม' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ลม')) {
    elementScore = 33;
    elementDynamic = '🌊 ธาตุลม + ธาตุน้ำ: สายลมสร้างคลื่นแห่งจินตนาการ เป็นความสัมพันธ์ที่โรแมนติก อบอุ่น และใส่ใจความรู้สึกกันเสมอ';
  } else {
    // ไฟ+น้ำ หรือ ดิน+ลม
    elementScore = 30;
    if ((elA === 'ไฟ' && elB === 'น้ำ') || (elA === 'น้ำ' && elB === 'ไฟ')) {
      elementDynamic = '⚖️ ธาตุไฟ + ธาตุน้ำ: มีเสน่ห์ตรงข้ามที่ดึงดูดกันอย่างรุนแรง น้ำช่วยลดความใจร้อนของไฟ ไฟช่วยเพิ่มพลังความกระตือรือร้น';
    } else {
      elementDynamic = '🍃 ธาตุดิน + ธาตุลม: เรียนรู้ความต่างอย่างลงตัว ดินช่วยให้ลมมีทิศทาง ลมช่วยให้ดินเปิดรับมุมมองใหม่ๆ';
    }
  }

  // 2. วันเกิดคู่มิตร (Day Chemistry) - Base 30%
  let dayScore = 24;
  let dayDynamic = '';
  const dayFriendsA = DAY_FRIENDS[astroA.thaiDay] || [];
  if (dayFriendsA.includes(astroB.thaiDay)) {
    dayScore = 30;
    dayDynamic = `🌟 ${astroA.thaiDay} กับ ${astroB.thaiDay} เป็น "คู่มิตรใหญ่ตามตำรามหาทักษา" มีดวงเกื้อหนุน เข้าหากันง่าย ไว้ใจกันได้รวดเร็ว`;
  } else if (astroA.thaiDay === astroB.thaiDay) {
    dayScore = 27;
    dayDynamic = `🤝 เกิด${astroA.thaiDay}เหมือนกัน สไตล์ความคิดและอุปนิสัยคล้ายกัน ทำให้เข้าใจความรู้สึกกันได้โดยไม่ต้องพูดเยอะ`;
  } else {
    dayScore = 24;
    dayDynamic = `💫 ${astroA.thaiDay} และ ${astroB.thaiDay} ต่างคนต่างมีเสน่ห์เฉพาะตัว การพูดคุยจะเปิดมุมมองใหม่ๆ ให้แก่กัน`;
  }

  // 3. ความสนใจร่วมกันและพลังนักษัตร - Base 30%
  let bonusScore = 24;
  let strengths = [];

  // เช็ก Interests ร่วมกัน
  const tagsA = (userA.interests || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const tagsB = (userB.interests || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const sharedCount = tagsA.filter(t => tagsB.some(tb => tb.includes(t) || t.includes(tb))).length;

  if (sharedCount >= 3) {
    bonusScore = 29;
    strengths.push('มีความชอบและไลฟ์สไตล์ตรงกันหลายอย่าง คุยกันได้ไหลลื่น');
  } else if (sharedCount >= 1) {
    bonusScore = 27;
    strengths.push('มีจุดเชื่อมโยงในสิ่งที่สนใจร่วมกัน ทำให้เริ่มสนิทกันได้ง่าย');
  } else {
    bonusScore = 25;
    strengths.push('ต่างคนต่างมีสไตล์ที่แตกต่าง เป็นเสน่ห์ชวนให้ค้นหาซึ่งกันและกัน');
  }

  // รวมคะแนนทั้งหมด
  let totalScore = Math.min(99, Math.max(65, elementScore + dayScore + bonusScore));

  let level = '';
  let advice = '';
  let luckySpot = '';

  if (totalScore >= 93) {
    level = '💖 ดวงคู่แท้พรหมลิขิต (Destined Soulmate)';
    advice = 'ดวงสมพงษ์ระดับสูงสุด มีเคมีที่ส่งเสริมทั้งชีวิต การเรียน และความฝัน อย่าลังเลที่จะส่งข้อความทักทายคนนี้!';
    luckySpot = 'นัดเจอนั่งรับลมริมบึงสีฐานช่วงเย็น หรือชวนกันไปชิมของอร่อยแถวกังสดาล';
  } else if (totalScore >= 85) {
    level = '✨ ดวงคู่บุญหนุนนำ (Great Chemistry)';
    advice = 'ดวงชะตาเข้ากันได้อย่างยอดเยี่ยม มีความเข้าอกเข้าใจและเป็นพลังบวกให้แก่กัน คุยด้วยแล้วสบายใจ';
    luckySpot = 'ชวนกันไปหาคาเฟ่เงียบๆ ติวหนังสือหรืออ่านหนังสือด้วยกันที่สำนักหอสมุด มข.';
  } else if (totalScore >= 75) {
    level = '🌿 ดวงคู่ส่งเสริมเติมเต็ม (Harmonious Match)';
    advice = 'เป็นคู่ที่เกื้อกูลกันได้ดีมาก ความต่างในบางเรื่องจะกลายเป็นส่วนที่ช่วยเติมเต็มจุดบกพร่องของอีกฝ่าย';
    luckySpot = 'ชวนไปทำกิจกรรมตีแบด หรือออกกำลังกายเบาๆ แถวศูนย์กีฬา มข.';
  } else {
    level = '🤝 ดวงคู่เรียนรู้ร่วมเดินทาง (Complimentary Bond)';
    advice = 'ความสัมพันธ์จะพัฒนาได้อย่างมั่นคงหากเริ่มจากการเป็นเพื่อนที่ดี รับฟังและแลกเปลี่ยนเรื่องราวชีวิต';
    luckySpot = 'แวะกินข้าวหลังมอกันแบบสบายๆ ไม่ต้องเกร็ง';
  }

  return {
    score: totalScore,
    level,
    elementDynamic,
    dayDynamic,
    strengths,
    advice,
    luckySpot,
    userA: astroA,
    userB: astroB
  };
}

module.exports = {
  ZODIAC_SIGNS,
  THAI_DAYS,
  CHINESE_ZODIACS,
  getZodiacSign,
  getDayOfWeek,
  getChineseZodiac,
  calculateAge,
  getUserAstrologyProfile,
  calculateSoulmateCompatibility
};
