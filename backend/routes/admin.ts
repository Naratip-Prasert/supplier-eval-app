'use strict';
// ============================================================
//  routes/admin.js
//  POST /api/admin/upload/pre-post   — Pre/Post eval CSV/Excel
//  POST /api/admin/upload/periodic   — Half-Year/Yearly Excel
//  GET  /api/admin/tasks             — all evaluation tasks
//  POST /api/admin/tasks/:id/remind  — manual remind
//  GET  /api/admin/batches           — upload history
// ============================================================
import type { Request, Response, NextFunction } from 'express';
type RequestWithFile = Request & { file?: { buffer: Buffer; originalname: string } };
const router = require('express').Router();
const pool   = require('../db');
const multer = require('multer');
const XLSX   = require('xlsx');
const { sendInvitationEmail } = require('../utils/emailService');

// ADMIN only middleware
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'สิทธิ์ไม่เพียงพอ (ต้องการ ADMIN)' });
  }
  next();
});

// multer: memory storage, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req: Request, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv'), ok);
  },
});

// ── Parse uploaded file → array of row objects ────────────────
function parseFile(buffer: Buffer, originalname: string): any[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

// ── Normalize column names (case-insensitive, trim spaces) ────
function norm(row: Record<string, any>, key: string): any {
  const found = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
  return found ? row[found] : null;
}

// ── Excel serial date / text date → JS Date ───────────────────
// Text dates are assumed DD/MM/YYYY (Thai/UK convention used in this
// template) — JS's native Date(string) parser assumes US MM/DD/YYYY
// order instead, which silently misreads e.g. "01/09/2025" as
// January 9th instead of September 1st (no error, just wrong date),
// throwing off every downstream due-date calculation.
function toDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return d ? new Date(d.y, d.m - 1, d.d) : null;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const [, dd, mm, yyyy] = dmy;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return isNaN(d.getTime()) ? null : d;
    }
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const [, yyyy, mm, dd] = iso;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ── Add days to a date ────────────────────────────────────────
function addDays(date: Date | string | number, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ── POST /api/admin/upload/pre-post ──────────────────────────
router.post('/upload/pre-post', upload.single('file'), async (req: RequestWithFile, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'กรุณาแนบไฟล์' });

  let rows;
  try {
    rows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e: any) {
    return res.status(400).json({ message: 'ไม่สามารถอ่านไฟล์ได้', error: e.message });
  }

  if (rows.length === 0) return res.status(400).json({ message: 'ไฟล์ไม่มีข้อมูล' });

  const client = await pool.connect();
  // Declared here (not inside try) so the catch block below can still see
  // it — a batchId created before a later row throws must still be marked
  // 'error' instead of staying stuck at 'processing' forever.
  let batchId;
  try {
    await client.query('BEGIN');

    // Get uploader employee id
    const uploaderResult = await client.query(
      `SELECT id FROM employees WHERE employee_id = $1`, [req.user!.empId]
    );
    const uploaderId = uploaderResult.rows[0]?.id || null;

    // Create batch record
    const batchResult = await client.query(`
      INSERT INTO supplier_upload_batches (uploaded_by, batch_type, filename, row_count, status)
      VALUES ($1, 'pre_post_eval', $2, $3, 'processing') RETURNING id
    `, [uploaderId, req.file.originalname, rows.length]);
    batchId = batchResult.rows[0].id;

    const summary: { processed: number; skipped: number; pre_eval: number; post_eval: number; warnings: string[] } =
      { processed: 0, skipped: 0, pre_eval: 0, post_eval: 0, warnings: [] };
    const invitationTasks: any[] = []; // collect for email after commit

    for (const row of rows) {
      const taxId        = String(norm(row, 'TAX_ID') || '').trim();
      const supplierName = String(norm(row, 'Supplier Name') || '').trim();
      const category     = String(norm(row, 'Category') || '').trim();
      const fnOwner      = String(norm(row, 'Function_Owner') || '').trim();
      const jobValueRaw  = norm(row, 'Job Value THB');
      const jobValue     = jobValueRaw != null ? parseFloat(jobValueRaw) : null;
      const ptaRaw       = norm(row, 'PTA Approve Date');
      const ptaDate      = toDate(ptaRaw);
      const buyerName    = String(norm(row, 'Buyer Name') || '').trim();
      const buyerEmail   = String(norm(row, 'Buyer Email') || '').trim().toLowerCase();
      const evalName     = String(norm(row, 'Evaluator Name') || '').trim();
      const evalEmail    = String(norm(row, 'Evaluator Email') || '').trim().toLowerCase();

      if (!taxId && !supplierName) { summary.skipped++; continue; }
      if (!jobValue || jobValue < 1000000) { summary.skipped++; continue; }

      // Determine eval type
      const evalType = ptaDate ? 'post_eval' : 'pre_eval';

      // Upsert supplier
      const supUpsert = await client.query(`
        INSERT INTO suppliers (vendor_code, supplier_name, product_type, tax_id, category,
          function_owner, job_value_thb, pta_approve_date, buyer_name, buyer_email,
          evaluator_name, evaluator_email)
        VALUES ($1, $2, 'both', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (vendor_code) DO UPDATE SET
          supplier_name   = EXCLUDED.supplier_name,
          category        = EXCLUDED.category,
          function_owner  = EXCLUDED.function_owner,
          job_value_thb   = EXCLUDED.job_value_thb,
          pta_approve_date = COALESCE(EXCLUDED.pta_approve_date, suppliers.pta_approve_date),
          buyer_name      = EXCLUDED.buyer_name,
          buyer_email     = EXCLUDED.buyer_email,
          evaluator_name  = EXCLUDED.evaluator_name,
          evaluator_email = EXCLUDED.evaluator_email,
          updated_at      = NOW()
        RETURNING id, vendor_code, supplier_name
      `, [taxId || supplierName.substring(0, 50), supplierName, taxId || null,
          category || null, fnOwner || null, jobValue, ptaDate || null,
          buyerName || null, buyerEmail || null, evalName || null, evalEmail || null]);

      const supplier = supUpsert.rows[0];

      // Calculate due_date
      let dueDate;
      if (evalType === 'pre_eval') {
        dueDate = addDays(new Date(), 30);
      } else {
        dueDate = addDays(ptaDate!, 90);
      }

      const period = evalType === 'pre_eval' ? 'New Supplier / ผู้ขายรายใหม่' : 'Post 90 Days';

      // Skip if this supplier already has an unfinished round for this exact
      // eval_type+period — re-uploading the same file (or overlapping rows
      // across uploads) used to silently spawn a second parallel session +
      // task pair, letting both get evaluated independently with no warning.
      const existingOpen = await client.query(`
        SELECT id FROM evaluation_sessions
         WHERE supplier_id = $1 AND eval_type = $2 AND period = $3 AND status != 'completed'
         LIMIT 1
      `, [supplier.id, evalType, period]);
      if (existingOpen.rows.length > 0) {
        summary.skipped++;
        summary.warnings.push(`"${supplierName}" มีรอบประเมิน (${period}) ที่ยังไม่เสร็จสิ้นอยู่แล้ว — ข้ามแถวนี้เพื่อไม่สร้างงานซ้ำ`);
        continue;
      }

      // Create evaluation session
      const sessionResult = await client.query(`
        INSERT INTO evaluation_sessions (supplier_id, eval_type, period, status, initiated_by)
        VALUES ($1, $2, $3, 'pending', $4) RETURNING id
      `, [supplier.id, evalType, period, uploaderId]);
      const sessionId = sessionResult.rows[0].id;

      // Match buyer (GCP) and evaluator (USER) by email
      const gcpMatch = buyerEmail
        ? await client.query(`SELECT id, full_name, email FROM employees WHERE email = $1 AND is_active = TRUE LIMIT 1`, [buyerEmail])
        : { rows: [] };
      const buMatch = evalEmail
        ? await client.query(`SELECT id, full_name, email FROM employees WHERE email = $1 AND is_active = TRUE LIMIT 1`, [evalEmail])
        : { rows: [] };

      if (buyerEmail && gcpMatch.rows.length === 0) {
        summary.warnings.push(`ไม่พบ Buyer email "${buyerEmail}" ในระบบ`);
      }
      if (evalEmail && buMatch.rows.length === 0) {
        summary.warnings.push(`ไม่พบ Evaluator email "${evalEmail}" ในระบบ`);
      }
      // Same person can't hold both GCP and USER tasks for the same row —
      // it silently breaks the supervisor approval trigger later (it needs
      // one evaluation each from a distinct USER role and a distinct GCP role).
      if (buyerEmail && evalEmail && buyerEmail === evalEmail) {
        summary.warnings.push(`Buyer Email และ Evaluator Email เป็นคนเดียวกัน ("${buyerEmail}") สำหรับ "${supplierName}" — งานนี้จะไม่เข้าคิว supervisor ได้ ต้องใช้คนละคน`);
      }

      // Create tasks for GCP and USER
      const taskRows = [
        { role: 'GCP', email: buyerEmail, name: buyerName, empId: gcpMatch.rows[0]?.id || null, empName: gcpMatch.rows[0]?.full_name || buyerName },
        { role: 'USER', email: evalEmail,  name: evalName,  empId: buMatch.rows[0]?.id  || null, empName: buMatch.rows[0]?.full_name  || evalName  },
      ];

      for (const t of taskRows) {
        if (!t.email) continue;
        const taskResult = await client.query(`
          INSERT INTO evaluation_tasks
            (batch_id, session_id, supplier_id, assigned_employee_id, assigned_email, assigned_name, role, due_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id
        `, [batchId, sessionId, supplier.id, t.empId, t.email, t.empName, t.role, dueDate]);

        // For pre_eval: send invitation immediately
        // For post_eval: cron will send 7 days before due
        if (evalType === 'pre_eval') {
          invitationTasks.push({
            id: taskResult.rows[0].id,
            assigned_email: t.email,
            assigned_name: t.empName,
            due_date: dueDate,
            eval_type_label: 'Pre-Evaluation (Supplier ใหม่)',
            supplier,
          });
        }
      }

      evalType === 'pre_eval' ? summary.pre_eval++ : summary.post_eval++;
      summary.processed++;
    }

    // Update batch status
    await client.query(`
      UPDATE supplier_upload_batches SET status = 'done', row_count = $1 WHERE id = $2
    `, [summary.processed, batchId]);

    await client.query('COMMIT');

    // Send invitation emails after commit (fire-and-forget)
    for (const task of invitationTasks) {
      sendInvitationEmail(task, task.supplier)
        .then(() => pool.query(`UPDATE evaluation_tasks SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]))
        .catch((e: any) => console.warn('[admin upload] invitation email error:', e.message));
    }

    console.log(`[admin] upload pre-post: ${summary.processed} processed, ${summary.skipped} skipped`);
    res.status(201).json({ message: 'อัพโหลดสำเร็จ', batchId, ...summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (typeof batchId !== 'undefined') {
      await pool.query(`UPDATE supplier_upload_batches SET status='error', error_msg=$1 WHERE id=$2`,
        [err.message, batchId]).catch(() => {});
    }
    console.error('POST /api/admin/upload/pre-post error:', err);
    res.status(500).json({ message: 'อัพโหลดไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/upload/periodic ──────────────────────────
router.post('/upload/periodic', upload.single('file'), async (req: RequestWithFile, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'กรุณาแนบไฟล์' });
  const { evalType } = req.body; // 'half_year' | 'yearly'
  if (!['half_year', 'yearly'].includes(evalType)) {
    return res.status(400).json({ message: 'evalType ต้องเป็น half_year หรือ yearly' });
  }

  let rows;
  try {
    rows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e: any) {
    return res.status(400).json({ message: 'ไม่สามารถอ่านไฟล์ได้', error: e.message });
  }

  if (rows.length === 0) return res.status(400).json({ message: 'ไฟล์ไม่มีข้อมูล' });

  const client = await pool.connect();
  // Declared here (not inside try) so the catch block below can still see
  // it — a batchId created before a later row throws must still be marked
  // 'error' instead of staying stuck at 'processing' forever.
  let batchId;
  try {
    await client.query('BEGIN');

    const uploaderResult = await client.query(
      `SELECT id FROM employees WHERE employee_id = $1`, [req.user!.empId]
    );
    const uploaderId = uploaderResult.rows[0]?.id || null;

    const batchResult = await client.query(`
      INSERT INTO supplier_upload_batches (uploaded_by, batch_type, filename, row_count, status)
      VALUES ($1, $2, $3, $4, 'processing') RETURNING id
    `, [uploaderId, evalType, req.file.originalname, rows.length]);
    batchId = batchResult.rows[0].id;

    const dueDate = addDays(new Date(), 7);
    // Tag with the calendar year so the SAME supplier's half_year/yearly
    // round next year is a genuinely new period, not a collision with this
    // year's round under the open-session unique index — without a year
    // marker, "Half-Year" is indistinguishable across cycles once one round
    // is completed, which previously let two unrelated rounds end up
    // resolved as if they were "the same" evaluation period.
    const cycleYear = new Date().getFullYear();
    const period  = evalType === 'half_year' ? `Half-Year ${cycleYear}` : `Yearly ${cycleYear}`;
    const summary: { processed: number; skipped: number; warnings: string[] } =
      { processed: 0, skipped: 0, warnings: [] };
    const invitationTasks: any[] = [];

    for (const row of rows) {
      const taxId        = String(norm(row, 'TAX_ID') || '').trim();
      const supplierName = String(norm(row, 'Supplier Name') || '').trim();
      const buyerName    = String(norm(row, 'Buyer Name') || '').trim();
      const buyerEmail   = String(norm(row, 'Buyer Email') || '').trim().toLowerCase();
      const evalName     = String(norm(row, 'Evaluator Name') || '').trim();
      const evalEmail    = String(norm(row, 'Evaluator Email') || '').trim().toLowerCase();

      if (!taxId && !supplierName) { summary.skipped++; continue; }

      // Find existing supplier by tax_id or name
      const supResult = await client.query(`
        SELECT id, vendor_code, supplier_name FROM suppliers
         WHERE (tax_id = $1 OR supplier_name ILIKE $2) AND is_active = TRUE
         LIMIT 1
      `, [taxId || '', supplierName]);

      if (supResult.rows.length === 0) {
        summary.warnings.push(`ไม่พบ supplier "${supplierName || taxId}" ในระบบ`);
        summary.skipped++;
        continue;
      }
      const supplier = supResult.rows[0];

      // Optionally update buyer/evaluator info
      if (buyerEmail || evalEmail) {
        await client.query(`
          UPDATE suppliers SET
            buyer_name = COALESCE($1, buyer_name),
            buyer_email = COALESCE($2, buyer_email),
            evaluator_name = COALESCE($3, evaluator_name),
            evaluator_email = COALESCE($4, evaluator_email)
          WHERE id = $5
        `, [buyerName || null, buyerEmail || null, evalName || null, evalEmail || null, supplier.id]);
      }

      // Skip if this supplier already has an unfinished round for this exact
      // eval_type+period — see same check in /upload/pre-post for why.
      const existingOpen = await client.query(`
        SELECT id FROM evaluation_sessions
         WHERE supplier_id = $1 AND eval_type = $2 AND period = $3 AND status != 'completed'
         LIMIT 1
      `, [supplier.id, evalType, period]);
      if (existingOpen.rows.length > 0) {
        summary.skipped++;
        summary.warnings.push(`"${supplierName || supplier.supplier_name}" มีรอบประเมิน (${period}) ที่ยังไม่เสร็จสิ้นอยู่แล้ว — ข้ามแถวนี้เพื่อไม่สร้างงานซ้ำ`);
        continue;
      }

      const sessionResult = await client.query(`
        INSERT INTO evaluation_sessions (supplier_id, eval_type, period, status, initiated_by)
        VALUES ($1, $2, $3, 'pending', $4) RETURNING id
      `, [supplier.id, evalType, period, uploaderId]);
      const sessionId = sessionResult.rows[0].id;

      const gcpMatch = buyerEmail
        ? await client.query(`SELECT id, full_name FROM employees WHERE email = $1 AND is_active = TRUE LIMIT 1`, [buyerEmail])
        : { rows: [] };
      const buMatch = evalEmail
        ? await client.query(`SELECT id, full_name FROM employees WHERE email = $1 AND is_active = TRUE LIMIT 1`, [evalEmail])
        : { rows: [] };

      if (buyerEmail && gcpMatch.rows.length === 0) summary.warnings.push(`ไม่พบ Buyer email "${buyerEmail}"`);
      if (evalEmail  && buMatch.rows.length === 0)  summary.warnings.push(`ไม่พบ Evaluator email "${evalEmail}"`);
      if (buyerEmail && evalEmail && buyerEmail === evalEmail) {
        summary.warnings.push(`Buyer Email และ Evaluator Email เป็นคนเดียวกัน ("${buyerEmail}") สำหรับ "${supplierName}" — งานนี้จะไม่เข้าคิว supervisor ได้ ต้องใช้คนละคน`);
      }

      const taskRows = [
        { role: 'GCP', email: buyerEmail, name: buyerName, empId: gcpMatch.rows[0]?.id || null, empName: gcpMatch.rows[0]?.full_name || buyerName },
        { role: 'USER', email: evalEmail,  name: evalName,  empId: buMatch.rows[0]?.id  || null, empName: buMatch.rows[0]?.full_name  || evalName  },
      ];

      for (const t of taskRows) {
        if (!t.email) continue;
        const taskResult = await client.query(`
          INSERT INTO evaluation_tasks
            (batch_id, session_id, supplier_id, assigned_employee_id, assigned_email, assigned_name, role, due_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id
        `, [batchId, sessionId, supplier.id, t.empId, t.email, t.empName, t.role, dueDate]);

        invitationTasks.push({
          id: taskResult.rows[0].id,
          assigned_email: t.email,
          assigned_name: t.empName,
          due_date: dueDate,
          eval_type_label: evalType === 'half_year' ? 'Half-Year Evaluation' : 'Yearly Evaluation',
          supplier,
        });
      }

      summary.processed++;
    }

    await client.query(`
      UPDATE supplier_upload_batches SET status = 'done', row_count = $1 WHERE id = $2
    `, [summary.processed, batchId]);

    await client.query('COMMIT');

    for (const task of invitationTasks) {
      sendInvitationEmail(task, task.supplier)
        .then(() => pool.query(`UPDATE evaluation_tasks SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]))
        .catch((e: any) => console.warn('[admin upload periodic] invitation email error:', e.message));
    }

    console.log(`[admin] upload periodic (${evalType}): ${summary.processed} processed`);
    res.status(201).json({ message: 'อัพโหลดสำเร็จ', batchId, ...summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (typeof batchId !== 'undefined') {
      await pool.query(`UPDATE supplier_upload_batches SET status='error', error_msg=$1 WHERE id=$2`,
        [err.message, batchId]).catch(() => {});
    }
    console.error('POST /api/admin/upload/periodic error:', err);
    res.status(500).json({ message: 'อัพโหลดไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/admin/tasks ──────────────────────────────────────
router.get('/tasks', async (req: Request, res: Response) => {
  const { status, role, vendorCode } = req.query;

  try {
    const result = await pool.query(`
      SELECT
        et.id,
        et.role,
        et.assigned_email   AS "assignedEmail",
        et.assigned_name    AS "assignedName",
        et.due_date         AS "dueDate",
        et.status,
        et.invitation_sent_at  AS "invitationSentAt",
        et.reminder_sent_at    AS "reminderSentAt",
        et.overdue_sent_at     AS "overdueSentAt",
        et.thankyou_sent_at    AS "thankyouSentAt",
        et.created_at          AS "createdAt",
        s.vendor_code          AS "vendorCode",
        s.tax_id               AS "taxId",
        s.supplier_name        AS "supplierName",
        es.id                  AS "sessionId",
        es.eval_type           AS "evalType",
        es.status              AS "sessionStatus"
      FROM evaluation_tasks et
      JOIN suppliers s           ON s.id  = et.supplier_id
      JOIN evaluation_sessions es ON es.id = et.session_id
      WHERE ($1::text IS NULL OR et.status = $1)
        AND ($2::text IS NULL OR et.role = $2)
        AND ($3::text IS NULL OR s.vendor_code = $3)
      ORDER BY et.due_date ASC
      LIMIT 500
    `, [status || null, role || null, vendorCode || null]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/tasks error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── POST /api/admin/tasks/:id/remind ─────────────────────────
router.post('/tasks/:id/remind', async (req: Request, res: Response) => {
  try {
    const taskResult = await pool.query(`
      SELECT et.*, s.supplier_name, s.vendor_code
        FROM evaluation_tasks et
        JOIN suppliers s ON s.id = et.supplier_id
       WHERE et.id = $1
    `, [req.params.id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ task' });
    }
    const task = taskResult.rows[0];
    if (task.status === 'completed') {
      return res.status(400).json({ message: 'task นี้ประเมินเสร็จแล้ว' });
    }

    const { sendReminderEmail } = require('../utils/emailService');
    await sendReminderEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
    await pool.query(`UPDATE evaluation_tasks SET reminder_sent_at = NOW() WHERE id = $1`, [req.params.id]);

    res.json({ message: 'ส่ง reminder สำเร็จ', email: task.assigned_email });
  } catch (err: any) {
    console.error('POST /api/admin/tasks/:id/remind error:', err);
    res.status(500).json({ message: 'ส่ง reminder ไม่สำเร็จ', error: err.message });
  }
});

// ── PATCH /api/admin/tasks/:id ────────────────────────────────
// Edit the assignee (by email) and/or due_date of a task.
// The name is never taken from client input when the email matches
// a real employee — it's always pulled from that employee's record,
// so assigned_name can never drift out of sync with assigned_email.
// `assignedName` is only used as a fallback label for an email that
// doesn't match anyone in the system (ad-hoc external recipient).
// Re-arms reminder/overdue emails when due_date changes, and
// re-arms the full invite cycle when the assignee changes.
router.patch('/tasks/:id', async (req: Request, res: Response) => {
  const { assignedName, assignedEmail, dueDate } = req.body;

  try {
    const current = await pool.query(`SELECT * FROM evaluation_tasks WHERE id = $1`, [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ task' });
    }
    const task = current.rows[0];
    if (task.status === 'completed') {
      return res.status(400).json({ message: 'ไม่สามารถแก้ไข task ที่ประเมินเสร็จแล้ว' });
    }

    const emailChanged = assignedEmail && assignedEmail.trim().toLowerCase() !== task.assigned_email;
    const dueChanged    = dueDate && new Date(dueDate).toISOString().slice(0, 10) !== new Date(task.due_date).toISOString().slice(0, 10);

    let assignedEmployeeId = task.assigned_employee_id;
    let resolvedName       = assignedName || task.assigned_name;
    const finalEmail       = assignedEmail ? assignedEmail.trim().toLowerCase() : task.assigned_email;

    if (emailChanged) {
      const empMatch = await pool.query(
        `SELECT id, full_name FROM employees WHERE email = $1 AND is_active = TRUE LIMIT 1`,
        [finalEmail]
      );
      if (empMatch.rows.length > 0) {
        assignedEmployeeId = empMatch.rows[0].id;
        resolvedName       = empMatch.rows[0].full_name; // always trust the system's record, ignore client name
      } else {
        assignedEmployeeId = null; // external/ad-hoc recipient not in the system
      }

      // Guard: the same person can't end up holding both the GCP and the
      // USER/evaluator task for the same evaluation — if they did, every
      // submission they make resolves to their own single account role,
      // so the session can never collect both a USER and a GCP evaluation
      // and will sit invisible to Supervisor forever.
      const collision = await pool.query(`
        SELECT role FROM evaluation_tasks
         WHERE session_id = $1 AND id != $2 AND role != $3
           AND (assigned_email = $4 OR ($5::uuid IS NOT NULL AND assigned_employee_id = $5))
      `, [task.session_id, task.id, task.role, finalEmail, assignedEmployeeId]);
      if (collision.rows.length > 0) {
        return res.status(400).json({
          message: `ไม่สามารถมอบหมายได้ — email นี้ถูกมอบหมายเป็น ${collision.rows[0].role} ของการประเมินนี้อยู่แล้ว คนคนเดียวไม่สามารถเป็นทั้ง GCP และ USER ของ session เดียวกันได้ (จะทำให้ supervisor ไม่เห็นรายการนี้)`,
        });
      }
    }

    const result = await pool.query(`
      UPDATE evaluation_tasks SET
        assigned_name        = $1,
        assigned_email        = $2,
        assigned_employee_id  = $3,
        due_date              = COALESCE($4, due_date),
        status                = CASE WHEN status = 'overdue' THEN 'pending' ELSE status END,
        invitation_sent_at    = CASE WHEN $5 THEN NULL ELSE invitation_sent_at END,
        reminder_sent_at      = CASE WHEN $5 OR $6 THEN NULL ELSE reminder_sent_at END,
        overdue_sent_at       = CASE WHEN $5 OR $6 THEN NULL ELSE overdue_sent_at END,
        thankyou_sent_at      = CASE WHEN $5 THEN NULL ELSE thankyou_sent_at END
      WHERE id = $7
      RETURNING id
    `, [
      resolvedName || null,
      finalEmail,
      assignedEmployeeId,
      dueDate || null,
      emailChanged,
      dueChanged,
      req.params.id,
    ]);

    console.log(`[admin] แก้ไข task ${req.params.id} โดย ${req.user!.empId}`);
    res.json({ message: 'แก้ไขสำเร็จ', id: result.rows[0].id });
  } catch (err: any) {
    console.error('PATCH /api/admin/tasks/:id error:', err);
    res.status(500).json({ message: 'แก้ไขไม่สำเร็จ', error: err.message });
  }
});

// ── DELETE /api/admin/sessions/:sessionId ─────────────────────
// Removes a mistakenly-uploaded evaluation entirely (its tasks +
// session). Blocked once it's gone to supervisor review or beyond,
// so finished work can't be casually wiped — use this only to undo
// a bad upload before anyone has acted on it.
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `SELECT status FROM evaluation_sessions WHERE id = $1`,
      [req.params.sessionId]
    );
    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'ไม่พบรายการประเมินนี้' });
    }
    const { status } = sessionResult.rows[0];
    if (!['pending', 'in_progress'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ไม่สามารถลบรายการที่เข้าสู่การอนุมัติหรือเสร็จสิ้นแล้วได้' });
    }

    await client.query(`DELETE FROM evaluation_tasks WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM supervisor_reviews WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM evaluations WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM evaluation_sessions WHERE id = $1`, [req.params.sessionId]);

    await client.query('COMMIT');
    console.log(`[admin] ลบรายการประเมิน session ${req.params.sessionId} โดย ${req.user!.empId}`);
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/admin/sessions/:sessionId error:', err);
    res.status(500).json({ message: 'ลบไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/tasks/remind-all ─────────────────────────
// Bulk-send reminder emails. With no body, targets every active
// (non-completed) task with an assigned email. Pass `taskIds` to
// scope it to a specific filtered/visible set instead.
router.post('/tasks/remind-all', async (req: Request, res: Response) => {
  const { taskIds } = req.body || {};
  try {
    const taskResult = await pool.query(`
      SELECT et.*, s.supplier_name, s.vendor_code
        FROM evaluation_tasks et
        JOIN suppliers s ON s.id = et.supplier_id
       WHERE et.status != 'completed' AND et.assigned_email IS NOT NULL
         AND ($1::uuid[] IS NULL OR et.id = ANY($1::uuid[]))
    `, [Array.isArray(taskIds) && taskIds.length > 0 ? taskIds : null]);

    const { sendReminderEmail } = require('../utils/emailService');
    let sent = 0, failed = 0;
    for (const task of taskResult.rows) {
      try {
        await sendReminderEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
        await pool.query(`UPDATE evaluation_tasks SET reminder_sent_at = NOW() WHERE id = $1`, [task.id]);
        sent++;
      } catch (e: any) {
        failed++;
        console.warn('[admin remind-all] failed for task', task.id, e.message);
      }
    }

    console.log(`[admin] remind-all: ${sent} ส่งสำเร็จ, ${failed} ล้มเหลว โดย ${req.user!.empId}`);
    res.json({ message: 'ส่ง reminder ทั้งหมดสำเร็จ', sent, failed, total: taskResult.rows.length });
  } catch (err: any) {
    console.error('POST /api/admin/tasks/remind-all error:', err);
    res.status(500).json({ message: 'ส่ง reminder ทั้งหมดไม่สำเร็จ', error: err.message });
  }
});

// ── POST /api/admin/sessions/bulk-delete ──────────────────────
// Same guard as DELETE /sessions/:id, applied to many sessions at
// once. Sessions already past pending/in_progress (i.e. completed
// or in review) are skipped rather than erroring the whole batch,
// so a mixed selection still deletes what it safely can.
router.post('/sessions/bulk-delete', async (req: Request, res: Response) => {
  const { sessionIds } = req.body || {};
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.status(400).json({ message: 'กรุณาระบุ sessionIds' });
  }

  const deleted = [];
  const skipped = [];
  for (const sessionId of sessionIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(
        `SELECT status FROM evaluation_sessions WHERE id = $1`, [sessionId]
      );
      if (sessionResult.rows.length === 0 || !['pending', 'in_progress'].includes(sessionResult.rows[0].status)) {
        await client.query('ROLLBACK');
        skipped.push(sessionId);
        continue;
      }
      await client.query(`DELETE FROM evaluation_tasks WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM supervisor_reviews WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM evaluations WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM evaluation_sessions WHERE id = $1`, [sessionId]);
      await client.query('COMMIT');
      deleted.push(sessionId);
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('bulk-delete session error:', sessionId, err.message);
      skipped.push(sessionId);
    } finally {
      client.release();
    }
  }

  console.log(`[admin] bulk delete: ${deleted.length} ลบ, ${skipped.length} ข้าม โดย ${req.user!.empId}`);
  res.json({ message: 'ดำเนินการลบหลายรายการสำเร็จ', deleted, skipped });
});

// ── GET /api/admin/batches ────────────────────────────────────
router.get('/batches', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.batch_type AS "batchType", b.filename,
        b.row_count AS "rowCount", b.status,
        b.error_msg AS "errorMsg", b.created_at AS "createdAt",
        emp.full_name AS "uploadedBy"
      FROM supplier_upload_batches b
      LEFT JOIN employees emp ON emp.id = b.uploaded_by
      ORDER BY b.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/batches error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/admin/service-evaluations ─────────────────────────
// Per-evaluation detail for cross-eval #3/#4 (database/CROSS_EVALUATION_SPEC.md)
// — one row per service_evaluations record, not aggregated, so an admin can
// see exactly which round/date/evaluator each score came from.
router.get('/service-evaluations', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        se.id,
        sessionSup.supplier_name AS "supplierName",
        target.employee_id AS "targetEmpCode", target.full_name AS "targetFullName", target.role AS "targetRole",
        CASE WHEN se.direction LIKE 'supplier_%' THEN sup.supplier_name ELSE evalEmp.full_name END AS "evaluatorName",
        CASE WHEN se.direction LIKE 'supplier_%' THEN sup.vendor_code ELSE evalEmp.employee_id END AS "evaluatorCode",
        CASE WHEN se.direction LIKE 'supplier_%' THEN 'Supplier' ELSE 'User' END AS "evaluatorRoleLabel",
        es.period,
        se.submitted_at AS "submittedAt",
        se.total_score AS "totalScore",
        se.grade
      FROM service_evaluations se
      JOIN employees target ON target.id = se.target_employee_id
      JOIN evaluation_sessions es ON es.id = se.session_id
      JOIN suppliers sessionSup ON sessionSup.id = es.supplier_id
      LEFT JOIN suppliers sup ON sup.id = se.evaluator_supplier_id
      LEFT JOIN employees evalEmp ON evalEmp.id = se.evaluator_employee_id
      ORDER BY se.submitted_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/service-evaluations error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
