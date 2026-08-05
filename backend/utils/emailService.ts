'use strict';
import type { Resend as ResendClient } from 'resend';
const { Resend } = require('resend');
const pool = require('../db');
const resend: ResendClient = new Resend(process.env.RESEND_API_KEY);

const FROM    = process.env.EMAIL_FROM || 'Supplier Eval <onboarding@resend.dev>';
const FE_URL  = process.env.FRONTEND_URL || 'http://localhost:5173';

interface TaskEmailInfo {
  id: number | string;
  assigned_email: string;
  assigned_name?: string | null;
  due_date: string | Date;
  eval_type_label?: string;
}

interface SupplierEmailInfo {
  supplier_name: string;
  vendor_code: string;
}

interface SessionEmailInfo {
  supplier_name: string;
  eval_type: string;
  final_score?: number | string | null;
}

// Escapes values that ultimately come from uploaded Excel data or
// free-text supervisor notes before interpolating into email HTML —
// without this, a crafted supplier name/note could inject markup
// (fake links, broken layout) into emails sent to other employees.
function esc(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── shared HTML wrapper ────────────────────────────────────────
function wrap(titleTh: string, bodyHtml: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px">
      <div style="background:#1a6b1a;padding:18px 24px;border-radius:10px 10px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px;font-weight:700">${titleTh}</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 10px 10px;border:1px solid #ddd;font-size:14px;color:#333;line-height:1.8">
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0 14px"/>
        <p style="margin:0;color:#aaa;font-size:12px">Supplier Performance Evaluation System</p>
      </div>
    </div>`;
}

function buttonHtml(label: string | null | undefined, href: string, color = '#1a6b1a'): string {
  if (!label) return '';
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">${esc(label)}</a>`;
}

// ============================================================
//  Admin-editable templates (email_templates / email_settings) —
//  see database/schema.sql and utils/seedEmailTemplates.ts, which seeds
//  both tables with the exact copy this file used to hardcode. A missing
//  row (shouldn't happen once seeded, but defensive) falls back to that
//  same hardcoded default so the app never sends a broken/empty email.
// ============================================================
interface EmailTemplate {
  subject: string;
  titleTh: string;
  bodyText: string;
  buttonLabel: string | null;
}

const TEMPLATE_DEFAULTS: Record<string, EmailTemplate> = {
  invitation: {
    subject: '[SPE] กรุณาประเมิน Supplier: {{supplierName}}',
    titleTh: 'แจ้งการประเมิน Supplier',
    bodyText: 'เรียน {{assignedName}}\n\nคุณได้รับมอบหมายให้ประเมิน Supplier รายการต่อไปนี้:',
    buttonLabel: 'เข้าสู่ระบบประเมิน',
  },
  reminder: {
    subject: '[SPE] เตือน: ครบกำหนดประเมิน {{supplierName}} ใน {{reminderDaysBefore}} วัน',
    titleTh: 'เตือนความจำ: ใกล้ครบกำหนดประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nคุณยังไม่ได้ส่งผลการประเมิน Supplier {{supplierName}}\n\nครบกำหนดใน {{reminderDaysBefore}} วัน: {{dueDate}}',
    buttonLabel: 'ประเมินเดี๋ยวนี้',
  },
  overdue: {
    subject: '[SPE] เกินกำหนด: ยังไม่ประเมิน {{supplierName}}',
    titleTh: 'เกินกำหนด: ยังไม่ได้ประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nการประเมิน Supplier {{supplierName}} เกินกำหนด {{dueDate}} แล้ว {{overdueDaysAfter}} วัน\n\nกรุณาดำเนินการโดยด่วน หากมีข้อขัดข้องกรุณาติดต่อ Admin',
    buttonLabel: 'ประเมินทันที',
  },
  overdue_escalation: {
    subject: '[SPE] Escalation: เกินกำหนดประเมิน {{supplierName}}',
    titleTh: 'Escalation: งานประเมินเกินกำหนด',
    bodyText: 'เรียน {{supervisorName}}\n\nงานประเมิน Supplier ต่อไปนี้เกินกำหนดมาแล้ว {{overdueDaysAfter}} วัน และผู้รับผิดชอบยังไม่ส่งผล:',
    buttonLabel: 'เข้าสู่ระบบ',
  },
  thankyou: {
    subject: '[SPE] ขอบคุณสำหรับการประเมิน: {{supplierName}}',
    titleTh: 'ขอบคุณสำหรับการประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nขอบคุณที่ส่งผลการประเมิน Supplier {{supplierName}} เรียบร้อยแล้ว\n\nผลการประเมินจะถูกส่งให้ Supervisor พิจารณาอนุมัติภายใน {{reviewDueDays}} วัน',
    buttonLabel: null,
  },
  supervisor_notify: {
    subject: '[SPE] รออนุมัติ: ผลประเมิน {{supplierName}}',
    titleTh: 'รอการอนุมัติผลประเมิน',
    bodyText: 'เรียน {{supervisorName}}\n\nมีผลการประเมิน Supplier รอการอนุมัติของคุณ:',
    buttonLabel: 'เข้าสู่ระบบอนุมัติ',
  },
  supervisor_result_approved: {
    subject: '[SPE] อนุมัติแล้ว: ผลประเมิน {{supplierName}}',
    titleTh: 'ผลการประเมินได้รับการอนุมัติ',
    bodyText: 'เรียน {{toName}}\n\nผลการประเมิน Supplier {{supplierName}} ได้รับการพิจารณาแล้ว\n\nผล: ✅ อนุมัติ',
    buttonLabel: null,
  },
  supervisor_result_returned: {
    subject: '[SPE] กรุณาแก้ไข: ผลประเมิน {{supplierName}}',
    titleTh: 'ผลการประเมินถูกส่งคืน',
    bodyText: 'เรียน {{toName}}\n\nผลการประเมิน Supplier {{supplierName}} ได้รับการพิจารณาแล้ว\n\nผล: 🔄 ส่งคืนเพื่อแก้ไข',
    buttonLabel: 'แก้ไขและส่งใหม่',
  },
  supplier_eval_invite: {
    subject: 'ขอความคิดเห็นเกี่ยวกับการให้บริการ',
    titleTh: 'ขอความคิดเห็นเกี่ยวกับการให้บริการ',
    bodyText: 'เรียน {{supplierName}}\n\nการประเมินรอบล่าสุดของท่านเสร็จสมบูรณ์แล้ว ทางเราขอความคิดเห็นของท่านเกี่ยวกับการให้บริการของทีมงานที่ดูแลท่าน เพื่อนำไปพัฒนาการทำงานร่วมกันต่อไป',
    buttonLabel: 'ให้ความคิดเห็น',
  },
};

const SETTING_DEFAULTS: Record<string, number> = {
  reminder_days_before: 7,
  overdue_days_after: 3,
  review_due_days: 7,
  pre_eval_due_days: 30,
  post_eval_due_days: 90,
  periodic_due_days: 7,
};

async function getTemplate(emailType: string): Promise<EmailTemplate> {
  try {
    const r = await pool.query(
      `SELECT subject, title_th AS "titleTh", body_text AS "bodyText", button_label AS "buttonLabel"
         FROM "SPES2_email_templates" WHERE email_type = $1`,
      [emailType]
    );
    if (r.rows[0]) return r.rows[0];
  } catch (e: any) {
    console.warn(`[emailService] getTemplate(${emailType}) failed, using default:`, e.message);
  }
  return TEMPLATE_DEFAULTS[emailType];
}

async function getEmailSetting(key: string): Promise<number> {
  try {
    const r = await pool.query(`SELECT value FROM "SPES2_email_settings" WHERE key = $1`, [key]);
    if (r.rows[0]) return Number(r.rows[0].value);
  } catch (e: any) {
    console.warn(`[emailService] getEmailSetting(${key}) failed, using default:`, e.message);
  }
  return SETTING_DEFAULTS[key];
}

// Plain-text substitution for subject/title (not rendered as HTML by mail
// clients, so no esc() needed — raw values go in directly).
function renderText(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key] ?? '') : ''));
}

