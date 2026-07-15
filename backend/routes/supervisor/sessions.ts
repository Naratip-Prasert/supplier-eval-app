'use strict';
// ============================================================
//  routes/supervisor/sessions.ts
//  ทั้งสอง route นี้เผยผลคะแนน/session ของ "ทุก" supplier ในระบบ — เดิมพึ่ง
//  แค่ว่าหน้า UI (AdminPage/SupervisorPage) ไม่โชว์เมนูนี้ให้ role อื่นเห็น
//  แต่ backend เองไม่เคยเช็ค role เลย ใครก็ตามที่มี JWT ที่ login แล้ว (role
//  อะไรก็ได้) เรียก API ตรงๆ ก็ดึงข้อมูลทุก supplier ได้หมด — ต่างจาก
//  /api/evaluations/:id และ /by-vendor ที่ตั้งใจเปิดให้ทุก role ดูได้
//  (พนักงานประเมิน supplier ไหนก็ได้อยู่แล้วตามดีไซน์เดิมของแอป)
// ============================================================
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const { listSessions, getSession } = require('../../controllers/supervisor/sessions.controller');

router.use(requireRole('ADMIN', 'SUPERVISOR'));

router.get('/', listSessions);
router.get('/:id', getSession);

module.exports = router;
