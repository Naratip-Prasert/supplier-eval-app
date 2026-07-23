// ============================================================
//  app/(app)/landing/page.tsx
// ============================================================
"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useModal, useClickOutside } from "@/components";
import { TimelineStepper } from "@/components/shared/TimelineStepper";
import { FilterChips, toggleInSet } from "@/components/shared/FilterChips";
import { Field, ReadBox, TextInput, StyledSelect } from "@/components/shared/FormFields";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { useAuth } from "@/context/AuthContext";
import { useEvalFlow } from "@/context/EvalFlowContext";
import { authFetch } from "@/utils/api";
import { isOverdue } from "@/utils/date";
import {
  Info, Loader2, AlertCircle, User, LogOut,
  ChevronDown, ClipboardList, Search, CheckCircle2,
  FileText, BarChart3, ArrowRight,
  SlidersHorizontal, CalendarRange, ArrowDownUp, X, RefreshCw,
} from "lucide-react";

import { PRODUCT_TYPE_OPTIONS, EVAL_PERIOD_OPTIONS, PRE_PERIOD_OPTIONS, DUE_DATE_SORT_LABEL as SORT_LABEL } from "@/constants";
import { roleThemeColor, roleThemeGradient } from "@/styles/theme";

const PRODUCT_MAP: Record<string, string>   = { "สินค้า": "goods", "บริการ": "services", "สินค้าและบริการ": "both" };
const PRODUCT_LABEL: Record<string, string> = { goods: "สินค้า", services: "บริการ", both: "สินค้าและบริการ" };

const TASK_EVAL_TYPE_LABEL: Record<string, string> = {
  pre_eval: "Pre-Evaluation (Supplier ใหม่)",
  post_eval: "Post-Evaluation (90 วัน)", half_year: "Half-Year Evaluation", yearly: "Yearly Evaluation",
  ad_hoc: "Ad-hoc Evaluation (กรณีพิเศษ)",
};
const TASK_TYPE_FILTER_LABEL: Record<string, string> = {
  pre_eval: "Pre-Eval", post_eval: "Post-Eval", half_year: "Half-Year", yearly: "Yearly", ad_hoc: "Ad-hoc",
};
const TASK_PAGE_SIZE = 8;

interface TimelineTask {
  taskId: string;
  taskStatus: string;
  sessionId: string;
  evalType: string;
  period: string;
  sessionStatus: string;
  createdAt: string;
  vendorCode: string;
  supplierName: string;
  productType: string;
  supervisorNotes?: string | null;
  dueDate?: string | null;
}

interface AuthUserLike {
  fullName?: string;
  empId?: string;
  department?: string;
  jobTitle?: string;
  role?: string;
}