// Body text is admin-authored plain text — escape the whole thing first
// (protects against a stray '<'/'&' the admin typed, same as any other
// user input), THEN substitute {{placeholders}} with escaped dynamic
// values (esc() never touches '{'/'}', so this order is safe). Blank-line
// separated blocks become <p> tags; a single newline inside a block
// becomes <br/>.
function renderBodyHtml(template: string, vars: Record<string, unknown>): string {
  const escapedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) escapedVars[k] = esc(v);
  const rendered = esc(template).replace(/\{\{(\w+)\}\}/g, (_, key) => (key in escapedVars ? escapedVars[key] : ''));
  // Explicit inline margin — some mail clients (Outlook desktop's Word
  // rendering engine in particular) don't reliably apply a default <p>
  // margin, which would silently collapse every paragraph gap.
  return rendered
    .split(/\n\s*\n/)
    .filter(block => block.trim())
    .map(block => `<p style="margin:0 0 14px;">${block.split('\n').join('<br/>')}</p>`)
    .join('\n');
}

// email_logs exists specifically so send failures (and successes) are
// visible somewhere other than console output, which most deployments
// never persist — previously nothing ever wrote to this table at all.
async function logEmail(
  taskId: number | string | null,
  emailType: string | null,
  toEmail: string,
  subject: string,
  status: 'sent' | 'failed',
  errorMsg?: string | null,
  retryCount: number = 0
): Promise<void> {
  await pool.query(
    `INSERT INTO "SPES2_email_logs" (task_id, email_type, to_email, subject, status, error_msg, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [taskId, emailType, toEmail, subject, status, errorMsg || null, retryCount]
  ).catch((e: Error) => console.warn('[emailService] email_logs insert failed:', e.message));
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Transient failures (rate limits, network blips, provider hiccups) are
// common enough with a single outbound provider that "fails once, never
// retried" was losing real notifications — retries in-process with a short
// backoff instead of giving up on the first error. MAX_RETRIES=2 means up
// to 3 attempts total; email_logs.retry_count records how many retries it
// took (0 = succeeded on the first try).
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

async function send(
  to: string,
  subject: string,
  html: string,
  { taskId = null, emailType = null, cc = undefined }: {
    taskId?: number | string | null;
    emailType?: string | null;
    cc?: string[] | undefined;
  } = {}
) {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await resend.emails.send({
        from: FROM, to: [to], subject, html,
        ...(cc && cc.length > 0 ? { cc } : {}),
      });
      await logEmail(taskId, emailType, to, subject, 'sent', null, attempt);
      return result;
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[emailService] send to ${to} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying:`, err.message);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  await logEmail(taskId, emailType, to, subject, 'failed', lastErr?.message, MAX_RETRIES);
  throw lastErr;
}

