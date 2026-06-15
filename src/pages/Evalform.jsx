// ============================================================
//  pages/Evalform.jsx
//  - Loads criteria from API (Req 9: includes default weights)
//  - Weights are editable per criterion (Req 9)
//  - Alert if any score is missing before submit (Req 5)
//  - Score format sent to Resultpage: { "1.1": {score, weight, note}, ... }
// ============================================================

import { useState, useEffect } from "react";
import { Header, GreenButton } from "../components";
import { CRITERIA, LEVEL_COLORS, GRADE_MAP, getGrade } from "../constants";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Parse numeric weight from a string like "น้ำหนักรวม 40%"
const parseCatWeight = (w) => {
  const m = String(w).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
};

// Convert API response format to internal format (same shape as CRITERIA constant)
function apiToSections(data) {
  return data.map((cat) => ({
    code:        cat.code,                          // e.g. "CAT1"
    section:     cat.nameTh,
    totalWeight: cat.totalWeight,                   // number baseline
    weight: `น้ำหนักรวม ${cat.totalWeight}%`,
    items: cat.items.map((item) => ({
      no:      item.code,
      weight:  item.defaultWeight,
      title:   item.nameTh,
      detail:  item.detailTh || "",
      levels:  item.levels || [],
    })),
  }));
}

