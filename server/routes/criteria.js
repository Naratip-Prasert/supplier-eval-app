'use strict';
// ============================================================
//  route/criteria.js
//  GET /api/criteria  — all categories + criteria + level descriptions
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

// GET /api/criteria
// Returns the full evaluation form structure: categories → criteria → level texts.
// The frontend uses this to render the scoring table dynamically.
router.get('/', async (req, res) => {
  try {
    // criteria_set mirrors the frontend's PRE_CRITERIA/POST_CRITERIA split
    // (src/constants.js) — codes like "1.1" are reused with different
    // meanings across sets, so callers must pick one.
    const criteriaSet = ['post_eval', 'half_year', 'yearly'].includes(req.query.evalType)
      ? 'post_eval'
      : 'pre_eval';

    const [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
      pool.query(
        `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                total_weight AS "totalWeight", display_order AS "displayOrder"
           FROM evaluation_categories
          WHERE code LIKE $1
          ORDER BY display_order`,
        [criteriaSet === 'post_eval' ? 'POST-%' : 'PRE-%']
      ),
      pool.query(
        `SELECT id, category_id AS "categoryId", code,
                name_th AS "nameTh", name_en AS "nameEn",
                detail_th AS "detailTh",
                default_weight AS "defaultWeight",
                display_order AS "displayOrder"
           FROM evaluation_criteria
          WHERE is_active = TRUE AND criteria_set = $1
          ORDER BY display_order`,
        [criteriaSet]
      ),
      pool.query(
        `SELECT criterion_id AS "criterionId", level, description
           FROM score_level_descriptions
          ORDER BY criterion_id, level`
      ),
    ]);

    // Index level descriptions by criterionId
    const levelsBycriterion = {};
    levelsResult.rows.forEach(row => {
      if (!levelsBycriterion[row.criterionId]) {
        levelsBycriterion[row.criterionId] = [];
      }
      levelsBycriterion[row.criterionId].push(row.description);
    });

    // Index criteria by categoryId
    const criteriaByCategory = {};
    criteriaResult.rows.forEach(c => {
      if (!criteriaByCategory[c.categoryId]) {
        criteriaByCategory[c.categoryId] = [];
      }
      criteriaByCategory[c.categoryId].push({
        code:          c.code,
        nameTh:        c.nameTh,
        nameEn:        c.nameEn,
        detailTh:      c.detailTh,
        defaultWeight: parseFloat(c.defaultWeight),
        displayOrder:  c.displayOrder,
        levels: levelsBycriterion[c.id] ?? [],
      });
    });

    const response = categoriesResult.rows.map(cat => ({
      code:         cat.code,
      nameTh:       cat.nameTh,
      nameEn:       cat.nameEn,
      totalWeight:  parseFloat(cat.totalWeight),
      displayOrder: cat.displayOrder,
      items: criteriaByCategory[cat.id] ?? [],
    }));

    res.json(response);
  } catch (err) {
    console.error('GET /api/criteria error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
