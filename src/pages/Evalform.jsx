// ============================================================
//  pages/EvalForm.js
//  หน้าแบบประเมิน — ตารางคลิกเลือก 1-5 ต่อแต่ละข้อ
//  คะแนนรวม real-time ด้านล่าง
// ============================================================

import { useState } from "react";
import { Header, GreenButton, useModal } from "../components";
import { CRITERIA, LEVEL_COLORS, GRADE_MAP, getGrade } from "../constants";

export default function EvalForm({ formData, onBack, onDone }) {
  const { showAlert, showConfirm, ModalEl } = useModal();
  const [scores, setScores] = useState({}); // { "1.1": 4, "1.2": 3, ... }
  const [notes,  setNotes]  = useState({}); // { "1.1": "หมายเหตุ", ... }

  // คำนวณคะแนนรวม
  const allItems   = CRITERIA.flatMap((s) => s.items);
  const totalWeight = allItems.reduce((sum, i) => sum + i.weight, 0);
  const rawScore   = allItems.reduce((sum, item) => {
    const s = scores[item.no];
    return s ? sum + (s / 5) * item.weight : sum;
  }, 0);
  const totalScore = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
  const grade      = getGrade(totalScore);
  const gradeColor = GRADE_MAP[grade];

  const subtitle = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}|${formData.job || "งาน"}`;
  const evalLabel = formData.evalType === "post-Evaluation" ? "Post" : "Pre";

  const handleBack = async () => {
    const ok = await showConfirm("ต้องการกลับหน้าหลักใช่ไหม?\nข้อมูลที่กรอกไว้ทั้งหมดจะหายไป", "กลับหน้าหลัก");
    if (ok) onBack();
  };

  const handleSubmit = async () => {
    const unanswered = allItems.filter((item) => !scores[item.no]).map((item) => item.no);
    if (unanswered.length > 0) {
      await showAlert(`ยังมีหัวข้อที่ยังไม่ได้ให้คะแนน:\n• ${unanswered.join("\n• ")}`, "ประเมินไม่ครบ");
      return;
    }
    onDone({ scores, notes, totalScore, grade });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      {ModalEl}
      <Header
        titleOverride={`Supplier Performance Evaluation - ${evalLabel} Evaluation`}
        subtitle={subtitle}
        backLabel="← กลับหน้าหลัก"
        onBack={handleBack}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>

        {/* Info header */}
        <InfoBar formData={formData} evalLabel={evalLabel} />

        {/* Scoring guide */}
        <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontFamily: "monospace" }}>
          เกณฑ์การให้คะแนน : ระดับ 1 = ต้องปรับปรุง | ระดับ 2 = ต่ำกว่าเกณฑ์ | ระดับ 3 = พอใช้ | ระดับ 4 = ดี | ระดับ 5 = ดีมาก
        </div>

        {/* Evaluation table */}
        <div style={{ border: "1.5px solid #999", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
          <TableHeader />
          {CRITERIA.map((section, si) => (
            <div key={si}>
              {/* Section header */}
              <div style={{
                background: "#1a6b1a", color: "#fff",
                padding: "8px 12px", fontSize: 13, fontWeight: 700,
                fontFamily: "monospace",
              }}>
                {section.section} — {section.weight}
              </div>

              {/* Rows */}
              {section.items.map((item, ii) => (
                <ScoreRow
                  key={item.no}
                  item={item}
                  selected={scores[item.no]}
                  note={notes[item.no] || ""}
                  onSelect={(lv) => setScores((s) => ({ ...s, [item.no]: lv }))}
                  onNote={(v)  => setNotes((n)  => ({ ...n, [item.no]: v }))}
                  shaded={ii % 2 !== 0}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Live score bar */}
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

// ---- Sub-components (เฉพาะหน้านี้) -------------------------

function InfoBar({ formData, evalLabel }) {
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  const refNo = `SPE-${evalLabel.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}-AUTO`;

  return (
    <div style={{
      background: "#f9f9e8", border: "2px solid #ccc", borderRadius: 6,
      padding: "12px 16px", marginBottom: 10,
    }}>
      {/* Top section label */}
      <div style={{
        background: "#fffde7", border: "1.5px solid #f9a825",
        borderRadius: 6, padding: "6px 12px", marginBottom: 10,
        textAlign: "center", fontWeight: 700, fontSize: 13,
      }}>
        บริษัทในกลุ่ม : Consumer/Packaging/Retail/Manufacturer — รอบการประเมิน{" "}
        {formData.period || "รายปี/ครึ่งปี"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 24px", fontSize: 13 }}>
        <div><b>ชื่อผู้ขาย/ผู้ให้บริการ:</b>{" "}
          <span style={{ color: "#888" }}>{formData.supplierName || "กรอกชื่อบริษัท/ผู้ให้บริการ"}</span>
        </div>
        <div><b>รหัสผู้ขาย (Vendor code):</b>{" "}
          <span style={{ color: "#888" }}>{formData.vendorCode || "ex. SUP-001"}</span>
        </div>
        <div><b>เลขที่อ้างอิง:</b>{" "}
          <span style={{ color: "#888" }}>{refNo}</span>{" "}
          <span style={{
            background: "#2e7d32", color: "#fff", fontSize: 10,
            borderRadius: 4, padding: "1px 6px", marginLeft: 4,
          }}>Auto</span>
        </div>
        <div><b>หน่วยงาน/ชื่องาน:</b> {formData.dept || "—"}/{formData.job || "—"}</div>
        <div><b>ชื่อผู้ประเมิน/รหัสพนักงาน:</b> {formData.empId || "—"}</div>
        <div><b>รอบการประเมิน:</b> {formData.period || "—"}</div>
      </div>
    </div>
  );
}

function TableHeader() {
  const cols = "50px 1fr 2fr 65px 1fr 1fr 1fr 1fr 1fr 80px 110px";
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

function ScoreRow({ item, selected, note, onSelect, onNote, shaded }) {
  const cols = "50px 1fr 2fr 65px 1fr 1fr 1fr 1fr 1fr 80px 110px";
  const rowScore = selected ? ((selected / 5) * item.weight).toFixed(2) : "—";

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
      <div style={{ padding: "8px 4px", textAlign: "center", fontSize: 12 }}>
        {item.weight}%
      </div>

      {/* Level buttons 1-5 */}
      {[1, 2, 3, 4, 5].map((lv) => (
        <div
          key={lv}
          onClick={() => onSelect(lv)}
          title={item.levels[lv - 1]}
          style={{
            padding: "5px 2px", cursor: "pointer", textAlign: "center",
            background: selected === lv ? LEVEL_COLORS[lv - 1] : "transparent",
            border: `2px solid ${selected === lv ? LEVEL_COLORS[lv - 1] : "transparent"}`,
            borderRadius: 4, margin: 2, transition: "all 0.12s",
          }}
        >
          <div style={{ fontSize: 9, lineHeight: 1.2, color: selected === lv ? "#000" : "#aaa" }}>
            {item.levels[lv - 1].substring(0, 22)}…
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