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
    const [categoriesResult, criteriaResult, levelsResult] = await Promise.all([
      pool.query(
        `SELECT id, code, name_th AS "nameTh", name_en AS "nameEn",
                total_weight AS "totalWeight", display_order AS "displayOrder"
           FROM evaluation_categories
          ORDER BY display_order`
      ),
      pool.query(
        `SELECT id, category_id AS "categoryId", code,
                name_th AS "nameTh", name_en AS "nameEn",
                detail_th AS "detailTh",
                default_weight AS "defaultWeight",
                display_order AS "displayOrder"
           FROM evaluation_criteria
          WHERE is_active = TRUE
          ORDER BY display_order`
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
