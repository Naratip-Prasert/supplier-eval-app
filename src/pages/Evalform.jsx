// ============================================================
//  pages/EvalForm.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Header, GreenButton, useModal } from "../components";
import { PRE_CRITERIA, POST_CRITERIA, LEVEL_COLORS, GRADE_MAP, getGrade } from "../constants";

const LEVEL_LABELS = ["ต้องปรับปรุง", "ต่ำกว่าเกณฑ์", "พอใช้", "ดี", "ดีมาก"];
const COLS = "56px 3fr 78px 1fr 1fr 1fr 1fr 1fr 88px 120px";

// ---- helpers -----------------------------------------------

// distribute `total` across `items` proportionally based on `current` values
// last item absorbs rounding remainder
function redistribute(items, current, total) {
  const currentSum = items.reduce((s, k) => s + (current[k] ?? 0), 0);
  const result = { ...current };
  if (items.length === 0) return result;

  if (currentSum > 0) {
    let rem = total;
    items.forEach((k, idx) => {
      if (idx === items.length - 1) {
        result[k] = Math.max(0, rem);
      } else {
        const w = Math.round(((current[k] ?? 0) / currentSum) * total);
        result[k] = w;
        rem -= w;
      }
    });
  } else {
    // equal split
    let rem = total;
    items.forEach((k, idx) => {
      const w = idx === items.length - 1 ? Math.max(0, rem) : Math.round(total / items.length);
      result[k] = w;
      rem -= w;
    });
  }
  return result;
}

// คำนวณ initial weights ให้ section รวม = 100 และ items ใน section รวม = section weight
function initWeights(criteria) {
  const rawSec   = criteria.map((s) => s.items.reduce((sum, i) => sum + i.weight, 0));
  const rawTotal = rawSec.reduce((sum, w) => sum + w, 0) || 100;

  const sections = {};
  let remSec = 100;
  criteria.forEach((_, si) => {
    if (si === criteria.length - 1) {
      sections[si] = Math.max(0, remSec);
    } else {
      const w = Math.round((rawSec[si] / rawTotal) * 100);
      sections[si] = w;
      remSec -= w;
    }
  });

  const items = {};
  criteria.forEach((section, si) => {
    const secW    = sections[si];
    const rawItem = section.items.reduce((sum, i) => sum + i.weight, 0) || 1;
    let remItem   = secW;
    section.items.forEach((item, idx) => {
      if (idx === section.items.length - 1) {
        items[item.no] = Math.max(0, remItem);
      } else {
        const w = Math.round((item.weight / rawItem) * secW);
        items[item.no] = w;
        remItem -= w;
      }
    });
  });

  return { items, sections };
}

// ---- main component ----------------------------------------

