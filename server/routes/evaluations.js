'use strict';
// ============================================================
//  route/evaluations.js
//  POST /api/evaluations  — save a complete evaluation
//  GET  /api/evaluations  — list all (legacy history endpoint)
//  GET  /api/evaluations/:id — single evaluation detail
// ============================================================
const router = require('express').Router();
const pool   = require('../db');
const { sendSupervisorNotifyEmail, sendThankyouEmail } = require('../utils/emailService');

// ── helpers ──────────────────────────────────────────────────

function missingFields(body, fields) {
  return fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
}

async function computeScoreAndGrade(client, scoresInput, criteriaMap) {
  let totalRawScore      = 0;
  let totalPossibleWeight = 0;

  // Use ALL submitted criteria (with their submitted weights) so the score
  // is correct even for criteria codes not yet in the DB.
  for (const code of Object.keys(scoresInput)) {
    const entry  = scoresInput[code];
    const weight = parseFloat(entry.weight ?? criteriaMap[code]?.default_weight ?? 1);
    totalPossibleWeight += weight;
    if (entry.score != null) {
      totalRawScore += (parseFloat(entry.score) / 5) * weight;
    }
  }

  const totalScore = totalPossibleWeight > 0
    ? Math.round((totalRawScore / totalPossibleWeight) * 100 * 100) / 100
    : 0;

  // Round to 1dp for grade lookup — matches .toFixed(1) display precision
  const scoreFor1dp = Math.round(totalScore * 10) / 10;
  const gradeRow = await client.query(
    'SELECT grade FROM grade_thresholds WHERE $1 >= min_score AND $1 <= max_score LIMIT 1',
    [scoreFor1dp]
  );
  const grade = gradeRow.rows[0]?.grade ?? 'D';

  return { totalScore, grade };
}

