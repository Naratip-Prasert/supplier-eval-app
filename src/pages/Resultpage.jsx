// ============================================================
//  pages/ResultPage.jsx
// ============================================================

import { useState, useRef, Fragment } from "react";
import { Header, GreenButton, useModal } from "../components";
import { PRE_CRITERIA, POST_CRITERIA, GRADE_MAP, GRADE_GUIDE } from "../constants";
import { authFetch } from "../utils/api";
import { Download, Printer, CheckCircle2, XCircle } from "lucide-react";

function getShortLabel(section) {
  const numMatch   = section.match(/^(\d+)\./);
  const num        = numMatch ? numMatch[1] + ". " : "";
  const parenMatch = section.match(/\(([A-Z]{2,10})\)/);
  if (parenMatch) return num + parenMatch[1];
  const clean = section.replace(/^\d+\.\s*/, "").split("/")[0].trim();
  return num + (clean.length > 16 ? clean.slice(0, 14) + "…" : clean);
}

// Professional muted palette — no rainbow
const SECTION_COLORS = ["#1e6b3a", "#1558a0", "#6b3fa0", "#a02020", "#b56a00", "#00787a"];

// Shared card style
const card = (extra = {}) => ({
  background: "#fff",
  border: "1px solid #e0e6e0",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  ...extra,
});

