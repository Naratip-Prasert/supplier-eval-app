// ============================================================
//  app/supplier-feedback/[token]/page.tsx
//  Public, unauthenticated page reached only via the one-time
//  magic-link emailed to a supplier after their session is
//  approved (database/CROSS_EVALUATION_SPEC.md, cross-eval #3).
//  No login, no sidebar — token in the URL is the only "auth".
//
//  Restyled to match /service-eval's visual language (colored 1-5
//  level cards with description text, section grouping, sticky
//  legend + progress/submit bar) instead of the old flat list of
//  plain numbered buttons — same criteria_set='service' data, so
//  there was no reason for a supplier and a USER rating the same
//  Buyer to see two differently-designed forms.
// ============================================================
"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { Logo } from "@/components";
import { authFetch } from "@/utils/api";
import { Check } from "lucide-react";
import { LEVEL_COLORS, getGrade, GRADE_MAP } from "@/constants";

const ROLE_LABEL: Record<string, string> = { USER: "ผู้ประเมิน (ฝ่ายใช้งาน)", GCP: "ผู้จัดซื้อ (Buyer)" };
const LEVEL_LABELS = ["ต้องปรับปรุง (Unsatisfactory)", "ต่ำกว่าเกณฑ์ (Below Standard)", "ผ่านเกณฑ์ (Satisfactory)", "ดี (Good)", "ดีเยี่ยม (Excellent)"];
const LEGEND_HEIGHT = 46;
const FONT = "Sarabun, sans-serif";

interface Target {
  employeeId: string;
  fullName: string;
  role: string;
}
interface Criterion {
  id: string;
  code: string;
  nameTh: string;
  defaultWeight: number;
  levels: string[];
}
interface Section {
  id: string;
  nameTh: string;
  totalWeight: number;
  items: Criterion[];
}
interface FeedbackData {
  supplierName: string;
  targets: Target[];
  sections: Section[];
}

