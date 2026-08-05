// ============================================================
//  app/(app)/admin/page.tsx  —  Admin management portal
//  Tabs are UI state within one page (not separate routable
//  resources) — kept as a `?tab=` searchParam rather than
//  sub-routes, matching how AdminPage.jsx's tab state worked.
// ============================================================
"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header, useClickOutside } from "@/components";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { useAuth, type AuthUser } from "@/context/AuthContext";
import { authFetch } from "@/utils/api";
import TasksPanel from "@/components/admin/TasksPanel";
import AdminCriteriaEditor from "@/components/admin/AdminCriteriaEditor";
import EmailSettingsEditor from "@/components/admin/EmailSettingsEditor";
import { DateFilterBar, DEFAULT_DATE_FILTER, matchesDateFilter, type DateFilter } from "@/utils/shared/dateFilter";
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS, getDisplayStatus } from "@/utils/shared/statusLabels";
import { TimelineStepper } from "@/components/shared/TimelineStepper";
import { FilterChips, toggleInSet } from "@/components/shared/FilterChips";
import { SortableTh, nextSort, type SortState } from "@/components/shared/SortableTh";
import {
  Users, ClipboardList, Upload, Building2,
  ArrowLeft, Search, RefreshCw, X, ChevronDown, ChevronRight,
  AlertCircle, SlidersHorizontal, Star, Mail, type LucideIcon,
} from "lucide-react";
import { ROLE_THEME, GRADE_COLOR } from "@/styles/theme";

// ── Constants ─────────────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = Object.fromEntries(
  Object.entries(ROLE_THEME).map(([role, { main, bg }]) => [role, { bg, color: main, label: role }])
);
const GRADE_COLORS: Record<string, string> = GRADE_COLOR;

interface TabDef {
  key: string;
  label: string;
  labelEn: string;
  icon: LucideIcon;
  color: string;
  circleBg: string;
  group: "data" | "settings";
}

const TABS: TabDef[] = [
  {
    key: "employees", label: "พนักงาน", labelEn: "Employees", icon: Users,
    color: "#1b5e20", circleBg: "radial-gradient(circle at 38% 35%, #f1f8e9, #a5d6a7 130%)",
    group: "data",
  },
  {
    key: "suppliers", label: "ซัพพลายเออร์", labelEn: "Suppliers", icon: Building2,
    color: "#3949ab", circleBg: "radial-gradient(circle at 38% 35%, #e8eaf6, #9fa8da 130%)",
    group: "data",
  },
  {
    key: "tasks", label: "งานประเมิน (Upload)", labelEn: "Evaluation Tasks", icon: Upload,
    color: "#00897b", circleBg: "radial-gradient(circle at 38% 35%, #e0f7f5, #80cbc4 130%)",
    group: "data",
  },
  {
    key: "sessions", label: "ผลและประวัติการประเมิน", labelEn: "Results & History", icon: ClipboardList,
    color: "#6a1b9a", circleBg: "radial-gradient(circle at 38% 35%, #f3e8fd, #b39ddb 130%)",
    group: "data",
  },
  {
    key: "serviceEval", label: "ผลประเมินเชิงบริการ", labelEn: "Service Feedback", icon: Star,
    color: "#e65100", circleBg: "radial-gradient(circle at 38% 35%, #fff3e0, #ffcc80 130%)",
    group: "data",
  },
  {
    key: "criteria", label: "เปลี่ยนเกณฑ์และ Parameter", labelEn: "Criteria Editor", icon: SlidersHorizontal,
    color: "#bf360c", circleBg: "radial-gradient(circle at 38% 35%, #fbe9e7, #ffab91 130%)",
    group: "settings",
  },
  {
    key: "emailParams", label: "Email Parameter", labelEn: "Email Settings", icon: Mail,
    color: "#1565c0", circleBg: "radial-gradient(circle at 38% 35%, #e3f2fd, #90caf9 130%)",
    group: "settings",
  },
];
const TAB_GROUPS: { key: "data" | "settings"; label: string }[] = [
  { key: "data",     label: "ข้อมูลและการประเมิน" },
  { key: "settings", label: "ตั้งค่าระบบ" },
];
// Small count badges next to each tab label — only for counts already
// loaded at this level (tasks' pending count lives inside TasksPanel itself).
const TAB_COUNTS: Record<string, (c: { employees: number; pendingSessions: number }) => number> = {
  employees: (c) => c.employees,
  sessions:  (c) => c.pendingSessions,
};

