// ============================================================
//  utils/criteriaOverlay.js
//  Merge DB data onto constants.js criteria.
//
//  DB shape:    [{ code:"PRE-CAT1", nameTh, totalWeight, displayOrder,
//                  items:[{ code, nameTh, defaultWeight, levels, isActive }] }]
//  Constants:   [{ section, weight, items:[{ no, title, weight, levels, divider? }] }]
// ============================================================

// Build a lookup map from the raw DB response.
// Key = digit from category code (e.g. "PRE-CAT3" → "3").
// Per section: tracks active items, inactive codes (deleted), and displayOrder.
export function buildOverrideMap(dbSections) {
  const map = {};
  if (!Array.isArray(dbSections)) return map;
  dbSections.forEach(sec => {
    const codeNum = sec.code?.match(/-CAT(\d+)$/)?.[1];
    if (!codeNum) return;
    const itemMap      = {};   // code → override data  (active only)
    const inactiveCodes = new Set(); // codes soft-deleted by admin
    (sec.items ?? []).forEach(it => {
      if (!it.code) return;
      if (it.isActive === false) {
        inactiveCodes.add(it.code);
        return;
      }
      itemMap[it.code] = {
        nameTh:        it.nameTh,
        defaultWeight: it.defaultWeight,
        levels:        Array.isArray(it.levels) && it.levels.length > 0 ? it.levels : null,
      };
    });
    map[codeNum] = {
      nameTh:        sec.nameTh,
      totalWeight:   sec.totalWeight,
      displayOrder:  sec.displayOrder,
      items:         itemMap,
      inactiveCodes,
    };
  });
  return map;
}

// Apply overrides to a constants.js criteria array (PRE_CRITERIA or POST_CRITERIA).
// - Patches name/weight/levels of existing items from DB
// - Removes items soft-deleted by admin (isActive=false in DB)
// - Appends DB-only items (admin-added, not in constants) at end of section
// - Re-sorts sections by DB display_order
// Structural properties (divider, levelValues, calcType, calcThresholds) always
// come from constants.js.
export function applyOverrides(baseCriteria, overrideMap) {
  if (!overrideMap || Object.keys(overrideMap).length === 0) return baseCriteria;

  const withOrder = baseCriteria.map((section, si) => {
    const ov = overrideMap[String(si + 1)];
    if (!ov) return { order: si + 1, section };

    const matchedCodes = new Set();

    // Patch existing items, filter deleted
    const patchedItems = section.items
      .filter(item => {
        if (item.divider) return true;
        return !ov.inactiveCodes.has(item.no);
      })
      .map(item => {
        if (item.divider) return item;
        const ovItem = ov.items[item.no];
        if (ovItem) matchedCodes.add(item.no);
        if (!ovItem) return item;
        return {
          ...item,
          title:  ovItem.nameTh        ?? item.title,
          weight: ovItem.defaultWeight ?? item.weight,
          levels: ovItem.levels        ?? item.levels,
        };
      });

    // Append DB-only items (admin added — not in constants)
    const extraItems = Object.entries(ov.items)
      .filter(([code]) => !matchedCodes.has(code))
      .map(([code, ovItem]) => ({
        no:     code,
        title:  ovItem.nameTh        ?? code,
        weight: ovItem.defaultWeight ?? 0,
        levels: ovItem.levels        ?? [],
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

  withOrder.sort((a, b) => a.order - b.order);
  return withOrder.map(({ section }) => section);
}
