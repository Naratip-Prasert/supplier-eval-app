'use strict';
// ============================================================
//  routes/supervisor.js
//  GET  /api/supervisor/queue        — sessions pending review
//  POST /api/supervisor/sessions/:id/approve
//  POST /api/supervisor/sessions/:id/return
// ============================================================
const router = require('express').Router();
const pool   = require('../db');
const { sendSupervisorResultEmail } = require('../utils/emailService');

// Current assignees for a session — read from evaluation_tasks (the live
// source of truth, kept up to date by admin edits) rather than
// suppliers.buyer_email/evaluator_email (a stale snapshot from upload time).
async function getCurrentAssignees(client, sessionId) {
  const result = await client.query(
    `SELECT role, assigned_email AS email, assigned_name AS name
       FROM evaluation_tasks WHERE session_id = $1`,
    [sessionId]
  );
  return result.rows;
}

// middleware: SUPERVISOR or ADMIN only
router.use((req, res, next) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'สิทธิ์ไม่เพียงพอ (ต้องการ SUPERVISOR หรือ ADMIN)' });
  }
  next();
});

// ── GET /api/supervisor/queue ─────────────────────────────────
router.get('/queue', async (req, res) => {
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
      LEFT JOIN supervisor_reviews sr ON sr.session_id = es.id AND sr.status = 'pending'
      WHERE es.status = 'pending_review'
      ORDER BY sr.review_due ASC NULLS LAST
    `);

    if (sessionsResult.rows.length === 0) return res.json([]);

    const sessionIds = sessionsResult.rows.map(r => r.sessionId);

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
        d.name_th       AS "department"
      FROM evaluations ev
      JOIN employees emp ON emp.id = ev.employee_id
      LEFT JOIN departments d ON d.id = emp.department_id
      WHERE ev.session_id = ANY($1)
      ORDER BY ev.role
    `, [sessionIds]);

    const evalsBySession = {};
    evalsResult.rows.forEach(ev => {
      if (!evalsBySession[ev.sessionId]) evalsBySession[ev.sessionId] = [];
      evalsBySession[ev.sessionId].push(ev);
    });

    const response = sessionsResult.rows.map(s => ({
      ...s,
      evaluations: evalsBySession[s.sessionId] ?? [],
    }));

    res.json(response);
  } catch (err) {
    console.error('GET /api/supervisor/queue error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/supervisor/history ───────────────────────────────
router.get('/history', async (req, res) => {
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
        sr.status          AS "reviewStatus",
        sr.notes           AS "reviewNotes",
        sr.reviewed_at     AS "reviewedAt",
        sup_emp.full_name  AS "supervisorName"
      FROM evaluation_sessions es
      JOIN suppliers s ON s.id = es.supplier_id
      LEFT JOIN supervisor_reviews sr ON sr.session_id = es.id
      LEFT JOIN employees sup_emp ON sup_emp.id = sr.supervisor_id
      WHERE es.status IN ('completed', 'returned')
      ORDER BY sr.reviewed_at DESC NULLS LAST
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/supervisor/history error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── POST /api/supervisor/sessions/:id/approve ─────────────────
router.post('/sessions/:id/approve', async (req, res) => {
  const { notes } = req.body;
  const sessionId  = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch session + supplier
    const sessionResult = await client.query(`
      SELECT es.id, es.eval_type, es.final_score, es.final_grade,
             s.id AS "supplierId", s.supplier_name, s.vendor_code
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
         SET status = 'approved', supervisor_id = (
               SELECT id FROM employees WHERE employee_id = $1 LIMIT 1
             ), notes = $2, reviewed_at = NOW()
       WHERE session_id = $3 AND status = 'pending'
    `, [req.user.empId, notes || null, sessionId]);

    await client.query('COMMIT');

    // Send result emails (fire-and-forget) — to whoever is CURRENTLY
    // assigned, not whoever the Excel upload originally named.
    const supplier = { supplier_name: session.supplier_name, vendor_code: session.vendor_code };
    for (const a of assignees) {
      if (!a.email) continue;
      sendSupervisorResultEmail(a.email, a.name, supplier, 'approved', notes)
        .catch(e => console.warn('[supervisor] email error:', e.message));
    }

    console.log(`[supervisor] อนุมัติ session ${sessionId} โดย ${req.user.empId}`);
    res.json({ message: 'อนุมัติสำเร็จ', sessionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/supervisor/approve error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/supervisor/sessions/:id/return ──────────────────
router.post('/sessions/:id/return', async (req, res) => {
  const { notes } = req.body;
  const sessionId  = req.params.id;

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

    // Reset session → returned
    await client.query(`
      UPDATE evaluation_sessions SET status = 'returned' WHERE id = $1
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
         SET status = 'returned', supervisor_id = (
               SELECT id FROM employees WHERE employee_id = $1 LIMIT 1
             ), notes = $2, reviewed_at = NOW()
       WHERE session_id = $3 AND status = 'pending'
    `, [req.user.empId, notes, sessionId]);

    await client.query('COMMIT');

    // Send result emails — to whoever is CURRENTLY assigned (post-edit),
    // since that's also who the task list now points at for re-evaluation.
    const supplier = { supplier_name: session.supplier_name, vendor_code: session.vendor_code };
    for (const a of assignees) {
      if (!a.email) continue;
      sendSupervisorResultEmail(a.email, a.name, supplier, 'returned', notes)
        .catch(e => console.warn('[supervisor] email error:', e.message));
    }

    console.log(`[supervisor] ส่งคืน session ${sessionId} โดย ${req.user.empId}`);
    res.json({ message: 'ส่งคืนสำเร็จ', sessionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/supervisor/return error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
