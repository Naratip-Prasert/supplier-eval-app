// ============================================================
//  pages/ServiceEvalPage.jsx
//  Cross-eval #4 (database/CROSS_EVALUATION_SPEC.md): the USER
//  rates the Buyer (GCP) they worked with on a completed supplier
//  session. Normal authenticated flow — reuses the existing USER
//  login, no new role.
// ============================================================
import { useState, useEffect } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import { Star } from "lucide-react";

function ScorePicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            width: 34, height: 34, borderRadius: 8,
            border: value === n ? "none" : "1.5px solid #cfd8cf",
            background: value === n ? "#ef6c00" : "#fff",
            color: value === n ? "#fff" : "#333",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "Sarabun, sans-serif",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function ServiceEvalPage({ authUser, profilePic, onBack, onLogout }) {
  const [pending, setPending]   = useState(null); // null = loading
  const [criteria, setCriteria] = useState([]);
  const [selected, setSelected] = useState(null); // the pending item being rated
  const [scores, setScores]     = useState({});
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
      .then(data => setCriteria(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const openForm = (item) => {
    setSelected(item);
    setScores({});
    setError("");
  };

  const allScored = criteria.length > 0 && criteria.every(c => scores[c.code] != null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const scoresBody = Object.fromEntries(
        Object.entries(scores).map(([code, score]) => [code, { score }])
      );
      const res = await authFetch("/api/service-evaluations", {
        method: "POST",
        body: JSON.stringify({
          sessionId: selected.sessionId,
          targetEmployeeId: selected.targetEmployeeId,
          scores: scoresBody,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "บันทึกไม่สำเร็จ");
      setSelected(null);
      loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header
        subtitle="ประเมิน Buyer"
        backLabel="กลับ"
        onBack={selected ? () => setSelected(null) : onBack}
        user={authUser}
        onLogout={onLogout}
        profilePic={profilePic}
      />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 48px" }}>
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
                style={{
                  background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.06)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
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
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{selected.supplierName}</div>
              <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>ให้คะแนน Buyer: {selected.targetFullName}</div>
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              {criteria.map(c => (
                <div key={c.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, color: "#333", flex: 1 }}>{c.nameTh}</div>
                  <ScorePicker value={scores[c.code]} onChange={v => setScores(prev => ({ ...prev, [c.code]: v }))} />
                </div>
              ))}

              {error && <div style={{ color: "#c62828", fontSize: 13, marginBottom: 12 }}>{error}</div>}

              <button
                onClick={handleSubmit}
                disabled={!allScored || submitting}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 8, border: "none",
                  background: (!allScored || submitting) ? "#9e9e9e" : "#ef6c00",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: (!allScored || submitting) ? "not-allowed" : "pointer",
                  fontFamily: "Sarabun, sans-serif",
                }}
              >
                {submitting ? "กำลังบันทึก..." : "บันทึกคะแนน"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
