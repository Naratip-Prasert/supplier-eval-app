// ============================================================
//  app/(app)/service-eval/supplier-mock/page.tsx
//  MOCK ONLY — preview of what "Supplier → Buyer/User" satisfaction
//  scoring could look like, built from Satisfaction Form_Draft.xlsx's
//  "Supplier --> Buyer and User" sheet. Fully clickable (local state,
//  live score/grade preview) but does NOT call any backend endpoint —
//  the real submit path for this direction already exists at
//  /supplier-feedback/[token] (token-based, no login) using the older
//  4-item "SVC" criteria; this page is just for reviewing the redesign
//  before deciding whether to wire it up for real.
// ============================================================
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { Check, FlaskConical } from "lucide-react";
import { LEVEL_COLORS, getGrade, GRADE_MAP } from "@/constants";
import mockData from "@/data/supplierToBuyerMock.json";

const LEVEL_SHORT_LABELS = ["ต้องปรับปรุง", "ต่ำกว่าเกณฑ์", "ผ่านเกณฑ์", "ดี", "ดีเยี่ยม"];
const FONT = "Sarabun, sans-serif";

interface MockItem { code: string; nameTh: string; defaultWeight: number; levels: string[]; }
interface MockSection { nameTh: string; totalWeight: number; items: MockItem[]; }
interface ItemScore { score?: number; note?: string; }

const sections = mockData as MockSection[];

function LevelCard({ level, label, desc, selected, onClick }: {
  level: number; label: string; desc: string; selected: boolean; onClick: () => void;
}) {
  const color = LEVEL_COLORS[level - 1];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "1 1 160px", minWidth: 140, textAlign: "left", cursor: "pointer",
        borderRadius: 10, padding: "10px 12px",
        border: selected ? `2px solid ${color}` : "1.5px solid #e2e8e2",
        background: selected ? `${color}22` : "#fff",
        fontFamily: FONT, display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 20, height: 20, borderRadius: "50%", background: color, color: "#fff",
          fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{level}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{label}</span>
      </span>
      {desc && <span style={{ fontSize: 11.5, color: "#666", lineHeight: 1.4 }}>{desc}</span>}
    </button>
  );
}