// ── 1. Invitation ──────────────────────────────────────────────
async function sendInvitationEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const t = await getTemplate('invitation');
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const vars = { assignedName: task.assigned_name || task.assigned_email, supplierName: supplier.supplier_name };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">ชื่อ Supplier</td><td><strong>${esc(supplier.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">รหัส</td><td>${esc(supplier.vendor_code)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภทการประเมิน</td><td>${esc(task.eval_type_label || '')}</td></tr>
      <tr><td style="padding:6px 0;color:#555">วันครบกำหนด</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    ${buttonHtml(t.buttonLabel, FE_URL)}
  `);
  return send(task.assigned_email, renderText(t.subject, vars), html, { taskId: task.id, emailType: 'invitation' });
}

// ── 2. Reminder (N วันก่อน due — reminder_days_before) ─────────
async function sendReminderEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const t = await getTemplate('reminder');
  const reminderDaysBefore = await getEmailSetting('reminder_days_before');
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const vars = { assignedName: task.assigned_name || task.assigned_email, supplierName: supplier.supplier_name, dueDate: dueStr, reminderDaysBefore };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    ${buttonHtml(t.buttonLabel, FE_URL)}
  `);
  return send(task.assigned_email, renderText(t.subject, vars), html, { taskId: task.id, emailType: 'reminder' });
}

