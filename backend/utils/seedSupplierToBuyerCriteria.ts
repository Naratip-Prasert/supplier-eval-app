'use strict';
// ============================================================
//  utils/seedSupplierToBuyerCriteria.ts
//  Seeds the "Supplier -> User/Buyer" reverse-direction service-eval
//  criteria (criteria_set='sup2user') from shared/supplierToBuyerCriteria.json
//  — the same content that powers the click-only mock page at
//  service-eval/supplier-mock, now made real/DB-backed so it's editable
//  via the Admin Criteria Editor ("Supplier→User Buyer" tab).
//  Mirrors seedCriteriaFromConstants.ts's idempotent shape: only inserts
//  rows that don't exist yet (ON CONFLICT DO NOTHING), never overwrites an
//  admin's later edits.
// ============================================================
import type { PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface SeedItem {
  code: string;
  nameTh: string;
  defaultWeight: number;
  levels: string[];
}
interface SeedSection {
  nameTh: string;
  totalWeight: number;
  items: SeedItem[];
}

// Same cwd-relative path reasoning as seedCriteriaFromConstants.ts — stable
// across `tsx server.ts` (dev) and the compiled dist/ build alike.
const dataPath = path.join(process.cwd(), '..', 'shared', 'supplierToBuyerCriteria.json');
const SECTIONS: SeedSection[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const CRITERIA_SET = 'sup2user';

async function seedSupplierToBuyerCriteria(client: PoolClient): Promise<void> {
  const expectedItemCount = SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const { rows: existing } = await client.query(
    'SELECT COUNT(*)::int AS n FROM "SPES2_evaluation_sub_criteria" WHERE criteria_set = $1',
    [CRITERIA_SET]
  );
  if (existing[0].n >= expectedItemCount) return;

  let sectionIndex = 0;
  for (const section of SECTIONS) {
    sectionIndex += 1;
    const catCode = `S2U-CAT${sectionIndex}`;
    const catResult = await client.query(
      `INSERT INTO "SPES2_evaluation_main_criteria" (code, name_th, name_en, total_weight, display_order, is_active)
       VALUES ($1, $2, NULL, $3, $4, TRUE)
       ON CONFLICT (code) DO UPDATE SET is_active = TRUE
       RETURNING id`,
      [catCode, section.nameTh, section.totalWeight, sectionIndex]
    );
    const categoryId = catResult.rows[0].id;

    let itemOrder = 0;
    for (const item of section.items) {
      itemOrder += 1;
      const critResult = await client.query(
        `INSERT INTO "SPES2_evaluation_sub_criteria"
           (category_id, code, name_th, name_en, detail_th, default_weight, display_order, is_active, criteria_set)
         VALUES ($1, $2, $3, NULL, NULL, $4, $5, TRUE, $6)
         ON CONFLICT (criteria_set, code) DO NOTHING
         RETURNING id`,
        [categoryId, item.code, item.nameTh, item.defaultWeight, itemOrder, CRITERIA_SET]
      );
      const resolvedCrit = critResult.rows[0]
        ? critResult
        : await client.query(
            'SELECT id FROM "SPES2_evaluation_sub_criteria" WHERE criteria_set = $1 AND code = $2',
            [CRITERIA_SET, item.code]
          );
      const criterionId = resolvedCrit.rows[0].id;

      for (let i = 0; i < item.levels.length; i++) {
        await client.query(
          `INSERT INTO "SPES2_score_level_descriptions" (criterion_id, level, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (criterion_id, level) DO NOTHING`,
          [criterionId, i + 1, item.levels[i]]
        );
      }
    }
  }
}

module.exports = { seedSupplierToBuyerCriteria };
