// ============================================================
//  constants.ts
// ============================================================
import criteriaData from "@shared/criteria-data.json";

export interface CriteriaEntry {
  no?: string;
  weight?: number;
  title?: string;
  levels?: string[];
  levelValues?: number[];
  divider?: boolean;
  label?: string;
  level?: number;
  groupWeight?: number;
  calcType?: string;
  calcThresholds?: number[];
}

export interface CriteriaSection {
  section: string;
  weight: number;
  items: CriteriaEntry[];
}

export interface FunctionModule {
  label: string;
  items: CriteriaEntry[];
}

export const DEPT_JOB_MAP: Record<"user" | "gcp", Record<string, string[]>> = {
  user: {
    "ฝ่ายจัดซื้อ":    ["JB-001 จัดซื้อวัสดุสำนักงาน", "JB-002 จัดซื้ออุปกรณ์ IT", "JB-003 จัดซื้อวัตถุดิบ"],
    "ฝ่ายการเงิน":    ["JB-010 ตรวจสอบบัญชี", "JB-011 จัดทำงบการเงิน"],
    "ฝ่ายวิศวกรรม":   ["JB-020 ก่อสร้างอาคารA", "JB-021 ซ่อมบำรุงเครื่องจักร", "JB-022 ออกแบบระบบไฟฟ้า"],
    "ฝ่ายผลิต":       ["JB-030 งานบรรจุภัณฑ์", "JB-031 แปรรูปผลิตภัณฑ์"],
    "ฝ่ายคลังสินค้า": ["JB-040 ขนส่งสินค้า", "JB-041 บริหารคลัง"],
  },
  gcp: {
    "ฝ่ายจัดซื้อ":  ["JB-001 จัดซื้อวัสดุสำนักงาน", "JB-002 จัดซื้ออุปกรณ์ IT", "JB-003 จัดซื้อวัตถุดิบ"],
    "ฝ่ายการเงิน":  ["JB-010 ตรวจสอบบัญชี", "JB-011 จัดทำงบการเงิน"],
    "ฝ่ายวิศวกรรม": ["JB-020 ก่อสร้างอาคารA", "JB-021 ซ่อมบำรุงเครื่องจักร", "JB-022 ออกแบบระบบไฟฟ้า"],
    "ฝ่ายผลิต":     ["JB-030 งานบรรจุภัณฑ์", "JB-031 แปรรูปผลิตภัณฑ์"],
  },
};

export const PRODUCT_TYPE_OPTIONS = ["สินค้า", "บริการ", "สินค้าและบริการ"];

// ป้ายกำกับทิศทางเรียงลำดับตามวันครบกำหนด — ใช้ร่วมกันใน LandingPage และ
// TasksPage (เดิม copy ซ้ำกันเป๊ะทั้งสองไฟล์)
export const DUE_DATE_SORT_LABEL: Record<"asc" | "desc", string> = { asc: "ครบกำหนดเร็วสุดก่อน", desc: "ครบกำหนดช้าสุดก่อน" };

export const PRE_PERIOD_OPTIONS = [
  "New Supplier / ผู้ขายรายใหม่",
];

export const EVAL_PERIOD_OPTIONS = [
  "Monthly / รายเดือน",
  "Quarterly / รายไตรมาส",
  "Semi-Annual / 6 เดือน",
  "Annual / รายปี",
];

export const LEVEL_COLORS = [
  "#ff6b6b",
  "#ffa07a",
  "#ffd700",
  "#90ee90",
  "#32cd32",
];

export const GRADE_MAP: Record<string, string> = {
  A: "#53af28",
  B: "#92c015",
  C: "#d7e600",
  D: "#b72e1c",
  F: "#4a0000",
};

export const GRADE_GUIDE = [
  { g: "A", range: "≥ 90", label: "ผ่านการรับรอง (Approved)",          color: "#53af28" },
  { g: "B", range: "≥ 80", label: "ผ่านเงื่อนไข (Conditional)",        color: "#92c015" },
  { g: "C", range: "≥ 70", label: "ต้องปรับปรุง (Improvement Required)",color: "#d7e600" },
  { g: "D", range: "≥ 60", label: "ไม่ผ่าน — ระงับ (Suspended)",       color: "#b72e1c" },
  { g: "F", range: "< 60", label: "ไม่ผ่าน — ตัดออก (Disqualified)",   color: "#4a0000" },
];