// ── POST /api/evaluations ─────────────────────────────────────
// Body:
// {
//   employeeId: "EMP-001",
//   vendorCode: "SUP-001",
//   evalType:   "new_supplier" | "re_evaluation",
//   period:     "Annual / รายปี",
//   productType:"goods" | "services" | "both",
//   scores: {
//     "1.1": { score: 4, weight: 14, note: "..." },
//     ...
//   }
// }
router.post('/', async (req, res) => {
  const { employeeId, vendorCode, evalType, period, productType, scores, sessionId: taskSessionId } = req.body;

  const missing = missingFields(req.body, ['employeeId', 'vendorCode', 'evalType', 'period', 'productType', 'scores']);
  if (missing.length > 0) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน', missing });
  }
  if (typeof scores !== 'object' || Object.keys(scores).length === 0) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลคะแนน', field: 'scores' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate employee
    const empResult = await client.query(
      `SELECT id, role FROM employees WHERE employee_id = $1 AND is_active = TRUE`,
      [employeeId]
    );
    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[evaluations] ไม่พบรหัสพนักงาน: ${employeeId}`);
      return res.status(400).json({ message: 'ไม่พบรหัสพนักงาน', field: 'employeeId' });
    }
    const employee = empResult.rows[0];

    // 2. Validate supplier
    const supResult = await client.query(
      `SELECT id FROM suppliers WHERE vendor_code = $1 AND is_active = TRUE`,
      [vendorCode]
    );
    if (supResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[evaluations] ไม่พบ vendor code: ${vendorCode}`);
      return res.status(400).json({ message: 'ไม่พบรหัสซัพพลายเออร์', field: 'vendorCode' });
    }
    const supplier = supResult.rows[0];

    // 3. BU permission check — disabled for now (all users can evaluate any supplier)

    // USER, GCP, ADMIN are all valid roles for evaluation submissions
    const evalRole = ['USER', 'GCP', 'ADMIN'].includes(employee.role) ? employee.role : 'USER';

    let sessionId;

    // 4a. If submitted from an assigned task, attach to that exact session
    // instead of fuzzy-matching by (supplier, period, evalType) — the task
    // system uses eval_type values (pre_eval/half_year/yearly) the legacy
    // manual-entry flow below doesn't produce, so they'd never match.
    if (taskSessionId) {
      const taskSessionResult = await client.query(
        `SELECT id FROM evaluation_sessions
          WHERE id = $1 AND supplier_id = $2 AND status IN ('pending', 'in_progress', 'returned')`,
        [taskSessionId, supplier.id]
      );
      if (taskSessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'ไม่พบงานประเมินนี้ หรืองานถูกดำเนินการไปแล้ว', field: 'sessionId' });
      }
      sessionId = taskSessionResult.rows[0].id;

      const dupResult = await client.query(
        `SELECT id FROM evaluations WHERE session_id = $1 AND role = $2`,
        [sessionId, evalRole]
      );
      if (dupResult.rows.length > 0) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] ${employeeId} (${evalRole}) ส่งผลซ้ำ session ${sessionId}`);
        return res.status(409).json({ message: 'คุณได้ส่งผลการประเมินสำหรับรายการนี้แล้ว' });
      }
    } else {
      // 4b. Legacy manual-entry flow — validate eval_type, find or create session
      const validEvalTypes = ['new_supplier', 'post_eval', 'pre_eval', 'half_year', 'yearly'];
      if (!validEvalTypes.includes(evalType)) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] evalType ไม่ถูกต้อง: "${evalType}" (รับได้: ${validEvalTypes.join(', ')})`);
        return res.status(400).json({ message: 'ประเภทการประเมินไม่ถูกต้อง', field: 'evalType' });
      }

      const sessionResult = await client.query(
        `SELECT id FROM evaluation_sessions
          WHERE supplier_id = $1
            AND period      = $2
            AND eval_type   = $3
            AND status IN ('pending', 'in_progress', 'returned')
          ORDER BY created_at DESC
          LIMIT 1`,
        [supplier.id, period, evalType]
      );

      if (sessionResult.rows.length > 0) {
        sessionId = sessionResult.rows[0].id;

        const dupResult = await client.query(
          `SELECT id FROM evaluations WHERE session_id = $1 AND role = $2`,
          [sessionId, evalRole]
        );
        if (dupResult.rows.length > 0) {
          await client.query('ROLLBACK');
          console.warn(`[evaluations] ${employeeId} (${evalRole}) ส่งผลซ้ำ session ${sessionId}`);
          return res.status(409).json({ message: 'คุณได้ส่งผลการประเมินสำหรับรายการนี้แล้ว' });
        }
      } else {
        const newSession = await client.query(
          `INSERT INTO evaluation_sessions (supplier_id, eval_type, period, initiated_by)
            VALUES ($1, $2, $3, $4) RETURNING id`,
          [supplier.id, evalType, period, employee.id]
        );
        sessionId = newSession.rows[0].id;
      }
    }

    // 6. Load criteria to resolve codes → UUIDs + default weights
    const codes = Object.keys(scores);
    const criteriaResult = await client.query(
      `SELECT id, code, default_weight
         FROM evaluation_criteria
        WHERE code = ANY($1) AND is_active = TRUE`,
      [codes]
    );
    const criteriaMap = {};
    criteriaResult.rows.forEach(c => { criteriaMap[c.code] = c; });

    // Log unknown codes but do not reject (criteria table may be incomplete)
    const unknownCodes = codes.filter(c => !criteriaMap[c]);
    if (unknownCodes.length > 0) {
      console.warn(`[evaluations] รหัสเกณฑ์ไม่มีในตาราง (ข้ามการเก็บ): ${unknownCodes.join(', ')}`);
    }

    // 7. Compute total score and grade on the server (ignore frontend values)
    const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

    // 8. Mark evaluation_task as completed if task-based assignment exists
    const completedTask = await client.query(`
      UPDATE evaluation_tasks
         SET status = 'completed'
       WHERE session_id = $1
         AND (assigned_employee_id = $2
              OR assigned_email = (SELECT email FROM employees WHERE id = $2 LIMIT 1))
         AND status != 'completed'
       RETURNING id, assigned_email, assigned_name, due_date, thankyou_sent_at
    `, [sessionId, employee.id]).catch(() => ({ rows: [] }));

    // 9. Insert evaluation record (raw_scores stores every criterion submitted)
    const evalResult = await client.query(
      `INSERT INTO evaluations
         (session_id, employee_id, role, product_type, status, total_score, grade, submitted_at, raw_scores)
       VALUES ($1, $2, $3, $4, 'saved', $5, $6, NOW(), $7)
       RETURNING id`,
      [sessionId, employee.id, evalRole, productType, totalScore, grade, JSON.stringify(scores)]
    );
    const evaluationId = evalResult.rows[0].id;

    // 9. Insert evaluation_scores (only for criteria that exist in DB)
    for (const code of codes) {
      const criterion = criteriaMap[code];
      if (!criterion) continue; // skip codes not in criteria table
      const entry  = scores[code];
      const weight = parseFloat(entry.weight ?? criterion.default_weight);
      const score  = entry.score != null ? parseInt(entry.score, 10) : null;
      const note   = entry.note ?? '';

      await client.query(
        `INSERT INTO evaluation_scores (evaluation_id, criterion_id, weight, score, note)
          VALUES ($1, $2, $3, $4, $5)`,
        [evaluationId, criterion.id, weight, score, note]
      );
    }

    await client.query('COMMIT');

    // Send thank-you immediately (cron also catches any missed ones daily,
    // but evaluators shouldn't wait until next morning to hear back)
    const task = completedTask.rows[0];
    if (task && !task.thankyou_sent_at) {
      pool.query(
        `SELECT supplier_name, vendor_code FROM suppliers s
           JOIN evaluation_sessions es ON es.supplier_id = s.id WHERE es.id = $1`,
        [sessionId]
      ).then(async supRes => {
        if (supRes.rows.length === 0) return;
        await sendThankyouEmail(task, supRes.rows[0]);
        await pool.query(`UPDATE evaluation_tasks SET thankyou_sent_at = NOW() WHERE id = $1`, [task.id]);
      }).catch(e => console.warn('[evaluations] thankyou email error:', e.message));
    }

    // After commit: check if both BU+GCP have submitted for this session
    // If yes → create supervisor_review and notify supervisors (fire-and-forget)
    pool.query(
      `SELECT COUNT(*) AS cnt FROM evaluations WHERE session_id = $1 AND status = 'saved'`,
      [sessionId]
    ).then(async r => {
      if (parseInt(r.rows[0].cnt, 10) < 2) return;

      // Both submitted — create supervisor review record
      const reviewDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await pool.query(`
        INSERT INTO supervisor_reviews (session_id, review_due)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [sessionId, reviewDue]);

      // Fetch session + supplier for email
      const sessionInfo = await pool.query(`
        SELECT es.eval_type, es.final_score, s.supplier_name, s.vendor_code
          FROM evaluation_sessions es
          JOIN suppliers s ON s.id = es.supplier_id
         WHERE es.id = $1
      `, [sessionId]);

      if (sessionInfo.rows.length === 0) return;
      const sess = sessionInfo.rows[0];

      // Notify all active supervisors
      const supervisors = await pool.query(`
        SELECT email, full_name FROM employees
         WHERE role = 'SUPERVISOR' AND is_active = TRUE AND email IS NOT NULL
      `);
      for (const sup of supervisors.rows) {
        sendSupervisorNotifyEmail(sup.email, sup.full_name, sess, reviewDue)
          .catch(e => console.warn('[evaluations] supervisor notify error:', e.message));
      }
    }).catch(e => console.warn('[evaluations] post-commit supervisor check error:', e.message));

    res.status(201).json({
      message: 'บันทึกสำเร็จ',
      data: { evaluationId, sessionId, totalScore, grade },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/evaluations error:', err);
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/evaluations ──────────────────────────────────────
// Returns all sessions with summary (replaces old flat list)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         es.id            AS "sessionId",
         s.vendor_code    AS "vendorCode",
         s.supplier_name  AS "supplierName",
         es.eval_type     AS "evalType",
         es.period,
         es.status,
         es.final_score   AS "finalScore",
         es.final_grade   AS "finalGrade",
         es.created_at    AS "createdAt",
         es.completed_at  AS "completedAt"
       FROM evaluation_sessions es
       JOIN suppliers s ON s.id = es.supplier_id
       ORDER BY es.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/evaluations error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/evaluations/all  (ADMIN only) ───────────────────
// Returns every evaluation in the system with evaluator info
router.get('/all', async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  }
  try {
    const result = await pool.query(
      `SELECT
         ev.id              AS "evalId",
         s.vendor_code      AS "vendorCode",
         s.supplier_name    AS "supplierName",
         es.eval_type       AS "evalType",
         es.period,
         ev.product_type    AS "productType",
         ev.total_score     AS "totalScore",
         ev.grade,
         ev.submitted_at    AS "submittedAt",
         ev.role,
         es.status          AS "sessionStatus",
         es.final_score     AS "finalScore",
         es.final_grade     AS "finalGrade",
         emp.full_name      AS "evaluatorName",
         emp.employee_id    AS "evaluatorId"
       FROM evaluations ev
       JOIN evaluation_sessions es  ON es.id  = ev.session_id
       JOIN suppliers           s   ON s.id   = es.supplier_id
       JOIN employees           emp ON emp.id = ev.employee_id
       ORDER BY ev.submitted_at DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/evaluations/all error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/evaluations/my ───────────────────────────────────
// Returns all evaluations submitted by the current user
router.get('/my', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ev.id              AS "evalId",
         s.vendor_code      AS "vendorCode",
         s.supplier_name    AS "supplierName",
         es.eval_type       AS "evalType",
         es.period,
         ev.product_type    AS "productType",
         ev.total_score     AS "totalScore",
         ev.grade,
         ev.submitted_at    AS "submittedAt",
         es.status          AS "sessionStatus",
         es.final_score     AS "finalScore",
         es.final_grade     AS "finalGrade"
       FROM evaluations ev
       JOIN evaluation_sessions es ON es.id = ev.session_id
       JOIN suppliers           s  ON s.id  = es.supplier_id
       JOIN employees           emp ON emp.id = ev.employee_id
       WHERE emp.employee_id = $1
       ORDER BY ev.submitted_at DESC
       LIMIT 100`,
      [req.user.empId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/evaluations/my error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/evaluations/my-tasks ─────────────────────────────
// Returns pending/overdue evaluation tasks assigned to the current user
// (by email), so GCP/USER can see which suppliers they must evaluate
// instead of typing a vendor code blind.
router.get('/my-tasks', async (req, res) => {
  if (!req.user.email) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT
        et.id              AS "taskId",
        et.role,
        et.due_date        AS "dueDate",
        et.status,
        es.id               AS "sessionId",
        es.eval_type        AS "evalType",
        es.period,
        es.status           AS "sessionStatus",
        s.vendor_code       AS "vendorCode",
        s.supplier_name     AS "supplierName",
        s.product_type      AS "productType",
        sr.notes            AS "supervisorNotes"
      FROM evaluation_tasks et
      JOIN evaluation_sessions es ON es.id = et.session_id
      JOIN suppliers s             ON s.id = et.supplier_id
      LEFT JOIN supervisor_reviews sr ON sr.session_id = es.id AND sr.status = 'returned'
      WHERE et.assigned_email = $1
        AND et.status != 'completed'
        AND es.status IN ('pending', 'in_progress', 'returned')
      ORDER BY et.due_date ASC
    `, [req.user.email]);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/evaluations/my-tasks error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/evaluations/:id ─────────────────────────────────
// Returns a single evaluation with all its scores
router.get('/:id', async (req, res) => {
  try {
    const evalResult = await pool.query(
      `SELECT
         ev.id,
         ev.role,
         ev.status,
         ev.total_score   AS "totalScore",
         ev.grade,
         ev.submitted_at  AS "submittedAt",
         ev.created_at    AS "createdAt",
         emp.employee_id  AS "employeeId",
         emp.full_name    AS "fullName",
         d.name_th        AS "department",
         j.name_th        AS "jobTitle",
         s.vendor_code    AS "vendorCode",
         sup.supplier_name AS "supplierName",
         es.eval_type     AS "evalType",
         es.period,
         ev.product_type  AS "productType",
         es.status        AS "sessionStatus",
         es.final_score   AS "finalScore",
         es.final_grade   AS "finalGrade",
         ev.raw_scores    AS "rawScores"
       FROM evaluations ev
       JOIN employees          emp ON emp.id = ev.employee_id
       LEFT JOIN departments   d   ON d.id   = emp.department_id
       LEFT JOIN job_titles    j   ON j.id   = emp.job_title_id
       JOIN evaluation_sessions es  ON es.id  = ev.session_id
       JOIN suppliers          sup ON sup.id  = es.supplier_id
       LEFT JOIN suppliers     s   ON s.id    = es.supplier_id
       WHERE ev.id = $1`,
      [req.params.id]
    );

    if (evalResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    }
    const evaluation = evalResult.rows[0];

    // Fetch scores
    const scoresResult = await pool.query(
      `SELECT
         ec.code,
         ec.name_th       AS "nameTh",
         cat.name_th      AS "categoryNameTh",
         evs.weight,
         evs.score,
         evs.note,
         evs.weighted_score AS "weightedScore"
       FROM evaluation_scores evs
       JOIN evaluation_criteria  ec  ON ec.id  = evs.criterion_id
       JOIN evaluation_categories cat ON cat.id = ec.category_id
       WHERE evs.evaluation_id = $1
       ORDER BY ec.display_order`,
      [req.params.id]
    );

    res.json({ ...evaluation, scores: scoresResult.rows });
  } catch (err) {
    console.error('GET /api/evaluations/:id error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