// ── 3. Overdue (N วันหลัง due — overdue_days_after) ────────────
async function sendOverdueEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const t = await getTemplate('overdue');
  const overdueDaysAfter = await getEmailSetting('overdue_days_after');
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const vars = { assignedName: task.assigned_name || task.assigned_email, supplierName: supplier.supplier_name, dueDate: dueStr, overdueDaysAfter };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    ${buttonHtml(t.buttonLabel, FE_URL, '#c62828')}
  `);
  return send(task.assigned_email, renderText(t.subject, vars), html, { taskId: task.id, emailType: 'overdue' });
}

// ── 3b. Overdue escalation → Supervisor (same overdue_days_after trigger) ──
async function sendOverdueEscalationEmail(
  supervisorEmail: string,
  supervisorName: string | null | undefined,
  task: TaskEmailInfo & { role?: string },
  supplier: SupplierEmailInfo
) {
  const t = await getTemplate('overdue_escalation');
  const overdueDaysAfter = await getEmailSetting('overdue_days_after');
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const vars = { supervisorName: supervisorName || supervisorEmail, supplierName: supplier.supplier_name, overdueDaysAfter };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">Supplier</td><td><strong>${esc(supplier.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">รหัส</td><td>${esc(supplier.vendor_code)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภทการประเมิน</td><td>${esc(task.eval_type_label || '')}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ผู้รับผิดชอบ (${esc(task.role || '')})</td><td>${esc(task.assigned_name || task.assigned_email)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ครบกำหนด</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    ${buttonHtml(t.buttonLabel, `${FE_URL}/supervisor?tab=overdue`)}
  `);
  return send(supervisorEmail, renderText(t.subject, vars), html, { taskId: task.id, emailType: 'overdue_escalation' });
}

// ── 4. Thank-you (หลัง submit) ────────────────────────────────
async function sendThankyouEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const t = await getTemplate('thankyou');
  const reviewDueDays = await getEmailSetting('review_due_days');
  const vars = { assignedName: task.assigned_name || task.assigned_email, supplierName: supplier.supplier_name, reviewDueDays };
  const html = wrap(renderText(t.titleTh, vars), renderBodyHtml(t.bodyText, vars));
  return send(task.assigned_email, renderText(t.subject, vars), html, { taskId: task.id, emailType: 'thankyou' });
}

// ── 5. Supervisor notification (ทั้ง USER+GCP submit แล้ว) ───────
async function sendSupervisorNotifyEmail(
  supervisorEmail: string,
  supervisorName: string | null | undefined,
  session: SessionEmailInfo,
  reviewDue: string | Date
) {
  const t = await getTemplate('supervisor_notify');
  const dueStr = new Date(reviewDue).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const vars = { supervisorName: supervisorName || supervisorEmail, supplierName: session.supplier_name };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">Supplier</td><td><strong>${esc(session.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภท</td><td>${esc(session.eval_type)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">คะแนนรวม</td><td>${session.final_score ?? '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#555">กรุณาอนุมัติภายใน</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    ${buttonHtml(t.buttonLabel, FE_URL)}
  `);
  return send(supervisorEmail, renderText(t.subject, vars), html, { emailType: 'supervisor_notify' });
}

// ── 6. Supervisor result → GCP + USER ───────────────────────────
async function sendSupervisorResultEmail(
  toEmail: string,
  toName: string | null | undefined,
  supplier: SupplierEmailInfo,
  status: 'approved' | 'returned' | string,
  notes?: string | null
) {
  const isApproved = status === 'approved';
  const emailType = isApproved ? 'supervisor_result_approved' : 'supervisor_result_returned';
  const t = await getTemplate(emailType);
  const vars = { toName: toName || toEmail, supplierName: supplier.supplier_name };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    ${notes ? `<p style="background:#fff3e0;padding:12px;border-radius:6px;border-left:4px solid #f57f17"><strong>หมายเหตุ:</strong> ${esc(notes).replace(/\n/g, '<br/>')}</p>` : ''}
    ${buttonHtml(t.buttonLabel, FE_URL, '#1565c0')}
  `);
  return send(toEmail, renderText(t.subject, vars), html, { emailType });
}

// ── 7. Supplier eval invite (magic-link, no login) ─────────────
async function sendSupplierEvalInviteEmail(toEmail: string, supplierName: string, evalUrl: string) {
  const t = await getTemplate('supplier_eval_invite');
  const vars = { supplierName };
  const html = wrap(renderText(t.titleTh, vars), `
    ${renderBodyHtml(t.bodyText, vars)}
    ${buttonHtml(t.buttonLabel, evalUrl)}
    <p style="margin-top:16px;color:#888;font-size:12px">ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุจำกัด</p>
  `);
  return send(toEmail, renderText(t.subject, vars), html, { emailType: 'supplier_eval_invite' });
}

module.exports = {
  sendInvitationEmail,
  sendReminderEmail,
  sendOverdueEmail,
  sendOverdueEscalationEmail,
  sendThankyouEmail,
  sendSupervisorNotifyEmail,
  sendSupervisorResultEmail,
  sendSupplierEvalInviteEmail,
  getEmailSetting,
};
