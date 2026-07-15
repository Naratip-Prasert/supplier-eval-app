// ============================================================
//  utils/criteriaOverlay.ts
//  Merge DB data onto constants.js criteria.
//
//  DB shape:    [{ code:"PRE-CORE1", nameTh, totalWeight, displayOrder,
//                  items:[{ code, nameTh, defaultWeight, levels, isActive }] }]
//  Constants:   [{ section, weight, items:[{ no, title, weight, levels, divider? }] }]
//
//  overrideMap key = full DB category code (e.g. "PRE-CORE1", "POST-ESG")
//  This avoids displayOrder collisions when admin adds sections between
//  existing CORE sections and ESG.
// ============================================================
import { esgGroupKey } from "./evalWeightMath";
import type { CriteriaEntry, CriteriaSection } from "@/constants";

export interface DbItem {
  code: string;
  nameTh?: string;
  defaultWeight?: number;
  levels?: string[];
  levelValues?: number[];
  isActive?: boolean;
}

export interface DbSection {
  code?: string;
  nameTh?: string;
  totalWeight?: number;
  displayOrder?: number;
  groupWeights?: Record<string, number> | null;
  groupLabels?: Record<string, { th?: string; en?: string }> | null;
  items?: DbItem[];
}

export interface OverrideMapEntry {
  code: string;
  nameTh?: string;
  totalWeight?: number;
  displayOrder?: number;
  groupWeights: Record<string, number> | null;
  groupLabels: Record<string, { th?: string; en?: string }> | null;
  items: Record<string, { nameTh?: string; defaultWeight?: number; levels: string[] | null; levelValues: number[] | null }>;
  inactiveCodes: Set<string>;
}

export type OverrideMap = Record<string, OverrideMapEntry>;

// Build a lookup map keyed by category code.
export function buildOverrideMap(dbSections: DbSection[] | null | undefined): OverrideMap {
  const map: OverrideMap = {};
  if (!Array.isArray(dbSections)) return map;
  dbSections.forEach(sec => {
    if (!sec.code) return;
    const itemMap: OverrideMapEntry["items"] = {};
    const inactiveCodes = new Set<string>();
    (sec.items ?? []).forEach(it => {
      if (!it.code) return;
      if (it.isActive === false) { inactiveCodes.add(it.code); return; }
      itemMap[it.code] = {
        nameTh:        it.nameTh,
        defaultWeight: it.defaultWeight,
        levels:        Array.isArray(it.levels)      && it.levels.length      > 0 ? it.levels      : null,
        levelValues:   Array.isArray(it.levelValues) && it.levelValues.length > 0 ? it.levelValues : null,
      };
    });
    map[sec.code] = {
      code:         sec.code,
      nameTh:       sec.nameTh,
      totalWeight:  sec.totalWeight,
      displayOrder: sec.displayOrder,
      groupWeights: sec.groupWeights ?? null,
      groupLabels:  sec.groupLabels ?? null,
      items:        itemMap,
      inactiveCodes,
    };
  });
  return map;
}

export interface FunctionOverrideMapEntry {
  totalWeight?: number;
  nameTh?: string;
  items: CriteriaEntry[];
}

export type FunctionOverrideMap = Record<string, FunctionOverrideMapEntry>;

