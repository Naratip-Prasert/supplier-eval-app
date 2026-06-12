import { useState, useRef, useEffect } from "react";
import { Header, GreenButton } from "../components";
import { CRITERIA, GRADE_MAP, GRADE_GUIDE } from "../constants";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

export default function ResultPage({ formData, result, onBack }) {
  const { totalScore, grade, scores = {}, notes = {} } = result;
  const gradeColor = GRADE_MAP[grade];
  const subtitle   = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}|${formData.job || "งาน"}`;
  const evalLabel  = formData.evalType === "post-Evaluation" ? "Post" : "Pre";

  const now     = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  const dateTag = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  const fileBase = `SPE-${(formData.supplierName || "supplier").replace(/\s+/g, "_")}-${dateTag}`;

  const sectionSummary = CRITERIA.map((sec) => {
    const maxTotal = sec.items.reduce((s, i) => s + i.weight, 0);
    const gotTotal = sec.items.reduce((s, i) => {
      const lv = scores[i.no];
      return lv ? s + (lv / 5) * i.weight : s;
    }, 0);
    return { label: sec.section.split("/")[0].replace(/^\d+\./, "").trim(), got: gotTotal, max: maxTotal };
  });

  const radarValues  = sectionSummary.map((s) => (s.max > 0 ? s.got / s.max : 0));
  const RADAR_LABELS = sectionSummary.map((s) => s.label);
  const allItems     = CRITERIA.flatMap((s) => s.items);
  const BAR_COLORS   = ["#4fc3f7","#ef5350","#ffd600","#aed581","#ba68c8"];

  const [saveStatus, setSaveStatus] = useState("idle");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting,  setExporting]  = useState(false);

  const reportRef   = useRef(null);
  const exportRef   = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportOpen]);

  // ── Export: PDF ───────────────────────────────────────────────
  const exportToPDF = async () => {
    setExportOpen(false);
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const imgData  = canvas.toDataURL("image/png");
      const pdf      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW    = pdf.internal.pageSize.getWidth();
      const pageH    = pdf.internal.pageSize.getHeight();
      const imgH     = (canvas.height * pageW) / canvas.width;
      let remaining  = imgH;
      let yOffset    = 0;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, pageW, imgH);
        remaining -= pageH;
        if (remaining > 0) { pdf.addPage(); yOffset += pageH; }
      }
      pdf.save(`${fileBase}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  // ── Export: Excel ─────────────────────────────────────────────
  const exportToExcel = () => {
    setExportOpen(false);
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary
    const summaryRows = [
      ["Supplier Performance Evaluation Report"],
      [],
      ["Field", "Value"],
      ["Supplier Name",   formData.supplierName  || ""],
      ["Vendor Code",     formData.vendorCode    || ""],
      ["Evaluated By",    formData.empId         || ""],
      ["Department",      formData.dept          || ""],
      ["Job",             formData.job           || ""],
      ["Evaluation Type", formData.evalType      || ""],
      ["Product Type",    formData.productType   || ""],
      ["Period",          formData.period        || ""],
      ["Date",            dateStr],
      [],
      ["Overall Score", +totalScore.toFixed(2)],
      ["Grade",         grade],
      [],
      ["Section", "Score", "Max Weight", "% Achieved"],
    ];
    CRITERIA.forEach((sec) => {
      const max = sec.items.reduce((s, i) => s + i.weight, 0);
      const got = sec.items.reduce((s, i) => {
        const lv = scores[i.no];
        return lv ? s + (lv / 5) * i.weight : s;
      }, 0);
      summaryRows.push([sec.section, +got.toFixed(2), max, +((got / max) * 100).toFixed(1)]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1["!cols"] = [{ wch: 20 }, { wch: 40 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    // Sheet 2 — Detail
    const detailRows = [
      ["No.", "Criteria", "Detail", "Weight(%)", "Score (1-5)", "Weighted Score", "Note"],
    ];
    CRITERIA.forEach((sec) => {
      detailRows.push([sec.section, "", "", "", "", "", ""]);
      sec.items.forEach((item) => {
        const lv = scores[item.no];
        detailRows.push([
          item.no,
          item.title.replace(/\n/g, " "),
          item.detail,
          item.weight,
          lv || "",
          lv ? +((lv / 5) * item.weight).toFixed(2) : "",
          notes[item.no] || "",
        ]);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(detailRows);
    ws2["!cols"] = [
      { wch: 8 }, { wch: 30 }, { wch: 50 },
      { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Detail");

    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  // ── Print ─────────────────────────────────────────────────────
  const printReport = () => {
    setExportOpen(false);
    const content = reportRef.current.innerHTML;
    const win = window.open("", "_blank", "width=1200,height=900");
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Supplier Evaluation — ${formData.supplierName || ""}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Sarabun, Arial, sans-serif; margin: 0; padding: 16px; background: #fff; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${content}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 800);
  };

  // ── Save to DB ────────────────────────────────────────────────
  const saveToDatabase = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("http://localhost:5000/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, ...result }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Save failed:", data);
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saved");
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    }
  };

  const menuItemStyle = {
    display: "block", width: "100%", padding: "10px 16px",
    textAlign: "left", background: "none", border: "none",
    borderBottom: "1px solid #eee", cursor: "pointer",
    fontSize: 13, fontFamily: "Sarabun, sans-serif",
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

          {/* Export dropdown */}
          <div ref={exportRef} style={{ position: "relative" }}>
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={exporting}
              style={{
                background: "#fff", border: "1.5px solid #333",
                borderRadius: 4, padding: "6px 20px", fontSize: 13,
                cursor: exporting ? "wait" : "pointer", fontFamily: "monospace",
              }}
            >
              {exporting ? "กำลัง Export..." : "Export Result ▾"}
            </button>
            {exportOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
                background: "#fff", border: "1.5px solid #ccc", borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: 190,
              }}>
                <button onClick={exportToPDF}   style={menuItemStyle}>📄 Export as PDF</button>
                <button onClick={exportToExcel} style={menuItemStyle}>📊 Export as Excel</button>
                <button onClick={printReport}   style={{ ...menuItemStyle, borderBottom: "none" }}>🖨️ Print</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Report content (captured for PDF/Print) ── */}
        <div ref={reportRef}>

          {/* Supplier info */}
          <div style={{
            background: "#d4f5c8", border: "1.5px solid #aaa", borderRadius: 6,
            padding: "14px 18px", marginBottom: 12,
            display: "grid", gridTemplateColumns: "72px 1fr 1fr", gap: "6px 24px", alignItems: "start",
          }}>
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
                    const lv     = scores[item.no];
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

        </div>
        {/* ── End report content ── */}

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
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          points={Array.from({ length: N }, (_, i) => pt(i, lv * rMax)).join(" ")}
          fill="none" stroke="#ccc" strokeWidth={0.6}
        />
      ))}
      {Array.from({ length: N }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + rMax * Math.cos(angleFor(i))} y2={cy + rMax * Math.sin(angleFor(i))}
          stroke="#ddd" strokeWidth={0.8} />
      ))}
      <polygon
        points={values.map((v, i) => pt(i, (v || 0.1) * rMax)).join(" ")}
        fill="rgba(46,125,50,0.22)" stroke="#2e7d32" strokeWidth={1.8}
      />
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