interface Employee {
  employeeId: string;
  fullName: string;
  email?: string;
  role: string;
  department?: string;
  jobTitle?: string;
  profilePicture?: string | null;
  isActive?: boolean;
}

interface SessionRow {
  sessionId: string;
  vendorCode: string;
  supplierName: string;
  evalType: string;
  period: string;
  status: string;
  dueDate?: string;
  finalScore?: number | string | null;
  finalGrade?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  evaluations?: { employeeId: string; role: string; fullName: string; profilePicture?: string | null; totalScore?: number | string | null }[];
}

type SessionSortKey = "evalType" | "period" | "completedAt" | "score" | "grade" | "round";

function compareSessions(a: SessionRow, b: SessionRow, key: SessionSortKey, roundIndexBySession: Record<string, number>): number {
  switch (key) {
    case "evalType":    return (a.evalType || "").localeCompare(b.evalType || "");
    case "period":      return (a.period || "").localeCompare(b.period || "");
    case "completedAt": return new Date(a.completedAt ?? a.createdAt ?? 0).getTime() - new Date(b.completedAt ?? b.createdAt ?? 0).getTime();
    case "score": {
      const av = a.finalScore != null ? parseFloat(String(a.finalScore)) : -Infinity;
      const bv = b.finalScore != null ? parseFloat(String(b.finalScore)) : -Infinity;
      return av - bv;
    }
    case "grade": return (a.finalGrade || "￿").localeCompare(b.finalGrade || "￿");
    case "round": return (roundIndexBySession[a.sessionId] ?? 0) - (roundIndexBySession[b.sessionId] ?? 0);
  }
}

// ── AdminPage ─────────────────────────────────────────────────
function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const initialSessionId = searchParams.get("sessionId");
  const { user: authUser } = useAuth();

  const [tab,             setTab]             = useState(initialTab ?? (initialSessionId ? "sessions" : "employees"));
  const [employees,       setEmployees]       = useState<Employee[]>([]);
  const [sessions,        setSessions]        = useState<SessionRow[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const onViewEvaluation = (evalId: string, sessionId: string) =>
    router.push(`/evaluations/${evalId}?from=admin&sessionId=${sessionId}`);
  const onViewUploadHistory = () => router.push("/admin/upload-history");

  // เช็ค r.ok ก่อนแปลง JSON เสมอ — ไม่งั้น error body ของ server (เช่น 500)
  // จะถูกตีความเป็นข้อมูลจริงแล้วค่อยถูก Array.isArray กรองทิ้งเป็น [] เงียบๆ
  // ผู้ใช้จะเห็นว่า "ไม่มีข้อมูล" ทั้งที่จริงคือ server error
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empR, sesR] = await Promise.all([
        authFetch("/api/employees"),
        authFetch("/api/sessions"),
      ]);
      if (!empR.ok || !sesR.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${empR.status}/${sesR.status})`);
      const [empRes, sesRes] = await Promise.all([empR.json(), sesR.json()]);
      setEmployees(Array.isArray(empRes) ? empRes : []);
      setSessions(Array.isArray(sesRes) ? sesRes : []);
    } catch (e) {
      console.error("[AdminPage] fetchAll error:", e);
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
            onClick={() => router.push("/portal")}
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

        {/* ── Tab nav (styled like the Portal module cards), grouped so a
             6-card list ends in a clean rectangle per group instead of an
             auto-fit remainder row ── */}
        {TAB_GROUPS.map(g => (
          <div key={g.key} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 700, color: "#8a978a",
              textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
            }}>
              {g.label}
            </div>
            <div style={{
              // auto-fill (not auto-fit) so a short group (e.g. 2 settings
              // cards) keeps the same card width as a full group instead of
              // stretching to fill the row — consistent card size across
              // groups matters more here than filling whitespace.
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 16,
            }}>
              {TABS.filter(t => t.group === g.key).map(t => (
                <TabCard
                  key={t.key}
                  tab={t}
                  active={tab === t.key}
                  count={TAB_COUNTS[t.key]?.(tabCounts)}
                  onClick={() => setTab(t.key)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* ── Tab content ── */}
        {tab === "employees" && <EmployeesTab employees={employees} onRefresh={fetchAll} authUser={authUser} />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "tasks"     && <TasksPanel embedded />}
        {tab === "sessions"  && (
          <SessionsTab
            sessions={sessions}
            onViewEvaluation={onViewEvaluation}
            initialSessionId={initialSessionId}
          />
        )}
        {tab === "criteria"  && <AdminCriteriaEditor />}
        {tab === "serviceEval" && <ServiceEvalTab />}
        {tab === "emailParams" && <EmailSettingsEditor />}
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

// พ.ศ. dd/mm/yyyy — matches the date format used elsewhere in the Admin
// upload/task tables, so this new tab doesn't introduce a different style.
function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const buddhistYear = d.getFullYear() + 543;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${buddhistYear}`;
}

