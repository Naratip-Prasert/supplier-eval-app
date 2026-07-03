// ============================================================
//  pages/AdminPage.jsx  —  Admin management portal
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import TasksPage from "./TasksPage";
import { DateFilterBar, DEFAULT_DATE_FILTER, matchesDateFilter, todayRangeFilter } from "../utils/dateFilter";
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS, getDisplayStatus } from "../utils/statusLabels";
import { TimelineStepper } from "../components/TimelineStepper";
import { FilterChips, toggleInSet } from "../components/FilterChips";
import {
  Users, ClipboardList, Upload,
  ArrowLeft, Search, RefreshCw, X,
  AlertCircle, SlidersHorizontal,
} from "lucide-react";
import AdminCriteriaEditor from "./AdminCriteriaEditor";

// ── Constants ─────────────────────────────────────────────────
const ROLE_COLORS = {
  USER:       { bg: "#e8f5e9", color: "#1b5e20", label: "USER"       },
  GCP:        { bg: "#e3f2fd", color: "#1565c0", label: "GCP"        },
  ADMIN:      { bg: "#fce4ec", color: "#880e4f", label: "ADMIN"      },
  SUPERVISOR: { bg: "#f3e5f5", color: "#6a1b9a", label: "SUPERVISOR" },
};
const GRADE_COLORS = {
  A: "#1b5e20", B: "#1565c0", C: "#e65100", D: "#b71c1c", F: "#4a0000",
};
const TABS = [
  {
    key: "employees", label: "พนักงาน", labelEn: "Employees", icon: Users,
    color: "#1b5e20", circleBg: "radial-gradient(circle at 38% 35%, #f1f8e9, #a5d6a7 130%)",
  },
  {
    key: "tasks", label: "งานประเมิน (Upload)", labelEn: "Evaluation Tasks", icon: Upload,
    color: "#00897b", circleBg: "radial-gradient(circle at 38% 35%, #e0f7f5, #80cbc4 130%)",
  },
  {
    key: "sessions", label: "ผลและประวัติการประเมิน", labelEn: "Results & History", icon: ClipboardList,
    color: "#6a1b9a", circleBg: "radial-gradient(circle at 38% 35%, #f3e8fd, #b39ddb 130%)",
  },
  {
    key: "criteria", label: "เปลี่ยนเกณฑ์และ Parameter", labelEn: "Criteria Editor", icon: SlidersHorizontal,
    color: "#bf360c", circleBg: "radial-gradient(circle at 38% 35%, #fbe9e7, #ffab91 130%)",
  },
];
// Small count badges next to each tab label — only for counts already
// loaded at this level (tasks' pending count lives inside TasksPage itself).
const TAB_COUNTS = {
  employees: (c) => c.employees,
  sessions:  (c) => c.pendingSessions,
};

// Persisted in sessionStorage (not just component/module state) so the
// filter survives not only SPA tab navigation but also a real browser
// refresh or a frontend dev-server restart — it only resets when the
// browser tab/session itself is closed.
const ENTRY_DATE_FILTER_KEY = "admin_sessions_entryDateFilter";

