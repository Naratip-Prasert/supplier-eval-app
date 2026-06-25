import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw, Clock, RefreshCw, AlertCircle, Pencil, Check, X, Eye } from "lucide-react";
import { Header, useModal } from "../components";
import { authFetch } from "../utils/api";

const EVAL_TYPE_LABEL = {
  pre_eval:     "Pre-Evaluation",
  post_eval:    "Post 90 Days",
  half_year:    "Half-Year",
  yearly:       "Yearly",
};

const GRADE_COLOR = { A: "#15803d", B: "#1d4ed8", C: "#b45309", D: "#b91c1c", F: "#7f1d1d" };

const FONT = "Sarabun, sans-serif";

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function SupervisorPage({ authUser, onBack, onViewEvaluation }) {
  const { showConfirm, ModalEl } = useModal();
  const [tab,     setTab]     = useState("queue");
  const [queue,   setQueue]   = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [selected,  setSelected]  = useState(null); // session being reviewed
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const [noteModal,   setNoteModal]   = useState(null); // { reviewId, supplierName, notes, canEdit } | null
  const [editingNote, setEditingNote] = useState(false);
  const [editText,    setEditText]    = useState("");
  const [savingNote,  setSavingNote]  = useState(false);

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
    const confirmed = await showConfirm(
      action === "approve"
        ? "ยืนยันอนุมัติผลการประเมินนี้?"
        : "ยืนยันส่งคืนผลการประเมินนี้เพื่อให้ผู้ประเมินแก้ไขใหม่?",
      action === "approve" ? "ยืนยันอนุมัติ" : "ยืนยันส่งคืน"
    );
    if (!confirmed) return;

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

  function openNoteModal(row) {
    setNoteModal({
      reviewId: row.reviewId,
      supplierName: row.supplierName,
      notes: row.reviewNotes,
      canEdit: row.supervisorEmpId?.toUpperCase() === authUser?.empId?.toUpperCase(),
    });
    setEditingNote(false);
  }

  function closeNoteModal() {
    setNoteModal(null);
    setEditingNote(false);
  }

  function startEditNote() {
    setEditText(noteModal.notes || "");
    setEditingNote(true);
  }

  async function saveNote() {
    if (!editText.trim()) return;
    const reviewId = noteModal.reviewId;
    setSavingNote(true);
    try {
      const res  = await authFetch(`/api/supervisor/reviews/${reviewId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const saved = editText.trim();
      setHistory(h => h.map(r => r.reviewId === reviewId ? { ...r, reviewNotes: saved } : r));
      setNoteModal(m => m && { ...m, notes: saved });
      setEditingNote(false);
    } catch (e) {
      setActionMsg({ ok: false, msg: e.message });
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setSavingNote(false);
    }
  }

  const tabStyle = (k) => ({
    padding: "10px 4px", border: "none", background: "none", cursor: "pointer",
    fontFamily: FONT, fontSize: 14, fontWeight: tab === k ? 700 : 500,
    color: tab === k ? "#0f172a" : "#94a3b8",
    borderBottom: tab === k ? "2.5px solid #1e3a8a" : "2.5px solid transparent",
    display: "flex", alignItems: "center", gap: 8, transition: "color 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: FONT }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {ModalEl}

      {noteModal && (
        <>
          <div
            onClick={closeNoteModal}
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.5)" }}
          />
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{
              background: "#fff", borderRadius: 14, width: "min(460px, 100%)",
              maxHeight: "min(560px, 86vh)", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(15,23,42,0.28)", overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 20px", borderBottom: "1px solid #f1f5f9",
                display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>หมายเหตุ</div>
                  <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{noteModal.supplierName}</div>
                </div>
                <button
                  onClick={closeNoteModal}
                  style={{
                    background: "#f1f5f9", border: "none", borderRadius: 7,
                    width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#64748b", flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
                {editingNote ? (
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%", minHeight: 120, borderRadius: 9, border: "1px solid #cbd5e1",
                      padding: 11, fontFamily: FONT, fontSize: 13.5, resize: "vertical", boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                ) : (
                  <div style={{
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
                    padding: "14px 16px", fontSize: 13.5, lineHeight: 1.8, color: "#334155",
                    whiteSpace: "pre-line", wordBreak: "break-word", overflowWrap: "anywhere",
                  }}>
                    {noteModal.notes}
                  </div>
                )}
              </div>

              <div style={{ padding: "12px 20px 18px", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
                {editingNote ? (
                  <>
                    <button
                      onClick={() => setEditingNote(false)}
                      disabled={savingNote}
                      style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 13, color: "#64748b" }}
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={saveNote}
                      disabled={savingNote || !editText.trim()}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "#15803d", color: "#fff", border: "none", borderRadius: 8,
                        padding: "8px 18px", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13,
                        opacity: savingNote || !editText.trim() ? 0.6 : 1,
                      }}
                    >
                      <Check size={14} /> บันทึก
                    </button>
                  </>
                ) : (
                  <>
                    {noteModal.canEdit && (
                      <button
                        onClick={startEditNote}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          background: "none", border: "1px solid #1e3a8a", borderRadius: 8,
                          padding: "8px 16px", cursor: "pointer", fontFamily: FONT, fontWeight: 600, fontSize: 13, color: "#1e3a8a",
                        }}
                      >
                        <Pencil size={13} /> แก้ไข
                      </button>
                    )}
                    <button
                      onClick={closeNoteModal}
                      style={{ background: "#1e3a8a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13 }}
                    >
                      ปิด
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <Header />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 56px" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#64748b", fontFamily: FONT, fontSize: 13.5 }}>
            <ArrowLeft size={15} /> กลับ
          </button>
          <span style={{ color: "#cbd5e1" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>อนุมัติผลการประเมิน</span>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#475569", fontFamily: FONT,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> รีเฟรช
          </button>
        </div>

        {actionMsg && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 16px", borderRadius: 9, marginBottom: 18,
            background: actionMsg.ok ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${actionMsg.ok ? "#a7f3d0" : "#fecaca"}`,
            color: actionMsg.ok ? "#047857" : "#b91c1c", fontWeight: 600, fontSize: 13.5,
          }}>
            {actionMsg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {actionMsg.msg}
          </div>
        )}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 9, marginBottom: 18, fontSize: 13.5 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 28, marginBottom: 22, borderBottom: "1px solid #e2e8f0" }}>
          <button style={tabStyle("queue")} onClick={() => setTab("queue")}>
            รอการอนุมัติ
            {queue.length > 0 && (
              <span style={{
                background: tab === "queue" ? "#1e3a8a" : "#cbd5e1",
                color: "#fff", borderRadius: 5, padding: "1px 7px", fontSize: 11.5, fontWeight: 700,
              }}>
                {queue.length}
              </span>
            )}
          </button>
          <button style={tabStyle("history")} onClick={() => setTab("history")}>ประวัติการอนุมัติ</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 13.5 }}>กำลังโหลด…</div>
        ) : tab === "queue" ? (
          queue.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "56px 20px", color: "#94a3b8",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
            }}>
              <CheckCircle2 size={40} color="#cbd5e1" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13.5 }}>ไม่มีรายการรอการอนุมัติ</div>
            </div>
          ) : (
            queue.map(session => (
              <div key={session.sessionId} style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
                marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              }}>
                {/* Session header */}
                <div style={{
                  padding: "16px 22px", borderBottom: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{session.supplierName}</span>
                    <span style={{
                      fontSize: 11.5, fontWeight: 600, color: "#475569",
                      background: "#f1f5f9", border: "1px solid #e2e8f0",
                      padding: "3px 9px", borderRadius: 6,
                    }}>
                      {EVAL_TYPE_LABEL[session.evalType] || session.evalType}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 13, color: "#64748b" }}>
                    {session.finalScore != null && (
                      <span>คะแนน <strong style={{ color: GRADE_COLOR[session.finalGrade] || "#0f172a", marginLeft: 4 }}>{session.finalScore} ({session.finalGrade})</strong></span>
                    )}
                    {session.reviewDue && (() => {
                      const d = daysDiff(session.reviewDue);
                      const urgent = d != null && d <= 1;
                      return (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: urgent ? "#b91c1c" : "#b45309", fontWeight: urgent ? 700 : 500 }}>
                          <Clock size={13} />
                          {d != null && d >= 0 ? `ครบกำหนดใน ${d} วัน` : "เกินกำหนด"}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Evaluations */}
                <div style={{ padding: "16px 22px" }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                    {session.evaluations.map(ev => {
                      const clickable = !!onViewEvaluation;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => onViewEvaluation?.(ev.id)}
                          title={clickable ? "คลิกเพื่อดูผลการประเมินแบบละเอียด" : undefined}
                          style={{
                            background: "#f8fafc", border: "1px solid #eef2f6", borderRadius: 9,
                            padding: "11px 15px", minWidth: 170,
                            cursor: clickable ? "pointer" : "default",
                            transition: "background 0.1s, border-color 0.1s",
                          }}
                          onMouseEnter={e => { if (clickable) { e.currentTarget.style.background = "#eef2f6"; e.currentTarget.style.borderColor = "#cbd5e1"; } }}
                          onMouseLeave={e => { if (clickable) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#eef2f6"; } }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                              overflow: "hidden", background: "#e2e8f0",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700, color: "#475569",
                            }}>
                              {ev.profilePicture
                                ? <img src={ev.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : (ev.fullName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                              }
                            </div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#94a3b8" }}>
                              {ev.role === "GCP" ? "Buyer (GCP)" : "Evaluator (USER)"}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{ev.fullName}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{ev.department}</div>
                          <div style={{ marginTop: 7, fontWeight: 700, color: GRADE_COLOR[ev.grade] || "#0f172a" }}>
                            {ev.totalScore} <span style={{ fontWeight: 500, fontSize: 11, color: "#94a3b8" }}>({ev.grade})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Review panel */}
                  {selected === session.sessionId ? (
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9, color: "#334155" }}>หมายเหตุ (จำเป็นสำหรับการส่งคืน)</div>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ระบุเหตุผลหรือข้อแนะนำ…"
                        style={{
                          width: "100%", minHeight: 84, borderRadius: 8, border: "1px solid #cbd5e1",
                          padding: 11, fontFamily: FONT, fontSize: 13, resize: "vertical", boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                        <button
                          onClick={() => handleDecision(session.sessionId, "approve")}
                          disabled={saving}
                          style={{
                            background: "#15803d", color: "#fff", border: "none", borderRadius: 8,
                            padding: "9px 20px", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13,
                            display: "flex", alignItems: "center", gap: 7, opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <CheckCircle2 size={15} /> อนุมัติ
                        </button>
                        <button
                          onClick={() => handleDecision(session.sessionId, "return")}
                          disabled={saving}
                          style={{
                            background: "#fff", color: "#1e3a8a", border: "1.5px solid #1e3a8a", borderRadius: 8,
                            padding: "9px 20px", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13,
                            display: "flex", alignItems: "center", gap: 7, opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <RotateCcw size={15} /> ส่งคืน
                        </button>
                        <button
                          onClick={() => { setSelected(null); setNotes(""); }}
                          style={{
                            background: "none", border: "1px solid transparent", borderRadius: 8,
                            padding: "9px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 13, color: "#94a3b8",
                          }}
                        >ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setSelected(session.sessionId); setNotes(""); }}
                      style={{
                        background: "#1e3a8a", color: "#fff", border: "none", borderRadius: 8,
                        padding: "9px 20px", cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13,
                      }}
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
            <div style={{
              textAlign: "center", padding: "56px 20px", color: "#94a3b8",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 13.5,
            }}>
              ยังไม่มีประวัติการอนุมัติ
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Supplier","ประเภท","คะแนน","เกรด","ผล","ผู้อนุมัติ","วันที่","หมายเหตุ"].map(h => (
                      <th key={h} style={{
                        padding: "11px 16px", textAlign: "left", borderBottom: "1px solid #e2e8f0",
                        fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3,
                        color: "#64748b", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "11px 16px", fontWeight: 600, color: "#0f172a" }}>{row.supplierName}</td>
                      <td style={{ padding: "11px 16px", color: "#475569" }}>{EVAL_TYPE_LABEL[row.evalType] || row.evalType}</td>
                      <td style={{ padding: "11px 16px", color: "#475569" }}>{row.finalScore ?? "-"}</td>
                      <td style={{ padding: "11px 16px", fontWeight: 700, color: GRADE_COLOR[row.finalGrade] || "#0f172a" }}>{row.finalGrade ?? "-"}</td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{
                          background: row.reviewStatus === "approved" ? "#ecfdf5" : "#eff6ff",
                          color: row.reviewStatus === "approved" ? "#047857" : "#1d4ed8",
                          border: `1px solid ${row.reviewStatus === "approved" ? "#a7f3d0" : "#bfdbfe"}`,
                          padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                        }}>
                          {row.reviewStatus === "approved" ? "อนุมัติ" : "ส่งคืน"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 16px", color: "#475569" }}>{row.supervisorName || "-"}</td>
                      <td style={{ padding: "11px 16px", color: "#94a3b8" }}>
                        {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString("th-TH") : "-"}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        {row.reviewNotes ? (
                          <button
                            onClick={() => openNoteModal(row)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7,
                              padding: "6px 12px", cursor: "pointer", fontFamily: FONT,
                              fontSize: 12, fontWeight: 600, color: "#475569", whiteSpace: "nowrap",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#eef2f6"}
                            onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
                          >
                            <Eye size={13} /> ดูหมายเหตุ
                          </button>
                        ) : (
                          <span style={{ color: "#cbd5e1", fontSize: 12.5 }}>—</span>
                        )}
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
