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
              gcpEmp.emp_no AS "targetEmployeeId", gcpEmp.name AS "targetFullName"
         FROM "SPES_evaluations" userEval
         JOIN "SPES_evaluation_sessions" es ON es.id = userEval.session_id
         JOIN "SPES_suppliers" s ON s.id = es.supplier_id
         JOIN "Master_Data_All" me ON me.emp_no = userEval.employee_id
         JOIN "SPES_evaluations" gcpEval ON gcpEval.session_id = es.id AND gcpEval.role = 'GCP' AND gcpEval.status = 'saved'
         JOIN "Master_Data_All" gcpEmp ON gcpEmp.emp_no = gcpEval.employee_id
        WHERE userEval.role = 'USER' AND userEval.status = 'saved'
          AND UPPER(me.emp_no) = UPPER($1)
          AND es.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM "SPES_service_evaluations" se
             WHERE se.session_id = es.id AND se.direction = 'user_to_gcp'
               AND se.evaluator_employee_id = me.emp_no
          )
        ORDER BY es.completed_at DESC`,
      [req.user!.empId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/pending error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /my-feedback — service_evaluations where I'm the target ────
async function myFeedback(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT se.id, se.direction, se.total_score AS "totalScore", se.grade,
              se.submitted_at AS "submittedAt", s.supplier_name AS "supplierName",
              COALESCE(sup.supplier_name, evaluator.name) AS "evaluatorLabel"
         FROM "SPES_service_evaluations" se
         JOIN "SPES_evaluation_sessions" es ON es.id = se.session_id
         JOIN "SPES_suppliers" s ON s.id = es.supplier_id
         JOIN "Master_Data_All" me ON me.emp_no = se.target_employee_id
         LEFT JOIN "SPES_suppliers" sup ON sup.id = se.evaluator_supplier_id
         LEFT JOIN "Master_Data_All" evaluator ON evaluator.emp_no = se.evaluator_employee_id
        WHERE UPPER(me.emp_no) = UPPER($1)
        ORDER BY se.submitted_at DESC`,
      [req.user!.empId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/my-feedback error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /criteria — the shared "เชิงบริการ" criteria set ──────
// Returns sections (one per evaluation_main_criteria row under this
// criteria_set) each carrying its items, and each item carrying its 1-5
// level description text (score_level_descriptions) — the eval form needs
// this to render the same colored-level-description grid as EvalForm,
// which the old flat-list shape (no level text, no section grouping)
// couldn't support.
async function criteria(req: Request, res: Response) {
  try {
    const catRes = await pool.query(
      `SELECT id, name_th AS "nameTh", total_weight AS "totalWeight", display_order AS "displayOrder"
         FROM "SPES_evaluation_main_criteria"
        WHERE code LIKE 'SVC%' AND is_active = TRUE
        ORDER BY display_order`
    );
    const itemRes = await pool.query(
      `SELECT s.id, s.category_id AS "categoryId", s.code, s.name_th AS "nameTh",
              s.default_weight AS "defaultWeight", s.display_order AS "displayOrder",
              s.level_values AS "levelValues"
         FROM "SPES_evaluation_sub_criteria" s
         JOIN "SPES_evaluation_main_criteria" m ON m.id = s.category_id
        WHERE s.criteria_set = 'service' AND s.is_active = TRUE AND m.is_active = TRUE
        ORDER BY s.display_order`
    );
    const itemIds = itemRes.rows.map((r: any) => r.id);
    const levelRes = itemIds.length
      ? await pool.query(
          `SELECT criterion_id AS "criterionId", level, description FROM "SPES_score_level_descriptions"
            WHERE criterion_id = ANY($1::uuid[]) ORDER BY criterion_id, level`,
          [itemIds]
        )
      : { rows: [] };
    const levelsByCrit: Record<string, string[]> = {};
    levelRes.rows.forEach((r: any) => { (levelsByCrit[r.criterionId] ??= [])[r.level - 1] = r.description; });

    const itemsByCat: Record<string, any[]> = {};
    itemRes.rows.forEach((it: any) => {
      // pg returns NUMERIC columns as strings, not JS numbers — every other
      // criteria endpoint in this app (e.g. GET /api/criteria) parses this
      // before sending; skipping it here left the frontend calling
      // .toFixed()/arithmetic on a string.
      (itemsByCat[it.categoryId] ??= []).push({ ...it, defaultWeight: parseFloat(it.defaultWeight), levels: levelsByCrit[it.id] ?? [] });
    });

    const sections = catRes.rows.map((c: any) => ({ ...c, totalWeight: parseFloat(c.totalWeight), items: itemsByCat[c.id] ?? [] }));
    res.json(sections);
  } catch (err: any) {
    console.error('GET /api/service-evaluations/criteria error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── POST / — submit a rating for one session's Buyer ──────────
async function submit(req: Request, res: Response) {
  const { sessionId, targetEmployeeId, scores, strengths, improvements } = req.body;
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
      `SELECT es.id, me.emp_no AS "myEmployeeId"
         FROM "SPES_evaluations" userEval
         JOIN "SPES_evaluation_sessions" es ON es.id = userEval.session_id
         JOIN "Master_Data_All" me ON me.emp_no = userEval.employee_id
         JOIN "SPES_evaluations" gcpEval ON gcpEval.session_id = es.id AND gcpEval.role = 'GCP' AND gcpEval.status = 'saved'
        WHERE userEval.role = 'USER' AND userEval.status = 'saved'
          AND UPPER(me.emp_no) = UPPER($1)
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
      `SELECT code, default_weight FROM "SPES_evaluation_sub_criteria"
        WHERE criteria_set = 'service' AND is_active = TRUE`
    );
    const criteriaMap: Record<string, { default_weight: number }> = {};
    criteriaResult.rows.forEach((c: any) => { criteriaMap[c.code] = { default_weight: c.default_weight }; });

    const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

    // strengths/improvements are free-text feedback (Excel's "จุดเด่นที่ควร
    // รักษาไว้" / "สิ่งที่ควรปรับปรุง" fields) — kept nested inside raw_scores
    // rather than passed to computeScoreAndGrade, which treats every key of
    // its scoresInput as a criterion code and would otherwise try to score
    // this plain text.
    const insertRes = await client.query(
      `INSERT INTO "SPES_service_evaluations"
         (session_id, direction, evaluator_employee_id, target_employee_id, total_score, grade, raw_scores)
       VALUES ($1, 'user_to_gcp', $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, direction, target_employee_id) DO NOTHING
       RETURNING id`,
      [sessionId, myEmployeeId, targetEmployeeId, totalScore, grade, JSON.stringify({
        scores, strengths: strengths ?? null, improvements: improvements ?? null,
      })]
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
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

module.exports = { pending, myFeedback, criteria, submit };
