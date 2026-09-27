const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { PRIVACY_VERSION, getPreferences, parseChoices, savePreferences } = require('../services/privacy');

router.get('/api/privacy/preferences', async (req,res,next) => {
  try {
    const preferences = await getPreferences(req.session?.user?.id);
    if (!req.session?.user) Object.assign(preferences, req.session?.privacy || {});
    res.set('Cache-Control','no-store').json({ ...preferences, loggedIn: Boolean(req.session?.user), chosen: Boolean(req.session?.privacy) || preferences.acknowledged });
  } catch (err) { next(err); }
});
router.post('/api/privacy/preferences', async (req,res,next) => {
  try {
    if (req.body.version !== PRIVACY_VERSION || req.body.acknowledged !== true) return res.status(400).json({message:'โปรดอ่านประกาศฉบับปัจจุบันก่อนบันทึก'});
    const choices = parseChoices(req.body);
    if (req.session?.user) {
      await savePreferences(req.session.user.id,choices,'settings');
      // Withdrawal stops future processing and removes the stored matching preference.
      if (!choices.matching) {
        await db.run("UPDATE users SET interested_gender = 'ทุกเพศ' WHERE id = ?", [req.session.user.id]);
        req.session.user.interested_gender = 'ทุกเพศ';
      }
      req.session.user.matching_consent = choices.matching;
    }
    req.session.privacy = {...choices,acknowledged:true};
    req.session.save(err => err ? next(err) : res.json({message:'บันทึกการเลือกแล้ว คุณเปลี่ยนหรือถอนความยินยอมได้ทุกเมื่อ'}));
  } catch (err) { next(err); }
});
router.get('/api/privacy/requests', requireAuth, async (req,res,next) => {
  try {
    const rows = await db.all("SELECT id,report_type,description,status,admin_note,created_at FROM reports WHERE reporter_email = ? AND report_type LIKE 'privacy:%' ORDER BY id DESC", [req.session.user.email]);
    res.json(rows);
  } catch(err) { next(err); }
});
router.post('/api/privacy/requests', requireAuth, async (req,res,next) => {
  try {
    const {type,description} = req.body;
    if (!['access','correct','delete','restrict','object','portability','withdraw'].includes(type) || typeof description !== 'string' || !description.trim() || description.length > 3000) return res.status(400).json({message:'เลือกประเภทคำขอและระบุรายละเอียดไม่เกิน 3,000 ตัวอักษร'});
    const existing = await db.get("SELECT id FROM reports WHERE reporter_email=? AND report_type=? AND status='pending'",[req.session.user.email,'privacy:'+type]);
    if (existing) return res.status(409).json({message:'มีคำขอประเภทนี้รอตรวจสอบอยู่แล้ว',id:existing.id});
    const result = await db.run("INSERT INTO reports (reporter_name,reporter_email,reported_user,report_type,description,status) VALUES (?,?,?,?,?,'pending')",[req.session.user.name,req.session.user.email,String(req.session.user.id),'privacy:'+type,description.trim()]);
    res.status(201).json({message:'ส่งคำขอให้ผู้ดูแลแล้ว ติดตามสถานะได้ด้านล่าง',id:Number(result.lastInsertRowid)});
  } catch(err) { next(err); }
});
module.exports = router;
