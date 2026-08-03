'use strict';
// ============================================================
//  controllers/admin/admin.controller.ts
//  POST /api/admin/upload/pre-post   — Pre/Post eval CSV/Excel
//  POST /api/admin/upload/periodic   — Half-Year/Yearly Excel
//  GET  /api/admin/tasks             — all evaluation tasks
//  POST /api/admin/tasks/:id/remind  — manual remind
//  GET  /api/admin/batches           — upload history
// ============================================================
import type { Request, Response } from 'express';
type RequestWithFile = Request & { file?: { buffer: Buffer; originalname: string } };
const pool   = require('../../db');
const XLSX   = require('xlsx');
const { sendInvitationEmail, sendReminderEmail, getEmailSetting } = require('../../utils/emailService');

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
async function uploadPrePost(req: RequestWithFile, res: Response) {
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
      `SELECT emp_no AS id FROM "Master_Data_All" WHERE UPPER(emp_no) = UPPER($1)`, [req.user!.empId]
    );
    const uploaderId = uploaderResult.rows[0]?.id || null;

    // Create batch record
    const batchResult = await client.query(`
      INSERT INTO "SPES_supplier_upload_batches" (uploaded_by, batch_type, filename, row_count, status)
      VALUES ($1, 'pre_post_eval', $2, $3, 'processing') RETURNING id
    `, [uploaderId, req.file.originalname, rows.length]);
    batchId = batchResult.rows[0].id;

    const summary: { processed: number; skipped: number; pre_eval: number; post_eval: number; warnings: string[] } =
      { processed: 0, skipped: 0, pre_eval: 0, post_eval: 0, warnings: [] };
    const invitationTasks: any[] = []; // collect for email after commit

    const preEvalDueDays  = await getEmailSetting('pre_eval_due_days');
    const postEvalDueDays = await getEmailSetting('post_eval_due_days');

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
        INSERT INTO "SPES_suppliers" (vendor_code, supplier_name, product_type, tax_id, category,
          function_owner, job_value_thb, pta_approve_date, buyer_name, buyer_email,
          evaluator_name, evaluator_email)
        VALUES ($1, $2, 'both', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (vendor_code) DO UPDATE SET
          supplier_name   = EXCLUDED.supplier_name,
          category        = EXCLUDED.category,
          function_owner  = EXCLUDED.function_owner,
          job_value_thb   = EXCLUDED.job_value_thb,
          pta_approve_date = COALESCE(EXCLUDED.pta_approve_date, "SPES_suppliers".pta_approve_date),
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
        dueDate = addDays(new Date(), preEvalDueDays);
      } else {
        dueDate = addDays(ptaDate!, postEvalDueDays);
      }

      const period = evalType === 'pre_eval' ? 'New Supplier / ผู้ขายรายใหม่' : 'Post 90 Days';

      // Skip if this supplier already has an unfinished round for this exact
      // eval_type+period — re-uploading the same file (or overlapping rows
      // across uploads) used to silently spawn a second parallel session +
      // task pair, letting both get evaluated independently with no warning.
      const existingOpen = await client.query(`
        SELECT id FROM "SPES_evaluation_sessions"
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
        INSERT INTO "SPES_evaluation_sessions" (supplier_id, eval_type, period, status, initiated_by)
        VALUES ($1, $2, $3, 'pending', $4) RETURNING id
      `, [supplier.id, evalType, period, uploaderId]);
      const sessionId = sessionResult.rows[0].id;

      // Match buyer (GCP) and evaluator (USER) by email
      const gcpMatch = buyerEmail
        ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [buyerEmail])
        : { rows: [] };
      const buMatch = evalEmail
        ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [evalEmail])
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
          INSERT INTO "SPES_evaluation_tasks"
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
      UPDATE "SPES_supplier_upload_batches" SET status = 'done', row_count = $1 WHERE id = $2
    `, [summary.processed, batchId]);

    await client.query('COMMIT');

    // Send invitation emails after commit (fire-and-forget)
    for (const task of invitationTasks) {
      sendInvitationEmail(task, task.supplier)
        .then(() => pool.query(`UPDATE "SPES_evaluation_tasks" SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]))
        .catch((e: any) => console.warn('[admin upload] invitation email error:', e.message));
    }

    console.log(`[admin] upload pre-post: ${summary.processed} processed, ${summary.skipped} skipped`);
    res.status(201).json({ message: 'อัพโหลดสำเร็จ', batchId, ...summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (typeof batchId !== 'undefined') {
      await pool.query(`UPDATE "SPES_supplier_upload_batches" SET status='error', error_msg=$1 WHERE id=$2`,
        [err.message, batchId]).catch(() => {});
    }
    console.error('POST /api/admin/upload/pre-post error:', err);
    res.status(500).json({ message: 'อัพโหลดไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── POST /api/admin/upload/periodic ──────────────────────────
async function uploadPeriodic(req: RequestWithFile, res: Response) {
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
      `SELECT emp_no AS id FROM "Master_Data_All" WHERE UPPER(emp_no) = UPPER($1)`, [req.user!.empId]
    );
    const uploaderId = uploaderResult.rows[0]?.id || null;

    const batchResult = await client.query(`
      INSERT INTO "SPES_supplier_upload_batches" (uploaded_by, batch_type, filename, row_count, status)
      VALUES ($1, $2, $3, $4, 'processing') RETURNING id
    `, [uploaderId, evalType, req.file.originalname, rows.length]);
    batchId = batchResult.rows[0].id;

    const periodicDueDays = await getEmailSetting('periodic_due_days');
    const dueDate = addDays(new Date(), periodicDueDays);
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
        SELECT id, vendor_code, supplier_name FROM "SPES_suppliers"
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
          UPDATE "SPES_suppliers" SET
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
        SELECT id FROM "SPES_evaluation_sessions"
         WHERE supplier_id = $1 AND eval_type = $2 AND period = $3 AND status != 'completed'
         LIMIT 1
      `, [supplier.id, evalType, period]);
      if (existingOpen.rows.length > 0) {
        summary.skipped++;
        summary.warnings.push(`"${supplierName || supplier.supplier_name}" มีรอบประเมิน (${period}) ที่ยังไม่เสร็จสิ้นอยู่แล้ว — ข้ามแถวนี้เพื่อไม่สร้างงานซ้ำ`);
        continue;
      }

      const sessionResult = await client.query(`
        INSERT INTO "SPES_evaluation_sessions" (supplier_id, eval_type, period, status, initiated_by)
        VALUES ($1, $2, $3, 'pending', $4) RETURNING id
      `, [supplier.id, evalType, period, uploaderId]);
      const sessionId = sessionResult.rows[0].id;

      const gcpMatch = buyerEmail
        ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [buyerEmail])
        : { rows: [] };
      const buMatch = evalEmail
        ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [evalEmail])
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
          INSERT INTO "SPES_evaluation_tasks"
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
      UPDATE "SPES_supplier_upload_batches" SET status = 'done', row_count = $1 WHERE id = $2
    `, [summary.processed, batchId]);

    await client.query('COMMIT');

    for (const task of invitationTasks) {
      sendInvitationEmail(task, task.supplier)
        .then(() => pool.query(`UPDATE "SPES_evaluation_tasks" SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]))
        .catch((e: any) => console.warn('[admin upload periodic] invitation email error:', e.message));
    }

    console.log(`[admin] upload periodic (${evalType}): ${summary.processed} processed`);
    res.status(201).json({ message: 'อัพโหลดสำเร็จ', batchId, ...summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (typeof batchId !== 'undefined') {
      await pool.query(`UPDATE "SPES_supplier_upload_batches" SET status='error', error_msg=$1 WHERE id=$2`,
        [err.message, batchId]).catch(() => {});
    }
    console.error('POST /api/admin/upload/periodic error:', err);
    res.status(500).json({ message: 'อัพโหลดไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── POST /api/admin/ad-hoc-evaluation ────────────────────────
// Manual, single-supplier evaluation round for a complaint/incident case —
// unlike the batch upload endpoints above, this isn't driven by an Excel
// row: an ADMIN picks one existing supplier and types a reason, and tasks
// go out to whichever of buyer_email/evaluator_email the supplier already
// has on file (same contacts the periodic-upload flow uses). No batch_id
// (evaluation_tasks.batch_id is nullable) since there's no upload batch
// behind it. Scored against POST_CRITERIA (see isPostTrack in
// evaluations.controller.ts / isPostEvalType in frontend/constants.ts) —
// an ad-hoc case only ever fires for a supplier already in active service.
async function createAdHocEvaluation(req: Request, res: Response) {
  const { vendorCode, reason, dueInDays } = req.body;
  if (!vendorCode || !String(vendorCode).trim()) {
    return res.status(400).json({ message: 'กรุณาระบุรหัส Supplier', field: 'vendorCode' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ message: 'กรุณาระบุเหตุผล (complaint/incident)', field: 'reason' });
  }
  const days = Number.isFinite(Number(dueInDays)) && Number(dueInDays) > 0 ? Number(dueInDays) : 7;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const uploaderResult = await client.query(`SELECT emp_no AS id FROM "Master_Data_All" WHERE UPPER(emp_no) = UPPER($1)`, [req.user!.empId]);
    const uploaderId = uploaderResult.rows[0]?.id || null;

    const supResult = await client.query(`
      SELECT id, vendor_code, supplier_name, buyer_name, buyer_email, evaluator_name, evaluator_email
        FROM "SPES_suppliers" WHERE vendor_code = $1 AND is_active = TRUE
    `, [String(vendorCode).trim()]);
    if (supResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ไม่พบรหัสซัพพลายเออร์', field: 'vendorCode' });
    }
    const supplier = supResult.rows[0];

    if (!supplier.buyer_email && !supplier.evaluator_email) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Supplier รายนี้ไม่มีอีเมล Buyer/Evaluator บันทึกไว้ ไม่สามารถส่งงานประเมินได้' });
    }

    // Timestamp-based period keeps this trivially unique per incident —
    // unlike pre/post/half_year/yearly there's no natural recurring period
    // name for an ad-hoc case, and idx_unique_open_session (schema.sql)
    // would otherwise block a second complaint on the same supplier.
    const dueDate = addDays(new Date(), days);
    const period  = `Ad-hoc ${new Date().toISOString()}`;

    const sessionResult = await client.query(`
      INSERT INTO "SPES_evaluation_sessions" (supplier_id, eval_type, period, status, initiated_by, ad_hoc_reason)
      VALUES ($1, 'ad_hoc', $2, 'pending', $3, $4) RETURNING id
    `, [supplier.id, period, uploaderId, String(reason).trim()]);
    const sessionId = sessionResult.rows[0].id;

    const gcpMatch = supplier.buyer_email
      ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [supplier.buyer_email])
      : { rows: [] };
    const buMatch = supplier.evaluator_email
      ? await client.query(`            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`, [supplier.evaluator_email])
      : { rows: [] };

    const taskRows = [
      { role: 'GCP', email: supplier.buyer_email, name: supplier.buyer_name, empId: gcpMatch.rows[0]?.id || null, empName: gcpMatch.rows[0]?.full_name || supplier.buyer_name },
      { role: 'USER', email: supplier.evaluator_email, name: supplier.evaluator_name, empId: buMatch.rows[0]?.id || null, empName: buMatch.rows[0]?.full_name || supplier.evaluator_name },
    ];

    const invitationTasks: any[] = [];
    for (const t of taskRows) {
      if (!t.email) continue;
      const taskResult = await client.query(`
        INSERT INTO "SPES_evaluation_tasks"
          (session_id, supplier_id, assigned_employee_id, assigned_email, assigned_name, role, due_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id
      `, [sessionId, supplier.id, t.empId, t.email, t.empName, t.role, dueDate]);

      invitationTasks.push({
        id: taskResult.rows[0].id,
        assigned_email: t.email,
        assigned_name: t.empName,
        due_date: dueDate,
        eval_type_label: 'Ad-hoc Evaluation (กรณีพิเศษ)',
        supplier,
      });
    }

    await client.query('COMMIT');

    // Ad-hoc is urgent by nature (complaint/incident) — send right away
    // instead of waiting on the daily cron.
    for (const task of invitationTasks) {
      sendInvitationEmail(task, task.supplier)
        .then(() => pool.query(`UPDATE "SPES_evaluation_tasks" SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]))
        .catch((e: any) => console.warn('[admin ad-hoc] invitation email error:', e.message));
    }

    console.log(`[admin] ad-hoc evaluation created for ${supplier.vendor_code} by ${req.user!.empId}`);
    res.status(201).json({ message: 'สร้างงานประเมิน Ad-hoc สำเร็จ', sessionId, tasksCreated: invitationTasks.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/admin/ad-hoc-evaluation error:', err);
    res.status(500).json({ message: 'สร้างงานประเมินไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── GET /api/admin/tasks ──────────────────────────────────────
async function listTasks(req: Request, res: Response) {
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
      FROM "SPES_evaluation_tasks" et
      JOIN "SPES_suppliers" s           ON s.id  = et.supplier_id
      JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
      WHERE ($1::text IS NULL OR et.status = $1)
        AND ($2::text IS NULL OR et.role = $2)
        AND ($3::text IS NULL OR s.vendor_code = $3)
      ORDER BY et.due_date ASC
      LIMIT 500
    `, [status || null, role || null, vendorCode || null]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/tasks error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── POST /api/admin/tasks/:id/remind ─────────────────────────
async function remindTask(req: Request, res: Response) {
  try {
    const taskResult = await pool.query(`
      SELECT et.*, s.supplier_name, s.vendor_code
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s ON s.id = et.supplier_id
       WHERE et.id = $1
    `, [req.params.id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ task' });
    }
    const task = taskResult.rows[0];
    if (task.status === 'completed') {
      return res.status(400).json({ message: 'task นี้ประเมินเสร็จแล้ว' });
    }

    await sendReminderEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
    await pool.query(`UPDATE "SPES_evaluation_tasks" SET reminder_sent_at = NOW() WHERE id = $1`, [req.params.id]);

    res.json({ message: 'ส่ง reminder สำเร็จ', email: task.assigned_email });
  } catch (err: any) {
    console.error('POST /api/admin/tasks/:id/remind error:', err);
    res.status(500).json({ message: 'ส่ง reminder ไม่สำเร็จ' });
  }
}

// ── PATCH /api/admin/tasks/:id ────────────────────────────────
// Edit the assignee (by email) and/or due_date of a task.
// The name is never taken from client input when the email matches
// a real employee — it's always pulled from that employee's record,
// so assigned_name can never drift out of sync with assigned_email.
// `assignedName` is only used as a fallback label for an email that
// doesn't match anyone in the system (ad-hoc external recipient).
// Re-arms reminder/overdue emails when due_date changes, and
// re-arms the full invite cycle when the assignee changes.
async function updateTask(req: Request, res: Response) {
  const { assignedName, assignedEmail, dueDate } = req.body;

  try {
    const current = await pool.query(`SELECT * FROM "SPES_evaluation_tasks" WHERE id = $1`, [req.params.id]);
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
        `            SELECT emp_no AS id, name AS full_name FROM "Master_Data_All" WHERE LOWER(email) = LOWER($1)
            LIMIT 1`,
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
        SELECT role FROM "SPES_evaluation_tasks"
         WHERE session_id = $1 AND id != $2 AND role != $3
           AND (LOWER(assigned_email) = LOWER($4) OR ($5::text IS NOT NULL AND UPPER(assigned_employee_id) = UPPER($5)))
      `, [task.session_id, task.id, task.role, finalEmail, assignedEmployeeId]);
      if (collision.rows.length > 0) {
        return res.status(400).json({
          message: `ไม่สามารถมอบหมายได้ — email นี้ถูกมอบหมายเป็น ${collision.rows[0].role} ของการประเมินนี้อยู่แล้ว คนคนเดียวไม่สามารถเป็นทั้ง GCP และ USER ของ session เดียวกันได้ (จะทำให้ supervisor ไม่เห็นรายการนี้)`,
        });
      }
    }

    const result = await pool.query(`
      UPDATE "SPES_evaluation_tasks" SET
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
    res.status(500).json({ message: 'แก้ไขไม่สำเร็จ' });
  }
}

// ── DELETE /api/admin/sessions/:sessionId ─────────────────────
// Removes a mistakenly-uploaded evaluation entirely (its tasks +
// session). Blocked once it's gone to supervisor review or beyond,
// so finished work can't be casually wiped — use this only to undo
// a bad upload before anyone has acted on it.
async function deleteSession(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `SELECT status FROM "SPES_evaluation_sessions" WHERE id = $1`,
      [req.params.sessionId]
    );
    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'ไม่พบรายการประเมินนี้' });
    }
    const { status } = sessionResult.rows[0];
    if (!['pending', 'in_progress', 'returned'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ไม่สามารถลบรายการที่เข้าสู่การอนุมัติหรือเสร็จสิ้นแล้วได้' });
    }

    // email_logs.task_id has no ON DELETE CASCADE — deleting a task that
    // already had an invitation/reminder sent (true for nearly every real
    // task) would otherwise fail with a foreign-key violation. The log rows
    // are meaningless once their task is gone anyway, so drop them first.
    await client.query(`DELETE FROM "SPES_email_logs" WHERE task_id IN (SELECT id FROM "SPES_evaluation_tasks" WHERE session_id = $1)`, [req.params.sessionId]);
    await client.query(`DELETE FROM "SPES_evaluation_tasks" WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM "SPES_supervisor_reviews" WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM "SPES_evaluations" WHERE session_id = $1`, [req.params.sessionId]);
    await client.query(`DELETE FROM "SPES_evaluation_sessions" WHERE id = $1`, [req.params.sessionId]);

    await client.query('COMMIT');
    console.log(`[admin] ลบรายการประเมิน session ${req.params.sessionId} โดย ${req.user!.empId}`);
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/admin/sessions/:sessionId error:', err);
    res.status(500).json({ message: 'ลบไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── POST /api/admin/tasks/remind-all ─────────────────────────
// Bulk-send reminder emails. With no body, targets every active
// (non-completed) task with an assigned email. Pass `taskIds` to
// scope it to a specific filtered/visible set instead.
async function remindAllTasks(req: Request, res: Response) {
  const { taskIds } = req.body || {};
  try {
    const taskResult = await pool.query(`
      SELECT et.*, s.supplier_name, s.vendor_code
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s ON s.id = et.supplier_id
       WHERE et.status != 'completed' AND et.assigned_email IS NOT NULL
         AND ($1::uuid[] IS NULL OR et.id = ANY($1::uuid[]))
    `, [Array.isArray(taskIds) && taskIds.length > 0 ? taskIds : null]);

    let sent = 0, failed = 0;
    for (const task of taskResult.rows) {
      try {
        await sendReminderEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET reminder_sent_at = NOW() WHERE id = $1`, [task.id]);
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
    res.status(500).json({ message: 'ส่ง reminder ทั้งหมดไม่สำเร็จ' });
  }
}

// ── POST /api/admin/sessions/bulk-delete ──────────────────────
// Same guard as DELETE /sessions/:id, applied to many sessions at
// once. Sessions already past pending/in_progress (i.e. completed
// or in review) are skipped rather than erroring the whole batch,
// so a mixed selection still deletes what it safely can.
async function bulkDeleteSessions(req: Request, res: Response) {
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
        `SELECT status FROM "SPES_evaluation_sessions" WHERE id = $1`, [sessionId]
      );
      if (sessionResult.rows.length === 0 || !['pending', 'in_progress', 'returned'].includes(sessionResult.rows[0].status)) {
        await client.query('ROLLBACK');
        skipped.push(sessionId);
        continue;
      }
      await client.query(`DELETE FROM "SPES_evaluation_tasks" WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM "SPES_supervisor_reviews" WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM "SPES_evaluations" WHERE session_id = $1`, [sessionId]);
      await client.query(`DELETE FROM "SPES_evaluation_sessions" WHERE id = $1`, [sessionId]);
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
}

// ── GET /api/admin/batches ────────────────────────────────────
async function listBatches(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.batch_type AS "batchType", b.filename,
        b.row_count AS "rowCount", b.status,
        b.error_msg AS "errorMsg", b.created_at AS "createdAt",
        emp.full_name AS "uploadedBy"
      FROM "SPES_supplier_upload_batches" b
      LEFT JOIN "Master_Data_All" emp ON emp.emp_no = b.uploaded_by
      ORDER BY b.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/batches error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/admin/service-evaluations ─────────────────────────
// Per-evaluation detail for cross-eval #3/#4 (database/CROSS_EVALUATION_SPEC.md)
// — one row per service_evaluations record, not aggregated, so an admin can
// see exactly which round/date/evaluator each score came from.
async function listServiceEvaluations(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT
        se.id,
        sessionSup.supplier_name AS "supplierName",
        target.emp_no AS "targetEmpCode", target.name AS "targetFullName", 
        COALESCE(r_target.role, CASE WHEN gcp.emp_no IS NOT NULL THEN 'GCP' ELSE 'USER' END) AS "targetRole",
        CASE WHEN se.direction LIKE 'supplier_%' THEN sup.supplier_name ELSE evalEmp.name END AS "evaluatorName",
        CASE WHEN se.direction LIKE 'supplier_%' THEN sup.vendor_code ELSE evalEmp.emp_no END AS "evaluatorCode",
        CASE WHEN se.direction LIKE 'supplier_%' THEN 'Supplier' ELSE 'USER' END AS "evaluatorRoleLabel",
        es.period,
        se.submitted_at AS "submittedAt",
        se.total_score AS "totalScore",
        se.grade
      FROM "SPES_service_evaluations" se
      JOIN "Master_Data_All" target ON target.emp_no = se.target_employee_id
      LEFT JOIN "Master_Data_GCP" gcp ON UPPER(gcp.emp_no) = UPPER(target.emp_no)
      LEFT JOIN "SPES_Roles" r_target ON UPPER(r_target.emp_no) = UPPER(target.emp_no)
      JOIN "SPES_evaluation_sessions" es ON es.id = se.session_id
      JOIN "SPES_suppliers" sessionSup ON sessionSup.id = es.supplier_id
      LEFT JOIN "SPES_suppliers" sup ON sup.id = se.evaluator_supplier_id
      LEFT JOIN "Master_Data_All" evalEmp ON evalEmp.emp_no = se.evaluator_employee_id
      ORDER BY se.submitted_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/admin/service-evaluations error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/admin/suppliers — read-only supplier directory ───
// Unlike GET /api/suppliers (kept minimal for dropdown/autocomplete use),
// this surfaces every field an admin would want to check at a glance —
// the same data an Excel upload row carries — without exposing a way to
// edit it here.
async function listSuppliersAdmin(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName",
             product_type AS "productType", tax_id AS "taxId", category,
             function_owner AS "functionOwner", job_value_thb AS "jobValueThb",
             pta_approve_date AS "ptaApproveDate",
             buyer_name AS "buyerName", buyer_email AS "buyerEmail",
             evaluator_name AS "evaluatorName", evaluator_email AS "evaluatorEmail",
             contact_email AS "contactEmail", is_active AS "isActive"
        FROM "SPES_suppliers"
       ORDER BY supplier_name
    `);
    // NUMERIC columns come back as strings from pg — parse once here so the
    // frontend can format/sort without every consumer re-parsing itself.
    const rows = result.rows.map((r: any) => ({
      ...r,
      jobValueThb: r.jobValueThb != null ? parseFloat(r.jobValueThb) : null,
    }));
    res.json(rows);
  } catch (err: any) {
    console.error('GET /api/admin/suppliers error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}
// ── PATCH /api/admin/suppliers/:vendorCode ─────────────────────
async function updateSupplierAdmin(req: Request, res: Response) {
  const { vendorCode } = req.params;
  const {
    supplierName, productType, taxId, category, functionOwner, jobValueThb,
    ptaApproveDate, buyerName, buyerEmail, evaluatorName, evaluatorEmail,
    isActive
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE "SPES_suppliers" SET
        supplier_name = COALESCE($1, supplier_name),
        product_type = COALESCE($2, product_type),
        tax_id = COALESCE($3, tax_id),
        category = COALESCE($4, category),
        function_owner = COALESCE($5, function_owner),
        job_value_thb = COALESCE($6, job_value_thb),
        pta_approve_date = COALESCE($7, pta_approve_date),
        buyer_name = COALESCE($8, buyer_name),
        buyer_email = COALESCE($9, buyer_email),
        evaluator_name = COALESCE($10, evaluator_name),
        evaluator_email = COALESCE($11, evaluator_email),
        is_active = COALESCE($12, is_active),
        updated_at = NOW()
      WHERE vendor_code = $13
      RETURNING vendor_code
    `, [
      supplierName, productType, taxId, category, functionOwner, jobValueThb,
      ptaApproveDate, buyerName, buyerEmail, evaluatorName, evaluatorEmail,
      isActive, vendorCode
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ Supplier' });
    }

    res.json({ message: 'อัปเดตข้อมูล Supplier สำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/admin/suppliers/:vendorCode error:', err);
    res.status(500).json({ message: 'อัปเดตข้อมูลไม่สำเร็จ' });
  }
}

// ── POST /api/admin/suppliers ─────────────────────
async function createSupplierAdmin(req: Request, res: Response) {
  const {
    vendorCode, supplierName, productType, taxId, category, functionOwner, jobValueThb,
    ptaApproveDate, buyerName, buyerEmail, evaluatorName, evaluatorEmail,
    isActive
  } = req.body;

  if (!vendorCode || !supplierName) {
    return res.status(400).json({ message: 'กรุณาระบุ Vendor Code และ Supplier Name' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO "SPES_suppliers" (
        vendor_code, supplier_name, product_type, tax_id, category, function_owner,
        job_value_thb, pta_approve_date, buyer_name, buyer_email, evaluator_name, evaluator_email,
        is_active
      ) VALUES (
        $1, $2, COALESCE($3, 'both'), $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        COALESCE($13, true)
      ) RETURNING vendor_code
    `, [
      vendorCode, supplierName, productType, taxId, category, functionOwner,
      jobValueThb, ptaApproveDate, buyerName, buyerEmail, evaluatorName, evaluatorEmail,
      isActive
    ]);

    res.status(201).json({ message: 'สร้าง Supplier สำเร็จ', vendorCode: result.rows[0].vendor_code });
  } catch (err: any) {
    console.error('POST /api/admin/suppliers error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Vendor Code นี้มีอยู่ในระบบแล้ว' });
    }
    res.status(500).json({ message: 'สร้างข้อมูลไม่สำเร็จ' });
  }
}

// ── POST /api/admin/suppliers/upload ────────────────
async function uploadSuppliers(req: RequestWithFile, res: Response) {
  if (!req.file) return res.status(400).json({ message: 'กรุณาแนบไฟล์' });

  let rows;
  try {
    rows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e: any) {
    return res.status(400).json({ message: 'ไม่สามารถอ่านไฟล์ได้', error: e.message });
  }

  if (rows.length === 0) return res.status(400).json({ message: 'ไฟล์ไม่มีข้อมูล' });

  const summary = { processed: 0, skipped: 0, warnings: [] as string[] };
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      // The columns should match the expected Excel template or common names
      const taxId        = String(norm(row, 'TAX_ID') || norm(row, 'Tax ID') || '').trim();
      const vendorCodeRaw = String(norm(row, 'Vendor Code') || norm(row, 'Vendor_Code') || '').trim();
      const supplierName = String(norm(row, 'Supplier Name') || norm(row, 'Supplier_Name') || '').trim();
      const productType  = String(norm(row, 'Product Type') || norm(row, 'Product_Type') || 'both').trim();
      const category     = String(norm(row, 'Category') || '').trim();
      const fnOwner      = String(norm(row, 'Function_Owner') || norm(row, 'Function Owner') || '').trim();
      const jobValueRaw  = norm(row, 'Job Value THB') || norm(row, 'Job_Value_THB');
      const jobValue     = jobValueRaw != null ? parseFloat(jobValueRaw) : null;
      const ptaRaw       = norm(row, 'PTA Approve Date') || norm(row, 'PTA_Approve_Date');
      const ptaDate      = toDate(ptaRaw);
      const buyerName    = String(norm(row, 'Buyer Name') || norm(row, 'Buyer_Name') || '').trim();
      const buyerEmail   = String(norm(row, 'Buyer Email') || norm(row, 'Buyer_Email') || '').trim().toLowerCase();
      const evalName     = String(norm(row, 'Evaluator Name') || norm(row, 'Evaluator_Name') || '').trim();
      const evalEmail    = String(norm(row, 'Evaluator Email') || norm(row, 'Evaluator_Email') || '').trim().toLowerCase();
      
      const vendorCode = vendorCodeRaw || taxId || supplierName.substring(0, 50);

      if (!vendorCode || !supplierName) { 
        summary.skipped++; 
        if (!vendorCode && !supplierName) continue;
        summary.warnings.push(`ข้ามแถวที่ไม่มี Vendor Code และ Supplier Name`);
        continue; 
      }

      await client.query(`
        INSERT INTO "SPES_suppliers" (vendor_code, supplier_name, product_type, tax_id, category,
          function_owner, job_value_thb, pta_approve_date, buyer_name, buyer_email,
          evaluator_name, evaluator_email, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
        ON CONFLICT (vendor_code) DO UPDATE SET
          supplier_name   = EXCLUDED.supplier_name,
          product_type    = EXCLUDED.product_type,
          tax_id          = COALESCE(EXCLUDED.tax_id, "SPES_suppliers".tax_id),
          category        = EXCLUDED.category,
          function_owner  = EXCLUDED.function_owner,
          job_value_thb   = EXCLUDED.job_value_thb,
          pta_approve_date = COALESCE(EXCLUDED.pta_approve_date, "SPES_suppliers".pta_approve_date),
          buyer_name      = EXCLUDED.buyer_name,
          buyer_email     = EXCLUDED.buyer_email,
          evaluator_name  = EXCLUDED.evaluator_name,
          evaluator_email = EXCLUDED.evaluator_email,
          updated_at      = NOW()
      `, [vendorCode, supplierName, productType, taxId || null,
          category || null, fnOwner || null, jobValue, ptaDate || null,
          buyerName || null, buyerEmail || null, evalName || null, evalEmail || null]);

      summary.processed++;
    }

    await client.query('COMMIT');
    res.json({ message: 'อัพโหลดสำเร็จ', ...summary });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/admin/suppliers/upload error:', err);
    res.status(500).json({ message: 'อัพโหลดไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
}

module.exports = {
  uploadPrePost, uploadPeriodic, createAdHocEvaluation, listTasks, remindTask, updateTask,
  deleteSession, remindAllTasks, bulkDeleteSessions, listBatches, listServiceEvaluations,
  listSuppliersAdmin, updateSupplierAdmin, createSupplierAdmin, uploadSuppliers,
};
