// ============================================================
//  pages/ResultPage.js
//  หน้าผลการประเมิน — Overall Score, Grade, Score Summary,
//  Radar Chart, Score Detail, Performance Level Guide
// ============================================================

import { useState } from "react";
import { Header, GreenButton } from "../components";
import { CRITERIA, GRADE_MAP, GRADE_GUIDE } from "../constants";

export default function ResultPage({ formData, result, onBack }) {
  const { totalScore, grade, scores = {} } = result;
  const gradeColor = GRADE_MAP[grade];
  const subtitle   = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}|${formData.job || "งาน"}`;
  const evalLabel  = formData.evalType === "post-Evaluation" ? "Post" : "Pre";

  const now     = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;

  // Score Summary per section
  const sectionSummary = CRITERIA.map((sec) => {
    const maxTotal  = sec.items.reduce((s, i) => s + i.weight, 0);
    const gotTotal  = sec.items.reduce((s, i) => {
      const lv = scores[i.no];
      return lv ? s + (lv / 5) * i.weight : s;
    }, 0);
    return { label: sec.section.split("/")[0].replace(/^\d+\./, "").trim(), got: gotTotal, max: maxTotal };
  });

  // Radar values (0..1) per section
  const radarValues = sectionSummary.map((s) => (s.max > 0 ? s.got / s.max : 0));
  const RADAR_LABELS = sectionSummary.map((s) => s.label);

  // Score detail per all items
  const allItems = CRITERIA.flatMap((s) => s.items);

  const BAR_COLORS = ["#4fc3f7","#ef5350","#ffd600","#aed581","#ba68c8"];

  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"

  const saveToDatabase = async () => {
    setSaveStatus("saving");
    try {
      await fetch("http://localhost:5000/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, ...result }),
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      <Header
        titleOverride={`Supplier Performance Evaluation - ${evalLabel} Evaluation`}
        subtitle={subtitle}
        backLabel="← กลับหน้าหลัก"
        onBack={onBack}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>

        {/* Completion banner */}
        <div style={{
          background: "#f9f9e8", border: "2px solid #ccc", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", marginBottom: 12,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1a6b1a" }}>การประเมินเสร็จสิ้น</span>
          <button style={{
            background: "#fff", border: "1.5px solid #333",
            borderRadius: 4, padding: "6px 20px", fontSize: 13, cursor: "pointer",
            fontFamily: "monospace",
          }}>
            Export Result
          </button>
        </div>

        {/* Supplier info */}
        <div style={{
          background: "#d4f5c8", border: "1.5px solid #aaa", borderRadius: 6,
          padding: "14px 18px", marginBottom: 12,
          display: "grid", gridTemplateColumns: "72px 1fr 1fr", gap: "6px 24px", alignItems: "start",
        }}>
          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: "50%", background: "#999",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, gridRow: "1 / 4",
          }}>🏢</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {formData.supplierName || "ABC Supply Co.,Ltd."}
          </div>
          <div style={{ fontSize: 13 }}>
            Evaluated By : {formData.empId || "—"} | {formData.dept || "—"}
          </div>
          <div style={{ fontSize: 13 }}>Vendor Code : {formData.vendorCode || "SP-001"}</div>
          <div style={{ fontSize: 13 }}>Evaluation Period : {dateStr} — (1 year)</div>
          <div style={{ fontSize: 13 }}>Evaluation Date : {dateStr}</div>
        </div>

        {/* Score dashboard grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "200px 1fr 200px 1fr",
          border: "1.5px solid #bbb", borderRadius: 6, overflow: "hidden", marginBottom: 12,
        }}>

          {/* Overall Score */}
          <div style={{
            background: "#f9f9e8", padding: 16, borderRight: "1px solid #ddd",
            textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Overall Score</div>
            <div style={{
              width: 90, height: 90, borderRadius: "50%",
              border: "5px solid #2e7d32", marginBottom: 10,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{totalScore.toFixed(1)}</span>
              <span style={{ fontSize: 11, color: "#888" }}>/100</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Grade</div>
            <div style={{
              background: gradeColor, color: "#fff",
              width: 52, height: 52, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: 800,
            }}>
              {grade}
            </div>
          </div>

          {/* Score Summary */}
          <div style={{ background: "#f9f9e8", padding: 16, borderRight: "1px solid #ddd" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Score Summary</div>
            {sectionSummary.map((item, i) => (
              <div key={item.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{item.label}</span>
                  <span style={{ fontWeight: 700 }}>{item.got.toFixed(1)}/{item.max}</span>
                </div>
                <div style={{ height: 7, background: "#e0e0e0", borderRadius: 4 }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    background: BAR_COLORS[i % BAR_COLORS.length],
                    width: `${item.max > 0 ? (item.got / item.max) * 100 : 0}%`,
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Radar */}
          <div style={{ background: "#f9f9e8", padding: 16, borderRight: "1px solid #ddd", textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Score Comparison</div>
            <RadarChart values={radarValues} labels={RADAR_LABELS} />
          </div>

          {/* Score Detail */}
          <div style={{ background: "#f9f9e8", padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Score Detail By Criteria</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#2e7d32", color: "#fff" }}>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>No.</th>
                  <th style={{ padding: "4px 6px" }}>Criteria</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Weight(%)</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item, i) => {
                  const lv    = scores[item.no];
                  const scored = lv ? ((lv / 5) * item.weight).toFixed(1) : "—";
                  return (
                    <tr key={item.no} style={{ background: i % 2 === 0 ? "#f5f5dc" : "#fffff0" }}>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{item.no}</td>
                      <td style={{ padding: "4px 6px", whiteSpace: "pre-line", fontSize: 10 }}>{item.title}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{item.weight}%</td>
                      <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: lv ? "#1a6b1a" : "#bbb" }}>
                        {scored}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grade guide + Eval history */}
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ border: "1.5px solid #bbb", borderRadius: 6, padding: 14, background: "#f9f9e8" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Performance Level Guide</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {GRADE_GUIDE.map((g) => (
                <div key={g.g} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{
                    background: g.color, color: "#fff",
                    width: 30, height: 30, borderRadius: 5,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 15, flexShrink: 0,
                  }}>
                    {g.g}
                  </span>
                  <span>{g.range} {g.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1.5px solid #bbb", borderRadius: 6, padding: 14, background: "#f9f9e8" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Evaluation History</div>
            <div style={{ height: 36, background: "#fff", border: "1px solid #ddd", borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 36, background: "#e8e8e8", border: "1px solid #ddd", borderRadius: 4 }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <GreenButton
            fullWidth
            onClick={saveToDatabase}
            disabled={saveStatus === "saving" || saveStatus === "saved"}
          >
            {saveStatus === "idle"   && "บันทึกผล"}
            {saveStatus === "saving" && "กำลังบันทึก..."}
            {saveStatus === "saved"  && "✅ บันทึกแล้ว"}
            {saveStatus === "error"  && "❌ ลองใหม่"}
          </GreenButton>
          <GreenButton fullWidth onClick={onBack}>Done</GreenButton>
        </div>
      </div>
    </div>
  );
}

// ---- Radar Chart (SVG) -------------------------------------
function RadarChart({ values, labels }) {
  const cx   = 85;
  const cy   = 85;
  const rMax = 60;
  const N    = values.length || 5;
  const angleFor = (i) => ((i * (360 / N)) - 90) * (Math.PI / 180);
  const pt = (i, r) => `${cx + r * Math.cos(angleFor(i))},${cy + r * Math.sin(angleFor(i))}`;

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg viewBox="0 0 170 170" width={150} height={150}>
      {/* Grid rings */}
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          points={Array.from({ length: N }, (_, i) => pt(i, lv * rMax)).join(" ")}
          fill="none" stroke="#ccc" strokeWidth={0.6}
        />
      ))}
      {/* Spokes */}
      {Array.from({ length: N }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + rMax * Math.cos(angleFor(i))} y2={cy + rMax * Math.sin(angleFor(i))}
          stroke="#ddd" strokeWidth={0.8} />
      ))}
      {/* Data polygon */}
      <polygon
        points={values.map((v, i) => pt(i, (v || 0.1) * rMax)).join(" ")}
        fill="rgba(46,125,50,0.22)" stroke="#2e7d32" strokeWidth={1.8}
      />
      {/* Labels */}
      {labels.map((lbl, i) => {
        const x = cx + (rMax + 14) * Math.cos(angleFor(i));
        const y = cy + (rMax + 14) * Math.sin(angleFor(i));
        return (
          <text key={lbl} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill="#555">
            {lbl}
          </text>
        );
      })}
    </svg>
  );
}