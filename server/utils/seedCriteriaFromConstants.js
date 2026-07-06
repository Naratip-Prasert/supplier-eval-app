'use strict';
// ============================================================
//  utils/seedCriteriaFromConstants.js
//  Mirrors src/constants.js (PRE_CRITERIA / POST_CRITERIA) into
//  evaluation_categories / evaluation_criteria / score_level_descriptions
//  so server-side scoring (routes/evaluations.js) has every criterion
//  the frontend form actually renders.
//  Uses DO NOTHING — only inserts rows that don't exist yet, never
//  overwrites admin customisations (name/weight/levels edited via UI).
//
//  Category code naming convention:
//    PRE-CORE{n}   — PRE eval CORE sections  (non-ESG)
//    PRE-ESG       — PRE eval ESG section
//    POST-CORE{n}  — POST/half-year/yearly CORE sections
//    POST-ESG      — POST/half-year/yearly ESG section
//    FUNC-PRE-M{n} / FUNC-POST-M{n} — Function modules (M1–M7+), configured
//      separately per track since each track's Core+ESG total differs, so
//      each needs its own Function weight to independently reach 100%.
// ============================================================
const fs = require('fs');
const path = require('path');

function loadConstants() {
  const src = fs.readFileSync(path.join(__dirname, '../../src/constants.js'), 'utf8');
  // Cut off at the first exported function — only PRE_CRITERIA/POST_CRITERIA
  // (plain `export const` arrays) are needed above that point.
  const onlyData = src.split(/export function/)[0];
  const body = onlyData.replace(/export const/g, 'const') + '\nmodule.exports = { PRE_CRITERIA, POST_CRITERIA, FUNCTION_MODULES };';
  const mod = { exports: {} };
  new Function('module', 'exports', body)(mod, mod.exports);
  return mod.exports;
}

async function seedSet(client, sections, criteriaSet, codePrefix) {
  let coreIndex = 0;
  let sectionIndex = 0;
  for (const section of sections) {
    sectionIndex++;
    // Identify ESG sections by name; everything else is a CORE section.
    const isEsg = /ESG/i.test(section.section);
    let catCode;
    if (codePrefix.startsWith('FUNC-')) {
      // Function modules: codePrefix IS the full code (e.g. 'FUNC-M1')
      catCode = codePrefix;
    } else if (isEsg) {
      catCode = `${codePrefix}-ESG`;
    } else {
      coreIndex += 1;
      catCode = `${codePrefix}-CORE${coreIndex}`;
    }

    const sectionTitle = section.section.replace(/^\d+\.\s*/, '');
    const displayOrder = codePrefix.startsWith('FUNC-') ? 1 : sectionIndex;
    const catResult = await client.query(
      `INSERT INTO evaluation_categories (code, name_th, name_en, total_weight, display_order, is_active)
       VALUES ($1, $2, NULL, $3, $4, TRUE)
       ON CONFLICT (code) DO UPDATE SET is_active = TRUE
       RETURNING id`,
      [catCode, sectionTitle, section.weight, displayOrder]
    );
    const categoryId = catResult.rows[0].id;

    let itemOrder = 0;
    for (const item of section.items) {
      if (item.divider) continue;
      itemOrder += 1;

      const critResult = await client.query(
        `INSERT INTO evaluation_criteria
           (category_id, code, name_th, name_en, detail_th, default_weight, display_order, is_active, criteria_set)
         VALUES ($1, $2, $3, NULL, $7, $4, $5, TRUE, $6)
         ON CONFLICT (criteria_set, code) DO NOTHING
         RETURNING id`,
        [categoryId, item.no, item.title.slice(0, 400), item.weight, itemOrder, criteriaSet, item.title]
      );
      // Item already existed — fetch its id to insert any missing level descriptions
      const resolvedCrit = critResult.rows[0]
        ? critResult
        : await client.query(
            'SELECT id FROM evaluation_criteria WHERE criteria_set = $1 AND code = $2',
            [criteriaSet, item.no]
          );
      const criterionId = resolvedCrit.rows[0].id;

      const levels = item.levels || [];
      const levelValues = item.levelValues || levels.map((_, i) => i + 1);
      for (let i = 0; i < levels.length; i++) {
        await client.query(
          `INSERT INTO score_level_descriptions (criterion_id, level, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (criterion_id, level) DO NOTHING`,
          [criterionId, levelValues[i], levels[i]]
        );
      }
    }
  }
}

// Part 2 "Function module" weight — mirrors FUNCTION_SECTION_WEIGHT in
// src/constants.js (defined after this file's load-cutoff point, so it
// isn't importable here; keep the two in sync if the split ever changes).
const FUNCTION_SECTION_WEIGHT = 25;

async function seedCriteriaFromConstants(client) {
  const { PRE_CRITERIA, POST_CRITERIA, FUNCTION_MODULES } = loadConstants();
  await seedSet(client, PRE_CRITERIA, 'pre_eval', 'PRE');
  await seedSet(client, POST_CRITERIA, 'post_eval', 'POST');
  for (const [code, mod] of Object.entries(FUNCTION_MODULES)) {
    const sections = [{ section: mod.label, weight: FUNCTION_SECTION_WEIGHT, items: mod.items }];
    // criteriaSet = 'pre_m1'/'post_m1',... — matches criteria.js query `WHERE criteria_set = $1`
    // codePrefix  = 'FUNC-PRE-M1'/'FUNC-POST-M1',... — becomes the category code directly
    await seedSet(client, sections, `pre_${code}`,  `FUNC-PRE-${code.toUpperCase()}`);
    await seedSet(client, sections, `post_${code}`, `FUNC-POST-${code.toUpperCase()}`);
  }
}

module.exports = { seedCriteriaFromConstants };
