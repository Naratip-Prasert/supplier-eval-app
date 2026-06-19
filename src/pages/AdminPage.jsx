// ============================================================
//  pages/AdminPage.jsx  —  Admin management portal
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import {
  Users, Package, ClipboardList, BarChart2,
  ArrowLeft, Search, RefreshCw, Plus, X, Check,
  ChevronDown, AlertCircle,
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
  { key: "overview",   label: "ภาพรวม",       icon: BarChart2     },
  { key: "employees",  label: "พนักงาน",       icon: Users         },
  { key: "suppliers",  label: "ซัพพลายเออร์", icon: Package       },
  { key: "sessions",   label: "ผลการประเมิน",  icon: ClipboardList },
];

// ── AdminPage ─────────────────────────────────────────────────
export default function AdminPage({ authUser, onBack }) {
  const [tab,             setTab]             = useState("overview");
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

  const stats = {
    employees:  employees.length,
    active:     employees.filter(e => e.isActive).length,
    suppliers:  suppliers.length,
    sessions:   sessions.length,
    completed:  sessions.filter(s => s.status === "completed").length,
    pending:    sessions.filter(s => s.status === "pending").length,
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
          <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>จัดการระบบ</span>

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

        {/* ── Tab nav ── */}
        <div style={{
          display: "flex", gap: 4, background: "#fff",
          borderRadius: 12, padding: 4, marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "fit-content",
        }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "8px 16px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
                  fontFamily: "Sarabun, sans-serif",
                  background: active ? "#1b5e20" : "transparent",
                  color: active ? "#fff" : "#666",
                  transition: "all .15s",
                }}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        {tab === "overview"  && <OverviewTab stats={stats} sessions={sessions} employees={employees} />}
        {tab === "employees" && <EmployeesTab employees={employees} onRefresh={fetchAll} />}
        {tab === "suppliers" && <SuppliersTab suppliers={suppliers} onRefresh={fetchAll} />}
        {tab === "sessions"  && <SessionsTab sessions={sessions} />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ stats, sessions, employees }) {
  const cards = [
    { label: "พนักงานทั้งหมด", value: stats.employees, sub: `${stats.active} active`, color: "#1b5e20", bg: "#e8f5e9" },
    { label: "ซัพพลายเออร์",  value: stats.suppliers, sub: "ทั้งหมด",               color: "#1565c0", bg: "#e3f2fd" },
    { label: "Session ทั้งหมด", value: stats.sessions,  sub: "ทั้งหมด",     color: "#6a1b9a", bg: "#f3e5f5" },
    { label: "รอประเมิน",      value: stats.pending,   sub: "pending",      color: "#f57f17", bg: "#fff8e1" },
    { label: "เสร็จสิ้น",      value: stats.completed, sub: "completed",    color: "#1b5e20", bg: "#e8f5e9" },
  ];

  const recentSessions = sessions.slice(0, 8);
  const roleDist = ["USER", "GCP", "ADMIN"].map(r => ({
    role: r,
    count: employees.filter(e => e.role === r).length,
  }));

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: "#fff", borderRadius: 12, padding: "14px 16px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            borderLeft: `4px solid ${c.color}`,
          }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#bbb", marginTop: 3 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        {/* Recent sessions */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#333" }}>Session ล่าสุด</div>
          {recentSessions.length === 0
            ? <div style={{ color: "#bbb", fontSize: 13, textAlign: "center", padding: "20px 0" }}>ยังไม่มีข้อมูล</div>
            : recentSessions.map(s => (
              <div key={s.sessionId} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", borderBottom: "1px solid #f5f5f5",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.supplierName}
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{s.vendorCode} · {s.period}</div>
                </div>
                <StatusBadge status={s.status} />
                {s.finalGrade && (
                  <span style={{
                    fontWeight: 800, fontSize: 16,
                    color: GRADE_COLORS[s.finalGrade] ?? "#333",
                    minWidth: 20, textAlign: "center",
                  }}>{s.finalGrade}</span>
                )}
              </div>
            ))
          }
        </div>

        {/* Role distribution */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#333" }}>สัดส่วน Role</div>
          {roleDist.map(({ role, count }) => {
            const rc = ROLE_COLORS[role];
            const pct = stats.employees > 0 ? Math.round((count / stats.employees) * 100) : 0;
            return (
              <div key={role} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: rc.color }}>{role}</span>
                  <span style={{ fontSize: 12, color: "#999" }}>{count} คน ({pct}%)</span>
                </div>
                <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6 }}>
                  <div style={{
                    width: `${pct}%`, height: 6, borderRadius: 4,
                    background: rc.color, transition: "width .4s",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Employees Tab ─────────────────────────────────────────────
function EmployeesTab({ employees, onRefresh }) {
  const [search,   setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [saving,   setSaving]   = useState(null);
  const [msg,      setMsg]      = useState(null);

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
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f8f8", borderBottom: "1px solid #eee" }}>
              {["รหัสพนักงาน", "ชื่อ-สกุล", "แผนก", "Role", "สถานะ", "จัดการ"].map(h => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#555", fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((emp, i) => (
              <tr key={emp.employeeId} style={{ borderBottom: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
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
                  <RoleSelect
                    current={emp.role}
                    disabled={saving === emp.employeeId}
                    onChange={role => patchEmployee(emp.employeeId, { role })}
                  />
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{
                    background: emp.isActive ? "#e8f5e9" : "#f5f5f5",
                    color: emp.isActive ? "#1b5e20" : "#aaa",
                    borderRadius: 20, padding: "2px 10px",
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {emp.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <button
                    onClick={() => patchEmployee(emp.employeeId, { isActive: !emp.isActive })}
                    disabled={saving === emp.employeeId}
                    style={{
                      fontSize: 11, fontWeight: 700, fontFamily: "Sarabun, sans-serif",
                      padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid",
                      borderColor: emp.isActive ? "#ef9a9a" : "#a5d6a7",
                      background: emp.isActive ? "#ffebee" : "#e8f5e9",
                      color: emp.isActive ? "#b71c1c" : "#1b5e20",
                    }}
                  >
                    {saving === emp.employeeId ? "…" : emp.isActive ? "Deactivate" : "Activate"}
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

function RoleSelect({ current, onChange, disabled }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={current}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          appearance: "none", border: "1px solid #e0e0e0", borderRadius: 6,
          padding: "4px 26px 4px 10px", fontSize: 12, fontWeight: 700,
          fontFamily: "Sarabun, sans-serif", cursor: "pointer",
          background: ROLE_COLORS[current]?.bg ?? "#f5f5f5",
          color: ROLE_COLORS[current]?.color ?? "#333",
        }}
      >
        <option value="USER">USER</option>
        <option value="GCP">GCP</option>
        <option value="ADMIN">ADMIN</option>
      </select>
      <ChevronDown size={12} style={{ position: "absolute", right: 7, pointerEvents: "none", color: ROLE_COLORS[current]?.color ?? "#333" }} />
    </div>
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

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f8f8", borderBottom: "1px solid #eee" }}>
              {["Vendor Code", "ชื่อซัพพลายเออร์", "ประเภท", "สถานะ", "จัดการ"].map(h => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#555", fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.vendorCode} style={{ borderBottom: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
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
function SessionsTab({ sessions }) {
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("ALL");

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.supplierName?.toLowerCase().includes(q) ||
      s.vendorCode?.toLowerCase().includes(q) ||
      s.period?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
    return matchSearch && matchStatus;
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

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>แสดง {filtered.length} จาก {sessions.length} รายการ</div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f8f8", borderBottom: "1px solid #eee" }}>
              {["ซัพพลายเออร์", "ประเภทการประเมิน", "Period", "สถานะ", "คะแนนรวม", "เกรด", "ผู้ประเมิน"].map(h => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#555", fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.sessionId} style={{ borderBottom: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ fontWeight: 700, color: "#222" }}>{s.supplierName}</div>
                  <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{s.vendorCode}</div>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#555" }}>
                  {s.evalType === "new_supplier" ? "Pre-Evaluation" : "Post-Evaluation"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#666" }}>{s.period}</td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={s.status} /></td>
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
