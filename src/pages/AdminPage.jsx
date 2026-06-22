// ============================================================
//  pages/AdminPage.jsx  —  Admin management portal
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import TasksPage from "./TasksPage";
import { DateFilterBar, DEFAULT_DATE_FILTER, matchesDateFilter } from "../utils/dateFilter";
import {
  Users, Package, ClipboardList, Upload,
  ArrowLeft, Search, RefreshCw, Plus, X, Check,
  AlertCircle,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────
const ROLE_COLORS = {
  USER:       { bg: "#e8f5e9", color: "#1b5e20", label: "USER"       },
  GCP:        { bg: "#e3f2fd", color: "#1565c0", label: "GCP"        },
  ADMIN:      { bg: "#fce4ec", color: "#880e4f", label: "ADMIN"      },
  SUPERVISOR: { bg: "#f3e5f5", color: "#6a1b9a", label: "SUPERVISOR" },
};
const STATUS_COLORS = {
  pending:        { bg: "#fff8e1", color: "#f57f17", label: "รอการประเมิน"  },
  in_progress:    { bg: "#e3f2fd", color: "#1565c0", label: "กำลังประเมิน"  },
  pending_review: { bg: "#f3e5f5", color: "#6a1b9a", label: "รออนุมัติ"     },
  completed:      { bg: "#e8f5e9", color: "#1b5e20", label: "เสร็จสิ้น"     },
  returned:       { bg: "#ffebee", color: "#c62828", label: "ส่งคืน"        },
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
    key: "suppliers", label: "ซัพพลายเออร์", labelEn: "Suppliers", icon: Package,
    color: "#1565c0", circleBg: "radial-gradient(circle at 38% 35%, #e8f4fd, #90caf9 130%)",
  },
  {
    key: "tasks", label: "งานประเมิน (Upload)", labelEn: "Evaluation Tasks", icon: Upload,
    color: "#00897b", circleBg: "radial-gradient(circle at 38% 35%, #e0f7f5, #80cbc4 130%)",
  },
  {
    key: "sessions", label: "ผลและประวัติการประเมิน", labelEn: "Results & History", icon: ClipboardList,
    color: "#6a1b9a", circleBg: "radial-gradient(circle at 38% 35%, #f3e8fd, #b39ddb 130%)",
  },
];
// Small count badges next to each tab label — only for counts already
// loaded at this level (tasks' pending count lives inside TasksPage itself).
const TAB_COUNTS = {
  employees: (c) => c.employees,
  suppliers: (c) => c.suppliers,
  sessions:  (c) => c.pendingSessions,
};

