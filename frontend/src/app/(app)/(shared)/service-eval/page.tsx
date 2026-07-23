// ============================================================
//  app/(app)/service-eval/page.tsx
//  Cross-eval #4 (database/CROSS_EVALUATION_SPEC.md): the USER
//  rates the Buyer (GCP) they worked with on a completed supplier
//  session. Normal authenticated flow — reuses the existing USER
//  login, no new role.
//
//  Restyled to match EvalForm's visual language (colored 1-5 level
//  cards with description text, section grouping, sticky progress/
//  submit bar) — the old version was a flat 4-item list of plain
//  numbered buttons with no level descriptions and no section
//  structure, which looked and felt like a different, lesser app.
// ============================================================
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/api";
import { Star, Check } from "lucide-react";
import { LEVEL_COLORS, getGrade, GRADE_MAP } from "@/constants";

const LEVEL_LABELS = ["ต้องปรับปรุง (Unsatisfactory)", "ต่ำกว่าเกณฑ์ (Below Standard)", "ผ่านเกณฑ์ (Satisfactory)", "ดี (Good)", "ดีเยี่ยม (Excellent)"];
const LEGEND_HEIGHT = 46; // section headers stick just below this, see top offset below
const FONT = "Sarabun, sans-serif";

interface PendingItem {
  sessionId: string;
  targetEmployeeId: string;
  supplierName: string;
  targetFullName: string;
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

interface ItemScore {
  score?: number;
  note?: string;
}

// ── One selectable level card (1-5) inside an item row ──────────
// No short label text here (ต้องปรับปรุง/ต่ำกว่าเกณฑ์/...) — that's what
// the LEVEL legend pinned at the top of the page already covers; repeating
// it in all 80 cards (16 items × 5 levels) was just noise once that legend
// existed. Only the number badge + this item's own specific description
// remain, which is the part that actually differs card to card.
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

// ── One criterion row: name + weight + points earned + 5 level cards + note ─────
function ItemRow({ item, value, onChange, disabled }: {
  item: Criterion; value: ItemScore | undefined; onChange: (v: ItemScore) => void; disabled?: boolean;
}) {
  const answered = value?.score != null;
  const pointsEarned = answered ? (value!.score! / 5) * item.defaultWeight : null;
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
              background: LEVEL_COLORS[value!.score! - 1], borderRadius: 20, padding: "2px 10px",
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
            selected={value?.score === lv}
            onClick={() => !disabled && onChange({ ...value, score: lv })}
          />
        ))}
      </div>

      <input
        value={value?.note ?? ""}
        onChange={e => onChange({ ...value, note: e.target.value })}
        disabled={disabled}
        placeholder="หมายเหตุ (ถ้ามี)"
        style={{
          marginTop: 10, width: "100%", fontSize: 12.5, padding: "7px 10px",
          borderRadius: 7, border: "1px solid #e2e8e2", outline: "none",
          fontFamily: FONT, boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export default function ServiceEvalPage() {
  const router = useRouter();
  const { user: authUser, profilePic, logout } = useAuth();
  const [pending, setPending]   = useState<PendingItem[] | null>(null); // null = loading
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<PendingItem | null>(null); // the pending item being rated
  const [scores, setScores]     = useState<Record<string, ItemScore>>({});
  const [strengths, setStrengths]     = useState("");
  const [improvements, setImprovements] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  const loadPending = () => {
    authFetch("/api/service-evaluations/pending")
      .then(r => r.json())
      .then(data => setPending(Array.isArray(data) ? data : []))
      .catch(() => setPending([]));
  };

  useEffect(() => {
    loadPending();
    authFetch("/api/service-evaluations/criteria")
      .then(r => r.json())
      .then(data => setSections(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections]);
  const answered = allItems.filter(it => scores[it.code]?.score != null).length;
  const total    = allItems.length;
  const allScored = total > 0 && answered === total;

  const openForm = (item: PendingItem) => {
    setSelected(item);
    setScores({});
    setStrengths("");
    setImprovements("");
    setError("");
  };

  // Live preview only — the real score/grade is computed server-side on
  // submit (same weighting formula, see computeScoreAndGrade).
  const { previewScore, previewGrade } = useMemo(() => {
    let raw = 0, weightSum = 0;
    allItems.forEach(it => {
      weightSum += it.defaultWeight;
      const s = scores[it.code]?.score;
      if (s != null) raw += (s / 5) * it.defaultWeight;
    });
    const score = weightSum > 0 ? Math.round((raw / weightSum) * 100 * 100) / 100 : 0;
    return { previewScore: score, previewGrade: getGrade(score) };
  }, [allItems, scores]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const scoresBody = Object.fromEntries(
        Object.entries(scores).map(([code, v]) => [code, { score: v.score, note: v.note }])
      );
      const res = await authFetch("/api/service-evaluations", {
        method: "POST",
        body: JSON.stringify({
          sessionId: selected.sessionId,
          targetEmployeeId: selected.targetEmployeeId,
          scores: scoresBody,
          strengths, improvements,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "บันทึกไม่สำเร็จ");
      setSelected(null);
      loadPending();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => { await logout(); router.push("/login"); };

  return (
    <div style={{ minHeight: "100vh", background: "#f6fbf6", fontFamily: FONT, paddingBottom: selected ? 76 : 0 }}>
      <Header
        subtitle="ประเมิน Buyer"
        backLabel="กลับ"
        onBack={selected ? () => setSelected(null) : () => router.push("/portal")}
        user={authUser}
        onLogout={handleLogout}
        profilePic={profilePic}
      />

      {/* 3 columns (not 5) now that cards/text are bigger — 5-across left
          too little width per card once padding/font grew, forcing awkward
          wrapping inside each box. 3-across gives each level room to
          breathe; still reads top-to-bottom, left-to-right in order. */}
      <style>{`
        .svc-level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 900px) {
          .svc-level-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .svc-level-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: selected ? 1100 : 640, margin: "0 auto", padding: "24px 20px 48px" }}>
        {!selected ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 16 }}>
              รายการที่รอให้คะแนน
            </div>

            {pending === null && (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด...</div>
            )}

            {pending?.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>
                <Star size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div>ไม่มีรายการที่ต้องประเมินตอนนี้</div>
              </div>
            )}

            {pending?.map(item => (
              <div
                key={item.sessionId}
                onClick={() => openForm(item)}
                className="svc-pending-card"
                style={{
                  background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.06)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  transition: "transform .12s, box-shadow .12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.10)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"; }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#333" }}>{item.supplierName}</div>
                  <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>Buyer: {item.targetFullName}</div>
                </div>
                <div style={{
                  background: "#fff3e0", color: "#ef6c00", borderRadius: 20,
                  padding: "6px 14px", fontSize: 12.5, fontWeight: 700,
                }}>
                  ให้คะแนน
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{
              background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)",
              borderRadius: 16, padding: "20px 24px", marginBottom: 16,
              boxShadow: "0 6px 20px rgba(27,94,32,0.24)",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                flexShrink: 0, width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Star size={22} style={{ color: "#fff" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 600, marginBottom: 3 }}>
                  กำลังประเมิน Supplier
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>
                  {selected.supplierName}
                </div>
                <div style={{ fontSize: 13.5, color: "#fff", marginTop: 4, fontWeight: 600 }}>
                  ให้คะแนน Buyer: <span style={{ fontWeight: 800 }}>{selected.targetFullName}</span>
                </div>
              </div>
            </div>

            {/* Level legend — pinned above the section headers (which stick
                just below it, see LEGEND_HEIGHT) so the color/number key is
                always visible while scrolling through 16 items, not just
                readable once at the very top of the page. */}
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

            {sections.map((sec, si) => {
              const secAnswered = sec.items.filter(it => scores[it.code]?.score != null).length;
              // overflow:hidden here (previously used to clip the header's
              // square corners into the card's rounded ones) breaks
              // position:sticky below — a clipping ancestor stops the
              // browser from ever computing a "stuck" state, same issue
              // fixed on the main EvalForm table header. Border-radius
              // stays for the card's own edges; the header rounds its own
              // top corners instead.
              return (
              <div key={sec.id} style={{ background: "#fff", borderRadius: 14, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                <div style={{
                  background: "#eaf5ea", padding: "10px 18px", display: "flex",
                  justifyContent: "space-between", alignItems: "center", gap: 10,
                  position: "sticky", top: LEGEND_HEIGHT, zIndex: 5,
                  borderTopLeftRadius: 14, borderTopRightRadius: 14,
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
                      value={scores[item.code]}
                      onChange={v => setScores(prev => ({ ...prev, [item.code]: v }))}
                      disabled={submitting}
                    />
                  ))}
                </div>
              </div>
              );
            })}

            <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6 }}>
                จุดเด่นที่ควรรักษาไว้ <span style={{ fontWeight: 400, color: "#999" }}>(Strengths)</span>
              </div>
              <textarea
                value={strengths} onChange={e => setStrengths(e.target.value)} disabled={submitting}
                rows={3}
                style={{ width: "100%", fontSize: 13, padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8e2", outline: "none", fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: "14px 0 6px" }}>
                สิ่งที่ควรปรับปรุง <span style={{ fontWeight: 400, color: "#999" }}>(Areas for Improvement)</span>
              </div>
              <textarea
                value={improvements} onChange={e => setImprovements(e.target.value)} disabled={submitting}
                rows={3}
                style={{ width: "100%", fontSize: 13, padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8e2", outline: "none", fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
              />
            </div>

            {error && <div style={{ color: "#c62828", fontSize: 13, marginBottom: 12 }}>{error}</div>}

            {/* Sticky progress + submit bar — mirrors EvalForm's bottom bar */}
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
              borderTop: "1.5px solid #e2e8e2", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
              padding: "10px 20px", display: "flex", alignItems: "center", gap: 16, zIndex: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: "#888", marginBottom: 3 }}>ตอบแล้ว {answered}/{total} ข้อ</div>
                <div style={{ height: 6, background: "#e8efe8", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${total > 0 ? (answered / total) * 100 : 0}%`, background: "#2e7d32", borderRadius: 99, transition: "width .2s" }} />
                </div>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{previewScore.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: "#999" }}>/100</div>
              </div>
              <div style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#fff",
                background: GRADE_MAP[previewGrade] ?? "#999",
              }}>{previewGrade}</div>
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
                {submitting ? "กำลังบันทึก..." : "บันทึกคะแนน"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
