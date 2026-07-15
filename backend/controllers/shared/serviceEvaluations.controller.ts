'use strict';
// ============================================================
//  controllers/shared/serviceEvaluations.controller.ts
//  Cross-evaluation #4 (database/CROSS_EVALUATION_SPEC.md):
//  the USER who evaluated a supplier also rates the Buyer (GCP)
//  they worked with on that same session, once it's completed.
//  Mounted behind requireAuth in server.ts — reuses the normal
//  USER login, no new role.
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');
const { computeScoreAndGrade } = require('./evaluations.controller');

// ── GET /pending — sessions this USER can now rate their Buyer for ──
async function pending(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT es.id AS "sessionId", s.supplier_name AS "supplierName",
              gcpEmp.id AS "targetEmployeeId", gcpEmp.full_name AS "targetFullName"
         FROM evaluations userEval
         JOIN evaluation_sessions es ON es.id = userEval.session_id
         JOIN suppliers s ON s.id = es.supplier_id
         JOIN employees me ON me.id = userEval.employee_id
         JOIN evaluations gcpEval ON gcpEval.session_id = es.id AND gcpEval.role = 'GCP' AND gcpEval.status = 'saved'
         JOIN employees gcpEmp ON gcpEmp.id = gcpEval.employee_id
        WHERE userEval.role = 'USER' AND userEval.status = 'saved'
          AND UPPER(me.employee_id) = UPPER($1)
          AND es.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM service_evaluations se
             WHERE se.session_id = es.id AND se.direction = 'user_to_gcp'
               AND se.evaluator_employee_id = me.id
          )
        ORDER BY es.completed_at DESC`,
      [req.user!.empId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/pending error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
}

// ── GET /my-feedback — service_evaluations where I'm the target ────
async function myFeedback(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT se.id, se.direction, se.total_score AS "totalScore", se.grade,
              se.submitted_at AS "submittedAt", s.supplier_name AS "supplierName",
              COALESCE(sup.supplier_name, evaluator.full_name) AS "evaluatorLabel"
         FROM service_evaluations se
         JOIN evaluation_sessions es ON es.id = se.session_id
         JOIN suppliers s ON s.id = es.supplier_id
         JOIN employees me ON me.id = se.target_employee_id
         LEFT JOIN suppliers sup ON sup.id = se.evaluator_supplier_id
         LEFT JOIN employees evaluator ON evaluator.id = se.evaluator_employee_id
        WHERE UPPER(me.employee_id) = UPPER($1)
        ORDER BY se.submitted_at DESC`,
      [req.user!.empId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/my-feedback error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
}

// ── GET /criteria — the shared "เชิงบริการ" criteria set ──────
async function criteria(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT m.id AS "categoryId", m.name_th AS "categoryNameTh", m.display_order AS "categoryOrder",
              s.id, s.code, s.name_th AS "nameTh", s.default_weight AS "defaultWeight",
              s.display_order AS "displayOrder", s.level_values AS "levelValues"
         FROM evaluation_sub_criteria s
         JOIN evaluation_main_criteria m ON m.id = s.category_id
        WHERE s.criteria_set = 'service' AND s.is_active = TRUE AND m.is_active = TRUE
        ORDER BY m.display_order, s.display_order`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/criteria error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
}

// ── POST / — submit a rating for one session's Buyer ──────────
async function submit(req: Request, res: Response) {
  const { sessionId, targetEmployeeId, scores } = req.body;
  if (!sessionId || !targetEmployeeId || typeof scores !== 'object') {
    return res.status(400).json({ message: 'กรุณาระบุ sessionId, targetEmployeeId, scores' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Confirm the requester really was the USER evaluator on this
    // completed session, and that targetEmployeeId really is that
    // session's GCP evaluator — never trust these off the request body
    // alone, someone else's session/employee id could be substituted.
    const check = await client.query(
      `SELECT es.id, me.id AS "myEmployeeId"
         FROM evaluations userEval
         JOIN evaluation_sessions es ON es.id = userEval.session_id
         JOIN employees me ON me.id = userEval.employee_id
         JOIN evaluations gcpEval ON gcpEval.session_id = es.id AND gcpEval.role = 'GCP' AND gcpEval.status = 'saved'
        WHERE userEval.role = 'USER' AND userEval.status = 'saved'
          AND UPPER(me.employee_id) = UPPER($1)
          AND es.id = $2 AND es.status = 'completed'
          AND gcpEval.employee_id = $3`,
      [req.user!.empId, sessionId, targetEmployeeId]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ไม่พบ session ที่ตรงกับสิทธิ์ของคุณ' });
    }
    const myEmployeeId = check.rows[0].myEmployeeId;

    const criteriaResult = await client.query(
      `SELECT code, default_weight FROM evaluation_sub_criteria
        WHERE criteria_set = 'service' AND is_active = TRUE`
    );
    const criteriaMap: Record<string, { default_weight: number }> = {};
    criteriaResult.rows.forEach((c: any) => { criteriaMap[c.code] = { default_weight: c.default_weight }; });

    const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

    const insertRes = await client.query(
      `INSERT INTO service_evaluations
         (session_id, direction, evaluator_employee_id, target_employee_id, total_score, grade, raw_scores)
       VALUES ($1, 'user_to_gcp', $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, direction, target_employee_id) DO NOTHING
       RETURNING id`,
      [sessionId, myEmployeeId, targetEmployeeId, totalScore, grade, JSON.stringify(scores)]
    );
    if (insertRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'คุณให้คะแนนรายการนี้ไปแล้ว' });
    }

    await client.query('COMMIT');
    res.json({ message: 'บันทึกสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/service-evaluations error:', err);
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
}

module.exports = { pending, myFeedback, criteria, submit };
