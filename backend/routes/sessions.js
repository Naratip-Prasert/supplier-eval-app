'use strict';
// ============================================================
//  route/sessions.js
//  GET /api/sessions      — evaluation history list (req 6)
//  GET /api/sessions/:id  — session detail with both evaluations
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

// ทั้งสอง route นี้เผยผลคะแนน/session ของ "ทุก" supplier ในระบบ — เดิมพึ่ง
// แค่ว่าหน้า UI (AdminPage/SupervisorPage) ไม่โชว์เมนูนี้ให้ role อื่นเห็น
// แต่ backend เองไม่เคยเช็ค role เลย ใครก็ตามที่มี JWT ที่ login แล้ว (role
// อะไรก็ได้) เรียก API ตรงๆ ก็ดึงข้อมูลทุก supplier ได้หมด — ต่างจาก
// /api/evaluations/:id และ /by-vendor ที่ตั้งใจเปิดให้ทุก role ดูได้
// (พนักงานประเมิน supplier ไหนก็ได้อยู่แล้วตามดีไซน์เดิมของแอป)
router.use((req, res, next) => {
  if (!['ADMIN', 'SUPERVISOR'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'สิทธิ์ไม่เพียงพอ (ต้องการ ADMIN หรือ SUPERVISOR)' });
  }
  next();
});

// GET /api/sessions
// Full evaluation history — each session row includes summary
// for both USER and GCP evaluations (req 6).
// Optional query params:
//   ?vendorCode=SUP-001  — filter by supplier
//   ?status=completed    — filter by status
router.get('/', async (req, res) => {
  const { vendorCode, status } = req.query;

  try {
    const sessionsResult = await pool.query(
      `SELECT
         es.id              AS "sessionId",
         s.vendor_code      AS "vendorCode",
         s.supplier_name    AS "supplierName",
         s.product_type     AS "productType",
         es.eval_type       AS "evalType",
         es.period,
         es.status,
         es.final_score     AS "finalScore",
         es.final_grade     AS "finalGrade",
         es.created_at      AS "createdAt",
         es.completed_at    AS "completedAt",
         initiator.employee_id AS "initiatedBy",
         COALESCE(
           (SELECT sr.review_due FROM supervisor_reviews sr WHERE sr.session_id = es.id ORDER BY sr.created_at DESC LIMIT 1),
           (SELECT MAX(et.due_date) FROM evaluation_tasks et WHERE et.session_id = es.id)
         ) AS "dueDate"
       FROM evaluation_sessions es
       JOIN suppliers s ON s.id = es.supplier_id
       LEFT JOIN employees initiator ON initiator.id = es.initiated_by
       WHERE ($1::text IS NULL OR s.vendor_code = $1)
         AND ($2::text IS NULL OR es.status = $2)
       ORDER BY es.created_at DESC`,
      [vendorCode ? vendorCode.trim() : null, status ? status.trim() : null]
    );

    if (sessionsResult.rows.length === 0) {
      return res.json([]);
    }

    const sessionIds = sessionsResult.rows.map(r => r.sessionId);

    // Fetch evaluations summary for all sessions in one query
    const evalsResult = await pool.query(
      `SELECT
         ev.session_id    AS "sessionId",
         ev.role,
         ev.total_score   AS "totalScore",
         ev.grade,
         ev.status,
         ev.submitted_at  AS "submittedAt",
         emp.employee_id  AS "employeeId",
         emp.full_name    AS "fullName",
         emp.profile_picture AS "profilePicture"
       FROM evaluations ev
       JOIN employees emp ON emp.id = ev.employee_id
       WHERE ev.session_id = ANY($1)`,
      [sessionIds]
    );

    // Group evaluations by sessionId
    const evalsBySession = {};
    evalsResult.rows.forEach(ev => {
      if (!evalsBySession[ev.sessionId]) evalsBySession[ev.sessionId] = [];
      evalsBySession[ev.sessionId].push(ev);
    });

    const response = sessionsResult.rows.map(session => ({
      ...session,
      evaluations: evalsBySession[session.sessionId] ?? [],
    }));

    res.json(response);
  } catch (err) {
    console.error('GET /api/sessions error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// GET /api/sessions/:id
// Returns a single session with full detail: both evaluations + all their scores.
router.get('/:id', async (req, res) => {
  try {
    const sessionResult = await pool.query(
      `SELECT
         es.id              AS "sessionId",
         s.vendor_code      AS "vendorCode",
         s.supplier_name    AS "supplierName",
         s.product_type     AS "productType",
         es.eval_type       AS "evalType",
         es.period,
         es.status,
         es.final_score     AS "finalScore",
         es.final_grade     AS "finalGrade",
         es.created_at      AS "createdAt",
         es.completed_at    AS "completedAt",
         COALESCE(
           (SELECT sr.review_due FROM supervisor_reviews sr WHERE sr.session_id = es.id ORDER BY sr.created_at DESC LIMIT 1),
           (SELECT MAX(et.due_date) FROM evaluation_tasks et WHERE et.session_id = es.id)
         ) AS "dueDate"
       FROM evaluation_sessions es
       JOIN suppliers s ON s.id = es.supplier_id
       WHERE es.id = $1`,
      [req.params.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูล Session' });
    }
    const session = sessionResult.rows[0];

    // Fetch evaluations
    const evalsResult = await pool.query(
      `SELECT
         ev.id,
         ev.role,
         ev.total_score  AS "totalScore",
         ev.grade,
         ev.status,
         ev.submitted_at AS "submittedAt",
         emp.employee_id AS "employeeId",
         emp.full_name   AS "fullName",
         emp.profile_picture AS "profilePicture",
         d.name_th       AS "department",
         j.name_th       AS "jobTitle"
       FROM evaluations ev
       JOIN employees        emp ON emp.id = ev.employee_id
       LEFT JOIN departments d   ON d.id   = emp.department_id
       LEFT JOIN job_titles  j   ON j.id   = emp.job_title_id
       WHERE ev.session_id = $1
       ORDER BY ev.role`,
      [session.sessionId]
    );

    const evalIds = evalsResult.rows.map(e => e.id);

    // Fetch all scores for these evaluations
    const scoresResult = await pool.query(
      `SELECT
         evs.evaluation_id    AS "evaluationId",
         ec.code,
         cat.name_th          AS "categoryNameTh",
         ec.name_th           AS "nameTh",
         evs.weight,
         evs.score,
         evs.note,
         evs.weighted_score   AS "weightedScore"
       FROM evaluation_scores evs
       JOIN evaluation_sub_criteria   ec  ON ec.id  = evs.criterion_id
       JOIN evaluation_main_criteria cat ON cat.id = ec.category_id
       WHERE evs.evaluation_id = ANY($1)
       ORDER BY evs.evaluation_id, ec.display_order`,
      [evalIds]
    );

    // Group scores by evaluationId
    const scoresByEval = {};
    scoresResult.rows.forEach(s => {
      if (!scoresByEval[s.evaluationId]) scoresByEval[s.evaluationId] = [];
      scoresByEval[s.evaluationId].push(s);
    });

    const evaluations = evalsResult.rows.map(ev => ({
      ...ev,
      scores: scoresByEval[ev.id] ?? [],
    }));

    res.json({ ...session, evaluations });
  } catch (err) {
    console.error('GET /api/sessions/:id error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
