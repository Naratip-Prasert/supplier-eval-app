// ============================================================
//  utils/weightMath.ts
//  ฟังก์ชันคำนวณ/จัดการน้ำหนัก (weight) ล้วนๆ ที่ AdminCriteriaEditor.jsx
//  ใช้ — แยกออกมาจากไฟล์หน้า UI เพราะเป็นฟังก์ชัน pure (input เดียวกัน
//  ได้ output เดียวกันเสมอ ไม่ผูกกับ state/closure ของ component) ทำให้
//  ทดสอบและอ่านง่ายกว่าเดิมที่ฝังอยู่ใน 2000+ บรรทัดของหน้า Admin
// ============================================================
import { PRE_CRITERIA, POST_CRITERIA, FUNCTION_MODULES, functionSectionWeightFrom } from "../../constants";

export interface AdminItem {
  id: string;
  code?: string;
  nameTh?: string;
  defaultWeight?: number | null;
  isActive?: boolean;
  divider?: boolean;
}

export interface AdminSection {
  id: string;
  code?: string;
  nameTh?: string;
  totalWeight?: number;
  groupWeights?: Record<string, number> | null;
  items: AdminItem[];
}

export const r2adm = (n: number): number => Math.round(n * 100) / 100;

// เช็คว่า section เป็นหมวด ESG หรือไม่ (ดูทั้งชื่อและ code)
export function isEsgCategory(s: { nameTh?: string; code?: string }): boolean {
  return !!(s.nameTh?.includes('ESG') || s.code?.match(/ESG/i));
}

// Factory item detection: supports both old F-prefix (F5.1.1) and new ESGF-prefix (ESGF1.1)
export const isEsgFactory = (code: string | null | undefined): boolean => !!code?.startsWith('ESGF') || /^F\d/.test(code ?? '');

// Derive DB criteria_set from category code
export function getCriteriaSetFromCode(code: string | null | undefined): string {
  if (!code) return 'pre_eval';
  const m = code.match(/^FUNC-(PRE|POST)-M(\d+)$/i);
  if (m) return `${m[1].toLowerCase()}_m${m[2]}`;
  return code.startsWith('POST-') ? 'post_eval' : 'pre_eval';
}