// FUNCTION_MODULES items deliberately use weight:1 uniformly (see shared/criteria-data.json)
// so initWeights' 'fallback: equal split' branch divides the section weight evenly.
export const PRE_CRITERIA: CriteriaSection[]     = criteriaData.PRE_CRITERIA;
export const POST_CRITERIA: CriteriaSection[]    = criteriaData.POST_CRITERIA;
export const FUNCTION_MODULES: Record<string, FunctionModule> = criteriaData.FUNCTION_MODULES;

// post_eval/half_year/yearly all score against POST_CRITERIA; pre_eval (and
// the now-retired "new_supplier") score against PRE_CRITERIA — same mapping
// the backend uses (backend/routes/evaluations.js criteriaSet resolution) so
// the two stay in sync.
export function isPostEvalType(evalType: string): boolean {
  return ["post_eval", "half_year", "yearly"].includes(evalType);
}

export function getCriteria(evalType: string): CriteriaSection[] {
  return isPostEvalType(evalType) ? POST_CRITERIA : PRE_CRITERIA;
}

// ── ESG HO/Store vs Factory split ─────────────────────────────
// The ESG section lists HO/Store items followed by Factory items, marked
// off by two `{ divider: true, level: 1 }` rows. Evaluators only assess one
// facility type, so both Evalform (editing) and ResultPage (read-only
// display/export) need to show just the chosen half — using the same split
// logic here keeps the two screens from ever disagreeing about which items
// belong to which group.
const ESG_HO_MARKER      = "สำนักงานใหญ่";
const ESG_FACTORY_MARKER = "โรงงาน";

export function findEsgSectionIndex(criteria: CriteriaSection[]): number {
  return criteria.findIndex((s) => s.items.some((i) => i.divider && i.label?.includes(ESG_HO_MARKER)));
}

export function splitEsgGroups(items: CriteriaEntry[]): { ho: CriteriaEntry[]; factory: CriteriaEntry[] } {
  const hoIdx      = items.findIndex((i) => i.divider && i.label?.includes(ESG_HO_MARKER));
  const factoryIdx = items.findIndex((i) => i.divider && i.label?.includes(ESG_FACTORY_MARKER));
  if (hoIdx === -1 || factoryIdx === -1) return { ho: items, factory: [] };
  // drop the marker row itself — the EsgTargetSelector buttons replace it
  return {
    ho:      items.slice(hoIdx + 1, factoryIdx),
    factory: items.slice(factoryIdx + 1),
  };
}

// Read-only display variant (ResultPage / History / Score Comparison):
// don't pick a single HO-or-Factory group at all — show whichever ESG
// item codes actually have a recorded score. For evaluations submitted
// after the HO/Factory selector existed this is always exactly one group
// (Evalform purges the other group's scores on submit), but evaluations
// submitted *before* the selector existed have BOTH groups' codes scored
// (the old form showed everything concatenated) — picking a single group
// would silently hide the other half's score from the section total and
// radar axis, even though it's part of the stored total_score.
// Showing "whichever has a score" degrades correctly for both cases.
// Part 2 "Function module" — the section's weight is NOT a fixed constant
// (it used to be hardcoded 25): admin can rebalance Core/Function/ESG on the
// Parameter page, so the real weight lives in the DB (funcOverride.totalWeight).
// When no DB value is available (custom module, DB still loading, fresh seed),
// derive it as the complement that makes the grand total exactly 100% —
// 100 − (sum of the Core+ESG section weights actually in effect).
// Items use weight:1 uniformly so they take the same initWeights "equal
// split" fallback branch ESG items already use — the section's weight gets
// divided evenly across however many items are visible.
export function functionSectionWeightFrom(baseCriteria: CriteriaSection[] | null | undefined): number {
  const used = (baseCriteria ?? []).reduce((t, sec) => t + (Number(sec.weight) || 0), 0);
  return Math.max(0, Math.round((100 - used) * 100) / 100);
}

interface FunctionOverride {
  items?: CriteriaEntry[];
  totalWeight?: number;
  nameTh?: string;
}

function buildFunctionSection(moduleCode: string | null | undefined, customItems: CriteriaEntry[] | null | undefined, weight: number): CriteriaSection | null {
  if (!moduleCode) return null;
  if (moduleCode === "custom") {
    return { section: "อื่นๆ (กำหนดเอง)", weight, items: customItems ?? [] };
  }
  const mod = FUNCTION_MODULES[moduleCode];
  if (!mod) return null;
  return { section: `${mod.label}`, weight, items: mod.items };
}

