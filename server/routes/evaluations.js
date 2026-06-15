'use strict';
// ============================================================
//  route/evaluations.js
//  POST /api/evaluations  — save a complete evaluation
//  GET  /api/evaluations  — list all (legacy history endpoint)
//  GET  /api/evaluations/:id — single evaluation detail
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

// ── helpers ──────────────────────────────────────────────────

function missingFields(body, fields) {
  return fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
}

async function computeScoreAndGrade(client, scoresInput, criteriaMap) {
  let totalRawScore      = 0;
  let totalPossibleWeight = 0;

  for (const code of Object.keys(scoresInput)) {
    const criterion = criteriaMap[code];
    if (!criterion) continue;
    const entry  = scoresInput[code];
    const weight = parseFloat(entry.weight ?? criterion.default_weight);
    totalPossibleWeight += weight;
    if (entry.score != null) {
      totalRawScore += (parseFloat(entry.score) / 5) * weight;
    }
  }

  const totalScore = totalPossibleWeight > 0
    ? Math.round((totalRawScore / totalPossibleWeight) * 100 * 100) / 100
    : 0;

  const gradeRow = await client.query(
    'SELECT grade FROM grade_thresholds WHERE $1 >= min_score AND $1 <= max_score LIMIT 1',
    [totalScore]
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
  const { employeeId, vendorCode, evalType, period, productType, scores } = req.body;

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

    // 3. BU permission check
    if (employee.role === 'BU') {
      const permResult = await client.query(
        `SELECT 1 FROM employee_supplier_permissions
          WHERE employee_id = $1 AND supplier_id = $2`,
        [employee.id, supplier.id]
      );
      if (permResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] BU ${employeeId} ไม่มีสิทธิ์ประเมิน vendor ${vendorCode}`);
        return res.status(403).json({ message: 'ไม่มีสิทธิ์ประเมินซัพพลายเออร์นี้' });
      }
    }

    // 4. Validate eval_type
    const validEvalTypes = ['new_supplier', 'post_eval'];
    if (!validEvalTypes.includes(evalType)) {
      await client.query('ROLLBACK');
      console.warn(`[evaluations] evalType ไม่ถูกต้อง: "${evalType}" (รับได้: ${validEvalTypes.join(', ')})`);
      return res.status(400).json({ message: 'ประเภทการประเมินไม่ถูกต้อง', field: 'evalType' });
    }

    // 5. Find or create session for (supplier, period, evalType)
    const sessionResult = await client.query(
      `SELECT id FROM evaluation_sessions
        WHERE supplier_id = $1
          AND period      = $2
          AND eval_type   = $3
          AND status IN ('pending', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1`,
      [supplier.id, period, evalType]
    );

    let sessionId;
    if (sessionResult.rows.length > 0) {
      sessionId = sessionResult.rows[0].id;

      // Ensure this role hasn't already submitted for this session
      const dupResult = await client.query(
        `SELECT id FROM evaluations WHERE session_id = $1 AND role = $2`,
        [sessionId, employee.role]
      );
      if (dupResult.rows.length > 0) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] ${employeeId} (${employee.role}) ส่งผลซ้ำ session ${sessionId}`);
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

    // Reject if any submitted code is unknown
    const unknownCodes = codes.filter(c => !criteriaMap[c]);
    if (unknownCodes.length > 0) {
      await client.query('ROLLBACK');
      console.warn(`[evaluations] พบรหัสเกณฑ์ที่ไม่มีในระบบ: ${unknownCodes.join(', ')}`);
      return res.status(400).json({ message: 'พบรหัสเกณฑ์ที่ไม่ถูกต้อง', unknownCodes });
    }

    // 7. Compute total score and grade on the server (ignore frontend values)
    const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

    // 8. Insert evaluation record
    const evalResult = await client.query(
      `INSERT INTO evaluations
         (session_id, employee_id, role, product_type, status, total_score, grade, submitted_at)
       VALUES ($1, $2, $3, $4, 'saved', $5, $6, NOW())
       RETURNING id`,
      [sessionId, employee.id, employee.role, productType, totalScore, grade]
    );
    const evaluationId = evalResult.rows[0].id;

    // 9. Insert evaluation_scores
    for (const code of codes) {
      const criterion = criteriaMap[code];
      const entry     = scores[code];
      const weight    = parseFloat(entry.weight ?? criterion.default_weight);
      const score     = entry.score != null ? parseInt(entry.score, 10) : null;
      const note      = entry.note ?? '';

      await client.query(
        `INSERT INTO evaluation_scores (evaluation_id, criterion_id, weight, score, note)
          VALUES ($1, $2, $3, $4, $5)`,
        [evaluationId, criterion.id, weight, score, note]
      );
    }

    await client.query('COMMIT');

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
         ev.product_type  AS "productType"
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
