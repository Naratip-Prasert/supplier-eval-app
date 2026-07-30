'use strict';
// ============================================================
//  controllers/shared/evaluations.controller.ts
//  POST /api/evaluations  — save a complete evaluation
//  GET  /api/evaluations  — list all (legacy history endpoint)
//  GET  /api/evaluations/:id — single evaluation detail
// ============================================================
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
const pool   = require('../../db');
const { sendSupervisorNotifyEmail, sendThankyouEmail, getEmailSetting } = require('../../utils/emailService');

// ── helpers ──────────────────────────────────────────────────

function missingFields(body: Record<string, any>, fields: string[]): string[] {
  return fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
}

// Shared with controllers/shared/serviceEvaluations.controller.ts and
// controllers/public/publicSupplierEval.controller.ts — same weighted-score +
// grade-threshold formula, one place to change it.
async function computeScoreAndGrade(
  client: PoolClient,
  scoresInput: Record<string, { score?: number | string; weight?: number | string; note?: string }>,
  criteriaMap: Record<string, { id: string; code: string; default_weight: number }>
) {
  let totalRawScore      = 0;
  let totalPossibleWeight = 0;

  // Use ALL submitted criteria (with their submitted weights) so the score
  // is correct even for criteria codes not yet in the DB.
  for (const code of Object.keys(scoresInput)) {
    const entry  = scoresInput[code];
    const weight = parseFloat(String(entry.weight ?? criteriaMap[code]?.default_weight ?? 1));
    totalPossibleWeight += weight;
    if (entry.score != null) {
      totalRawScore += (parseFloat(String(entry.score)) / 5) * weight;
    }
  }

  const totalScore = totalPossibleWeight > 0
    ? Math.round((totalRawScore / totalPossibleWeight) * 100 * 100) / 100
    : 0;

  // Round to 1dp for grade lookup — matches .toFixed(1) display precision
  const scoreFor1dp = Math.round(totalScore * 10) / 10;
  const gradeRow = await client.query(
    'SELECT grade FROM "SPES_grade_thresholds" WHERE $1 >= min_score AND $1 <= max_score LIMIT 1',
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
//   evalType:   "pre_eval" | "post_eval" | "half_year" | "yearly",
//   period:     "Annual / รายปี",
//   productType:"goods" | "services" | "both",
//   scores: {
//     "1.1": { score: 4, weight: 14, note: "..." },
//     ...
//   }
// }
async function createEvaluation(req: Request, res: Response) {
  const { vendorCode, evalType, period, productType, scores, sessionId: taskSessionId, moduleCode, customModuleItems } = req.body;

  // The acting employee is resolved from the verified JWT (req.user.empId),
  // never from the request body — req.body used to carry an `employeeId`
  // field the client could set to ANY employee code, letting one logged-in
  // user submit (and complete/lock) another employee's evaluation task.
  const employeeId = req.user!.empId;

  const missing = missingFields(req.body, ['vendorCode', 'evalType', 'period', 'productType', 'scores']);
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
      `SELECT e.emp_no AS id, COALESCE(r.role, 'USER') AS role FROM "Master_Data_GCP" e LEFT JOIN "SPES_Roles" r ON r.emp_no = e.emp_no WHERE UPPER(e.emp_no) = UPPER($1)`,
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
      `SELECT id FROM "SPES_suppliers" WHERE vendor_code = $1 AND is_active = TRUE`,
      [vendorCode]
    );
    if (supResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[evaluations] ไม่พบ vendor code: ${vendorCode}`);
      return res.status(400).json({ message: 'ไม่พบรหัสซัพพลายเออร์', field: 'vendorCode' });
    }
    const supplier = supResult.rows[0];

    // 3. USER permission check — disabled for now (all users can evaluate any supplier)

    // USER, GCP, ADMIN are all valid roles for evaluation submissions —
    // anything else (e.g. SUPERVISOR submitting through the legacy
    // manual-entry path with no taskSessionId) silently gets recast to
    // USER below. Log it so a misattributed submitter is at least
    // traceable instead of vanishing without a trace.
    if (!['USER', 'GCP', 'ADMIN'].includes(employee.role)) {
      console.warn(`[evaluations] role "${employee.role}" ไม่ใช่ role มาตรฐานสำหรับส่งผลประเมิน — บันทึกเป็น USER แทน (employeeId=${employee.id})`);
    }
    let evalRole = ['USER', 'GCP', 'ADMIN'].includes(employee.role) ? employee.role : 'USER';

    let sessionId;
    let sessionEvalType;

    // 4a. If submitted from an assigned task, attach to that exact session
    // instead of fuzzy-matching by (supplier, period, evalType) — task
    // sessions must only be filled by their assigned employee, not by
    // anyone who happens to submit a matching (supplier, period, evalType).
    if (taskSessionId) {
      const taskSessionResult = await client.query(
        `SELECT id, eval_type FROM "SPES_evaluation_sessions"
          WHERE id = $1 AND supplier_id = $2 AND status IN ('pending', 'in_progress', 'returned')`,
        [taskSessionId, supplier.id]
      );
      if (taskSessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'ไม่พบงานประเมินนี้ หรืองานถูกดำเนินการไปแล้ว', field: 'sessionId' });
      }
      sessionId = taskSessionResult.rows[0].id;
      sessionEvalType = taskSessionResult.rows[0].eval_type;

      // Record the role the TASK was assigned for, not the submitter's own
      // employees.role. An ADMIN account is often the real-world GCP/buyer
      // for a given supplier (assigned by email) — if their submission were
      // stored as role='ADMIN', recalculate_session_final_score (which only
      // ever looks for one 'USER' row + one 'GCP' row) would never see both
      // halves, leaving the session stuck at "in_progress" forever even
      // after both people have submitted.
      const taskRoleResult = await client.query(
        `SELECT role FROM "SPES_evaluation_tasks"
          WHERE session_id = $1
            AND (assigned_employee_id = $2
                 OR assigned_email = (SELECT email FROM "Master_Data_GCP" WHERE emp_no = $2 LIMIT 1))
          LIMIT 1`,
        [sessionId, employee.id]
      );
      if (taskRoleResult.rows.length > 0 && ['USER', 'GCP'].includes(taskRoleResult.rows[0].role)) {
        evalRole = taskRoleResult.rows[0].role;
      }

      const dupResult = await client.query(
        `SELECT id FROM "SPES_evaluations" WHERE session_id = $1 AND role = $2`,
        [sessionId, evalRole]
      );
      if (dupResult.rows.length > 0) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] ${employeeId} (${evalRole}) ส่งผลซ้ำ session ${sessionId}`);
        return res.status(409).json({ message: 'คุณได้ส่งผลการประเมินสำหรับรายการนี้แล้ว' });
      }
    } else {
      // 4b. Legacy manual-entry flow — validate eval_type, find or create session
      const validEvalTypes = ['post_eval', 'pre_eval', 'half_year', 'yearly'];
      if (!validEvalTypes.includes(evalType)) {
        await client.query('ROLLBACK');
        console.warn(`[evaluations] evalType ไม่ถูกต้อง: "${evalType}" (รับได้: ${validEvalTypes.join(', ')})`);
        return res.status(400).json({ message: 'ประเภทการประเมินไม่ถูกต้อง', field: 'evalType' });
      }

      // Exclude sessions already owned by the task-assignment system (admin
      // bulk-upload flow) — they share eval_type/period values with this
      // manual flow (e.g. both use "pre_eval" + "New Supplier / ผู้ขายรายใหม่"),
      // so without this guard a manual submission could attach itself to a
      // session that's meant to be filled only by its assigned task.
      const sessionResult = await client.query(
        `SELECT id FROM "SPES_evaluation_sessions" es
          WHERE supplier_id = $1
            AND period      = $2
            AND eval_type   = $3
            AND status IN ('pending', 'in_progress', 'returned')
            AND NOT EXISTS (SELECT 1 FROM "SPES_evaluation_tasks" et WHERE et.session_id = es.id)
          ORDER BY created_at DESC
          LIMIT 1`,
        [supplier.id, period, evalType]
      );

      if (sessionResult.rows.length > 0) {
        sessionId = sessionResult.rows[0].id;

        const dupResult = await client.query(
          `SELECT id FROM "SPES_evaluations" WHERE session_id = $1 AND role = $2`,
          [sessionId, evalRole]
        );
        if (dupResult.rows.length > 0) {
          await client.query('ROLLBACK');
          console.warn(`[evaluations] ${employeeId} (${evalRole}) ส่งผลซ้ำ session ${sessionId}`);
          return res.status(409).json({ message: 'คุณได้ส่งผลการประเมินสำหรับรายการนี้แล้ว' });
        }
      } else {
        const newSession = await client.query(
          `INSERT INTO "SPES_evaluation_sessions" (supplier_id, eval_type, period, initiated_by)
            VALUES ($1, $2, $3, $4) RETURNING id`,
          [supplier.id, evalType, period, employee.id]
        );
        sessionId = newSession.rows[0].id;
      }
      sessionEvalType = evalType;
    }

    // 6. Load criteria to resolve codes → UUIDs + default weights
    // PRE_CRITERIA and POST_CRITERIA (src/constants.js) reuse the same code
    // numbers (e.g. "1.1") for different criteria, so lookups must be scoped
    // by criteria_set — same mapping the frontend's getCriteria/isPostEvalType
    // (src/constants.js) use to choose between PRE_CRITERIA and POST_CRITERIA.
    // Part2 "Function module" items (M1-M7) are seeded per-track under
    // 'pre_m1'..'pre_m7' / 'post_m1'..'post_m7' (each track has its own
    // module weight, since Core+ESG totals differ between Pre and Post) —
    // include the chosen module's set too, or its codes would never resolve
    // and silently drop out of total_score (the exact failure mode the
    // matchedScores filter below was built to prevent for a different cause).
    // NOTE: this previously looked up `module_${moduleCode}`, which never
    // matched the actual seeded criteria_set at all — Function module scores
    // were silently excluded from every evaluation that used one.
    const isPostTrack = ['post_eval', 'half_year', 'yearly', 'ad_hoc'].includes(sessionEvalType);
    const criteriaSet = isPostTrack ? 'post_eval' : 'pre_eval';
    const criteriaSets = moduleCode && moduleCode !== 'custom'
      ? [criteriaSet, `${isPostTrack ? 'post' : 'pre'}_${moduleCode}`]
      : [criteriaSet];
    const codes = Object.keys(scores);
    const criteriaResult = await client.query(
      `SELECT sc.id, sc.code, sc.default_weight, sc.name_th, mc.name_th AS category_name_th
         FROM "SPES_evaluation_sub_criteria" sc
         JOIN "SPES_evaluation_main_criteria" mc ON mc.id = sc.category_id
        WHERE sc.code = ANY($1) AND sc.is_active = TRUE AND sc.criteria_set = ANY($2)`,
      [codes, criteriaSets]
    );
    const criteriaMap: Record<string, { id: string; code: string; default_weight: number; name_th: string; category_name_th: string }> = {};
    criteriaResult.rows.forEach((c: any) => { criteriaMap[c.code] = c; });

    // Log unknown codes but do not reject (criteria table may be incomplete).
    // CUSTOM.* codes are expected to never resolve — they're deliberately
    // not in any catalog (see matchedScores above) — so they're not "unknown".
    const unknownCodes = codes.filter(c => !criteriaMap[c] && !c.startsWith('CUSTOM.'));
    if (unknownCodes.length > 0) {
      console.warn(`[evaluations] รหัสเกณฑ์ไม่มีในตาราง (ข้ามการเก็บ): ${unknownCodes.join(', ')}`);
    }

    // 7. Compute total score and grade on the server (ignore frontend values).
    // IMPORTANT: only feed in codes that exist in criteriaMap — the same set
    // that actually gets persisted to evaluation_scores below. Previously
    // this used the full `scores` object (including unknownCodes), so
    // total_score could include contributions from criteria that were then
    // silently dropped from evaluation_scores, making the locked total
    // score permanently unreconcilable against its own per-criterion
    // breakdown (found auditing live data: ~50% of saved evaluations had
    // this exact mismatch).
    // Custom module items ("อื่นๆ พิมพ์เอง") are deliberately never seeded into
    // evaluation_sub_criteria — they're per-evaluation, free-typed by the
    // evaluator (title + level text), persisted via custom_module_items
    // instead of a shared catalog. Their codes (CUSTOM.n) must still count
    // toward total_score even though criteriaMap can't resolve them.
    const matchedScores: Record<string, { score?: number | string; weight?: number | string; note?: string }> = {};
    for (const code of codes) {
      if (criteriaMap[code] || code.startsWith('CUSTOM.')) matchedScores[code] = scores[code];
    }
    const { totalScore, grade } = await computeScoreAndGrade(client, matchedScores, criteriaMap);

    // 8. Mark evaluation_task as completed if task-based assignment exists
    const completedTask = await client.query(`
      UPDATE "SPES_evaluation_tasks"
         SET status = 'completed'
       WHERE session_id = $1
         AND (assigned_employee_id = $2
              OR assigned_email = (SELECT email FROM "Master_Data_GCP" WHERE emp_no = $2 LIMIT 1))
         AND status != 'completed'
       RETURNING id, assigned_email, assigned_name, due_date, thankyou_sent_at
    `, [sessionId, employee.id]).catch(() => ({ rows: [] }));

    // 9. Insert evaluation record (raw_scores stores every criterion submitted)
    const evalResult = await client.query(
      `INSERT INTO "SPES_evaluations"
         (session_id, employee_id, role, product_type, status, total_score, grade, submitted_at, raw_scores, module_code, custom_module_items)
       VALUES ($1, $2, $3, $4, 'saved', $5, $6, NOW(), $7, $8, $9)
       RETURNING id`,
      [sessionId, employee.id, evalRole, productType, totalScore, grade, JSON.stringify(scores),
       moduleCode || null, customModuleItems ? JSON.stringify(customModuleItems) : null]
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
      // Set together via POST /api/uploads/attachment before submit — see
      // NoteCell in EvalForm.tsx. Either both present or both null/undefined.
      const attachmentPath = entry.attachmentPath ?? null;
      const attachmentName = entry.attachmentName ?? null;

      await client.query(
        `INSERT INTO "SPES_evaluation_scores" (evaluation_id, criterion_id, weight, score, note, name_th_snapshot, category_name_th_snapshot, attachment_path, attachment_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [evaluationId, criterion.id, weight, score, note, criterion.name_th, criterion.category_name_th, attachmentPath, attachmentName]
      );
    }

    await client.query('COMMIT');

    // Send thank-you immediately (cron also catches any missed ones daily,
    // but evaluators shouldn't wait until next morning to hear back)
    const task = completedTask.rows[0];
    if (task && !task.thankyou_sent_at) {
      pool.query(
        `SELECT supplier_name, vendor_code FROM "SPES_suppliers" s
           JOIN "SPES_evaluation_sessions" es ON es.supplier_id = s.id WHERE es.id = $1`,
        [sessionId]
      ).then(async (supRes: any) => {
        if (supRes.rows.length === 0) return;
        await sendThankyouEmail(task, supRes.rows[0]);
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET thankyou_sent_at = NOW() WHERE id = $1`, [task.id]);
      }).catch((e: any) => console.warn('[evaluations] thankyou email error:', e.message));
    }

    // After commit: check if both USER+GCP have submitted for this session
    // If yes → create supervisor_review and notify supervisors (fire-and-forget)
    pool.query(
      `SELECT COUNT(*) AS cnt FROM "SPES_evaluations" WHERE session_id = $1 AND status = 'saved'`,
      [sessionId]
    ).then(async (r: any) => {
      if (parseInt(r.rows[0].cnt, 10) < 2) return;

      // Both submitted — create supervisor review record
      const reviewDueDays = await getEmailSetting('review_due_days');
      const reviewDue = new Date(Date.now() + reviewDueDays * 24 * 60 * 60 * 1000);
      // Two near-simultaneous USER+GCP submission commits can both read
      // count=2 and reach here — ON CONFLICT (backed by a partial unique
      // index on session_id WHERE status='pending', schema.sql) keeps only
      // one pending review per session instead of a duplicate + duplicate
      // supervisor notification.
      await pool.query(`
        INSERT INTO "SPES_supervisor_reviews" (session_id, review_due)
        VALUES ($1, $2)
        ON CONFLICT (session_id) WHERE status = 'pending' DO NOTHING
      `, [sessionId, reviewDue]);

      // Fetch session + supplier for email
      const sessionInfo = await pool.query(`
        SELECT es.eval_type, es.final_score, s.supplier_name, s.vendor_code
          FROM "SPES_evaluation_sessions" es
          JOIN "SPES_suppliers" s ON s.id = es.supplier_id
         WHERE es.id = $1
      `, [sessionId]);

      if (sessionInfo.rows.length === 0) return;
      const sess = sessionInfo.rows[0];

      // Notify all active supervisors
      const supervisors = await pool.query(`
        SELECT e.email, e.name AS full_name FROM "Master_Data_GCP" e
         JOIN "SPES_Roles" r ON r.emp_no = e.emp_no
         WHERE r.role = 'SUPERVISOR' AND e.email IS NOT NULL
      `);
      for (const sup of supervisors.rows) {
        sendSupervisorNotifyEmail(sup.email, sup.full_name, sess, reviewDue)
          .catch((e: any) => console.warn('[evaluations] supervisor notify error:', e.message));
      }
    }).catch((e: any) => console.warn('[evaluations] post-commit supervisor check error:', e.message));

    res.status(201).json({
      message: 'บันทึกสำเร็จ',
      data: { evaluationId, sessionId, totalScore, grade },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    // 23505 = unique_violation. The SELECT-then-INSERT dup-checks above can
    // lose a race under concurrent submissions (e.g. double-click, two
    // tabs) — the UNIQUE(session_id, role) constraint is the real backstop,
    // so translate its violation into the same friendly 409 the earlier
    // check already returns, instead of a raw 500.
    if (err.code === '23505') {
      console.warn('[evaluations] ส่งซ้ำชนกัน (unique violation):', err.detail);
      return res.status(409).json({ message: 'คุณได้ส่งผลการประเมินสำหรับรายการนี้แล้ว' });
    }
    console.error('POST /api/evaluations error:', err);
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── GET /api/evaluations ──────────────────────────────────────
// Returns all sessions with summary (replaces old flat list)
// Same data exposure as /api/sessions (every supplier's score/grade) —
// gated the same way (ADMIN/SUPERVISOR only) via requireRole at the route.
async function listSessions(req: Request, res: Response) {
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
       FROM "SPES_evaluation_sessions" es
       JOIN "SPES_suppliers" s ON s.id = es.supplier_id
       ORDER BY es.created_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/all  (ADMIN only, gated via requireRole at route) ──
// Returns every evaluation in the system with evaluator info
async function listAllEvaluations(req: Request, res: Response) {
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
         emp.name           AS "evaluatorName",
         emp.emp_no         AS "evaluatorId",
         NULL               AS "evaluatorPicture"
       FROM "SPES_evaluations" ev
       JOIN "SPES_evaluation_sessions" es  ON es.id  = ev.session_id
       JOIN "SPES_suppliers"           s   ON s.id   = es.supplier_id
       JOIN "Master_Data_GCP"          emp ON emp.emp_no = ev.employee_id
       ORDER BY ev.submitted_at DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations/all error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/my ───────────────────────────────────
// Returns all evaluations submitted by the current user
async function listMyEvaluations(req: Request, res: Response) {
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
       FROM "SPES_evaluations" ev
       JOIN "SPES_evaluation_sessions" es ON es.id = ev.session_id
       JOIN "SPES_suppliers"           s  ON s.id  = es.supplier_id
       JOIN "Master_Data_GCP"          emp ON emp.emp_no = ev.employee_id
       WHERE UPPER(emp.emp_no) = UPPER($1)
       ORDER BY ev.submitted_at DESC
       LIMIT 100`,
      [req.user!.empId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations/my error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/my-tasks ─────────────────────────────
// Returns pending/overdue evaluation tasks assigned to the current user, so
// GCP/USER can see which suppliers they must evaluate instead of typing a
// vendor code blind.
//
// Matches by BOTH assigned_employee_id (the stable FK, resolved at task
// creation time) and assigned_email (frozen at that same moment) — an
// email-only match used to strand every pre-existing task the moment an
// employee's email changed, since assigned_email never gets updated
// retroactively but assigned_employee_id still correctly points at the
// same employee row.
async function myTasks(req: Request, res: Response) {
  if (!req.user!.email && !req.user!.empId) return res.json([]);
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
        (SELECT r.notes FROM "SPES_supervisor_reviews" r
          WHERE r.session_id = es.id AND r.status = 'returned'
          ORDER BY r.created_at DESC LIMIT 1)      AS "supervisorNotes"
      FROM "SPES_evaluation_tasks" et
      JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
      JOIN "SPES_suppliers" s             ON s.id = et.supplier_id
      WHERE (
        UPPER(et.assigned_employee_id) = UPPER($1)
        OR et.assigned_email = $2
      )
        AND et.status != 'completed'
        AND es.status IN ('pending', 'in_progress', 'returned')
      ORDER BY et.due_date ASC
    `, [req.user!.empId, req.user!.email]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations/my-tasks error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/my-timeline ──────────────────────────
// Unlike /my-tasks (which only lists actionable to-dos and drops a
// task the moment the user submits it), this returns every task ever
// assigned to the current user so the frontend can render a stage
// tracker (Not Started → In Process → Submitted → Approved/Returned)
// that keeps following the session after their own part is done.
async function myTimeline(req: Request, res: Response) {
  if (!req.user!.email && !req.user!.empId) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT
        et.id              AS "taskId",
        et.role,
        et.status           AS "taskStatus",
        es.id               AS "sessionId",
        es.eval_type        AS "evalType",
        es.period,
        es.status           AS "sessionStatus",
        es.created_at       AS "createdAt",
        s.vendor_code       AS "vendorCode",
        s.supplier_name     AS "supplierName",
        s.product_type      AS "productType",
        (SELECT r.notes FROM "SPES_supervisor_reviews" r
          WHERE r.session_id = es.id AND r.status = 'returned'
          ORDER BY r.created_at DESC LIMIT 1)      AS "supervisorNotes",
        COALESCE(
          (SELECT r.review_due FROM "SPES_supervisor_reviews" r WHERE r.session_id = es.id ORDER BY r.created_at DESC LIMIT 1),
          et.due_date
        ) AS "dueDate"
      FROM "SPES_evaluation_tasks" et
      JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
      JOIN "SPES_suppliers" s             ON s.id = et.supplier_id
      WHERE (
        UPPER(et.assigned_employee_id) = UPPER($1)
        OR et.assigned_email = $2
      )
      ORDER BY es.created_at DESC
      LIMIT 50
    `, [req.user!.empId, req.user!.email]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations/my-timeline error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/by-vendor/:vendorCode ────────────────
// Returns past saved evaluations for one supplier (all eval types/periods),
// newest first — feeds the "Evaluation History" widget on the Result page.
async function byVendor(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT
         ev.id              AS "evalId",
         es.eval_type       AS "evalType",
         es.period,
         ev.role,
         ev.total_score     AS "totalScore",
         ev.grade,
         ev.submitted_at    AS "submittedAt",
         es.final_score     AS "finalScore",
         es.final_grade     AS "finalGrade"
       FROM "SPES_evaluations" ev
       JOIN "SPES_evaluation_sessions" es ON es.id = ev.session_id
       JOIN "SPES_suppliers"           s  ON s.id  = es.supplier_id
       WHERE s.vendor_code = $1 AND ev.status = 'saved'
       ORDER BY ev.submitted_at DESC
       LIMIT 20`,
      [req.params.vendorCode]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/evaluations/by-vendor error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/evaluations/:id ─────────────────────────────────
// Returns a single evaluation with all its scores
async function getById(req: Request, res: Response) {
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
         ev.module_code   AS "moduleCode",
         ev.custom_module_items AS "customModuleItems",
         emp.emp_no       AS "employeeId",
         emp.name         AS "fullName",
         NULL             AS "profilePicture",
         emp.team         AS "department",
         emp.position     AS "jobTitle",
         s.vendor_code    AS "vendorCode",
         s.supplier_name  AS "supplierName",
         es.eval_type     AS "evalType",
         es.period,
         ev.product_type  AS "productType",
         es.status        AS "sessionStatus",
         es.final_score   AS "finalScore",
         es.final_grade   AS "finalGrade",
         ev.raw_scores    AS "rawScores"
       FROM "SPES_evaluations" ev
       JOIN "Master_Data_GCP" emp ON emp.emp_no = ev.employee_id
       JOIN "SPES_evaluation_sessions" es  ON es.id  = ev.session_id
       JOIN "SPES_suppliers"          s   ON s.id    = es.supplier_id
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
         COALESCE(evs.name_th_snapshot, ec.name_th)          AS "nameTh",
         COALESCE(evs.category_name_th_snapshot, cat.name_th) AS "categoryNameTh",
         evs.weight,
         evs.score,
         evs.note,
         evs.attachment_path AS "attachmentPath",
         evs.attachment_name AS "attachmentName",
         evs.weighted_score AS "weightedScore"
       FROM "SPES_evaluation_scores" evs
       JOIN "SPES_evaluation_sub_criteria"  ec  ON ec.id  = evs.criterion_id
       JOIN "SPES_evaluation_main_criteria" cat ON cat.id = ec.category_id
       WHERE evs.evaluation_id = $1
       ORDER BY ec.display_order`,
      [req.params.id]
    );

    res.json({ ...evaluation, scores: scoresResult.rows });
  } catch (err: any) {
    console.error('GET /api/evaluations/:id error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

module.exports = {
  createEvaluation, listSessions, listAllEvaluations, listMyEvaluations,
  myTasks, myTimeline, byVendor, getById, computeScoreAndGrade,
};