// Combined function section — all M1-M7 items in one flat section with
// module dividers between groups. Used when no specific moduleCode is set
// (the new "คะแนนร่วม" mode) and as fallback for backward-compat displays.
export function buildCombinedFunctionSection(weight: number): CriteriaSection {
  const items: CriteriaEntry[] = Object.entries(FUNCTION_MODULES).flatMap(([key, mod]) => [
    { divider: true, label: `${key.toUpperCase()} · ${mod.label.split(' · ').slice(1).join(' · ')}`, level: 1 },
    ...mod.items,
  ]);
  return { section: "Function (คะแนนร่วม)", weight, items };
}

export function getGrade(score: number): string {
  const s = Math.round(score * 10) / 10; // round to 1dp — matches .toFixed(1) display
  if (s >= 90) return "A";
  if (s >= 80) return "B";
  if (s >= 70) return "C";
  if (s >= 60) return "D";
  return "F";
}

// ── Override-aware variants ───────────────────────────────────
// Accept an already-overridden baseCriteria array instead of evalType,
// so callers can apply DB overrides before calling these functions.

// funcOverride: { items, totalWeight } from buildFunctionOverrideMap — using
// its totalWeight (instead of always falling back to a derived default)
// keeps the eval form's grand total in sync after admin changes a module's
// weight on the Parameter page.
export function getDisplayCriteriaFrom(
  baseCriteria: CriteriaSection[],
  esgTarget: "factory" | "ho" | string | null | undefined,
  moduleCode: string | null | undefined,
  customItems: CriteriaEntry[] | null | undefined,
  funcOverride: FunctionOverride | null | undefined
): CriteriaSection[] {
  const esgIdx = findEsgSectionIndex(baseCriteria);
  if (esgIdx === -1) return baseCriteria;
  const funcW = functionSectionWeightFrom(baseCriteria);
  const core = baseCriteria.map((section, si) => {
    if (si !== esgIdx) return section;
    const groups = splitEsgGroups(section.items);
    const chosen = esgTarget === "factory" ? groups.factory : esgTarget === "ho" ? groups.ho : [];
    return { ...section, items: chosen };
  });
  let functionSection: CriteriaSection;
  if (funcOverride?.items && moduleCode && moduleCode !== "custom") {
    const mod = FUNCTION_MODULES[moduleCode];
    functionSection = { section: mod?.label ?? funcOverride.nameTh ?? moduleCode.toUpperCase(), weight: funcOverride.totalWeight ?? funcW, items: funcOverride.items };
  } else {
    functionSection = buildFunctionSection(moduleCode, customItems, funcW)
      ?? { section: "Function", weight: funcW, items: [] };
  }
  return [...core.slice(0, esgIdx), functionSection, ...core.slice(esgIdx)];
}

export function getScoredCriteriaFrom(
  baseCriteria: CriteriaSection[],
  scores: Record<string, unknown> | null | undefined,
  moduleCode: string | null | undefined,
  customItems: CriteriaEntry[] | null | undefined,
  funcOverride: FunctionOverride | null | undefined
): CriteriaSection[] {
  const esgIdx = findEsgSectionIndex(baseCriteria);
  if (esgIdx === -1 || !scores) return baseCriteria;
  const funcW = functionSectionWeightFrom(baseCriteria);
  const core = baseCriteria.map((section, si) => {
    if (si !== esgIdx) return section;
    const groups     = splitEsgGroups(section.items);
    const hoHit      = groups.ho.some((i) => !i.divider && i.no != null && scores[i.no] != null);
    const factoryHit = groups.factory.some((i) => !i.divider && i.no != null && scores[i.no] != null);
    const chosen = hoHit && factoryHit ? [...groups.ho, ...groups.factory]
      : hoHit ? groups.ho
      : factoryHit ? groups.factory
      : [];
    return { ...section, items: chosen };
  });
  let functionSection: CriteriaSection;
  if (funcOverride?.items && moduleCode && moduleCode !== "custom") {
    const mod = FUNCTION_MODULES[moduleCode];
    functionSection = { section: mod?.label ?? funcOverride.nameTh ?? moduleCode.toUpperCase(), weight: funcOverride.totalWeight ?? funcW, items: funcOverride.items };
  } else {
    // Prefer module-specific section (old saved results); fall back to combined
    functionSection = buildFunctionSection(moduleCode, customItems, funcW)
      ?? buildCombinedFunctionSection(funcW);
  }
  return [...core.slice(0, esgIdx), functionSection, ...core.slice(esgIdx)];
}
