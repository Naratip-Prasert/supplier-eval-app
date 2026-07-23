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

// email_logs exists specifically so send failures (and successes) are
// visible somewhere other than console output, which most deployments
// never persist — previously nothing ever wrote to this table at all.
async function logEmail(
  taskId: number | string | null,
  emailType: string | null,
  toEmail: string,
  subject: string,
  status: 'sent' | 'failed',
  errorMsg?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO email_logs (task_id, email_type, to_email, subject, status, error_msg)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [taskId, emailType, toEmail, subject, status, errorMsg || null]
  ).catch((e: Error) => console.warn('[emailService] email_logs insert failed:', e.message));
}

async function send(
  to: string,
  subject: string,
  html: string,
  { taskId = null, emailType = null }: { taskId?: number | string | null; emailType?: string | null } = {}
) {
  try {
    const result = await resend.emails.send({ from: FROM, to: [to], subject, html });
    await logEmail(taskId, emailType, to, subject, 'sent', null);
    return result;
  } catch (err: any) {
    await logEmail(taskId, emailType, to, subject, 'failed', err.message);
    throw err;
  }
}

// ── 1. Invitation ──────────────────────────────────────────────
async function sendInvitationEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const evalUrl = `${FE_URL}`;
  const html = wrap('แจ้งการประเมิน Supplier', `
    <p>เรียน <strong>${esc(task.assigned_name || task.assigned_email)}</strong></p>
    <p>คุณได้รับมอบหมายให้ประเมิน Supplier รายการต่อไปนี้:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">ชื่อ Supplier</td><td><strong>${esc(supplier.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">รหัส</td><td>${esc(supplier.vendor_code)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภทการประเมิน</td><td>${esc(task.eval_type_label || '')}</td></tr>
      <tr><td style="padding:6px 0;color:#555">วันครบกำหนด</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    <a href="${evalUrl}" style="display:inline-block;background:#1a6b1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">เข้าสู่ระบบประเมิน</a>
  `);
  return send(task.assigned_email, `[SPE] กรุณาประเมิน Supplier: ${supplier.supplier_name}`, html, { taskId: task.id, emailType: 'invitation' });
}

// ── 2. Reminder (7 วันก่อน due) ───────────────────────────────
async function sendReminderEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = wrap('เตือนความจำ: ใกล้ครบกำหนดประเมิน', `
    <p>เรียน <strong>${esc(task.assigned_name || task.assigned_email)}</strong></p>
    <p>คุณยังไม่ได้ส่งผลการประเมิน Supplier <strong>${esc(supplier.supplier_name)}</strong></p>
    <p style="color:#c62828"><strong>ครบกำหนดใน 7 วัน: ${dueStr}</strong></p>
    <a href="${FE_URL}" style="display:inline-block;background:#1a6b1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">ประเมินเดี๋ยวนี้</a>
  `);
  return send(task.assigned_email, `[SPE] เตือน: ครบกำหนดประเมิน ${supplier.supplier_name} ใน 7 วัน`, html, { taskId: task.id, emailType: 'reminder' });
}

// ── 3. Overdue (3 วันหลัง due) ────────────────────────────────
async function sendOverdueEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = wrap('เกินกำหนด: ยังไม่ได้ประเมิน', `
    <p>เรียน <strong>${esc(task.assigned_name || task.assigned_email)}</strong></p>
    <p>การประเมิน Supplier <strong>${esc(supplier.supplier_name)}</strong> เกินกำหนด <strong>${dueStr}</strong> แล้ว 3 วัน</p>
    <p>กรุณาดำเนินการโดยด่วน หากมีข้อขัดข้องกรุณาติดต่อ Admin</p>
    <a href="${FE_URL}" style="display:inline-block;background:#c62828;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">ประเมินทันที</a>
  `);
  return send(task.assigned_email, `[SPE] เกินกำหนด: ยังไม่ประเมิน ${supplier.supplier_name}`, html, { taskId: task.id, emailType: 'overdue' });
}