function loadEntryDateFilter() {
  try {
    const raw = sessionStorage.getItem(ENTRY_DATE_FILTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed/unavailable storage */ }
  return todayRangeFilter();
}

// ── AdminPage ─────────────────────────────────────────────────
export default function AdminPage({ authUser, onBack, onViewEvaluation, onViewUploadHistory, initialSessionId, initialTab }) {
  const [tab,             setTab]             = useState(initialTab ?? (initialSessionId ? "sessions" : "employees"));
  const [employees,       setEmployees]       = useState([]);
  const [sessions,        setSessions]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [entryDateFilter, setEntryDateFilterState] = useState(loadEntryDateFilter);
  const setEntryDateFilter = useCallback((value) => {
    setEntryDateFilterState(prev => {
      const next = typeof value === "function" ? value(prev) : value;
      try { sessionStorage.setItem(ENTRY_DATE_FILTER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, sesRes] = await Promise.all([
        authFetch("/api/employees").then(r => r.json()),
        authFetch("/api/sessions").then(r => r.json()),
      ]);
      setEmployees(Array.isArray(empRes) ? empRes : []);
      setSessions(Array.isArray(sesRes) ? sesRes : []);
    } catch (e) {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const tabCounts = {
    employees:      employees.length,
    pendingSessions: sessions.filter(s => s.status === "pending" || s.status === "in_progress").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header />

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
          <span style={{ fontSize: 14, fontWeight: 700, color: "#bf360c" }}>ADMIN</span>

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

        {/* ── Tab nav (styled like the Portal module cards) ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 16, marginBottom: 28,
        }}>
          {TABS.map(t => (
            <TabCard
              key={t.key}
              tab={t}
              active={tab === t.key}
              count={TAB_COUNTS[t.key]?.(tabCounts)}
              onClick={() => setTab(t.key)}
            />
          ))}
        </div>

        {/* ── Tab content ── */}
        {tab === "employees" && <EmployeesTab employees={employees} onRefresh={fetchAll} authUser={authUser} />}
        {tab === "tasks"     && <TasksPage embedded onUploadHistory={onViewUploadHistory} />}
        {tab === "sessions"  && (
          <SessionsTab
            sessions={sessions}
            onViewEvaluation={onViewEvaluation}
            initialSessionId={initialSessionId}
            entryDateFilter={entryDateFilter}
            setEntryDateFilter={setEntryDateFilter}
          />
        )}
      </div>

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
    </div>
  );
}

// ── Employees Tab ─────────────────────────────────────────────
function EmployeesTab({ employees, onRefresh, authUser }) {
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [saving,     setSaving]     = useState(null);
  const [msg,        setMsg]        = useState(null);
  const [grantTarget, setGrantTarget] = useState(null); // employee row pending ADMIN grant

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.fullName?.toLowerCase().includes(q) ||
      e.employeeId?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q);
    const matchRole = roleFilter === "ALL" || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  const patchEmployee = async (employeeId, body) => {
    setSaving(employeeId);
    setMsg(null);
    try {
      const r = await authFetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setMsg({ type: "ok", text: "อัปเดตสำเร็จ" });
      onRefresh();
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(null);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.type === "ok" ? "#e8f5e9" : "#ffebee",
          border: `1px solid ${msg.type === "ok" ? "#a5d6a7" : "#ef9a9a"}`,
          color: msg.type === "ok" ? "#1b5e20" : "#b71c1c",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13,
        }}>
          {msg.text}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          padding: "8px 12px", flex: 1, minWidth: 200,
        }}>
          <Search size={14} style={{ color: "#bbb" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส, อีเมล, แผนก…"
            style={{ border: "none", outline: "none", fontSize: 13, flex: 1, fontFamily: "Sarabun, sans-serif" }}
          />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}><X size={12} style={{ color: "#bbb" }} /></button>}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {["ALL", "USER", "GCP", "ADMIN", "SUPERVISOR"].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                fontFamily: "Sarabun, sans-serif",
                background: roleFilter === r ? "#1b5e20" : "#fff",
                color: roleFilter === r ? "#fff" : "#666",
              }}
            >
              {r === "ALL" ? "ทั้งหมด" : r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        แสดง {filtered.length} จาก {employees.length} รายการ
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["รหัสพนักงาน", "ชื่อ-สกุล", "แผนก", "Role", "เพิ่มสิทธิ์"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((emp) => (
              <tr key={emp.employeeId}>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, color: "#555" }}>{emp.employeeId}</td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      overflow: "hidden", background: "#e8efe8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#4a6b4a",
                    }}>
                      {emp.profilePicture
                        ? <img src={emp.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : (emp.fullName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "#222" }}>{emp.fullName}</div>
                      {emp.email && <div style={{ fontSize: 11, color: "#aaa" }}>{emp.email}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "11px 14px", color: "#666", fontSize: 12 }}>
                  {emp.department ?? "—"}
                  {emp.jobTitle && <div style={{ fontSize: 11, color: "#bbb" }}>{emp.jobTitle}</div>}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{
                    background: ROLE_COLORS[emp.role]?.bg ?? "#f5f5f5",
                    color: ROLE_COLORS[emp.role]?.color ?? "#333",
                    borderRadius: 6, padding: "4px 10px",
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {emp.role}
                  </span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  {emp.role === "ADMIN" ? (
                    <span style={{ fontSize: 11, color: "#aaa" }}>เป็น ADMIN แล้ว</span>
                  ) : (
                    <button
                      onClick={() => setGrantTarget(emp)}
                      disabled={saving === emp.employeeId}
                      style={{
                        fontSize: 11, fontWeight: 700, fontFamily: "Sarabun, sans-serif",
                        padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                        border: "1px solid #ef9a9a", background: "#ffebee", color: "#c62828",
                      }}
                    >
                      เพิ่มสิทธิ์ ADMIN
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {grantTarget && (
        <VerifyAdminModal
          authUser={authUser}
          targetName={grantTarget.fullName}
          onCancel={() => setGrantTarget(null)}
          onVerified={async () => {
            const employeeId = grantTarget.employeeId;
            setGrantTarget(null);
            await patchEmployee(employeeId, { role: "ADMIN" });
          }}
        />
      )}
    </div>
  );
}

// ── Verify-self modal — re-enter own employeeId + password before
// granting another employee ADMIN, so the action can't be done by
// someone who walked up to an already-logged-in session.
function VerifyAdminModal({ authUser, targetName, onCancel, onVerified }) {
  const [employeeId, setEmployeeId] = useState(authUser?.empId ?? "");
  const [password,   setPassword]   = useState("");
  const [error,       setError]     = useState(null);
  const [verifying,   setVerifying] = useState(false);

  const handleConfirm = async () => {
    if (!employeeId.trim() || !password) {
      setError("กรุณากรอกรหัสพนักงานและรหัสผ่านของคุณ");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const r = await authFetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      onVerified();
    } catch (e) {
      setError(e.message || "ยืนยันตัวตนไม่สำเร็จ");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.48)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, width: "min(420px, 100%)", boxShadow: "0 24px 64px rgba(0,0,0,0.28)", overflow: "hidden" }}>
          <div style={{ background: "#6a1b9a", padding: "14px 20px", color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "Sarabun, sans-serif" }}>
            ยืนยันตัวตนก่อนเพิ่มสิทธิ์ ADMIN
          </div>
          <div style={{ padding: "20px 24px 8px", fontFamily: "Sarabun, sans-serif" }}>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#555" }}>
              กำลังตั้งให้ <strong>{targetName}</strong> เป็น ADMIN — กรุณายืนยันตัวตนของคุณเองก่อน
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>รหัสพนักงานของคุณ</label>
            <input
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 7, fontSize: 13, fontFamily: "Sarabun, sans-serif", boxSizing: "border-box", marginBottom: 12 }}
            />
            <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>รหัสผ่านของคุณ</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 7, fontSize: 13, fontFamily: "Sarabun, sans-serif", boxSizing: "border-box" }}
            />
            {error && <div style={{ color: "#c62828", fontSize: 12, marginTop: 10 }}>{error}</div>}
          </div>
          <div style={{ padding: "16px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={onCancel}
              style={{ background: "#f5f5f5", color: "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Sarabun, sans-serif" }}
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={verifying}
              style={{ background: "#6a1b9a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Sarabun, sans-serif", opacity: verifying ? 0.7 : 1 }}
            >
              {verifying ? "กำลังยืนยัน…" : "ยืนยันและเพิ่มสิทธิ์"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────
function SessionsTab({ sessions, onViewEvaluation, initialSessionId, entryDateFilter, setEntryDateFilter }) {
  const [search,            setSearch]            = useState("");
  const [statusFilter,      setStatusFilter]      = useState(new Set()); // empty = all
  const [evalTypeFilter,    setEvalTypeFilter]    = useState(new Set());
  const [periodFilter,      setPeriodFilter]      = useState(new Set());
  const [dateFilter,        setDateFilter]        = useState(DEFAULT_DATE_FILTER);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId ?? null);
  const [filterOpen,        setFilterOpen]        = useState(false);
  const filterPanelRef = useRef(null);

  useEffect(() => {
    if (!filterOpen) return;
    function onClickOutside(e) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [filterOpen]);

  if (selectedSessionId) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
        onViewEvaluation={(evalId) => onViewEvaluation?.(evalId, selectedSessionId)}
      />
    );
  }

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.supplierName?.toLowerCase().includes(q) ||
      s.vendorCode?.toLowerCase().includes(q) ||
      s.period?.toLowerCase().includes(q);
    // Always resolve to the same "effective" status the row's badge
    // actually shows (getDisplayStatus) — filtering by "pending" used to
    // match on the raw s.status even when the row's badge displayed
    // "Overdue", since the overdue check only ran when "overdue" itself
    // was one of the selected filters.
    const displayStatus = getDisplayStatus(s.status, s.dueDate);
    const matchStatus   = statusFilter.size === 0 || statusFilter.has(displayStatus);
    const matchEvalType = evalTypeFilter.size === 0 || evalTypeFilter.has(s.evalType);
    const matchPeriod   = periodFilter.size === 0 || s.evalType !== "post_eval" || periodFilter.has(s.period);
    const matchEntry    = matchesDateFilter(s.createdAt, entryDateFilter);
    const matchDate     = matchesDateFilter(s.completedAt, dateFilter);
    return matchSearch && matchStatus && matchEvalType && matchPeriod && matchEntry && matchDate;
  });

  const activeFilterCount = [
    statusFilter.size > 0,
    evalTypeFilter.size > 0,
    periodFilter.size > 0,
    !!entryDateFilter.from || !!entryDateFilter.to,
    !!dateFilter.from || !!dateFilter.to || (dateFilter.preset && dateFilter.preset !== "all"),
  ].filter(Boolean).length;

  function resetAllFilters() {
    setStatusFilter(new Set());
    setEvalTypeFilter(new Set());
    setPeriodFilter(new Set());
    setEntryDateFilter(DEFAULT_DATE_FILTER);
    setDateFilter(DEFAULT_DATE_FILTER);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          padding: "8px 12px", flex: 1, minWidth: 200,
        }}>
          <Search size={14} style={{ color: "#bbb" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, vendor code, period…"
            style={{ border: "none", outline: "none", fontSize: 13, flex: 1, fontFamily: "Sarabun, sans-serif" }}
          />
        </div>
        <button
          onClick={() => setFilterOpen(o => !o)}
          style={{
            position: "relative", display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            border: filterOpen ? "1px solid #6a1b9a" : "1px solid #e0e0e0",
            background: filterOpen ? "#f3e8fd" : "#fff",
            color: filterOpen ? "#6a1b9a" : "#555",
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
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>สถานะ</div>
              <FilterChips
                options={[
                  { v: "pending",        l: SESSION_STATUS_LABELS.pending },
                  { v: "in_progress",    l: SESSION_STATUS_LABELS.in_progress },
                  { v: "pending_review", l: SESSION_STATUS_LABELS.pending_review },
                  { v: "completed",      l: SESSION_STATUS_LABELS.completed },
                  { v: "returned",       l: SESSION_STATUS_LABELS.returned },
                  { v: "overdue",        l: SESSION_STATUS_LABELS.overdue },
                ]}
                selected={statusFilter}
                onToggle={v => setStatusFilter(s => toggleInSet(s, v))}
                onClear={() => setStatusFilter(new Set())}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>ประเภทการประเมิน</div>
              <FilterChips
                options={[{ v: "pre_eval", l: "Pre" }, { v: "post_eval", l: "Post" }, { v: "half_year", l: "Half-Year" }, { v: "yearly", l: "Yearly" }]}
                selected={evalTypeFilter}
                onToggle={v => setEvalTypeFilter(s => toggleInSet(s, v))}
                onClear={() => { setEvalTypeFilter(new Set()); setPeriodFilter(new Set()); }}
              />

              {/* Period sub-filter — only appears once "Post" is explicitly selected */}
              {evalTypeFilter.has("post_eval") && (
                <div style={{ marginTop: 8 }}>
                  <FilterChips
                    options={[
                      { v: "Monthly / รายเดือน",    l: "รายเดือน" },
                      { v: "Quarterly / รายไตรมาส", l: "รายไตรมาส" },
                      { v: "Semi-Annual / 6 เดือน",  l: "6 เดือน" },
                      { v: "Annual / รายปี",         l: "รายปี" },
                    ]}
                    selected={periodFilter}
                    onToggle={v => setPeriodFilter(s => toggleInSet(s, v))}
                    onClear={() => setPeriodFilter(new Set())}
                    activeColor="#1565c0"
                  />
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>วันแรกที่ประเมิน</div>
              <DateFilterBar filter={entryDateFilter} onChange={setEntryDateFilter} label="วันแรกที่ประเมิน" showPresets={false} />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>วันที่เสร็จสิ้น</div>
              <DateFilterBar filter={dateFilter} onChange={setDateFilter} label="วันที่เสร็จสิ้น" showPresets={false} />
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
                style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: "#6a1b9a", color: "#fff", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>แสดง {filtered.length} จาก {sessions.length} รายการ</div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["ซัพพลายเออร์", "ประเภทการประเมิน", "Period", "สถานะ", "วันแรกที่ประเมิน", "เสร็จสิ้นเมื่อ", "คะแนนรวม", "เกรด", "ผู้ประเมิน"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((s, i) => (
              <tr
                key={s.sessionId}
                onClick={() => setSelectedSessionId(s.sessionId)}
                style={{
                  borderBottom: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa",
                  cursor: "pointer",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0f7f0"}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}
              >
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ fontWeight: 700, color: "#222" }}>{s.supplierName}</div>
                  <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{s.vendorCode}</div>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#555" }}>
                  {{ pre_eval: "Pre-Evaluation", post_eval: "Post-Evaluation", half_year: "Half-Year", yearly: "Yearly" }[s.evalType] ?? s.evalType}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#666" }}>{s.period}</td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={s.status} dueDate={s.dueDate} /></td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString("th-TH") : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                  {s.completedAt ? new Date(s.completedAt).toLocaleDateString("th-TH") : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontWeight: 700, color: "#333" }}>
                  {s.finalScore != null ? parseFloat(s.finalScore).toFixed(2) : (
                    <span style={{ color: "#bbb" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  {s.finalGrade
                    ? <span style={{ fontWeight: 800, fontSize: 18, color: GRADE_COLORS[s.finalGrade] ?? "#333" }}>{s.finalGrade}</span>
                    : <span style={{ color: "#bbb" }}>—</span>
                  }
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(s.evaluations ?? []).map(ev => {
                      const rc = ROLE_COLORS[ev.role] ?? ROLE_COLORS.USER;
                      return (
                        <div key={ev.employeeId} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{
                            background: rc.bg, color: rc.color,
                            borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                          }}>{ev.role}</span>
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            overflow: "hidden", background: "#e8efe8",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 700, color: "#4a6b4a",
                          }}>
                            {ev.profilePicture
                              ? <img src={ev.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : (ev.fullName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                            }
                          </span>
                          <span style={{ fontSize: 11, color: "#555" }}>{ev.fullName}</span>
                          {ev.totalScore != null && (
                            <span style={{ fontSize: 10, color: "#aaa" }}>({parseFloat(ev.totalScore).toFixed(1)})</span>
                          )}
                        </div>
                      );
                    })}
                    {(s.evaluations ?? []).length === 0 && <span style={{ color: "#bbb", fontSize: 11 }}>ยังไม่มีผล</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Session Detail (drill-down from a SessionsTab row) ────────
// Shows just the evaluators who worked on this one session, each with
// their full per-criteria score breakdown — e.g. clicking a Half-Year
// session with a GCP + a USER evaluation opens this to show only
// those two people's results.
function SessionDetail({ sessionId, onBack, onViewEvaluation }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    authFetch(`/api/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("โหลดข้อมูลไม่สำเร็จ")))
      .then(setData)
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#1b5e20", fontSize: 13, fontWeight: 700,
          fontFamily: "Sarabun, sans-serif", padding: 0, marginBottom: 16,
        }}
      >
        <ArrowLeft size={15} /> กลับไปยังผลและประวัติการประเมิน
      </button>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>กำลังโหลด…</div>}

      {error && (
        <div style={{
          background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 10,
          padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
          color: "#b71c1c", fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Session summary header */}
          <div style={{
            background: "#fff", borderRadius: 14, padding: "18px 22px", marginBottom: 20,
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a1a" }}>{data.supplierName}</div>
              <div style={{ fontSize: 12, color: "#aaa", fontFamily: "monospace", marginTop: 2 }}>{data.vendorCode}</div>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {{ pre_eval: "Pre-Evaluation", post_eval: "Post-Evaluation", half_year: "Half-Year", yearly: "Yearly" }[data.evalType] ?? data.evalType}
              {" · "}{data.period}
            </div>
            <StatusBadge status={data.status} dueDate={data.dueDate} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#333" }}>
                {data.finalScore != null ? parseFloat(data.finalScore).toFixed(2) : "—"}
              </div>
              <div style={{ fontSize: 10, color: "#bbb" }}>คะแนนรวม</div>
            </div>
            {data.finalGrade && (
              <span style={{
                fontWeight: 800, fontSize: 22, color: GRADE_COLORS[data.finalGrade] ?? "#333",
              }}>{data.finalGrade}</span>
            )}
          </div>
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
            <TimelineStepper status={data.status} dueDate={data.dueDate} />
          </div>
          </div>

          {/* Evaluators — click one to open its full ResultPage (same as History) */}
          {(data.evaluations ?? []).length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>ยังไม่มีผู้ประเมินส่งผล</div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              {data.evaluations.map((ev, i) => {
                const rc = ROLE_COLORS[ev.role] ?? ROLE_COLORS.USER;
                const clickable = !!onViewEvaluation;
                return (
                  <div
                    key={ev.id}
                    onClick={() => onViewEvaluation?.(ev.id)}
                    style={{
                      padding: "16px 22px",
                      borderTop: i === 0 ? "none" : "1px solid #e0e0e0",
                      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                      cursor: clickable ? "pointer" : "default",
                    }}
                    onMouseEnter={e => clickable && (e.currentTarget.style.background = "#f8faf8")}
                    onMouseLeave={e => clickable && (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{
                      background: rc.bg, color: rc.color,
                      borderRadius: 10, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                    }}>{ev.role}</span>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      overflow: "hidden", background: "#e8efe8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#4a6b4a",
                    }}>
                      {ev.profilePicture
                        ? <img src={ev.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : (ev.fullName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#222" }}>{ev.fullName}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>
                        {ev.employeeId}{ev.department ? ` · ${ev.department}` : ""}{ev.jobTitle ? ` · ${ev.jobTitle}` : ""}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#333" }}>
                      {ev.totalScore != null ? parseFloat(ev.totalScore).toFixed(2) : "—"}
                    </div>
                    {ev.grade && (
                      <span style={{ fontWeight: 800, fontSize: 18, color: GRADE_COLORS[ev.grade] ?? "#333" }}>{ev.grade}</span>
                    )}
                    <div style={{ fontSize: 11, color: "#aaa", minWidth: 110 }}>
                      {ev.submittedAt ? new Date(ev.submittedAt).toLocaleString("th-TH") : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab Card (same visual language as PortalPage's ModuleCard) ─
function TabCard({ tab, active, count, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: "18px 14px 16px",
        textAlign: "center",
        cursor: "pointer",
        border: active ? `2px solid ${tab.color}` : "2px solid transparent",
        boxShadow: active
          ? `0 10px 28px ${tab.color}30`
          : hovered ? "0 10px 28px rgba(0,0,0,0.12)" : "0 2px 10px rgba(0,0,0,0.06)",
        transform: hovered || active ? "translateY(-4px)" : "none",
        transition: "transform .2s, box-shadow .2s, border-color .2s",
        position: "relative",
      }}
    >
      {count != null && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          background: tab.color, color: "#fff", borderRadius: 20,
          minWidth: 20, height: 20, padding: "0 6px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10.5, fontWeight: 800, boxShadow: `0 2px 6px ${tab.color}55`,
        }}>
          {count}
        </div>
      )}

      {/* Circle illustration */}
      <div style={{
        width: 78, height: 78, borderRadius: "50%",
        background: tab.circleBg,
        margin: "0 auto 12px",
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: hovered ? "scale(1.06)" : "scale(1)",
        transition: "transform .22s",
      }}>
        <Icon size={30} style={{ color: tab.color }} />
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 800, color: active ? tab.color : "#1a1a1a", marginBottom: 2, lineHeight: 1.3 }}>
        {tab.label}
      </div>
      <div style={{ fontSize: 10, color: "#bbb", fontWeight: 500, letterSpacing: 0.3 }}>
        {tab.labelEn}
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────
function StatusBadge({ status, dueDate }) {
  const display = getDisplayStatus(status, dueDate);
  const sc = SESSION_STATUS_COLORS[display] ?? { bg: "#f5f5f5", color: "#aaa" };
  const label = SESSION_STATUS_LABELS[display] ?? display;
  return (
    <span style={{
      background: sc.bg, color: sc.color,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