// Auto-suggest next item code based on section code and existing items
export function nextItemCode(sectionCode: string | null | undefined, allItems: AdminItem[], esgFilter: string | null | undefined): string {
  if (!sectionCode) return '';
  const activeItems = allItems.filter(it => it.isActive !== false);

  const coreMatch = sectionCode.match(/^(?:PRE|POST)-CORE(\d+)$/i);
  if (coreMatch) {
    const sn = coreMatch[1];
    let maxN = 0;
    activeItems.forEach(it => {
      const m = it.code?.match(new RegExp(`^${sn}\\.(\\d+)$`));
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    return `${sn}.${maxN + 1}`;
  }

  const funcMatch = sectionCode.match(/^FUNC-(?:PRE|POST)-M(\d+)$/i);
  if (funcMatch) {
    const mn = funcMatch[1];
    let maxN = 0;
    activeItems.forEach(it => {
      const m = it.code?.match(new RegExp(`^M${mn}\\.(\\d+)$`));
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    return `M${mn}.${maxN + 1}`;
  }

  if (sectionCode.match(/^(?:PRE|POST)-ESG$/i)) {
    const factory = esgFilter === 'factory';
    const prefix = factory ? 'ESGF' : 'ESG';
    const pool = activeItems.filter(it => factory ? isEsgFactory(it.code) : (!isEsgFactory(it.code)));
    let maxSub = 0, maxItem = 0;
    const re = new RegExp(`^${prefix}(\\d+)\\.(\\d+)$`);
    pool.forEach(it => {
      const m = it.code?.match(re);
      if (m) {
        const s = parseInt(m[1], 10), i = parseInt(m[2], 10);
        if (s > maxSub || (s === maxSub && i > maxItem)) { maxSub = s; maxItem = i; }
      }
    });
    if (maxSub === 0) return `${prefix}1.1`;
    return `${prefix}${maxSub}.${maxItem + 1}`;
  }

  return '';
}

// Mirror of Evalform's initWeights logic — computes weight each item actually gets
export function computeEffectiveWeights(items: AdminItem[], sectionWeight: number | null | undefined): Record<string, number> {
  const sw = sectionWeight ?? 0;
  if (items.length === 0) return {};
  const constantSum = items.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
  if (items.every(it => it.defaultWeight != null) && Math.abs(constantSum - sw) < 0.1) {
    return Object.fromEntries(items.map(it => [it.id, it.defaultWeight as number]));
  }
  // fallback: equal split with buffer on last item (same as Evalform)
  const each = r2adm(sw / items.length);
  let rem = sw;
  const result: Record<string, number> = {};
  items.forEach((it, ii) => {
    if (ii === items.length - 1) result[it.id] = Math.max(0, r2adm(rem));
    else { result[it.id] = each; rem -= each; }
  });
  return result;
}

// Mirror of Evalform's assignEsgSubGroupWeights — live effective weight per ESG item.
// Derives sub-group from item code (ESG1.x → group 1, ESGF2.x → group 2, etc.)
// groupWeights: { "1": %, "2": %, "3": % } — from SectionCard local state (live preview)
export function computeEsgEffectiveWeights(
  sectionItems: AdminItem[],
  totalWeight: number | null | undefined,
  groupWeights: Record<string, number> | null | undefined,
  esgFilter: string | null | undefined
): Record<string, number> {
  const sw = totalWeight ?? 0;
  if (!sw || !sectionItems?.length) return {};
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const byGroup: Record<string, AdminItem[]> = {};
  sectionItems.forEach(item => {
    if (item.isActive === false || item.divider) return;
    const code = item.code ?? '';
    if (esgFilter === 'ho'      &&  isEsgFactory(code)) return;
    if (esgFilter === 'factory' && !isEsgFactory(code)) return;
    const m = code.match(/^ESGF?(\d+)\./i);
    if (!m) return;
    const grp = m[1];
    (byGroup[grp] = byGroup[grp] ?? []).push(item);
  });
  const result: Record<string, number> = {};
  Object.entries(byGroup).forEach(([grp, items]) => {
    const pct  = groupWeights?.[grp] != null ? Number(groupWeights[grp]) : (100 / 3);
    const absW = (pct / 100) * sw;
    const n    = items.length;

    // Respect each item's own saved weight once they've been customized
    // (i.e. already sum to the group's target) — otherwise fall back to an
    // equal split, same as before.
    const customSum = items.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
    if (items.every(it => it.defaultWeight != null) && Math.abs(customSum - absW) < 0.1) {
      items.forEach(it => { result[it.id] = r2(it.defaultWeight as number); });
      return;
    }

    let rem = absW;
    items.forEach((it, i) => {
      if (i === n - 1) result[it.id] = r2(Math.max(0, rem));
      else { const w = r2(absW / n); result[it.id] = w; rem -= w; }
    });
  });
  return result;
}

interface BufferResult {
  adjustments: Record<string, number>;
  tooLarge?: boolean;
}

// Returns { adjustments: {id: newWeight, ...} } or { tooLarge: true }
// Rule: only items AFTER the edited one (index > editedIdx) buffer the change,
// cascading from the last item backward. Editing the last item always fails
// (nothing after it) → tooLarge → toast error.
export function getCatBuffer(pool: AdminSection[], editedId: string, newVal: number | string): BufferResult {
  const n = pool.length;
  if (n < 2) return { adjustments: {} };
  const editedIdx = pool.findIndex(s => s.id === editedId);
  if (editedIdx === -1) return { adjustments: {} };
  const clamped = Math.max(0, Number(newVal) || 0);
  const delta = r2adm(clamped - (pool[editedIdx].totalWeight ?? 0));
  if (Math.abs(delta) < 0.005) return { adjustments: {} };

  // Candidates: items after the edited one, from last toward editedIdx
  const candidates: AdminSection[] = [];
  for (let i = n - 1; i > editedIdx; i--) candidates.push(pool[i]);

  const adjustments: Record<string, number> = {};
  let remaining = delta;
  for (const sec of candidates) {
    if (Math.abs(remaining) < 0.005) break;
    const cur = sec.totalWeight ?? 0;
    if (remaining > 0) {
      const absorb = Math.min(cur, remaining);
      if (absorb > 0.005) {
        adjustments[sec.id] = r2adm(cur - absorb);
        remaining = r2adm(remaining - absorb);
      }
    } else {
      adjustments[sec.id] = r2adm(cur + Math.abs(remaining));
      remaining = 0;
    }
  }

  if (remaining > 0.005) return { adjustments: {}, tooLarge: true };
  return { adjustments };
}

// Same rule for items within a section
export function getItemBuffer(sec: AdminSection, editedId: string, newVal: number | string): BufferResult {
  const items = sec.items.filter(it => it.isActive !== false);
  const n = items.length;
  if (n < 2) return { adjustments: {} };
  const editedIdx = items.findIndex(it => it.id === editedId);
  if (editedIdx === -1) return { adjustments: {} };
  const clamped = Math.max(0, Number(newVal) || 0);
  const delta = r2adm(clamped - (items[editedIdx].defaultWeight ?? 0));
  if (Math.abs(delta) < 0.005) return { adjustments: {} };

  // Candidates: items after the edited one, from last toward editedIdx
  const candidates: AdminItem[] = [];
  for (let i = n - 1; i > editedIdx; i--) candidates.push(items[i]);

  const adjustments: Record<string, number> = {};
  let remaining = delta;
  for (const it of candidates) {
    if (Math.abs(remaining) < 0.005) break;
    const cur = it.defaultWeight ?? 0;
    if (remaining > 0) {
      const absorb = Math.min(cur, remaining);
      if (absorb > 0.005) {
        adjustments[it.id] = r2adm(cur - absorb);
        remaining = r2adm(remaining - absorb);
      }
    } else {
      adjustments[it.id] = r2adm(cur + Math.abs(remaining));
      remaining = 0;
    }
  }

  if (remaining > 0.005) return { adjustments: {}, tooLarge: true };
  return { adjustments };
}

// ESG sub-items (ESG1.1, ESG1.2, ...) rebalance within their OWN sub-group
// only, so the group's absolute weight (groupWeights[grp]% of section
// totalWeight) stays fixed — unlike getItemBuffer, which balances against
// the whole section pool and would let one group's edit bleed weight into
// another group's items.
export function getEsgItemBuffer(
  pool: AdminItem[],
  totalWeight: number | null | undefined,
  groupWeights: Record<string, number> | null | undefined,
  editedId: string,
  newVal: number | string
): { adjustments: Record<string, number>; clamped: number } {
  const grpOf = (code: string | null | undefined) => (code ?? '').match(/^ESGF?(\d+)\./i)?.[1] ?? null;
  const edited = pool.find(it => it.id === editedId);
  const grp = edited ? grpOf(edited.code) : null;
  if (!grp) return { adjustments: {}, clamped: Math.max(0, Number(newVal) || 0) };

  const groupItems = pool.filter(it => grpOf(it.code) === grp);
  const pct  = groupWeights?.[grp] != null ? Number(groupWeights[grp]) : (100 / 3);
  const absW = (pct / 100) * (totalWeight ?? 0);
  const clamped = Math.max(0, Math.min(absW, Number(newVal) || 0));

  const others = groupItems.filter(it => it.id !== editedId);
  if (others.length === 0) return { adjustments: {}, clamped };

  // Items never customized before have no defaultWeight in the DB (null)
  // — treat their "current share" as an equal split, same as what's on
  // screen, instead of 0 (which would silently zero them out here and
  // leave them permanently null, breaking the "every item has a saved
  // weight" check in computeEsgEffectiveWeights on the next load).
  const fallbackShare = absW / groupItems.length;
  const oldOthersSum = others.reduce((s, it) => s + (it.defaultWeight ?? fallbackShare), 0);
  const remaining = Math.max(0, r2adm(absW - clamped));

  // Every other item in the group gets an explicit weight written —
  // proportional to its existing share, or equal split if none had one —
  // so a single edit never leaves a sibling item's weight as null.
  const adjustments: Record<string, number> = {};
  let rem = remaining;
  others.forEach((it, i) => {
    if (i === others.length - 1) { adjustments[it.id] = Math.max(0, r2adm(rem)); return; }
    const share = oldOthersSum > 0
      ? ((it.defaultWeight ?? fallbackShare) / oldOthersSum) * remaining
      : remaining / others.length;
    const w = r2adm(share);
    adjustments[it.id] = w;
    rem -= w;
  });

  return { adjustments, clamped };
}

// Scale items to match newTotal.
// If items have existing weights → proportional (preserves user's custom ratios).
// If all items are 0 → equal: integer first → equal 2-dp → buffer last.
// forceEqual=true → always distribute equally (used for normalize-esg, handleCoreWeightSave)
// forceEqual=false → proportional when items have weights (used for save-cat)
export function scaleItemsToTotal(secItems: AdminItem[], newTotal: number, forceEqual = false): Record<string, number> {
  const real = secItems.filter(it => it.isActive !== false);
  if (real.length === 0) return {};
  const n = real.length;
  const oldSum = real.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
  const result: Record<string, number> = {};
  const equalDist = () => {
    const each = r2adm(newTotal / n);
    if (each === Math.round(each)) {
      real.forEach(it => { result[it.id] = each; });
    } else {
      let rem = newTotal;
      real.forEach((it, i) => {
        if (i === n - 1) { result[it.id] = Math.max(0, r2adm(rem)); }
        else { result[it.id] = each; rem -= each; }
      });
    }
  };
  if (!forceEqual && oldSum > 0) {
    // Proportional — preserves custom item weight ratios
    let rem = newTotal;
    real.forEach((it, i) => {
      if (i === n - 1) { result[it.id] = Math.max(0, r2adm(rem)); }
      else { const w = r2adm(((it.defaultWeight ?? 0) / oldSum) * newTotal); result[it.id] = w; rem -= w; }
    });
  } else {
    equalDist();
  }
  return result;
}

// ESG sections hold both HO/Store items and Factory items (code starts with "F")
// together, but they're alternate evaluation tracks, not one shared pool — each
// subset must independently sum to the section's totalWeight. Non-ESG sections
// scale normally as a single pool.
// For ESG, items are further split by sub-group (ESG1.x / ESG2.x / ESG3.x) and
// each sub-group's allocation = totalWeight × groupWeights[grp]%. This keeps
// DB item weights consistent with the "คำนวณ" display in AdminCriteriaEditor.
export function scaleSectionItemsToTotal(sec: AdminSection, newTotal: number, forceEqual = false): Record<string, number> {
  const isEsg = isEsgCategory(sec);
  if (!isEsg) return scaleItemsToTotal(sec.items, newTotal, forceEqual);

  const gw = sec.groupWeights ?? { "1": 33.33, "2": 33.33, "3": 33.34 };
  const result: Record<string, number> = {};
  (['ho', 'factory'] as const).forEach(side => {
    const sideItems = side === 'ho'
      ? sec.items.filter(it => !isEsgFactory(it.code))
      : sec.items.filter(it =>  isEsgFactory(it.code));
    if (!sideItems.length) return;
    (['1', '2', '3'] as const).forEach(grp => {
      const prefix = side === 'ho' ? `ESG${grp}.` : `ESGF${grp}.`;
      const grpItems = sideItems.filter(it => it.code?.startsWith(prefix));
      if (!grpItems.length) return;
      // Number(x) ไม่เคยได้ null/undefined กลับมา (ได้ NaN แทนถ้าแปลงไม่ได้)
      // ดังนั้น `Number(gw[grp]) ?? (100/3)` จะไม่มีวัน fallback เลยแม้
      // gw[grp] จะหายไปจริงๆ — ต้องเช็ค Number.isFinite แทน ไม่งั้น pct
      // เป็น NaN แล้วไหลต่อไปทำให้น้ำหนัก ESG กลุ่มนั้นพังทั้งกลุ่ม
      const parsedPct = Number(gw[grp]);
      const pct      = Number.isFinite(parsedPct) ? parsedPct : (100 / 3);
      const grpTotal = r2adm((pct / 100) * newTotal);
      Object.assign(result, scaleItemsToTotal(grpItems, grpTotal, forceEqual));
    });
  });
  return result;
}

// ── Seed payload builder ──────────────────────────────────────
// Seeds PRE + POST + all M1-M7 modules in one shot.
export function buildSeedPayload() {
  const r2 = (n: number) => Math.round(n * 100) / 100;

  function computeEqualWeights(realItems: { no?: string }[], sw: number): Record<string, number> {
    const n = realItems.length;
    if (n === 0) return {};
    const each = r2(sw / n);
    let rem = sw;
    const map: Record<string, number> = {};
    realItems.forEach((item, ii) => {
      if (!item.no) return;
      const w = ii === n - 1 ? Math.max(0, r2(rem)) : each;
      map[item.no] = w;
      rem -= each;
    });
    return map;
  }

  const transform = (base: typeof PRE_CRITERIA, prefix: string, criteriaSet: string) =>
    base.map((section, si) => {
      const realItems = section.items.filter(i => !i.divider);
      const sw = section.weight ?? 0;
      const wMap = computeEqualWeights(realItems, sw);
      return {
        code:         `${prefix}-CAT${si + 1}`,
        nameTh:       section.section,
        totalWeight:  sw,
        criteriaSet,
        displayOrder: si + 1,
        items: realItems.map(item => ({
          code:          item.no,
          nameTh:        item.title,
          defaultWeight: (item.no && wMap[item.no]) ?? 0,
          levelValues:   item.levelValues ?? null,
          levels:        item.levels ?? [],
        })),
      };
    });

  // Function modules are configured separately per Pre/Post track (each
  // track's Core+ESG total differs, so each needs its own Function weight
  // to independently reach 100%) — mirrors PRE-CORE*/POST-CORE*.
  // Seed weight = 100 − (that track's Core+ESG total), not a hardcoded
  // constant, so the freshly-seeded DB always sums to exactly 100%.
  const transformModules = (track: 'pre' | 'post') => {
    const funcW = functionSectionWeightFrom(track === 'pre' ? PRE_CRITERIA : POST_CRITERIA);
    return Object.entries(FUNCTION_MODULES).map(([key, mod], ki) => {
      const wMap = computeEqualWeights(mod.items, funcW);
      return {
        code:         `FUNC-${track.toUpperCase()}-${key.toUpperCase()}`,
        nameTh:       mod.label,
        totalWeight:  funcW,
        criteriaSet:  `${track}_${key}`,
        displayOrder: ki + 1,
        items: mod.items.map(item => ({
          code:          item.no,
          nameTh:        item.title,
          defaultWeight: (item.no && wMap[item.no]) ?? 0,
          levelValues:   item.levelValues ?? null,
          levels:        item.levels ?? [],
        })),
      };
    });
  };

  return [
    ...transform(PRE_CRITERIA,  'PRE',  'pre_eval'),
    ...transform(POST_CRITERIA, 'POST', 'post_eval'),
    ...transformModules('pre'),
    ...transformModules('post'),
  ];
}
