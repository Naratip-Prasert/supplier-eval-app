'use strict';
export {};
const cron = require('node-cron');
const pool = require('../db');
const {
  sendReminderEmail,
  sendOverdueEmail,
  sendOverdueEscalationEmail,
  sendThankyouEmail,
  sendSupervisorNotifyEmail,
  getEmailSetting,
} = require('./emailService');

// ── Daily job: 08:00 Asia/Bangkok ─────────────────────────────
// runDailyEmailJobs itself is the base version, wrapped below by
// runDailyEmailJobsWithPostEval (which adds post_eval/pre_eval-retry
// invitations) — only the wrapped version is ever scheduled, via
// startCronJobsFull exported below as `startCronJobs`.
async function runDailyEmailJobs() {
  console.log('[cron] running daily email jobs...');
  await sendReminderEmails();
  await sendOverdueEmails();
  await sendThankyouEmails();
  await notifySupervisors();
  console.log('[cron] daily email jobs done');
}

// ── 1. Reminder: 7 วันก่อน due ───────────────────────────────
async function sendReminderEmails() {
  try {
    const reminderDaysBefore = await getEmailSetting('reminder_days_before');
    const result = await pool.query(`
      SELECT et.id, et.assigned_email, et.assigned_name, et.due_date,
             et.role, et.session_id,
             s.supplier_name, s.vendor_code
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s ON s.id = et.supplier_id
       WHERE et.status = 'pending'
         AND et.reminder_sent_at IS NULL
         AND et.due_date >= CURRENT_DATE
         AND et.due_date <= CURRENT_DATE + make_interval(days => $1::int)
    `, [reminderDaysBefore]);

    for (const task of result.rows) {
      try {
        await sendReminderEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET reminder_sent_at = NOW() WHERE id = $1`, [task.id]);
        console.log(`[cron] reminder sent → ${task.assigned_email} for ${task.supplier_name}`);
      } catch (e: any) {
        console.warn(`[cron] reminder failed for task ${task.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('[cron] sendReminderEmails error:', e.message);
  }
}

// ── 2. Overdue: 3 วันหลัง due ────────────────────────────────
// Also escalates to every active Supervisor at the same 3-day-overdue
// point (Escalation_Days_After_Overdue in the original spec) — previously
// this job only re-notified the same evaluator who was already late,
// with no visibility for anyone who could actually intervene.
async function sendOverdueEmails() {
  try {
    const overdueDaysAfter = await getEmailSetting('overdue_days_after');
    const result = await pool.query(`
      SELECT et.id, et.assigned_email, et.assigned_name, et.due_date,
             et.role, et.session_id,
             s.supplier_name, s.vendor_code,
             es.eval_type
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s ON s.id = et.supplier_id
        JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
       WHERE et.status = 'pending'
         AND et.overdue_sent_at IS NULL
         AND et.due_date <= CURRENT_DATE - make_interval(days => $1::int)
    `, [overdueDaysAfter]);

    if (result.rows.length === 0) return;

    // Broadcast model, same as notifySupervisors() below — supervisors
    // aren't assigned per-supplier in this schema, so every active
    // Supervisor gets escalation emails.
    const supervisors = await pool.query(`
      SELECT e.emp_no AS id, e.name AS full_name, e.email FROM "Master_Data_GCP" e
       JOIN "SPES_Roles" r ON r.emp_no = e.emp_no
       WHERE r.role = 'SUPERVISOR' AND e.email IS NOT NULL
    `);

    for (const task of result.rows) {
      try {
        await sendOverdueEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
        await pool.query(`
          UPDATE "SPES_evaluation_tasks" SET overdue_sent_at = NOW(), status = 'overdue' WHERE id = $1
        `, [task.id]);
        console.log(`[cron] overdue sent → ${task.assigned_email} for ${task.supplier_name}`);
      } catch (e: any) {
        console.warn(`[cron] overdue failed for task ${task.id}:`, e.message);
        continue; // don't escalate a notice that never actually reached the evaluator
      }

      // Best-effort — a failed escalation send shouldn't undo the
      // evaluator notification above, so it's a separate try/catch.
      for (const sup of supervisors.rows) {
        try {
          await sendOverdueEscalationEmail(
            sup.email, sup.full_name,
            { ...task, eval_type_label: task.eval_type },
            { supplier_name: task.supplier_name, vendor_code: task.vendor_code }
          );
        } catch (e: any) {
          console.warn(`[cron] overdue escalation failed for supervisor ${sup.email}:`, e.message);
        }
      }
    }
  } catch (e: any) {
    console.error('[cron] sendOverdueEmails error:', e.message);
  }
}

// ── 3. Thank-you: หลัง submit แล้วยังไม่ได้ส่ง ───────────────
async function sendThankyouEmails() {
  try {
    const result = await pool.query(`
      SELECT et.id, et.assigned_email, et.assigned_name, et.due_date,
             et.session_id,
             s.supplier_name, s.vendor_code
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s ON s.id = et.supplier_id
       WHERE et.status = 'completed'
         AND et.thankyou_sent_at IS NULL
    `);

    for (const task of result.rows) {
      try {
        await sendThankyouEmail(task, { supplier_name: task.supplier_name, vendor_code: task.vendor_code });
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET thankyou_sent_at = NOW() WHERE id = $1`, [task.id]);
        console.log(`[cron] thankyou sent → ${task.assigned_email} for ${task.supplier_name}`);
      } catch (e: any) {
        console.warn(`[cron] thankyou failed for task ${task.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('[cron] sendThankyouEmails error:', e.message);
  }
}

// ── 4. Notify supervisors for new pending_review sessions ─────
async function notifySupervisors() {
  try {
    // Find reviews that haven't notified supervisor yet. Gated on
    // notified_at IS NULL (a flag, like the other jobs) rather than
    // "created today" — a date-window check ages out and permanently
    // skips the review if the cron doesn't happen to run on the exact
    // day it was created.
    const result = await pool.query(`
      SELECT sr.id AS "reviewId", sr.review_due AS "reviewDue",
             es.id AS "sessionId", es.eval_type AS "evalType",
             es.final_score AS "finalScore",
             s.supplier_name, s.vendor_code
        FROM "SPES_supervisor_reviews" sr
        JOIN "SPES_evaluation_sessions" es ON es.id = sr.session_id
        JOIN "SPES_suppliers" s ON s.id = es.supplier_id
       WHERE sr.status = 'pending'
         AND sr.notified_at IS NULL
    `);

    if (result.rows.length === 0) return;

    // Get all supervisors
    const supervisors = await pool.query(`
      SELECT e.emp_no AS id, e.name AS full_name, e.email FROM "Master_Data_GCP" e
       JOIN "SPES_Roles" r ON r.emp_no = e.emp_no
       WHERE r.role = 'SUPERVISOR' AND e.email IS NOT NULL
    `);

    for (const review of result.rows) {
      // Only mark notified once at least one supervisor actually got the
      // email — same reasoning as sendPreEvalInvitations below: marking it
      // sent when every send failed (e.g. Resend outage) would leave the
      // review permanently un-notified with nothing left to retry it,
      // since the query above is gated on notified_at IS NULL.
      let anySent = false;
      for (const sup of supervisors.rows) {
        try {
          await sendSupervisorNotifyEmail(
            sup.email, sup.full_name,
            { supplier_name: review.supplier_name, eval_type: review.evalType, final_score: review.finalScore },
            review.reviewDue
          );
          anySent = true;
        } catch (e: any) {
          console.warn(`[cron] supervisor notify failed for ${sup.email}:`, e.message);
        }
      }
      if (anySent) {
        await pool.query(`UPDATE "SPES_supervisor_reviews" SET notified_at = NOW() WHERE id = $1`, [review.reviewId]);
      }
    }
  } catch (e: any) {
    console.error('[cron] notifySupervisors error:', e.message);
  }
}

// ── Also handle post_eval invitation: 7 วันก่อน due ──────────
// This is separate from the daily job since post_eval due = pta + 90 days
// Cron: หา tasks ที่ invitation_sent_at IS NULL AND due_date = TODAY + 7 (post_eval only)
async function sendPostEvalInvitations() {
  try {
    const result = await pool.query(`
      SELECT et.id, et.assigned_email, et.assigned_name, et.due_date, et.role,
             s.supplier_name, s.vendor_code,
             es.eval_type
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s            ON s.id  = et.supplier_id
        JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
       WHERE et.status = 'pending'
         AND et.invitation_sent_at IS NULL
         AND es.eval_type = 'post_eval'
         AND et.due_date >= CURRENT_DATE
         AND et.due_date <= CURRENT_DATE + INTERVAL '7 days'
    `);

    const { sendInvitationEmail } = require('./emailService');
    for (const task of result.rows) {
      try {
        await sendInvitationEmail(
          { ...task, eval_type_label: 'Post Evaluation (90 วัน)' },
          { supplier_name: task.supplier_name, vendor_code: task.vendor_code }
        );
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]);
        console.log(`[cron] post_eval invitation sent → ${task.assigned_email}`);
      } catch (e: any) {
        console.warn(`[cron] post_eval invitation failed for task ${task.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('[cron] sendPostEvalInvitations error:', e.message);
  }
}

// ── Retry pre_eval invitations that failed at upload time ─────
// pre_eval invitations are sent immediately on admin upload
// (server/routes/admin.js), fire-and-forget — if that send fails (e.g.
// transient Resend outage during a bulk upload), invitation_sent_at
// stays NULL forever with nothing to retry it, unlike post_eval which
// the cron above already catches. No due_date window here: a pre_eval
// invitation should go out as soon as possible regardless of how far
// off its due date is, so just keep retrying until it succeeds.
async function sendPreEvalInvitations() {
  try {
    const result = await pool.query(`
      SELECT et.id, et.assigned_email, et.assigned_name, et.due_date, et.role,
             s.supplier_name, s.vendor_code
        FROM "SPES_evaluation_tasks" et
        JOIN "SPES_suppliers" s            ON s.id  = et.supplier_id
        JOIN "SPES_evaluation_sessions" es ON es.id = et.session_id
       WHERE et.status = 'pending'
         AND et.invitation_sent_at IS NULL
         AND es.eval_type = 'pre_eval'
    `);

    const { sendInvitationEmail } = require('./emailService');
    for (const task of result.rows) {
      try {
        await sendInvitationEmail(
          { ...task, eval_type_label: 'Pre-Evaluation (Supplier ใหม่)' },
          { supplier_name: task.supplier_name, vendor_code: task.vendor_code }
        );
        await pool.query(`UPDATE "SPES_evaluation_tasks" SET invitation_sent_at = NOW() WHERE id = $1`, [task.id]);
        console.log(`[cron] pre_eval invitation (retry) sent → ${task.assigned_email}`);
      } catch (e: any) {
        console.warn(`[cron] pre_eval invitation retry failed for task ${task.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('[cron] sendPreEvalInvitations error:', e.message);
  }
}

// Add post_eval + pre_eval-retry invitations to the daily run
const _origRun = runDailyEmailJobs;
async function runDailyEmailJobsWithPostEval() {
  await _origRun();
  await sendPostEvalInvitations();
  await sendPreEvalInvitations();
}

// Override cron schedule to include post_eval invitations
function startCronJobsFull() {
  cron.schedule('0 8 * * *', runDailyEmailJobsWithPostEval, { timezone: 'Asia/Bangkok' });
  console.log('✅ Cron jobs started (daily 08:00 Bangkok)');
}

module.exports = { startCronJobs: startCronJobsFull };
