"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, RotateCcw, Clock, RefreshCw, AlertCircle, Pencil, Check, X, Eye, ChevronDown, ChevronRight, History as HistoryIcon, Search, SlidersHorizontal } from "lucide-react";
import { Header, useModal } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/api";
import { GRADE_COLOR } from "@/styles/theme";
import { SortableTh, nextSort, type SortState } from "@/components/shared/SortableTh";

const EVAL_TYPE_LABEL: Record<string, string> = {
  pre_eval:     "Pre-Evaluation",
  post_eval:    "Post 90 Days",
  half_year:    "Half-Year",
  yearly:       "Yearly",
  ad_hoc:       "Ad-hoc",
};

const FONT = "Sarabun, sans-serif";

function daysDiff(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

interface EvalEntry {
  id: string;
  role: string;
  fullName: string;
  department: string;
  profilePicture?: string | null;
  totalScore: number | string;
  grade: string;
}

interface QueueSession {
  sessionId: string;
  supplierName: string;
  evalType: string;
  finalScore?: number | string | null;
  finalGrade?: string | null;
  reviewDue?: string | null;
  evaluations: EvalEntry[];
}

interface OverdueTask {
  id: string;
  role: string;
  assignedEmail: string;
  assignedName?: string | null;
  dueDate: string;
  status: string;
  vendorCode: string;
  supplierName: string;
  sessionId: string;
  evalType: string;
  period?: string | null;
}

interface HistoryRow {
  sessionId: string;
  reviewId: string;
  supplierName: string;
  vendorCode: string;
  evalType: string;
  finalScore?: number | string | null;
  finalGrade?: string | null;
  reviewStatus: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  supervisorName?: string | null;
  supervisorEmpId?: string | null;
}

interface SessionDetail {
  supplierName: string;
  evalType: string;
  period: string;
  finalScore?: number | string | null;
  finalGrade?: string | null;
  evaluations: EvalEntry[];
}

interface HistoryGroup {
  latest: HistoryRow;
  prior: HistoryRow[];
  all: HistoryRow[];
}

type HistorySortKey = "evalType" | "score" | "grade" | "status" | "reviewedAt";

function compareHistoryGroups(a: HistoryGroup, b: HistoryGroup, key: HistorySortKey): number {
  const ra = a.latest, rb = b.latest;
  switch (key) {
    case "evalType":   return (ra.evalType || "").localeCompare(rb.evalType || "");
    case "score": {
      const av = ra.finalScore != null ? parseFloat(String(ra.finalScore)) : -Infinity;
      const bv = rb.finalScore != null ? parseFloat(String(rb.finalScore)) : -Infinity;
      return av - bv;
    }
    case "grade":      return (ra.finalGrade || "￿").localeCompare(rb.finalGrade || "￿");
    case "status":     return (ra.reviewStatus || "").localeCompare(rb.reviewStatus || "");
    case "reviewedAt": return new Date(ra.reviewedAt || 0).getTime() - new Date(rb.reviewedAt || 0).getTime();
  }
}

interface NoteModalState {
  reviewId: string;
  supplierName: string;
  notes: string | null | undefined;
  canEdit: boolean;
}

export default function SupervisorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const { showAlert, showConfirm, ModalEl } = useModal();
  const initialTab = searchParams.get("tab") === "overdue" ? "overdue" : "queue";
  const [tab,     setTab]     = useState<"queue" | "overdue" | "history">(initialTab);
  const [queue,   setQueue]   = useState<QueueSession[]>([]);
  const [overdue, setOverdue] = useState<OverdueTask[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [selected,  setSelected]  = useState<string | null>(null); // session being reviewed
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const [noteModal,   setNoteModal]   = useState<NoteModalState | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [editText,    setEditText]    = useState("");
  const [savingNote,  setSavingNote]  = useState(false);

  // ── History filters ──────────────────────────────────────────
  const [histSearch,      setHistSearch]      = useState("");
  const [histStatus,      setHistStatus]      = useState("all"); // all | approved | returned
  const [histEvalType,    setHistEvalType]    = useState("all");
  const [histDateFrom,    setHistDateFrom]    = useState("");
  const [histDateTo,      setHistDateTo]      = useState("");
  const [showHistFilter,  setShowHistFilter]  = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [histSort, setHistSort] = useState<SortState<HistorySortKey>>({ key: "reviewedAt", dir: "desc" });
  const onHistSort = (key: HistorySortKey) => setHistSort(s => nextSort(s, key));

  // ── Full read-only history detail view ("เปิดหน้าอนุมัติเต็ม") ──────
  const [viewGroup,   setViewGroup]   = useState<HistoryGroup | null>(null);
  const [viewDetail,  setViewDetail]  = useState<SessionDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError,   setViewError]   = useState<string | null>(null);

  const onViewEvaluation = (id: string) => router.push(`/evaluations/${id}?from=supervisor`);

  // เช็ค r.ok ก่อนเสมอ — ไม่งั้น server error จริงจะโชว์เป็น "คิวว่าง" แทนที่
  // จะบอก error ที่แท้จริง
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [qR, oR, hR] = await Promise.all([
        authFetch("/api/supervisor/queue"),
        authFetch("/api/supervisor/overdue-tasks"),
        authFetch("/api/supervisor/history"),
      ]);
      if (!qR.ok || !oR.ok || !hR.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${qR.status}/${oR.status}/${hR.status})`);
      const [qRes, oRes, hRes] = await Promise.all([qR.json(), oR.json(), hR.json()]);
      setQueue(Array.isArray(qRes) ? qRes : []);
      setOverdue(Array.isArray(oRes) ? oRes : []);
      setHistory(Array.isArray(hRes) ? hRes : []);
    } catch (e) {
      console.error("[SupervisorPage] fetchData error:", e);
      setError("โหลดข้อมูลไม่สำเร็จ");
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Group by session, then filter the groups ────────────────────
  // A session can accumulate multiple supervisor_reviews rows over several
  // return -> resubmit -> review cycles (see database/schema.sql). Grouping
  // must happen on the FULL unfiltered history first — filtering rows
  // individually before grouping would strip a session's earlier "returned"
  // row whenever the status filter is set to "อนุมัติ", making an
  // approved-after-returned session lose its "เคยถูกส่งคืน" history entirely
  // instead of just being correctly included under the "approved" filter.
  const allGroupedHistory = useMemo<HistoryGroup[]>(() => {
    const bySession = new Map<string, HistoryRow[]>();
    history.forEach(row => {
      const key = row.sessionId;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key)!.push(row);
    });
    const groups = [...bySession.values()].map(rows => {
      const sorted = [...rows].sort((a, b) => new Date(a.reviewedAt || 0).getTime() - new Date(b.reviewedAt || 0).getTime());
      return { latest: sorted[sorted.length - 1], prior: sorted.slice(0, -1), all: sorted };
    });
    groups.sort((a, b) => new Date(b.latest.reviewedAt || 0).getTime() - new Date(a.latest.reviewedAt || 0).getTime());
    return groups;
  }, [history]);

  const groupedHistory = useMemo(() => {
    return allGroupedHistory.filter(group => {
      const row = group.latest;
      if (histStatus   !== "all" && row.reviewStatus !== histStatus) return false;
      if (histEvalType !== "all" && row.evalType     !== histEvalType) return false;
      if (row.reviewedAt) {
        const reviewed = new Date(row.reviewedAt);
        if (histDateFrom && reviewed < new Date(`${histDateFrom}T00:00:00`)) return false;
        if (histDateTo   && reviewed > new Date(`${histDateTo}T23:59:59.999`)) return false;
      } else if (histDateFrom || histDateTo) {
        return false;
      }
      if (histSearch.trim()) {
        const q = histSearch.trim().toLowerCase();
        // search across every row in the group, not just the latest, so a
        // match on an older supervisor's name still surfaces the session
        const haystack = group.all.map(r => [r.supplierName, r.vendorCode, r.supervisorName].join(" ")).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allGroupedHistory, histStatus, histEvalType, histDateFrom, histDateTo, histSearch]);

  const sortedHistory = histSort.key
    ? [...groupedHistory].sort((a, b) => {
        const cmp = compareHistoryGroups(a, b, histSort.key as HistorySortKey);
        return histSort.dir === "asc" ? cmp : -cmp;
      })
    : groupedHistory;

  const hasHistFilter = histStatus !== "all" || histEvalType !== "all" || !!histDateFrom || !!histDateTo || !!histSearch.trim();
  const clearHistFilters = () => {
    setHistSearch(""); setHistStatus("all"); setHistEvalType("all"); setHistDateFrom(""); setHistDateTo("");
  };
  const toggleExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      return next;
    });
  };

  async function openFullView(group: HistoryGroup) {
    setViewGroup(group);
    setViewDetail(null);
    setViewError(null);
    setViewLoading(true);
    try {
      const res = await authFetch(`/api/sessions/${group.latest.sessionId}`);
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      setViewDetail(await res.json());
    } catch (e) {
      setViewError((e as Error).message);
    } finally {
      setViewLoading(false);
    }
  }

  function closeFullView() {
    setViewGroup(null);
    setViewDetail(null);
    setViewError(null);
  }

  async function handleDecision(sessionId: string, action: "approve" | "return") {
    if (action === "return" && !notes.trim()) {
      await showAlert("กรุณาระบุหมายเหตุสำหรับการส่งคืน");
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
      setActionMsg({ ok: false, msg: (e as Error).message });
    } finally {
      setSaving(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  }

  function openNoteModal(row: HistoryRow) {
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
    setEditText(noteModal?.notes || "");
    setEditingNote(true);
  }

  async function saveNote() {
    if (!editText.trim() || !noteModal) return;
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
      setActionMsg({ ok: false, msg: (e as Error).message });
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setSavingNote(false);
    }
  }

  const tabStyle = (k: string) => ({
    padding: "10px 4px", border: "none", background: "none", cursor: "pointer",
    fontFamily: FONT, fontSize: 14, fontWeight: tab === k ? 700 : 500,
    color: tab === k ? "#0f172a" : "#94a3b8",
    borderBottom: tab === k ? "2.5px solid #1e3a8a" : "2.5px solid transparent",
    display: "flex", alignItems: "center", gap: 8, transition: "color 0.15s",
  } as const);

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
                        background: "#1b5e20", color: "#fff", border: "none", borderRadius: 8,
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
        {viewGroup ? (
          <>
            {/* ── Full read-only history detail ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <button onClick={closeFullView} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#64748b", fontFamily: FONT, fontSize: 13.5 }}>
                <ArrowLeft size={15} /> กลับไปยังประวัติการอนุมัติ
              </button>
            </div>

            {viewLoading ? (
              <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 13.5 }}>กำลังโหลด…</div>
            ) : viewError ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 9, fontSize: 13.5 }}>
                <AlertCircle size={16} /> {viewError}
              </div>
            ) : viewDetail && (
              <>
                <div style={{
                  background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
                  marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                }}>
                  <div style={{
                    padding: "16px 22px", borderBottom: "1px solid #f1f5f9",
                    display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{viewDetail.supplierName}</span>
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, color: "#475569",
                        background: "#f1f5f9", border: "1px solid #e2e8f0",
                        padding: "3px 9px", borderRadius: 6,
                      }}>
                        {EVAL_TYPE_LABEL[viewDetail.evalType] || viewDetail.evalType}
                      </span>
                      <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{viewDetail.period}</span>
                    </div>
                    {viewDetail.finalScore != null && (
                      <span style={{ fontSize: 13, color: "#64748b" }}>
                        คะแนน <strong style={{ color: GRADE_COLOR[viewDetail.finalGrade ?? ""] || "#0f172a", marginLeft: 4 }}>{viewDetail.finalScore} ({viewDetail.finalGrade})</strong>
                      </span>
                    )}
                  </div>

                  <div style={{ padding: "16px 22px" }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {viewDetail.evaluations.map(ev => {
                        const clickable = true;
                        return (
                          <div
                            key={ev.id}
                            onClick={() => onViewEvaluation(ev.id)}
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
                                {ev.role === "GCP" ? "Buyer (GCP)" : ev.role === "USER" ? "Evaluator (USER)" : ev.role}
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
                      {viewDetail.evaluations.length === 0 && (
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>ยังไม่มีผู้ประเมินส่งผล</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Read-only comment/decision timeline */}
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                  <div style={{ padding: "13px 22px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 13.5, color: "#334155" }}>
                    ประวัติการพิจารณา
                  </div>
                  <div style={{ padding: "16px 22px" }}>
                    {viewGroup.all.map((p, i) => (
                      <div key={p.reviewId ?? i} style={{
                        display: "flex", gap: 12, paddingBottom: 14, marginBottom: 14,
                        borderBottom: i === viewGroup.all.length - 1 ? "none" : "1px solid #f1f5f9",
                      }}>
                        <span style={{
                          background: p.reviewStatus === "approved" ? "#ecfdf5" : "#eff6ff",
                          color: p.reviewStatus === "approved" ? "#047857" : "#1565c0",
                          border: `1px solid ${p.reviewStatus === "approved" ? "#a7f3d0" : "#bfdbfe"}`,
                          padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                          height: "fit-content", flexShrink: 0, whiteSpace: "nowrap",
                        }}>
                          {p.reviewStatus === "approved" ? "อนุมัติ" : "ส่งคืน"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: "#475569" }}>
                            <strong style={{ color: "#0f172a" }}>{p.supervisorName || "-"}</strong>
                            {" · "}
                            {p.reviewedAt ? new Date(p.reviewedAt).toLocaleString("th-TH") : "-"}
                          </div>
                          {p.reviewNotes ? (
                            <div style={{
                              marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                              padding: "10px 12px", fontSize: 13, lineHeight: 1.7, color: "#334155",
                              whiteSpace: "pre-line", wordBreak: "break-word",
                            }}>
                              {p.reviewNotes}
                            </div>
                          ) : (
                            <div style={{ marginTop: 4, fontSize: 12, color: "#cbd5e1" }}>ไม่มีหมายเหตุ</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <button onClick={() => router.push("/portal")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#64748b", fontFamily: FONT, fontSize: 13.5 }}>
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
          <button style={tabStyle("overdue")} onClick={() => setTab("overdue")}>
            งานเกินกำหนด
            {overdue.length > 0 && (
              <span style={{
                background: tab === "overdue" ? "#b91c1c" : "#fca5a5",
                color: "#fff", borderRadius: 5, padding: "1px 7px", fontSize: 11.5, fontWeight: 700,
              }}>
                {overdue.length}
              </span>
            )}
          </button>
          <button style={tabStyle("history")} onClick={() => setTab("history")}>ประวัติการอนุมัติ</button>
        </div>

        {tab === "history" && (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            marginBottom: 16, overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px" }}>
              <Search size={15} style={{ color: "#94a3b8", flexShrink: 0 }} />
              <input
                value={histSearch}
                onChange={e => setHistSearch(e.target.value)}
                placeholder="ค้นหา supplier, vendor code, ผู้อนุมัติ..."
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: FONT, color: "#0f172a", background: "transparent" }}
              />
              {histSearch && (
                <button onClick={() => setHistSearch("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                  <X size={14} style={{ color: "#94a3b8" }} />
                </button>
              )}
              <div style={{ width: 1, height: 18, background: "#e2e8f0", flexShrink: 0 }} />
              <button
                onClick={() => setShowHistFilter(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
                  background: showHistFilter ? "#eff6ff" : "none",
                  border: `1px solid ${showHistFilter ? "#1e3a8a" : "#e2e8f0"}`,
                  borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: showHistFilter ? "#1e3a8a" : "#64748b",
                  fontFamily: FONT,
                }}
              >
                <SlidersHorizontal size={13} /> ตัวกรอง
                {hasHistFilter && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1e3a8a", display: "inline-block" }} />}
              </button>
              <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{groupedHistory.length}/{allGroupedHistory.length}</span>
            </div>

            {showHistFilter && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 16px", background: "#f8fafc" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>ผล</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[["all","ทั้งหมด"],["approved","อนุมัติ"],["returned","ส่งคืน"]].map(([v,l]) => (
                        <button key={v} onClick={() => setHistStatus(v)} style={{
                          padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", fontFamily: FONT,
                          background: histStatus===v ? "#1e3a8a" : "#fff", color: histStatus===v ? "#fff" : "#64748b",
                        }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>ประเภท</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[["all","ทั้งหมด"],["pre_eval","Pre"],["post_eval","Post"],["half_year","Half-Year"],["yearly","Yearly"]].map(([v,l]) => (
                        <button key={v} onClick={() => setHistEvalType(v)} style={{
                          padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", fontFamily: FONT,
                          background: histEvalType===v ? "#1e3a8a" : "#fff", color: histEvalType===v ? "#fff" : "#64748b",
                        }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>วันที่อนุมัติ/ส่งคืน</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="date" value={histDateFrom} max={histDateTo || undefined} onChange={e => setHistDateFrom(e.target.value)}
                        style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: FONT, color: "#475569" }} />
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                      <input type="date" value={histDateTo} min={histDateFrom || undefined} onChange={e => setHistDateTo(e.target.value)}
                        style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: FONT, color: "#475569" }} />
                    </div>
                  </div>
                  {hasHistFilter && (
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button onClick={clearHistFilters} style={{
                        display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
                        cursor: "pointer", fontSize: 12, color: "#ef4444", fontFamily: FONT, fontWeight: 600,
                      }}>
                        <X size={12} /> ล้างตัวกรอง
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
                      <span>คะแนน <strong style={{ color: GRADE_COLOR[session.finalGrade ?? ""] || "#0f172a", marginLeft: 4 }}>{session.finalScore} ({session.finalGrade})</strong></span>
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
                      const clickable = true;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => onViewEvaluation(ev.id)}
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
                            background: "#1b5e20", color: "#fff", border: "none", borderRadius: 8,
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
        ) : tab === "overdue" ? (
          /* Overdue tasks tab */
          overdue.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "56px 20px", color: "#94a3b8",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
            }}>
              <CheckCircle2 size={40} color="#cbd5e1" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13.5 }}>ไม่มีงานที่เกินกำหนด</div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Supplier", "ประเภท", "บทบาท", "ผู้รับผิดชอบ", "ครบกำหนด", "เกินมาแล้ว"].map(h => (
                      <th key={h} style={{
                        padding: "11px 16px", textAlign: "left", borderBottom: "1px solid #e2e8f0",
                        fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3,
                        color: "#64748b", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overdue.map(task => {
                    const overdueDays = (() => {
                      const d = daysDiff(task.dueDate);
                      return d != null ? Math.abs(d) : null;
                    })();
                    return (
                      <tr key={task.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "11px 16px", fontWeight: 600, color: "#0f172a" }}>
                          {task.supplierName}
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{task.vendorCode}</div>
                        </td>
                        <td style={{ padding: "11px 16px", color: "#475569" }}>{EVAL_TYPE_LABEL[task.evalType] || task.evalType}</td>
                        <td style={{ padding: "11px 16px", color: "#475569" }}>{task.role === "GCP" ? "Buyer (GCP)" : "Evaluator (USER)"}</td>
                        <td style={{ padding: "11px 16px", color: "#475569" }}>
                          {task.assignedName || task.assignedEmail}
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{task.assignedEmail}</div>
                        </td>
                        <td style={{ padding: "11px 16px", color: "#64748b" }}>
                          {new Date(task.dueDate).toLocaleDateString("th-TH")}
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{
                            display: "flex", alignItems: "center", gap: 5, width: "fit-content",
                            background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca",
                            padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
                          }}>
                            <Clock size={12} /> {overdueDays != null ? `${overdueDays} วัน` : "-"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
          ) : sortedHistory.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 20px", color: "#94a3b8",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 13.5,
            }}>
              ไม่พบรายการที่ตรงกับตัวกรอง
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {(() => {
                      const thStyle = {
                        padding: "11px 16px", borderBottom: "1px solid #e2e8f0",
                        fontWeight: 700, fontSize: 11.5, textTransform: "uppercase" as const, letterSpacing: 0.3,
                        color: "#64748b", whiteSpace: "nowrap" as const,
                      };
                      const cols: { h: string; key: HistorySortKey | null }[] = [
                        { h: "Supplier", key: null }, { h: "ประเภท", key: "evalType" }, { h: "คะแนน", key: "score" },
                        { h: "เกรด", key: "grade" }, { h: "ผล", key: "status" }, { h: "ผู้อนุมัติ", key: null }, { h: "วันที่", key: "reviewedAt" },
                      ];
                      return cols.map(({ h, key }) => key ? (
                        <SortableTh key={h} label={h} sortKey={key} sort={histSort} onSort={onHistSort} style={thStyle} />
                      ) : (
                        <th key={h} style={{ ...thStyle, textAlign: "left" }}>{h}</th>
                      ));
                    })()}
                    {["หมายเหตุ",""].map(h => (
                      <th key={h} style={{
                        padding: "11px 16px", textAlign: "left", borderBottom: "1px solid #e2e8f0",
                        fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3,
                        color: "#64748b", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((group) => {
                    const row = group.latest;
                    const sessionId = row.sessionId;
                    const hasPrior = group.prior.length > 0;
                    const expanded = expandedSessions.has(sessionId);
                    return (
                      <Fragment key={sessionId}>
                        <tr style={{ borderBottom: hasPrior && expanded ? "none" : "1px solid #f1f5f9" }}>
                          <td style={{ padding: "11px 16px", fontWeight: 600, color: "#0f172a" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {hasPrior && (
                                <button
                                  onClick={() => toggleExpanded(sessionId)}
                                  title="ดูประวัติก่อนหน้าของ session นี้"
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#64748b", flexShrink: 0 }}
                                >
                                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
                              {row.supplierName}
                            </div>
                            {hasPrior && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, marginLeft: 20, fontSize: 10.5, color: "#b45309", fontWeight: 600 }}>
                                <HistoryIcon size={11} /> เคยถูกส่งคืนก่อนหน้า
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "11px 16px", color: "#475569" }}>{EVAL_TYPE_LABEL[row.evalType] || row.evalType}</td>
                          <td style={{ padding: "11px 16px", color: "#475569" }}>{row.finalScore ?? "-"}</td>
                          <td style={{ padding: "11px 16px", fontWeight: 700, color: GRADE_COLOR[row.finalGrade ?? ""] || "#0f172a" }}>{row.finalGrade ?? "-"}</td>
                          <td style={{ padding: "11px 16px" }}>
                            {row.reviewStatus === "approved" && hasPrior ? (
                              <span style={{
                                background: "#fff", color: "#1b5e20", border: "1px solid #a7f3d0",
                                padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}>
                                อนุมัติ
                              </span>
                            ) : (
                              <span style={{
                                background: row.reviewStatus === "approved" ? "#ecfdf5" : "#eff6ff",
                                color: row.reviewStatus === "approved" ? "#047857" : "#1565c0",
                                border: `1px solid ${row.reviewStatus === "approved" ? "#a7f3d0" : "#bfdbfe"}`,
                                padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                              }}>
                                {row.reviewStatus === "approved" ? "อนุมัติ" : "ส่งคืน"}
                              </span>
                            )}
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
                          <td style={{ padding: "11px 16px" }}>
                            <button
                              onClick={() => openFullView(group)}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7,
                                padding: "6px 12px", cursor: "pointer", fontFamily: FONT,
                                fontSize: 12, fontWeight: 600, color: "#1565c0", whiteSpace: "nowrap",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
                              onMouseLeave={e => e.currentTarget.style.background = "#eff6ff"}
                            >
                              <Eye size={13} /> เปิดหน้าอนุมัติเต็ม
                            </button>
                          </td>
                        </tr>
                        {hasPrior && expanded && group.prior.map((p, pi) => (
                          <tr key={p.reviewId ?? pi} style={{
                            borderBottom: pi === group.prior.length - 1 ? "1px solid #f1f5f9" : "none",
                            background: "#fbfbfd",
                          }}>
                            <td style={{ padding: "8px 16px 8px 44px", color: "#94a3b8", fontSize: 12 }}>↳ รอบก่อนหน้า</td>
                            <td style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12 }}>{EVAL_TYPE_LABEL[p.evalType] || p.evalType}</td>
                            <td style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12 }}>-</td>
                            <td style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12 }}>-</td>
                            <td style={{ padding: "8px 16px" }}>
                              <span style={{
                                background: p.reviewStatus === "approved" ? "#ecfdf5" : "#eff6ff",
                                color: p.reviewStatus === "approved" ? "#047857" : "#1565c0",
                                border: `1px solid ${p.reviewStatus === "approved" ? "#a7f3d0" : "#bfdbfe"}`,
                                padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                              }}>
                                {p.reviewStatus === "approved" ? "อนุมัติ" : "ส่งคืน"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12 }}>{p.supervisorName || "-"}</td>
                            <td style={{ padding: "8px 16px", color: "#cbd5e1", fontSize: 12 }}>
                              {p.reviewedAt ? new Date(p.reviewedAt).toLocaleDateString("th-TH") : "-"}
                            </td>
                            <td style={{ padding: "8px 16px" }}>
                              {p.reviewNotes ? (
                                <button
                                  onClick={() => openNoteModal(p)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5,
                                    background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
                                    padding: "4px 10px", cursor: "pointer", fontFamily: FONT,
                                    fontSize: 11, fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap",
                                  }}
                                >
                                  <Eye size={11} /> ดูหมายเหตุ
                                </button>
                              ) : (
                                <span style={{ color: "#e2e8f0", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "8px 16px" }} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
          </>
        )}
      </div>
    </div>
  );
}
