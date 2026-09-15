/**
 * MatchSpace Analytics & Visitor Tracking Service
 * Collects, aggregates and provides analytics data for Admin Dashboard.
 */

const { db } = require('../config/db');

// In-memory debounce cache to prevent duplicate visit logs within 5 seconds
const visitDebounceCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of visitDebounceCache.entries()) {
    if (now - timestamp > 15000) {
      visitDebounceCache.delete(key);
    }
  }
}, 30000);

/**
 * Parse detailed Device, OS, and Browser from User-Agent
 */
function parseUserAgentDetails(userAgent = '') {
  const ua = String(userAgent || '');
  let deviceType = 'Desktop';
  let os = 'Windows';
  let browser = 'Chrome';

  // Device & OS detection
  if (/iphone/i.test(ua)) {
    deviceType = 'Mobile';
    os = 'iOS (iPhone)';
  } else if (/ipad/i.test(ua)) {
    deviceType = 'Tablet';
    os = 'iPadOS';
  } else if (/android/i.test(ua)) {
    deviceType = /mobile/i.test(ua) ? 'Mobile' : 'Tablet';
    os = 'Android';
  } else if (/macintosh|mac os x/i.test(ua)) {
    deviceType = 'Desktop';
    os = 'macOS';
  } else if (/linux/i.test(ua)) {
    deviceType = 'Desktop';
    os = 'Linux';
  } else if (/windows/i.test(ua)) {
    deviceType = 'Desktop';
    os = 'Windows';
  }

  // Browser detection
  if (/edg/i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/samsungbrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Apple Safari';
  } else if (/chrome|crios/i.test(ua)) {
    browser = 'Google Chrome';
  } else {
    browser = 'Other';
  }

  return { deviceType, os, browser };
}

/**
 * Record a page visit
 */
async function recordPageVisit(req, customPath = null) {
  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim().replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const path = customPath || req.path || '/';
    const method = req.method || 'GET';
    const sessionId = req.sessionID || req.session?.id || ip;
    const userId = req.session?.user?.id || null;
    const referrer = req.headers['referer'] || req.headers['referrer'] || '';

    // Debounce duplicate hits from same session & path within 5s
    const debounceKey = `${sessionId}:${ip}:${path}`;
    const lastHit = visitDebounceCache.get(debounceKey);
    const now = Date.now();
    if (lastHit && now - lastHit < 5000) {
      return; // Skip duplicate rapid hit
    }
    visitDebounceCache.set(debounceKey, now);

    const { deviceType, os, browser } = parseUserAgentDetails(userAgent);

    await db.run(`
      INSERT INTO page_visits (session_id, user_id, path, method, ip, user_agent, device_type, os, browser, referrer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, userId, path, method, ip, userAgent.slice(0, 500), deviceType, os, browser, referrer.slice(0, 300)]);
  } catch (err) {
    console.error('[Analytics Record Error]', err.message);
  }
}

/**
 * Get Overview KPI Metrics
 */
async function getAnalyticsOverview() {
  try {
    const totalRow = await db.get('SELECT COUNT(*) AS count FROM page_visits');
    const totalVisits = totalRow?.count || 0;

    // Today's stats
    const todayStats = await db.get(`
      SELECT
        COUNT(*) AS today_visits,
        COUNT(DISTINCT COALESCE(user_id, ip)) AS today_uniques
      FROM page_visits
      WHERE date(created_at) = date('now')
    `);

    // Active in last 15 minutes
    const activeRow = await db.get(`
      SELECT COUNT(DISTINCT COALESCE(user_id, ip)) AS active_now
      FROM page_visits
      WHERE created_at >= datetime('now', '-15 minutes')
    `);

    // Member vs Guest ratio
    const userRatioRow = await db.get(`
      SELECT
        COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) AS member_visits,
        COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS guest_visits
      FROM page_visits
    `);

    // Peak insights
    const peakInsights = await getPeakInsights();

    return {
      total_visits: totalVisits,
      today_visits: todayStats?.today_visits || 0,
      today_uniques: todayStats?.today_uniques || 0,
      active_now: Math.max(1, activeRow?.active_now || 0),
      member_visits: userRatioRow?.member_visits || 0,
      guest_visits: userRatioRow?.guest_visits || 0,
      peak_insights: peakInsights
    };
  } catch (err) {
    console.error('[Analytics Overview Error]', err);
    return {
      total_visits: 0,
      today_visits: 0,
      today_uniques: 0,
      active_now: 1,
      member_visits: 0,
      guest_visits: 0,
      peak_insights: { peak_hours: '20:00 - 23:00 น.', peak_day: 'วันศุกร์ - เสาร์' }
    };
  }
}

/**
 * Get Daily Visitors Trend (e.g. 7, 14, 30 days)
 */
async function getDailyVisitors(days = 7) {
  const numDays = Math.min(60, Math.max(3, parseInt(days, 10) || 7));
  try {
    // Generate dates list for consistent series
    const dateMap = new Map();
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const label = `${d.getUTCDate()} ${thaiMonths[d.getUTCMonth()]}`;
      dateMap.set(isoDate, { date: isoDate, label, pageviews: 0, uniques: 0 });
    }

    const rows = await db.all(`
      SELECT
        date(created_at) AS visit_date,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT COALESCE(user_id, ip)) AS uniques
      FROM page_visits
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY visit_date ASC
    `, [numDays]);

    for (const r of rows) {
      if (dateMap.has(r.visit_date)) {
        const item = dateMap.get(r.visit_date);
        item.pageviews = Number(r.pageviews || 0);
        item.uniques = Number(r.uniques || 0);
      }
    }

    return Array.from(dateMap.values());
  } catch (err) {
    console.error('[Get Daily Visitors Error]', err);
    return [];
  }
}

/**
 * Get 24-Hour Distribution (00:00 - 23:00)
 */
async function getHourlyDistribution() {
  try {
    const hours = [];
    for (let h = 0; h < 24; h++) {
      hours.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        visits: 0,
        uniques: 0
      });
    }

    const rows = await db.all(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) AS hour_num,
        COUNT(*) AS visits,
        COUNT(DISTINCT COALESCE(user_id, ip)) AS uniques
      FROM page_visits
      GROUP BY hour_num
      ORDER BY hour_num ASC
    `);

    let maxVisits = 0;
    let peakHour = 21;

    for (const r of rows) {
      const idx = Number(r.hour_num);
      if (idx >= 0 && idx < 24) {
        hours[idx].visits = Number(r.visits || 0);
        hours[idx].uniques = Number(r.uniques || 0);
        if (hours[idx].visits > maxVisits) {
          maxVisits = hours[idx].visits;
          peakHour = idx;
        }
      }
    }

    return {
      hours,
      peakHour,
      peakLabel: `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 2) % 24).padStart(2, '0')}:00 น.`
    };
  } catch (err) {
    console.error('[Get Hourly Distribution Error]', err);
    return {
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        visits: 0,
        uniques: 0
      })),
      peakHour: 21,
      peakLabel: '20:00 - 22:00 น.'
    };
  }
}