// Build a lookup map for function module overrides from the DB response.
// Key = module key lowercase (e.g. "m1", "m2"). Carries totalWeight alongside
// the items — without it, callers fall back to the derived default weight
// (100 − Core+ESG) even after admin edits a module's weight on the
// Parameter page, so the eval form's grand total silently drifts
// from the Parameter page's (e.g. showing 99% instead of 100%).
export function buildFunctionOverrideMap(dbSections: DbSection[] | null | undefined): FunctionOverrideMap {
  const map: FunctionOverrideMap = {};
  if (!Array.isArray(dbSections)) return map;
  dbSections.forEach(sec => {
    const m = sec.code?.match(/^FUNC-(?:PRE|POST)-(M\d+)$/i) ?? sec.code?.match(/^FUNC-(M\d+)$/i) ?? sec.code?.match(/^(M\d+)-CAT/i);
    if (!m) return;
    const key = m[1].toLowerCase();
    map[key] = {
      totalWeight: sec.totalWeight,
      nameTh:      sec.nameTh,
      items: (sec.items ?? [])
        .filter(it => it.isActive !== false)
        .map(it => ({
          no:          it.code,
          title:       it.nameTh        ?? it.code,
          weight:      it.defaultWeight ?? 0,
          levels:      Array.isArray(it.levels) ? it.levels : [],
          levelValues: Array.isArray(it.levelValues) && it.levelValues.length > 0
            ? it.levelValues : undefined,
        })),
    };
  });
  return map;
}

// Detect if a constants.js section is the ESG section (has divider items).
function isEsgSection(section: CriteriaSection): boolean {
  return !!(section.items?.some(i => i.divider));
}

// Group key for an item code = the code with its trailing ".N" stripped
// (e.g. "ESG1.11" → "ESG1", "ESGF3.2" → "ESGF3"). Used to slot admin-added
// items next to their numeric siblings instead of dumping them at the very
// end of the section — for ESG specifically, the section holds BOTH the
// HO group (ESG1-3) and the Factory group (ESGF1-3) back-to-back, so
// "end of section" actually means "end of the Factory group", landing a
// newly-added HO-side item (e.g. ESG1.11) inside the Factory list instead
// of after its real siblings (ESG1.1-1.10).
function itemGroupKey(code: string | null | undefined): string | null | undefined {
  return code?.replace(/\.\d+$/, '') ?? code;
}

// Insert each extra (DB-only, admin-added) item right after the last
// existing item sharing its group key; falls back to appending at the end
// when no sibling is found (brand-new group). For a brand-new ESG group on
// the HO side (code doesn't start with the Factory "ESGF" prefix), "the
// end" means the end of the HO region specifically (right before the
// Factory level-1 divider) — appending at the very end of the whole array
// would otherwise land it inside splitEsgGroups()'s Factory slice.
function insertByGroup(baseItems: CriteriaEntry[], extraItems: CriteriaEntry[]): CriteriaEntry[] {
  const result = [...baseItems];
  extraItems.forEach(extra => {
    const key = itemGroupKey(extra.no);
    let insertAt = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (!result[i].divider && itemGroupKey(result[i].no) === key) { insertAt = i; break; }
    }
    if (insertAt !== -1) { result.splice(insertAt + 1, 0, extra); return; }

    const isFactoryCode = /^ESGF/i.test(extra.no ?? '');
    if (!isFactoryCode) {
      const factoryDividerIdx = result.findIndex(it => it.divider && it.level === 1 && /โรงงาน/.test(it.label ?? ''));
      if (factoryDividerIdx !== -1) { result.splice(factoryDividerIdx, 0, extra); return; }
    }
    result.push(extra);
  });
  return result;
}

