// ============================================================
//  pages/LandingPage.jsx
// ============================================================

import { useState, useRef, useEffect } from "react";
import { useModal } from "../components";
import { authFetch } from "../utils/api";
import {
  Info, Loader2, AlertCircle, User, LogOut,
  ChevronDown, ClipboardList, Search, CheckCircle2,
  FileText, BarChart3, ArrowRight, Building2,
} from "lucide-react";

import { PRODUCT_TYPE_OPTIONS, EVAL_PERIOD_OPTIONS, PRE_PERIOD_OPTIONS } from "../constants";

const PRODUCT_MAP   = { "สินค้า": "goods", "บริการ": "services", "สินค้าและบริการ": "both" };
const PRODUCT_LABEL = { goods: "สินค้า", services: "บริการ", both: "สินค้าและบริการ" };

const TASK_EVAL_TYPE_LABEL = {
  pre_eval: "Pre-Evaluation (Supplier ใหม่)", new_supplier: "Pre-Evaluation",
  post_eval: "Post-Evaluation (90 วัน)", half_year: "Half-Year Evaluation", yearly: "Yearly Evaluation",
};
const CRITERIA_EVAL_TYPE = { post_eval: "post_eval", half_year: "post_eval", yearly: "post_eval" };

// ── Profile dropdown ─────────────────────────────────────────
function ProfileDropdown({ user, profilePic, themeColor, onProfile, onHistory, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

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

// ── Field wrapper ─────────────────────────────────────────────
function Field({ label, required, hint, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</span>
        {required && <span style={{ color: "#ef4444", fontSize: 13 }}>*</span>}
        {hint && <span style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Read-only display box ─────────────────────────────────────
function ReadBox({ value, placeholder, locked }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: locked ? "#f3f4f6" : "#f9fafb",
      border: `1.5px solid ${locked ? "#d1d5db" : "#e5e7eb"}`,
      borderRadius: 9, padding: "9px 14px", minHeight: 42,
      color: value ? "#111827" : "#9ca3af", fontSize: 14,
    }}>
      {locked && <Building2 size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />}
      <span>{value || <em style={{ fontStyle: "normal" }}>{placeholder}</em>}</span>
      {locked && value && <CheckCircle2 size={14} style={{ color: "#22c55e", marginLeft: "auto", flexShrink: 0 }} />}
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────
function TextInput({ value, onChange, onBlur, placeholder, themeColor }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      border: `1.5px solid ${focused ? themeColor : "#d1d5db"}`,
      borderRadius: 9, background: "#fff", padding: "0 14px",
      boxShadow: focused ? `0 0 0 3px ${themeColor}18` : "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      <Search size={14} style={{ color: focused ? themeColor : "#9ca3af", flexShrink: 0, transition: "color 0.15s" }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          fontSize: 14, fontFamily: "Sarabun, sans-serif", color: "#111827",
          padding: "9px 0", minHeight: 42,
        }}
      />
    </div>
  );
}

// ── Styled native select ──────────────────────────────────────
function StyledSelect({ value, onChange, options, placeholder, themeColor }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", appearance: "none", WebkitAppearance: "none",
          border: `1.5px solid ${focused ? themeColor : "#d1d5db"}`,
          borderRadius: 9, background: "#fff", padding: "9px 36px 9px 14px",
          fontSize: 14, fontFamily: "Sarabun, sans-serif", color: value ? "#111827" : "#9ca3af",
          boxShadow: focused ? `0 0 0 3px ${themeColor}18` : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          cursor: "pointer", outline: "none", minHeight: 42,
        }}
      >
        <option value="" disabled>{placeholder || "-- เลือก --"}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown size={15} style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        color: focused ? themeColor : "#9ca3af", pointerEvents: "none",
        transition: "color 0.15s",
      }} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function LandingPage({ authUser, profilePic, onSubmit, onLogout, onProfile, onHistory, onBack }) {
  const { showAlert, ModalEl } = useModal();

  const isGCP      = authUser.role === "GCP";
  const themeColor = isGCP ? "#1d4ed8" : "#15803d";
  const themeBg    = isGCP
    ? "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)"
    : "linear-gradient(135deg, #14532d 0%, #15803d 60%, #16a34a 100%)";
  // USER/GCP can only evaluate suppliers explicitly assigned to them via the
  // task system — free-typing a vendor code is reserved for ADMIN (ad-hoc use).
  const canManualEntry = authUser.role === "ADMIN";

  const [evalType,     setEvalType]     = useState("");
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");
  const [vendorLookup, setVendorLookup] = useState({ status: "idle", data: null });

  const [myTasks,      setMyTasks]      = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/evaluations/my-tasks")
      .then(r => r.ok ? r.json() : [])
      .then(data => setMyTasks(Array.isArray(data) ? data : []))
      .catch(() => setMyTasks([]))
      .finally(() => setTasksLoading(false));
  }, []);

  const startTask = (task) => {
    onSubmit({
      empId:        authUser.empId,
      employeeId:   authUser.empId,
      dept:         authUser.department,
      evalType:     CRITERIA_EVAL_TYPE[task.evalType] ?? "new_supplier",
      vendorCode:   task.vendorCode,
      supplierName: task.supplierName,
      productType:  task.productType,
      period:       task.period,
      role:         authUser.role,
      sessionId:    task.sessionId,
    });
  };

  const lookupVendor = async (code) => {
    if (!code.trim()) return "idle";
    setVendorLookup({ status: "loading", data: null });
    try {
      const res = await authFetch(`/api/suppliers/${encodeURIComponent(code.trim())}`);
      if (res.status === 404) { setVendorLookup({ status: "notfound", data: null }); return "notfound"; }
      if (!res.ok)            { setVendorLookup({ status: "error",    data: null }); return "error"; }
      const data = await res.json();
      setVendorLookup({ status: "found", data });
      setSupplierName(data.supplierName || "");
      setProductType(data.productType || "");
      return "found";
    } catch {
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
    onSubmit({
      empId: authUser.empId, employeeId: authUser.empId,
      dept: authUser.department, evalType, vendorCode,
      supplierName, productType: PRODUCT_MAP[productType] ?? productType,
      period, role: authUser.role,
    });
  };

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
            {onBack && (
              <button onClick={onBack} style={{
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
            )}
          </div>
          <ProfileDropdown
            user={authUser} profilePic={profilePic} themeColor={themeColor}
            onProfile={onProfile} onHistory={onHistory} onLogout={onLogout}
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

      {/* ── Form card ── */}
      <div style={{ maxWidth: 680, margin: "-20px auto 40px", padding: "0 20px", position: "relative", zIndex: 2 }}>

        {/* Assigned tasks */}
        {!tasksLoading && myTasks.length > 0 && (
          <div style={{ marginBottom: 16, animation: "fadeUp 0.3s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10, paddingLeft: 2 }}>
              งานที่มอบหมายให้คุณ ({myTasks.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {myTasks.map(t => {
                const due     = new Date(t.dueDate);
                const overdue = t.status === "overdue" || (due < new Date());
                return (
                  <div key={t.taskId} style={{
                    border: `1.5px solid ${overdue ? "#ef9a9a" : "#a5d6a7"}`,
                    background: overdue ? "#fff5f5" : "#f8fdf8",
                    borderRadius: 12, padding: "12px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.supplierName}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {t.vendorCode} · {TASK_EVAL_TYPE_LABEL[t.evalType] || t.evalType}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: overdue ? "#c62828" : "#6b7280", fontWeight: overdue ? 700 : 400, whiteSpace: "nowrap" }}>
                      {overdue ? "เกินกำหนด " : "ครบกำหนด "}{due.toLocaleDateString("th-TH")}
                    </div>
                    <button
                      onClick={() => startTask(t)}
                      style={{
                        background: themeColor, color: "#fff", border: "none",
                        borderRadius: 8, padding: "7px 16px", cursor: "pointer",
                        fontFamily: "Sarabun, sans-serif", fontWeight: 700, fontSize: 13,
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      เริ่มประเมิน
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!tasksLoading && !canManualEntry && myTasks.length === 0 && (
          <div style={{
            border: "1.5px dashed #ccc", borderRadius: 10,
            padding: "40px 20px", textAlign: "center", color: "#999",
          }}>
            ไม่มีงานที่ต้องประเมินในขณะนี้
          </div>
        )}

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
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
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
              fontSize: 12, color: "#1d4ed8",
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
                  color: evalType ? "#fff" : "#9ca3af",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, transition: "background 0.2s",
                }}>1</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                  ประเภทการประเมิน <span style={{ color: "#ef4444" }}>*</span>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { value: "new_supplier", label: "Pre-Evaluation",  desc: "ผู้ขายรายใหม่", icon: <FileText size={20} /> },
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
                        onChange={() => { setEvalType(v); setPeriod(v === "new_supplier" ? PRE_PERIOD_OPTIONS[0] : ""); }}
                        style={{ display: "none" }} />
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: active ? themeColor : "#e5e7eb",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: active ? "#fff" : "#9ca3af", transition: "all 0.2s",
                      }}>{icon}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: active ? themeColor : "#374151", transition: "color 0.2s" }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{desc}</div>
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
                    color: vendorFound ? "#fff" : "#9ca3af",
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
                        <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
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
                        <span style={{ fontSize: 11, color: "#15803d", display: "flex", alignItems: "center", gap: 4 }}>
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
                    {evalType === "new_supplier"
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