export default function EvalForm({ formData, onBack, onDone }) {
  const CRITERIA = formData.evalType === "post-Evaluation" ? POST_CRITERIA : PRE_CRITERIA;

  const { showAlert, showConfirm, ModalEl } = useModal();
  const [scores, setScores] = useState({});
  const [notes,  setNotes]  = useState({});

  // รวม weights และ sectionWeights เป็น state เดียว → update atomic เสมอ
  const [ws, setWs] = useState(() => initWeights(CRITERIA));
  const weights        = ws.items;
  const sectionWeights = ws.sections;

  const allItems           = CRITERIA.flatMap((s) => s.items);
  const answered           = Object.keys(scores).length;
  const total              = allItems.length;
  const totalSectionWeight = CRITERIA.reduce((sum, _, si) => sum + (sectionWeights[si] ?? 0), 0);

  // 2-level score: normalize within section → multiply by section weight
  const totalScore = (() => {
    let raw = 0;
    CRITERIA.forEach((section, si) => {
      const sw       = sectionWeights[si] ?? 0;
      const maxItemW = section.items.reduce((s, i) => s + (weights[i.no] ?? i.weight), 0);
      const rawItem  = section.items.reduce((s, item) => {
        const lv = scores[item.no];
        const w  = weights[item.no] ?? item.weight;
        return lv ? s + (lv / 5) * w : s;
      }, 0);
      raw += maxItemW > 0 ? (rawItem / maxItemW) * sw : 0;
    });
    return totalSectionWeight > 0 ? (raw / totalSectionWeight) * 100 : 0;
  })();

  const grade      = getGrade(totalScore);
  const gradeColor = GRADE_MAP[grade];
  const subtitle   = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}`;
  const evalLabel  = formData.evalType === "post-Evaluation" ? "Post" : "Pre";

  const handleBack = async () => {
    const ok = await showConfirm("ต้องการกลับหน้าหลักใช่ไหม?\nข้อมูลที่กรอกไว้ทั้งหมดจะหายไป", "กลับหน้าหลัก");
    if (ok) onBack();
  };

  const handleSubmit = async () => {
    const unanswered = allItems.filter((item) => !scores[item.no]).map((i) => i.no);
    if (unanswered.length > 0) {
      await showAlert(`ยังมีหัวข้อที่ยังไม่ได้ให้คะแนน:\n• ${unanswered.join("\n• ")}`, "ประเมินไม่ครบ");
      return;
    }
    onDone({ scores, notes, totalScore, grade, weights, sectionWeights });
  };

  // ---- section weight change --------------------------------
  // atomic: sections อื่นปรับให้รวม 100  +  items ทุก section ปรับตาม section weight ใหม่
  const handleSectionWeightChange = (si, newVal) => {
    const clamped   = Math.max(0, Math.min(100, Number(newVal) || 0));
    const otherSIs  = CRITERIA.map((_, i) => i).filter((i) => i !== si);
    const remaining = 100 - clamped;

    setWs((prev) => {
      // 1. section weights: si = clamped, others redistribute proportionally
      const newSections = redistribute(otherSIs, prev.sections, remaining);
      newSections[si]   = clamped;

      // 2. items ใน ทุก section: redistribute ให้ sum = section weight ของแต่ละ section
      let newItems = { ...prev.items };
      CRITERIA.forEach((section, sIdx) => {
        const keys = section.items.map((i) => i.no);
        newItems   = redistribute(keys, newItems, newSections[sIdx] ?? 0);
      });

      return { items: newItems, sections: newSections };
    });
  };

  // ---- item weight change ----------------------------------
  // atomic: items อื่นใน section เดียวกันปรับ  (section weight ไม่เปลี่ยน)
  const handleItemWeightChange = (no, si, newVal) => {
    setWs((prev) => {
      const sectionTotal    = prev.sections[si] ?? 0;
      const clamped         = Math.max(0, Math.min(sectionTotal, Number(newVal) || 0));
      const remaining       = sectionTotal - clamped;
      const sectionItemKeys = CRITERIA[si].items.map((i) => i.no);
      const otherItems      = sectionItemKeys.filter((k) => k !== no);

      const newItems    = redistribute(otherItems, prev.items, remaining);
      newItems[no]      = clamped;
      return { ...prev, items: newItems };
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f4", fontFamily: "Sarabun, sans-serif", paddingBottom: 100 }}>
      {ModalEl}
      <Header
        titleOverride={`Supplier Performance Evaluation - ${evalLabel} Evaluation`}
        subtitle={subtitle}
        backLabel="← กลับหน้าหลัก"
        onBack={handleBack}
      />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 16px 0" }}>
        <InfoBar formData={formData} evalLabel={evalLabel} />

        {/* Scoring guide */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          marginBottom: 12, padding: "10px 14px",
          background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0",
        }}>
          <span style={{ fontSize: 12, color: "#666", fontWeight: 600, marginRight: 4 }}>เกณฑ์คะแนน:</span>
          {LEVEL_LABELS.map((lbl, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: LEVEL_COLORS[i] + "28", border: `1.5px solid ${LEVEL_COLORS[i]}`,
              borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600,
            }}>
              <span style={{
                background: LEVEL_COLORS[i], color: "#fff", borderRadius: "50%",
                width: 18, height: 18, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
              }}>{i + 1}</span>
              {lbl}
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
            💡 คลิกช่อง <b>น้ำหนัก%</b> เพื่อแก้ไข — ส่วนที่เหลือจะปรับให้อัตโนมัติ
          </span>
        </div>

        {/* Table */}
        <div style={{ borderRadius: 10, overflow: "hidden", border: "1.5px solid #c8d8c8", marginBottom: 16, background: "#fff" }}>
          <TableHeader />
          {CRITERIA.map((section, si) => (
            <div key={si}>
              <SectionHeaderRow
                section={section}
                secWeight={sectionWeights[si] ?? 0}
                onSectionWeightChange={(val) => handleSectionWeightChange(si, val)}
              />
              {section.items.map((item, ii) => (
                <ScoreRow
                  key={item.no}
                  item={item}
                  weight={weights[item.no] ?? item.weight}
                  selected={scores[item.no]}
                  note={notes[item.no] || ""}
                  onSelect={(lv) => setScores((s) => ({ ...s, [item.no]: lv }))}
                  onNote={(v)   => setNotes((n)  => ({ ...n, [item.no]: v }))}
                  onWeightChange={(v) => handleItemWeightChange(item.no, si, v)}
                  shaded={ii % 2 !== 0}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky score bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "#fff", borderTop: "2px solid #a5d6a7",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.10)",
        padding: "10px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>
            ตอบแล้ว <b style={{ color: "#1a6b1a" }}>{answered}</b>/{total} ข้อ
          </span>
          <div style={{ flex: 1, height: 8, background: "#e0e0e0", borderRadius: 4, maxWidth: 200 }}>
            <div style={{
              height: "100%", borderRadius: 4, background: "#2e7d32",
              width: `${total > 0 ? (answered / total) * 100 : 0}%`,
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
            น้ำหนัก section รวม:{" "}
            <b style={{ color: totalSectionWeight === 100 ? "#1a6b1a" : "#e65100" }}>{totalSectionWeight}%</b>
            {totalSectionWeight !== 100 && <span style={{ color: "#e65100" }}> ≠ 100%</span>}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>คะแนนรวม:</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#1a6b1a", lineHeight: 1 }}>
            {totalScore.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: "#888" }}>/100</span>
          <span style={{
            background: gradeColor, color: "#fff", borderRadius: 8,
            padding: "6px 20px", fontSize: 20, fontWeight: 800,
            boxShadow: `0 2px 8px ${gradeColor}66`,
          }}>{grade}</span>
        </div>

        <GreenButton onClick={handleSubmit} style={{ padding: "10px 32px", fontSize: 15 }}>
          Submit Supplier Evaluation
        </GreenButton>
      </div>
    </div>
  );
}

// ---- Sub-components ----------------------------------------

function InfoBar({ formData, evalLabel }) {
  const now   = new Date();
  const refNo = `SPE-${evalLabel.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}-AUTO`;
  return (
    <div style={{
      background: "#fff", border: "1.5px solid #c8d8c8", borderRadius: 10,
      padding: "14px 18px", marginBottom: 12,
    }}>
      <div style={{
        background: "#fffde7", border: "1.5px solid #f9a825", borderRadius: 6,
        padding: "6px 14px", marginBottom: 12, textAlign: "center",
        fontWeight: 700, fontSize: 13, color: "#555",
      }}>
        บริษัทในกลุ่ม : Consumer / Packaging / Retail / Manufacturer
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 28px", fontSize: 13 }}>
        {[
          ["ชื่อผู้ขาย/ผู้ให้บริการ",    formData.supplierName || "—"],
          ["รหัสผู้ขาย (Vendor code)",    formData.vendorCode   || "—"],
          ["เลขที่อ้างอิง",               refNo],
          ["หน่วยงาน",                    formData.dept         || "—"],
          ["ชื่อผู้ประเมิน/รหัสพนักงาน", formData.empId        || "—"],
          ["รอบการประเมิน",               formData.period       || "—"],
        ].map(([label, val]) => (
          <div key={label}>
            <span style={{ fontWeight: 700, color: "#444" }}>{label}: </span>
            <span style={{ color: "#1a6b1a", fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableHeader() {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COLS,
      background: "#2e7d32", color: "#fff",
      fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
      padding: "10px 6px", gap: 4, textAlign: "center",
    }}>
      <div>ลำดับ</div>
      <div style={{ textAlign: "left", paddingLeft: 6 }}>หัวข้อการประเมิน / รายละเอียด</div>
      <div>น้ำหนัก%</div>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{
            background: LEVEL_COLORS[n - 1], color: "#fff", borderRadius: "50%",
            width: 22, height: 22, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 12, fontWeight: 800,
          }}>{n}</span>
          <span style={{ fontSize: 10, opacity: 0.85 }}>{LEVEL_LABELS[n - 1]}</span>
        </div>
      ))}
      <div>คะแนนที่ได้</div>
      <div>หมายเหตุ</div>
    </div>
  );
}

function SectionHeaderRow({ section, secWeight, onSectionWeightChange }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(secWeight));

  useEffect(() => {
    if (!editing) setDraft(String(secWeight));
  }, [secWeight, editing]);

  const commit = () => {
    setEditing(false);
    onSectionWeightChange(draft);
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: COLS, gap: 4,
      background: "linear-gradient(90deg,#1a6b1a,#2e7d32)",
      color: "#fff", alignItems: "center",
    }}>
      <div style={{ gridColumn: "1 / 3", padding: "10px 16px", fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
        {section.section}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 4px" }}>
        {editing ? (
          <input
            type="number"
            value={draft}
            min={0} max={100}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            style={{
              width: 54, textAlign: "center", fontSize: 13, fontWeight: 700,
              border: "2px solid #fff", borderRadius: 6, padding: "4px 2px",
              outline: "none", background: "rgba(255,255,255,0.2)", color: "#fff",
            }}
          />
        ) : (
          <div
            onClick={() => { setDraft(String(secWeight)); setEditing(true); }}
            title="คลิกเพื่อแก้ไข — section อื่นจะปรับให้รวม 100%"
            style={{
              fontSize: 13, fontWeight: 700, color: "#fff",
              border: "1.5px dashed rgba(255,255,255,0.6)", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {secWeight}% <span style={{ fontSize: 10, opacity: 0.8 }}>✏️</span>
          </div>
        )}
      </div>

      <div style={{ gridColumn: "4 / 11" }} />
    </div>
  );
}

function ScoreRow({ item, weight, selected, note, onSelect, onNote, onWeightChange, shaded }) {
  const levelValues = item.levelValues || [1, 2, 3, 4, 5];
  const rowScore    = selected ? ((selected / 5) * weight).toFixed(2) : "—";
  const [editing,   setEditing] = useState(false);
  const [draft,     setDraft]   = useState(String(weight));

  useEffect(() => {
    if (!editing) setDraft(String(weight));
  }, [weight, editing]);

  const commit = () => {
    setEditing(false);
    onWeightChange(draft);
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: COLS,
      borderTop: "1px solid #e8ece8", gap: 4, alignItems: "stretch",
      background: selected
        ? shaded ? "#f0faf0" : "#f6fcf6"
        : shaded ? "#f8faf8" : "#fff",
      transition: "background 0.15s",
    }}>
      <div style={{
        padding: "12px 4px", textAlign: "center", fontSize: 13,
        fontWeight: 700, color: "#1a6b1a",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {item.no}
      </div>

      <div style={{
        padding: "12px 8px", fontSize: 13, lineHeight: 1.65,
        whiteSpace: "pre-line", color: "#222",
        display: "flex", alignItems: "center",
      }}>
        {item.title}
      </div>

      <div style={{ padding: "8px 4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {editing ? (
          <input
            type="number"
            value={draft}
            min={0} max={100}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            style={{
              width: 54, textAlign: "center", fontSize: 13, fontWeight: 700,
              border: "2px solid #2e7d32", borderRadius: 6,
              padding: "4px 2px", outline: "none", color: "#1a6b1a",
            }}
          />
        ) : (
          <div
            onClick={() => { setDraft(String(weight)); setEditing(true); }}
            title="คลิกเพื่อแก้ไข — หัวข้ออื่นใน section จะปรับให้รวมเท่า section weight"
            style={{
              fontSize: 13, fontWeight: 700, color: "#1a6b1a",
              border: "1.5px dashed #a5d6a7", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f5e9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {weight}% <span style={{ fontSize: 10, color: "#aaa" }}>✏️</span>
          </div>
        )}
      </div>

      {[1, 2, 3, 4, 5].map((lv) => {
        const available  = levelValues.includes(lv);
        const descIdx    = levelValues.indexOf(lv);
        const isSelected = selected === lv;
        return (
          <div
            key={lv}
            onClick={() => available && onSelect(lv)}
            style={{
              padding: "8px 4px", textAlign: "center",
              cursor: available ? "pointer" : "default",
              background: isSelected ? LEVEL_COLORS[lv - 1] : available ? "transparent" : "#f5f5f5",
              border: `2px solid ${isSelected ? LEVEL_COLORS[lv - 1] : available ? "#ddd" : "transparent"}`,
              borderRadius: 6, margin: "6px 2px",
              opacity: available ? 1 : 0.15,
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isSelected ? `0 2px 8px ${LEVEL_COLORS[lv - 1]}55` : "none",
            }}
            onMouseEnter={(e) => { if (available && !isSelected) e.currentTarget.style.background = LEVEL_COLORS[lv - 1] + "28"; }}
            onMouseLeave={(e) => { if (available && !isSelected) e.currentTarget.style.background = "transparent"; }}
          >
            {available && (
              <div style={{
                fontSize: 11, lineHeight: 1.45,
                color: isSelected ? "#fff" : "#555",
                whiteSpace: "pre-line", wordBreak: "break-word",
                fontWeight: isSelected ? 700 : 400,
              }}>
                {item.levels[descIdx]}
              </div>
            )}
          </div>
        );
      })}

      <div style={{
        padding: "12px 4px", textAlign: "center", fontSize: 14, fontWeight: 800,
        color: selected ? "#1a6b1a" : "#ccc",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {rowScore}
      </div>

      <div style={{ padding: "6px 6px", display: "flex", alignItems: "center" }}>
        <NoteCell itemNo={item.no} value={note} onChange={onNote} />
      </div>
    </div>
  );
}

// ---- NoteCell: คลิกแล้วป๊อปอัพกลางจอ ----------------------------------------
function NoteCell({ itemNo, value, onChange }) {
  const [open,  setOpen]  = useState(false);
  const [draft, setDraft] = useState(value);

  const openPopup = () => { setDraft(value); setOpen(true); };
  const save      = () => { onChange(draft); setOpen(false); };
  const cancel    = () => { setDraft(value); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape")               cancel();
      if (e.key === "Enter" && e.ctrlKey)   save();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, draft]);

  return (
    <>
      {/* trigger cell */}
      <div
        onClick={openPopup}
        style={{
          width: "100%", minHeight: 36, cursor: "pointer",
          borderRadius: 6, padding: "4px 8px",
          border: value ? "1.5px solid #a5d6a7" : "1.5px dashed #ccc",
          background: value ? "#f1f8e9" : "#fafafa",
          display: "flex", alignItems: "center",
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2e7d32"; e.currentTarget.style.background = "#e8f5e9"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = value ? "#a5d6a7" : "#ccc"; e.currentTarget.style.background = value ? "#f1f8e9" : "#fafafa"; }}
      >
        {value ? (
          <span style={{
            fontSize: 11, color: "#333", lineHeight: 1.4,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {value}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>+ หมายเหตุ</span>
        )}
      </div>

      {/* modal กลางจอ */}
      {open && (
        <>
          {/* backdrop */}
          <div
            onClick={save}
            style={{
              position: "fixed", inset: 0, zIndex: 9990,
              background: "rgba(0,0,0,0.45)",
            }}
          />
          {/* popup card */}
          <div style={{
            position: "fixed", zIndex: 9991,
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, 90vw)",
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
            overflow: "hidden",
            fontFamily: "Sarabun, sans-serif",
            animation: "notePopIn 0.18s cubic-bezier(.34,1.3,.64,1)",
          }}>
            <style>{`@keyframes notePopIn { from { opacity:0; transform:translate(-50%,-54%) scale(0.93); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }`}</style>

            {/* header */}
            <div style={{
              background: "#1a6b1a", color: "#fff",
              padding: "14px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                📝 หมายเหตุ — ข้อ {itemNo}
              </span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>ไม่จำกัดจำนวนตัวอักษร</span>
            </div>

            {/* body */}
            <div style={{ padding: "18px 20px 12px" }}>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="พิมพ์หมายเหตุได้เลย..."
                rows={7}
                style={{
                  width: "100%", boxSizing: "border-box",
                  fontSize: 14, fontFamily: "Sarabun, sans-serif",
                  border: "1.5px solid #a5d6a7", borderRadius: 8,
                  padding: "10px 12px", outline: "none",
                  resize: "vertical", lineHeight: 1.7, color: "#222",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#2e7d32")}
                onBlur={(e)  => (e.target.style.borderColor = "#a5d6a7")}
              />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 6, textAlign: "right" }}>
                {draft.length} ตัวอักษร &nbsp;·&nbsp; Ctrl+Enter = บันทึก &nbsp;·&nbsp; Esc = ยกเลิก
              </div>
            </div>

            {/* footer */}
            <div style={{
              padding: "10px 20px 18px",
              display: "flex", justifyContent: "flex-end", gap: 10,
            }}>
              <button
                onClick={cancel}
                style={{
                  background: "#f5f5f5", color: "#555",
                  border: "1.5px solid #d0d0d0", borderRadius: 8,
                  padding: "10px 24px", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "Sarabun, sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e0e0e0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              >
                ยกเลิก
              </button>
              <button
                onClick={save}
                style={{
                  background: "#2e7d32", color: "#fff", border: "none",
                  borderRadius: 8, padding: "10px 32px", fontSize: 14,
                  fontWeight: 700, cursor: "pointer", fontFamily: "Sarabun, sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1b5e20")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#2e7d32")}
              >
                บันทึก ✓
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