// Reconciles admin-configured ESG sub-groups (Environment/Social/Governance
// by default, but admin can rename/add/remove) against the merged items
// array. `groupWeights` keys are the source of truth for which groups exist
// ONCE an admin has saved it at least once — null means "never touched",
// so all of constants.js's hardcoded groups apply unchanged (today's
// behavior, zero risk for anyone who's never used this feature).
function reconcileEsgGroups(
  items: CriteriaEntry[],
  groupWeights: Record<string, number> | null | undefined,
  groupLabels: Record<string, { th?: string; en?: string }> | null | undefined
): CriteriaEntry[] {
  if (!groupWeights) return items;
  const existingKeys = new Set(Object.keys(groupWeights));

  // 1. Drop spans (level-2 divider + its items, up to the next divider) for
  //    any group key no longer in groupWeights (admin removed it) — and
  //    patch the label of any kept divider from groupLabels.
  const kept: CriteriaEntry[] = [];
  let dropping = false;
  items.forEach(item => {
    if (item.divider) {
      dropping = false;
      if (item.level === 2) {
        const grp = esgGroupKey(item.label);
        if (grp && !existingKeys.has(grp)) { dropping = true; return; }
        if (grp && groupLabels?.[grp]) {
          const prefix = item.label?.match(/^(ESGF?\d+)/i)?.[1] ?? '';
          const { th, en } = groupLabels[grp];
          kept.push({ ...item, label: `${prefix}  ${th ?? ''}${en ? ` / ${en}` : ''}`.trimEnd() });
          return;
        }
      }
      kept.push(item);
      return;
    }
    if (!dropping) kept.push(item);
  });

  // 2. Synthesize a divider for any groupWeights key whose items exist
  //    (arrived via insertByGroup as admin-added items) but has no divider
  //    yet — a brand-new group. Checked separately per HO ("ESG{n}.") and
  //    Factory ("ESGF{n}.") side, since a new group can have items on
  //    either or both.
  const keysWithDivider = new Set(
    kept.filter(it => it.divider && it.level === 2).map(it => esgGroupKey(it.label)).filter(Boolean)
  );
  let result = kept;
  [...existingKeys].filter(k => !keysWithDivider.has(k)).forEach(grp => {
    ['ESG', 'ESGF'].forEach(prefix => {
      const re = new RegExp(`^${prefix}${grp}\\.`, 'i');
      const firstIdx = result.findIndex(it => !it.divider && re.test(it.no ?? ''));
      if (firstIdx === -1) return; // no items for this group on this side
      const gl = groupLabels?.[grp];
      const label = gl
        ? `${prefix}${grp}  ${gl.th ?? ''}${gl.en ? ` / ${gl.en}` : ''}`.trimEnd()
        : `${prefix}${grp}  กลุ่มที่เพิ่มใหม่`;
      result = [
        ...result.slice(0, firstIdx),
        { divider: true, level: 2, label, groupWeight: Number(groupWeights[grp]) },
        ...result.slice(firstIdx),
      ];
    });
  });
  return result;
}

// Safety net: a level-2 divider immediately followed by another divider (or
// end of array) has zero real items under it — e.g. every item in a group
// got individually soft-deleted one at a time without going through group
// removal. assignEsgSubGroupWeights() would divide the group's weight by
// zero items, so drop any divider left in that state. Runs unconditionally
// (not gated by groupWeights) since this can happen from plain item deletes.
function dropEmptyEsgDividers(items: CriteriaEntry[]): CriteriaEntry[] {
  return items.filter((item, i) => {
    if (!(item.divider && item.level === 2)) return true;
    const next = items[i + 1];
    return !!next && !next.divider;
  });
}

