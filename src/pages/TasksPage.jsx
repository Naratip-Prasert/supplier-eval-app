// ============================================================
//  pages/TasksPage.jsx  —  Evaluation task management (Excel
//  upload + reminders), separated out from admin management
//  because they're different concerns (system admin vs. running
//  evaluation cycles). Upload history lives on its own page
//  (UploadHistoryPage) — it's a log, not part of running tasks.
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header, useModal, useClickOutside } from "../components";
import { PaginationBar } from "../components/PaginationBar";
import { authFetch } from "../utils/api";
import { isOverdue } from "../utils/date";
import { DUE_DATE_SORT_LABEL as SORT_LABEL } from "../constants";
import {
  ArrowLeft, RefreshCw, AlertCircle, Search, Upload, Send, Pencil, Trash2, X, Check,
  ArrowDownUp, MailCheck, Square, CheckSquare, Lock, History, CalendarRange,
  SlidersHorizontal,
} from "lucide-react";
import AdminUploadModal from "./AdminUploadModal";
import { DateFilterBar, DEFAULT_DATE_FILTER, matchesDateFilter } from "../utils/dateFilter";
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS, getDisplayStatus } from "../utils/statusLabels";
import { FilterChips, toggleInSet } from "../components/FilterChips";

const TASK_STATUS_COLORS = {
  pending:   { bg: "#fff8e1", color: "#f57f17", label: "รอประเมิน" },
  completed: { bg: "#e8f5e9", color: "#2e7d32", label: "ประเมินแล้ว" },
  overdue:   { bg: "#ffebee", color: "#c62828", label: "เกินกำหนด" },
};
const EVAL_TYPE_LABEL = {
  pre_eval: "Pre-Eval",
  post_eval: "Post 90d", half_year: "Half-Year", yearly: "Yearly",
};
const PAGE_SIZE = 10;

