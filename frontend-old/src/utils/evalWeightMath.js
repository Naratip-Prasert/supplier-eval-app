// ============================================================
//  utils/evalWeightMath.js
//  ฟังก์ชันคำนวณ/แจกจ่ายน้ำหนัก (weight) ล้วนๆ ที่ Evalform.jsx ใช้ตอน
//  เริ่มฟอร์ม — แยกออกมาจากไฟล์หน้า UI เพราะเป็นฟังก์ชัน pure (input
//  เดียวกันได้ output เดียวกันเสมอ ไม่ผูกกับ state/closure ของ component)
//  ส่วนนี้เป็นจุดที่เปราะบางที่สุดของทั้งแอป (บั๊ก weight ทั้งหมดที่เจอใน
//  เซสชันนี้อยู่แถวนี้) แยกออกมาให้อ่าน/ทดสอบง่ายขึ้น โดยไม่แตะ logic เดิม
// ============================================================

export const r2 = (n) => Math.round(n * 100) / 100;

// ── AHP reference weights (from AHP_supplier.xlsx, display-only) ──
export const AHP_MAIN_W  = { '1': 38.65, '2': 21.21, '3': 21.21, '4': 11.98, '5': 6.94 };
export const AHP_LOCAL_W = {
  '1.1': 53.90, '1.2': 29.73, '1.3': 16.38,
  '2.1': 42.54, '2.2': 23.06, '2.3': 14.92, '2.4': 19.48,
  '3.1': 33.33, '3.2': 33.33, '3.3': 16.67, '3.4': 16.67,
  '4.1': 32.50, '4.2': 35.62, '4.3': 19.37, '4.4': 12.51,
};
export function getAhpMain(section) {
  const first = section.items.find(i => !i.divider);
  if (!first) return null;
  return AHP_MAIN_W[first.no.charAt(0)] ?? null;
}
export function getAhpLocal(itemNo) {
  if (!itemNo) return null;
  if (AHP_LOCAL_W[itemNo] !== undefined) return AHP_LOCAL_W[itemNo];
  const parts = itemNo.split('.');
  if (parts.length >= 2) return AHP_LOCAL_W[parts[0] + '.' + parts[1]] ?? null;
  return null;
}

// ESG sub-group dividers are labelled "ESG1 ...", "ESGF2 ...", etc. — the
// trailing digit is the stable key used to key group-weight overrides,
// independent of the HO/Factory "ESG" vs "ESGF" prefix.
export function esgGroupKey(label) {
  return label?.match(/^(?:ESG|ESGF)(\d+)/i)?.[1] ?? null;
}

// Distribute ESG section weight across its items using `groupPct` (key =
// esgGroupKey → % of section, e.g. {"1": 33.33, ...}), falling back to each
// divider's own groupWeight, then to an equal 3-way split.
//
// The last group absorbs whatever's left of `sw` instead of computing its
// own rounded share — three independently-rounded percentages (e.g.
// 33.33/33.34/33.33% each rounded to 2dp) can individually round up, so
// summing them can overshoot sw by a cent or two even though each GROUP's
// own items correctly sum to that group's share. That 0.01 leftover then
// shows up as the eval form's total sticking at "100.01% ≠ 100%" forever.
export function assignEsgSubGroupWeights(sectionItems, sw, items, groupPct) {
  const groups = [];
  let curKey = null, curFallbackPct = null, curItems = [];
  const pushGroup = () => {
    if (curItems.length) groups.push({ key: curKey, fallbackPct: curFallbackPct, items: curItems });
    curItems = [];
  };
  sectionItems.forEach(item => {
    if (item.divider) {
      if (item.level === 2) { pushGroup(); curKey = esgGroupKey(item.label); curFallbackPct = item.groupWeight ?? null; }
      return;
    }
    curItems.push(item);
  });
  pushGroup();

  let rem = sw;
  groups.forEach((g, gi) => {
    let absW;
    if (gi === groups.length - 1) {
      absW = Math.max(0, rem);
    } else {
      const pct = (groupPct && g.key && groupPct[g.key] != null) ? groupPct[g.key] : (g.fallbackPct ?? (100 / groups.length));
      absW = r2((pct / 100) * sw);
      rem -= absW;
    }
    const each = r2(absW / g.items.length);
    let itemRem = absW;
    g.items.forEach((it, i) => {
      if (i === g.items.length - 1) items[it.no] = r2(Math.max(0, itemRem));
      else { items[it.no] = each; itemRem -= each; }
    });
  });
}

export function initWeights(criteria) {
  const sections = {};
  const items    = {};
  criteria.forEach((section, si) => {
    const sw = section.weight ?? 0;
    sections[si] = sw;
    const realItems = section.items.filter((i) => !i.divider);

    // ESG section: has level-2 sub-group dividers → distribute by groupWeight
    const hasSubGroups = section.items.some(i => i.divider && i.level === 2 && i.groupWeight != null);
    if (hasSubGroups) {
      assignEsgSubGroupWeights(section.items, sw, items);
      return;
    }

    const constantSum = realItems.reduce((s, i) => s + (i.weight ?? 0), 0);

    // 1. DB weights: items sum ≈ section weight → use directly (parameter page overrides)
    if (realItems.every(i => i.weight != null) && Math.abs(constantSum - sw) < 0.1) {
      realItems.forEach(item => { items[item.no] = item.weight; });

    // 2. AHP proportions: use AHP_LOCAL_W percentages when available for all items
    } else if (realItems.length > 0 && realItems.every(i => getAhpLocal(i.no) != null)) {
      const ahpSum = realItems.reduce((s, i) => s + getAhpLocal(i.no), 0);
      let iRem = sw;
      realItems.forEach((item, ii) => {
        if (ii === realItems.length - 1) { items[item.no] = Math.max(0, r2(iRem)); }
        else { const w = r2(sw * getAhpLocal(item.no) / ahpSum); items[item.no] = w; iRem -= w; }
      });

    // 3. Proportional from item.weight (handles constants.js weights on different scale)
    } else if (constantSum > 0) {
      let iRem = sw;
      realItems.forEach((item, ii) => {
        if (ii === realItems.length - 1) { items[item.no] = Math.max(0, r2(iRem)); }
        else { const w = r2((item.weight / constantSum) * sw); items[item.no] = w; iRem -= w; }
      });

    // 4. Equal distribution fallback
    } else {
      const itemEach = realItems.length > 0 ? r2(sw / realItems.length) : 0;
      let iRem = sw;
      realItems.forEach((item, ii) => {
        if (ii === realItems.length - 1) { items[item.no] = Math.max(0, r2(iRem)); }
        else { items[item.no] = itemEach; iRem -= itemEach; }
      });
    }
  });
  return { sections, items };
}