interface ServiceEvalRow {
  id: string;
  supplierName: string;
  targetFullName: string;
  targetEmpCode: string;
  targetRole: string;
  evaluatorName: string;
  evaluatorCode: string;
  evaluatorRoleLabel: string;
  period: string;
  submittedAt: string;
  totalScore: number | string;
}

// ── Service Feedback Tab ─────────────────────────────────────
// Cross-eval #3/#4 detail (database/CROSS_EVALUATION_SPEC.md) — one row
// per service_evaluations record: who was rated, by whom (Supplier or
// User), which round, when, and the score — not aggregated, so an admin
// can trace any score back to its exact evaluation.
function ServiceEvalTab() {
  const [rows,    setRows]    = useState<ServiceEvalRow[] | null>(null); // null = loading
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    authFetch("/api/admin/service-evaluations")
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  const filtered = (rows ?? []).filter(r => {
    const q = search.toLowerCase();
    return !q ||
      r.supplierName?.toLowerCase().includes(q) ||
      r.targetFullName?.toLowerCase().includes(q) || r.targetEmpCode?.toLowerCase().includes(q) ||
      r.evaluatorName?.toLowerCase().includes(q)   || r.evaluatorCode?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#aaa" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่องานประเมิน/ชื่อพนักงาน/ผู้ประเมิน"
          style={{
            width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10,
            border: "1.5px solid #e0e0e0", fontSize: 13, fontFamily: "Sarabun, sans-serif",
          }}
        />
      </div>

      {rows === null && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด...</div>}

      {rows?.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>ยังไม่มีผลประเมินเชิงบริการเข้ามา</div>
      )}

      {filtered.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa", textAlign: "left" }}>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>Supplier</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>พนักงาน</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>Role</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>Evaluator</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>Role-Evaluator</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>รอบประเมิน</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5 }}>วันที่ประเมิน</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5, textAlign: "right" }}>คะแนน</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#2a2a2a" }}>{r.supplierName}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#2a2a2a" }}>{r.targetFullName}</div>
                    <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{r.targetEmpCode}</div>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{r.targetRole}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#2a2a2a" }}>{r.evaluatorName}</div>
                    <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{r.evaluatorCode}</div>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{r.evaluatorRoleLabel}</td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{r.period}</td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{formatThaiDate(r.submittedAt)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "#e65100" }}>{r.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface SupplierRow {
  vendorCode: string;
  supplierName: string;
  productType: string;
  taxId?: string | null;
  category?: string | null;
  functionOwner?: string | null;
  jobValueThb?: number | null;
  ptaApproveDate?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  evaluatorName?: string | null;
  evaluatorEmail?: string | null;
  contactEmail?: string | null;
  isActive: boolean;
  createdAt: string;
}

const PRODUCT_TYPE_LABEL: Record<string, string> = { goods: "สินค้า", services: "บริการ", both: "สินค้า+บริการ" };
const SUPPLIERS_PAGE_SIZE = 10;

// ── Suppliers Tab — view-only directory, same fields an Excel upload row
// carries. No create/edit here; that stays as upload/API-driven only. ──
function SuppliersTab() {
  const [rows,   setRows]   = useState<SupplierRow[] | null>(null); // null = loading
  const [search, setSearch] = useState("");
  const [typeFilter,   setTypeFilter]   = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [isSyncing, setIsSyncing] = useState(false);

  const loadSuppliers = useCallback(() => {
    // We don't setRows(null) to avoid full flicker on re-sync, but we could.
    authFetch("/api/admin/suppliers")
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const handleSyncNames = async () => {
    if (!window.confirm("ยืนยันการซิงก์ข้อมูล Buyer และ Evaluator จาก Master Data?")) return;
    setIsSyncing(true);
    try {
      const res = await authFetch("/api/admin/suppliers/sync-names", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`ซิงก์ข้อมูลสำเร็จ\n- อัปเดต Buyer: ${data.buyersUpdated} รายการ\n- อัปเดต Evaluator: ${data.evaluatorsUpdated} รายการ\n- อัปเดต Tasks (ที่ยังไม่เสร็จ): ${data.tasksUpdated || 0} รายการ`);
        loadSuppliers();
      } else {
        alert("เกิดข้อผิดพลาด: " + data.message);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Any filter change should snap back to page 1 — otherwise a narrower
  // result set can leave the view stuck on a now-nonexistent later page.
  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter, minValue, maxValue]);

  const min = minValue.trim() === "" ? null : Number(minValue);
  const max = maxValue.trim() === "" ? null : Number(maxValue);

  const filtered = (rows ?? []).filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.supplierName?.toLowerCase().includes(q) || r.vendorCode?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q)      || r.taxId?.toLowerCase().includes(q);
    const matchType   = typeFilter.size === 0   || typeFilter.has(r.productType);
    const matchStatus = statusFilter.size === 0 || statusFilter.has(r.isActive ? "active" : "inactive");
    // A supplier with no recorded job value can't fall inside any
    // specific range the admin asks for, so it's excluded once either
    // bound is set — same "missing data ≠ a match" reasoning as the
    // other filters, just for a number range instead of a fixed set.
    const matchValue = (min === null && max === null) ? true :
      r.jobValueThb != null && (min === null || r.jobValueThb >= min) && (max === null || r.jobValueThb <= max);
    return matchSearch && matchType && matchStatus && matchValue;
  });

  const groupedSuppliers = useMemo(() => {
    const groups = new Map<string, SupplierRow[]>();
    for (const r of filtered) {
      const key = r.vendorCode || r.supplierName || String(r.id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    // Sort each group so newest (highest ID or newest ptaApproveDate) is first
    const arr = Array.from(groups.values());
    for (const group of arr) {
      group.sort((a, b) => b.id - a.id);
    }
    return arr;
  }, [filtered]);

  const totalPages  = Math.max(1, Math.ceil(groupedSuppliers.length / SUPPLIERS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageGroups  = groupedSuppliers.slice((pageClamped - 1) * SUPPLIERS_PAGE_SIZE, pageClamped * SUPPLIERS_PAGE_SIZE);

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={handleSyncNames}
          disabled={isSyncing}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
            background: "#3949ab", color: "#fff", border: "none", borderRadius: 8,
            cursor: isSyncing ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
            opacity: isSyncing ? 0.7 : 1, whiteSpace: "nowrap"
          }}
        >
          <RefreshCw size={14} className={isSyncing ? "spin-icon" : ""} />
          {isSyncing ? "กำลังซิงก์..." : "ซิงก์รายชื่อกับ Master"}
        </button>
        <div style={{ position: "relative", width: 320, flexShrink: 0 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#aaa" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส vendor, หมวดหมู่, เลขผู้เสียภาษี"
            style={{
              width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, boxSizing: "border-box",
              border: "1.5px solid #e0e0e0", fontSize: 13, fontFamily: "Sarabun, sans-serif",
            }}
          />
        </div>
        <FilterChips
          options={[{ v: "goods", l: "สินค้า" }, { v: "services", l: "บริการ" }, { v: "both", l: "สินค้า+บริการ" }]}
          selected={typeFilter}
          onToggle={v => setTypeFilter(s => toggleInSet(s, v))}
          onClear={() => setTypeFilter(new Set())}
          activeColor="#3949ab"
        />
        <FilterChips
          options={[{ v: "active", l: "ใช้งานอยู่" }, { v: "inactive", l: "ปิดใช้งาน" }]}
          selected={statusFilter}
          onToggle={v => setStatusFilter(s => toggleInSet(s, v))}
          onClear={() => setStatusFilter(new Set())}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#888" }}>มูลค่างาน (THB)</span>
          <input
            type="number" min={0} inputMode="numeric"
            value={minValue}
            onChange={e => setMinValue(e.target.value)}
            placeholder="ตั้งแต่"
            style={{
              width: 100, padding: "8px 10px", borderRadius: 8, boxSizing: "border-box",
              border: "1.5px solid #e0e0e0", fontSize: 12.5, fontFamily: "Sarabun, sans-serif",
            }}
          />
          <span style={{ color: "#bbb" }}>–</span>
          <input
            type="number" min={0} inputMode="numeric"
            value={maxValue}
            onChange={e => setMaxValue(e.target.value)}
            placeholder="ถึง"
            style={{
              width: 100, padding: "8px 10px", borderRadius: 8, boxSizing: "border-box",
              border: "1.5px solid #e0e0e0", fontSize: 12.5, fontFamily: "Sarabun, sans-serif",
            }}
          />
          {(minValue || maxValue) && (
            <button
              onClick={() => { setMinValue(""); setMaxValue(""); }}
              style={{
                display: "flex", alignItems: "center", background: "none", border: "none",
                cursor: "pointer", color: "#bbb", padding: 2,
              }}
              title="ล้างตัวกรองมูลค่างาน"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {rows === null && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด...</div>}

      {rows?.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>ยังไม่มีซัพพลายเออร์ในระบบ</div>
      )}

      {rows !== null && rows.length > 0 && (
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
          แสดง {groupedSuppliers.length} บริษัท ({filtered.length} โปรเจกต์)
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "auto", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa", textAlign: "left" }}>
                <th style={{ width: 40, padding: "10px 16px" }}></th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>Supplier</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>Tax ID</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>ประเภท</th>
                <th style={{ padding: "10px 16px", color: "#888", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>หมวดหมู่</th>
              </tr>
            </thead>
            <tbody>
              {pageGroups.map(group => {
                const main = group[0];
                const key = main.vendorCode || String(main.id);
                const isExpanded = expandedGroups.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr 
                      style={{ borderTop: "1px solid #f0f0f0", cursor: "pointer", background: isExpanded ? "#f8f9fa" : "#fff" }}
                      onClick={() => {
                        setExpandedGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                    >
                      <td style={{ padding: "10px 16px", color: "#aaa" }}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#2a2a2a" }}>{main.supplierName}</div>
                        <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{main.vendorCode}</div>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#666", fontFamily: "monospace" }}>
                        {main.taxId || "—"}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#666", whiteSpace: "nowrap" }}>{PRODUCT_TYPE_LABEL[main.productType] ?? main.productType}</td>
                      <td style={{ padding: "10px 16px", color: "#666" }}>
                        {main.category ?? "—"}
                        {main.functionOwner && <div style={{ fontSize: 11, color: "#bbb" }}>{main.functionOwner}</div>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, background: "#fafbfc", borderBottom: "1px solid #f0f0f0" }}>
                          <div style={{ padding: "16px 20px 24px 56px" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              โปรเจกต์ (TORs) ของบริษัทนี้ ({group.length})
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ borderBottom: "1.5px solid #eaeaea", textAlign: "left" }}>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>วันที่เพิ่มข้อมูล</th>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>มูลค่างาน (THB)</th>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>PTA Approve</th>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>Buyer (GCP)</th>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>Evaluator (USER)</th>
                                  <th style={{ padding: "8px 12px", color: "#777", fontWeight: 600 }}>สถานะ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.map(r => (
                                  <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                                    <td style={{ padding: "10px 12px", color: "#666" }}>{formatThaiDate(r.createdAt)}</td>
                                    <td style={{ padding: "10px 12px", color: "#333", fontWeight: 500 }}>
                                      {r.jobValueThb != null ? r.jobValueThb.toLocaleString("th-TH") : "—"}
                                    </td>
                                    <td style={{ padding: "10px 12px", color: "#666" }}>{formatThaiDate(r.ptaApproveDate)}</td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <div style={{ color: "#222" }}>{r.buyerName ?? "—"}</div>
                                      {r.buyerEmail && <div style={{ fontSize: 11, color: "#888" }}>{r.buyerEmail}</div>}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <div style={{ color: "#222" }}>{r.evaluatorName ?? "—"}</div>
                                      {r.evaluatorEmail && <div style={{ fontSize: 11, color: "#888" }}>{r.evaluatorEmail}</div>}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <span style={{
                                        background: r.isActive ? "#e8f5e9" : "#f5f5f5",
                                        color: r.isActive ? "#1b5e20" : "#999",
                                        borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                                      }}>
                                        {r.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <PaginationBar
          page={pageClamped}
          totalPages={totalPages}
          total={groupedSuppliers.length}
          pageSize={SUPPLIERS_PAGE_SIZE}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        />
      )}
    </div>
  );
}

// ── Employees Tab ─────────────────────────────────────────────
function EmployeesTab({ employees, onRefresh, authUser }: { employees: Employee[]; onRefresh: () => void; authUser: AuthUser | null }) {
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [saving,     setSaving]     = useState<string | null>(null);
  const [msg,        setMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [grantTarget, setGrantTarget] = useState<Employee | null>(null); // employee row pending ADMIN grant

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

  const patchEmployee = async (employeeId: string, body: Record<string, unknown>) => {
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
      setMsg({ type: "err", text: (e as Error).message });
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
function VerifyAdminModal({ authUser, targetName, onCancel, onVerified }: {
  authUser: AuthUser | null; targetName: string; onCancel: () => void; onVerified: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(authUser?.empId ?? "");
  const [password,   setPassword]   = useState("");
  const [error,       setError]     = useState<string | null>(null);
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
      setError((e as Error).message || "ยืนยันตัวตนไม่สำเร็จ");
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
// หน้านี้ตั้งใจโชว์ "เฉพาะรอบที่ Approved แล้ว" เท่านั้น — ไม่งั้นจะซ้ำกับ
// หน้า "งานประเมิน (Upload)" ที่มีไว้ติดตามงานที่ยังไม่เสร็จ/อยู่ระหว่างทำอยู่แล้ว
const SESSIONS_PAGE_SIZE = 10;

function SessionsTab({ sessions, onViewEvaluation, initialSessionId }: {
  sessions: SessionRow[]; onViewEvaluation: (evalId: string, sessionId: string) => void; initialSessionId: string | null;
}) {
  const [search,            setSearch]            = useState("");
  const [evalTypeFilter,    setEvalTypeFilter]    = useState<Set<string>>(new Set());
  const [periodFilter,      setPeriodFilter]      = useState<Set<string>>(new Set());
  const [dateFilter,        setDateFilter]        = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null);
  const [filterOpen,        setFilterOpen]        = useState(false);
  const [page,              setPage]              = useState(1);
  const [sort,              setSort]              = useState<SortState<SessionSortKey>>({ key: "completedAt", dir: "desc" });
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const onSort = (key: SessionSortKey) => setSort(s => nextSort(s, key));

  const approvedSessions = sessions.filter(s => s.status === "completed");

  // รอบที่ (ครั้งที่) ของแต่ละ session เทียบกับ supplier รายนั้น — เรียงตาม
  // เวลาที่ Approved จากเก่าไปใหม่ แล้วนับ 1, 2, 3... ต่อ vendor (ไม่ใช่นับจาก
  // approvedSessions ทั้งระบบ) นับจาก approvedSessions ทั้งชุดเสมอ ไม่ใช่แค่ที่
  // กรอง/แบ่งหน้าอยู่ตอนนี้ เพื่อให้เลขรอบนิ่ง ไม่เลื่อนตามตัวกรอง
  const roundIndexBySession: Record<string, number> = {};
  const sessionsByVendor = approvedSessions.reduce((acc: Record<string, SessionRow[]>, s) => {
    (acc[s.vendorCode] ??= []).push(s);
    return acc;
  }, {});
  Object.values(sessionsByVendor).forEach(list => {
    [...list]
      .sort((a, b) => new Date(a.completedAt ?? a.createdAt ?? 0).getTime() - new Date(b.completedAt ?? b.createdAt ?? 0).getTime())
      .forEach((s, idx) => { roundIndexBySession[s.sessionId] = idx + 1; });
  });

  useClickOutside(filterPanelRef, filterOpen, () => setFilterOpen(false));

  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่ตัวกรอง/คำค้นหาเปลี่ยน ไม่งั้นอาจค้างอยู่หน้า
  // ที่เกินจำนวนรายการที่กรองได้ใหม่ กลายเป็นหน้าว่างเปล่า
  useEffect(() => { setPage(1); }, [search, evalTypeFilter, periodFilter, dateFilter]);

  if (selectedSessionId) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
        onViewEvaluation={(evalId) => onViewEvaluation(evalId, selectedSessionId)}
      />
    );
  }

  const filtered = approvedSessions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.supplierName?.toLowerCase().includes(q) ||
      s.vendorCode?.toLowerCase().includes(q) ||
      s.period?.toLowerCase().includes(q);
    const matchEvalType = evalTypeFilter.size === 0 || evalTypeFilter.has(s.evalType);
    const matchPeriod   = periodFilter.size === 0 || s.evalType !== "post_eval" || periodFilter.has(s.period);
    const matchDate     = matchesDateFilter(s.completedAt, dateFilter);
    return matchSearch && matchEvalType && matchPeriod && matchDate;
  });

  const activeFilterCount = [
    evalTypeFilter.size > 0,
    periodFilter.size > 0,
    !!dateFilter.from || !!dateFilter.to || (dateFilter.preset && dateFilter.preset !== "all"),
  ].filter(Boolean).length;

  function resetAllFilters() {
    setEvalTypeFilter(new Set());
    setPeriodFilter(new Set());
    setDateFilter(DEFAULT_DATE_FILTER);
  }

  const sorted = sort.key
    ? [...filtered].sort((a, b) => {
        const cmp = compareSessions(a, b, sort.key as SessionSortKey, roundIndexBySession);
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : filtered;

  const totalPages  = Math.max(1, Math.ceil(sorted.length / SESSIONS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows    = sorted.slice((pageClamped - 1) * SESSIONS_PAGE_SIZE, pageClamped * SESSIONS_PAGE_SIZE);

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

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        แสดงเฉพาะรอบที่ Approved แล้ว — {filtered.length} จาก {approvedSessions.length} รายการ
      </div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #dde3dd", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th>Supplier</th>
              <SortableTh label="ประเภทการประเมิน" sortKey="evalType" sort={sort} onSort={onSort} />
              <SortableTh label="Period" sortKey="period" sort={sort} onSort={onSort} />
              <th>สถานะ</th>
              <SortableTh label="เสร็จสิ้นเมื่อ" sortKey="completedAt" sort={sort} onSort={onSort} />
              <SortableTh label="คะแนนรวม" sortKey="score" sort={sort} onSort={onSort} />
              <SortableTh label="เกรด" sortKey="grade" sort={sort} onSort={onSort} />
              <th>ผู้ประเมิน</th>
              <SortableTh label="ครั้งที่ประเมิน" sortKey="round" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#bbb" }}>ไม่พบข้อมูล</td></tr>
            ) : pageRows.map((s, i) => (
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
                  {({ pre_eval: "Pre-Evaluation", post_eval: "Post-Evaluation", half_year: "Half-Year", yearly: "Yearly", ad_hoc: "Ad-hoc" } as Record<string, string>)[s.evalType] ?? s.evalType}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#666" }}>{s.period}</td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={s.status} dueDate={s.dueDate} /></td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                  {s.completedAt ? new Date(s.completedAt).toLocaleDateString("th-TH") : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontWeight: 700, color: "#333" }}>
                  {s.finalScore != null ? parseFloat(String(s.finalScore)).toFixed(2) : (
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
                            <span style={{ fontSize: 10, color: "#aaa" }}>({parseFloat(String(ev.totalScore)).toFixed(1)})</span>
                          )}
                        </div>
                      );
                    })}
                    {(s.evaluations ?? []).length === 0 && <span style={{ color: "#bbb", fontSize: 11 }}>ยังไม่มีผล</span>}
                  </div>
                </td>
                <td style={{ padding: "11px 14px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 26, height: 22, padding: "0 8px", borderRadius: 6,
                    background: "#f3e8fd", color: "#6a1b9a", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                  }}>
                    {roundIndexBySession[s.sessionId] ?? 1}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <PaginationBar
          page={pageClamped}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={SESSIONS_PAGE_SIZE}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        />
      )}
    </div>
  );
}

interface SessionDetailData {
  supplierName: string;
  vendorCode: string;
  evalType: string;
  period: string;
  status: string;
  dueDate?: string;
  finalScore?: number | string | null;
  finalGrade?: string | null;
  evaluations?: {
    id: string; role: string; fullName: string; employeeId: string;
    department?: string; jobTitle?: string; profilePicture?: string | null;
    totalScore?: number | string | null; grade?: string | null; submittedAt?: string | null;
  }[];
}

// ── Session Detail (drill-down from a SessionsTab row) ────────
// Shows just the evaluators who worked on this one session, each with
// their full per-criteria score breakdown — e.g. clicking a Half-Year
// session with a GCP + a USER evaluation opens this to show only
// those two people's results.
function SessionDetail({ sessionId, onBack, onViewEvaluation }: {
  sessionId: string; onBack: () => void; onViewEvaluation: (evalId: string) => void;
}) {
  const [data,    setData]    = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

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
              {({ pre_eval: "Pre-Evaluation", post_eval: "Post-Evaluation", half_year: "Half-Year", yearly: "Yearly", ad_hoc: "Ad-hoc" } as Record<string, string>)[data.evalType] ?? data.evalType}
              {" · "}{data.period}
            </div>
            <StatusBadge status={data.status} dueDate={data.dueDate} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#333" }}>
                {data.finalScore != null ? parseFloat(String(data.finalScore)).toFixed(2) : "—"}
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
              {data.evaluations!.map((ev, i) => {
                const rc = ROLE_COLORS[ev.role] ?? ROLE_COLORS.USER;
                const clickable = true;
                return (
                  <div
                    key={ev.id}
                    onClick={() => onViewEvaluation(ev.id)}
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
                      {ev.totalScore != null ? parseFloat(String(ev.totalScore)).toFixed(2) : "—"}
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
function TabCard({ tab, active, count, onClick }: { tab: TabDef; active: boolean; count?: number; onClick: () => void }) {
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
function StatusBadge({ status, dueDate }: { status: string; dueDate?: string }) {
  const display = getDisplayStatus(status, dueDate);
  const sc = SESSION_STATUS_COLORS[display as keyof typeof SESSION_STATUS_COLORS] ?? { bg: "#f5f5f5", color: "#aaa" };
  const label = SESSION_STATUS_LABELS[display as keyof typeof SESSION_STATUS_LABELS] ?? display;
  return (
    <span style={{
      background: sc.bg, color: sc.color,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