// ── Profile dropdown ─────────────────────────────────────────
function ProfileDropdown({ user, profilePic, onProfile, onHistory, onLogout }: {
  user: AuthUserLike; profilePic?: string | null; themeColor?: string;
  onProfile: () => void; onHistory: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const initials = (user.fullName || "?").split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(8px)",
          border: "1.5px solid rgba(255,255,255,0.35)",
          borderRadius: 50, padding: "5px 14px 5px 5px",
          cursor: "pointer", fontFamily: "Sarabun, sans-serif",
          transition: "background 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
      >
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.3)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, overflow: "hidden", flexShrink: 0,
        }}>
          {profilePic
            ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{user.fullName}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{user.empId}</div>
        </div>
        <ChevronDown size={14} style={{
          color: "rgba(255,255,255,0.8)", flexShrink: 0,
          transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
        }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          border: "1px solid #eee", zIndex: 300, minWidth: 210, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{user.fullName}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{user.department}</div>
          </div>
          {[
            { icon: <User size={14} />,          label: "ดูโปรไฟล์",        action: () => { setOpen(false); onProfile(); }, color: "#2d3748", hover: "#f7faff" },
            { icon: <ClipboardList size={14} />, label: "ประวัติการประเมิน", action: () => { setOpen(false); onHistory(); }, color: "#2d3748", hover: "#f7faff" },
            { icon: <LogOut size={14} />,        label: "ออกจากระบบ",        action: () => { setOpen(false); onLogout(); },  color: "#c62828", hover: "#fff5f5" },
          ].map(({ icon, label, action, color, hover }, i) => (
            <button key={label} onClick={action} style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", textAlign: "left", padding: "11px 16px",
              fontSize: 13, background: "none",
              border: "none", borderTop: i > 0 ? "1px solid #f5f5f5" : "none",
              cursor: "pointer", fontFamily: "Sarabun, sans-serif", color,
            }}
              onMouseEnter={e => e.currentTarget.style.background = hover}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <span style={{ color, display: "flex" }}>{icon}</span> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTaskTab = searchParams.get("tab") === "returned" ? "returned" : "active";
  const { user: authUser, profilePic, logout } = useAuth();
  const { setFormData: setFlowFormData } = useEvalFlow();
  const { showAlert, ModalEl } = useModal();

  if (!authUser) return null;

  const isGCP      = authUser.role === "GCP";
  // ธีมสีตาม role จริง (เดิมมีแค่ 2 ทาง GCP/ไม่ใช่ GCP — ADMIN ที่เข้าหน้านี้
  // เพื่อกรอกฟอร์มเอง (canManualEntry ด้านล่าง) เลยเคยได้ธีมเขียวของ USER
  // ไปโดยไม่ตั้งใจ ตอนนี้ใช้สีตาม role ที่แท้จริงจากจุดกลางเดียวกันทั้งแอป)
  const themeColor = roleThemeColor(authUser.role);
  const themeBg    = roleThemeGradient(authUser.role);
  // USER/GCP can only evaluate suppliers explicitly assigned to them via the
  // task system — free-typing a vendor code is reserved for ADMIN (ad-hoc use).
  const canManualEntry = authUser.role === "ADMIN";

  const [evalType,     setEvalType]     = useState("");
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");
  const [vendorLookup, setVendorLookup] = useState<{ status: string; data: any }>({ status: "idle", data: null });

  const [myTimeline,        setMyTimeline]        = useState<TimelineTask[]>([]);
  const [timelineLoading,   setTimelineLoading]   = useState(true);
  const [taskTab,           setTaskTab]           = useState<"active" | "returned">(initialTaskTab);
  const [returnedNote,      setReturnedNote]      = useState<{ supplierName: string; notes: string } | null>(null);
  const [taskSearch,        setTaskSearch]        = useState("");
  const [taskTypeFilter,    setTaskTypeFilter]    = useState<Set<string>>(new Set()); // empty = all
  const [taskDateFrom,      setTaskDateFrom]      = useState("");
  const [taskDateTo,        setTaskDateTo]        = useState("");
  const [taskSortDir,       setTaskSortDir]       = useState<"asc" | "desc">("asc");
  const [taskFilterOpen,    setTaskFilterOpen]    = useState(false);
  const [taskPage,          setTaskPage]          = useState(1);
  const taskFilterPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTaskPage(1); }, [taskTab, taskTypeFilter, taskDateFrom, taskDateTo, taskSearch, taskSortDir]);

  useClickOutside(taskFilterPanelRef, taskFilterOpen, () => setTaskFilterOpen(false));

  // Unlike /my-tasks (to-do list only, drops a task once submitted), this
  // keeps tracking a task after the user has submitted their part, so they
  // can see it progress through Submitted → Approved/Returned.
  const fetchTimeline = useCallback(() => {
    return authFetch("/api/evaluations/my-timeline")
      .then(r => r.ok ? r.json() : [])
      .then(data => setMyTimeline(Array.isArray(data) ? data : []))
      .catch(() => setMyTimeline([]));
  }, []);

  useEffect(() => {
    fetchTimeline().finally(() => setTimelineLoading(false));
  }, [fetchTimeline]);

  const [refreshingTimeline, setRefreshingTimeline] = useState(false);
  const refreshTimeline = () => {
    setRefreshingTimeline(true);
    fetchTimeline().finally(() => setRefreshingTimeline(false));
  };

  const startTask = (task: TimelineTask) => {
    setFlowFormData({
      empId:        authUser.empId,
      employeeId:   authUser.empId,
      dept:         authUser.department,
      // Passed straight through — getCriteria/isPostEvalType (constants.js)
      // already handle pre_eval/post_eval/half_year/yearly directly, and
      // the backend ignores this field for task-based submissions (it reads
      // the session's own eval_type instead), so no remapping is needed here.
      evalType:     task.evalType,
      vendorCode:   task.vendorCode,
      supplierName: task.supplierName,
      productType:  task.productType,
      period:       task.period,
      role:         authUser.role,
      sessionId:    task.sessionId,
    });
    router.push("/eval");
  };

  // Approved sessions are done — drop them entirely so the table doesn't
  // accumulate stale clutter the user can no longer act on.
  const visibleTimeline = useMemo(() => myTimeline.filter(t => t.sessionStatus !== "completed"), [myTimeline]);
  const returnedTimeline = useMemo(() => visibleTimeline.filter(t => t.sessionStatus === "returned"), [visibleTimeline]);
  const activeTimeline   = useMemo(() => visibleTimeline.filter(t => t.sessionStatus !== "returned"), [visibleTimeline]);
  const taskBaseList = taskTab === "returned" ? returnedTimeline : activeTimeline;

  const filteredTimeline = useMemo(() => {
    const from = taskDateFrom ? new Date(taskDateFrom) : null;
    const to   = taskDateTo ? new Date(taskDateTo + "T23:59:59") : null;
    const q = taskSearch.trim().toLowerCase();
    const list = taskBaseList.filter(t => {
      const matchType = taskTypeFilter.size === 0 || taskTypeFilter.has(t.evalType);
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const matchDate = (!from || (due && due >= from)) && (!to || (due && due <= to));
      const matchSearch = !q
        || t.supplierName?.toLowerCase().includes(q)
        || t.vendorCode?.toLowerCase().includes(q);
      return matchType && matchDate && matchSearch;
    });
    return [...list].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (da !== db) return taskSortDir === "asc" ? da - db : db - da;
      return (a.supplierName || "").localeCompare(b.supplierName || "", "th");
    });
  }, [taskBaseList, taskTypeFilter, taskDateFrom, taskDateTo, taskSearch, taskSortDir]);

  const taskTotalPages = Math.max(1, Math.ceil(filteredTimeline.length / TASK_PAGE_SIZE));
  const taskPageItems  = filteredTimeline.slice((taskPage - 1) * TASK_PAGE_SIZE, taskPage * TASK_PAGE_SIZE);

  const taskActiveFilterCount = [
    taskTypeFilter.size > 0,
    !!taskDateFrom || !!taskDateTo,
  ].filter(Boolean).length;

  function resetTaskFilters() {
    setTaskTypeFilter(new Set());
    setTaskDateFrom("");
    setTaskDateTo("");
  }

  // กันกรณี lookup รอบเก่ายังไม่ตอบกลับแล้วมาทับผลลัพธ์ของรอบใหม่ล่าสุด —
  // เช่นพิมพ์แก้ vendor code เร็วๆ แล้ว blur หลายครั้งติดกัน request แรกอาจ
  // ตอบกลับช้ากว่า request หลังและมาทับสถานะที่ถูกต้องของ code ปัจจุบัน
  const lookupSeq = useRef(0);
  const lookupVendor = async (code: string) => {
    if (!code.trim()) return "idle";
    const mySeq = ++lookupSeq.current;
    setVendorLookup({ status: "loading", data: null });
    try {
      const res = await authFetch(`/api/suppliers/${encodeURIComponent(code.trim())}`);
      if (mySeq !== lookupSeq.current) return "stale";
      if (res.status === 404) { setVendorLookup({ status: "notfound", data: null }); return "notfound"; }
      if (!res.ok)            { setVendorLookup({ status: "error",    data: null }); return "error"; }
      const data = await res.json();
      if (mySeq !== lookupSeq.current) return "stale";
      setVendorLookup({ status: "found", data });
      setSupplierName(data.supplierName || "");
      setProductType(data.productType || "");
      return "found";
    } catch {
      if (mySeq !== lookupSeq.current) return "stale";
      setVendorLookup({ status: "error", data: null });
      return "error";
    }
  };

  const handleSubmit = async () => {
    let vendorStatus = vendorLookup.status;
    if (evalType && vendorCode.trim() && vendorLookup.status === "idle")
      vendorStatus = await lookupVendor(vendorCode);

    const missing = [];
    if (!evalType)                        missing.push("ประเภทการประเมิน");
    if (!vendorCode.trim())               missing.push("Tax ID / Vendor Code");
    else if (vendorStatus === "notfound") missing.push("Tax ID / Vendor Code (ไม่พบในระบบ)");
    else if (vendorStatus === "error")    missing.push("Tax ID / Vendor Code (เชื่อมต่อไม่ได้)");
    if (!productType) missing.push("ประเภทสินค้า");
    if (!period)      missing.push("รอบการประเมิน");

    if (missing.length > 0) {
      await showAlert(`กรุณากรอกข้อมูลให้ครบก่อนดำเนินการต่อ\n\nยังขาด:\n• ${missing.join("\n• ")}`, "กรอกข้อมูลไม่ครบ");
      return;
    }
    setFlowFormData({
      empId: authUser.empId!, employeeId: authUser.empId!,
      dept: authUser.department!, evalType, vendorCode,
      supplierName, productType: PRODUCT_MAP[productType] ?? productType,
      period, role: authUser.role,
    });
    router.push("/eval");
  };

  const handleLogout = async () => { await logout(); router.push("/login"); };

  const vendorFound = vendorLookup.status === "found";

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Sarabun, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .eval-type-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }
      `}</style>
      {ModalEl}

      {returnedNote && (
        <>
          <div
            onClick={() => setReturnedNote(null)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.48)", animation: "fadeUp 0.15s ease" }}
          />
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, width: "min(480px, 100%)",
              maxHeight: "min(620px, 86vh)", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.28)", overflow: "hidden",
            }}>
              <div style={{
                background: "linear-gradient(135deg, #fb923c, #ea580c)", padding: "18px 22px",
                display: "flex", alignItems: "flex-start", gap: 12, color: "#fff", flexShrink: 0,
              }}>
                <AlertCircle size={24} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>เหตุผลที่ถูกตีกลับ</div>
                  <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>{returnedNote.supplierName}</div>
                </div>
                <button
                  onClick={() => setReturnedNote(null)}
                  style={{
                    background: "rgba(255,255,255,0.18)", border: "none", borderRadius: 8,
                    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#fff", flexShrink: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
                <div style={{
                  background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12,
                  padding: "16px 18px", fontSize: 14, lineHeight: 1.8, color: "#7c2d12",
                  whiteSpace: "pre-line", wordBreak: "break-word", overflowWrap: "anywhere",
                }}>
                  {returnedNote.notes}
                </div>
              </div>

              <div style={{ padding: "14px 22px 20px", flexShrink: 0, textAlign: "right" }}>
                <button
                  onClick={() => setReturnedNote(null)}
                  style={{
                    background: "#ea580c", color: "#fff", border: "none", borderRadius: 9,
                    padding: "10px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    fontFamily: "Sarabun, sans-serif",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#c2410c"}
                  onMouseLeave={e => e.currentTarget.style.background = "#ea580c"}
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Top banner ── */}
      <div style={{ background: themeBg, position: "relative" }}>
        {/* decorative circles — clipped inside their own overflow:hidden wrapper */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{
            position: "absolute", width: 320, height: 320, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)", top: -80, right: -60,
          }} />
          <div style={{
            position: "absolute", width: 180, height: 180, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)", bottom: -40, left: 100,
          }} />
        </div>

        {/* Nav row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 32px", position: "relative", zIndex: 10,
        }}>
          <div>
            <button onClick={() => router.push("/portal")} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.25)",
              borderRadius: 20, padding: "6px 14px",
              cursor: "pointer", fontSize: 13, color: "#fff",
              fontFamily: "Sarabun, sans-serif", transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            >
              ← หน้าหลัก
            </button>
          </div>
          <ProfileDropdown
            user={authUser} profilePic={profilePic} themeColor={themeColor}
            onProfile={() => router.push("/profile")} onHistory={() => router.push("/history")} onLogout={handleLogout}
          />
        </div>

        {/* Hero text */}
        <div style={{ padding: "8px 32px 36px", position: "relative", zIndex: 1 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            ประเมิน Supplier
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: 0 }}>
            กรอกข้อมูลด้านล่างเพื่อเริ่มต้นแบบประเมินผู้ขาย
          </p>
        </div>
      </div>

      {/* ── Tasks table (wide) ── */}
      <div style={{ maxWidth: 1100, margin: "-20px auto 0", padding: "0 20px", position: "relative", zIndex: 2 }}>

        {/* Evaluation tasks — table of everything ever assigned to this
            person (minus approved ones — those are done). Shows live
            progress (timeline) even after they've submitted their own
            part, and stays clickable while actionable. */}
        {!timelineLoading && visibleTimeline.length > 0 && (
          <div style={{
            background: "#fff", borderRadius: 16,
            boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
            padding: "20px 24px", marginBottom: 16, animation: "fadeUp 0.3s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", paddingLeft: 2 }}>
                งานประเมินของคุณ
              </div>
              <button
                onClick={refreshTimeline}
                disabled={refreshingTimeline}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
                  padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#64748b",
                  fontFamily: "Sarabun, sans-serif",
                }}
              >
                <RefreshCw size={13} style={{ animation: refreshingTimeline ? "spin 1s linear infinite" : "none" }} />
                รีเฟรช
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 14, width: "fit-content" }}>
              {[
                { key: "active" as const,   label: `ยังไม่เริ่มประเมิน (${activeTimeline.length})` },
                { key: "returned" as const, label: `ถูกตีกลับ (${returnedTimeline.length})` },
              ].map(tb => (
                <button
                  key={tb.key}
                  onClick={() => setTaskTab(tb.key)}
                  style={{
                    padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                    fontSize: 12.5, fontWeight: taskTab === tb.key ? 700 : 500, fontFamily: "Sarabun, sans-serif",
                    background: taskTab === tb.key ? "#fff" : "transparent",
                    color: taskTab === tb.key ? themeColor : "#64748b",
                    boxShadow: taskTab === tb.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Search + filter trigger */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, position: "relative" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
                <input
                  value={taskSearch} onChange={e => setTaskSearch(e.target.value)}
                  placeholder="ค้นหา supplier / vendor code…"
                  style={{ width: "100%", padding: "8px 10px 8px 32px", border: "1px solid #e5e7eb", borderRadius: 7, fontFamily: "Sarabun, sans-serif", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <button
                onClick={() => setTaskFilterOpen(o => !o)}
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 7, flexShrink: 0, whiteSpace: "nowrap",
                  border: taskFilterOpen ? `1px solid ${themeColor}` : "1px solid #e5e7eb",
                  background: taskFilterOpen ? `${themeColor}14` : "#fff",
                  color: taskFilterOpen ? themeColor : "#555",
                  fontFamily: "Sarabun, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={14} /> ตัวกรอง
                {taskActiveFilterCount > 0 && (
                  <span style={{
                    position: "absolute", top: -6, right: -6, background: "#c62828", color: "#fff",
                    borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {taskActiveFilterCount}
                  </span>
                )}
              </button>

              {taskFilterOpen && (
                <div
                  ref={taskFilterPanelRef}
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
                    background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
                    boxShadow: "0 10px 32px rgba(0,0,0,0.14)", padding: 18,
                    width: 360, maxWidth: "92vw", display: "flex", flexDirection: "column", gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>ประเภทการประเมิน</div>
                    <FilterChips
                      options={Object.entries(TASK_TYPE_FILTER_LABEL).map(([v, l]) => ({ v, l }))}
                      selected={taskTypeFilter}
                      onToggle={v => setTaskTypeFilter(s => toggleInSet(s, v))}
                      onClear={() => setTaskTypeFilter(new Set())}
                      activeColor={themeColor}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                      <CalendarRange size={13} /> ช่วงวันครบกำหนด
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="date" value={taskDateFrom} onChange={e => setTaskDateFrom(e.target.value)}
                        style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
                      />
                      <span style={{ fontSize: 12, color: "#aaa" }}>ถึง</span>
                      <input
                        type="date" value={taskDateTo} onChange={e => setTaskDateTo(e.target.value)}
                        style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
                      />
                      {(taskDateFrom || taskDateTo) && (
                        <button
                          onClick={() => { setTaskDateFrom(""); setTaskDateTo(""); }}
                          style={{ display: "flex", alignItems: "center", gap: 4, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "#666", fontFamily: "Sarabun, sans-serif" }}
                        >
                          <X size={11} /> ล้าง
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>เรียงลำดับ</div>
                    <button
                      onClick={() => setTaskSortDir(d => d === "asc" ? "desc" : "asc")}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", color: "#555", fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer" }}
                    >
                      <ArrowDownUp size={13} /> {SORT_LABEL[taskSortDir]}
                    </button>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <button
                      onClick={resetTaskFilters}
                      disabled={taskActiveFilterCount === 0}
                      style={{ fontSize: 12, color: taskActiveFilterCount === 0 ? "#bbb" : "#c62828", background: "none", border: "none", cursor: taskActiveFilterCount === 0 ? "default" : "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 600 }}
                    >
                      ล้างตัวกรองทั้งหมด
                    </button>
                    <button
                      onClick={() => setTaskFilterOpen(false)}
                      style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: themeColor, color: "#fff", fontFamily: "Sarabun, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      เสร็จสิ้น
                    </button>
                  </div>
                </div>
              )}
            </div>

            {filteredTimeline.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#94a3b8", fontSize: 13 }}>ไม่มีรายการ</div>
            ) : (
              <>
                {/* On narrow screens a horizontally-scrolling table hides
                    the action button ("เริ่มประเมิน") off-screen with no
                    visible scroll hint — switch to a stacked card list
                    instead so the action is always reachable. */}
                <style>{`
                  .task-table-view { display: block; }
                  .task-card-view { display: none; }
                  @media (max-width: 700px) {
                    .task-table-view { display: none; }
                    .task-card-view { display: flex; }
                  }
                `}</style>

                <div className="task-table-view" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                        {["Supplier", "ประเภท", "สถานะ", "ครบกำหนด", "จัดการ"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {taskPageItems.map(t => {
                        const isReturned  = t.sessionStatus === "returned";
                        const overdue     = !!t.dueDate && isOverdue(t.dueDate) && !["completed", "returned"].includes(t.sessionStatus);
                        const actionable  = t.taskStatus !== "completed"
                          && ["pending", "in_progress", "returned"].includes(t.sessionStatus);
                        return (
                          <tr key={t.taskId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 10px" }}>
                              <div style={{ fontWeight: 700, color: "#111827" }}>{t.supplierName}</div>
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>{t.vendorCode}</div>
                              {isReturned && t.supervisorNotes && (
                                <button
                                  onClick={() => setReturnedNote({ supplierName: t.supplierName, notes: t.supervisorNotes! })}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                                    background: "#fff3e0", color: "#e65100", border: "1.5px solid #ffb74d",
                                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                                    fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 12.5,
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = "#ffe0b2"}
                                  onMouseLeave={e => e.currentTarget.style.background = "#fff3e0"}
                                >
                                  ⚠ ดูเหตุผลที่ถูกตีกลับ
                                </button>
                              )}
                            </td>
                            <td style={{ padding: "10px 10px", color: "#555", fontSize: 12, whiteSpace: "nowrap" }}>
                              {TASK_EVAL_TYPE_LABEL[t.evalType] || t.evalType}
                            </td>
                            <td style={{ padding: "10px 10px" }}>
                              <TimelineStepper status={t.sessionStatus} dueDate={t.dueDate} compact />
                            </td>
                            <td style={{ padding: "10px 10px", color: overdue ? "#c62828" : "#64748b", fontWeight: overdue ? 700 : 400, whiteSpace: "nowrap", fontSize: 12 }}>
                              {t.dueDate ? new Date(t.dueDate).toLocaleDateString("th-TH") : "—"}
                            </td>
                            <td style={{ padding: "10px 10px" }}>
                              {actionable ? (
                                <button
                                  onClick={() => startTask(t)}
                                  style={{
                                    background: isReturned ? "#fb8c00" : themeColor, color: "#fff", border: "none",
                                    borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                                    fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 12,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {isReturned ? "ประเมินใหม่" : "เริ่มประเมิน"}
                                </button>
                              ) : (
                                <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
                                  {t.taskStatus === "completed" ? "ส่งแล้ว" : "—"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="task-card-view" style={{ flexDirection: "column", gap: 12 }}>
                  {taskPageItems.map(t => {
                    const isReturned  = t.sessionStatus === "returned";
                    const overdue     = !!t.dueDate && isOverdue(t.dueDate) && !["completed", "returned"].includes(t.sessionStatus);
                    const actionable  = t.taskStatus !== "completed"
                      && ["pending", "in_progress", "returned"].includes(t.sessionStatus);
                    return (
                      <div key={t.taskId} style={{
                        border: "1px solid #f1f5f9", borderRadius: 12, padding: 14,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: "#111827" }}>{t.supplierName}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{t.vendorCode}</div>
                          </div>
                          <span style={{ color: "#555", fontSize: 11.5, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {TASK_EVAL_TYPE_LABEL[t.evalType] || t.evalType}
                          </span>
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          <TimelineStepper status={t.sessionStatus} dueDate={t.dueDate} compact />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isReturned && t.supervisorNotes ? 8 : 0 }}>
                          <span style={{ fontSize: 12, color: overdue ? "#c62828" : "#64748b", fontWeight: overdue ? 700 : 400 }}>
                            ครบกำหนด: {t.dueDate ? new Date(t.dueDate).toLocaleDateString("th-TH") : "—"}
                          </span>
                          {actionable ? (
                            <button
                              onClick={() => startTask(t)}
                              style={{
                                background: isReturned ? "#fb8c00" : themeColor, color: "#fff", border: "none",
                                borderRadius: 8, padding: "7px 16px", cursor: "pointer",
                                fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 12.5,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isReturned ? "ประเมินใหม่" : "เริ่มประเมิน"}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
                              {t.taskStatus === "completed" ? "ส่งแล้ว" : "—"}
                            </span>
                          )}
                        </div>

                        {isReturned && t.supervisorNotes && (
                          <button
                            onClick={() => setReturnedNote({ supplierName: t.supplierName, notes: t.supervisorNotes! })}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, width: "100%",
                              justifyContent: "center",
                              background: "#fff3e0", color: "#e65100", border: "1.5px solid #ffb74d",
                              borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                              fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 12.5,
                            }}
                          >
                            ⚠ ดูเหตุผลที่ถูกตีกลับ
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {filteredTimeline.length > 0 && (
              <PaginationBar
                page={taskPage} totalPages={taskTotalPages} total={filteredTimeline.length} pageSize={TASK_PAGE_SIZE}
                onPrev={() => setTaskPage(p => Math.max(1, p - 1))}
                onNext={() => setTaskPage(p => Math.min(taskTotalPages, p + 1))}
              />
            )}
          </div>
        )}

        {!timelineLoading && !canManualEntry && visibleTimeline.length === 0 && (
          <div style={{
            background: "#fff", border: "1.5px dashed #d1d5db", borderRadius: 16,
            boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
            padding: "40px 20px", textAlign: "center", color: "#94a3b8",
            animation: "fadeUp 0.3s ease",
          }}>
            ไม่มีงานที่ต้องประเมินในขณะนี้
          </div>
        )}
      </div>

      {/* ── Form card (ADMIN manual entry only) ── */}
      <div style={{ maxWidth: 680, margin: "20px auto 40px", padding: "0 20px", position: "relative", zIndex: 2 }}>
        {canManualEntry && (
        <>
        <div style={{
          background: "#fff", borderRadius: 16,
          boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
          animation: "fadeUp 0.35s ease",
        }}>

          {/* User info strip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 24px",
            background: isGCP ? "#eff6ff" : "#f0fdf4",
            borderBottom: `1px solid ${isGCP ? "#bfdbfe" : "#bbf7d0"}`,
            borderRadius: "16px 16px 0 0",
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: themeColor, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, flexShrink: 0, overflow: "hidden",
            }}>
              {profilePic
                ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (authUser.fullName?.[0] ?? "?")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{authUser.fullName}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                {authUser.empId}{authUser.department ? ` · ${authUser.department}` : ""}
                {authUser.jobTitle ? ` · ${authUser.jobTitle}` : ""}
              </div>
            </div>
            <span style={{
              background: themeColor, color: "#fff",
              borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {authUser.role}
            </span>
          </div>

          {isGCP && (
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "12px 24px",
              background: "#eff6ff", borderBottom: "1px solid #bfdbfe",
              fontSize: 12, color: "#1565c0",
            }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>เจ้าหน้าที่ GCP จะเห็นแบบประเมินทั้งหมด แต่สามารถกรอกได้เฉพาะส่วนของฝ่ายจัดซื้อเท่านั้น</span>
            </div>
          )}

          <div style={{ padding: "28px 28px 32px" }}>

            {/* Step 1: Eval type */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: evalType ? themeColor : "#e5e7eb",
                  color: evalType ? "#fff" : "#94a3b8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, transition: "background 0.2s",
                }}>1</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                  ประเภทการประเมิน <span style={{ color: "#ef4444" }}>*</span>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { value: "pre_eval", label: "Pre-Evaluation",  desc: "ผู้ขายรายใหม่", icon: <FileText size={20} /> },
                  { value: "post_eval",    label: "Post-Evaluation", desc: "ประเมินรายคาบ",  icon: <BarChart3 size={20} /> },
                ].map(({ value: v, label, desc, icon }) => {
                  const active = evalType === v;
                  return (
                    <label key={v} className="eval-type-card" style={{
                      display: "flex", alignItems: "center", gap: 14,
                      border: `2px solid ${active ? themeColor : "#e5e7eb"}`,
                      borderRadius: 12, padding: "14px 18px",
                      cursor: "pointer", background: active ? (isGCP ? "#eff6ff" : "#f0fdf4") : "#fafafa",
                      boxShadow: active ? `0 4px 16px ${themeColor}28` : "0 1px 4px rgba(0,0,0,0.06)",
                      transition: "all 0.2s", userSelect: "none",
                    }}>
                      <input type="radio" name="evaltype" value={v} checked={active}
                        onChange={() => { setEvalType(v); setPeriod(v === "pre_eval" ? PRE_PERIOD_OPTIONS[0] : ""); }}
                        style={{ display: "none" }} />
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: active ? themeColor : "#e5e7eb",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: active ? "#fff" : "#94a3b8", transition: "all 0.2s",
                      }}>{icon}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: active ? themeColor : "#374151", transition: "color 0.2s" }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{desc}</div>
                      </div>
                      {active && (
                        <CheckCircle2 size={16} style={{ color: themeColor, marginLeft: "auto", flexShrink: 0 }} />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 2 & 3: Supplier fields */}
            {evalType && (
              <div style={{ animation: "fadeUp 0.25s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: vendorFound ? themeColor : "#e5e7eb",
                    color: vendorFound ? "#fff" : "#94a3b8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, flexShrink: 0, transition: "background 0.2s",
                  }}>2</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>ข้อมูลผู้ขาย</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {/* Vendor code */}
                  <Field label="Tax ID / Vendor Code" required>
                    <TextInput
                      value={vendorCode}
                      onChange={v => { setVendorCode(v); setVendorLookup({ status: "idle", data: null }); setSupplierName(""); setProductType(""); }}
                      onBlur={() => lookupVendor(vendorCode)}
                      placeholder="เช่น SUP-001"
                      themeColor={themeColor}
                    />
                    <div style={{ marginTop: 5, minHeight: 18 }}>
                      {vendorLookup.status === "loading" && (
                        <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                          <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> กำลังค้นหา...
                        </span>
                      )}
                      {vendorLookup.status === "notfound" && (
                        <span style={{ fontSize: 11, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertCircle size={11} /> ไม่พบ Vendor Code นี้ในระบบ
                        </span>
                      )}
                      {vendorLookup.status === "error" && (
                        <span style={{ fontSize: 11, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertCircle size={11} /> เชื่อมต่อเซิร์ฟเวอร์ไม่ได้
                        </span>
                      )}
                      {vendorFound && (
                        <span style={{ fontSize: 11, color: "#1b5e20", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle2 size={11} /> พบข้อมูลผู้ขายแล้ว
                        </span>
                      )}
                    </div>
                  </Field>

                  {/* Supplier name */}
                  <Field label="ชื่อผู้ขาย / Supplier" hint={vendorFound ? "(จากระบบ)" : ""}>
                    <ReadBox
                      value={supplierName}
                      placeholder="จะแสดงอัตโนมัติ"
                      locked={vendorFound}
                    />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Product type */}
                  <Field label="ประเภทสินค้า" required hint={vendorFound ? "(จากระบบ)" : ""}>
                    {vendorFound
                      ? <ReadBox value={PRODUCT_LABEL[productType] ?? productType} locked />
                      : (
                        <StyledSelect
                          options={PRODUCT_TYPE_OPTIONS}
                          value={productType}
                          onChange={setProductType}
                          placeholder="เลือกประเภท"
                          themeColor={themeColor}
                        />
                      )
                    }
                  </Field>

                  {/* Period */}
                  <Field label="รอบการประเมิน" required>
                    {evalType === "pre_eval"
                      ? <ReadBox value={PRE_PERIOD_OPTIONS[0]} locked />
                      : (
                        <StyledSelect
                          options={EVAL_PERIOD_OPTIONS}
                          value={period}
                          onChange={setPeriod}
                          placeholder="เลือกรอบ"
                          themeColor={themeColor}
                        />
                      )
                    }
                  </Field>
                </div>
              </div>
            )}

            {/* Submit */}
            <div style={{ marginTop: 28 }}>
              <button
                onClick={handleSubmit}
                style={{
                  width: "100%", padding: "14px 24px",
                  background: themeColor,
                  border: "none", borderRadius: 10, cursor: "pointer",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                  fontFamily: "Sarabun, sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: `0 4px 16px ${themeColor}50`,
                  transition: "opacity 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1";   e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {isGCP ? "GCP เริ่มประเมิน Supplier" : "เริ่มประเมิน Supplier"}
                <ArrowRight size={17} />
              </button>
            </div>

          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageInner />
    </Suspense>
  );
}