export default function EvalForm({ formData, onBack, onDone }) {
  const [sections,        setSections]        = useState(null);  // array of section objects
  const [weights,         setWeights]         = useState({});    // { "1.1": 14, ... } — editable sub-item weights
  const [categoryWeights, setCategoryWeights] = useState({});    // { 0: 40, 1: 30, ... } — editable category weights
  const [scores,          setScores]          = useState({});    // { "1.1": 4, ... }
  const [notes,           setNotes]           = useState({});    // { "1.1": "comment", ... }
  const [loading,         setLoading]         = useState(true);
  const [missingItems,    setMissingItems]    = useState([]);    // items not yet scored
  const [showAlert,       setShowAlert]       = useState(false);

  // Load criteria from API; fallback to CRITERIA constant
  useEffect(() => {
    fetch(`${API_URL}/api/criteria`)
      .then((r) => r.json())
      .then((data) => {
        const secs = apiToSections(data);
        setSections(secs);
        const initW = {};
        const initC = {};
        secs.forEach((s, i) => {
          s.items.forEach((item) => { initW[item.no] = item.weight; });
          initC[i] = s.totalWeight ?? parseCatWeight(s.weight);
        });
        setWeights(initW);
        setCategoryWeights(initC);
      })
      .catch(() => {
        setSections(CRITERIA);
        const initW = {};
        const initC = {};
        CRITERIA.forEach((s, i) => {
          s.items.forEach((item) => { initW[item.no] = item.weight; });
          initC[i] = parseCatWeight(s.weight);
        });
        setWeights(initW);
        setCategoryWeights(initC);
      })
      .finally(() => setLoading(false));
  }, []);

  // Live score calculation using mutable weights
  const activeSections = sections || CRITERIA;
  const allItems = activeSections.flatMap((s) => s.items);
  const totalWeight = allItems.reduce((sum, i) => sum + parseFloat(weights[i.no] || i.weight || 0), 0);
  const rawScore    = allItems.reduce((sum, item) => {
    const s = scores[item.no];
    const w = parseFloat(weights[item.no] || item.weight || 0);
    return s ? sum + (s / 5) * w : sum;
  }, 0);
  const totalScore  = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
  const grade       = getGrade(totalScore);
  const gradeColor  = GRADE_MAP[grade];

  const subtitle  = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}|${formData.job || "งาน"}`;
  const evalLabel = formData.evalType === "re_evaluation" ? "Post" : "Pre";

  const handleSubmit = () => {
    const missing = allItems.filter((item) => !scores[item.no]);
    if (missing.length > 0) {
      setMissingItems(missing);
      setShowAlert(true);
      return;
    }

    const combinedScores = {};
    allItems.forEach((item) => {
      combinedScores[item.no] = {
        score:  scores[item.no] || null,
        weight: parseFloat(weights[item.no] || item.weight || 0),
        note:   notes[item.no]  || "",
      };
    });

    // Build category weights array for the API (evaluation_category_weights table)
    const catWeightsPayload = activeSections.map((s, i) => ({
      categoryCode: s.code || `CAT${i + 1}`,
      weight: parseFloat(categoryWeights[i] ?? parseCatWeight(s.weight)),
    }));

    onDone({ scores: combinedScores, totalScore, grade, categoryWeights: catWeightsPayload });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Sarabun, sans-serif" }}>
        <div style={{ fontSize: 16, color: "#666" }}>กำลังโหลดแบบประเมิน...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>

      {/* Missing-score alert modal */}
      {showAlert && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: 18,
            maxWidth: 480, width: "92%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, #bf360c, #e64a19)",
              padding: "28px 28px 22px", textAlign: "center",
            }}>
              <div style={{
                width: 68, height: 68, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                border: "2px solid rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 14px", fontSize: 34,
              }}>⚠️</div>
              <div style={{ color: "#fff", fontSize: 19, fontWeight: 700 }}>
                กรุณากรอกคะแนนให้ครบทุกข้อ
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 5 }}>
                ยังไม่ได้กรอกคะแนน{" "}
                <b style={{ fontSize: 16 }}>{missingItems.length}</b> ข้อ
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 28px 26px" }}>
              <div style={{
                background: "#fff8f5", border: "1.5px solid #ffccbc",
                borderRadius: 12, padding: "14px 18px", marginBottom: 22,
                maxHeight: 260, overflowY: "auto",
              }}>
                {missingItems.map((item, i) => (
                  <div key={item.no} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    marginBottom: i < missingItems.length - 1 ? 12 : 0,
                  }}>
                    <span style={{
                      flexShrink: 0,
                      background: "#e64a19", color: "#fff",
                      borderRadius: 6, padding: "2px 8px",
                      fontSize: 12, fontWeight: 700, fontFamily: "monospace",
                      marginTop: 1,
                    }}>{item.no}</span>
                    <span style={{ fontSize: 13, color: "#4e342e", lineHeight: 1.5 }}>
                      {item.title.replace(/\n/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowAlert(false)}
                style={{
                  width: "100%", padding: "13px",
                  background: "linear-gradient(135deg, #bf360c, #e64a19)",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "Sarabun, sans-serif",
                  boxShadow: "0 4px 14px rgba(230,74,25,0.4)",
                }}
              >
                ตกลง — กลับไปกรอกคะแนน
              </button>
            </div>
          </div>
        </div>
      )}

      <Header
        titleOverride={`Supplier Performance Evaluation — ${evalLabel} Evaluation`}
        subtitle={subtitle}
        backLabel="← กลับหน้าหลัก"
        onBack={onBack}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>

        <InfoBar formData={formData} evalLabel={evalLabel} />

        <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontFamily: "monospace" }}>
          เกณฑ์การให้คะแนน : ระดับ 1 = ต้องปรับปรุง | 2 = ต่ำกว่าเกณฑ์ | 3 = พอใช้ | 4 = ดี | 5 = ดีมาก
          <span style={{ color: "#1565c0", marginLeft: 12 }}>
            ★ น้ำหนักหมวดหมู่ (แถบสีเขียว) และน้ำหนักหัวข้อย่อย (%) สามารถแก้ไขได้ตามที่ผู้ประเมินตกลงกัน
          </span>
        </div>

        {/* Evaluation table */}
        <div style={{ border: "1.5px solid #999", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
          <TableHeader />
          {activeSections.map((section, si) => (
            <div key={si}>
              <div style={{
                background: "#1a6b1a", color: "#fff",
                padding: "8px 14px", fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <span>{section.section}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                    น้ำหนักหมวด:
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={categoryWeights[si] ?? parseCatWeight(section.weight)}
                    onChange={(e) =>
                      setCategoryWeights((cw) => ({
                        ...cw,
                        [si]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    title="ปรับน้ำหนักหมวดหมู่หลัก (%)"
                    style={{
                      width: 58, textAlign: "center", fontSize: 14, fontWeight: 800,
                      border: "2px solid rgba(255,255,255,0.55)",
                      borderRadius: 6, padding: "3px 4px", outline: "none",
                      background: "rgba(255,255,255,0.15)", color: "#fff",
                      fontFamily: "monospace",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.95)")}
                    onBlur={(e)  => (e.target.style.borderColor = "rgba(255,255,255,0.55)")}
                  />
                  <span style={{ fontSize: 12, opacity: 0.85 }}>%</span>
                </div>
              </div>
              {section.items.map((item, ii) => (
                <ScoreRow
                  key={item.no}
                  item={item}
                  weight={weights[item.no] ?? item.weight}
                  selected={scores[item.no]}
                  note={notes[item.no] || ""}
                  onWeightChange={(v) => setWeights((w) => ({ ...w, [item.no]: v }))}
                  onSelect={(lv) => setScores((s) => ({ ...s, [item.no]: lv }))}
                  onNote={(v)  => setNotes((n)  => ({ ...n, [item.no]: v }))}
                  shaded={ii % 2 !== 0}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Live score */}
        <div style={{
          display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end",
          marginBottom: 16, padding: "10px 20px",
          background: "#f1f8e9", border: "1.5px solid #a5d6a7", borderRadius: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>คะแนนรวมปัจจุบัน:</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#1a6b1a" }}>{totalScore.toFixed(1)}</span>
          <span style={{ fontSize: 14, color: "#666" }}>/100</span>
          <span style={{
            background: gradeColor, color: "#fff", borderRadius: 6,
            padding: "5px 18px", fontSize: 18, fontWeight: 800,
          }}>
            {grade}
          </span>
        </div>

        <GreenButton fullWidth onClick={handleSubmit}>
          Submit Supplier Evaluation
        </GreenButton>
      </div>
    </div>
  );
}

// ---- Sub-components -----------------------------------------

function InfoBar({ formData, evalLabel }) {
  const now    = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  const refNo  = `SPE-${evalLabel.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}-AUTO`;

  return (
    <div style={{
      background: "#f9f9e8", border: "2px solid #ccc", borderRadius: 6,
      padding: "12px 16px", marginBottom: 10,
    }}>
      <div style={{
        background: "#fffde7", border: "1.5px solid #f9a825",
        borderRadius: 6, padding: "6px 12px", marginBottom: 10,
        textAlign: "center", fontWeight: 700, fontSize: 13,
      }}>
        บริษัทในกลุ่ม : Consumer/Packaging/Retail/Manufacturer — รอบการประเมิน{" "}
        {formData.period || "รายปี/ครึ่งปี"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 24px", fontSize: 13 }}>
        <div><b>ชื่อผู้ขาย/ผู้ให้บริการ:</b> <span style={{ color: "#888" }}>{formData.supplierName || "—"}</span></div>
        <div><b>รหัสผู้ขาย (Vendor code):</b> <span style={{ color: "#888" }}>{formData.vendorCode || "—"}</span></div>
        <div><b>เลขที่อ้างอิง:</b> <span style={{ color: "#888" }}>{refNo}</span></div>
        <div><b>หน่วยงาน/ชื่องาน:</b> {formData.dept || "—"}/{formData.job || "—"}</div>
        <div><b>ผู้ประเมิน/รหัสพนักงาน:</b> {formData.empId || "—"}</div>
        <div><b>รอบการประเมิน:</b> {formData.period || "—"}</div>
      </div>
    </div>
  );
}

function TableHeader() {
  const cols = "50px 1fr 2fr 80px 1fr 1fr 1fr 1fr 1fr 80px 110px";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: cols,
      background: "#2e7d32", color: "#fff",
      fontSize: 12, fontWeight: 700,
      padding: "8px 6px", gap: 4, textAlign: "center",
    }}>
      <div>ลำดับ</div>
      <div>หัวข้อการประเมิน</div>
      <div>รายละเอียด/เกณฑ์</div>
      <div>น้ำหนัก(%)</div>
      <div>1</div><div>2</div><div>3</div><div>4</div><div>5</div>
      <div>คะแนนที่ได้</div>
      <div>หมายเหตุ</div>
    </div>
  );
}

function ScoreRow({ item, weight, selected, note, onWeightChange, onSelect, onNote, shaded }) {
  const cols     = "50px 1fr 2fr 80px 1fr 1fr 1fr 1fr 1fr 80px 110px";
  const rowScore = selected ? ((selected / 5) * parseFloat(weight || 0)).toFixed(2) : "—";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: cols,
      borderTop: "1px solid #ddd", gap: 4, alignItems: "start",
      background: shaded ? "#f9f9f9" : "#fff",
    }}>
      <div style={{ padding: "8px 4px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>
        {item.no}
      </div>
      <div style={{ padding: "8px 4px", fontSize: 11, lineHeight: 1.45, whiteSpace: "pre-line" }}>
        {item.title}
      </div>
      <div style={{ padding: "8px 4px", fontSize: 10, color: "#555", lineHeight: 1.4 }}>
        {item.detail}
      </div>

      {/* Editable weight input (Req 9) */}
      <div style={{ padding: "6px 4px", textAlign: "center" }}>
        <input
          type="number"
          min="0"
          max="100"
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
          style={{
            width: 54, textAlign: "center", fontSize: 12,
            border: "1.5px solid #1565c0", borderRadius: 4,
            padding: "3px 4px", outline: "none",
          }}
        />
        <div style={{ fontSize: 9, color: "#888", marginTop: 1 }}>%</div>
      </div>

      {/* Level buttons 1-5 */}
      {[1, 2, 3, 4, 5].map((lv) => (
        <div
          key={lv}
          onClick={() => onSelect(lv)}
          title={item.levels[lv - 1] || `ระดับ ${lv}`}
          style={{
            padding: "5px 2px", cursor: "pointer", textAlign: "center",
            background: selected === lv ? LEVEL_COLORS[lv - 1] : "transparent",
            border: `2px solid ${selected === lv ? LEVEL_COLORS[lv - 1] : "transparent"}`,
            borderRadius: 4, margin: 2, transition: "all 0.12s",
          }}
        >
          <div style={{ fontSize: 9, lineHeight: 1.2, color: selected === lv ? "#000" : "#aaa" }}>
            {(item.levels[lv - 1] || `ระดับ ${lv}`).substring(0, 22)}…
          </div>
        </div>
      ))}

      <div style={{
        padding: "8px 4px", textAlign: "center", fontSize: 13,
        fontWeight: 700, color: selected ? "#1a6b1a" : "#bbb",
      }}>
        {rowScore}
      </div>

      <div style={{ padding: 4 }}>
        <input
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="หมายเหตุ"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 11,
            border: "1px solid #ccc", borderRadius: 4,
            padding: "4px 6px", outline: "none",
          }}
        />
      </div>
    </div>
  );
}
