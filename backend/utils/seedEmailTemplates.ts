'use strict';
// ============================================================
//  utils/seedEmailTemplates.ts
//  Seeds email_templates + email_settings with today's exact hardcoded
//  copy from emailService.ts / cronJobs.ts / admin.controller.ts /
//  evaluations.controller.ts — idempotent (ON CONFLICT DO NOTHING), so
//  behavior is unchanged until an admin actually edits a row via the
//  Email Parameter admin page.
// ============================================================
import type { PoolClient } from 'pg';

interface TemplateSeed {
  emailType: string;
  subject: string;
  titleTh: string;
  bodyText: string;
  buttonLabel: string | null;
}

// {{placeholders}} — see renderTemplate() in emailService.ts for the exact
// variable set each email type builds.
const TEMPLATES: TemplateSeed[] = [
  {
    emailType: 'invitation',
    subject: '[SPE] กรุณาประเมิน Supplier: {{supplierName}}',
    titleTh: 'แจ้งการประเมิน Supplier',
    bodyText: 'เรียน {{assignedName}}\n\nคุณได้รับมอบหมายให้ประเมิน Supplier รายการต่อไปนี้:',
    buttonLabel: 'เข้าสู่ระบบประเมิน',
  },
  {
    emailType: 'reminder',
    subject: '[SPE] เตือน: ครบกำหนดประเมิน {{supplierName}} ใน {{reminderDaysBefore}} วัน',
    titleTh: 'เตือนความจำ: ใกล้ครบกำหนดประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nคุณยังไม่ได้ส่งผลการประเมิน Supplier {{supplierName}}\n\nครบกำหนดใน {{reminderDaysBefore}} วัน: {{dueDate}}',
    buttonLabel: 'ประเมินเดี๋ยวนี้',
  },
  {
    emailType: 'overdue',
    subject: '[SPE] เกินกำหนด: ยังไม่ประเมิน {{supplierName}}',
    titleTh: 'เกินกำหนด: ยังไม่ได้ประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nการประเมิน Supplier {{supplierName}} เกินกำหนด {{dueDate}} แล้ว {{overdueDaysAfter}} วัน\n\nกรุณาดำเนินการโดยด่วน หากมีข้อขัดข้องกรุณาติดต่อ Admin',
    buttonLabel: 'ประเมินทันที',
  },
  {
    emailType: 'overdue_escalation',
    subject: '[SPE] Escalation: เกินกำหนดประเมิน {{supplierName}}',
    titleTh: 'Escalation: งานประเมินเกินกำหนด',
    bodyText: 'เรียน {{supervisorName}}\n\nงานประเมิน Supplier ต่อไปนี้เกินกำหนดมาแล้ว {{overdueDaysAfter}} วัน และผู้รับผิดชอบยังไม่ส่งผล:',
    buttonLabel: 'เข้าสู่ระบบ',
  },
  {
    emailType: 'thankyou',
    subject: '[SPE] ขอบคุณสำหรับการประเมิน: {{supplierName}}',
    titleTh: 'ขอบคุณสำหรับการประเมิน',
    bodyText: 'เรียน {{assignedName}}\n\nขอบคุณที่ส่งผลการประเมิน Supplier {{supplierName}} เรียบร้อยแล้ว\n\nผลการประเมินจะถูกส่งให้ Supervisor พิจารณาอนุมัติภายใน {{reviewDueDays}} วัน',
    buttonLabel: null,
  },
  {
    emailType: 'supervisor_notify',
    subject: '[SPE] รออนุมัติ: ผลประเมิน {{supplierName}}',
    titleTh: 'รอการอนุมัติผลประเมิน',
    bodyText: 'เรียน {{supervisorName}}\n\nมีผลการประเมิน Supplier รอการอนุมัติของคุณ:',
    buttonLabel: 'เข้าสู่ระบบอนุมัติ',
  },
  {
    emailType: 'supervisor_result_approved',
    subject: '[SPE] อนุมัติแล้ว: ผลประเมิน {{supplierName}}',
    titleTh: 'ผลการประเมินได้รับการอนุมัติ',
    bodyText: 'เรียน {{toName}}\n\nผลการประเมิน Supplier {{supplierName}} ได้รับการพิจารณาแล้ว\n\nผล: ✅ อนุมัติ',
    buttonLabel: null,
  },
  {
    emailType: 'supervisor_result_returned',
    subject: '[SPE] กรุณาแก้ไข: ผลประเมิน {{supplierName}}',
    titleTh: 'ผลการประเมินถูกส่งคืน',
    bodyText: 'เรียน {{toName}}\n\nผลการประเมิน Supplier {{supplierName}} ได้รับการพิจารณาแล้ว\n\nผล: 🔄 ส่งคืนเพื่อแก้ไข',
    buttonLabel: 'แก้ไขและส่งใหม่',
  },
  {
    emailType: 'supplier_eval_invite',
    subject: 'ขอความคิดเห็นเกี่ยวกับการให้บริการ',
    titleTh: 'ขอความคิดเห็นเกี่ยวกับการให้บริการ',
    bodyText: 'เรียน {{supplierName}}\n\nการประเมินรอบล่าสุดของท่านเสร็จสมบูรณ์แล้ว ทางเราขอความคิดเห็นของท่านเกี่ยวกับการให้บริการของทีมงานที่ดูแลท่าน เพื่อนำไปพัฒนาการทำงานร่วมกันต่อไป',
    buttonLabel: 'ให้ความคิดเห็น',
  },
];

const SETTINGS: { key: string; value: number; labelTh: string }[] = [
  { key: 'reminder_days_before', value: 7,  labelTh: 'เตือนล่วงหน้าก่อนครบกำหนด (วัน)' },
  { key: 'overdue_days_after',   value: 3,  labelTh: 'แจ้งเกินกำหนดหลังครบกำหนด (วัน)' },
  { key: 'review_due_days',      value: 7,  labelTh: 'ระยะเวลาให้ Supervisor อนุมัติ (วัน)' },
  { key: 'pre_eval_due_days',    value: 30, labelTh: 'ครบกำหนดประเมิน Pre-Evaluation (วัน)' },
  { key: 'post_eval_due_days',   value: 90, labelTh: 'ครบกำหนดประเมิน Post-Evaluation หลัง PTA (วัน)' },
  { key: 'periodic_due_days',    value: 7,  labelTh: 'ครบกำหนดประเมิน Half-Year/Yearly (วัน)' },
];

async function seedEmailTemplates(client: PoolClient): Promise<void> {
  for (const t of TEMPLATES) {
    await client.query(
      `INSERT INTO "SPES_email_templates" (email_type, subject, title_th, body_text, button_label)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email_type) DO NOTHING`,
      [t.emailType, t.subject, t.titleTh, t.bodyText, t.buttonLabel]
    );
  }
  for (const s of SETTINGS) {
    await client.query(
      `INSERT INTO "SPES_email_settings" (key, value, label_th)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value, s.labelTh]
    );
  }
}

module.exports = { seedEmailTemplates };