// ── 3b. Overdue escalation → Supervisor (same 3-day-overdue trigger) ──
async function sendOverdueEscalationEmail(
  supervisorEmail: string,
  supervisorName: string | null | undefined,
  task: TaskEmailInfo & { role?: string },
  supplier: SupplierEmailInfo
) {
  const dueStr = new Date(task.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = wrap('Escalation: งานประเมินเกินกำหนด', `
    <p>เรียน <strong>${esc(supervisorName || supervisorEmail)}</strong></p>
    <p>งานประเมิน Supplier ต่อไปนี้เกินกำหนดมาแล้ว 3 วัน และผู้รับผิดชอบยังไม่ส่งผล:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">Supplier</td><td><strong>${esc(supplier.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">รหัส</td><td>${esc(supplier.vendor_code)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภทการประเมิน</td><td>${esc(task.eval_type_label || '')}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ผู้รับผิดชอบ (${esc(task.role || '')})</td><td>${esc(task.assigned_name || task.assigned_email)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">ครบกำหนด</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    <p>กรุณาติดตามหรือดำเนินการตามความเหมาะสม</p>
    <a href="${FE_URL}" style="display:inline-block;background:#1a6b1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">เข้าสู่ระบบ</a>
  `);
  return send(supervisorEmail, `[SPE] Escalation: เกินกำหนดประเมิน ${supplier.supplier_name}`, html, { taskId: task.id, emailType: 'overdue_escalation' });
}

// ── 4. Thank-you (หลัง submit) ────────────────────────────────
async function sendThankyouEmail(task: TaskEmailInfo, supplier: SupplierEmailInfo) {
  const html = wrap('ขอบคุณสำหรับการประเมิน', `
    <p>เรียน <strong>${esc(task.assigned_name || task.assigned_email)}</strong></p>
    <p>ขอบคุณที่ส่งผลการประเมิน Supplier <strong>${esc(supplier.supplier_name)}</strong> เรียบร้อยแล้ว</p>
    <p>ผลการประเมินจะถูกส่งให้ Supervisor พิจารณาอนุมัติภายใน 7 วัน</p>
  `);
  return send(task.assigned_email, `[SPE] ขอบคุณสำหรับการประเมิน: ${supplier.supplier_name}`, html, { taskId: task.id, emailType: 'thankyou' });
}

// ── 5. Supervisor notification (ทั้ง USER+GCP submit แล้ว) ───────
async function sendSupervisorNotifyEmail(
  supervisorEmail: string,
  supervisorName: string | null | undefined,
  session: SessionEmailInfo,
  reviewDue: string | Date
) {
  const dueStr = new Date(reviewDue).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = wrap('รอการอนุมัติผลประเมิน', `
    <p>เรียน <strong>${esc(supervisorName || supervisorEmail)}</strong></p>
    <p>มีผลการประเมิน Supplier รอการอนุมัติของคุณ:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0;color:#555;width:140px">Supplier</td><td><strong>${esc(session.supplier_name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555">ประเภท</td><td>${esc(session.eval_type)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">คะแนนรวม</td><td>${session.final_score ?? '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#555">กรุณาอนุมัติภายใน</td><td><strong style="color:#c62828">${dueStr}</strong></td></tr>
    </table>
    <a href="${FE_URL}" style="display:inline-block;background:#1a6b1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">เข้าสู่ระบบอนุมัติ</a>
  `);
  return send(supervisorEmail, `[SPE] รออนุมัติ: ผลประเมิน ${session.supplier_name}`, html, { emailType: 'supervisor_notify' });
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
  const titleTh = isApproved ? 'ผลการประเมินได้รับการอนุมัติ' : 'ผลการประเมินถูกส่งคืน';
  const html = wrap(titleTh, `
    <p>เรียน <strong>${esc(toName || toEmail)}</strong></p>
    <p>ผลการประเมิน Supplier <strong>${esc(supplier.supplier_name)}</strong> ได้รับการพิจารณาแล้ว</p>
    <p><strong>ผล: ${isApproved ? '✅ อนุมัติ' : '🔄 ส่งคืนเพื่อแก้ไข'}</strong></p>
    ${notes ? `<p style="background:#fff3e0;padding:12px;border-radius:6px;border-left:4px solid #f57f17"><strong>หมายเหตุ:</strong> ${esc(notes).replace(/\n/g, '<br/>')}</p>` : ''}
    ${!isApproved ? `<a href="${FE_URL}" style="display:inline-block;background:#1565c0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">แก้ไขและส่งใหม่</a>` : ''}
  `);
  const subject = isApproved
    ? `[SPE] อนุมัติแล้ว: ผลประเมิน ${supplier.supplier_name}`
    : `[SPE] กรุณาแก้ไข: ผลประเมิน ${supplier.supplier_name}`;
  return send(toEmail, subject, html, { emailType: 'supervisor_result' });
}

// ── 7. Supplier eval invite (magic-link, no login) ─────────────
async function sendSupplierEvalInviteEmail(toEmail: string, supplierName: string, evalUrl: string) {
  const html = wrap('ขอความคิดเห็นเกี่ยวกับการให้บริการ', `
    <p>เรียน <strong>${esc(supplierName)}</strong></p>
    <p>การประเมินรอบล่าสุดของท่านเสร็จสมบูรณ์แล้ว ทางเราขอความคิดเห็นของท่านเกี่ยวกับการให้บริการของทีมงานที่ดูแลท่าน เพื่อนำไปพัฒนาการทำงานร่วมกันต่อไป</p>
    <a href="${evalUrl}" style="display:inline-block;background:#1a6b1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">ให้ความคิดเห็น</a>
    <p style="margin-top:16px;color:#888;font-size:12px">ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุจำกัด</p>
  `);
  return send(toEmail, `[SPE] ขอความคิดเห็นเกี่ยวกับการให้บริการ`, html, { emailType: 'supplier_eval_invite' });
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
};
