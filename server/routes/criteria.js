'use strict';
// ============================================================
//  routes/criteria.js
//  GET  /api/criteria                      — full form structure
//  PATCH /api/criteria/categories/:id      — update section (ADMIN)
//  PATCH /api/criteria/items/:id           — update item (ADMIN)
//  PATCH /api/criteria/items/:id/levels    — update levels (ADMIN)
//  PUT   /api/criteria/reorder             — reorder sections (ADMIN)
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'สิทธิ์ไม่เพียงพอ (ต้องการ ADMIN)' });
  next();
}

// ── GET /api/criteria ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const et = req.query.evalType ?? '';
    const isFunctionLoad = et === 'function' || /^m\d+$/i.test(et);

    let categoriesResult, criteriaResult, levelsResult;

    if (isFunctionLoad) {
      const isAllModules = et === 'function';
      // Category codes: FUNC-M1, FUNC-M2, ... (was M1-CAT1, M2-CAT1)
      // Criteria set:   m1, m2, ...           (was module_m1, module_m2)
      [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
        isAllModules
          ? pool.query(
              `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                      total_weight AS "totalWeight", display_order AS "displayOrder"
                 FROM evaluation_categories
                WHERE code LIKE 'FUNC-M%' AND (is_active = TRUE OR is_active IS NULL)
                ORDER BY substring(code from 'FUNC-M(\\d+)')::integer, code`
            )
          : pool.query(
              `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                      total_weight AS "totalWeight", display_order AS "displayOrder"
                 FROM evaluation_categories
                WHERE code = $1 AND (is_active = TRUE OR is_active IS NULL)`,
              [`FUNC-${et.toUpperCase()}`]
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
                 FROM evaluation_criteria
                WHERE criteria_set ~ $1
                ORDER BY substring(criteria_set from '^m(\\d+)')::integer, display_order`,
              ['^m[0-9]+$']
            )
          : pool.query(
              `SELECT id, category_id AS "categoryId", code,
                      name_th AS "nameTh", name_en AS "nameEn",
                      detail_th AS "detailTh",
                      default_weight AS "defaultWeight",
                      display_order AS "displayOrder",
                      is_active AS "isActive",
                      level_values AS "levelValues"
                 FROM evaluation_criteria
                WHERE criteria_set = $1
                ORDER BY display_order`,
              [et.toLowerCase()]
            ),
        pool.query(
          `SELECT criterion_id AS "criterionId", level, description
             FROM score_level_descriptions
            ORDER BY criterion_id, level`
        ),
      ]);
    } else {
      const criteriaSet = ['post_eval', 'half_year', 'yearly'].includes(et)
        ? 'post_eval'
        : 'pre_eval';
      [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
        pool.query(
          `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                  total_weight AS "totalWeight", display_order AS "displayOrder",
                  group_weights AS "groupWeights"
             FROM evaluation_categories
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
             FROM evaluation_criteria
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

    const levelsByCriterion = {};
    levelsResult.rows.forEach(row => {
      if (!levelsByCriterion[row.criterionId]) levelsByCriterion[row.criterionId] = [];
      levelsByCriterion[row.criterionId].push(row.description);
    });

    const criteriaByCategory = {};
    criteriaResult.rows.forEach(c => {
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

    const response = categoriesResult.rows.map(cat => ({
      id:           cat.id,
      code:         cat.code,
      nameTh:       cat.nameTh,
      nameEn:       cat.nameEn,
      totalWeight:  parseFloat(cat.totalWeight),
      displayOrder: cat.displayOrder,
      groupWeights: cat.groupWeights ?? null,
      items:        criteriaByCategory[cat.id] ?? [],
    }));

    res.json(response);
  } catch (err) {
    console.error('GET /api/criteria error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── DELETE /api/criteria/categories/:id ──────────────────────
// Soft-delete: SET is_active=FALSE (preserves history / score references).
// Items inside are also soft-deleted via is_active=FALSE.
router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE evaluation_criteria SET is_active = FALSE WHERE category_id = $1`,
      [id]
    );
    const result = await client.query(
      `UPDATE evaluation_categories SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'ไม่พบข้อมูล' }); }
    await client.query('COMMIT');
    res.json({ message: 'ลบหัวข้อสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/criteria/categories/:id error:', err);
    res.status(500).json({ message: 'ลบหัวข้อไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/criteria/categories/:id ───────────────────────
router.patch('/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nameTh, totalWeight, groupWeights } = req.body;
  const updates = [];
  const values  = [];
  let   idx     = 1;
  if (nameTh       !== undefined) { updates.push(`name_th = $${idx++}`);       values.push(nameTh); }
  if (totalWeight  !== undefined) { updates.push(`total_weight = $${idx++}`);  values.push(Number(totalWeight)); }
  if (groupWeights !== undefined) { updates.push(`group_weights = $${idx++}`); values.push(groupWeights === null ? null : JSON.stringify(groupWeights)); }
  if (updates.length === 0) return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE evaluation_categories SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'อัปเดตหัวข้อสำเร็จ' });
  } catch (err) {
    console.error('PATCH /api/criteria/categories/:id error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ', error: err.message });
  }
});

// ── POST /api/criteria/categories — เพิ่ม section ใหม่ ──────────
router.post('/categories', requireAdmin, async (req, res) => {
  const { nameTh, totalWeight, codePrefix, type } = req.body;
  if (!nameTh?.trim())
    return res.status(400).json({ message: 'กรุณาระบุ nameTh' });
  if (type !== 'function' && !codePrefix?.trim())
    return res.status(400).json({ message: 'กรุณาระบุ codePrefix' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let code;

    if (type === 'function') {
      // Reactivate an inactive FUNC-M{n} if one exists, otherwise create next sequential
      const inactiveRes = await client.query(
        `SELECT id, code, display_order AS "displayOrder"
           FROM evaluation_categories
          WHERE code LIKE 'FUNC-M%' AND is_active = FALSE
          ORDER BY substring(code from 'FUNC-M(\\d+)')::integer
          LIMIT 1`
      );
      if (inactiveRes.rows.length > 0) {
        const row = inactiveRes.rows[0];
        await client.query(
          `UPDATE evaluation_categories SET is_active=TRUE, name_th=$1, total_weight=$2 WHERE id=$3`,
          [nameTh.trim(), Number(totalWeight) || 0, row.id]
        );
        await client.query(
          `UPDATE evaluation_criteria SET is_active=TRUE WHERE category_id=$1`,
          [row.id]
        );
        await client.query('COMMIT');
        return res.json({ id: row.id, code: row.code, nameTh: nameTh.trim(), totalWeight: Number(totalWeight) || 0, displayOrder: row.displayOrder, items: [] });
      }
      // No inactive row — generate next sequential code
      const { rows } = await client.query(
        `SELECT code FROM evaluation_categories WHERE code LIKE 'FUNC-M%' ORDER BY code`
      );
      const nums = rows.map(r => { const m = r.code.match(/^FUNC-M(\d+)$/i); return m ? parseInt(m[1], 10) : 0; }).filter(Boolean);
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      code = `FUNC-M${nextNum}`;
    } else {
      const prefix = codePrefix.trim();
      // Reactivate first inactive category with this prefix if one exists
      const inactiveRes = await client.query(
        `SELECT id, code, display_order AS "displayOrder"
           FROM evaluation_categories
          WHERE code LIKE $1 AND is_active = FALSE
          ORDER BY display_order
          LIMIT 1`,
        [`${prefix}%`]
      );
      if (inactiveRes.rows.length > 0) {
        const row = inactiveRes.rows[0];
        await client.query(
          `UPDATE evaluation_categories SET is_active=TRUE, name_th=$1, total_weight=$2 WHERE id=$3`,
          [nameTh.trim(), Number(totalWeight) || 0, row.id]
        );
        await client.query(
          `UPDATE evaluation_criteria SET is_active=TRUE WHERE category_id=$1`,
          [row.id]
        );
        await client.query('COMMIT');
        return res.json({ id: row.id, code: row.code, nameTh: nameTh.trim(), totalWeight: Number(totalWeight) || 0, displayOrder: row.displayOrder, items: [] });
      }
      // No inactive row — generate next available code
      let n = 1;
      while (true) {
        code = `${prefix}${n}`;
        const { rowCount } = await client.query('SELECT 1 FROM evaluation_categories WHERE code=$1', [code]);
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
        `SELECT display_order FROM evaluation_categories WHERE code = $1`,
        [esgCode]
      );
      if (esgRes.rows.length > 0) {
        const esgOrder = esgRes.rows[0].display_order;
        await client.query(
          `UPDATE evaluation_categories SET display_order = display_order + 1 WHERE code = $1`,
          [esgCode]
        );
        nextOrder = esgOrder;
      } else {
        // No ESG found — fall back to MAX+1 across the family
        const orderLikePat = prefix.startsWith('PRE') ? 'PRE-%' : 'POST-%';
        const orderRes = await client.query(
          `SELECT COALESCE(MAX(display_order),0)+1 AS next FROM evaluation_categories WHERE code LIKE $1`,
          [orderLikePat]
        );
        nextOrder = parseInt(orderRes.rows[0].next);
      }
    } else {
      const orderLikePat = type === 'function' ? 'FUNC-M%'
        : prefix.startsWith('PRE')  ? 'PRE-%'
        : prefix.startsWith('POST') ? 'POST-%'
        : `${prefix}%`;
      const orderRes = await client.query(
        `SELECT COALESCE(MAX(display_order),0)+1 AS next FROM evaluation_categories WHERE code LIKE $1`,
        [orderLikePat]
      );
      nextOrder = parseInt(orderRes.rows[0].next);
    }
    const result = await client.query(
      `INSERT INTO evaluation_categories (code, name_th, total_weight, display_order, is_active)
       VALUES ($1,$2,$3,$4,TRUE)
       RETURNING id, code, name_th AS "nameTh", total_weight AS "totalWeight", display_order AS "displayOrder"`,
      [code, nameTh.trim(), Number(totalWeight) || 0, nextOrder]
    );
    await client.query('COMMIT');
    res.json({ ...result.rows[0], items: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/criteria/categories error:', err);
    res.status(500).json({ message: 'เพิ่มหัวข้อไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/criteria/items — เพิ่ม item ใหม่ ───────────────
router.post('/items', requireAdmin, async (req, res) => {
  const { categoryId, code, nameTh, defaultWeight, criteriaSet, levels } = req.body;
  if (!categoryId || !code || !nameTh || !criteriaSet)
    return res.status(400).json({ message: 'กรุณาระบุ categoryId, code, nameTh, criteriaSet' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM evaluation_criteria WHERE category_id = $1',
      [categoryId]
    );
    const nextOrder = orderRes.rows[0].next;
    const insertRes = await client.query(
      `INSERT INTO evaluation_criteria
         (category_id, code, name_th, default_weight, display_order, is_active, criteria_set)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (criteria_set, code) DO UPDATE
         SET is_active=true, name_th=EXCLUDED.name_th,
             default_weight=EXCLUDED.default_weight,
             category_id=EXCLUDED.category_id,
             display_order=EXCLUDED.display_order
       RETURNING id`,
      [categoryId, String(code).trim(), String(nameTh).trim(), Number(defaultWeight) || 0, nextOrder, criteriaSet]
    );
    const newId = insertRes.rows[0].id;
    const defaultLevels = Array.isArray(levels) && levels.length > 0
      ? levels
      : ['', '', '', '', ''];
    // Replace levels — row may have been restored from soft-delete with stale levels
    await client.query('DELETE FROM score_level_descriptions WHERE criterion_id = $1', [newId]);
    for (let i = 0; i < defaultLevels.length; i++) {
      await client.query(
        'INSERT INTO score_level_descriptions (criterion_id, level, description) VALUES ($1, $2, $3)',
        [newId, i + 1, defaultLevels[i]]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: newId, message: 'เพิ่มรายการสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/criteria/items error:', err);
    res.status(500).json({ message: 'เพิ่มรายการไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── DELETE /api/criteria/items/:id — soft delete ─────────────
router.delete('/items/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE evaluation_criteria SET is_active = FALSE WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    console.error('DELETE /api/criteria/items/:id error:', err);
    res.status(500).json({ message: 'ลบไม่สำเร็จ', error: err.message });
  }
});

// ── PATCH /api/criteria/items/:id ────────────────────────────
router.patch('/items/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nameTh, detailTh, defaultWeight, code, levelValues } = req.body;
  const updates = [];
  const values  = [];
  let   idx     = 1;
  if (nameTh        !== undefined) { updates.push(`name_th = $${idx++}`);        values.push(nameTh); }
  if (detailTh      !== undefined) { updates.push(`detail_th = $${idx++}`);      values.push(detailTh); }
  if (defaultWeight !== undefined) { updates.push(`default_weight = $${idx++}`); values.push(Number(defaultWeight)); }
  if (code          !== undefined) { updates.push(`code = $${idx++}`);           values.push(String(code).trim()); }
  if (levelValues   !== undefined) { updates.push(`level_values = $${idx++}`);   values.push(levelValues === null ? null : JSON.stringify(levelValues)); }
  if (updates.length === 0) return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE evaluation_criteria SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    res.json({ message: 'อัปเดตรายการสำเร็จ' });
  } catch (err) {
    console.error('PATCH /api/criteria/items/:id error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ', error: err.message });
  }
});

// ── PATCH /api/criteria/items/:id/levels ─────────────────────
router.patch('/items/:id/levels', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { levels, levelValues } = req.body;
  if (!Array.isArray(levels) || levels.length === 0)
    return res.status(400).json({ message: 'levels ต้องเป็น array ที่มีอย่างน้อย 1 ค่า' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (levelValues !== undefined) {
      await client.query(
        'UPDATE evaluation_criteria SET level_values = $1 WHERE id = $2',
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
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/criteria/items/:id/levels error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── PUT /api/criteria/reorder ─────────────────────────────────
// Body: { order: [{ id, displayOrder }] }
router.put('/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ message: 'order ต้องเป็น array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, displayOrder } of order) {
      await client.query(
        'UPDATE evaluation_categories SET display_order = $1 WHERE id = $2',
        [displayOrder, id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'เรียงลำดับสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/criteria/reorder error:', err);
    res.status(500).json({ message: 'เรียงลำดับไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/criteria/seed ───────────────────────────────────
// Body: { sections: [{ code, nameTh, totalWeight, criteriaSet, displayOrder, items: [...] }] }
// Inserts only rows that don't exist yet (DO NOTHING) — never overwrites
// admin customisations. Pass { reset: true } to force DO UPDATE instead.
router.post('/seed', requireAdmin, async (req, res) => {
  const { sections, reset = false } = req.body;
  if (!Array.isArray(sections) || sections.length === 0)
    return res.status(400).json({ message: 'sections ต้องเป็น array' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const newCritIds = []; // only newly-inserted criteria (for level seed)
    const lvCritIds  = [];
    const lvLevels   = [];
    const lvDescs    = [];

    for (const section of sections) {
      // Category: upsert only if reset=true, otherwise insert-if-missing
      let catId;
      if (reset) {
        const catRes = await client.query(
          `INSERT INTO evaluation_categories (code, name_th, total_weight, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO UPDATE
             SET name_th=$2, total_weight=$3, display_order=$4
           RETURNING id`,
          [section.code, section.nameTh, section.totalWeight, section.displayOrder]
        );
        catId = catRes.rows[0].id;
      } else {
        const catRes = await client.query(
          `INSERT INTO evaluation_categories (code, name_th, total_weight, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO NOTHING
           RETURNING id`,
          [section.code, section.nameTh, section.totalWeight, section.displayOrder]
        );
        catId = catRes.rows[0]
          ? catRes.rows[0].id
          : (await client.query('SELECT id FROM evaluation_categories WHERE code=$1', [section.code])).rows[0].id;
      }

      for (let i = 0; i < (section.items ?? []).length; i++) {
        const item = section.items[i];
        const lvJson = Array.isArray(item.levelValues) && item.levelValues.length > 0
          ? JSON.stringify(item.levelValues)
          : null;

        let critId;
        if (reset) {
          const critRes = await client.query(
            `INSERT INTO evaluation_criteria
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
            `INSERT INTO evaluation_criteria
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

        (item.levels ?? []).forEach((desc, li) => {
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
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/criteria/seed error:', err);
    res.status(500).json({ message: 'นำเข้าข้อมูลไม่สำเร็จ', error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
