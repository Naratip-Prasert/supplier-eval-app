// ============================================================
//  pages/EvalForm.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Header, GreenButton, useModal } from "../components";
import { getCriteria, isPostEvalType, LEVEL_COLORS, GRADE_MAP, GRADE_GUIDE, getGrade } from "../constants";
import { AlertTriangle, FileText } from "lucide-react";

const LEVEL_LABELS       = ["ต้องปรับปรุง (Unsatisfactory)", "ต่ำกว่าเกณฑ์ (Below Standard)", "ผ่านเกณฑ์ (Satisfactory)", "ดี (Good)", "ดีเยี่ยม (Excellent)"];
const LEVEL_SHORT_LABELS = ["ต้องปรับปรุง", "ต่ำกว่าเกณฑ์", "ผ่านเกณฑ์", "ดี", "ดีเยี่ยม"];
const COLS = "52px 2.8fr 76px 1.1fr 1.1fr 1.1fr 1.1fr 1.1fr 84px 116px";

// ---- helpers -----------------------------------------------

const r2 = (n) => Math.round(n * 100) / 100;


function initWeights(criteria) {
  const sections = {};
  const items    = {};
  criteria.forEach((section, si) => {
    const sw = section.weight ?? 0;
    sections[si] = sw;
    const realItems = section.items.filter((i) => !i.divider);

    // ถ้า item.weight ใน constants รวมกันได้ = section weight พอดี → ใช้โดยตรง (ได้จำนวนเต็ม)
    const constantSum = realItems.reduce((s, i) => s + (i.weight ?? 0), 0);
    if (realItems.every(i => i.weight != null) && constantSum === sw) {
      realItems.forEach(item => { items[item.no] = item.weight; });
    } else {
      // fallback: แจกเท่ากัน (เช่น ESG ที่ item.weight ไม่รวมกันได้ = sw)
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

// ---- main component ----------------------------------------

export default function EvalForm({ formData, savedState, user, profilePic, onBack, onDone }) {
  const CRITERIA = getCriteria(formData.evalType);

  const { showConfirm, showAlert, ModalEl } = useModal();
  const [scores,       setScores]       = useState(() => savedState?.scores      ?? {});
  const [notes,        setNotes]        = useState(() => savedState?.notes       ?? {});
  const [missingItems, setMissingItems] = useState(null); // null = closed, array = open
  const [legalStatus, setLegalStatus]   = useState(() => savedState?.legalStatus ?? null);

  const [ws, setWs] = useState(() => savedState?.ws ?? initWeights(CRITERIA));
  const sectionWeights = ws.sections;
  const itemWeights    = ws.items;

  const allItems        = CRITERIA.flatMap((s) => s.items.filter((i) => !i.divider));
  const answered        = Object.keys(scores).length;

  // The in-app "กลับหน้าหลัก" button already warns before discarding
  // entered scores, but closing the tab/refreshing bypassed that entirely
  // — there's no autosave, so a refresh meant total data loss with zero
  // warning.
  useEffect(() => {
    if (answered === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [answered]);
  const total           = allItems.length;
  const totalItemWeight = allItems.reduce((s, item) => s + (itemWeights[item.no] ?? 0), 0);
  const totalSectionWeight = CRITERIA.reduce((sum, _, si) => sum + (sectionWeights[si] ?? 0), 0);

  // คะแนน = Σ(lv/maxLv × itemWeight) / totalItemWeight × 100
  const totalScore = (() => {
    if (totalItemWeight === 0) return 0;
    const raw = allItems.reduce((s, item) => {
      const lv    = scores[item.no];
      const maxLv = item.levelValues ? Math.max(...item.levelValues) : 5;
      const iw    = itemWeights[item.no] ?? 0;
      return lv ? s + (lv / maxLv) * iw : s;
    }, 0);
    return (raw / totalItemWeight) * 100;
  })();

  const grade      = getGrade(totalScore);
  const gradeColor = GRADE_MAP[grade];
  const subtitle   = `${formData.empId || "BJC-XXXXX"}|${formData.dept || "ฝ่าย"}`;
  const evalLabel  = isPostEvalType(formData.evalType) ? "Post" : "Pre";

  const handleSectionWeightChange = (si, newVal) => {
    const clamped = Math.max(0, Math.min(100, Number(newVal) || 0));
    setWs((prev) => {
      const lastSi = CRITERIA.length - 1;
      const bufSi  = si === lastSi ? lastSi - 1 : lastSi;

      // section ที่แก้ = clamped, buffer section = 100 - ผลรวมของที่เหลือ
      const newSections = { ...prev.sections, [si]: clamped };
      const othersSum   = CRITERIA.reduce((s, _, i) => {
        if (i === bufSi) return s;
        return s + (i === si ? clamped : (prev.sections[i] ?? 0));
      }, 0);
      newSections[bufSi] = Math.max(0, r2(100 - othersSum));

      // helper: scale items ใน section ให้รวม = sw ใหม่ (สัดส่วนเดิม)
      const newItems = { ...prev.items };
      const scaleItems = (idx) => {
        const sw        = newSections[idx];
        const realItems = CRITERIA[idx].items.filter((i) => !i.divider);
        const oldSum    = realItems.reduce((s, it) => s + (prev.items[it.no] ?? 0), 0);
        if (oldSum > 0) {
          let rem = sw;
          realItems.forEach((item, ii) => {
            if (ii === realItems.length - 1) { newItems[item.no] = Math.max(0, r2(rem)); }
            else { const w = r2(((prev.items[item.no] ?? 0) / oldSum) * sw); newItems[item.no] = w; rem -= w; }
          });
        } else {
          const each = r2(sw / (realItems.length || 1));
          let rem = sw;
          realItems.forEach((item, ii) => {
            if (ii === realItems.length - 1) { newItems[item.no] = Math.max(0, r2(rem)); }
            else { newItems[item.no] = each; rem -= each; }
          });
        }
      };

      scaleItems(si);
      if (bufSi !== si) scaleItems(bufSi);

      return { sections: newSections, items: newItems };
    });
  };

  const handleItemWeightChange = (no, si, newVal) => {
    setWs((prev) => {
      const secTotal  = prev.sections[si] ?? 0;
      const clamped   = Math.max(0, Math.min(secTotal, Number(newVal) || 0));
      const realItems = CRITERIA[si].items.filter((i) => !i.divider);
      if (realItems.length <= 1) return { ...prev, items: { ...prev.items, [no]: clamped } };

      const lastItem   = realItems[realItems.length - 1];
      // ถ้าแก้ตัวสุดท้าย → ตัวก่อนสุดท้ายรับ มิฉะนั้น → ตัวสุดท้ายรับเสมอ
      const bufferItem = no === lastItem.no
        ? realItems[realItems.length - 2]
        : lastItem;

      const newItems  = { ...prev.items, [no]: clamped };
      const othersSum = realItems
        .filter((i) => i.no !== bufferItem.no)
        .reduce((s, i) => s + (newItems[i.no] ?? 0), 0);
      newItems[bufferItem.no] = Math.max(0, r2(secTotal - othersSum));

      return { ...prev, items: newItems };
    });
  };

  const handleSubmitDisqualified = async () => {
    const ok = await showConfirm(
      "ผู้ประเมินจะถูก Disqualified ทันที\nยืนยันส่งผลการประเมิน 'ไม่ผ่าน' ใช่ไหม?",
      "ส่งผล — ไม่ผ่าน (Disqualified)"
    );
    if (ok) onDone({ scores: {}, notes: {}, totalScore: 0, grade: "F", sectionWeights, weights: itemWeights, disqualified: true, legalStatus: "fail", ws });
  };

  const handleBack = async () => {
    const ok = await showConfirm("ต้องการกลับหน้าหลักใช่ไหม?\nข้อมูลที่กรอกไว้ทั้งหมดจะหายไป", "กลับหน้าหลัก");
    if (ok) onBack();
  };

  const handleSubmit = () => {
    if (legalStatus !== "pass") return;
    // The "น้ำหนักรวม ≠ 100%" indicator next to the sticky bar used to be
    // purely cosmetic — it could turn red and the form would still submit.
    // Block here too, matching the same severity as a missing score.
    if (r2(totalItemWeight) !== 100) {
      showAlert(
        `น้ำหนักรวมขณะนี้คือ ${r2(totalItemWeight)}% ต้องรวมให้ได้ 100% ก่อนส่งผลการประเมิน`,
        "น้ำหนักไม่ครบ 100%"
      );
      return;
    }
    const unanswered = allItems.filter((item) => !scores[item.no]);
    if (unanswered.length > 0) {
      setMissingItems(unanswered);
      return;
    }
    onDone({ scores, notes, totalScore, grade, sectionWeights, weights: itemWeights, legalStatus, ws });
  };


  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f4", fontFamily: "Sarabun, sans-serif", paddingBottom: 100 }}>
      {ModalEl}
      {missingItems && (
        <MissingScoresModal
          items={missingItems}
          criteria={CRITERIA}
          answered={answered}
          total={total}
          onClose={() => setMissingItems(null)}
        />
      )}
      <Header
        titleOverride={`SPES - ${evalLabel} Evaluation`}
        subtitle={subtitle}
        backLabel="← กลับหน้าหลัก"
        onBack={handleBack}
        user={user}
        profilePic={profilePic}
      />

      {/* DEV-only: fill-all shortcut for manual testing — must never reach
          a production build, since it lets anyone one-click a fraudulent
          maxed-out evaluation. import.meta.env.DEV is false in `vite build`. */}
      {import.meta.env.DEV && (
        <button
          onClick={() => {
            const filled = {};
            CRITERIA.forEach(sec =>
              sec.items.filter(i => !i.divider).forEach(item => {
                const lvs = item.levelValues || [1, 2, 3, 4, 5];
                filled[item.no] = Math.max(...lvs);
              })
            );
            setScores(filled);
          }}
          style={{
            position: "fixed", top: 68, right: 12, zIndex: 200,
            background: "rgba(0,0,0,0.06)", border: "1px dashed #bbb",
            color: "#999", fontSize: 10, borderRadius: 4,
            padding: "3px 8px", cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          MAX ALL
        </button>
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 16px 0" }}>
        <InfoBar formData={formData} evalLabel={evalLabel} />
        <LegalComplianceCard
          status={legalStatus}
          onChange={setLegalStatus}
          onSubmitDisqualified={handleSubmitDisqualified}
        />

        <div style={{
          opacity: legalStatus !== "pass" ? 0.42 : 1,
          pointerEvents: legalStatus !== "pass" ? "none" : "auto",
          transition: "opacity 0.25s",
        }}>

        {/* Scoring guide */}
        <div style={{
          marginBottom: 12, background: "#fff", borderRadius: 8,
          border: "2px solid #2e7d32", boxShadow: "0 2px 10px rgba(46,125,50,0.12)",
          overflow: "hidden",
        }}>
          {/* hint bar */}
          <div style={{
            background: "#e8f5e9", borderBottom: "2px solid #a5d6a7",
            borderLeft: "5px solid #2e7d32",
            padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{
              background: "#1b5e20", color: "#fff", borderRadius: 5,
              padding: "4px 12px", fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
              flexShrink: 0,
            }}>TIP</span>
            <span style={{ fontSize: 14, color: "#1a3c1a", fontWeight: 500 }}>
              คลิกช่อง <span style={{
                background: "#fff", border: "1.5px solid #2e7d32",
                borderRadius: 4, padding: "2px 8px", fontWeight: 800, color: "#1b5e20",
              }}>น้ำหนัก%</span>{" "}
              ที่หัว Section เพื่อตั้งน้ำหนัก — หัวข้อใน Section จะปรับสัดส่วนตามอัตโนมัติ
            </span>
          </div>
          {/* level legend */}
          <div style={{
            display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
            padding: "8px 14px",
          }}>
            <span style={{ fontSize: 11, color: "#718096", fontWeight: 600, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Level:</span>
            {LEVEL_LABELS.map((lbl, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: LEVEL_COLORS[i] + "18", border: `1px solid ${LEVEL_COLORS[i]}80`,
                borderRadius: 5, padding: "3px 10px", fontSize: 12,
              }}>
                <span style={{
                  background: LEVEL_COLORS[i], color: "#fff", borderRadius: 3,
                  width: 18, height: 18, display: "inline-flex",
                  alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ color: "#2d3748", fontWeight: 500 }}>{lbl}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Table — the desktop grid (COLS = 10 fixed/fr columns) is
            unreadable below ~700px: each column gets squeezed to a sliver
            a few px wide and Thai text wraps character-by-character. Below
            that width, show a stacked card layout instead (same handlers/
            state, just different markup) rather than the grid. */}
        <style>{`
          .score-table-desktop { display: block; }
          .score-table-mobile { display: none; }
          @media (max-width: 700px) {
            .score-table-desktop { display: none; }
            .score-table-mobile { display: block; }
          }
        `}</style>

        <div className="score-table-desktop" style={{ borderRadius: 10, overflow: "hidden", border: "1.5px solid #c8d8c8", marginBottom: 16, background: "#fff" }}>
          <TableHeader />
          {CRITERIA.map((section, si) => (
            <div key={si}>
              <SectionHeaderRow
                section={section}
                secWeight={sectionWeights[si] ?? 0}
                onSectionWeightChange={(val) => handleSectionWeightChange(si, val)}
              />
              {section.items.map((item, ii) =>
                item.divider
                  ? <DividerRow key={item.label} label={item.label} level={item.level} />
                  : (
                    <ScoreRow
                      key={item.no}
                      item={item}
                      weight={itemWeights[item.no] ?? 0}
                      selected={scores[item.no]}
                      note={notes[item.no] || ""}
                      onSelect={(lv) => setScores((s) => ({ ...s, [item.no]: lv }))}
                      onNote={(v)   => setNotes((n)  => ({ ...n, [item.no]: v }))}
                      onWeightChange={(v) => handleItemWeightChange(item.no, si, v)}
                      shaded={ii % 2 !== 0}
                    />
                  )
              )}
            </div>
          ))}
        </div>

        <div className="score-table-mobile" style={{ borderRadius: 10, overflow: "hidden", border: "1.5px solid #c8d8c8", marginBottom: 16, background: "#fff" }}>
          {CRITERIA.map((section, si) => (
            <div key={si}>
              <SectionHeaderMobile
                section={section}
                secWeight={sectionWeights[si] ?? 0}
                onSectionWeightChange={(val) => handleSectionWeightChange(si, val)}
              />
              {section.items.map((item, ii) =>
                item.divider
                  ? <DividerMobile key={item.label} label={item.label} level={item.level} />
                  : (
                    <ScoreCardMobile
                      key={item.no}
                      item={item}
                      weight={itemWeights[item.no] ?? 0}
                      selected={scores[item.no]}
                      note={notes[item.no] || ""}
                      onSelect={(lv) => setScores((s) => ({ ...s, [item.no]: lv }))}
                      onNote={(v)   => setNotes((n)  => ({ ...n, [item.no]: v }))}
                      onWeightChange={(v) => handleItemWeightChange(item.no, si, v)}
                      shaded={ii % 2 !== 0}
                    />
                  )
              )}
            </div>
          ))}
        </div>

        {/* Scoring Criteria table */}
        <div style={{
          background: "#fff", border: "2px solid #2e7d32", borderRadius: 8,
          boxShadow: "0 2px 10px rgba(46,125,50,0.12)", overflow: "hidden", marginBottom: 16,
        }}>
          <div style={{
            padding: "13px 18px", borderBottom: "1px solid #c8d8c8",
            background: "linear-gradient(90deg,#1a6b1a,#2e7d32)",
            fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: 0.3,
          }}>
            เกณฑ์การตัดสิน / Scoring Criteria
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8faf8" }}>
                {["เกรด", "คะแนน (%)", "สถานะ"].map(h => (
                  <th key={h} style={{
                    padding: "8px 16px", textAlign: "left", fontWeight: 600,
                    fontSize: 12, color: "#718096", borderBottom: "1px solid #e0e6e0",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRADE_GUIDE.map((g, i) => (
                <tr key={g.g} style={{ background: i % 2 === 0 ? "#fff" : "#fafcfa", borderBottom: "1px solid #f0f4f0" }}>
                  <td style={{ padding: "9px 16px" }}>
                    <span style={{
                      background: g.color, color: "#fff",
                      borderRadius: 5, padding: "3px 12px",
                      fontWeight: 800, fontSize: 14, display: "inline-block",
                    }}>{g.g}</span>
                  </td>
                  <td style={{ padding: "9px 16px", fontWeight: 600, color: "#2d3748" }}>{g.range}</td>
                  <td style={{ padding: "9px 16px", color: g.color, fontWeight: 600 }}>{g.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        </div>{/* /locked wrapper */}
      </div>

      {/* Sticky score bar — 3 flex children (progress / score+grade /
          submit button) with no wrap used to overflow the viewport on
          mobile, pushing the Submit button off-screen to the right with
          no way to reach it. Stack into rows below 700px instead. */}
      <style>{`
        @media (max-width: 700px) {
          .sticky-score-bar { flex-direction: column !important; align-items: stretch !important; padding: 10px 14px !important; gap: 8px !important; }
          .sticky-score-progress { flex-wrap: wrap; }
          .sticky-score-totals { justify-content: center !important; }
          .sticky-score-submit { width: 100%; }
        }
      `}</style>
      <div className="sticky-score-bar" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "#fff", borderTop: "2px solid #a5d6a7",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.10)",
        padding: "10px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div className="sticky-score-progress" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>
            ตอบแล้ว <b style={{ color: "#1a6b1a" }}>{answered}</b>/{total} ข้อ
          </span>
          <div style={{ flex: 1, height: 8, background: "#e0e0e0", borderRadius: 4, maxWidth: 200, minWidth: 60 }}>
            <div style={{
              height: "100%", borderRadius: 4, background: "#2e7d32",
              width: `${total > 0 ? (answered / total) * 100 : 0}%`,
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
            น้ำหนักรวม:{" "}
            <b style={{ color: r2(totalItemWeight) === 100 ? "#1a6b1a" : "#e65100" }}>{r2(totalItemWeight)}%</b>
            {r2(totalItemWeight) !== 100 && <span style={{ color: "#e65100" }}> ≠ 100%</span>}
          </span>
        </div>

        <div className="sticky-score-totals" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        <GreenButton
          onClick={handleSubmit}
          style={{
            padding: "10px 32px", fontSize: 15,
            ...(legalStatus !== "pass" && { opacity: 0.38, cursor: "not-allowed", filter: "grayscale(40%)" }),
          }}
          className="sticky-score-submit"
        >
          Submit Supplier Evaluation
        </GreenButton>
      </div>
    </div>
  );
}

// ---- Sub-components ----------------------------------------

function LegalComplianceCard({ status, onChange, onSubmitDisqualified }) {
  const isFail = status === "fail";
  const isPass = status === "pass";

  const headerBg = isFail
    ? "linear-gradient(90deg,#b71c1c,#e53935)"
    : isPass
    ? "linear-gradient(90deg,#1a6b1a,#2e7d32)"
    : "linear-gradient(90deg,#bf360c,#e64a19)";

  return (
    <div style={{
      marginBottom: 12, background: "#fff", borderRadius: 8,
      border: `2px solid ${isFail ? "#b71c1c" : isPass ? "#2e7d32" : "#e64a19"}`,
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Header */}
      <div style={{
        background: headerBg, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{
          background: "rgba(255,255,255,0.22)", color: "#fff", borderRadius: 5,
          padding: "3px 10px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0,
        }}>
          ขั้นตอนที่ 1 — บังคับ
        </span>
        <span style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>
          การปฏิบัติตามกฎหมายและข้อบังคับที่เกี่ยวข้อง
          <span style={{ fontWeight: 400, fontSize: 13 }}> (Legal & Regulatory Compliance)</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.88)", fontWeight: 600, flexShrink: 0 }}>
          {!status && "⚠ กรุณาเลือกสถานะก่อน — ยังทำประเมินไม่ได้"}
          {isPass && "✓ ผ่านการตรวจสอบ — สามารถดำเนินการประเมินต่อได้"}
          {isFail && "ไม่สารมารถดำเนินการประเมินต่อได้ และต้องส่งผลการประเมินทันที"}
        </span>
      </div>

      {/* Options row */}
      <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Fail option */}
        <LegalOption
          selected={isFail}
          onClick={() => onChange("fail")}
          badge="ไม่ผ่าน (Disqualified)"
          badgeColor="#b71c1c"
          activeColor="#b71c1c"
          activeBg="#fff5f5"
          label="ไม่ปฏิบัติตามกฎหมาย มีประวัติถูกดำเนินคดี"
        />

        {/* Submit button — appears right next to fail when selected */}
        {isFail && (
          <button
            onClick={onSubmitDisqualified}
            style={{
              background: "linear-gradient(135deg,#b71c1c,#e53935)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "Sarabun, sans-serif",
              boxShadow: "0 4px 14px rgba(183,28,28,0.35)",
              whiteSpace: "nowrap", alignSelf: "center", flexShrink: 0,
              letterSpacing: 0.2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.86")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            ส่งผลการประเมิน →
          </button>
        )}

        {/* Pass option */}
        <LegalOption
          selected={isPass}
          onClick={() => onChange("pass")}
          badge="ผ่าน"
          badgeColor="#2e7d32"
          activeColor="#2e7d32"
          activeBg="#f1f8e9"
          label="ปฏิบัติตามกฎหมายครบถ้วน ไม่มีประวัติถูกดำเนินคดี มีใบอนุญาตครบถ้วนตาม TOR"
        />
      </div>
    </div>
  );
}

function LegalOption({ selected, onClick, badge, badgeColor, activeColor, activeBg, label }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 240,
        border: `2px solid ${selected ? activeColor : hovered ? activeColor + "66" : "#e0e0e0"}`,
        borderRadius: 8, padding: "12px 14px",
        background: selected ? activeBg : hovered ? activeBg : "#fafafa",
        cursor: "pointer", transition: "all 0.15s",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}
    >
      {/* Radio dot */}
      <div style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        border: `2px solid ${selected ? activeColor : "#ccc"}`,
        background: selected ? activeColor : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {selected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
      </div>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <span style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? activeColor : "#444" }}>
          {label}
        </span>
        {" "}
        <span style={{
          background: badgeColor, color: "#fff",
          borderRadius: 4, padding: "1px 8px", fontSize: 11, fontWeight: 700,
          verticalAlign: "middle", whiteSpace: "nowrap",
        }}>
          {badge}
        </span>
      </div>
    </div>
  );
}

function InfoBar({ formData, evalLabel }) {
  const now   = new Date();
  const refNo = `SPE-${evalLabel.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}-AUTO`;
  return (
    <div className="info-bar" style={{
      background: "#fff", border: "1px solid #e0e6e0", borderRadius: 8,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      padding: "12px 18px", marginBottom: 12,
      display: "flex", alignItems: "center", gap: 18,
    }}>
      <style>{`
        @media (max-width: 700px) {
          .info-bar { flex-direction: column !important; align-items: flex-start !important; }
          .info-bar-category { border-right: none !important; padding-right: 0 !important; border-bottom: 1px solid #e0e6e0; padding-bottom: 10px; margin-bottom: 10px; width: 100%; }
          .info-bar-grid { grid-template-columns: 1fr !important; width: 100%; }
          .info-bar-grid > div { word-break: break-word; }
        }
      `}</style>
      <div className="info-bar-category" style={{
        fontSize: 11, color: "#718096", fontWeight: 600,
        letterSpacing: 0.5, textTransform: "uppercase",
        borderRight: "1px solid #e0e6e0", paddingRight: 18, flexShrink: 0,
      }}>
        Consumer / Packaging<br />Retail / Manufacturer
      </div>
      <div className="info-bar-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px 28px", fontSize: 13, flex: 1, minWidth: 0 }}>
        {[
          ["ชื่อผู้ขาย/ผู้ให้บริการ",    formData.supplierName || "—"],
          ["เลขประจำตัวผู้เสียภาษี/Tax ID",    formData.vendorCode   || "—"],
          ["เลขที่อ้างอิง",               refNo],
          ["หน่วยงาน",                    formData.dept         || "—"],
          ["ชื่อผู้ประเมิน/รหัสพนักงาน", formData.empId        || "—"],
          ["รอบการประเมิน",               formData.period       || "—"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", gap: 4, minWidth: 0 }}>
            <span style={{ color: "#718096", flexShrink: 0 }}>{label}:</span>
            <span style={{ color: "#1a202c", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{val}</span>
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
      background: "#1b5e20", color: "#fff",
      fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
      padding: "12px 6px", gap: 4, textAlign: "center",
      alignItems: "center",
    }}>
      <div style={{ fontSize: 12 }}>ลำดับ</div>
      <div style={{ textAlign: "left", paddingLeft: 10, fontSize: 13 }}>หัวข้อการประเมิน / รายละเอียด</div>
      <div style={{ fontSize: 12, lineHeight: 1.4 }}>น้ำหนัก<br/>(%)</div>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{
            background: LEVEL_COLORS[n - 1], color: "#fff", borderRadius: "50%",
            width: 24, height: 24, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 13, fontWeight: 800,
            boxShadow: `0 1px 4px ${LEVEL_COLORS[n-1]}88`,
          }}>{n}</span>
          <span style={{ fontSize: 10, opacity: 0.9, lineHeight: 1.3, textAlign: "center" }}>
            {LEVEL_SHORT_LABELS[n - 1]}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 12, lineHeight: 1.4 }}>คะแนน<br/>ที่ได้</div>
      <div style={{ fontSize: 12 }}>หมายเหตุ</div>
    </div>
  );
}

function DividerRow({ label, level }) {
  const isMain = level === 1;
  return (
    <div style={{
      gridColumn: "1 / -1",
      background: isMain ? "#f0f4fa" : "#f7f9fc",
      borderTop: isMain ? "1.5px solid #b8cce4" : "1px solid #dde6f0",
      borderBottom: isMain ? "1.5px solid #b8cce4" : "1px solid #dde6f0",
      padding: isMain ? "8px 18px" : "6px 28px",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {isMain && (
        <span style={{
          width: 3, height: 14, background: "#1558a0",
          borderRadius: 2, display: "inline-block", flexShrink: 0,
        }} />
      )}
      <span style={{
        fontSize: isMain ? 13 : 12,
        fontWeight: isMain ? 700 : 600,
        color: isMain ? "#1558a0" : "#4a6080",
        letterSpacing: 0.1,
      }}>
        {label}
      </span>
    </div>
  );
}

function SectionHeaderRow({ section, secWeight, onSectionWeightChange }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(secWeight));

  useEffect(() => {
    if (!editing) setDraft(String(secWeight));
  }, [secWeight, editing]);

  const commit = () => { setEditing(false); onSectionWeightChange(draft); };

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
            type="number" value={draft} min={0} max={100} autoFocus
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
            {secWeight}%
          </div>
        )}
      </div>

      <div style={{ gridColumn: "4 / 11" }} />
    </div>
  );
}

function ScoreRow({ item, weight, selected, note, onSelect, onNote, onWeightChange, shaded }) {
  const levelValues = item.levelValues || [1, 2, 3, 4, 5];
  const maxLv       = Math.max(...levelValues);
  const rowScore    = selected ? ((selected / maxLv) * weight).toFixed(2) : "—";
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(weight));

  useEffect(() => { if (!editing) setDraft(String(weight)); }, [weight, editing]);
  const commit = () => { setEditing(false); onWeightChange(draft); };

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
        padding: "14px 4px", textAlign: "center", fontSize: 12,
        fontWeight: 800, color: "#1a6b1a", letterSpacing: 0.3,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRight: "1px solid #e8ece8",
      }}>
        {item.no}
      </div>

      <div style={{
        padding: "12px 10px", fontSize: 13, lineHeight: 1.7,
        color: "#1a1a1a",
        display: "flex", flexDirection: "column", justifyContent: "center",
        borderRight: "1px solid #e8ece8",
      }}>
        {item.calcType === "capital-ratio" ? (() => {
          const lines = item.title.split("\n");
          const instr = lines.pop();
          return (
            <>
              <span style={{ fontWeight: 500, whiteSpace: "pre-line" }}>{lines.join("\n")}</span>
              <span style={{
                display: "inline-block", marginTop: 7,
                background: "#fff3e0", border: "2px solid #fb8c00",
                borderLeft: "5px solid #e65100",
                borderRadius: 6, padding: "6px 12px",
                fontSize: 12, color: "#bf360c", fontWeight: 700,
                lineHeight: 1.5,
              }}>
                {instr}
              </span>
            </>
          );
        })() : (
          <span style={{ fontWeight: 500, whiteSpace: "pre-line" }}>{item.title}</span>
        )}
        {item.calcType === "capital-ratio" && (
          <CapitalRatioCalc item={item} selected={selected} onSelect={onSelect} />
        )}
      </div>

      <div style={{ padding: "8px 4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {editing ? (
          <input
            type="number" value={draft} min={0} max={100} autoFocus
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
            title="คลิกเพื่อแก้ไข"
            style={{
              fontSize: 13, fontWeight: 700, color: "#1a6b1a",
              border: "1.5px dashed #a5d6a7", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f5e9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {weight}%
          </div>
        )}
      </div>

      {item.calcType === "capital-ratio"
        ? [1, 2, 3, 4, 5].map((lv) => {
            const isSelected = selected === lv;
            return (
              <div key={lv} title="ใช้ปุ่มคำนวณ เพื่อเลือก Level" style={{
                padding: "8px 5px", cursor: "not-allowed",
                background: isSelected ? LEVEL_COLORS[lv - 1] + "22" : "#f7f7f7",
                border: `2px solid ${isSelected ? LEVEL_COLORS[lv - 1] : "#e4e4e4"}`,
                borderRadius: 7, margin: "6px 3px",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isSelected ? `0 1px 5px ${LEVEL_COLORS[lv - 1]}40` : "none",
              }}>
                <div style={{
                  fontSize: 12, lineHeight: 1.5, textAlign: "center",
                  color: isSelected ? "#1a1a1a" : "#aaa",
                  whiteSpace: "pre-line", wordBreak: "break-word",
                  fontWeight: isSelected ? 700 : 400,
                }}>
                  {item.levels[lv - 1]}
                </div>
              </div>
            );
          })
        : [1, 2, 3, 4, 5].map((lv) => {
            const available  = levelValues.includes(lv);
            const descIdx    = levelValues.indexOf(lv);
            const isSelected = selected === lv;
            return (
              <div
                key={lv}
                onClick={() => available && onSelect(lv)}
                style={{
                  padding: "8px 5px",
                  cursor: available ? "pointer" : "default",
                  background: isSelected ? LEVEL_COLORS[lv - 1] + "22" : available ? "#fafafa" : "#f5f5f5",
                  border: `2px solid ${isSelected ? LEVEL_COLORS[lv - 1] : available ? "#e0e0e0" : "transparent"}`,
                  borderRadius: 7, margin: "6px 3px",
                  opacity: available ? 1 : 0.12,
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isSelected ? `0 1px 5px ${LEVEL_COLORS[lv - 1]}40` : "none",
                }}
                onMouseEnter={(e) => { if (available && !isSelected) e.currentTarget.style.background = LEVEL_COLORS[lv - 1] + "18"; }}
                onMouseLeave={(e) => { if (available && !isSelected) e.currentTarget.style.background = "#fafafa"; }}
              >
                {available && (
                  <div style={{
                    fontSize: 12, lineHeight: 1.5, textAlign: "center",
                    color: "#1a1a1a",
                    whiteSpace: "pre-line", wordBreak: "break-word",
                    fontWeight: isSelected ? 700 : 400,
                  }}>
                    {item.levels[descIdx]}
                  </div>
                )}
              </div>
            );
          })
      }

      <div style={{
        padding: "12px 4px", textAlign: "center", fontSize: 15, fontWeight: 800,
        color: selected ? "#1a6b1a" : "#ccc",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderLeft: "1px solid #e8ece8",
      }}>
        {rowScore}
      </div>

      <div style={{ padding: "6px 6px", display: "flex", alignItems: "center" }}>
        <NoteCell itemNo={item.no} value={note} onChange={onNote} />
      </div>
    </div>
  );
}

// ---- Mobile-only equivalents of TableHeader/SectionHeaderRow/DividerRow/
// ScoreRow — the desktop versions are a 10-column CSS grid that has no
// room to breathe below ~700px (each column collapses to a few px wide).
// These reuse the exact same props/handlers, just render as stacked
// cards/lists instead of grid columns, and show level descriptions as a
// vertical selectable list instead of 5 side-by-side slivers.
function SectionHeaderMobile({ section, secWeight, onSectionWeightChange }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(secWeight));
  useEffect(() => { if (!editing) setDraft(String(secWeight)); }, [secWeight, editing]);
  const commit = () => { setEditing(false); onSectionWeightChange(draft); };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      background: "linear-gradient(90deg,#1a6b1a,#2e7d32)", color: "#fff",
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>{section.section}</div>
      {editing ? (
        <input
          type="number" value={draft} min={0} max={100} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          style={{
            width: 54, textAlign: "center", fontSize: 13, fontWeight: 700,
            border: "2px solid #fff", borderRadius: 6, padding: "4px 2px",
            outline: "none", background: "rgba(255,255,255,0.2)", color: "#fff", flexShrink: 0,
          }}
        />
      ) : (
        <div
          onClick={() => { setDraft(String(secWeight)); setEditing(true); }}
          style={{
            fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
            border: "1.5px dashed rgba(255,255,255,0.6)", borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
          }}
        >
          {secWeight}%
        </div>
      )}
    </div>
  );
}

function DividerMobile({ label, level }) {
  const isMain = level === 1;
  return (
    <div style={{
      background: isMain ? "#f0f4fa" : "#f7f9fc",
      borderTop: isMain ? "1.5px solid #b8cce4" : "1px solid #dde6f0",
      borderBottom: isMain ? "1.5px solid #b8cce4" : "1px solid #dde6f0",
      padding: isMain ? "8px 14px" : "6px 22px",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {isMain && <span style={{ width: 3, height: 14, background: "#1558a0", borderRadius: 2, flexShrink: 0 }} />}
      <span style={{ fontSize: isMain ? 13 : 12, fontWeight: isMain ? 700 : 600, color: isMain ? "#1558a0" : "#4a6080" }}>
        {label}
      </span>
    </div>
  );
}

function ScoreCardMobile({ item, weight, selected, note, onSelect, onNote, onWeightChange, shaded }) {
  const levelValues = item.levelValues || [1, 2, 3, 4, 5];
  const maxLv       = Math.max(...levelValues);
  const rowScore    = selected ? ((selected / maxLv) * weight).toFixed(2) : "—";
  const isCalc      = item.calcType === "capital-ratio";
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(weight));
  useEffect(() => { if (!editing) setDraft(String(weight)); }, [weight, editing]);
  const commit = () => { setEditing(false); onWeightChange(draft); };

  const titleLines = isCalc ? item.title.split("\n") : null;
  const calcInstr   = isCalc ? titleLines.pop() : null;

  return (
    <div style={{
      borderTop: "1px solid #e8ece8", padding: "14px 14px 12px",
      background: selected ? (shaded ? "#f0faf0" : "#f6fcf6") : (shaded ? "#f8faf8" : "#fff"),
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#1a6b1a" }}>ข้อ {item.no}</span>
        {editing ? (
          <input
            type="number" value={draft} min={0} max={100} autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            style={{
              width: 54, textAlign: "center", fontSize: 13, fontWeight: 700,
              border: "2px solid #2e7d32", borderRadius: 6, padding: "4px 2px",
              outline: "none", color: "#1a6b1a", flexShrink: 0,
            }}
          />
        ) : (
          <div
            onClick={() => { setDraft(String(weight)); setEditing(true); }}
            style={{
              fontSize: 12.5, fontWeight: 700, color: "#1a6b1a", flexShrink: 0,
              border: "1.5px dashed #a5d6a7", borderRadius: 6, padding: "3px 9px", cursor: "pointer",
            }}
          >
            {weight}%
          </div>
        )}
      </div>

      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "#1a1a1a", marginBottom: 10, whiteSpace: "pre-line" }}>
        {isCalc ? titleLines.join("\n") : item.title}
      </div>
      {isCalc && (
        <div style={{
          marginBottom: 10, background: "#fff3e0", border: "2px solid #fb8c00", borderLeft: "5px solid #e65100",
          borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#bf360c", fontWeight: 700, lineHeight: 1.5,
        }}>
          {calcInstr}
        </div>
      )}
      {isCalc && <CapitalRatioCalc item={item} selected={selected} onSelect={onSelect} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((lv) => {
          const available  = levelValues.includes(lv);
          if (!available) return null;
          const descIdx    = levelValues.indexOf(lv);
          const isSelected  = selected === lv;
          const clickable   = !isCalc && available;
          return (
            <div
              key={lv}
              onClick={() => clickable && onSelect(lv)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "8px 10px", cursor: clickable ? "pointer" : "default",
                background: isSelected ? LEVEL_COLORS[lv - 1] + "1c" : "#fafafa",
                border: `1.5px solid ${isSelected ? LEVEL_COLORS[lv - 1] : "#e0e0e0"}`,
                borderRadius: 8,
              }}
            >
              <span style={{
                background: LEVEL_COLORS[lv - 1], color: "#fff", borderRadius: "50%",
                width: 20, height: 20, flexShrink: 0, fontSize: 11, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
              }}>
                {lv}
              </span>
              <span style={{
                fontSize: 12.5, lineHeight: 1.5, color: isSelected ? "#1a1a1a" : "#555",
                fontWeight: isSelected ? 700 : 400, whiteSpace: "pre-line", wordBreak: "break-word",
              }}>
                {item.levels[descIdx]}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#718096" }}>คะแนนที่ได้</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: selected ? "#1a6b1a" : "#ccc" }}>{rowScore}</span>
      </div>

      <NoteCell itemNo={item.no} value={note} onChange={onNote} />
    </div>
  );
}

// ---- CapitalRatioCalc: popup calculator สำหรับข้อ 4.3 / 5.3 -------------------
function CapitalRatioCalc({ item, selected, onSelect }) {
  const [open,     setOpen]     = useState(false);
  const [capital,  setCapital]  = useState("");
  const [value,    setValue]    = useState("");
  const [numContracts, setNumContracts] = useState("");

  const ratio = (() => {
    const c = parseFloat(capital);
    const v = parseFloat(value);
    const n = parseFloat(numContracts);
    if (!c || !v || !n || n === 0) return null;
    return c / (v / n);
  })();

  const calcLevel = (r) => {
    if (r === null) return null;
    const t = item.calcThresholds; // [t0, t1, t2, t3] → L1 if r<t0, L2 if r<t1, ...
    if (r < t[0]) return 1;
    if (r < t[1]) return 2;
    if (r < t[2]) return 3;
    if (r < t[3]) return 4;
    return 5;
  };

  const autoLevel = calcLevel(ratio);

  const confirm = () => {
    if (autoLevel) { onSelect(autoLevel); setOpen(false); }
  };

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter") confirm(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, autoLevel]);

  const levelColor = autoLevel ? LEVEL_COLORS[autoLevel - 1] : "#ccc";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="เปิดเครื่องคำนวณ Capital Ratio"
        style={{
          marginTop: 6, fontSize: 11, padding: "3px 10px", borderRadius: 20,
          border: "1.5px solid #1565c0", background: selected ? "#e3f2fd" : "#f0f4ff",
          color: "#1565c0", cursor: "pointer", fontFamily: "Sarabun, sans-serif",
          fontWeight: 600, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#bbdefb")}
        onMouseLeave={(e) => (e.currentTarget.style.background = selected ? "#e3f2fd" : "#f0f4ff")}
      >
        🧮 คำนวณ Capital Ratio {selected ? `(L${selected})` : ""}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: "fixed", inset: 0, zIndex: 9990,
            background: "rgba(0,0,0,0.45)",
          }} />
          <div style={{
            position: "fixed", zIndex: 9991,
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(480px, 92vw)",
            background: "#fff", borderRadius: 14,
            boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
            overflow: "hidden", fontFamily: "Sarabun, sans-serif",
          }}>
            {/* header */}
            <div style={{ background: "#1565c0", color: "#fff", padding: "14px 20px" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>🧮 คำนวณ Capital Ratio — ข้อ {item.no}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                สูตร: ทุนจดทะเบียน ÷ (มูลค่างาน ÷ จำนวนงาน)
              </div>
            </div>

            {/* inputs */}
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "(1) ทุนจดทะเบียน (บาท)", val: capital,      set: setCapital },
                { label: "(2) มูลค่างานรวม (บาท)",  val: value,        set: setValue },
                { label: "(3) จำนวนงาน (สัญญา)",    val: numContracts, set: setNumContracts },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 6 }}>{label}</div>
                  <input
                    type="number"
                    min={0}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder="0"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      fontSize: 15, padding: "10px 12px",
                      border: "1.5px solid #90caf9", borderRadius: 8,
                      outline: "none", fontFamily: "Sarabun, sans-serif",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#1565c0")}
                    onBlur={(e)  => (e.target.style.borderColor = "#90caf9")}
                  />
                </div>
              ))}

              {/* result box */}
              <div style={{
                background: autoLevel ? levelColor + "18" : "#f5f5f5",
                border: `2px solid ${autoLevel ? levelColor : "#e0e0e0"}`,
                borderRadius: 10, padding: "14px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ratio = (1) ÷ [(2) ÷ (3)]</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: autoLevel ? levelColor : "#aaa" }}>
                    {ratio !== null ? ratio.toFixed(3) + "x" : "—"}
                  </div>
                </div>
                {autoLevel && (
                  <div style={{
                    textAlign: "center",
                    background: levelColor, color: "#fff",
                    borderRadius: 10, padding: "8px 18px",
                    boxShadow: `0 2px 12px ${levelColor}66`,
                  }}>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>ระดับที่ได้</div>
                    <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>L{autoLevel}</div>
                    <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{item.levels[autoLevel - 1]}</div>
                  </div>
                )}
              </div>
            </div>

            {/* footer */}
            <div style={{ padding: "0 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "#f5f5f5", color: "#555", border: "1.5px solid #d0d0d0",
                  borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "Sarabun, sans-serif",
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirm}
                disabled={!autoLevel}
                style={{
                  background: autoLevel ? "#1565c0" : "#bbb", color: "#fff", border: "none",
                  borderRadius: 8, padding: "10px 28px", fontSize: 14, fontWeight: 700,
                  cursor: autoLevel ? "pointer" : "not-allowed", fontFamily: "Sarabun, sans-serif",
                }}
              >
                ใช้ Level {autoLevel ?? "?"} ✓
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---- MissingScoresModal -------------------------------------------------------
function MissingScoresModal({ items, criteria, answered, total, onClose }) {
  const missingNos = new Set(items.map((i) => i.no));

  return (
    <>
      <style>{`
        @keyframes _missIn {
          from { opacity: 0; transform: translate(-50%, -54%) scale(0.92); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes _missOverlay { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.52)",
          animation: "_missOverlay 0.18s ease",
        }}
      />

      {/* Modal card */}
      <div style={{
        position: "fixed", zIndex: 9999,
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(520px, 94vw)",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 28px 72px rgba(0,0,0,0.30)",
        overflow: "hidden",
        fontFamily: "Sarabun, sans-serif",
        animation: "_missIn 0.22s cubic-bezier(.34,1.3,.64,1)",
      }}>

        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #b71c1c, #e53935)",
          padding: "18px 22px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}><AlertTriangle size={22} color="#fff" /></div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: 0.3 }}>
              ประเมินยังไม่ครบ
            </div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 }}>
              กรุณาให้คะแนนทุกหัวข้อก่อนส่งผลการประเมิน
            </div>
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <div style={{
              background: "rgba(255,255,255,0.22)", borderRadius: 10,
              padding: "6px 14px", textAlign: "center",
            }}>
              <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                {items.length}
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10 }}>หัวข้อที่ขาด</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ padding: "14px 22px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 6 }}>
            <span>ความคืบหน้าการประเมิน</span>
            <span style={{ fontWeight: 700, color: answered === total ? "#2e7d32" : "#e53935" }}>
              {answered} / {total} หัวข้อ
            </span>
          </div>
          <div style={{ height: 8, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: answered === total ? "#2e7d32" : "linear-gradient(90deg,#e53935,#ff7043)",
              width: `${total > 0 ? (answered / total) * 100 : 0}%`,
              transition: "width 0.4s",
            }} />
          </div>
        </div>

        {/* Missing items list — grouped by section */}
        <div style={{ padding: "14px 22px 4px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8 }}>
            หัวข้อที่ยังไม่ได้ให้คะแนน:
          </div>
          <div style={{
            maxHeight: 280, overflowY: "auto",
            border: "1.5px solid #fce4e4", borderRadius: 10,
            background: "#fff8f8",
          }}>
            {criteria.map((section, si) => {
              const sectionMissing = section.items.filter(
                (i) => !i.divider && missingNos.has(i.no)
              );
              if (sectionMissing.length === 0) return null;

              const sectionLabel = section.section.replace(/^\d+\.\s*/, "").split("/")[0].trim();
              return (
                <div key={si}>
                  {/* Section sub-header */}
                  <div style={{
                    padding: "8px 14px",
                    background: "#fdecea",
                    borderBottom: "1px solid #fce4e4",
                    fontSize: 12, fontWeight: 700, color: "#c62828",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{
                      background: "#e53935", color: "#fff",
                      borderRadius: 4, padding: "1px 7px", fontSize: 11,
                    }}>
                      {si + 1}
                    </span>
                    {sectionLabel}
                    <span style={{
                      marginLeft: "auto", background: "#c62828", color: "#fff",
                      borderRadius: 99, padding: "1px 8px", fontSize: 10, fontWeight: 700,
                    }}>
                      ขาด {sectionMissing.length}
                    </span>
                  </div>

                  {/* Items */}
                  {sectionMissing.map((item, idx) => (
                    <div
                      key={item.no}
                      style={{
                        padding: "9px 14px",
                        borderBottom: idx < sectionMissing.length - 1 ? "1px solid #fce4e4" : "none",
                        display: "flex", alignItems: "flex-start", gap: 10,
                        background: idx % 2 === 0 ? "#fff8f8" : "#fff",
                      }}
                    >
                      <span style={{
                        background: "#e53935", color: "#fff",
                        borderRadius: 6, padding: "2px 8px",
                        fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
                      }}>
                        {item.no}
                      </span>
                      <span style={{
                        fontSize: 12, color: "#444", lineHeight: 1.5,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 22px 20px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "linear-gradient(135deg, #b71c1c, #e53935)",
              color: "#fff", border: "none", borderRadius: 10,
              padding: "11px 32px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "Sarabun, sans-serif",
              boxShadow: "0 4px 14px rgba(229,57,53,0.4)",
              letterSpacing: 0.3,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            ปิดและแก้ไข
          </button>
        </div>
      </div>
    </>
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
              <span style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <FileText size={16} /> หมายเหตุ — ข้อ {itemNo}
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