// Apply overrides to a constants.js criteria array (PRE_CRITERIA or POST_CRITERIA).
// - Patches name/weight/levels of existing items from DB
// - Removes items soft-deleted by admin (isActive=false in DB)
// - Appends DB-only items (admin-added) at end of their section
// - Appends DB-only CORE sections BEFORE ESG; other extra sections after ESG
export function applyOverrides(baseCriteria: CriteriaSection[], overrideMap: OverrideMap | null | undefined): CriteriaSection[] {
  if (!overrideMap || Object.keys(overrideMap).length === 0) return baseCriteria;

  // Derive PRE/POST prefix from map keys so we know which codes to look for.
  const prefix = Object.keys(overrideMap)
    .find(k => /^(PRE|POST)-/i.test(k))
    ?.match(/^(PRE|POST)-/i)?.[1]
    ?.toUpperCase() ?? 'PRE';

  const usedCodes = new Set<string>();
  let coreIdx = 0;

  const withOrder = baseCriteria.map((section, si) => {
    const isEsg = isEsgSection(section);
    // Map this constants.js section to its expected DB code
    const expectedCode = isEsg ? `${prefix}-ESG` : `${prefix}-CORE${++coreIdx}`;
    usedCodes.add(expectedCode);
    const ov = overrideMap[expectedCode];
    if (!ov) return { order: si + 1, section };

    const matchedCodes = new Set<string>();

    const patchedItems: CriteriaEntry[] = section.items
      .filter(item => {
        if (item.divider) return true;
        return !(item.no && ov.inactiveCodes.has(item.no));
      })
      .map(item => {
        if (item.divider) {
          // Patch sub-group groupWeight from DB if available
          if (item.level === 2 && ov.groupWeights) {
            const grpNum = item.label?.match(/^(?:ESG|ESGF)(\d+)/i)?.[1];
            if (grpNum && ov.groupWeights[grpNum] != null) {
              return { ...item, groupWeight: Number(ov.groupWeights[grpNum]) };
            }
          }
          return item;
        }
        const ovItem = item.no ? ov.items[item.no] : undefined;
        if (ovItem && item.no) matchedCodes.add(item.no);
        if (!ovItem) return item;
        return {
          ...item,
          title:       ovItem.nameTh        ?? item.title,
          weight:      ovItem.defaultWeight ?? item.weight,
          levels:      ovItem.levels        ?? item.levels,
          levelValues: ovItem.levelValues   ?? item.levelValues,
        };
      });

    // Append DB-only items (admin added — not in constants)
    const extraItems: CriteriaEntry[] = Object.entries(ov.items)
      .filter(([code]) => !matchedCodes.has(code))
      .map(([code, ovItem]) => ({
        no:          code,
        title:       ovItem.nameTh        ?? code,
        weight:      ovItem.defaultWeight ?? 0,
        levels:      ovItem.levels        ?? [],
        levelValues: ovItem.levelValues   ?? undefined,
      }));

    let mergedItems = insertByGroup(patchedItems, extraItems);
    if (isEsg) {
      mergedItems = dropEmptyEsgDividers(reconcileEsgGroups(mergedItems, ov.groupWeights, ov.groupLabels));
    }

    return {
      order: ov.displayOrder ?? (si + 1),
      section: {
        ...section,
        section: ov.nameTh      ?? section.section,
        weight:  ov.totalWeight ?? section.weight,
        items: mergedItems,
      },
    };
  });

  // Find the ESG entry's sort order so we can insert new CORE sections before it.
  const esgEntry  = withOrder.find(w => isEsgSection(w.section));
  const esgOrder  = esgEntry?.order ?? (baseCriteria.length + 999);

  // DB-only sections (admin-added; not present in constants.js at all).
  // New CORE sections → place just before ESG, sorted by their CORE number.
  // Everything else → place after ESG using displayOrder.
  Object.entries(overrideMap).forEach(([code, ov]) => {
    if (usedCodes.has(code)) return;

    const items: CriteriaEntry[] = Object.entries(ov.items).map(([c, ovItem]) => ({
      no:          c,
      title:       ovItem.nameTh        ?? c,
      weight:      ovItem.defaultWeight ?? 0,
      levels:      ovItem.levels        ?? [],
      levelValues: ovItem.levelValues   ?? undefined,
    }));

    const coreMatch = code.match(/^(?:PRE|POST)-CORE(\d+)$/i);
    const order = coreMatch
      ? esgOrder - 0.5 + parseInt(coreMatch[1], 10) * 0.001  // before ESG, ordered by n
      : (ov.displayOrder ?? 999);                              // after ESG

    withOrder.push({
      order,
      section: {
        section: ov.nameTh      ?? code,
        weight:  ov.totalWeight ?? 0,
        items,
      },
    });
  });

  withOrder.sort((a, b) => a.order - b.order);
  return withOrder.map(({ section }) => section);
}
