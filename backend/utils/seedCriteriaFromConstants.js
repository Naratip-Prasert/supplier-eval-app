'use strict';
// ============================================================
//  utils/seedCriteriaFromConstants.js
//  Mirrors shared/criteria-data.json (PRE_CRITERIA / POST_CRITERIA /
//  FUNCTION_MODULES — also consumed directly by frontend/src/constants.js)
//  into evaluation_main_criteria / evaluation_sub_criteria /
//  score_level_descriptions so server-side scoring (routes/evaluations.js)
//  has every criterion the frontend form actually renders.
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
const { PRE_CRITERIA, POST_CRITERIA, FUNCTION_MODULES } = require('../../shared/criteria-data.json');

async function seedSet(client, sections, criteriaSet, codePrefix) {
  // Skip the whole per-row loop below when this set is already fully seeded —
  // otherwise every server restart re-runs a query per category/item/level
  // (hundreds of round trips) just to no-op on ON CONFLICT DO NOTHING.
  const expectedItemCount = sections.reduce(
    (n, s) => n + s.items.filter(i => !i.divider).length,
    0
  );
  const { rows: existing } = await client.query(
    'SELECT COUNT(*)::int AS n FROM evaluation_sub_criteria WHERE criteria_set = $1',
    [criteriaSet]
  );
  if (existing[0].n >= expectedItemCount) return;

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
      `INSERT INTO evaluation_main_criteria (code, name_th, name_en, total_weight, display_order, is_active)
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
        `INSERT INTO evaluation_sub_criteria
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
            'SELECT id FROM evaluation_sub_criteria WHERE criteria_set = $1 AND code = $2',
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

// Part 2 "Function module" weight — not a fixed constant (admin rebalances
// Core/Function/ESG on the Parameter page after seeding). The seed default
// is the complement that makes each track total exactly 100%:
// 100 − (that track's Core+ESG section weights) — mirrors
// functionSectionWeightFrom() in src/constants.js.
function functionWeightFor(criteria) {
  const used = (criteria ?? []).reduce((t, sec) => t + (Number(sec.weight) || 0), 0);
  return Math.max(0, Math.round((100 - used) * 100) / 100);
}

async function seedCriteriaFromConstants(client) {
  await seedSet(client, PRE_CRITERIA, 'pre_eval', 'PRE');
  await seedSet(client, POST_CRITERIA, 'post_eval', 'POST');
  const preFuncW  = functionWeightFor(PRE_CRITERIA);
  const postFuncW = functionWeightFor(POST_CRITERIA);
  for (const [code, mod] of Object.entries(FUNCTION_MODULES)) {
    // criteriaSet = 'pre_m1'/'post_m1',... — matches criteria.js query `WHERE criteria_set = $1`
    // codePrefix  = 'FUNC-PRE-M1'/'FUNC-POST-M1',... — becomes the category code directly
    await seedSet(client, [{ section: mod.label, weight: preFuncW,  items: mod.items }], `pre_${code}`,  `FUNC-PRE-${code.toUpperCase()}`);
    await seedSet(client, [{ section: mod.label, weight: postFuncW, items: mod.items }], `post_${code}`, `FUNC-POST-${code.toUpperCase()}`);
  }
}

module.exports = { seedCriteriaFromConstants };