export default function ResultPage({ formData, result, user, profilePic, onBack, onBackToEval, readOnly = false }) {
  const { showConfirm, ModalEl } = useModal();
  const { totalScore, grade, scores = {} } = result;
  const gradeColor = GRADE_MAP[grade];
  const subtitle   = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}`;
  const evalLabel  = formData.evalType === "post_eval" ? "Post" : "Pre";
  const CRITERIA   = formData.evalType === "post_eval" ? POST_CRITERIA : PRE_CRITERIA;

  const now     = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;

  const sectionSummary = CRITERIA.map((sec, si) => {
    const realItems = sec.items.filter(i => !i.divider);
    const max = result.sectionWeights?.[si] ?? sec.weight ?? 0;
    const got = realItems.reduce((s, item) => {
      const lv = scores[item.no];
      if (!lv) return s;
      const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
      return s + (lv / maxLv) * (result.weights?.[item.no] ?? 0);
    }, 0);
    return { label: getShortLabel(sec.section), got, max };
  });

  const radarValues  = result.radarOverride ?? sectionSummary.map(s => s.max > 0 ? s.got / s.max : 0);
  const RADAR_LABELS = sectionSummary.map(s => s.label);

  const [doneStatus,  setDoneStatus]  = useState("idle");
  const [doneErrMsg,  setDoneErrMsg]  = useState("");
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef(null);

  const handleBackToEval = async () => {
    if (readOnly) { onBack(); return; }
    const ok = await showConfirm("ต้องการกลับไปแก้ไขแบบประเมินใช่ไหม?", "กลับหน้าประเมิน");
    if (ok) onBackToEval();
  };

  const handleDone = async () => {
    if (doneStatus === "saving") return;
    const ok = await showConfirm("บันทึกผลการประเมินและเสร็จสิ้นใช่ไหม?", "ยืนยันการบันทึก");
    if (!ok) return;
    setDoneStatus("saving");
    setDoneErrMsg("");
    try {
      const rawScores  = result.scores  ?? {};
      const rawNotes   = result.notes   ?? {};
      const rawWeights = result.weights ?? {};

      // Build maxLv lookup from CRITERIA so backend divides by correct max
      const maxLvMap = {};
      CRITERIA.forEach(sec => sec.items.forEach(item => {
        if (!item.divider)
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
          scores:      mergedScores,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
      }
      setDoneStatus("saved");
      setTimeout(onBack, 600);
    } catch (err) {
      console.error("Save failed:", err.message);
      setDoneErrMsg(err.message || "เชื่อมต่อไม่ได้");
      setDoneStatus("error");
    }
  };

  const exportExcel = () => {
    setShowExport(false);
    const allExportItems = CRITERIA.flatMap(s => s.items.filter(i => !i.divider));
    const rows = [
      ["Supplier Evaluation Report"],
      [],
      ["Supplier",     formData.supplierName || ""],
      ["Vendor Code",  formData.vendorCode   || ""],
      ["Evaluated By", formData.empId        || ""],
      ["Dept",         formData.dept         || ""],
      ["Eval Type",    formData.evalType     || ""],
      ["Period",       formData.period       || ""],
      ["Date",         dateStr],
      ["Overall Score", totalScore.toFixed(1)],
      ["Grade", grade],
      [],
      ["No.", "Criteria", "Weight(%)", "Score"],
      ...allExportItems.map(item => {
        const lv    = scores[item.no];
        const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
        const iw    = result.weights?.[item.no] ?? 0;
        return [item.no, item.title.replace(/\n/g, " "), iw, lv ? ((lv / maxLv) * iw).toFixed(1) : ""];
      }),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `SupplierEval_${formData.vendorCode || "result"}_${dateStr.replace(/\//g,"-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            titleOverride={`Supplier Performance Evaluation — ${evalLabel} Evaluation`}
            subtitle={subtitle}
            backLabel={readOnly ? "← กลับ" : "← กลับหน้าประเมิน"}
            onBack={handleBackToEval}
            user={user}
            profilePic={profilePic}
          />
        </div>

        <div className="result-content-inner" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

          {/* ── Print-only document header ── */}
          <div className="print-doc-header" style={{ marginBottom: 18, paddingBottom: 12, borderBottom: "2.5px solid #1a6b1a" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1a6b1a", letterSpacing: 0.3 }}>
                  Supplier Performance Evaluation — {evalLabel} Evaluation
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  {formData.supplierName || "—"} &nbsp;|&nbsp; Vendor: {formData.vendorCode || "—"} &nbsp;|&nbsp;
                  Dept: {formData.dept || "—"} &nbsp;|&nbsp; Period: {formData.period || "—"} &nbsp;|&nbsp; Date: {dateStr}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#1a6b1a", lineHeight: 1 }}>{totalScore.toFixed(1)}</div>
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
                    <Download size={13} style={{ color: "#1558a0" }} /> Export Excel (CSV)
                  </button>
                  <div style={{ height: 1, background: "#f0f0f0" }} />
                  <button className="export-btn" onClick={printPDF} style={{ ...dropdownItemStyle, display: "flex", alignItems: "center", gap: 8 }}>
                    <Printer size={13} style={{ color: "#6b3fa0" }} /> Print / Save PDF
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Supplier header card ── */}
          <div style={{
            ...card({ padding: "16px 20px", marginBottom: 16 }),
            display: "flex", alignItems: "center", gap: 18,
            borderLeft: "4px solid #1a6b1a",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 10,
              background: "#1a6b1a", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, flexShrink: 0, letterSpacing: 1,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1a202c", marginBottom: 3 }}>
                {formData.supplierName || "—"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 20px", fontSize: 12, color: "#718096" }}>
                <span>Tax ID: <strong style={{ color: "#4a5568" }}>{formData.vendorCode || "—"}</strong></span>
                <span>Evaluated by: <strong style={{ color: "#4a5568" }}>{formData.empId || "—"}</strong></span>
                <span>Dept: <strong style={{ color: "#4a5568" }}>{formData.dept || "—"}</strong></span>
                <span>Period: <strong style={{ color: "#4a5568" }}>{formData.period || "—"}</strong></span>
                <span>Date: <strong style={{ color: "#4a5568" }}>{dateStr}</strong></span>
              </div>
            </div>
            <div style={{
              flexShrink: 0, textAlign: "center",
              background: "#f8fdf8", borderRadius: 8,
              padding: "10px 20px", border: "1px solid #c8e6c9",
            }}>
              <div style={{ fontSize: 11, color: "#718096", marginBottom: 4, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
                {evalLabel} Evaluation
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1a6b1a", lineHeight: 1 }}>
                {totalScore.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 6 }}>/100</div>
              <div style={{
                background: gradeColor, color: "#fff",
                width: 36, height: 36, borderRadius: 6, margin: "0 auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800,
              }}>
                {grade}
              </div>
            </div>
          </div>

          {/* ── Main grid: Score Summary | Radar ── */}
          <div className="result-main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, marginBottom: 14 }}>

            {/* Score Summary */}
            <div style={{ ...card({ padding: "18px 22px" }) }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 16 }}>
                Score Summary
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {sectionSummary.map((item, i) => {
                  const pct = item.max > 0 ? Math.min(100, (item.got / item.max) * 100) : 0;
                  const color = SECTION_COLORS[i % SECTION_COLORS.length];
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: 5,
                          background: color, color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 13, color: "#2d3748", flex: 1, fontWeight: 500 }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: color, flexShrink: 0 }}>
                          {item.got.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 12, color: "#a0aec0", flexShrink: 0 }}>
                          / {item.max}
                        </span>
                      </div>
                      <div style={{ height: 6, background: "#edf2ed", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 999,
                          background: color, width: `${pct}%`,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Score Comparison — bigger radar */}
            <div style={{ ...card({ padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center" }) }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#718096", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
                Score Comparison
              </div>
              <RadarChart values={radarValues} labels={RADAR_LABELS} size={260} />
            </div>
          </div>

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
                          {secGot.toFixed(1)} / {secMax}
                        </td>
                      </tr>
                      {realItems.map((item, ii) => {
                        const lv    = scores[item.no];
                        const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
                        const iw    = result.weights?.[item.no] ?? 0;
                        const fmtN  = (n) => parseFloat(n.toFixed(2));
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
              <div style={{ height: 36, background: "#f8faf8", border: "1px solid #e0e6e0", borderRadius: 5, marginBottom: 8 }} />
              <div style={{ height: 36, background: "#f0f4f0", border: "1px solid #e0e6e0", borderRadius: 5 }} />
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

const dropdownItemStyle = {
  display: "block", width: "100%", textAlign: "left",
  padding: "10px 16px", fontSize: 13, background: "none",
  border: "none", cursor: "pointer", fontFamily: "Sarabun, sans-serif",
  color: "#2d3748",
};

// ── Radar Chart ───────────────────────────────────────────────
function RadarChart({ values, labels, size = 260 }) {
  const cx  = size / 2;
  const cy  = size / 2;
  const rMax = size * 0.34;
  const N   = values.length || 5;
  const angleFor = (i) => ((i * (360 / N)) - 90) * (Math.PI / 180);
  const pt  = (i, r) => `${cx + r * Math.cos(angleFor(i))},${cy + r * Math.sin(angleFor(i))}`;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Grid polygons */}
      {gridLevels.map(lv => (
        <polygon key={lv}
          points={Array.from({ length: N }, (_, i) => pt(i, lv * rMax)).join(" ")}
          fill={lv === 1.0 ? "rgba(46,125,50,0.03)" : "none"}
          stroke={lv === 1.0 ? "#c8d4c8" : "#e0e8e0"}
          strokeWidth={lv === 1.0 ? 1.2 : 0.8}
        />
      ))}
      {/* Axis lines */}
      {Array.from({ length: N }, (_, i) => (
        <line key={i}
          x1={cx} y1={cy}
          x2={cx + rMax * Math.cos(angleFor(i))}
          y2={cy + rMax * Math.sin(angleFor(i))}
          stroke="#dce8dc" strokeWidth={0.8}
        />
      ))}
      {/* Data area */}
      <polygon
        points={values.map((v, i) => pt(i, Math.max(0.05, v) * rMax)).join(" ")}
        fill="rgba(30,107,58,0.15)" stroke="#1e6b3a" strokeWidth={2}
      />
      {/* Data points */}
      {values.map((v, i) => {
        const r = Math.max(0.05, v) * rMax;
        return (
          <circle key={i}
            cx={cx + r * Math.cos(angleFor(i))}
            cy={cy + r * Math.sin(angleFor(i))}
            r={3.5} fill="#1e6b3a"
          />
        );
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const lx = cx + (rMax + 18) * Math.cos(angleFor(i));
        const ly = cy + (rMax + 18) * Math.sin(angleFor(i));
        return (
          <text key={i} x={lx} y={ly}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9.5} fill="#4a5568" fontFamily="Sarabun, sans-serif" fontWeight="600">
            {lbl}
          </text>
        );
      })}
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#c8d4c8" />
    </svg>
  );
}
