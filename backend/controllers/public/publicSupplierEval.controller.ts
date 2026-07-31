'use strict';
// ============================================================
//  controllers/public/publicSupplierEval.controller.ts
//  Cross-evaluation #3 (database/CROSS_EVALUATION_SPEC.md):
//  Supplier rates the User/Buyer who evaluated them, via a
//  one-time emailed magic-link — NOT mounted behind requireAuth
//  in server.ts, since suppliers have no login in this system.
//
//  GET  /api/public/supplier-eval/:token   — load who/what to rate
//  POST /api/public/supplier-eval/:token   — submit ratings
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');
const { computeScoreAndGrade } = require('../shared/evaluations.controller');

async function loadToken(token: string) {
  const result = await pool.query(
    `SELECT t.id, t.session_id AS "sessionId", t.supplier_id AS "supplierId",
            t.expires_at AS "expiresAt", t.used_at AS "usedAt",
            s.supplier_name AS "supplierName"
       FROM "SPES_supplier_eval_tokens" t
       JOIN "SPES_suppliers" s ON s.id = t.supplier_id
      WHERE t.token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

// ── GET /:token — who to rate + criteria to rate them on ──────
async function getToken(req: Request, res: Response) {
  try {
    const row = await loadToken(req.params.token as string);
    if (!row) return res.status(404).json({ message: 'ไม่พบลิงก์นี้' });
    if (row.usedAt) return res.status(410).json({ message: 'ลิงก์นี้ถูกใช้ไปแล้ว' });
    if (new Date(row.expiresAt) < new Date()) return res.status(410).json({ message: 'ลิงก์นี้หมดอายุแล้ว' });

    // Independent queries, no shared client/transaction — run concurrently
    // instead of paying two sequential round trips.
    const [targetsResult, catResult, itemResult] = await Promise.all([
      pool.query(
        `SELECT ev.role, e.emp_no AS "employeeId", e.name AS "fullName"
           FROM "SPES_evaluations" ev
           JOIN "Master_Data_All" e ON e.emp_no = ev.employee_id
          WHERE ev.session_id = $1 AND ev.role IN ('USER', 'GCP') AND ev.status = 'saved'`,
        [row.sessionId]
      ),
      pool.query(
        `SELECT id, name_th AS "nameTh", total_weight AS "totalWeight", display_order AS "displayOrder"
           FROM "SPES_evaluation_main_criteria"
          WHERE code LIKE 'SVC%' AND is_active = TRUE
          ORDER BY display_order`
      ),
      pool.query(
        `SELECT s.id, s.category_id AS "categoryId", s.code, s.name_th AS "nameTh",
                s.default_weight AS "defaultWeight", s.display_order AS "displayOrder"
           FROM "SPES_evaluation_sub_criteria" s
           JOIN "SPES_evaluation_main_criteria" m ON m.id = s.category_id
          WHERE s.criteria_set = 'service' AND s.is_active = TRUE AND m.is_active = TRUE
          ORDER BY s.display_order`
      ),
    ]);

    // Same shape as GET /api/service-evaluations/criteria — sections of
    // items, each item carrying its 1-5 level description text, so this
    // page can render the same colored-level-card grid as service-eval
    // instead of the old flat list of plain numbered buttons.
    const itemIds = itemResult.rows.map((r: any) => r.id);
    const levelResult = itemIds.length
      ? await pool.query(
          `SELECT criterion_id AS "criterionId", level, description FROM "SPES_score_level_descriptions"
            WHERE criterion_id = ANY($1::uuid[]) ORDER BY criterion_id, level`,
          [itemIds]
        )
      : { rows: [] };
    const levelsByCrit: Record<string, string[]> = {};
    levelResult.rows.forEach((r: any) => { (levelsByCrit[r.criterionId] ??= [])[r.level - 1] = r.description; });

    const itemsByCat: Record<string, any[]> = {};
    itemResult.rows.forEach((it: any) => {
      (itemsByCat[it.categoryId] ??= []).push({ ...it, defaultWeight: parseFloat(it.defaultWeight), levels: levelsByCrit[it.id] ?? [] });
    });
    const sections = catResult.rows.map((c: any) => ({ ...c, totalWeight: parseFloat(c.totalWeight), items: itemsByCat[c.id] ?? [] }));

    res.json({
      supplierName: row.supplierName,
      targets: targetsResult.rows,
      sections,
    });
  } catch (err: any) {
    console.error('GET /api/public/supplier-eval/:token error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
}

// ── POST /:token — submit ratings for one or both targets ─────
// Body: { ratings: [ { targetEmployeeId, role: 'USER'|'GCP', scores: { code: { score, weight? } } } ] }
async function submitToken(req: Request, res: Response) {
  const { ratings } = req.body;
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลคะแนน' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE locks the token row for the rest of this transaction — a
    // concurrent POST for the same token (double-click, retry) blocks here
    // until this transaction commits or rolls back, then sees used_at
    // already set and bails out below instead of racing past the check.
    const tokenResult = await client.query(
      `SELECT t.id, t.session_id AS "sessionId", t.supplier_id AS "supplierId",
              t.expires_at AS "expiresAt", t.used_at AS "usedAt",
              s.supplier_name AS "supplierName"
         FROM "SPES_supplier_eval_tokens" t
         JOIN "SPES_suppliers" s ON s.id = t.supplier_id
        WHERE t.token = $1
        FOR UPDATE OF t`,
      [req.params.token]
    );
    const row = tokenResult.rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'ไม่พบลิงก์นี้' }); }
    if (row.usedAt) { await client.query('ROLLBACK'); return res.status(410).json({ message: 'ลิงก์นี้ถูกใช้ไปแล้ว' }); }
    if (new Date(row.expiresAt) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ message: 'ลิงก์นี้หมดอายุแล้ว' }); }

    // Claim the token now, before inserting anything — closes the window a
    // concurrent request could otherwise slip through.
    await client.query(`UPDATE "SPES_supplier_eval_tokens" SET used_at = NOW() WHERE id = $1`, [row.id]);

    const criteriaResult = await client.query(
      `SELECT code, default_weight FROM "SPES_evaluation_sub_criteria"
        WHERE criteria_set = 'service' AND is_active = TRUE`
    );
    const criteriaMap: Record<string, { default_weight: number }> = {};
    criteriaResult.rows.forEach((c: any) => { criteriaMap[c.code] = { default_weight: c.default_weight }; });

    for (const rating of ratings) {
      const { targetEmployeeId, role, scores } = rating;
      if (!targetEmployeeId || !['USER', 'GCP'].includes(role) || typeof scores !== 'object') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'ข้อมูล rating ไม่ถูกต้อง' });
      }

      const { totalScore, grade } = await computeScoreAndGrade(client, scores, criteriaMap);

      const direction = role === 'USER' ? 'supplier_to_user' : 'supplier_to_gcp';
      const insertRes = await client.query(
        `INSERT INTO "SPES_service_evaluations"
           (session_id, direction, evaluator_supplier_id, target_employee_id, total_score, grade, raw_scores)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (session_id, direction, target_employee_id) DO NOTHING
         RETURNING id`,
        [row.sessionId, direction, row.supplierId, targetEmployeeId, totalScore, grade, JSON.stringify(scores)]
      );
      if (insertRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'ให้คะแนนรายการนี้ไปแล้ว' });
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'ขอบคุณสำหรับความคิดเห็น' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/public/supplier-eval/:token error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  } finally {
    client.release();
  }
}

module.exports = { getToken, submitToken };
