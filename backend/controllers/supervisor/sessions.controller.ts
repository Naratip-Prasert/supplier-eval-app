'use strict';
// ============================================================
//  controllers/supervisor/sessions.controller.ts
//  GET /api/sessions      — evaluation history list (req 6)
//  GET /api/sessions/:id  — session detail with both evaluations
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');

// GET /api/sessions
// Full evaluation history — each session row includes summary
// for both USER and GCP evaluations (req 6).
// Optional query params:
//   ?vendorCode=SUP-001  — filter by supplier
//   ?status=completed    — filter by status
async function listSessions(req: Request, res: Response) {
  const vendorCode = req.query.vendorCode as string | undefined;
  const status = req.query.status as string | undefined;

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
         initiator.emp_no   AS "initiatedBy",
         COALESCE(
           (SELECT sr.review_due FROM "SPES_supervisor_reviews" sr WHERE sr.session_id = es.id ORDER BY sr.created_at DESC LIMIT 1),
           (SELECT MAX(et.due_date) FROM "SPES_evaluation_tasks" et WHERE et.session_id = es.id)
         ) AS "dueDate"
       FROM "SPES_evaluation_sessions" es
       JOIN "SPES_suppliers" s ON s.id = es.supplier_id
       LEFT JOIN "Master_Data_All" initiator ON initiator.emp_no = es.initiated_by
       WHERE ($1::text IS NULL OR s.vendor_code = $1)
         AND ($2::text IS NULL OR es.status = $2)
       ORDER BY es.created_at DESC`,
      [vendorCode ? vendorCode.trim() : null, status ? status.trim() : null]
    );

    if (sessionsResult.rows.length === 0) {
      return res.json([]);
    }

    const sessionIds = sessionsResult.rows.map((r: any) => r.sessionId);

    // Fetch evaluations summary for all sessions in one query
    const evalsResult = await pool.query(
      `SELECT
         ev.session_id    AS "sessionId",
         ev.role,
         ev.total_score   AS "totalScore",
         ev.grade,
         ev.status,
         ev.submitted_at  AS "submittedAt",
         emp.emp_no       AS "employeeId",
         emp.name         AS "fullName",
         NULL             AS "profilePicture"
       FROM "SPES_evaluations" ev
       JOIN "Master_Data_All" emp ON emp.emp_no = ev.employee_id
       WHERE ev.session_id = ANY($1)`,
      [sessionIds]
    );

    // Group evaluations by sessionId
    const evalsBySession: Record<string, any[]> = {};
    evalsResult.rows.forEach((ev: any) => {
      if (!evalsBySession[ev.sessionId]) evalsBySession[ev.sessionId] = [];
      evalsBySession[ev.sessionId].push(ev);
    });

    const response = sessionsResult.rows.map((session: any) => ({
      ...session,
      evaluations: evalsBySession[session.sessionId] ?? [],
    }));

    res.json(response);
  } catch (err: any) {
    console.error('GET /api/sessions error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// GET /api/sessions/:id
// Returns a single session with full detail: both evaluations + all their scores.
async function getSession(req: Request, res: Response) {
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
           (SELECT sr.review_due FROM "SPES_supervisor_reviews" sr WHERE sr.session_id = es.id ORDER BY sr.created_at DESC LIMIT 1),
           (SELECT MAX(et.due_date) FROM "SPES_evaluation_tasks" et WHERE et.session_id = es.id)
         ) AS "dueDate"
       FROM "SPES_evaluation_sessions" es
       JOIN "SPES_suppliers" s ON s.id = es.supplier_id
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
         emp.emp_no      AS "employeeId",
         emp.name        AS "fullName",
         NULL            AS "profilePicture",
         emp.team        AS "department",
         emp.position    AS "jobTitle"
       FROM "SPES_evaluations" ev
       JOIN "Master_Data_All" emp ON emp.emp_no = ev.employee_id
       WHERE ev.session_id = $1
       ORDER BY ev.role`,
      [session.sessionId]
    );

    const evalIds = evalsResult.rows.map((e: any) => e.id);

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
       FROM "SPES_evaluation_scores" evs
       JOIN "SPES_evaluation_sub_criteria"   ec  ON ec.id  = evs.criterion_id
       JOIN "SPES_evaluation_main_criteria" cat ON cat.id = ec.category_id
       WHERE evs.evaluation_id = ANY($1)
       ORDER BY evs.evaluation_id, ec.display_order`,
      [evalIds]
    );

    // Group scores by evaluationId
    const scoresByEval: Record<string, any[]> = {};
    scoresResult.rows.forEach((s: any) => {
      if (!scoresByEval[s.evaluationId]) scoresByEval[s.evaluationId] = [];
      scoresByEval[s.evaluationId].push(s);
    });

    const evaluations = evalsResult.rows.map((ev: any) => ({
      ...ev,
      scores: scoresByEval[ev.id] ?? [],
    }));

    res.json({ ...session, evaluations });
  } catch (err: any) {
    console.error('GET /api/sessions/:id error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

module.exports = { listSessions, getSession };