export default function TasksPage({ onBack, onUploadHistory, embedded = false }) {
  const { showAlert, showConfirm, ModalEl } = useModal();
  const [tasks,           setTasks]           = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [remindingId,     setRemindingId]     = useState(null);
  const [sendingAll,      setSendingAll]      = useState(false);
  const [sendingSelected, setSendingSelected] = useState(false);
  const [remindMsg,       setRemindMsg]       = useState(null);
  const [mainTab,         setMainTab]         = useState("active"); // 'active' | 'completed'
  const [statusFilter,    setStatusFilter]    = useState(new Set()); // sub-filter within "active": pending/overdue — empty = all
  const [typeFilter,      setTypeFilter]      = useState(new Set());
  const [dateFilter,      setDateFilter]      = useState(DEFAULT_DATE_FILTER);
  const [search,          setSearch]          = useState("");
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");
  const [sortDir,         setSortDir]         = useState("asc");
  const [page,            setPage]            = useState(1);
  const [editingId,       setEditingId]       = useState(null);
  const [editDraft,       setEditDraft]       = useState({ assignedEmail: "", dueDate: "" });
  const [savingEdit,      setSavingEdit]      = useState(false);
  const [deletingId,      setDeletingId]      = useState(null);
  const [bulkDeleting,    setBulkDeleting]    = useState(false);
  const [selected,        setSelected]        = useState(new Set());
  const [employees,       setEmployees]       = useState([]);
  const [filterOpen,      setFilterOpen]      = useState(false);
  const filterPanelRef = useRef(null);

  // เช็ค r.ok ก่อนเสมอ — เดิมใช้ .catch(() => []) เงียบๆ ทำให้ server error
  // จริง (401/500) กลายเป็น "ไม่มีงาน" แทนที่จะบอก error ที่แท้จริง
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskR, empR] = await Promise.all([
        authFetch("/api/admin/tasks"),
        authFetch("/api/employees"),
      ]);
      if (!taskR.ok || !empR.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${taskR.status}/${empR.status})`);
      const [taskRes, empRes] = await Promise.all([taskR.json(), empR.json()]);
      setTasks(Array.isArray(taskRes) ? taskRes : []);
      setEmployees(Array.isArray(empRes) ? empRes.filter(e => e.isActive) : []);
    } catch (e) {
      console.error("[TasksPage] fetchAll error:", e);
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // Email is the only thing admin edits — the name is always whatever the
  // matched employee record says, so name/email can never drift apart.
  const findEmployeeByEmail = (email) => {
    const q = email.trim().toLowerCase();
    if (!q) return null;
    return employees.find(e => e.email?.toLowerCase() === q) || null;
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filters/tab changes invalidate the current page + selection
  useEffect(() => { setPage(1); setSelected(new Set()); }, [mainTab, statusFilter, typeFilter, search, dateFrom, dateTo, dateFilter, sortDir]);

  // Close the filter popover when clicking outside of it
  useClickOutside(filterPanelRef, filterOpen, () => setFilterOpen(false));

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

  async function remindByTaskIds(taskIds, confirmLabel, confirmTitle) {
    if (taskIds.length === 0) return;
    const ok = await showConfirm(confirmLabel, confirmTitle);
    if (!ok) return false;
    try {
      const res  = await authFetch("/api/admin/tasks/remind-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setRemindMsg({ ok: true, msg: `ส่ง reminder แล้ว ${data.sent} รายการ${data.failed ? ` (ล้มเหลว ${data.failed})` : ""}` });
      await fetchAll();
      return true;
    } catch (e) {
      setRemindMsg({ ok: false, msg: e.message });
      return false;
    } finally {
      setTimeout(() => setRemindMsg(null), 4000);
    }
  }

  async function handleRemindAll() {
    setSendingAll(true);
    await remindByTaskIds(
      filteredTaskIds,
      `ส่งอีเมล Reminder ไปยังผู้รับผิดชอบของงานที่ยังไม่ประเมินทั้งหมดที่ตรงกับตัวกรองปัจจุบัน (${filteredTaskIds.length} รายการ) ใช่ไหม?`,
      "ยืนยันส่ง Reminder ทั้งหมด"
    );
    setSendingAll(false);
  }

  async function handleRemindSelected() {
    const taskIds = filtered.filter(t => selected.has(t.sessionId)).map(t => t.id);
    setSendingSelected(true);
    const ok = await remindByTaskIds(
      taskIds,
      `ส่งอีเมล Reminder ไปยังผู้รับผิดชอบของรายการที่เลือกไว้ (${selected.size} รายการ, ${taskIds.length} อีเมล) ใช่ไหม?`,
      "ยืนยันส่ง Reminder ที่เลือก"
    );
    if (ok) setSelected(new Set());
    setSendingSelected(false);
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditDraft({
      assignedEmail: t.assignedEmail || "",
      // dueDate เป็นแค่ "วันที่ปฏิทิน" ใส่ timestamp UTC เที่ยงคืนปลอมๆ มา
      // (Postgres DATE column) — ตัด string ตรงๆ แทนการพันผ่าน new Date()
      // แล้ว toISOString() ไม่งั้นจะแปลงผ่าน timezone เครื่อง ทำให้ได้วันที่
      // เพี้ยนไป 1 วันสำหรับผู้ใช้ที่อยู่ก่อน UTC (เช่นเวลาไทย UTC+7 ตอนดึกๆ)
      dueDate: t.dueDate.slice(0, 10),
    });
  }

  async function saveEdit(taskId, sessionId, currentRole) {
    const matched = findEmployeeByEmail(editDraft.assignedEmail);

    // Same guard as the backend, checked client-side first for instant feedback
    const collision = tasks.find(t =>
      t.sessionId === sessionId && t.id !== taskId && t.role !== currentRole &&
      t.assignedEmail?.toLowerCase() === editDraft.assignedEmail.trim().toLowerCase()
    );
    if (collision) {
      await showAlert(
        `email นี้ถูกมอบหมายเป็น ${collision.role} ของการประเมินนี้อยู่แล้ว คนคนเดียวไม่สามารถเป็นทั้ง GCP และ USER ของรายการเดียวกันได้`,
        "มอบหมายไม่ได้"
      );
      return;
    }

    const ok = await showConfirm(
      `บันทึกการแก้ไขผู้รับผิดชอบ/ครบกำหนดใหม่ใช่ไหม?\n\nผู้รับผิดชอบ: ${matched ? matched.fullName : "(ไม่พบในระบบ — บันทึกเป็นผู้รับเชิญภายนอก)"} (${editDraft.assignedEmail || "-"})\nครบกำหนด: ${editDraft.dueDate}`,
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

  async function handleBulkDelete(sessionIds, label) {
    if (sessionIds.length === 0) return;
    const ok = await showConfirm(
      `ลบรายการประเมิน ${sessionIds.length} รายการ${label ? ` (${label})` : ""} ใช่ไหม?\n\nใช้สำหรับแก้ไขกรณีอัพโหลดผิดเท่านั้น งานที่ประเมินเสร็จแล้วจะถูกข้ามไปโดยอัตโนมัติ`,
      "ยืนยันการลบหลายรายการ"
    );
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const res  = await authFetch("/api/admin/sessions/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setRemindMsg({
        ok: true,
        msg: `ลบสำเร็จ ${data.deleted.length} รายการ${data.skipped?.length ? ` (ข้าม ${data.skipped.length} รายการที่ประเมินเสร็จแล้ว/อยู่ระหว่างอนุมัติ)` : ""}`,
      });
      setSelected(new Set());
      await fetchAll();
    } catch (e) {
      setRemindMsg({ ok: false, msg: e.message });
    } finally {
      setBulkDeleting(false);
      setTimeout(() => setRemindMsg(null), 4000);
    }
  }

  const activeTasks    = useMemo(() => tasks.filter(t => t.status !== "completed"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(t => t.status === "completed"), [tasks]);
  const baseList = mainTab === "completed" ? completedTasks : activeTasks;

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo ? new Date(dateTo + "T23:59:59") : null;
    const list = baseList.filter(t => {
      const matchStatus = mainTab === "completed" || statusFilter.size === 0 || statusFilter.has(t.status);
      const matchType   = typeFilter.size === 0 || typeFilter.has(t.evalType);
      const due = new Date(t.dueDate);
      const matchDate = (!from || due >= from) && (!to || due <= to);
      const matchUploadDate = matchesDateFilter(t.createdAt, dateFilter);
      const q = search.trim().toLowerCase();
      const matchSearch = !q
        || t.supplierName?.toLowerCase().includes(q)
        || t.taxId?.toLowerCase().includes(q)
        || t.vendorCode?.toLowerCase().includes(q)
        || t.assignedEmail?.toLowerCase().includes(q)
        || t.assignedName?.toLowerCase().includes(q);
      return matchStatus && matchType && matchDate && matchUploadDate && matchSearch;
    });
    return [...list].sort((a, b) => {
      const da = new Date(a.dueDate).getTime();
      const db = new Date(b.dueDate).getTime();
      if (da !== db) return sortDir === "asc" ? da - db : db - da;
      return (a.supplierName || "").localeCompare(b.supplierName || "", "th");
    });
  }, [baseList, mainTab, statusFilter, typeFilter, search, dateFrom, dateTo, dateFilter, sortDir]);

  const filteredTaskIds = useMemo(() => filtered.map(t => t.id), [filtered]);
  const filteredSessionIds = useMemo(() => Array.from(new Set(filtered.map(t => t.sessionId))), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageSessionIds = useMemo(() => Array.from(new Set(pageItems.map(t => t.sessionId))), [pageItems]);

  const pendingCount = activeTasks.filter(t => t.status === "pending").length;
  const overdueCount = activeTasks.filter(t => t.status === "overdue").length;

  function toggleSelect(sessionId) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    const allSelected = pageSessionIds.length > 0 && pageSessionIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      pageSessionIds.forEach(id => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function clearDateFilter() { setDateFrom(""); setDateTo(""); }

  const activeFilterCount = [
    statusFilter.size > 0,
    typeFilter.size > 0,
    !!dateFrom || !!dateTo,
    !!dateFilter.from || !!dateFilter.to || (dateFilter.preset && dateFilter.preset !== "all"),
  ].filter(Boolean).length;

  function resetAllFilters() {
    setStatusFilter(new Set());
    setTypeFilter(new Set());
    setDateFrom("");
    setDateTo("");
    setDateFilter(DEFAULT_DATE_FILTER);
  }

  const content = (
    <>
        {!embedded && (
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
                onClick={onUploadHistory}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                  padding: "6px 12px", cursor: "pointer", fontSize: 12,
                  color: "#555", fontFamily: "Sarabun, sans-serif",
                }}
              >
                <History size={13} /> ประวัติการอัพโหลด
              </button>
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
        )}
        {embedded && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={onUploadHistory}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer", fontSize: 12,
                color: "#555", fontFamily: "Sarabun, sans-serif",
              }}
            >
              <History size={13} /> ประวัติการอัพโหลด
            </button>
          </div>
        )}
        {embedded && loading && (
          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>กำลังโหลด…</div>
        )}

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
              { label: "รอประเมิน",   value: pendingCount,        color: "#f57f17", bg: "#fff8e1" },
              { label: "เกินกำหนด",   value: overdueCount,        color: "#c62828", bg: "#ffebee" },
              { label: "เสร็จสิ้น",   value: completedTasks.length, color: "#2e7d32", bg: "#e8f5e9" },
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

        {/* ── Main tabs: active vs. completed ── */}
        <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 12, padding: 4, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "fit-content" }}>
          {[
            { key: "active",    label: `งานที่รอดำเนินการ (${activeTasks.length})` },
            { key: "completed", label: `เสร็จสิ้น (${completedTasks.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{
                padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: mainTab === t.key ? 700 : 500, fontFamily: "Sarabun, sans-serif",
                background: mainTab === t.key ? "#1b5e20" : "transparent",
                color: mainTab === t.key ? "#fff" : "#666", transition: "all .15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filter trigger */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, position: "relative" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา supplier / Tax ID / ชื่อ-email ผู้รับผิดชอบ…"
              style={{ width: "100%", paddingLeft: 32, padding: "8px 10px 8px 32px", border: "1px solid #e0e0e0", borderRadius: 7, fontFamily: "Sarabun, sans-serif", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>

          <button
            onClick={() => setFilterOpen(o => !o)}
            style={{
              position: "relative", display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 7,
              border: filterOpen ? "1px solid #1b5e20" : "1px solid #e0e0e0",
              background: filterOpen ? "#e8f5e9" : "#fff",
              color: filterOpen ? "#1b5e20" : "#555",
              fontFamily: "Sarabun, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <SlidersHorizontal size={14} /> ตัวกรอง
            {activeFilterCount > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -6, background: "#c62828", color: "#fff",
                borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <div
              ref={filterPanelRef}
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
                background: "#fff", borderRadius: 12, border: "1px solid #e0e0e0",
                boxShadow: "0 10px 32px rgba(0,0,0,0.14)", padding: 18,
                width: 380, maxWidth: "92vw", display: "flex", flexDirection: "column", gap: 16,
              }}
            >
              {mainTab === "active" && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>สถานะงาน</div>
                  <FilterChips
                    options={[{ v: "pending", l: "รอประเมิน" }, { v: "overdue", l: "เกินกำหนด" }]}
                    selected={statusFilter}
                    onToggle={v => setStatusFilter(s => toggleInSet(s, v))}
                    onClear={() => setStatusFilter(new Set())}
                  />
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>ประเภทการประเมิน</div>
                <FilterChips
                  options={[{ v: "pre_eval", l: "Pre-Eval" }, { v: "post_eval", l: "Post-Eval" }, { v: "half_year", l: "Half-Year" }, { v: "yearly", l: "Yearly" }]}
                  selected={typeFilter}
                  onToggle={v => setTypeFilter(s => toggleInSet(s, v))}
                  onClear={() => setTypeFilter(new Set())}
                  activeColor="#00695c"
                />
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <CalendarRange size={13} /> ช่วงวันครบกำหนด
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
                  />
                  <span style={{ fontSize: 12, color: "#aaa" }}>ถึง</span>
                  <input
                    type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
                  />
                  {(dateFrom || dateTo) && (
                    <button onClick={clearDateFilter} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "#666", fontFamily: "Sarabun, sans-serif" }}>
                      <X size={11} /> ล้าง
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>วันที่อัพโหลด</div>
                <DateFilterBar filter={dateFilter} onChange={setDateFilter} label="วันที่อัพโหลด" />
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>เรียงลำดับ</div>
                <button
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", color: "#555", fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer" }}
                >
                  <ArrowDownUp size={13} /> {SORT_LABEL[sortDir]}
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #eee", paddingTop: 12 }}>
                <button
                  onClick={resetAllFilters}
                  disabled={activeFilterCount === 0}
                  style={{ fontSize: 12, color: activeFilterCount === 0 ? "#bbb" : "#c62828", background: "none", border: "none", cursor: activeFilterCount === 0 ? "default" : "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 600 }}
                >
                  ล้างตัวกรองทั้งหมด
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: "#1b5e20", color: "#fff", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bulk action bar — only meaningful for not-yet-completed tasks */}
        {mainTab === "active" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button
              disabled={sendingAll || filteredTaskIds.length === 0}
              onClick={handleRemindAll}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#fff3e0", color: "#e65100", border: "1px solid #ffe0b2", borderRadius: 8,
                padding: "8px 14px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700,
                opacity: (sendingAll || filteredTaskIds.length === 0) ? 0.6 : 1,
              }}
            >
              <MailCheck size={14} /> {sendingAll ? "กำลังส่ง…" : `ส่ง Email ทั้งหมด (${filteredTaskIds.length})`}
            </button>

            <button
              disabled={bulkDeleting || filteredSessionIds.length === 0}
              onClick={() => handleBulkDelete(filteredSessionIds, "ตามตัวกรองปัจจุบัน")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 8,
                padding: "8px 14px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700,
                opacity: (bulkDeleting || filteredSessionIds.length === 0) ? 0.6 : 1,
              }}
            >
              <Trash2 size={14} /> ลบทั้งหมด ({filteredSessionIds.length})
            </button>

            {selected.size > 0 && (
              <>
                <button
                  disabled={sendingSelected}
                  onClick={handleRemindSelected}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#e65100", color: "#fff", border: "1px solid #e65100", borderRadius: 8,
                    padding: "8px 14px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700,
                    opacity: sendingSelected ? 0.6 : 1,
                  }}
                >
                  <MailCheck size={14} /> {sendingSelected ? "กำลังส่ง…" : `ส่ง Email ที่เลือก (${selected.size})`}
                </button>
                <button
                  disabled={bulkDeleting}
                  onClick={() => handleBulkDelete(Array.from(selected), "ที่เลือกไว้")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#c62828", color: "#fff", border: "1px solid #b71c1c", borderRadius: 8,
                    padding: "8px 14px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700,
                    opacity: bulkDeleting ? 0.6 : 1,
                  }}
                >
                  <Trash2 size={14} /> ลบที่เลือก ({selected.size})
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#f5f5f5", color: "#666", border: "1px solid #ddd", borderRadius: 8,
                    padding: "8px 14px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700,
                  }}
                >
                  <X size={14} /> ยกเลิกการเลือกทั้งหมด
                </button>
              </>
            )}
          </div>
        )}

        <datalist id="emp-email-list">
          {employees.filter(e => e.email).map(e => <option key={e.employeeId} value={e.email} label={`${e.fullName} (${e.role})`} />)}
        </datalist>

        {/* Tasks table */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>ไม่มีรายการ</div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde3dd", overflow: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {mainTab === "active" && (
                    <th style={{ width: 30 }}>
                      <button onClick={toggleSelectAllOnPage} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} title="เลือกทั้งหมดในหน้านี้">
                        {pageSessionIds.length > 0 && pageSessionIds.every(id => selected.has(id))
                          ? <CheckSquare size={15} color="#1b5e20" />
                          : <Square size={15} color="#aaa" />}
                      </button>
                    </th>
                  )}
                  {["Supplier","ประเภท","อัพโหลดเมื่อ","Role","ผู้รับผิดชอบ","ครบกำหนด","สถานะ","สถานะรวม","Email ล่าสุด","จัดการ"].map(h => (
                    <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(t => {
                  const sc = TASK_STATUS_COLORS[t.status] ?? TASK_STATUS_COLORS.pending;
                  const dueDate = new Date(t.dueDate);
                  const isPast = isOverdue(t.dueDate);
                  const isEditing = editingId === t.id;
                  const isCompleted = t.status === "completed";
                  return (
                    <tr key={t.id} style={isEditing ? { background: "#f8fdf8" } : undefined}>
                      {mainTab === "active" && (
                        <td style={{ padding: "10px 12px" }}>
                          <button onClick={() => toggleSelect(t.sessionId)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                            {selected.has(t.sessionId) ? <CheckSquare size={15} color="#1b5e20" /> : <Square size={15} color="#aaa" />}
                          </button>
                        </td>
                      )}
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{t.supplierName}</td>
                      <td style={{ padding: "10px 12px", fontSize: 11 }}>{EVAL_TYPE_LABEL[t.evalType] || t.evalType}</td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: t.role === "GCP" ? "#e3f2fd" : "#e8f5e9", color: t.role === "GCP" ? "#1565c0" : "#2e7d32", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{t.role}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {isEditing ? (() => {
                          const matched = findEmployeeByEmail(editDraft.assignedEmail);
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
                              <input
                                list="emp-email-list"
                                value={editDraft.assignedEmail}
                                onChange={e => setEditDraft(d => ({ ...d, assignedEmail: e.target.value }))}
                                placeholder="พิมพ์หรือเลือก email…"
                                style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "Sarabun, sans-serif" }}
                              />
                              <div style={{
                                fontSize: 11, fontStyle: matched ? "normal" : "italic",
                                color: editDraft.assignedEmail
                                  ? (matched ? "#2e7d32" : "#e65100")
                                  : "#aaa",
                              }}>
                                {editDraft.assignedEmail
                                  ? (matched ? `✓ ${matched.fullName} (${matched.role})` : "ไม่พบ email นี้ในระบบ — จะบันทึกเป็นผู้รับเชิญภายนอก")
                                  : "ชื่อจะดึงจากระบบอัตโนมัติตาม email"}
                              </div>
                            </div>
                          );
                        })() : (
                          <>
                            <div style={{ fontSize: 12 }}>{t.assignedName || "-"}</div>
                            <div style={{ fontSize: 11, color: "#aaa" }}>{t.assignedEmail}</div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: isPast && !isCompleted ? "#c62828" : "#555", fontWeight: isPast && !isCompleted ? 700 : 400 }}>
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
                      <td style={{ padding: "10px 12px" }}>
                        {(() => {
                          const overallDisplay = getDisplayStatus(t.sessionStatus, t.dueDate);
                          const oc = SESSION_STATUS_COLORS[overallDisplay] ?? { bg: "#f5f5f5", color: "#aaa" };
                          const ol = SESSION_STATUS_LABELS[overallDisplay] ?? overallDisplay;
                          return <span style={{ background: oc.bg, color: oc.color, borderRadius: 10, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{ol}</span>;
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "#888" }}>
                        {t.thankyouSentAt ? `Thank you: ${new Date(t.thankyouSentAt).toLocaleDateString("th-TH")}` :
                         t.reminderSentAt ? `Reminder: ${new Date(t.reminderSentAt).toLocaleDateString("th-TH")}` :
                         t.invitationSentAt ? `Invite: ${new Date(t.invitationSentAt).toLocaleDateString("th-TH")}` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {isCompleted ? (
                          <span title="ข้อมูลถูกบันทึกแล้ว — ไม่สามารถลบได้" style={{ display: "flex", alignItems: "center", gap: 5, color: "#aaa", fontSize: 11 }}>
                            <Lock size={12} /> บันทึกแล้ว
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            {isEditing ? (
                              <>
                                <button
                                  disabled={savingEdit}
                                  onClick={() => saveEdit(t.id, t.sessionId, t.role)}
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
                                <button
                                  disabled={remindingId === t.id}
                                  onClick={() => handleRemind(t.id, t.supplierName)}
                                  title="ส่ง Reminder"
                                  style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff3e0", color: "#e65100", border: "1px solid #ffe0b2", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontSize: 12, opacity: remindingId === t.id ? 0.6 : 1 }}
                                >
                                  <Send size={12} />
                                </button>
                                <button
                                  onClick={() => startEdit(t)}
                                  title="แก้ไขผู้รับผิดชอบ/ครบกำหนด"
                                  style={{ display: "flex", alignItems: "center", gap: 5, background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12 }}
                                >
                                  <Pencil size={12} />
                                </button>
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tasks pagination */}
        {filtered.length > 0 && (
          <PaginationBar
            page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .admin-table { width: 100%; border-collapse: collapse; }
        .admin-table thead tr { background: #eaf0ea; }
        .admin-table th {
          padding: 12px 14px; text-align: left; font-weight: 700;
          color: #3c4a3c; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px;
          border: 1px solid #cfdacf;
        }
        .admin-table td { padding: 11px 14px; border: 1px solid #e6e6e6; }
        .admin-table tbody tr:nth-child(even) { background: #fafbfa; }
        .admin-table tbody tr:hover { background: #f1f7f1; }
      `}</style>
    </>
  );

  const modals = (
    <>
      {ModalEl}
      {showUploadModal && (
        <AdminUploadModal onClose={() => { setShowUploadModal(false); fetchAll(); }} />
      )}
    </>
  );

  if (embedded) {
    return <>{modals}{content}</>;
  }

  return (
    <>
      {modals}
      <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
        <Header />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 48px" }}>
          {content}
        </div>
      </div>
    </>
  );
}

