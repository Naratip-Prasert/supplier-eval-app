import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, CheckCircle, RotateCcw, Clock, RefreshCw } from "lucide-react";
import { Header } from "../components";
import { authFetch } from "../utils/api";

const EVAL_TYPE_LABEL = {
  pre_eval:     "Pre-Evaluation",
  post_eval:    "Post 90 Days",
  half_year:    "Half-Year",
  yearly:       "Yearly",
};

const GRADE_COLOR = { A: "#1b5e20", B: "#1565c0", C: "#e65100", D: "#b71c1c", F: "#4a0000" };

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function SupervisorPage({ authUser, onBack }) {
  const [tab,     setTab]     = useState("queue");
  const [queue,   setQueue]   = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [selected,  setSelected]  = useState(null); // session being reviewed
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [qRes, hRes] = await Promise.all([
        authFetch("/api/supervisor/queue").then(r => r.json()),
        authFetch("/api/supervisor/history").then(r => r.json()),
      ]);
      setQueue(Array.isArray(qRes) ? qRes : []);
      setHistory(Array.isArray(hRes) ? hRes : []);
    } catch { setError("โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDecision(sessionId, action) {
    if (action === "return" && !notes.trim()) {
      alert("กรุณาระบุหมายเหตุสำหรับการส่งคืน");
      return;
    }
    setSaving(true);
    try {
      const res  = await authFetch(`/api/supervisor/sessions/${sessionId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setActionMsg({ ok: true, msg: action === "approve" ? "อนุมัติสำเร็จ" : "ส่งคืนสำเร็จ" });
      setSelected(null); setNotes("");
      await fetchData();
    } catch (e) {
      setActionMsg({ ok: false, msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  }

  const tabStyle = (k) => ({
    padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer",
    fontFamily: "Sarabun, sans-serif", fontSize: 14, fontWeight: tab === k ? 700 : 400,
    background: tab === k ? "#1b5e20" : "#e0e0e0",
    color: tab === k ? "#fff" : "#555",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header titleOverride="Supplier Evaluation System" />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 20px 48px" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#555", fontFamily: "Sarabun, sans-serif", fontSize: 14 }}>
            <ArrowLeft size={16} /> กลับ
          </button>
          <span style={{ color: "#ccc" }}>/</span>
          <span style={{ fontWeight: 700, color: "#1b5e20" }}>อนุมัติผลการประเมิน</span>
          <button onClick={fetchData} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #ddd", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "#555", fontFamily: "Sarabun, sans-serif" }}>
            <RefreshCw size={14} /> รีเฟรช
          </button>
        </div>

        {actionMsg && (
          <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16, background: actionMsg.ok ? "#e8f5e9" : "#ffebee", color: actionMsg.ok ? "#2e7d32" : "#c62828", fontWeight: 700 }}>
            {actionMsg.msg}
          </div>
        )}
        {error && <div style={{ padding: 12, background: "#ffebee", color: "#c62828", borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button style={tabStyle("queue")} onClick={() => setTab("queue")}>
            รอการอนุมัติ {queue.length > 0 && <span style={{ background: "#c62828", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 12, marginLeft: 6 }}>{queue.length}</span>}
          </button>
          <button style={tabStyle("history")} onClick={() => setTab("history")}>ประวัติการอนุมัติ</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด…</div>
        ) : tab === "queue" ? (
          queue.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#aaa" }}>
              <CheckCircle size={48} color="#a5d6a7" style={{ marginBottom: 12 }} />
              <div>ไม่มีรายการรอการอนุมัติ</div>
            </div>
          ) : (
            queue.map(session => (
              <div key={session.sessionId} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", marginBottom: 16, overflow: "hidden" }}>
                {/* Session header */}
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{session.supplierName}</span>
                    <span style={{ marginLeft: 10, fontSize: 12, background: "#e8f5e9", color: "#2e7d32", padding: "2px 8px", borderRadius: 10 }}>
                      {EVAL_TYPE_LABEL[session.evalType] || session.evalType}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13, color: "#777" }}>
                    {session.finalScore != null && (
                      <span>คะแนน: <strong style={{ color: GRADE_COLOR[session.finalGrade] || "#333" }}>{session.finalScore} ({session.finalGrade})</strong></span>
                    )}
                    {session.reviewDue && (() => {
                      const d = daysDiff(session.reviewDue);
                      return (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: d != null && d <= 1 ? "#c62828" : "#f57f17" }}>
                          <Clock size={13} />
                          {d != null && d >= 0 ? `ครบกำหนดใน ${d} วัน` : "เกินกำหนด"}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Evaluations */}
                <div style={{ padding: "12px 20px" }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                    {session.evaluations.map(ev => (
                      <div key={ev.id} style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{ev.role === "GCP" ? "Buyer (GCP)" : "Evaluator (USER)"}</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.fullName}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>{ev.department}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, color: GRADE_COLOR[ev.grade] || "#333" }}>
                          {ev.totalScore} <span style={{ fontWeight: 400, fontSize: 11 }}>({ev.grade})</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Review panel */}
                  {selected === session.sessionId ? (
                    <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>หมายเหตุ (จำเป็นสำหรับการส่งคืน)</div>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ระบุเหตุผลหรือข้อแนะนำ…"
                        style={{ width: "100%", minHeight: 80, borderRadius: 6, border: "1px solid #ddd", padding: 10, fontFamily: "Sarabun, sans-serif", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button
                          onClick={() => handleDecision(session.sessionId, "approve")}
                          disabled={saving}
                          style={{ background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.6 : 1 }}
                        >
                          <CheckCircle size={15} /> อนุมัติ
                        </button>
                        <button
                          onClick={() => handleDecision(session.sessionId, "return")}
                          disabled={saving}
                          style={{ background: "#1565c0", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.6 : 1 }}
                        >
                          <RotateCcw size={15} /> ส่งคืน
                        </button>
                        <button
                          onClick={() => { setSelected(null); setNotes(""); }}
                          style={{ background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 13 }}
                        >ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setSelected(session.sessionId); setNotes(""); }}
                      style={{ background: "#1b5e20", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 13 }}
                    >
                      พิจารณาผล
                    </button>
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          /* History tab */
          history.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#aaa" }}>ยังไม่มีประวัติการอนุมัติ</div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    {["Supplier","ประเภท","คะแนน","เกรด","ผล","ผู้อนุมัติ","วันที่"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #e0e0e0", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 14px" }}>{row.supplierName}</td>
                      <td style={{ padding: "10px 14px" }}>{EVAL_TYPE_LABEL[row.evalType] || row.evalType}</td>
                      <td style={{ padding: "10px 14px" }}>{row.finalScore ?? "-"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: GRADE_COLOR[row.finalGrade] || "#333" }}>{row.finalGrade ?? "-"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: row.reviewStatus === "approved" ? "#e8f5e9" : "#e3f2fd", color: row.reviewStatus === "approved" ? "#2e7d32" : "#1565c0", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                          {row.reviewStatus === "approved" ? "อนุมัติ" : "ส่งคืน"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{row.supervisorName || "-"}</td>
                      <td style={{ padding: "10px 14px", color: "#888" }}>
                        {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString("th-TH") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
