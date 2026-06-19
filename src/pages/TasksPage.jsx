// ============================================================
//  pages/TasksPage.jsx  —  Evaluation task management (Excel
//  upload + reminders), separated out from admin management
//  because they're different concerns (system admin vs. running
//  evaluation cycles).
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { Header, useModal } from "../components";
import { authFetch } from "../utils/api";
import { ArrowLeft, RefreshCw, AlertCircle, Search, Upload, Send, Pencil, Trash2, X, Check } from "lucide-react";
import AdminUploadModal from "./AdminUploadModal";

const TASK_STATUS_COLORS = {
  pending:   { bg: "#fff8e1", color: "#f57f17", label: "รอประเมิน" },
  completed: { bg: "#e8f5e9", color: "#2e7d32", label: "ประเมินแล้ว" },
  overdue:   { bg: "#ffebee", color: "#c62828", label: "เกินกำหนด" },
};
const EVAL_TYPE_LABEL = {
  new_supplier: "New Supplier", pre_eval: "Pre-Eval",
  post_eval: "Post 90d", half_year: "Half-Year", yearly: "Yearly",
};

export default function TasksPage({ authUser, onBack }) {
  const { showAlert, showConfirm, ModalEl } = useModal();
  const [tasks,           setTasks]           = useState([]);
  const [batches,         setBatches]         = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [remindingId,     setRemindingId]     = useState(null);
  const [remindMsg,       setRemindMsg]       = useState(null);
  const [statusFilter,    setStatusFilter]    = useState("all");
  const [search,          setSearch]          = useState("");
  const [editingId,       setEditingId]       = useState(null);
  const [editDraft,       setEditDraft]       = useState({ assignedName: "", assignedEmail: "", dueDate: "" });
  const [savingEdit,      setSavingEdit]      = useState(false);
  const [deletingId,      setDeletingId]      = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, batchRes] = await Promise.all([
        authFetch("/api/admin/tasks").then(r => r.json()).catch(() => []),
        authFetch("/api/admin/batches").then(r => r.json()).catch(() => []),
      ]);
      setTasks(Array.isArray(taskRes) ? taskRes : []);
      setBatches(Array.isArray(batchRes) ? batchRes : []);
    } catch (e) {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleRemind(taskId, supplierName) {
    const ok = await showConfirm(`ส่งอีเมล Reminder ไปยังผู้รับผิดชอบของ "${supplierName}" ใช่ไหม?`, "ยืนยันส่ง Reminder");
    if (!ok) return;
    setRemindingId(taskId);
    try {
      const res  = await authFetch(`/api/admin/tasks/${taskId}/remind`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setRemindMsg({ ok: true, msg: `ส่ง reminder แล้ว → ${data.email}` });
      await fetchAll();
    } catch (e) {
      setRemindMsg({ ok: false, msg: e.message });
    } finally {
      setRemindingId(null);
      setTimeout(() => setRemindMsg(null), 4000);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditDraft({
      assignedName:  t.assignedName || "",
      assignedEmail: t.assignedEmail || "",
      dueDate:       new Date(t.dueDate).toISOString().slice(0, 10),
    });
  }

  async function saveEdit(taskId) {
    const ok = await showConfirm(
      `บันทึกการแก้ไขผู้รับผิดชอบ/ครบกำหนดใหม่ใช่ไหม?\n\nผู้รับผิดชอบ: ${editDraft.assignedName || "-"} (${editDraft.assignedEmail || "-"})\nครบกำหนด: ${editDraft.dueDate}`,
      "ยืนยันการแก้ไข"
    );
    if (!ok) return;
    setSavingEdit(true);
    try {
      const res  = await authFetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEditingId(null);
      setRemindMsg({ ok: true, msg: "แก้ไขสำเร็จ" });
      await fetchAll();
    } catch (e) {
      setRemindMsg({ ok: false, msg: e.message });
    } finally {
      setSavingEdit(false);
      setTimeout(() => setRemindMsg(null), 4000);
    }
  }

  async function handleDelete(sessionId, supplierName) {
    const ok = await showConfirm(
      `ลบรายการประเมินของ "${supplierName}" ใช่ไหม?\n\nทั้ง GCP และ USER task ของซัพพลายเออร์นี้จะถูกลบทั้งหมด — ใช้สำหรับแก้ไขกรณีอัพโหลดผิดเท่านั้น`,
      "ยืนยันการลบรายการ"
    );
    if (!ok) return;
    setDeletingId(sessionId);
    try {
      const res  = await authFetch(`/api/admin/sessions/${sessionId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setRemindMsg({ ok: true, msg: "ลบรายการสำเร็จ" });
      await fetchAll();
    } catch (e) {
      setRemindMsg({ ok: false, msg: e.message });
    } finally {
      setDeletingId(null);
      setTimeout(() => setRemindMsg(null), 4000);
    }
  }

  const filtered = tasks.filter(t => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchSearch = !search || t.supplierName?.toLowerCase().includes(search.toLowerCase())
      || t.assignedEmail?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const overdueCount = tasks.filter(t => t.status === "overdue").length;

  return (
    <>
    {ModalEl}
    {showUploadModal && (
      <AdminUploadModal onClose={() => { setShowUploadModal(false); fetchAll(); }} />
    )}
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header titleOverride="Supplier Evaluation System" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 48px" }}>

        {/* ── Breadcrumb bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              color: "#1b5e20", fontSize: 14, fontWeight: 700,
              fontFamily: "Sarabun, sans-serif", padding: 0,
            }}
          >
            <ArrowLeft size={16} /> หน้าหลัก
          </button>
          <span style={{ color: "#ccc" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>งานประเมิน</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {loading && <span style={{ fontSize: 12, color: "#aaa" }}>กำลังโหลด…</span>}
            <button
              onClick={fetchAll}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer", fontSize: 12,
                color: "#555", fontFamily: "Sarabun, sans-serif",
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              รีเฟรช
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 10,
            padding: "12px 16px", marginBottom: 20, display: "flex", gap: 8,
            alignItems: "center", color: "#b71c1c", fontSize: 13,
          }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Stats + Upload button */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "รอประเมิน",   value: pendingCount, color: "#f57f17", bg: "#fff8e1" },
              { label: "เกินกำหนด",   value: overdueCount, color: "#c62828", bg: "#ffebee" },
              { label: "ทั้งหมด",     value: tasks.length, color: "#555",    bg: "#f5f5f5" },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 8, padding: "8px 16px", textAlign: "center", minWidth: 80 }}>
                <div style={{ fontWeight: 800, fontSize: 20, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: s.color }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: "#1b5e20", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 14 }}
          >
            <Upload size={16} /> อัพโหลด CSV / Excel
          </button>
        </div>

        {remindMsg && (
          <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: remindMsg.ok ? "#e8f5e9" : "#ffebee", color: remindMsg.ok ? "#2e7d32" : "#c62828", fontSize: 13 }}>
            {remindMsg.msg}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา supplier / email…"
              style={{ width: "100%", paddingLeft: 32, padding: "8px 10px 8px 32px", border: "1px solid #e0e0e0", borderRadius: 7, fontFamily: "Sarabun, sans-serif", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all","ทั้งหมด"],["pending","รอประเมิน"],["overdue","เกินกำหนด"],["completed","เสร็จแล้ว"]].map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "6px 14px", borderRadius: 20, border: statusFilter === v ? "2px solid #1b5e20" : "1px solid #ddd", background: statusFilter === v ? "#e8f5e9" : "#fff", color: statusFilter === v ? "#1b5e20" : "#555", fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer", fontWeight: statusFilter === v ? 700 : 400 }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks table */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>ไม่มีรายการ</div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["Supplier","ประเภท","Role","ผู้รับผิดชอบ","ครบกำหนด","สถานะ","Email ล่าสุด","จัดการ"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const sc = TASK_STATUS_COLORS[t.status] ?? TASK_STATUS_COLORS.pending;
                  const dueDate = new Date(t.dueDate);
                  const isPast = dueDate < new Date();
                  const isEditing = editingId === t.id;
                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f5f5f5", background: isEditing ? "#f8fdf8" : "transparent" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{t.supplierName}</td>
                      <td style={{ padding: "10px 12px", fontSize: 11 }}>{EVAL_TYPE_LABEL[t.evalType] || t.evalType}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: t.role === "GCP" ? "#e3f2fd" : "#e8f5e9", color: t.role === "GCP" ? "#1565c0" : "#2e7d32", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{t.role}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <input
                              value={editDraft.assignedName}
                              onChange={e => setEditDraft(d => ({ ...d, assignedName: e.target.value }))}
                              placeholder="ชื่อผู้รับผิดชอบ"
                              style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "Sarabun, sans-serif" }}
                            />
                            <input
                              value={editDraft.assignedEmail}
                              onChange={e => setEditDraft(d => ({ ...d, assignedEmail: e.target.value }))}
                              placeholder="email"
                              style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "Sarabun, sans-serif" }}
                            />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12 }}>{t.assignedName || "-"}</div>
                            <div style={{ fontSize: 11, color: "#aaa" }}>{t.assignedEmail}</div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: isPast && t.status !== "completed" ? "#c62828" : "#555", fontWeight: isPast && t.status !== "completed" ? 700 : 400 }}>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editDraft.dueDate}
                            onChange={e => setEditDraft(d => ({ ...d, dueDate: e.target.value }))}
                            style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "Sarabun, sans-serif" }}
                          />
                        ) : dueDate.toLocaleDateString("th-TH")}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: 10, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{sc.label}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "#888" }}>
                        {t.reminderSentAt ? `Reminder: ${new Date(t.reminderSentAt).toLocaleDateString("th-TH")}` :
                         t.invitationSentAt ? `Invite: ${new Date(t.invitationSentAt).toLocaleDateString("th-TH")}` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {isEditing ? (
                            <>
                              <button
                                disabled={savingEdit}
                                onClick={() => saveEdit(t.id)}
                                title="บันทึก"
                                style={{ display: "flex", alignItems: "center", gap: 4, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12 }}
                              >
                                <Check size={12} />
                              </button>
                              <button
                                disabled={savingEdit}
                                onClick={() => setEditingId(null)}
                                title="ยกเลิก"
                                style={{ display: "flex", alignItems: "center", gap: 4, background: "#f5f5f5", color: "#666", border: "1px solid #ddd", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12 }}
                              >
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              {t.status !== "completed" && (
                                <button
                                  disabled={remindingId === t.id}
                                  onClick={() => handleRemind(t.id, t.supplierName)}
                                  title="ส่ง Reminder"
                                  style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff3e0", color: "#e65100", border: "1px solid #ffe0b2", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, opacity: remindingId === t.id ? 0.6 : 1 }}
                                >
                                  <Send size={12} />
                                </button>
                              )}
                              {t.status !== "completed" && (
                                <button
                                  onClick={() => startEdit(t)}
                                  title="แก้ไขผู้รับผิดชอบ/ครบกำหนด"
                                  style={{ display: "flex", alignItems: "center", gap: 5, background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12 }}
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              <button
                                disabled={deletingId === t.sessionId}
                                onClick={() => handleDelete(t.sessionId, t.supplierName)}
                                title="ลบรายการประเมินนี้"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12, opacity: deletingId === t.sessionId ? 0.6 : 1 }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload batch history */}
        {batches.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#555" }}>ประวัติการอัพโหลด</div>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    {["ไฟล์","ประเภท","จำนวน","สถานะ","ผู้อัพโหลด","วันที่"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "8px 12px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.filename}</td>
                      <td style={{ padding: "8px 12px" }}>{b.batchType}</td>
                      <td style={{ padding: "8px 12px" }}>{b.rowCount}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ background: b.status === "done" ? "#e8f5e9" : b.status === "error" ? "#ffebee" : "#fff8e1", color: b.status === "done" ? "#2e7d32" : b.status === "error" ? "#c62828" : "#f57f17", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{b.status}</span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>{b.uploadedBy || "-"}</td>
                      <td style={{ padding: "8px 12px", color: "#888" }}>{new Date(b.createdAt).toLocaleDateString("th-TH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
    </>
  );
}
