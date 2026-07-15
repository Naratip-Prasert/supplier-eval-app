'use strict';
// ============================================================
//  controllers/supervisor/supervisor.controller.ts
//  GET  /api/supervisor/queue        — sessions pending review
//  POST /api/supervisor/sessions/:id/approve
//  POST /api/supervisor/sessions/:id/return
// ============================================================
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
const pool   = require('../../db');
const crypto = require('crypto');
const { sendSupervisorResultEmail, sendSupplierEvalInviteEmail } = require('../../utils/emailService');

const FE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SUPPLIER_EVAL_TOKEN_TTL_DAYS = 14;

// Current assignees for a session — read from evaluation_tasks (the live
// source of truth, kept up to date by admin edits) rather than
// suppliers.buyer_email/evaluator_email (a stale snapshot from upload time).
async function getCurrentAssignees(client: PoolClient, sessionId: string) {
  const result = await client.query(
    `SELECT role, assigned_email AS email, assigned_name AS name
       FROM evaluation_tasks WHERE session_id = $1`,
    [sessionId]
  );
  return result.rows;
}

// ── GET /api/supervisor/queue ─────────────────────────────────
async function queue(req: Request, res: Response) {
  try {
    const sessionsResult = await pool.query(`
      SELECT
        es.id              AS "sessionId",
        s.vendor_code      AS "vendorCode",
        s.supplier_name    AS "supplierName",
        es.eval_type       AS "evalType",
        es.period,
        es.final_score     AS "finalScore",
        es.final_grade     AS "finalGrade",
        es.created_at      AS "createdAt",
        sr.id              AS "reviewId",
        sr.review_due      AS "reviewDue",
        sr.status          AS "reviewStatus"
      FROM evaluation_sessions es
      JOIN suppliers s ON s.id = es.supplier_id
      LEFT JOIN supervisor_reviews sr ON sr.id = (
        SELECT id FROM supervisor_reviews
         WHERE session_id = es.id AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1
      )
      WHERE es.status = 'pending_review'
      ORDER BY sr.review_due ASC NULLS LAST
    `);

    if (sessionsResult.rows.length === 0) return res.json([]);

    const sessionIds = sessionsResult.rows.map((r: any) => r.sessionId);

    const evalsResult = await pool.query(`
      SELECT
        ev.session_id   AS "sessionId",
        ev.id,
        ev.role,
        ev.total_score  AS "totalScore",
        ev.grade,
        ev.submitted_at AS "submittedAt",
        emp.employee_id AS "employeeId",
        emp.full_name   AS "fullName",
        emp.profile_picture AS "profilePicture",
        d.name_th       AS "department"
      FROM evaluations ev
      JOIN employees emp ON emp.id = ev.employee_id
      LEFT JOIN departments d ON d.id = emp.department_id
      WHERE ev.session_id = ANY($1)
      ORDER BY ev.role
    `, [sessionIds]);

    const evalsBySession: Record<string, any[]> = {};
    evalsResult.rows.forEach((ev: any) => {
      if (!evalsBySession[ev.sessionId]) evalsBySession[ev.sessionId] = [];
      evalsBySession[ev.sessionId].push(ev);
    });

    const response = sessionsResult.rows.map((s: any) => ({
      ...s,
      evaluations: evalsBySession[s.sessionId] ?? [],
    }));

    res.json(response);
  } catch (err: any) {
    console.error('GET /api/supervisor/queue error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
}

// ── GET /api/supervisor/history ───────────────────────────────
async function history(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT
        es.id              AS "sessionId",
        s.vendor_code      AS "vendorCode",
        s.supplier_name    AS "supplierName",
        es.eval_type       AS "evalType",
        es.period,
        es.status,
        es.final_score     AS "finalScore",
        es.final_grade     AS "finalGrade",
        es.completed_at    AS "completedAt",
        sr.id              AS "reviewId",
        sr.status          AS "reviewStatus",
        sr.notes           AS "reviewNotes",
        sr.reviewed_at     AS "reviewedAt",
        sup_emp.full_name  AS "supervisorName",
        sup_emp.employee_id AS "supervisorEmpId"
      FROM evaluation_sessions es
      JOIN suppliers s ON s.id = es.supplier_id
      LEFT JOIN supervisor_reviews sr ON sr.session_id = es.id
      LEFT JOIN employees sup_emp ON sup_emp.id = sr.supervisor_id
      WHERE es.status IN ('completed', 'returned')
      ORDER BY sr.reviewed_at DESC NULLS LAST
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/supervisor/history error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
}

// ── POST /api/supervisor/sessions/:id/approve ─────────────────
async function approve(req: Request, res: Response) {
  const { notes } = req.body;
  const sessionId  = req.params.id as string;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch session + supplier
    const sessionResult = await client.query(`
      SELECT es.id, es.eval_type, es.final_score, es.final_grade,
             s.id AS "supplierId", s.supplier_name, s.vendor_code, s.contact_email
        FROM evaluation_sessions es
        JOIN suppliers s ON s.id = es.supplier_id
       WHERE es.id = $1 AND es.status = 'pending_review'
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'ไม่พบ session หรือสถานะไม่ถูกต้อง' });
    }
    const session = sessionResult.rows[0];
    const assignees = await getCurrentAssignees(client, sessionId);

    // Resolve the acting supervisor's row id up front — if it doesn't
    // resolve (e.g. JWT empId no longer matches any employee), fail loudly
    // instead of silently writing supervisor_id = NULL and losing the
    // audit trail of who approved this session.
    const supervisorResult = await client.query(
      `SELECT id FROM employees WHERE UPPER(employee_id) = UPPER($1) LIMIT 1`,
      [req.user!.empId]
    );
    if (supervisorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`[supervisor] empId จาก JWT ไม่พบใน employees: ${req.user!.empId}`);
      return res.status(401).json({ message: 'ไม่พบบัญชีผู้ใช้ของคุณในระบบ กรุณาเข้าสู่ระบบใหม่' });
    }
    const supervisorId = supervisorResult.rows[0].id;

    // Update session → completed
    await client.query(`
      UPDATE evaluation_sessions
         SET status = 'completed', completed_at = NOW()
       WHERE id = $1
    `, [sessionId]);

    // pre_eval only: set pta_approve_date on supplier
    if (session.eval_type === 'pre_eval') {
      await client.query(`
        UPDATE suppliers SET pta_approve_date = CURRENT_DATE WHERE id = $1
      `, [session.supplierId]);
    }

    // Update supervisor_review
    await client.query(`
      UPDATE supervisor_reviews
         SET status = 'approved', supervisor_id = $1, notes = $2, reviewed_at = NOW()
       WHERE session_id = $3 AND status = 'pending'
    `, [supervisorId, notes || null, sessionId]);

    await client.query('COMMIT');

    // Send result emails (fire-and-forget) — to whoever is CURRENTLY
    // assigned, not whoever the Excel upload originally named.
    const supplier = { supplier_name: session.supplier_name, vendor_code: session.vendor_code };
    for (const a of assignees) {
      if (!a.email) continue;
      sendSupervisorResultEmail(a.email, a.name, supplier, 'approved', notes)
        .catch((e: any) => console.warn('[supervisor] email error:', e.message));
    }

    // Cross-evaluation #3 (see database/CROSS_EVALUATION_SPEC.md): once a
    // session is truly completed, invite the supplier to rate the staff
    // who evaluated them, via a one-time magic-link — no supplier login
    // exists, so a token is the only way in. Silently skipped if the
    // supplier has no contact_email on file (nothing to send to).
    if (session.contact_email) {
      (async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SUPPLIER_EVAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO supplier_eval_tokens (token, session_id, supplier_id, expires_at)
             VALUES ($1, $2, $3, $4)`,
          [token, sessionId, session.supplierId, expiresAt]
        );
        const evalUrl = `${FE_URL}/supplier-feedback/${token}`;
        await sendSupplierEvalInviteEmail(session.contact_email, session.supplier_name, evalUrl);
      })().catch((e: any) => console.warn('[supervisor] supplier eval invite error:', e.message));
    }

    console.log(`[supervisor] อนุมัติ session ${sessionId} โดย ${req.user!.empId}`);
    res.json({ message: 'อนุมัติสำเร็จ', sessionId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/supervisor/approve error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
}

// ── POST /api/supervisor/sessions/:id/return ──────────────────
async function returnSession(req: Request, res: Response) {
  const { notes } = req.body;
  const sessionId  = req.params.id as string;

  if (!notes?.trim()) {
    return res.status(400).json({ message: 'กรุณาระบุหมายเหตุสำหรับการส่งคืน' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(`
      SELECT es.id, es.eval_type,
             s.supplier_name, s.vendor_code
        FROM evaluation_sessions es
        JOIN suppliers s ON s.id = es.supplier_id
       WHERE es.id = $1 AND es.status = 'pending_review'
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'ไม่พบ session หรือสถานะไม่ถูกต้อง' });
    }
    const session = sessionResult.rows[0];
    const assignees = await getCurrentAssignees(client, sessionId);

    // Resolve the acting supervisor's row id up front — see same check in
    // the approve handler for why.
    const supervisorResult = await client.query(
      `SELECT id FROM employees WHERE UPPER(employee_id) = UPPER($1) LIMIT 1`,
      [req.user!.empId]
    );
    if (supervisorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`[supervisor] empId จาก JWT ไม่พบใน employees: ${req.user!.empId}`);
      return res.status(401).json({ message: 'ไม่พบบัญชีผู้ใช้ของคุณในระบบ กรุณาเข้าสู่ระบบใหม่' });
    }
    const supervisorId = supervisorResult.rows[0].id;

    // Reset session → returned. Clears final_score/final_grade too — the
    // recalculate trigger's "not both submitted yet" branch only resets
    // status, so without this the stale score/grade from the rejected
    // round would keep showing on session lists until both sides resubmit.
    await client.query(`
      UPDATE evaluation_sessions
         SET status = 'returned', final_score = NULL, final_grade = NULL
       WHERE id = $1
    `, [sessionId]);

    // Delete (not soft-mark) the rejected evaluations — the submit
    // duplicate-check only looks at row existence, not status, so leaving
    // a stale row behind would permanently block resubmission. Cascades
    // to evaluation_scores automatically (ON DELETE CASCADE).
    await client.query(`DELETE FROM evaluations WHERE session_id = $1`, [sessionId]);

    // Re-open both tasks so they reappear in GCP/USER's "my tasks" list —
    // otherwise they're stuck at status='completed' from the first round
    // and the evaluator has no visible way to know they need to redo it.
    await client.query(`
      UPDATE evaluation_tasks SET status = 'pending'
       WHERE session_id = $1 AND status = 'completed'
    `, [sessionId]);

    // Update supervisor_review
    await client.query(`
      UPDATE supervisor_reviews
         SET status = 'returned', supervisor_id = $1, notes = $2, reviewed_at = NOW()
       WHERE session_id = $3 AND status = 'pending'
    `, [supervisorId, notes, sessionId]);

    await client.query('COMMIT');

    // Send result emails — to whoever is CURRENTLY assigned (post-edit),
    // since that's also who the task list now points at for re-evaluation.
    const supplier = { supplier_name: session.supplier_name, vendor_code: session.vendor_code };
    for (const a of assignees) {
      if (!a.email) continue;
      sendSupervisorResultEmail(a.email, a.name, supplier, 'returned', notes)
        .catch((e: any) => console.warn('[supervisor] email error:', e.message));
    }

    console.log(`[supervisor] ส่งคืน session ${sessionId} โดย ${req.user!.empId}`);
    res.json({ message: 'ส่งคืนสำเร็จ', sessionId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/supervisor/return error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
}

// ── PATCH /api/supervisor/reviews/:id/notes ───────────────────
// Lets a supervisor edit the comment they wrote on a past (already
// approved/returned) review. Keyed by the specific supervisor_reviews
// row id — NOT session id, since one session can have several review
// rows over multiple return/resubmit cycles, and editing by session id
// would resolve to an arbitrary (often wrong/stale) row among them.
// Only the supervisor who wrote it (or ADMIN) may edit — a business-logic
// check mixing role AND ownership, so it stays here rather than becoming
// a plain requireRole() gate at the route level.
async function updateReviewNotes(req: Request, res: Response) {
  const { notes } = req.body;
  const reviewId   = req.params.id;

  if (!notes?.trim()) {
    return res.status(400).json({ message: 'กรุณาระบุหมายเหตุ' });
  }

  try {
    const reviewResult = await pool.query(`
      SELECT sr.id, emp.employee_id AS "supervisorEmpId"
        FROM supervisor_reviews sr
        LEFT JOIN employees emp ON emp.id = sr.supervisor_id
       WHERE sr.id = $1 AND sr.status IN ('approved', 'returned')
    `, [reviewId]);

    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบประวัติการอนุมัติ' });
    }
    const review = reviewResult.rows[0];

    if (req.user!.role !== 'ADMIN' && review.supervisorEmpId?.toUpperCase() !== req.user!.empId?.toUpperCase()) {
      return res.status(403).json({ message: 'แก้ไขได้เฉพาะหมายเหตุของตัวเองเท่านั้น' });
    }

    await pool.query(`UPDATE supervisor_reviews SET notes = $1 WHERE id = $2`, [notes.trim(), review.id]);
    res.json({ message: 'บันทึกหมายเหตุสำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/supervisor/reviews/:id/notes error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
}

module.exports = { queue, history, approve, returnSession, updateReviewNotes };