// ── AdminPage ─────────────────────────────────────────────────
export default function AdminPage({ authUser, onBack, onViewEvaluation, initialSessionId }) {
  const [tab,             setTab]             = useState(initialSessionId ? "sessions" : "employees");
  const [employees,       setEmployees]       = useState([]);
  const [suppliers,       setSuppliers]       = useState([]);
  const [sessions,        setSessions]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, supRes, sesRes] = await Promise.all([
        authFetch("/api/employees").then(r => r.json()),
        authFetch("/api/suppliers").then(r => r.json()),
        authFetch("/api/sessions").then(r => r.json()),
      ]);
      setEmployees(Array.isArray(empRes) ? empRes : []);
      setSuppliers(Array.isArray(supRes) ? supRes : []);
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
    suppliers:      suppliers.length,
    pendingSessions: sessions.filter(s => s.status === "pending" || s.status === "in_progress").length,
  };

  return (
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
        {tab === "suppliers" && <SuppliersTab suppliers={suppliers} onRefresh={fetchAll} />}
        {tab === "tasks"     && <TasksPage authUser={authUser} embedded />}
        {tab === "sessions"  && <SessionsTab sessions={sessions} onViewEvaluation={onViewEvaluation} initialSessionId={initialSessionId} />}
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
          {["ALL", "USER", "GCP", "ADMIN"].map(r => (
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
                  <div style={{ fontWeight: 700, color: "#222" }}>{emp.fullName}</div>
                  {emp.email && <div style={{ fontSize: 11, color: "#aaa" }}>{emp.email}</div>}
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

// ── Suppliers Tab ─────────────────────────────────────────────
function SuppliersTab({ suppliers, onRefresh }) {
  const [search,   setSearch]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ vendorCode: "", supplierName: "", productType: "goods" });
  const [saving,   setSaving]   = useState(false);
  const [patchId,  setPatchId]  = useState(null);
  const [msg,      setMsg]      = useState(null);

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !q || s.vendorCode?.toLowerCase().includes(q) || s.supplierName?.toLowerCase().includes(q);
  });

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const addSupplier = async () => {
    if (!form.vendorCode.trim() || !form.supplierName.trim()) {
      return showMsg("err", "กรุณากรอก Vendor Code และชื่อ");
    }
    setSaving(true);
    try {
      const r = await authFetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      showMsg("ok", "เพิ่มซัพพลายเออร์สำเร็จ");
      setShowForm(false);
      setForm({ vendorCode: "", supplierName: "", productType: "goods" });
      onRefresh();
    } catch (e) {
      showMsg("err", e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (vendorCode, current) => {
    setPatchId(vendorCode);
    try {
      const r = await authFetch(`/api/suppliers/${vendorCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      onRefresh();
    } catch (e) {
      showMsg("err", e.message);
    } finally {
      setPatchId(null);
    }
  };

  const PRODUCT_LABELS = { goods: "สินค้า", services: "บริการ", both: "สินค้า+บริการ" };

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

      {/* Add form */}
      {showForm && (
        <div style={{
          background: "#fff", border: "1.5px solid #a5d6a7", borderRadius: 12,
          padding: "20px 22px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#1b5e20" }}>เพิ่มซัพพลายเออร์ใหม่</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Vendor Code *</label>
              <input
                value={form.vendorCode}
                onChange={e => setForm(f => ({ ...f, vendorCode: e.target.value }))}
                placeholder="SUP-XXX"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>ชื่อซัพพลายเออร์ *</label>
              <input
                value={form.supplierName}
                onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                placeholder="ชื่อบริษัท..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>ประเภท</label>
              <select value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value }))} style={inputStyle}>
                <option value="goods">สินค้า</option>
                <option value="services">บริการ</option>
                <option value="both">สินค้า+บริการ</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={addSupplier} disabled={saving} style={btnStyle("#1b5e20", "#fff")}>
                {saving ? "…" : <><Check size={13} /> บันทึก</>}
              </button>
              <button onClick={() => setShowForm(false)} style={btnStyle("#f5f5f5", "#666", "#e0e0e0")}>
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + add button */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          padding: "8px 12px", flex: 1,
        }}>
          <Search size={14} style={{ color: "#bbb" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา vendor code หรือชื่อ…"
            style={{ border: "none", outline: "none", fontSize: 13, flex: 1, fontFamily: "Sarabun, sans-serif" }}
          />
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={btnStyle("#1b5e20", "#fff")}
        >
          <Plus size={14} /> เพิ่มซัพพลายเออร์
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>แสดง {filtered.length} รายการ</div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Vendor Code", "ชื่อซัพพลายเออร์", "ประเภท", "สถานะ", "จัดการ"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((s) => (
              <tr key={s.vendorCode}>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1565c0" }}>{s.vendorCode}</td>
                <td style={{ padding: "11px 14px", fontWeight: 600, color: "#222" }}>{s.supplierName}</td>
                <td style={{ padding: "11px 14px", color: "#666", fontSize: 12 }}>{PRODUCT_LABELS[s.productType] ?? s.productType}</td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{
                    background: s.isActive !== false ? "#e8f5e9" : "#f5f5f5",
                    color: s.isActive !== false ? "#1b5e20" : "#aaa",
                    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                  }}>
                    {s.isActive !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <button
                    onClick={() => toggleActive(s.vendorCode, s.isActive !== false)}
                    disabled={patchId === s.vendorCode}
                    style={{
                      fontSize: 11, fontWeight: 700, fontFamily: "Sarabun, sans-serif",
                      padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid",
                      borderColor: s.isActive !== false ? "#ef9a9a" : "#a5d6a7",
                      background: s.isActive !== false ? "#ffebee" : "#e8f5e9",
                      color: s.isActive !== false ? "#b71c1c" : "#1b5e20",
                    }}
                  >
                    {patchId === s.vendorCode ? "…" : s.isActive !== false ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────
function SessionsTab({ sessions, onViewEvaluation, initialSessionId }) {
  const [search,            setSearch]            = useState("");
  const [statusFilter,      setStatusFilter]      = useState("ALL");
  const [dateFilter,        setDateFilter]        = useState(DEFAULT_DATE_FILTER);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId ?? null);

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
    const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
    const matchDate   = matchesDateFilter(s.completedAt, dateFilter);
    return matchSearch && matchStatus && matchDate;
  });

  return (
    <div>
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
            placeholder="ค้นหาชื่อ, vendor code, period…"
            style={{ border: "none", outline: "none", fontSize: 13, flex: 1, fontFamily: "Sarabun, sans-serif" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { v: "ALL",         l: "ทั้งหมด"    },
            { v: "pending",     l: "รอประเมิน"  },
            { v: "in_progress", l: "กำลังประเมิน" },
            { v: "completed",   l: "เสร็จสิ้น"  },
          ].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid #e0e0e0",
                cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "Sarabun, sans-serif",
                background: statusFilter === v ? "#1b5e20" : "#fff",
                color: statusFilter === v ? "#fff" : "#666",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <DateFilterBar filter={dateFilter} onChange={setDateFilter} label="วันที่เสร็จสิ้น" />
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>แสดง {filtered.length} จาก {sessions.length} รายการ</div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["ซัพพลายเออร์", "ประเภทการประเมิน", "Period", "สถานะ", "เสร็จสิ้นเมื่อ", "คะแนนรวม", "เกรด", "ผู้ประเมิน"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
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
                <td style={{ padding: "11px 14px" }}><StatusBadge status={s.status} /></td>
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
            display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a1a" }}>{data.supplierName}</div>
              <div style={{ fontSize: 12, color: "#aaa", fontFamily: "monospace", marginTop: 2 }}>{data.vendorCode}</div>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {{ pre_eval: "Pre-Evaluation", post_eval: "Post-Evaluation", half_year: "Half-Year", yearly: "Yearly" }[data.evalType] ?? data.evalType}
              {" · "}{data.period}
            </div>
            <StatusBadge status={data.status} />
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
function StatusBadge({ status }) {
  const sc = STATUS_COLORS[status] ?? { bg: "#f5f5f5", color: "#aaa", label: status };
  return (
    <span style={{
      background: sc.bg, color: sc.color,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
    }}>
      {sc.label}
    </span>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 7,
  fontSize: 13, fontFamily: "Sarabun, sans-serif", outline: "none",
  boxSizing: "border-box",
};

function btnStyle(bg, color, borderColor) {
  return {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 8,
    border: `1px solid ${borderColor ?? bg}`,
    background: bg, color, cursor: "pointer",
    fontSize: 13, fontWeight: 700, fontFamily: "Sarabun, sans-serif",
    whiteSpace: "nowrap",
  };
}
