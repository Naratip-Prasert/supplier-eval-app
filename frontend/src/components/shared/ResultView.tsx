// ============================================================
//  components/ResultView.tsx
//  Ported from pages/Resultpage.jsx. Shared by app/(app)/eval/result/
//  (fresh submit) and app/(app)/evaluations/[id]/ (read-only history
//  view, readOnly=true) — same component both places, exactly like
//  the old App.jsx reused <ResultPage readOnly /> for both cases.
// ============================================================
"use client";

import { useState, useEffect, useRef } from "react";
import { Header, GreenButton, useModal, useClickOutside } from "@/components";
import { isPostEvalType, GRADE_MAP, GRADE_GUIDE, getCriteria, getScoredCriteriaFrom, findEsgSectionIndex, type CriteriaEntry } from "@/constants";
import { useCriteriaOverrides, useFunctionOverrides } from "@/context/CriteriaContext";
import { applyOverrides } from "@/utils/shared/criteriaOverlay";
import { authFetch } from "@/utils/api";
import { Download, Printer, CheckCircle2, XCircle } from "lucide-react";
import type { EvalFormData, EvalResult } from "@/context/EvalFlowContext";
import type { AuthUser } from "@/context/AuthContext";

function getShortLabel(section: string): string {
  const numMatch   = section.match(/^(\d+)\./);
  const num        = numMatch ? numMatch[1] + ". " : "";
  const parenMatch = section.match(/\(([A-Z]{2,10})\)/);
  if (parenMatch) return num + parenMatch[1];
  const clean = section.replace(/^\d+\.\s*/, "").split("/")[0].trim();
  return num + (clean.length > 16 ? clean.slice(0, 14) + "…" : clean);
}

// Professional muted palette — no rainbow
const SECTION_COLORS = ["#1e6b3a", "#1558a0", "#6b3fa0", "#a02020", "#b56a00", "#00787a"];

const EVAL_TYPE_LABEL: Record<string, string> = { pre_eval: "Pre", post_eval: "Post", half_year: "Half-Year", yearly: "Yearly", ad_hoc: "Ad-hoc" };

// Shared card style
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: "#fff",
  border: "1px solid #e0e6e0",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  ...extra,
});

interface EvalHistoryRow {
  evalId: string;
  evalType: string;
  period?: string;
  role?: string;
  totalScore?: number | string | null;
  grade?: string | null;
  submittedAt?: string | null;
}

export interface ResultViewProps {
  formData: EvalFormData;
  result: EvalResult;
  user: AuthUser | null;
  profilePic?: string | null;
  onBack: () => void;
  onBackToEval: () => void;
  onViewHistoryEval?: (id: string) => void;
  readOnly?: boolean;
}