function ItemRow({ item, value, onChange }: {
  item: MockItem; value: ItemScore | undefined; onChange: (v: ItemScore) => void;
}) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid #eef2ee" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222" }}>
          <span style={{ color: "#888", fontWeight: 600, marginRight: 6 }}>{item.code}</span>
          {item.nameTh}
        </div>
        <div style={{
          flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#6a1b9a",
          background: "#f3e8fd", borderRadius: 20, padding: "2px 10px", height: "fit-content",
        }}>
          {item.defaultWeight.toFixed(2)}%
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[1, 2, 3, 4, 5].map(lv => (
          <LevelCard
            key={lv}
            level={lv}
            label={LEVEL_SHORT_LABELS[lv - 1]}
            desc={item.levels[lv - 1] ?? ""}
            selected={value?.score === lv}
            onClick={() => onChange({ ...value, score: lv })}
          />
        ))}
      </div>

      <input
        value={value?.note ?? ""}
        onChange={e => onChange({ ...value, note: e.target.value })}
        placeholder="หมายเหตุ (ถ้ามี)"
        style={{
          marginTop: 8, width: "100%", fontSize: 12.5, padding: "7px 10px",
          borderRadius: 7, border: "1px solid #e2e8e2", outline: "none",
          fontFamily: FONT, boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export default function SupplierToBuyerMockPage() {
  const router = useRouter();
  const { user: authUser, profilePic, logout } = useAuth();
  const [scores, setScores] = useState<Record<string, ItemScore>>({});
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [showSubmitted, setShowSubmitted] = useState(false);

  const allItems = useMemo(() => sections.flatMap(s => s.items), []);
  const answered = allItems.filter(it => scores[it.code]?.score != null).length;
  const total = allItems.length;

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

  const handleLogout = async () => { await logout(); router.push("/login"); };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: FONT, paddingBottom: 76 }}>
      <Header
        subtitle="ประเมิน Buyer โดย Supplier — ตัวอย่าง (Mock)"
        backLabel="กลับ"
        onBack={() => router.push("/service-eval")}
        user={authUser}
        onLogout={handleLogout}
        profilePic={profilePic}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, background: "#fff3e0",
          border: "1.5px solid #ffcc80", borderRadius: 12, padding: "12px 16px", marginBottom: 16,
        }}>
          <FlaskConical size={18} style={{ color: "#e65100", flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: "#7a4a00" }}>
            <b>หน้าตัวอย่าง (Mock)</b> — คลิกให้คะแนนได้จริงเพื่อดูหน้าตา แต่กด &quot;บันทึกคะแนน&quot; แล้ว
            <b> จะไม่ถูกส่งเข้าระบบจริง</b> ใช้สำหรับรีวิวดีไซน์ก่อนตัดสินใจสร้างจริงเท่านั้น
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>ABC Supply Co., Ltd.</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>ให้คะแนนเจ้าหน้าที่จัดซื้อ (Buyer): System Administrator — ตัวอย่างข้อมูล</div>
        </div>

        {sections.map(sec => (
          <div key={sec.nameTh} style={{ background: "#fff", borderRadius: 14, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{
              background: "#f3e8fd", padding: "10px 18px", display: "flex",
              justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#6a1b9a" }}>{sec.nameTh}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6a1b9a" }}>{sec.totalWeight.toFixed(2)}%</span>
            </div>
            <div style={{ padding: "0 18px" }}>
              {sec.items.map(item => (
                <ItemRow
                  key={item.code}
                  item={item}
                  value={scores[item.code]}
                  onChange={v => setScores(prev => ({ ...prev, [item.code]: v }))}
                />
              ))}
            </div>
          </div>
        ))}

        <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6 }}>
            จุดเด่นที่ควรรักษาไว้ <span style={{ fontWeight: 400, color: "#999" }}>(Strengths)</span>
          </div>
          <textarea
            value={strengths} onChange={e => setStrengths(e.target.value)}
            rows={3}
            style={{ width: "100%", fontSize: 13, padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8e2", outline: "none", fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: "14px 0 6px" }}>
            สิ่งที่ควรปรับปรุง <span style={{ fontWeight: 400, color: "#999" }}>(Areas for Improvement)</span>
          </div>
          <textarea
            value={improvements} onChange={e => setImprovements(e.target.value)}
            rows={3}
            style={{ width: "100%", fontSize: 13, padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8e2", outline: "none", fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        {showSubmitted && (
          <div style={{ color: "#1b5e20", background: "#eaf5ea", border: "1.5px solid #a5d6a7", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            ✓ (จำลอง) บันทึกคะแนนเรียบร้อย — ข้อมูลนี้ไม่ได้ถูกส่งเข้าระบบจริง
          </div>
        )}

        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
          borderTop: "1.5px solid #e2e8e2", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
          padding: "10px 20px", display: "flex", alignItems: "center", gap: 16, zIndex: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: "#888", marginBottom: 3 }}>ตอบแล้ว {answered}/{total} ข้อ</div>
            <div style={{ height: 6, background: "#e8efe8", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${total > 0 ? (answered / total) * 100 : 0}%`, background: "#6a1b9a", borderRadius: 99, transition: "width .2s" }} />
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
            onClick={() => setShowSubmitted(true)}
            disabled={answered !== total}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
              padding: "11px 22px", borderRadius: 8, border: "none",
              background: answered !== total ? "#9e9e9e" : "#6a1b9a",
              color: "#fff", fontWeight: 700, fontSize: 13.5,
              cursor: answered !== total ? "not-allowed" : "pointer",
              fontFamily: FONT,
            }}
          >
            <Check size={15} />
            บันทึกคะแนน (จำลอง)
          </button>
        </div>
      </div>
    </div>
  );
}