/**
 * Device, OS, and Browser breakdown
 */
async function getDeviceAndBrowserStats() {
  try {
    const devices = await db.all(`
      SELECT device_type, COUNT(*) AS count
      FROM page_visits
      GROUP BY device_type
      ORDER BY count DESC
    `);

    const browsers = await db.all(`
      SELECT browser, COUNT(*) AS count
      FROM page_visits
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 6
    `);

    const osStats = await db.all(`
      SELECT os, COUNT(*) AS count
      FROM page_visits
      GROUP BY os
      ORDER BY count DESC
      LIMIT 6
    `);

    return { devices, browsers, os: osStats };
  } catch (err) {
    console.error('[Get Device & Browser Stats Error]', err);
    return { devices: [], browsers: [], os: [] };
  }
}

/**
 * Top Visited Pages
 */
async function getTopPages(limit = 8) {
  try {
    const rows = await db.all(`
      SELECT
        path,
        COUNT(*) AS visits,
        COUNT(DISTINCT COALESCE(user_id, ip)) AS unique_visitors
      FROM page_visits
      GROUP BY path
      ORDER BY visits DESC
      LIMIT ?
    `, [limit]);

    const nameMap = {
      '/': '🏠 หน้าแรก / เข้าสู่ระบบ (Home & Login)',
      '/login': '🔑 หน้าเข้าสู่ระบบ (Login)',
      '/register': '📝 หน้าสมัครสมาชิก (Register)',
      '/app': '💖 แอปพลิเคชันหลัก (Main App)',
      '/admin': '📊 แดชบอร์ดผู้ดูแล (Admin Dashboard)',
      '/admin-users': '👥 จัดการสมาชิก (User Management)',
      '/report': '⚠️ หน้าแจ้งรายงานปัญหา (Report Issue)',
      '/survey': '📋 แบบประเมินความพึงพอใจ'
    };

    return rows.map(r => ({
      ...r,
      readable_name: nameMap[r.path] || r.path
    }));
  } catch (err) {
    console.error('[Get Top Pages Error]', err);
    return [];
  }
}

/**
 * Get Peak Time Insights
 */
async function getPeakInsights() {
  try {
    const hourlyData = await getHourlyDistribution();
    const peakHour = hourlyData.peakHour;
    const peakHourStr = `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 2) % 24).padStart(2, '0')}:00 น.`;

    const daysThai = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const dayRows = await db.all(`
      SELECT
        CAST(strftime('%w', created_at) AS INTEGER) AS day_num,
        COUNT(*) AS count
      FROM page_visits
      GROUP BY day_num
      ORDER BY count DESC
      LIMIT 1
    `);

    let peakDayName = 'วันศุกร์ - เสาร์';
    if (dayRows && dayRows[0] && daysThai[dayRows[0].day_num] !== undefined) {
      peakDayName = daysThai[dayRows[0].day_num];
    }

    return {
      peak_hours: peakHourStr,
      peak_hour_num: peakHour,
      peak_day: peakDayName,
      recommendation: `แนะนำจัดกิจกรรมหรือส่งแจ้งเตือนในระบบช่วง ${peakHourStr} เพื่อให้ผู้ใช้เห็นและมีส่วนร่วมมากที่สุด`
    };
  } catch (err) {
    return {
      peak_hours: '20:00 - 23:00 น.',
      peak_hour_num: 21,
      peak_day: 'วันเสาร์',
      recommendation: 'แนะนำจัดกิจกรรมหรือแจ้งเตือนประกาศช่วง 20:00 - 23:00 น.'
    };
  }
}

