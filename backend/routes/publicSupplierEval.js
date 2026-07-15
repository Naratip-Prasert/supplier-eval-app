'use strict';
// ============================================================
//  routes/publicSupplierEval.js
//  Cross-evaluation #3 (database/CROSS_EVALUATION_SPEC.md):
//  Supplier rates the User/Buyer who evaluated them, via a
//  one-time emailed magic-link — NOT mounted behind requireAuth
//  in server.js, since suppliers have no login in this system.
//
//  GET  /api/public/supplier-eval/:token   — load who/what to rate
//  POST /api/public/supplier-eval/:token   — submit ratings
// ============================================================
const router = require('express').Router();
const pool   = require('../db');
const { rateLimit } = require('express-rate-limit');
const { computeScoreAndGrade } = require('./evaluations');

// Public + unauthenticated — cap attempts per IP the same way /login does,
// so the (unguessable, but still worth bounding) token isn't brute-forceable
// and a single IP can't spam submissions.
const publicEvalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});
router.use(publicEvalLimiter);

async function loadToken(token) {
  const result = await pool.query(
    `SELECT t.id, t.session_id AS "sessionId", t.supplier_id AS "supplierId",
            t.expires_at AS "expiresAt", t.used_at AS "usedAt",
            s.supplier_name AS "supplierName"
       FROM supplier_eval_tokens t
       JOIN suppliers s ON s.id = t.supplier_id
      WHERE t.token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

// ── GET /:token — who to rate + criteria to rate them on ──────
router.get('/:token', async (req, res) => {
  try {
    const row = await loadToken(req.params.token);
    if (!row) return res.status(404).json({ message: 'ไม่พบลิงก์นี้' });
    if (row.usedAt) return res.status(410).json({ message: 'ลิงก์นี้ถูกใช้ไปแล้ว' });
    if (new Date(row.expiresAt) < new Date()) return res.status(410).json({ message: 'ลิงก์นี้หมดอายุแล้ว' });

    // Independent queries, no shared client/transaction — run concurrently
    // instead of paying two sequential round trips.
    const [targetsResult, criteriaResult] = await Promise.all([
      pool.query(
        `SELECT ev.role, e.id AS "employeeId", e.full_name AS "fullName"
           FROM evaluations ev
           JOIN employees e ON e.id = ev.employee_id
          WHERE ev.session_id = $1 AND ev.role IN ('USER', 'GCP') AND ev.status = 'saved'`,
        [row.sessionId]
      ),
      pool.query(
        `SELECT m.id AS "categoryId", m.name_th AS "categoryNameTh", m.display_order AS "categoryOrder",
                s.id, s.code, s.name_th AS "nameTh", s.default_weight AS "defaultWeight",
                s.display_order AS "displayOrder", s.level_values AS "levelValues"
           FROM evaluation_sub_criteria s
           JOIN evaluation_main_criteria m ON m.id = s.category_id
          WHERE s.criteria_set = 'service' AND s.is_active = TRUE AND m.is_active = TRUE
          ORDER BY m.display_order, s.display_order`
      ),
    ]);

    res.json({
      supplierName: row.supplierName,
      targets: targetsResult.rows,
      criteria: criteriaResult.rows,
    });
  } catch (err) {
    console.error('GET /api/public/supplier-eval/:token error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
});

// ── POST /:token — submit ratings for one or both targets ─────
// Body: { ratings: [ { targetEmployeeId, role: 'USER'|'GCP', scores: { code: { score, weight? } } } ] }
router.post('/:token', async (req, res) => {
  const { ratings } = req.body;
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลคะแนน' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE locks the token row for the rest of this transaction — a
    // concurrent POST for the same token (double-click, retry) blocks here
    // until this transaction commits or rolls back, then sees used_at
    // already set and bails out below instead of racing past the check.
    const tokenResult = await client.query(
      `SELECT t.id, t.session_id AS "sessionId", t.supplier_id AS "supplierId",
              t.expires_at AS "expiresAt", t.used_at AS "usedAt",
              s.supplier_name AS "supplierName"
         FROM supplier_eval_tokens t
         JOIN suppliers s ON s.id = t.supplier_id
        WHERE t.token = $1
        FOR UPDATE OF t`,
      [req.params.token]
    );
    const row = tokenResult.rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'ไม่พบลิงก์นี้' }); }
    if (row.usedAt) { await client.query('ROLLBACK'); return res.status(410).json({ message: 'ลิงก์นี้ถูกใช้ไปแล้ว' }); }
    if (new Date(row.expiresAt) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ message: 'ลิงก์นี้หมดอายุแล้ว' }); }

    // Claim the token now, before inserting anything — closes the window a
    // concurrent request could otherwise slip through.
    await client.query(`UPDATE supplier_eval_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

    const criteriaResult = await client.query(
      `SELECT code, default_weight FROM evaluation_sub_criteria
        WHERE criteria_set = 'service' AND is_active = TRUE`
    );
    const criteriaMap = {};
    criteriaResult.rows.forEach(c => { criteriaMap[c.code] = { default_weight: c.default_weight }; });

    for (const rating of ratings) {
      const { targetEmployeeId, role, scores } = rating;
      if (!targetEmployeeId || !['USER', 'GCP'].includes(role) || typeof scores !== 'object') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'ข้อมูล rating ไม่ถูกต้อง' });
      }

      const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

      const direction = role === 'USER' ? 'supplier_to_user' : 'supplier_to_gcp';
      const insertRes = await client.query(
        `INSERT INTO service_evaluations
           (session_id, direction, evaluator_supplier_id, target_employee_id, total_score, grade, raw_scores)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (session_id, direction, target_employee_id) DO NOTHING
         RETURNING id`,
        [row.sessionId, direction, row.supplierId, targetEmployeeId, totalScore, grade, JSON.stringify(scores)]
      );
      if (insertRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'ให้คะแนนรายการนี้ไปแล้ว' });
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'ขอบคุณสำหรับความคิดเห็น' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/public/supplier-eval/:token error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