// ── One selectable level card (1-5), same as service-eval's ────
function LevelCard({ level, desc, selected, onClick }: {
  level: number; desc: string; selected: boolean; onClick: () => void;
}) {
  const color = LEVEL_COLORS[level - 1];
  return (
    <button
      type="button"
      onClick={onClick}
      className="svc-level-card"
      style={{
        textAlign: "left", cursor: "pointer",
        borderRadius: 12, padding: "16px 18px",
        border: selected ? `2px solid ${color}` : "1.5px solid #e2e8e2",
        background: selected ? `${color}1f` : "#fff",
        fontFamily: FONT, display: "flex", flexDirection: "column", gap: 8,
        boxShadow: selected ? `0 2px 8px ${color}33` : "none",
        transition: "border-color .12s, background .12s, box-shadow .12s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = "#c3d3c3"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = "#e2e8e2"; }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: "50%", background: color, color: "#fff",
        fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{level}</span>
      {desc && <span style={{ fontSize: 14.5, color: "#3a3a3a", lineHeight: 1.6 }}>{desc}</span>}
    </button>
  );
}

// ── One criterion row for one target: name + weight + points + 5 level cards ─
function ItemRow({ item, value, onChange, disabled }: {
  item: Criterion; value: number | undefined; onChange: (v: number) => void; disabled?: boolean;
}) {
  const answered = value != null;
  const pointsEarned = answered ? (value! / 5) * item.defaultWeight : null;
  return (
    <div style={{
      padding: "14px 16px 16px", borderBottom: "1px solid #eef2ee",
      borderLeft: `3px solid ${answered ? "#2e7d32" : "transparent"}`,
      transition: "border-color .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222", lineHeight: 1.4 }}>
          <span style={{ color: "#888", fontWeight: 600, marginRight: 6 }}>{item.code}</span>
          {item.nameTh}
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {answered && (
            <span style={{
              fontSize: 11.5, fontWeight: 800, color: "#fff",
              background: LEVEL_COLORS[value! - 1], borderRadius: 20, padding: "2px 10px",
              whiteSpace: "nowrap",
            }}>
              ได้ {pointsEarned!.toFixed(2)}
            </span>
          )}
          <span style={{
            fontSize: 11.5, fontWeight: 700, color: "#2e7d32",
            background: "#eaf5ea", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
          }}>
            เต็ม {item.defaultWeight.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="svc-level-grid">
        {[1, 2, 3, 4, 5].map(lv => (
          <LevelCard
            key={lv}
            level={lv}
            desc={item.levels[lv - 1] ?? ""}
            selected={value === lv}
            onClick={() => !disabled && onChange(lv)}
          />
        ))}
      </div>
    </div>
  );
}

export default function SupplierFeedbackPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState]     = useState<"loading" | "error" | "ready" | "submitted">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData]       = useState<FeedbackData | null>(null);
  // Keyed by `${employeeId}:${code}` — one target's answer to one criterion.
  const [scores, setScores]   = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authFetch(`/api/public/supplier-eval/${token}`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || "เกิดข้อผิดพลาด");
        return body;
      })
      .then(d => { setData(d); setState("ready"); })
      .catch((err: Error) => { setErrorMsg(err.message); setState("error"); });
  }, [token]);

  const allItems = useMemo(() => data ? data.sections.flatMap(s => s.items) : [], [data]);
  const cellKey = (employeeId: string, code: string) => `${employeeId}:${code}`;
  const setScore = (employeeId: string, code: string, value: number) => {
    setScores(prev => ({ ...prev, [cellKey(employeeId, code)]: value }));
  };

  const totalCells = data ? data.targets.length * allItems.length : 0;
  const answeredCells = data
    ? data.targets.reduce((sum, t) => sum + allItems.filter(it => scores[cellKey(t.employeeId, it.code)] != null).length, 0)
    : 0;
  const allScored = totalCells > 0 && answeredCells === totalCells;

  // Live per-target preview only — the real score/grade is computed
  // server-side on submit (same weighting formula, see computeScoreAndGrade).
  const previewFor = (employeeId: string) => {
    let raw = 0, weightSum = 0;
    allItems.forEach(it => {
      weightSum += it.defaultWeight;
      const s = scores[cellKey(employeeId, it.code)];
      if (s != null) raw += (s / 5) * it.defaultWeight;
    });
    const score = weightSum > 0 ? Math.round((raw / weightSum) * 100 * 100) / 100 : 0;
    return { score, grade: getGrade(score) };
  };

  const handleSubmit = async () => {
    if (!data) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const ratings = data.targets.map(t => ({
        targetEmployeeId: t.employeeId,
        role: t.role,
        scores: Object.fromEntries(
          allItems.map(it => [it.code, { score: scores[cellKey(t.employeeId, it.code)] }])
        ),
      }));
      const res = await authFetch(`/api/public/supplier-eval/${token}`, {
        method: "POST",
        body: JSON.stringify({ ratings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "ส่งไม่สำเร็จ");
      setState("submitted");
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode, narrow = false) => (
    <div style={{ minHeight: "100vh", background: "#f6fbf6", fontFamily: FONT, paddingBottom: narrow ? 0 : 76 }}>
      <div style={{
        background: "linear-gradient(135deg, #14532d 0%, #1b5e20 55%, #2e7d32 100%)",
        padding: "18px 20px", display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
      }}>
        <Logo size={26} />
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "monospace" }}>SPES</span>
      </div>
      <style>{`
        .svc-level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 900px) {
          .svc-level-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .svc-level-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ maxWidth: narrow ? 560 : 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
        {children}
      </div>
    </div>
  );

  if (state === "loading") {
    return shell(<div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด...</div>, true);
  }

  if (state === "error") {
    return shell(
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#c62828", fontSize: 15, fontWeight: 700 }}>{errorMsg}</div>
      </div>,
      true
    );
  }

  if (state === "submitted") {
    return shell(
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ color: "#1b5e20", fontSize: 16, fontWeight: 700 }}>ขอบคุณสำหรับความคิดเห็นของท่าน</div>
      </div>,
      true
    );
  }

  if (!data) return null;

  return shell(
    <>
      {/* Intro banner — mirrors service-eval's "กำลังประเมิน Supplier" banner */}
      <div style={{
        background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 16,
        boxShadow: "0 6px 20px rgba(27,94,32,0.24)",
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 600, marginBottom: 3 }}>
          ขอความคิดเห็นเกี่ยวกับการให้บริการ
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>
          {data.supplierName}
        </div>
        <div style={{ fontSize: 13.5, color: "#fff", marginTop: 4 }}>
          กรุณาให้คะแนนการทำงานร่วมกับทีมงานที่ดูแลท่านด้านล่างนี้
        </div>
      </div>

      {/* Level legend — sticky, same as service-eval */}
      <div style={{
        position: "sticky", top: 0, zIndex: 6, height: LEGEND_HEIGHT,
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
        background: "#fff", borderRadius: 12, padding: "8px 14px", marginBottom: 14,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
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

      {/* One card per target (USER + GCP), each with its own section grid — a
          supplier rates both people from the same session in one sitting,
          unlike service-eval's one-target-per-submission flow. */}
      {data.targets.map(t => {
        const preview = previewFor(t.employeeId);
        return (
          <div key={t.employeeId} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "12px 18px", background: "#eaf5ea", borderRadius: "14px 14px 0 0",
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1b5e20" }}>{t.fullName}</div>
                <div style={{ fontSize: 12, color: "#5a7a5a" }}>{ROLE_LABEL[t.role] ?? t.role}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{preview.score.toFixed(1)}</div>
                  <div style={{ fontSize: 9.5, color: "#999" }}>/100</div>
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center",
                  justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#fff",
                  background: GRADE_MAP[preview.grade] ?? "#999",
                }}>{preview.grade}</div>
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: "0 0 14px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              {data.sections.map((sec, si) => {
                const secAnswered = sec.items.filter(it => scores[cellKey(t.employeeId, it.code)] != null).length;
                return (
                  <div key={sec.id}>
                    <div style={{
                      background: "#f4faf4", padding: "10px 18px", display: "flex",
                      justifyContent: "space-between", alignItems: "center", gap: 10,
                      position: "sticky", top: LEGEND_HEIGHT, zIndex: 5,
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <span style={{
                          flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "#1b5e20",
                          color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{si + 1}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1b5e20" }}>{sec.nameTh}</span>
                      </span>
                      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11.5, color: secAnswered === sec.items.length ? "#2e7d32" : "#888", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {secAnswered}/{sec.items.length} ข้อ
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", whiteSpace: "nowrap" }}>{sec.totalWeight.toFixed(2)}%</span>
                      </span>
                    </div>
                    <div style={{ padding: "0 18px" }}>
                      {sec.items.map(item => (
                        <ItemRow
                          key={item.code}
                          item={item}
                          value={scores[cellKey(t.employeeId, item.code)]}
                          onChange={v => setScore(t.employeeId, item.code, v)}
                          disabled={submitting}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {errorMsg && <div style={{ color: "#c62828", fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}

      {/* Sticky progress + submit bar — mirrors service-eval/EvalForm's bottom bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
        borderTop: "1.5px solid #e2e8e2", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 16, zIndex: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: "#888", marginBottom: 3 }}>ตอบแล้ว {answeredCells}/{totalCells} ข้อ</div>
          <div style={{ height: 6, background: "#e8efe8", borderRadius: 99 }}>
            <div style={{ height: "100%", width: `${totalCells > 0 ? (answeredCells / totalCells) * 100 : 0}%`, background: "#2e7d32", borderRadius: 99, transition: "width .2s" }} />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!allScored || submitting}
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
            padding: "11px 22px", borderRadius: 8, border: "none",
            background: (!allScored || submitting) ? "#9e9e9e" : "#ef6c00",
            color: "#fff", fontWeight: 700, fontSize: 13.5,
            cursor: (!allScored || submitting) ? "not-allowed" : "pointer",
            fontFamily: FONT,
          }}
        >
          <Check size={15} />
          {submitting ? "กำลังส่ง..." : "ส่งความคิดเห็น"}
        </button>
      </div>
    </>
  );
}
