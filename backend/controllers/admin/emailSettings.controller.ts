'use strict';
// ============================================================
//  controllers/admin/emailSettings.controller.ts
//  GET/PATCH /api/admin/email-templates[/:emailType]
//  GET/PATCH /api/admin/email-settings[/:key]
// ============================================================
import type { Request, Response } from 'express';
const pool = require('../../db');

const EMAIL_TYPES = [
  'invitation', 'reminder', 'overdue', 'overdue_escalation', 'thankyou',
  'supervisor_notify', 'supervisor_result_approved', 'supervisor_result_returned',
  'supplier_eval_invite',
];
const SETTING_KEYS = [
  'reminder_days_before', 'overdue_days_after', 'review_due_days',
  'pre_eval_due_days', 'post_eval_due_days', 'periodic_due_days',
];

// ── GET /api/admin/email-templates ─────────────────────────────
async function listEmailTemplates(req: Request, res: Response) {
  const result = await pool.query(
    `SELECT email_type AS "emailType", subject, title_th AS "titleTh",
            body_text AS "bodyText", button_label AS "buttonLabel", updated_at AS "updatedAt"
       FROM email_templates ORDER BY email_type`
  );
  res.json(result.rows);
}

// ── PATCH /api/admin/email-templates/:emailType ────────────────
async function updateEmailTemplate(req: Request, res: Response) {
  const emailType = String(req.params.emailType);
  if (!EMAIL_TYPES.includes(emailType)) {
    return res.status(400).json({ message: 'emailType ไม่ถูกต้อง' });
  }
  const { subject, titleTh, bodyText, buttonLabel } = req.body;
  if (!subject?.trim() || !titleTh?.trim() || !bodyText?.trim()) {
    return res.status(400).json({ message: 'กรุณากรอก subject, titleTh, bodyText' });
  }

  const employeeResult = await pool.query(
    `SELECT id FROM employees WHERE employee_id = $1`, [req.user!.empId]
  );
  const updatedBy = employeeResult.rows[0]?.id || null;

  const result = await pool.query(
    `UPDATE email_templates
        SET subject = $1, title_th = $2, body_text = $3, button_label = $4,
            updated_at = NOW(), updated_by = $5
      WHERE email_type = $6
      RETURNING email_type AS "emailType", subject, title_th AS "titleTh",
                body_text AS "bodyText", button_label AS "buttonLabel", updated_at AS "updatedAt"`,
    [subject.trim(), titleTh.trim(), bodyText.trim(), buttonLabel?.trim() || null, updatedBy, emailType]
  );
  if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบ email template นี้' });
  res.json(result.rows[0]);
}

// ── GET /api/admin/email-settings ──────────────────────────────
async function listEmailSettings(req: Request, res: Response) {
  const result = await pool.query(
    `SELECT key, value, label_th AS "labelTh", updated_at AS "updatedAt"
       FROM email_settings ORDER BY key`
  );
  res.json(result.rows);
}

// ── PATCH /api/admin/email-settings/:key ───────────────────────
async function updateEmailSetting(req: Request, res: Response) {
  const key = String(req.params.key);
  if (!SETTING_KEYS.includes(key)) {
    return res.status(400).json({ message: 'key ไม่ถูกต้อง' });
  }
  const value = parseInt(req.body.value, 10);
  if (!Number.isFinite(value) || value < 1 || value > 365) {
    return res.status(400).json({ message: 'value ต้องเป็นจำนวนวันระหว่าง 1-365' });
  }

  const result = await pool.query(
    `UPDATE email_settings SET value = $1, updated_at = NOW() WHERE key = $2
     RETURNING key, value, label_th AS "labelTh", updated_at AS "updatedAt"`,
    [value, key]
  );
  if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบ setting นี้' });
  res.json(result.rows[0]);
}

module.exports = { listEmailTemplates, updateEmailTemplate, listEmailSettings, updateEmailSetting };