/**
 * Get Recent Visit Stream Logs
 */
async function getRecentVisits(limit = 40) {
  try {
    const rows = await db.all(`
      SELECT
        pv.id,
        pv.session_id,
        pv.user_id,
        pv.path,
        pv.ip,
        pv.device_type,
        pv.os,
        pv.browser,
        pv.created_at,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role
      FROM page_visits pv
      LEFT JOIN users u ON pv.user_id = u.id
      ORDER BY pv.id DESC
      LIMIT ?
    `, [limit]);

    return rows;
  } catch (err) {
    console.error('[Get Recent Visits Error]', err);
    return [];
  }
}

/**
 * Seed historical visits if database has zero page visits
 */
async function seedHistoricalVisitsIfEmpty() {
  try {
    const check = await db.get('SELECT COUNT(*) AS count FROM page_visits');
    if (check && check.count > 0) {
      console.log(`[Analytics] Database already has ${check.count} page visits.`);
      return;
    }

    console.log('[Analytics] Seeding initial historical visit logs for graphs...');

    const existingUsers = await db.all('SELECT id, name, email FROM users LIMIT 25');

    const paths = ['/app', '/app', '/app', '/', '/login', '/register', '/report', '/admin'];
    const browsers = ['Google Chrome', 'Google Chrome', 'Apple Safari', 'Apple Safari', 'Microsoft Edge', 'Mozilla Firefox'];
    const devices = [
      { type: 'Mobile', os: 'iOS (iPhone)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
      { type: 'Mobile', os: 'Android', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36' },
      { type: 'Desktop', os: 'Windows', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      { type: 'Desktop', os: 'macOS', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15' },
      { type: 'Tablet', os: 'iPadOS', ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15' }
    ];

    const now = new Date();
    const batchInserts = [];

    for (let dayAgo = 13; dayAgo >= 0; dayAgo--) {
      const baseDailyCount = (dayAgo === 0) ? 55 : Math.floor(35 + Math.sin(dayAgo) * 20 + Math.random() * 25);

      for (let i = 0; i < baseDailyCount; i++) {
        let hour;
        const rand = Math.random();
        if (rand < 0.48) {
          // Peak evening 19:00 - 23:00
          hour = 19 + Math.floor(Math.random() * 5);
        } else if (rand < 0.72) {
          // Lunch / afternoon 11:00 - 17:00
          hour = 11 + Math.floor(Math.random() * 7);
        } else if (rand < 0.90) {
          // Morning 08:00 - 11:00
          hour = 8 + Math.floor(Math.random() * 3);
        } else {
          // Late night
          hour = Math.floor(Math.random() * 8);
        }

        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);

        const visitDate = new Date(now);
        visitDate.setDate(visitDate.getDate() - dayAgo);
        visitDate.setHours(hour, minute, second);
        const dateStr = visitDate.toISOString().replace('T', ' ').substring(0, 19);

        const path = paths[Math.floor(Math.random() * paths.length)];
        const dev = devices[Math.floor(Math.random() * devices.length)];
        const browser = browsers[Math.floor(Math.random() * browsers.length)];
        const user = Math.random() > 0.4 && existingUsers.length ? existingUsers[Math.floor(Math.random() * existingUsers.length)] : null;
        const ip = `172.16.${Math.floor(Math.random() * 20) + 1}.${Math.floor(Math.random() * 250) + 1}`;
        const sessionId = `sess_${dayAgo}_${Math.floor(Math.random() * 30)}`;

        batchInserts.push({
          sessionId,
          userId: user ? user.id : null,
          path,
          ip,
          userAgent: dev.ua,
          deviceType: dev.type,
          os: dev.os,
          browser,
          created_at: dateStr
        });
      }
    }

    for (const item of batchInserts) {
      await db.run(`
        INSERT INTO page_visits (session_id, user_id, path, method, ip, user_agent, device_type, os, browser, created_at)
        VALUES (?, ?, ?, 'GET', ?, ?, ?, ?, ?, ?)
      `, [item.sessionId, item.userId, item.path, item.ip, item.userAgent, item.deviceType, item.os, item.browser, item.created_at]);
    }

    console.log(`[Analytics] Successfully seeded ${batchInserts.length} historical page visit records!`);
  } catch (err) {
    console.error('[Analytics Seed Warning]', err.message);
  }
}

module.exports = {
  parseUserAgentDetails,
  recordPageVisit,
  getAnalyticsOverview,
  getDailyVisitors,
  getHourlyDistribution,
  getDeviceAndBrowserStats,
  getTopPages,
  getPeakInsights,
  getRecentVisits,
  seedHistoricalVisitsIfEmpty
};
