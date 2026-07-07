// ============================================================
//  utils/criteriaOverlay.js
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

// Build a lookup map keyed by category code.
export function buildOverrideMap(dbSections) {
  const map = {};
  if (!Array.isArray(dbSections)) return map;
  dbSections.forEach(sec => {
    if (!sec.code) return;
    const itemMap       = {};
    const inactiveCodes = new Set();
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
      items:        itemMap,
      inactiveCodes,
    };
  });
  return map;
}

// Build a lookup map for function module overrides from the DB response.
// Key = module key lowercase (e.g. "m1", "m2"). Carries totalWeight alongside
// the items — without it, callers fall back to the derived default weight
// (100 − Core+ESG) even after admin edits a module's weight on the
// Parameter page, so the eval form's grand total silently drifts
// from the Parameter page's (e.g. showing 99% instead of 100%).
export function buildFunctionOverrideMap(dbSections) {
  const map = {};
  if (!Array.isArray(dbSections)) return map;
  dbSections.forEach(sec => {
    const m = sec.code?.match(/^FUNC-(?:PRE|POST)-(M\d+)$/i) ?? sec.code?.match(/^FUNC-(M\d+)$/i) ?? sec.code?.match(/^(M\d+)-CAT/i);
    if (!m) return;
    const key = m[1].toLowerCase();
    map[key] = {
      totalWeight: sec.totalWeight,
      items: (sec.items ?? [])
        .filter(it => it.isActive !== false)
        .map(it => ({
          no:          it.code,
          title:       it.nameTh        ?? it.code,
          weight:      it.defaultWeight ?? 0,
          levels:      Array.isArray(it.levels) ? it.levels : [],
          levelValues: Array.isArray(it.levelValues) && it.levelValues.length > 0
            ? it.levelValues : null,
        })),
    };
  });
  return map;
}

// Detect if a constants.js section is the ESG section (has divider items).
function isEsgSection(section) {
  return !!(section.items?.some(i => i.divider));
}

// Apply overrides to a constants.js criteria array (PRE_CRITERIA or POST_CRITERIA).
// - Patches name/weight/levels of existing items from DB
// - Removes items soft-deleted by admin (isActive=false in DB)
// - Appends DB-only items (admin-added) at end of their section
// - Appends DB-only CORE sections BEFORE ESG; other extra sections after ESG
export function applyOverrides(baseCriteria, overrideMap) {
  if (!overrideMap || Object.keys(overrideMap).length === 0) return baseCriteria;

  // Derive PRE/POST prefix from map keys so we know which codes to look for.
  const prefix = Object.keys(overrideMap)
    .find(k => /^(PRE|POST)-/i.test(k))
    ?.match(/^(PRE|POST)-/i)?.[1]
    ?.toUpperCase() ?? 'PRE';

  const usedCodes = new Set();
  let coreIdx = 0;

  const withOrder = baseCriteria.map((section, si) => {
    const isEsg = isEsgSection(section);
    // Map this constants.js section to its expected DB code
    const expectedCode = isEsg ? `${prefix}-ESG` : `${prefix}-CORE${++coreIdx}`;
    usedCodes.add(expectedCode);
    const ov = overrideMap[expectedCode];
    if (!ov) return { order: si + 1, section };

    const matchedCodes = new Set();

    const patchedItems = section.items
      .filter(item => {
        if (item.divider) return true;
        return !ov.inactiveCodes.has(item.no);
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
        const ovItem = ov.items[item.no];
        if (ovItem) matchedCodes.add(item.no);
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
    const extraItems = Object.entries(ov.items)
      .filter(([code]) => !matchedCodes.has(code))
      .map(([code, ovItem]) => ({
        no:          code,
        title:       ovItem.nameTh        ?? code,
        weight:      ovItem.defaultWeight ?? 0,
        levels:      ovItem.levels        ?? [],
        levelValues: ovItem.levelValues   ?? undefined,
      }));

    return {
      order: ov.displayOrder ?? (si + 1),
      section: {
        ...section,
        section: ov.nameTh      ?? section.section,
        weight:  ov.totalWeight ?? section.weight,
        items: [...patchedItems, ...extraItems],
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

    const items = Object.entries(ov.items).map(([c, ovItem]) => ({
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
