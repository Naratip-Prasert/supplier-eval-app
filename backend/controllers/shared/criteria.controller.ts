'use strict';
// ============================================================
//  controllers/shared/criteria.controller.ts
//  GET  /api/criteria                      — full form structure
//  PATCH /api/criteria/categories/:id      — update section (ADMIN)
//  PATCH /api/criteria/items/:id           — update item (ADMIN)
//  PATCH /api/criteria/items/:id/levels    — update levels (ADMIN)
//  PUT   /api/criteria/reorder             — reorder sections (ADMIN)
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');

// ── GET /api/criteria ─────────────────────────────────────────
async function getCriteria(req: Request, res: Response) {
  try {
    const et = (req.query.evalType as string) ?? '';
    // Flat, single-group criteria sets (service-direction evaluations) —
    // no Core/Function/ESG split, just sections summing to 100%. Mirrors
    // the read pattern in serviceEvaluations.controller.ts's criteria().
    const FLAT_SETS: Record<string, string> = { service: 'SVC%', sup2user: 'S2U%' };
    const isFlatLoad = et in FLAT_SETS;
    const isFunctionLoad = et === 'function' || /^m\d+$/i.test(et);
    // Function modules are configured separately per Pre/Post track (each
    // track needs its own weight so Core+Func+ESG can independently total
    // 100% for that track — e.g. Post is 60+26+14, Pre is 60+25+15).
    // Defaults to 'post' for callers that don't pass it (back-compat).
    const track = req.query.track === 'pre' ? 'pre' : 'post';
    const funcCodePrefix = track === 'pre' ? 'FUNC-PRE-M' : 'FUNC-POST-M';
    const funcSetPrefix  = track === 'pre' ? 'pre_m'      : 'post_m';

    let categoriesResult, criteriaResult, levelsResult;

    if (isFlatLoad) {
      [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
        pool.query(
          `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                  total_weight AS "totalWeight", display_order AS "displayOrder"
             FROM evaluation_main_criteria
            WHERE code LIKE $1 AND (is_active = TRUE OR is_active IS NULL)
            ORDER BY display_order, code`,
          [FLAT_SETS[et]]
        ),
        pool.query(
          `SELECT id, category_id AS "categoryId", code,
                  name_th AS "nameTh", name_en AS "nameEn",
                  detail_th AS "detailTh",
                  default_weight AS "defaultWeight",
                  display_order AS "displayOrder",
                  is_active AS "isActive",
                  level_values AS "levelValues"
             FROM evaluation_sub_criteria
            WHERE criteria_set = $1 AND is_active = TRUE
            ORDER BY display_order, code`,
          [et]
        ),
        pool.query(
          `SELECT criterion_id AS "criterionId", level, description
             FROM score_level_descriptions
            ORDER BY criterion_id, level`
        ),
      ]);
    } else if (isFunctionLoad) {
      const isAllModules = et === 'function';
      [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
        isAllModules
          ? pool.query(
              `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                      total_weight AS "totalWeight", display_order AS "displayOrder"
                 FROM evaluation_main_criteria
                WHERE code LIKE $1 AND (is_active = TRUE OR is_active IS NULL)
                ORDER BY substring(code from '${funcCodePrefix}(\\d+)')::integer, code`,
              [`${funcCodePrefix}%`]
            )
          : pool.query(
              `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                      total_weight AS "totalWeight", display_order AS "displayOrder"
                 FROM evaluation_main_criteria
                WHERE code = $1 AND (is_active = TRUE OR is_active IS NULL)`,
              [`${funcCodePrefix}${et.replace(/^m/i, '')}`]
            ),
        isAllModules
          ? pool.query(
              `SELECT id, category_id AS "categoryId", code,
                      name_th AS "nameTh", name_en AS "nameEn",
                      detail_th AS "detailTh",
                      default_weight AS "defaultWeight",
                      display_order AS "displayOrder",
                      is_active AS "isActive",
                      level_values AS "levelValues"
                 FROM evaluation_sub_criteria
                WHERE criteria_set ~ $1
                ORDER BY substring(criteria_set from '^${funcSetPrefix}(\\d+)')::integer, display_order`,
              [`^${funcSetPrefix}[0-9]+$`]
            )
          : pool.query(
              `SELECT id, category_id AS "categoryId", code,
                      name_th AS "nameTh", name_en AS "nameEn",
                      detail_th AS "detailTh",
                      default_weight AS "defaultWeight",
                      display_order AS "displayOrder",
                      is_active AS "isActive",
                      level_values AS "levelValues"
                 FROM evaluation_sub_criteria
                WHERE criteria_set = $1
                ORDER BY display_order`,
              [`${funcSetPrefix}${et.replace(/^m/i, '').toLowerCase()}`]
            ),
        pool.query(
          `SELECT criterion_id AS "criterionId", level, description
             FROM score_level_descriptions
            ORDER BY criterion_id, level`
        ),
      ]);
    } else {
      const criteriaSet = ['post_eval', 'half_year', 'yearly', 'ad_hoc'].includes(et)
        ? 'post_eval'
        : 'pre_eval';
      [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
        pool.query(
          `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                  total_weight AS "totalWeight", display_order AS "displayOrder",
                  group_weights AS "groupWeights", group_labels AS "groupLabels"
             FROM evaluation_main_criteria
            WHERE code LIKE $1 AND (is_active = TRUE OR is_active IS NULL)
            ORDER BY display_order, code`,
          [criteriaSet === 'post_eval' ? 'POST-%' : 'PRE-%']
        ),
        pool.query(
          `SELECT id, category_id AS "categoryId", code,
                  name_th AS "nameTh", name_en AS "nameEn",
                  detail_th AS "detailTh",
                  default_weight AS "defaultWeight",
                  display_order AS "displayOrder",
                  is_active AS "isActive",
                  level_values AS "levelValues"
             FROM evaluation_sub_criteria
            WHERE criteria_set = $1
            ORDER BY display_order, code`,
          [criteriaSet]
        ),
        pool.query(
          `SELECT criterion_id AS "criterionId", level, description
             FROM score_level_descriptions
            ORDER BY criterion_id, level`
        ),
      ]);
    }

    const levelsByCriterion: Record<string, any[]> = {};
    levelsResult.rows.forEach((row: any) => {
      if (!levelsByCriterion[row.criterionId]) levelsByCriterion[row.criterionId] = [];
      levelsByCriterion[row.criterionId].push(row.description);
    });

    const criteriaByCategory: Record<string, any[]> = {};
    criteriaResult.rows.forEach((c: any) => {
      if (!criteriaByCategory[c.categoryId]) criteriaByCategory[c.categoryId] = [];
      criteriaByCategory[c.categoryId].push({
        id:            c.id,
        code:          c.code,
        nameTh:        c.nameTh,
        nameEn:        c.nameEn,
        detailTh:      c.detailTh,
        defaultWeight: parseFloat(c.defaultWeight),
        displayOrder:  c.displayOrder,
        isActive:      c.isActive,
        levelValues:   Array.isArray(c.levelValues) ? c.levelValues : null,
        levels:        levelsByCriterion[c.id] ?? [],
      });
    });

    const response = categoriesResult.rows.map((cat: any) => ({
      id:           cat.id,
      code:         cat.code,
      nameTh:       cat.nameTh,
      nameEn:       cat.nameEn,
      totalWeight:  parseFloat(cat.totalWeight),
      displayOrder: cat.displayOrder,
      groupWeights: cat.groupWeights ?? null,
      groupLabels:  cat.groupLabels ?? null,
      items:        criteriaByCategory[cat.id] ?? [],
    }));

    res.json(response);
  } catch (err: any) {
    console.error('GET /api/criteria error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── DELETE /api/criteria/categories/:id ──────────────────────
// Soft-delete: SET is_active=FALSE (preserves history / score references).
// Items inside are also soft-deleted via is_active=FALSE.
async function deleteCategory(req: Request, res: Response) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE evaluation_sub_criteria SET is_active = FALSE WHERE category_id = $1`,
      [id]
    );
    const result = await client.query(
      `UPDATE evaluation_main_criteria SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'ไม่พบข้อมูล' }); }
    await client.query('COMMIT');
    res.json({ message: 'ลบหัวข้อสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/criteria/categories/:id error:', err);
    res.status(500).json({ message: 'ลบหัวข้อไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── PATCH /api/criteria/categories/:id ───────────────────────
async function updateCategory(req: Request, res: Response) {
  const { id } = req.params;
  const { nameTh, totalWeight, groupWeights, groupLabels } = req.body;
  if (nameTh === undefined && totalWeight === undefined && groupWeights === undefined && groupLabels === undefined) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
  }
  if (nameTh !== undefined && !nameTh?.trim()) {
    return res.status(400).json({ message: 'nameTh ต้องไม่เป็นค่าว่าง' });
  }
  // {} is truthy in JS — criteriaOverlay.js's `if (!groupWeights) return items`
  // guard doesn't catch it, so an empty object silently drops every ESG
  // group/item instead of falling back to "no override". Only null (no
  // override) or a populated object are valid; {} is neither.
  if (groupWeights !== undefined && groupWeights !== null &&
      (typeof groupWeights !== 'object' || Array.isArray(groupWeights) || Object.keys(groupWeights).length === 0)) {
    return res.status(400).json({ message: 'groupWeights ต้องเป็น null หรือ object ที่มีอย่างน้อย 1 กลุ่ม' });
  }
  // groupLabels:{} isn't dangerous the way groupWeights:{} is (reconcileEsgGroups
  // only reads it via `?.[key]`, never gates on truthiness) — rejected anyway
  // for consistency: same null-or-populated-object contract as groupWeights,
  // so callers don't have to remember which of the two jsonb fields tolerates {}.
  if (groupLabels !== undefined && groupLabels !== null &&
      (typeof groupLabels !== 'object' || Array.isArray(groupLabels) || Object.keys(groupLabels).length === 0)) {
    return res.status(400).json({ message: 'groupLabels ต้องเป็น null หรือ object ที่มีอย่างน้อย 1 กลุ่ม' });
  }
  try {
    // group_weights/group_labels support an explicit `null` to CLEAR the
    // column, distinct from "not sent" (keep as-is) — a plain COALESCE
    // can't tell those apart, so each gets its own "did the caller send
    // this field at all" flag param instead.
    const result = await pool.query(
      `UPDATE evaluation_main_criteria
          SET name_th       = COALESCE($1, name_th),
              total_weight  = COALESCE($2, total_weight),
              group_weights = CASE WHEN $3 THEN $4::jsonb ELSE group_weights END,
              group_labels  = CASE WHEN $5 THEN $6::jsonb ELSE group_labels END
        WHERE id = $7
        RETURNING id`,
      [
        nameTh      !== undefined ? nameTh : null,
        totalWeight !== undefined ? Number(totalWeight) : null,
        groupWeights !== undefined,
        groupWeights !== undefined ? (groupWeights === null ? null : JSON.stringify(groupWeights)) : null,
        groupLabels !== undefined,
        groupLabels !== undefined ? (groupLabels === null ? null : JSON.stringify(groupLabels)) : null,
        id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'อัปเดตหัวข้อสำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/criteria/categories/:id error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ' });
  }
}

// ── POST /api/criteria/categories — เพิ่ม section ใหม่ ──────────
async function createCategory(req: Request, res: Response) {
  const { nameTh, totalWeight, codePrefix, type, track } = req.body;
  if (!nameTh?.trim())
    return res.status(400).json({ message: 'กรุณาระบุ nameTh' });
  if (type !== 'function' && !codePrefix?.trim())
    return res.status(400).json({ message: 'กรุณาระบุ codePrefix' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let code;

    if (type === 'function') {
      // Function modules are configured separately per Pre/Post track (see
      // GET / above) — same idea as PRE-CORE*/POST-CORE*, just for FUNC-*.
      const funcPrefix = track === 'pre' ? 'FUNC-PRE-M' : 'FUNC-POST-M';
      // Reactivate an inactive FUNC-{PRE|POST}-M{n} if one exists, otherwise create next sequential
      const inactiveRes = await client.query(
        `SELECT id, code, display_order AS "displayOrder"
           FROM evaluation_main_criteria
          WHERE code LIKE $1 AND is_active = FALSE
          ORDER BY substring(code from '${funcPrefix}(\\d+)')::integer
          LIMIT 1`,
        [`${funcPrefix}%`]
      );
      if (inactiveRes.rows.length > 0) {
        const row = inactiveRes.rows[0];
        // Recycles the category row (code stays stable, no gaps) but does
        // NOT auto-reactivate its old sub_criteria — those could be stale
        // test junk from whatever this category was before, and reviving
        // them silently would mismatch the "items: []" this endpoint always
        // reports for a "new" category. Admin re-adds items explicitly.
        await client.query(
          `UPDATE evaluation_main_criteria SET is_active=TRUE, name_th=$1, total_weight=$2 WHERE id=$3`,
          [nameTh.trim(), Number(totalWeight) || 0, row.id]
        );
        await client.query('COMMIT');
        return res.json({ id: row.id, code: row.code, nameTh: nameTh.trim(), totalWeight: Number(totalWeight) || 0, displayOrder: row.displayOrder, items: [] });
      }
      // No inactive row — generate next sequential code
      const { rows } = await client.query(
        `SELECT code FROM evaluation_main_criteria WHERE code LIKE $1 ORDER BY code`,
        [`${funcPrefix}%`]
      );
      const nums = rows.map((r: any) => { const m = r.code.match(new RegExp(`^${funcPrefix}(\\d+)$`, 'i')); return m ? parseInt(m[1], 10) : 0; }).filter(Boolean);
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      code = `${funcPrefix}${nextNum}`;
    } else {
      const prefix = codePrefix.trim();
      // Reactivate first inactive category with this prefix if one exists
      const inactiveRes = await client.query(
        `SELECT id, code, display_order AS "displayOrder"
           FROM evaluation_main_criteria
          WHERE code LIKE $1 AND is_active = FALSE
          ORDER BY display_order
          LIMIT 1`,
        [`${prefix}%`]
      );
      if (inactiveRes.rows.length > 0) {
        const row = inactiveRes.rows[0];
        // Recycles the category row (code stays stable, no gaps) but does
        // NOT auto-reactivate its old sub_criteria — those could be stale
        // test junk from whatever this category was before, and reviving
        // them silently would mismatch the "items: []" this endpoint always
        // reports for a "new" category. Admin re-adds items explicitly.
        await client.query(
          `UPDATE evaluation_main_criteria SET is_active=TRUE, name_th=$1, total_weight=$2 WHERE id=$3`,
          [nameTh.trim(), Number(totalWeight) || 0, row.id]
        );
        await client.query('COMMIT');
        return res.json({ id: row.id, code: row.code, nameTh: nameTh.trim(), totalWeight: Number(totalWeight) || 0, displayOrder: row.displayOrder, items: [] });
      }
      // No inactive row — generate next available code
      let n = 1;
      while (true) {
        code = `${prefix}${n}`;
        const { rowCount } = await client.query('SELECT 1 FROM evaluation_main_criteria WHERE code=$1', [code]);
        if (rowCount === 0) break;
        n++;
      }
    }

    // Compute display_order: CORE sections go before ESG in the same family.
    const prefix = codePrefix?.trim() ?? '';
    let nextOrder;
    const isCoreSection = /^(PRE|POST)-CORE$/i.test(prefix);
    if (isCoreSection) {
      // Find ESG's current display_order, shift ESG up, slot new CORE in its place.
      const esgCode = prefix.startsWith('PRE') ? 'PRE-ESG' : 'POST-ESG';
      const esgRes = await client.query(
        `SELECT display_order FROM evaluation_main_criteria WHERE code = $1`,
        [esgCode]
      );
      if (esgRes.rows.length > 0) {
        const esgOrder = esgRes.rows[0].display_order;
        await client.query(
          `UPDATE evaluation_main_criteria SET display_order = display_order + 1 WHERE code = $1`,
          [esgCode]
        );
        nextOrder = esgOrder;
      } else {
        // No ESG found — fall back to MAX+1 across the family
        const orderLikePat = prefix.startsWith('PRE') ? 'PRE-%' : 'POST-%';
        const orderRes = await client.query(
          `SELECT COALESCE(MAX(display_order),0)+1 AS next FROM evaluation_main_criteria WHERE code LIKE $1`,
          [orderLikePat]
        );
        nextOrder = parseInt(orderRes.rows[0].next);
      }
    } else {
      const orderLikePat = type === 'function' ? (track === 'pre' ? 'FUNC-PRE-M%' : 'FUNC-POST-M%')
        : prefix.startsWith('PRE')  ? 'PRE-%'
        : prefix.startsWith('POST') ? 'POST-%'
        : `${prefix}%`;
      const orderRes = await client.query(
        `SELECT COALESCE(MAX(display_order),0)+1 AS next FROM evaluation_main_criteria WHERE code LIKE $1`,
        [orderLikePat]
      );
      nextOrder = parseInt(orderRes.rows[0].next);
    }
    const result = await client.query(
      `INSERT INTO evaluation_main_criteria (code, name_th, total_weight, display_order, is_active)
       VALUES ($1,$2,$3,$4,TRUE)
       RETURNING id, code, name_th AS "nameTh", total_weight AS "totalWeight", display_order AS "displayOrder"`,
      [code, nameTh.trim(), Number(totalWeight) || 0, nextOrder]
    );
    await client.query('COMMIT');
    res.json({ ...result.rows[0], items: [] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/criteria/categories error:', err);
    res.status(500).json({ message: 'เพิ่มหัวข้อไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── POST /api/criteria/items — เพิ่ม item ใหม่ ───────────────
async function createItem(req: Request, res: Response) {
  const { categoryId, code, nameTh, defaultWeight, criteriaSet, levels } = req.body;
  if (!categoryId || !code || !nameTh || !criteriaSet)
    return res.status(400).json({ message: 'กรุณาระบุ categoryId, code, nameTh, criteriaSet' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newCode = String(code).trim();

    // categoryId isn't checked against evaluation_main_criteria.is_active by
    // the FK constraint (it just requires the row to exist) — without this,
    // an item created under an inactive category inserts fine (201) but is
    // then invisible everywhere, since GET /api/criteria filters categories
    // by is_active before ever looking at their items.
    const categoryRes = await client.query(
      `SELECT is_active FROM evaluation_main_criteria WHERE id = $1`,
      [categoryId]
    );
    if (categoryRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'ไม่พบ categoryId นี้' });
    }
    if (categoryRes.rows[0].is_active === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'หัวข้อ (category) นี้ถูกปิดใช้งานอยู่ — เปิดใช้งานหัวข้อก่อนเพิ่มรายการ' });
    }

    // A code colliding with an existing row (even an inactive/soft-deleted
    // one) used to silently overwrite it via ON CONFLICT DO UPDATE — same
    // "recycle without telling anyone" problem as category creation. POST
    // should only ever create genuinely new rows; reactivating an old item
    // is a deliberate PATCH the admin does after seeing it exists.
    const collisionRes = await client.query(
      `SELECT id, is_active FROM evaluation_sub_criteria WHERE criteria_set = $1 AND code = $2`,
      [criteriaSet, newCode]
    );
    if (collisionRes.rows.length > 0) {
      await client.query('ROLLBACK');
      const existing = collisionRes.rows[0];
      return res.status(409).json({
        message: existing.is_active
          ? 'code นี้มีอยู่แล้วในระบบ'
          : 'code นี้เคยมีอยู่แล้ว (ถูกปิดใช้งานไว้ เป็น false)',
        existingId: existing.id,
      });
    }

    // New items land right after their numeric siblings (group = code with
    // the trailing ".N" stripped, e.g. "ESG1.11" groups with "ESG1.1"-
    // "ESG1.10"), not always at the very end of the category — the ESG
    // category holds BOTH the HO group (ESG1-3) and Factory group (ESGF1-3)
    // back-to-back, so "end of category" means "end of the Factory list",
    // landing a new HO-side item inside the Factory group instead of right
    // after its real siblings. Falls back to append-at-end when no sibling
    // shares the group (brand-new group/module — same as previous behavior).
    const groupKey = newCode.replace(/\.\d+$/, '');
    const siblingsRes = await client.query(
      `SELECT display_order AS "displayOrder" FROM evaluation_sub_criteria
        WHERE category_id = $1 AND is_active = TRUE AND code ~ ('^' || $2 || '\\.[0-9]+$')
        ORDER BY display_order DESC LIMIT 1`,
      [categoryId, groupKey]
    );
    let nextOrder;
    if (siblingsRes.rows.length > 0) {
      nextOrder = siblingsRes.rows[0].displayOrder + 1;
      await client.query(
        `UPDATE evaluation_sub_criteria SET display_order = display_order + 1
          WHERE category_id = $1 AND display_order >= $2`,
        [categoryId, nextOrder]
      );
    } else {
      const orderRes = await client.query(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM evaluation_sub_criteria WHERE category_id = $1',
        [categoryId]
      );
      nextOrder = orderRes.rows[0].next;
    }
    const insertRes = await client.query(
      `INSERT INTO evaluation_sub_criteria
         (category_id, code, name_th, default_weight, display_order, is_active, criteria_set)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (criteria_set, code) DO NOTHING
       RETURNING id`,
      [categoryId, newCode, String(nameTh).trim(), Number(defaultWeight) || 0, nextOrder, criteriaSet]
    );
    if (insertRes.rows.length === 0) {
      // Pre-check above passed but another request inserted the same code
      // in between (race) — surface it the same way instead of crashing.
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'code นี้ถูกสร้างไปแล้วโดย request อื่นในเวลาไล่เลี่ยกัน' });
    }
    const newId = insertRes.rows[0].id;
    const defaultLevels = Array.isArray(levels) && levels.length > 0
      ? levels
      : ['', '', '', '', ''];
    await client.query('DELETE FROM score_level_descriptions WHERE criterion_id = $1', [newId]);
    for (let i = 0; i < defaultLevels.length; i++) {
      await client.query(
        'INSERT INTO score_level_descriptions (criterion_id, level, description) VALUES ($1, $2, $3)',
        [newId, i + 1, defaultLevels[i]]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: newId, message: 'เพิ่มรายการสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /api/criteria/items error:', err);
    res.status(500).json({ message: 'เพิ่มรายการไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── DELETE /api/criteria/items/:id — soft delete ─────────────
async function deleteItem(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE evaluation_sub_criteria SET is_active = FALSE WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err: any) {
    console.error('DELETE /api/criteria/items/:id error:', err);
    res.status(500).json({ message: 'ลบไม่สำเร็จ' });
  }
}

// ── PATCH /api/criteria/items/:id ────────────────────────────
async function updateItem(req: Request, res: Response) {
  const { id } = req.params;
  const { nameTh, detailTh, defaultWeight, code, levelValues, isActive } = req.body;
  if (nameTh === undefined && detailTh === undefined && defaultWeight === undefined && code === undefined && levelValues === undefined && isActive === undefined) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
  }
  // Lets the Admin UI reactivate a soft-deleted item (createItem's 409
  // collision response includes existingId for exactly this) instead of it
  // being permanently stuck — recycling the row is deliberate here since the
  // admin is explicitly confirming it, unlike createItem silently doing so.
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive ต้องเป็น boolean' });
  }
  if (nameTh !== undefined && !nameTh?.trim()) {
    return res.status(400).json({ message: 'nameTh ต้องไม่เป็นค่าว่าง' });
  }
  if (code !== undefined && !String(code).trim()) {
    return res.status(400).json({ message: 'code ต้องไม่เป็นค่าว่าง' });
  }
  // [] is truthy in JS — App.jsx's `item.levelValues ? Math.max(...) : 5`
  // guard doesn't catch it, so an empty array reaches Math.max(...[]) =
  // -Infinity and breaks scoring for that item. Only null (default 1-5
  // scale) or a populated array are valid; [] is neither.
  if (levelValues !== undefined && levelValues !== null &&
      (!Array.isArray(levelValues) || levelValues.length === 0)) {
    return res.status(400).json({ message: 'levelValues ต้องเป็น null หรือ array ที่มีอย่างน้อย 1 ค่า' });
  }
  try {
    // level_values supports an explicit `null` to CLEAR the column (falls
    // back to the default 1-5 scale), distinct from "not sent" — same
    // flag-param reasoning as group_weights/group_labels above.
    const result = await pool.query(
      `UPDATE evaluation_sub_criteria
          SET name_th        = COALESCE($1, name_th),
              detail_th      = COALESCE($2, detail_th),
              default_weight = COALESCE($3, default_weight),
              code           = COALESCE($4, code),
              level_values   = CASE WHEN $5 THEN $6::jsonb ELSE level_values END,
              is_active      = COALESCE($7, is_active)
        WHERE id = $8
        RETURNING id`,
      [
        nameTh        !== undefined ? nameTh : null,
        detailTh      !== undefined ? detailTh : null,
        defaultWeight !== undefined ? Number(defaultWeight) : null,
        code          !== undefined ? String(code).trim() : null,
        levelValues !== undefined,
        levelValues !== undefined ? (levelValues === null ? null : JSON.stringify(levelValues)) : null,
        isActive !== undefined ? isActive : null,
        id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'อัปเดตรายการสำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/criteria/items/:id error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ' });
  }
}

// ── PATCH /api/criteria/items/:id/levels ─────────────────────
async function updateItemLevels(req: Request, res: Response) {
  const { id } = req.params;
  const { levels, levelValues } = req.body;
  if (!Array.isArray(levels) || levels.length === 0)
    return res.status(400).json({ message: 'levels ต้องเป็น array ที่มีอย่างน้อย 1 ค่า' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (levelValues !== undefined) {
      await client.query(
        'UPDATE evaluation_sub_criteria SET level_values = $1 WHERE id = $2',
        [levelValues === null ? null : JSON.stringify(levelValues), id]
      );
    }
    await client.query('DELETE FROM score_level_descriptions WHERE criterion_id = $1', [id]);
    for (let i = 0; i < levels.length; i++) {
      await client.query(
        'INSERT INTO score_level_descriptions (criterion_id, level, description) VALUES ($1, $2, $3)',
        [id, i + 1, levels[i]]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'อัปเดตระดับคะแนนสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/criteria/items/:id/levels error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── PUT /api/criteria/reorder ─────────────────────────────────
// Body: { order: [{ id, displayOrder }] }
async function reorder(req: Request, res: Response) {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ message: 'order ต้องเป็น array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, displayOrder } of order) {
      await client.query(
        'UPDATE evaluation_main_criteria SET display_order = $1 WHERE id = $2',
        [displayOrder, id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'เรียงลำดับสำเร็จ' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('PUT /api/criteria/reorder error:', err);
    res.status(500).json({ message: 'เรียงลำดับไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── POST /api/criteria/seed ───────────────────────────────────
// Body: { sections: [{ code, nameTh, totalWeight, criteriaSet, displayOrder, items: [...] }] }
// Inserts only rows that don't exist yet (DO NOTHING) — never overwrites
// admin customisations. Pass { reset: true } to force DO UPDATE instead.
async function seed(req: Request, res: Response) {
  const { sections, reset = false } = req.body;
  if (!Array.isArray(sections) || sections.length === 0)
    return res.status(400).json({ message: 'sections ต้องเป็น array' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const newCritIds: string[] = []; // only newly-inserted criteria (for level seed)
    const lvCritIds: string[]  = [];
    const lvLevels: number[]   = [];
    const lvDescs: string[]    = [];

    for (const section of sections) {
      // Category: upsert only if reset=true, otherwise insert-if-missing
      let catId;
      if (reset) {
        const catRes = await client.query(
          `INSERT INTO evaluation_main_criteria (code, name_th, total_weight, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO UPDATE
             SET name_th=$2, total_weight=$3, display_order=$4
           RETURNING id`,
          [section.code, section.nameTh, section.totalWeight, section.displayOrder]
        );
        catId = catRes.rows[0].id;
      } else {
        const catRes = await client.query(
          `INSERT INTO evaluation_main_criteria (code, name_th, total_weight, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO NOTHING
           RETURNING id`,
          [section.code, section.nameTh, section.totalWeight, section.displayOrder]
        );
        catId = catRes.rows[0]
          ? catRes.rows[0].id
          : (await client.query('SELECT id FROM evaluation_main_criteria WHERE code=$1', [section.code])).rows[0].id;
      }

      for (let i = 0; i < (section.items ?? []).length; i++) {
        const item = section.items[i];
        const lvJson = Array.isArray(item.levelValues) && item.levelValues.length > 0
          ? JSON.stringify(item.levelValues)
          : null;

        let critId;
        if (reset) {
          const critRes = await client.query(
            `INSERT INTO evaluation_sub_criteria
               (category_id, code, name_th, default_weight, display_order, is_active, criteria_set, level_values)
             VALUES ($1, $2, $3, $4, $5, true, $6, $7)
             ON CONFLICT (criteria_set, code) DO UPDATE
               SET category_id=EXCLUDED.category_id, name_th=EXCLUDED.name_th,
                   default_weight=EXCLUDED.default_weight, display_order=EXCLUDED.display_order,
                   is_active=true, level_values=EXCLUDED.level_values
             RETURNING id`,
            [catId, item.code, String(item.nameTh ?? '').slice(0, 400),
             item.defaultWeight, i + 1, section.criteriaSet, lvJson]
          );
          critId = critRes.rows[0].id;
          newCritIds.push(critId); // reset: replace levels for all
        } else {
          const critRes = await client.query(
            `INSERT INTO evaluation_sub_criteria
               (category_id, code, name_th, default_weight, display_order, is_active, criteria_set, level_values)
             VALUES ($1, $2, $3, $4, $5, true, $6, $7)
             ON CONFLICT (criteria_set, code) DO NOTHING
             RETURNING id`,
            [catId, item.code, String(item.nameTh ?? '').slice(0, 400),
             item.defaultWeight, i + 1, section.criteriaSet, lvJson]
          );
          if (!critRes.rows[0]) continue; // already exists — skip levels too
          critId = critRes.rows[0].id;
          newCritIds.push(critId);
        }

        (item.levels ?? []).forEach((desc: any, li: number) => {
          lvCritIds.push(critId);
          lvLevels.push(li + 1);
          lvDescs.push(desc);
        });
      }
    }

    if (reset && newCritIds.length > 0) {
      await client.query(
        'DELETE FROM score_level_descriptions WHERE criterion_id = ANY($1::uuid[])',
        [newCritIds]
      );
    }
    if (lvCritIds.length > 0) {
      await client.query(
        `INSERT INTO score_level_descriptions (criterion_id, level, description)
         SELECT * FROM UNNEST($1::uuid[], $2::int[], $3::text[])
         ON CONFLICT (criterion_id, level) DO NOTHING`,
        [lvCritIds, lvLevels, lvDescs]
      );
    }

    await client.query('COMMIT');
    const verb = reset ? 'รีเซ็ต' : 'เพิ่ม';
    res.json({ message: `${verb}ข้อมูลสำเร็จ (${sections.length} หัวข้อ, ${newCritIds.length} รายการใหม่)` });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/criteria/seed error:', err);
    res.status(500).json({ message: 'นำเข้าข้อมูลไม่สำเร็จ' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getCriteria, deleteCategory, updateCategory, createCategory,
  createItem, deleteItem, updateItem, updateItemLevels, reorder, seed,
};