export default function ResultView({ formData, result, user, profilePic, onBack, onBackToEval, onViewHistoryEval, readOnly = false }: ResultViewProps) {
  const { showConfirm, ModalEl } = useModal();
  const { totalScore, grade, scores = {} } = result;
  const gradeColor = GRADE_MAP[grade];
  const evalLabel  = isPostEvalType(formData.evalType) ? "Post" : "Pre";
  const overrideMap = useCriteriaOverrides(isPostEvalType(formData.evalType));
  const funcMap     = useFunctionOverrides(isPostEvalType(formData.evalType));
  const funcOverride = (funcMap && result.moduleCode && result.moduleCode !== "custom")
    ? (funcMap[result.moduleCode] ?? null)
    : null;
  const baseCriteria = applyOverrides(getCriteria(formData.evalType), overrideMap);
  const scoredCriteria = getScoredCriteriaFrom(
    baseCriteria, result.scores, result.moduleCode, result.customItems as CriteriaEntry[] | null | undefined, funcOverride
  );
  // Prefer the title frozen at submit time (evaluation_scores.name_th_snapshot)
  // over today's live criteria title — otherwise renaming/repurposing an item's
  // code later would silently relabel old evaluations' history.
  const titleSnapshots = result.titleSnapshots;
  const withTitles = titleSnapshots
    ? scoredCriteria.map(sec => ({
        ...sec,
        items: sec.items.map(item =>
          item.no && titleSnapshots[item.no] ? { ...item, title: titleSnapshots[item.no] } : item
        ),
      }))
    : scoredCriteria;
  // History view only: `getCriteria()` + applyOverrides always reflects
  // whatever criteria exist *today* — is_active=false items are filtered
  // out entirely (see criteriaOverlay.ts), and a soft-deleted category code
  // can be reactivated later with completely different content (same row,
  // new name_th — see criteria.controller.ts createCategory). Three failure
  // modes without the logic below:
  //  1. An item added after this evaluation was submitted shows up as an
  //     extra blank row that was never scored.
  //  2. An item whose category was deleted vanishes from the live structure
  //     entirely — even though this evaluation genuinely scored it.
  //  3. An item whose category was deleted THEN reactivated with different
  //     content re-appears, but grouped under that new content's section
  //     label instead of what it actually was at submit time.
  // Fix: every scored item is grouped by its category_name_th_snapshot when
  // one exists — regardless of whether that label still matches any live
  // section — falling back to wherever it's found live only when there's no
  // snapshot to compare against (pre-snapshot-feature evaluations).
  const categorySnapshots = result.categorySnapshots;
  let CRITERIA = withTitles;
  if (readOnly) {
    const scoredCodes = new Set(Object.keys(scores));
    const belongsToLiveSection = (code: string, sectionLabel: string) => {
      const snap = categorySnapshots?.[code];
      return !snap || snap === sectionLabel;
    };
    const orphanBySection = new Map<string, CriteriaEntry[]>();
    const pushOrphan = (code: string, label: string, item: CriteriaEntry) => {
      (orphanBySection.get(label) ?? orphanBySection.set(label, []).get(label)!).push(item);
    };
    // Pass 1: pull mismatched items (case 3) out of whichever live section
    // they happen to sit in today, rerouting them to their snapshotted label.
    const withoutMismatches = withTitles.map(sec => {
      const kept: CriteriaEntry[] = [];
      sec.items.forEach(item => {
        if (item.divider || !item.no || !scoredCodes.has(item.no) || belongsToLiveSection(item.no, sec.section)) {
          kept.push(item);
          return;
        }
        pushOrphan(item.no, categorySnapshots![item.no], item);
      });
      return { ...sec, items: kept };
    });
    // Pass 2: fully-deleted items (case 2) that never matched any live
    // section at all.
    const knownCodes = new Set(withTitles.flatMap(sec => sec.items.filter(i => i.no).map(i => i.no as string)));
    scoredCodes.forEach(code => {
      if (knownCodes.has(code)) return;
      const label = categorySnapshots?.[code] ?? "หัวข้ออื่นๆ (ถูกลบแล้ว)";
      pushOrphan(code, label, { no: code, title: titleSnapshots?.[code] ?? code });
    });
    const merged = withoutMismatches.map(sec => {
      const extra = orphanBySection.get(sec.section);
      if (!extra) return sec;
      orphanBySection.delete(sec.section);
      return { ...sec, items: [...sec.items, ...extra] };
    });
    orphanBySection.forEach((items, label) => merged.push({ section: label, weight: 0, items }));
    // Case 1: drop items with no recorded score (added after submission).
    const filtered = merged.map(sec => ({
      ...sec,
      items: sec.items.filter(item => item.divider || (item.no && scores[item.no] != null)),
    }));
    // A section can end up holding nothing but dividers (or nothing at all)
    // once its only scored item(s) got rerouted elsewhere above — showing
    // that as a real section (0 achieved / its live weight as the max) reads
    // as a missing/failed score instead of "there was never anything here
    // for this evaluation."
    CRITERIA = filtered.filter(sec => sec.items.some(item => !item.divider));
  }

  // ถ้าเป็นการดูผลย้อนหลัง (มี submittedAt จริงจาก DB) ให้โชว์วันที่ประเมินจริง
  // ไม่ใช่วันนี้ — เดิมใช้ new Date() ตายตัว เลยขึ้นวันที่ปัจจุบันเสมอแม้ดูผลเก่า
  const evalDateObj = result.submittedAt ? new Date(result.submittedAt) : new Date();
  const dateStr = `${String(evalDateObj.getDate()).padStart(2,"0")}/${String(evalDateObj.getMonth()+1).padStart(2,"0")}/${evalDateObj.getFullYear()}`;

  const sectionSummary = CRITERIA.map((sec, si) => {
    const realItems = sec.items.filter(i => !i.divider);
    // Prefer the weights actually saved with this evaluation (result.weights,
    // frozen per item at submit time) over the section's live/current weight
    // (sec.weight) — otherwise a history view keeps "re-pricing" itself to
    // whatever the admin has since changed the criteria weights to, instead
    // of showing what was really scored at the time.
    const frozenWeightSum = realItems.reduce((s, item) => s + (result.weights?.[item.no ?? ""] ?? 0), 0);
    const max = result.sectionWeights?.[si] ?? (frozenWeightSum > 0 ? frozenWeightSum : (sec.weight ?? 0));
    const got = realItems.reduce((s, item) => {
      const lv = item.no ? scores[item.no] : undefined;
      if (!lv) return s;
      const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
      return s + (lv / maxLv) * (result.weights?.[item.no ?? ""] ?? 0);
    }, 0);
    return { label: getShortLabel(sec.section), got, max };
  });

  // Dashboard split: Function and ESG are always exactly one section each —
  // ESG is located by its HO/Factory divider marker, same as everywhere else
  // in the app (see EvalForm's functionSectionIndex/esgSectionIndexInCriteria
  // — same convention, reused here rather than invented fresh). Everything
  // else (the CORE categories, plus any reconstructed orphan sections from
  // deleted criteria) goes in one "Core" bucket — that's the one with many
  // categories to compare, which is what actually needs a bar chart; a
  // single Function or ESG value is a Meter, not a bar.
  //
  // The marker must be located on `baseCriteria` (pre-getScoredCriteriaFrom),
  // NOT on CRITERIA/scoredCriteria — splitEsgGroups (called inside
  // getScoredCriteriaFrom to pick the HO-or-Factory half) deliberately drops
  // the divider row itself once it's done its job, so by the time CRITERIA
  // exists there's nothing left to search for. Function is inserted right
  // before wherever ESG was found (functionSectionIndex = esgSectionIndex,
  // esgSectionIndexInCriteria = esgSectionIndex + 1), so the same +1 offset
  // locates both in the final array.
  const rawEsgIdx = findEsgSectionIndex(baseCriteria);
  const esgIdxFinal = rawEsgIdx === -1 ? -1 : rawEsgIdx + 1;
  const functionIdxFinal = rawEsgIdx;
  const functionSummary = functionIdxFinal >= 0 ? sectionSummary[functionIdxFinal] : null;
  const esgSummary = esgIdxFinal >= 0 ? sectionSummary[esgIdxFinal] : null;
  const coreSummaries = sectionSummary.filter((_, si) => si !== functionIdxFinal && si !== esgIdxFinal);

  const weightParts = [
    { label: `Core (${coreSummaries.length} หมวด)`, weight: coreSummaries.reduce((s, x) => s + x.max, 0), color: "#2e7d32" },
    ...(functionSummary ? [{ label: "Function", weight: functionSummary.max, color: "#1558a0" }] : []),
    ...(esgSummary ? [{ label: "ESG", weight: esgSummary.max, color: "#b56a00" }] : []),
  ].filter(p => p.weight > 0.005);
  const totalWeight = weightParts.reduce((s, p) => s + p.weight, 0);

  const [doneStatus,  setDoneStatus]  = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [doneErrMsg,  setDoneErrMsg]  = useState("");
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // ปิด dropdown เมื่อคลิกข้างนอก (เดิม exportRef ถูก attach ไว้เฉยๆ ไม่มี
  // listener ใช้งานจริง — ปิดได้แค่กดปุ่มซ้ำเท่านั้น)
  useClickOutside(exportRef, showExport, () => setShowExport(false));

  const [evalHistory, setEvalHistory] = useState<EvalHistoryRow[]>([]);
  useEffect(() => {
    if (!formData.vendorCode) return;
    // กันกรณี fetch รอบเก่ายังไม่ตอบกลับแล้วมาทับผลลัพธ์ของ vendor/evalId
    // ปัจจุบัน — ถ้า effect นี้ถูกยกเลิก (dep เปลี่ยนหรือ component unmount)
    // ก่อนที่ fetch จะเสร็จ ไม่ต้อง setState ทับของใหม่
    let cancelled = false;
    authFetch(`/api/evaluations/by-vendor/${encodeURIComponent(formData.vendorCode)}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (cancelled) return;
        setEvalHistory(Array.isArray(rows) ? rows.filter((r: EvalHistoryRow) => r.evalId !== result.evalId) : []);
      })
      .catch(() => { if (!cancelled) setEvalHistory([]); });
    return () => { cancelled = true; };
  }, [formData.vendorCode, result.evalId]);

  // หาว่าผลที่กำลังแสดงอยู่ตอนนี้ (main) หรือรายการใดใน Evaluation History
  // ที่ถูกส่งล่าสุดจริงๆ เพื่อแปะป้าย "(ผลประเมินล่าสุด)" ไว้จุดเดียว — เทียบ
  // แยกตาม role (USER/GCP/ฯลฯ) เพราะแต่ละ role ประเมินแยกกันเป็นอิสระ ไม่ควร
  // เอาผลของ USER ไปทับ "ล่าสุด" ของ GCP หรือกลับกัน
  const mainTime = evalDateObj.getTime();
  const mainRole = result.role ?? null;

  const latestByRole = evalHistory.reduce((acc: Record<string, { evalId: string; t: number }>, h) => {
    if (!h.role) return acc;
    const t = h.submittedAt ? new Date(h.submittedAt).getTime() : 0;
    if (!acc[h.role] || t > acc[h.role].t) acc[h.role] = { evalId: h.evalId, t };
    return acc;
  }, {});

  const isMainLatest = !!mainRole && (!latestByRole[mainRole] || mainTime >= latestByRole[mainRole].t);

  const handleBackToEval = async () => {
    if (readOnly) { onBack(); return; }
    const ok = await showConfirm("ต้องการกลับไปแก้ไขแบบประเมินใช่ไหม?", "กลับหน้าประเมิน");
    if (ok) onBackToEval();
  };

  const handleDone = async () => {
    if (doneStatus === "saving") return;
    // Lock the button BEFORE awaiting the confirm modal, not after — while
    // the modal is open doneStatus was still "idle", so a double-click (or
    // a second tab) could call handleDone again and both get past this
    // guard and the confirm dialog before either POST fires.
    setDoneStatus("saving");
    const ok = await showConfirm("บันทึกผลการประเมินและเสร็จสิ้นใช่ไหม?", "ยืนยันการบันทึก");
    if (!ok) { setDoneStatus("idle"); return; }
    setDoneErrMsg("");
    try {
      const rawScores  = result.scores  ?? {};
      const rawNotes   = result.notes   ?? {};
      const rawWeights = result.weights ?? {};

      // Build maxLv lookup from CRITERIA so backend divides by correct max
      const maxLvMap: Record<string, number> = {};
      CRITERIA.forEach(sec => sec.items.forEach(item => {
        if (!item.divider && item.no)
          maxLvMap[item.no] = item.levelValues ? Math.max(...item.levelValues) : 5;
      }));

      const mergedScores = Object.fromEntries(
        Object.keys(rawScores).map(no => {
          const rawLv   = rawScores[no];
          const maxLv   = maxLvMap[no] ?? 5;
          // Normalize to 0-5 scale so backend formula (score/5)*weight is always correct
          const normScore = rawLv != null ? (rawLv / maxLv) * 5 : rawLv;
          return [no, { score: normScore, weight: rawWeights[no], note: rawNotes[no] ?? "" }];
        })
      );
      const res = await authFetch("/api/evaluations", {
        method: "POST",
        body: JSON.stringify({
          employeeId:  formData.employeeId,
          vendorCode:  formData.vendorCode,
          evalType:    formData.evalType,
          period:      formData.period,
          productType: formData.productType,
          sessionId:   formData.sessionId,
          scores:      mergedScores,
          moduleCode:        result.moduleCode ?? null,
          customModuleItems: result.customItems ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
      }
      setDoneStatus("saved");
      setTimeout(onBack, 600);
    } catch (err) {
      console.error("Save failed:", (err as Error).message);
      setDoneErrMsg((err as Error).message || "เชื่อมต่อไม่ได้");
      setDoneStatus("error");
    }
  };

  // xlsx dynamically imported here (not at module top level) so its ~1MB
  // bundle only loads when the user actually clicks "Export Excel".
  const exportExcel = async () => {
    setShowExport(false);
    const XLSX = await import("xlsx");
    const allExportItems = CRITERIA.flatMap(s => s.items.filter(i => !i.divider));
    const rows = [
      ["Supplier Evaluation Report"],
      [],
      ["Supplier", "Vendor Code", "Eval Type", "Period", "Date", "Overall Score", "Grade"],
      [
        formData.supplierName || "",
        formData.vendorCode   || "",
        formData.evalType     || "",
        formData.period       || "",
        dateStr,
        totalScore.toFixed(1),
        grade,
      ],
      [],
      ["No.", "Criteria", "Weight(%)", "Score"],
      ...allExportItems.map(item => {
        const lv    = item.no ? scores[item.no] : undefined;
        const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
        const iw    = result.weights?.[item.no ?? ""] ?? 0;
        return [item.no, (item.title ?? "").replace(/\n/g, " "), iw, lv ? ((lv / maxLv) * iw).toFixed(1) : ""];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto-fit each column to its widest cell (capped so the long Thai
    // criteria titles don't blow the sheet out to one giant column) —
    // plain CSV has no column-width metadata, so this needs a real .xlsx.
    const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
    ws["!cols"] = Array.from({ length: colCount }, (_, ci) => {
      const widest = rows.reduce((max, r) => Math.max(max, String(r[ci] ?? "").length), 10);
      return { wch: Math.min(widest + 2, 60) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Evaluation");
    XLSX.writeFile(wb, `SupplierEval_${formData.vendorCode || "result"}_${dateStr.replace(/\//g,"-")}.xlsx`);
  };

  const printPDF = () => { setShowExport(false); window.print(); };

  const initials = (formData.supplierName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <style>{`
        /* ── screen scrollbar ── */
        .detail-scroll::-webkit-scrollbar { width: 5px; }
        .detail-scroll::-webkit-scrollbar-thumb { background: #c8d4c8; border-radius: 3px; }
        .detail-scroll::-webkit-scrollbar-track { background: transparent; }
        .export-btn:hover { background: #f0f4f0 !important; }

        /* print-only header hidden on screen */
        .print-doc-header { display: none; }

        /* ── MOBILE ── */
        /* result-main-grid / result-bottom-grid are fixed two-column grids
           (e.g. "1fr 320px") sized for desktop — below ~760px the 320px
           side column (radar chart / signature block) has no room left
           and gets clipped at the viewport edge. Stack to one column. */
        @media screen and (max-width: 760px) {
          .result-main-grid, .result-bottom-grid, .result-meter-grid { grid-template-columns: 1fr !important; }
        }

        /* ── PRINT ── */
        @media print {
          /* margin: 0 removes browser's auto date/URL/page-number headers */
          @page { size: A4 landscape; margin: 0; }

          html { zoom: 0.85; }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: #fff !important;
            font-family: Sarabun, sans-serif;
            font-size: 10pt;
            margin: 0; padding: 0;
          }

          /* hide UI chrome */
          .no-print { display: none !important; }
          * { box-shadow: none !important; }

          /* show print document header */
          .print-doc-header { display: block !important; }

          /* manual page margins (replaces the zeroed @page margin) */
          .result-outer-bg {
            background: #fff !important;
            min-height: unset !important;
            padding: 10mm 12mm !important;
            box-sizing: border-box;
          }

          /* full-width inner wrapper */
          .result-content-inner {
            max-width: 100% !important;
            padding: 0 !important;
          }

          /* expand Score Detail — remove scroll clip */
          .detail-scroll {
            max-height: none !important;
            overflow: visible !important;
          }
          .detail-scroll thead th { position: static !important; }

          /* avoid page-break inside a section group */
          .print-section-group { page-break-inside: avoid; }

          /* new page before Score Detail */
          .print-break-before { page-break-before: always; }

          /* keep grids same as screen (landscape fits) */

          /* signature: keep on same page */
          .result-signature { page-break-inside: avoid; }

          /* tighten card padding for print */
          .print-card { border: 1px solid #ccc !important; border-radius: 4px !important; }
        }
      `}</style>

      <div className="result-outer-bg" style={{ minHeight: "100vh", background: "#f4f6f4", fontFamily: "Sarabun, sans-serif" }}>
        {ModalEl}
        <div className="no-print">
          <Header
            titleOverride={`SPES — ${evalLabel} Evaluation`}
            backLabel={readOnly ? "← กลับ" : "← กลับหน้าประเมิน"}
            onBack={handleBackToEval}
            user={user ?? undefined}
            profilePic={profilePic}
          />
        </div>

        <div className="result-content-inner" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

          {/* ── Print-only document header ── */}
          <div className="print-doc-header" style={{ marginBottom: 18, paddingBottom: 12, borderBottom: "2.5px solid #1b5e20" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1b5e20", letterSpacing: 0.3 }}>
                  Supplier Performance Evaluation — {evalLabel} Evaluation
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  {formData.supplierName || "—"} &nbsp;|&nbsp; Vendor: {formData.vendorCode || "—"} &nbsp;|&nbsp;
                  Period: {formData.period || "—"} &nbsp;|&nbsp; Date: {dateStr}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#1b5e20", lineHeight: 1 }}>{totalScore.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: "#888" }}>/100</div>
                <div style={{
                  display: "inline-block", marginTop: 4,
                  background: gradeColor, color: "#fff",
                  borderRadius: 5, padding: "2px 14px",
                  fontSize: 16, fontWeight: 800,
                }}>{grade}</div>
              </div>
            </div>
          </div>

          {/* ── Top action bar ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: "#2e7d32",
                display: "inline-block",
              }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "#2e7d32" }}>สรุปผลการประเมิน</span>
            </div>
            <div ref={exportRef} style={{ position: "relative" }} className="no-print">
              <button
                onClick={() => setShowExport(v => !v)}
                style={{
                  background: "#fff", border: "1px solid #c8d4c8",
                  borderRadius: 6, padding: "7px 18px", fontSize: 13,
                  cursor: "pointer", color: "#333", display: "flex", alignItems: "center", gap: 6,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                }}
              >
                <Download size={14} /> Export ▾
              </button>
              {showExport && (
                <div style={{
                  position: "absolute", right: 0, top: "110%",
                  background: "#fff", border: "1px solid #e0e6e0", borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 99, minWidth: 170, overflow: "hidden",
                }}>
                  <button className="export-btn" onClick={exportExcel} style={{ ...dropdownItemStyle, display: "flex", alignItems: "center", gap: 8 }}>
                    <Download size={13} style={{ color: "#1558a0" }} /> Export Excel (.xlsx)
                  </button>
                  <div style={{ height: 1, background: "#f0f0f0" }} />
                  <button className="export-btn" onClick={printPDF} style={{ ...dropdownItemStyle, display: "flex", alignItems: "center", gap: 8 }}>
                    <Printer size={13} style={{ color: "#6b3fa0" }} /> Print / Save PDF
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Supplier header card — identity only, score lives in its own card below ── */}
          <div style={{
            ...card({ padding: "14px 20px", marginBottom: 12 }),
            display: "flex", alignItems: "center", gap: 16,
            borderLeft: "4px solid #1b5e20",
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: 10,
              background: "#1b5e20", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, flexShrink: 0, letterSpacing: 1,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1a202c", marginBottom: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {formData.supplierName || "—"}
                {isMainLatest && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: "#1b5e20",
                    background: "#e8f5e9", border: "1px solid #a5d6a7",
                    borderRadius: 4, padding: "2px 7px", letterSpacing: 0.2,
                  }}>
                    (ผลประเมินล่าสุด{mainRole ? ` - ${mainRole}` : ""})
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 20px", fontSize: 12, color: "#718096" }}>
                <span>Tax ID: <strong style={{ color: "#4a5568" }}>{formData.vendorCode || "—"}</strong></span>
                <span>Period: <strong style={{ color: "#4a5568" }}>{formData.period || "—"}</strong></span>
                <span>Date: <strong style={{ color: "#4a5568" }}>{dateStr}</strong></span>
                <span><strong style={{ color: "#4a5568" }}>{evalLabel}</strong> Evaluation</span>
              </div>
            </div>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right", fontSize: 11, color: "#718096" }}>
                เกรดรวม
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#2d3748" }}>{GRADE_GUIDE.find(g => g.g === grade)?.label.split(" (")[0] ?? "—"}</div>
              </div>
              <div style={{
                background: gradeColor, color: "#fff",
                width: 38, height: 38, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, flexShrink: 0,
              }}>
                {grade}
              </div>
            </div>
          </div>

          {/* ── Row 1: Overall Score + weight-split donut ── */}
          <div className="result-main-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{
              ...card({ padding: "18px 22px" }),
              background: "linear-gradient(150deg, #1b5e20, #2e7d32)", border: "none", color: "#fff",
              display: "flex", flexDirection: "column", justifyContent: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,.75)", marginBottom: 6 }}>
                Overall Score
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>{totalScore.toFixed(1)}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>/ 100</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: "rgba(255,255,255,.72)" }}>
                {GRADE_GUIDE.find(g => g.g === grade)?.label ?? ""}
              </div>
            </div>

            <div style={{ ...card({ padding: "14px 20px" }), display: "flex", alignItems: "center", gap: 20 }}>
              {weightParts.length > 0 && (
                <DonutChart parts={weightParts} total={totalWeight} size={122} />
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>
                  สัดส่วนน้ำหนัก
                </div>
                {weightParts.map(p => (
                  <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "#2d3748" }}>{p.label}</span>
                    <span style={{ fontWeight: 700, color: "#1a202c" }}>{totalWeight > 0 ? Math.round((p.weight / totalWeight) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 2: Function / ESG meters (single-value ratios — a bar chart would be the wrong form for one number) ── */}
          {(functionSummary || esgSummary) && (
            <div className="result-meter-grid" style={{
              display: "grid",
              gridTemplateColumns: functionSummary && esgSummary ? "1fr 1fr" : "1fr",
              gap: 12, marginBottom: 12,
            }}>
              {functionSummary && (
                <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 16 }}>
                  <MeterRing pct={functionSummary.max > 0 ? Math.round((functionSummary.got / functionSummary.max) * 100) : 0} color="#1558a0" size={72} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#2d3748", marginBottom: 3 }}>Function — {functionSummary.label}</div>
                    <div style={{ fontSize: 11.5, color: "#718096" }}>
                      ได้ <strong style={{ color: "#2d3748" }}>{functionSummary.got.toFixed(1)}</strong> จาก <strong style={{ color: "#2d3748" }}>{functionSummary.max.toFixed(1)}</strong>
                    </div>
                  </div>
                </div>
              )}
              {esgSummary && (
                <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 16 }}>
                  <MeterRing pct={esgSummary.max > 0 ? Math.round((esgSummary.got / esgSummary.max) * 100) : 0} color="#b56a00" size={72} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#2d3748", marginBottom: 3 }}>ESG — {esgSummary.label}</div>
                    <div style={{ fontSize: 11.5, color: "#718096" }}>
                      ได้ <strong style={{ color: "#2d3748" }}>{esgSummary.got.toFixed(1)}</strong> จาก <strong style={{ color: "#2d3748" }}>{esgSummary.max.toFixed(1)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Row 3: vertical bar chart — every non-Function/ESG section (the "many categories to compare" job) ── */}
          {coreSummaries.length > 0 && (() => {
            const coreGot = coreSummaries.reduce((s, x) => s + x.got, 0);
            const coreMax = coreSummaries.reduce((s, x) => s + x.max, 0);
            return (
              <div style={{ ...card({ marginBottom: 12, overflow: "hidden" }) }}>
                <div style={{
                  padding: "12px 18px", borderBottom: "1px solid #e0e6e0",
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase" }}>
                    Core — {coreSummaries.length} หมวด
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#2e7d32" }}>
                    {coreGot.toFixed(2)}<span style={{ fontSize: 12, fontWeight: 500, color: "#a0aec0" }}> / {coreMax.toFixed(2)}</span>
                  </span>
                </div>
                <VerticalBars items={coreSummaries} />
              </div>
            );
          })()}

          {/* ── Score Detail — full width, scrollable ── */}
          <div className="print-break-before" style={{ ...card({ marginBottom: 14, overflow: "hidden", padding: 0 }) }}>
            <div style={{
              padding: "12px 18px",
              borderBottom: "1px solid #e0e6e0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase" }}>
                Score Detail By Criteria
              </span>
              <span className="no-print" style={{ fontSize: 12, color: "#a0aec0" }}>scroll to see all ↓</span>
            </div>
            <div className="detail-scroll" style={{ overflowY: "auto", maxHeight: 360 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: "#f8faf8", borderBottom: "2px solid #e0e6e0" }}>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: 58, color: "#718096", fontWeight: 600, fontSize: 11 }}>No.</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#718096", fontWeight: 600, fontSize: 11 }}>Criteria</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: 90, color: "#718096", fontWeight: 600, fontSize: 11 }}>Weight (%)</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: 80, color: "#718096", fontWeight: 600, fontSize: 11 }}>Score</th>
                  </tr>
                </thead>
                {CRITERIA.map((sec, si) => {
                  const realItems = sec.items.filter(i => !i.divider);
                  const { got: secGot, max: secMax } = sectionSummary[si];
                  const color = SECTION_COLORS[si % SECTION_COLORS.length];
                  return (
                    <tbody key={si} className="print-section-group">
                      {/* Section header row */}
                      <tr style={{ background: "#f0f4f0", borderTop: "1px solid #d8e4d8" }}>
                        <td colSpan={3} style={{
                          padding: "7px 10px", fontWeight: 700, fontSize: 12,
                          color: color, borderLeft: `3px solid ${color}`,
                        }}>
                          {getShortLabel(sec.section)}
                        </td>
                        <td style={{
                          padding: "7px 10px", textAlign: "center",
                          fontWeight: 700, fontSize: 12, color: color,
                        }}>
                          {secGot.toFixed(2)} / {secMax.toFixed(2)}
                        </td>
                      </tr>
                      {realItems.map((item, ii) => {
                        const lv    = item.no ? scores[item.no] : undefined;
                        const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
                        const iw    = result.weights?.[item.no ?? ""] ?? 0;
                        const fmtN  = (n: number) => parseFloat(n.toFixed(2));
                        const scored = lv ? fmtN((lv / maxLv) * iw) : "—";
                        return (
                          <tr key={item.no} style={{
                            background: ii % 2 === 0 ? "#fff" : "#fafcfa",
                            borderBottom: "1px solid #f0f4f0",
                          }}>
                            <td style={{ padding: "5px 10px", textAlign: "center", color: "#a0aec0", fontSize: 11 }}>
                              {item.no}
                            </td>
                            <td style={{ padding: "5px 10px", fontSize: 11, lineHeight: 1.5, color: "#2d3748" }}>
                              {item.title}
                            </td>
                            <td style={{ padding: "5px 10px", textAlign: "center", fontSize: 11, color: "#4a5568" }}>
                              {fmtN(iw)}%
                            </td>
                            <td style={{
                              padding: "5px 10px", textAlign: "center",
                              fontWeight: lv ? 700 : 400, fontSize: 11,
                              color: lv ? color : "#cbd5e0",
                            }}>
                              {scored}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </div>

          {/* ── Grade guide + Eval history ── */}
          <div className="result-bottom-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ ...card({ padding: 0, overflow: "hidden" }) }}>
              <div style={{
                padding: "10px 16px", borderBottom: "1px solid #e0e6e0",
                fontWeight: 700, fontSize: 13, color: "#718096",
                letterSpacing: 0.8, textTransform: "uppercase",
              }}>
                Scoring Criteria
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8faf8" }}>
                    {["Grade", "Score (%)", "Status"].map(h => (
                      <th key={h} style={{
                        padding: "6px 12px", textAlign: "left", fontWeight: 600,
                        fontSize: 11, color: "#a0aec0", borderBottom: "1px solid #e0e6e0",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRADE_GUIDE.map((g, i) => (
                    <tr key={g.g} style={{
                      background: i % 2 === 0 ? "#fff" : "#fafcfa",
                      borderBottom: "1px solid #f0f4f0",
                    }}>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{
                          background: g.color, color: "#fff",
                          borderRadius: 4, padding: "2px 10px",
                          fontWeight: 800, fontSize: 13, display: "inline-block",
                        }}>{g.g}</span>
                      </td>
                      <td style={{ padding: "7px 12px", fontWeight: 600, color: "#2d3748" }}>{g.range}</td>
                      <td style={{ padding: "7px 12px", color: g.color, fontWeight: 500, fontSize: 11 }}>{g.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...card({ padding: "16px 18px" }) }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>
                Evaluation History
              </div>
              {evalHistory.length === 0 ? (
                <div style={{ fontSize: 12, color: "#a0aec0", padding: "8px 2px" }}>
                  ยังไม่มีประวัติการประเมินก่อนหน้าของซัพพลายเออร์รายนี้
                </div>
              ) : (
                <div className="no-print" style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {evalHistory.map(h => {
                    const clickable = !!onViewHistoryEval;
                    const gColor = GRADE_MAP[h.grade ?? ""] || "#a0aec0";
                    const hDate = h.submittedAt ? new Date(h.submittedAt) : null;
                    const hDateStr = hDate
                      ? `${String(hDate.getDate()).padStart(2,"0")}/${String(hDate.getMonth()+1).padStart(2,"0")}/${hDate.getFullYear()}`
                      : "—";
                    // เป็น "ล่าสุด" ของ role นี้ ก็ต่อเมื่อไม่มีทั้ง main (role
                    // เดียวกัน) และรายการอื่นใน role เดียวกันที่ใหม่กว่าอยู่
                    const isThisLatest = !!h.role
                      && latestByRole[h.role]?.evalId === h.evalId
                      && !(mainRole === h.role && isMainLatest);
                    return (
                      <div
                        key={h.evalId}
                        onClick={() => clickable && onViewHistoryEval!(h.evalId)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 8, padding: "7px 10px",
                          background: "#f8faf8", border: "1px solid #e0e6e0", borderRadius: 5,
                          cursor: clickable ? "pointer" : "default",
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#2d3748", minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{EVAL_TYPE_LABEL[h.evalType] ?? h.evalType}</span>
                          {h.period ? <span style={{ color: "#718096" }}> · {h.period}</span> : null}
                          <span style={{ color: "#a0aec0" }}> · {h.role}</span>
                          <span style={{ color: "#a0aec0" }}> · {hDateStr}</span>
                          {isThisLatest && (
                            <span style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#1b5e20",
                              background: "#e8f5e9", border: "1px solid #a5d6a7",
                              borderRadius: 4, padding: "1px 6px", letterSpacing: 0.2,
                            }}>
                              (ผลประเมินล่าสุด - {h.role})
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, color: "#4a5568" }}>{Number(h.totalScore ?? 0).toFixed(1)}</span>
                          <span style={{
                            background: gColor, color: "#fff", borderRadius: 4,
                            padding: "1px 8px", fontWeight: 800, fontSize: 12,
                          }}>{h.grade ?? "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Signature table ── */}
          <div className="result-signature" style={{ ...card({ padding: 0, overflow: "hidden", marginBottom: 20 }) }}>
            <div style={{
              padding: "11px 18px", borderBottom: "1px solid #e0e6e0",
              fontWeight: 700, fontSize: 13, color: "#2d3748", letterSpacing: 0.2,
            }}>
              ลายมือชื่อผู้เกี่ยวข้อง / Authorized Signatures
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 0,
            }}>
              {[
                { th: "ผู้ประเมิน / Evaluator" },
                { th: "หัวหน้าแผนก / Supervisor" },
              ].map((col, ci) => (
                <div key={ci} style={{
                  padding: "20px 32px 28px",
                  borderRight: ci === 0 ? "1px solid #e0e6e0" : "none",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#2d3748", marginBottom: 24 }}>
                    {col.th}
                  </div>
                  {["ลายมือชื่อ", "ชื่อ", "ตำแหน่ง", "วันที่"].map((label) => (
                    <div key={label} style={{
                      display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 18,
                    }}>
                      <span style={{ fontSize: 13, color: "#4a5568", flexShrink: 0, minWidth: 72 }}>
                        {label}:
                      </span>
                      <div style={{
                        flex: 1, borderBottom: "1.5px solid #4a5568",
                        minHeight: label === "ลายมือชื่อ" ? 44 : 22,
                      }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Done button — hidden in read-only (history view) ── */}
          {!readOnly && <div className="no-print">
            <GreenButton fullWidth onClick={handleDone} disabled={doneStatus === "saving" || doneStatus === "saved"}>
              {doneStatus === "idle"   && "ยืนยันผลการประเมินและบันทึก"}
              {doneStatus === "saving" && "กำลังบันทึก..."}
              {doneStatus === "saved"  && (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <CheckCircle2 size={16} /> บันทึกแล้ว
                </span>
              )}
              {doneStatus === "error"  && (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <XCircle size={16} /> เกิดข้อผิดพลาด — ลองอีกครั้ง
                </span>
              )}
            </GreenButton>
            {doneStatus === "error" && doneErrMsg && (
              <div style={{
                marginTop: 10, padding: "10px 14px",
                background: "#fff5f5", border: "1px solid #ffd0d0",
                borderRadius: 8, fontSize: 13, color: "#c62828",
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>สาเหตุ:</strong> {doneErrMsg}</span>
              </div>
            )}
          </div>}

        </div>
      </div>
    </>
  );
}

const dropdownItemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "10px 16px", fontSize: 13, background: "none",
  border: "none", cursor: "pointer", fontFamily: "Sarabun, sans-serif",
  color: "#2d3748",
};

// ── Sequential green ramp — magnitude (score %), not identity ──
function seqGreen(pct: number): string {
  if (pct >= 90) return "#1b5e20";
  if (pct >= 75) return "#3e9645";
  if (pct >= 60) return "#74ba79";
  if (pct >= 40) return "#a9d6ac";
  return "#d7ecd8";
}

// ── Donut chart — part-to-whole, 2-3 slices only (Core/Function/ESG) ──
function DonutChart({ parts, total, size = 122 }: { parts: { label: string; weight: number; color: string }[]; total: number; size?: number }) {
  const r = 42, stroke = 16, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {parts.map(p => {
          const frac = total > 0 ? p.weight / total : 0;
          const dash = frac * circumference;
          const el = (
            <circle key={p.label}
              cx={cx} cy={cy} r={r} fill="none"
              stroke={p.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 50 50)"
            />
          );
          acc += dash;
          return el;
        })}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1a202c", lineHeight: 1 }}>{Math.round(total)}%</div>
        <div style={{ fontSize: 9, color: "#a0aec0", marginTop: 2 }}>รวม</div>
      </div>
    </div>
  );
}

// ── Meter ring — a single ratio against a limit (Function/ESG score) ──
function MeterRing({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{
      position: "relative", width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `conic-gradient(${color} ${clamped * 3.6}deg, #e0e6e0 0deg)`,
    }}>
      <div style={{
        position: "absolute", inset: 7, borderRadius: "50%", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#1a202c" }}>{clamped}%</span>
      </div>
    </div>
  );
}

// ── Vertical bar chart — magnitude comparison across many categories ──
// X-axis is the item's position number, not its (often long, Thai) full
// name — a tooltip on hover carries the name instead, so 16+ categories
// stay legible instead of forcing rotated or truncated axis labels.
function VerticalBars({ items }: { items: { label: string; got: number; max: number }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  return (
    <div style={{ padding: "18px 20px 6px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 190, padding: "0 2px" }}>
        {items.map((item, i) => {
          const pct = item.max > 0 ? Math.min(100, (item.got / item.max) * 100) : 0;
          return (
            <div key={i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", position: "relative" }}
            >
              {hoverIdx === i && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
                  background: "#1a202c", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 6,
                  whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,.2)", pointerEvents: "none",
                }}>
                  {item.label}<br />{item.got.toFixed(2)} / {item.max.toFixed(2)} ({pct.toFixed(0)}%)
                </div>
              )}
              <div style={{ width: "100%", maxWidth: 28, height: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%", height: `${Math.max(pct, 1.5)}%`, borderRadius: "4px 4px 2px 2px",
                  background: seqGreen(pct), transition: "height .4s ease",
                }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: hoverIdx === i ? "#2e7d32" : "#a0aec0" }}>
                {i + 1}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: "1.5px solid #d8e4d8", margin: "0 2px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "12px 2px 16px", fontSize: 10.5, color: "#a0aec0" }}>
        <span>ต่ำ</span>
        {["#d7ecd8", "#a9d6ac", "#74ba79", "#3e9645", "#1b5e20"].map(c => (
          <span key={c} style={{ width: 20, height: 8, borderRadius: 3, background: c }} />
        ))}
        <span>สูง — สีเข้ม = % คะแนนสูง</span>
      </div>
    </div>
  );
}
