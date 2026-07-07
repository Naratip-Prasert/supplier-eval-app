// ============================================================
//  components/index.jsx — Shared UI components
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, AlertTriangle, HelpCircle } from "lucide-react";

// ------ useClickOutside ----------------------------------------
// ปิด dropdown/popover เมื่อคลิกข้างนอกกล่อง — pattern นี้ถูก copy ซ้ำแยก
// กันหลายที่ (ProfileDropdown, filter panel, export menu ฯลฯ) รวมเป็น hook
// เดียวใช้ร่วมกัน
export function useClickOutside(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// ------ Logo --------------------------------------------------
// Flat badge icon: ascending bars (performance) + a trend line up to a
// highlighted point — no real brand asset exists for this project yet,
// so this is a small reusable SVG mark instead of an <img>.
export function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="12" fill="#ffffff" />
      <rect x="10" y="28" width="7" height="10" rx="1.6" fill="#a5d6a7" />
      <rect x="19" y="22" width="7" height="16" rx="1.6" fill="#66bb6a" />
      <rect x="28" y="14" width="7" height="24" rx="1.6" fill="#1b5e20" />
      <path d="M13 27 L22 21 L31 13 L37 10" stroke="#1b5e20" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="37" cy="10" r="4" fill="#ffd54f" stroke="#1b5e20" strokeWidth="1.4" />
    </svg>
  );
}

// ------ Clock -----------------------------------------------
export function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#fff" }}>
      <div>{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</div>
      <div>{pad(now.getDate())}/{pad(now.getMonth() + 1)}/{now.getFullYear()}</div>
    </div>
  );
}

// ------ Header ----------------------------------------------
export function Header({ subtitle, backLabel, onBack, titleOverride, user, onLogout, profilePic }) {
  return (
    <div className="app-header" style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(115deg, #1b7a1f 0%, #146318 55%, #0d4d0d 100%)",
      color: "#fff", padding: "16px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap",
      boxShadow: "0 3px 14px rgba(0,0,0,0.18)",
    }}>
      <style>{`
        /* Both sides are flexShrink:0 by design (title/back button must
           stay readable, user info must stay legible) — on a narrow phone
           there just isn't room for both on one row, so they used to
           overlap instead of wrapping. Force them onto their own rows. */
        @media (max-width: 640px) {
          .app-header { row-gap: 8px; }
          .app-header-left, .app-header-right { flex: 1 1 100% !important; justify-content: space-between; }
          .app-header-right .app-header-clock { display: none; }
        }
      `}</style>
      {/* Decorative backdrop — faint dot grid + a soft glow, kept low-opacity
          so it reads as texture rather than competing with the header text */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1.4px, transparent 1.4px)",
        backgroundSize: "18px 18px",
      }} />
      <div aria-hidden style={{
        position: "absolute", top: "-60%", right: "-6%", width: 260, height: 260,
        borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none",
      }} />
      <div className="app-header-left" style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.18)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6,
              padding: "4px 14px", fontSize: 12, cursor: "pointer",
              fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {backLabel || "← กลับหน้าหลัก"}
          </button>
        )}
        <Logo size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 17, letterSpacing: 1.2 }}>
            {titleOverride || "SPES"}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: "#c8e6c9", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div className="app-header-right" style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.65)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
              overflow: "hidden", flexShrink: 0,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff",
            }}>
              {profilePic
                ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (user.fullName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
              }
            </div>
            <div style={{ textAlign: "right", lineHeight: 1.3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{user.fullName}</div>
              <div style={{ fontSize: 11, color: "#c8e6c9" }}>{user.role} · {user.department}</div>
            </div>
          </div>
        )}
        <div className="app-header-clock"><Clock /></div>
        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              background: "rgba(255,255,255,0.15)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6,
              padding: "5px 14px", fontSize: 12, cursor: "pointer",
              fontFamily: "monospace", whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
          >
            ออกจากระบบ
          </button>
        )}
      </div>
    </div>
  );
}

// ------ PasswordInput ---------------------------------------
export function PasswordInput({ label, required, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
          {label}{required && <span style={{ color: "#e53935" }}>*</span>}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          placeholder={placeholder || ""}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#d4f5c8", border: `1.5px solid ${error ? "#e53935" : "#888"}`,
            borderRadius: 8, padding: "8px 44px 8px 14px", fontSize: 14, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "#666", lineHeight: 1,
          }}
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <div style={{ color: "#e53935", fontSize: 11, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

// ------ CustomSelect ----------------------------------------
export function CustomSelect({ label, required, options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
          {label}{required && <span style={{ color: "#e53935" }}>*</span>}
        </div>
      )}
      <div
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen((o) => !o); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: disabled ? "#f0f0f0" : "#d4f5c8",
          border: "1.5px solid #333", borderRadius: 8,
          padding: "8px 12px", cursor: disabled ? "default" : "pointer",
          fontSize: 14, color: value ? "#111" : "#666",
          opacity: disabled ? 0.65 : 1, userSelect: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "--เลือก--"}
        </span>
        <span style={{ fontSize: 11, marginLeft: 8, flexShrink: 0 }}>∨</span>
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999,
            background: "#d4f5c8", border: "1.5px solid #333",
            borderTop: "none", borderRadius: "0 0 8px 8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)", maxHeight: 240, overflowY: "auto",
          }}
        >
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: "10px 14px", cursor: "pointer", fontSize: 14,
                borderBottom: "1px solid rgba(0,0,0,0.07)",
                background: value === opt ? "rgba(0,100,0,0.12)" : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,100,0,0.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = value === opt ? "rgba(0,100,0,0.12)" : "transparent")}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------ GreenInput ------------------------------------------
export function GreenInput({ label, required, value, onChange, onBlur, placeholder, disabled, error }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
          {label}{required && <span style={{ color: "#e53935" }}>*</span>}
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || ""}
        disabled={disabled}
        style={{
          width: "100%", boxSizing: "border-box",
          background: disabled ? "#f0f0f0" : "#d4f5c8",
          border: `1.5px solid ${error ? "#e53935" : "#888"}`,
          borderRadius: 8, padding: "8px 14px", fontSize: 14, outline: "none",
          opacity: disabled ? 0.65 : 1,
        }}
      />
      {error && <div style={{ color: "#e53935", fontSize: 11, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

// ------ useModal + AppModal ---------------------------------
// ใช้แทน window.alert / window.confirm ให้สวยขึ้น
// Usage:
//   const { showAlert, showConfirm, ModalEl } = useModal();
//   render {ModalEl} ใน JSX
//   await showAlert("ข้อความ", "หัวข้อ")
//   const ok = await showConfirm("ข้อความ", "หัวข้อ")

const MODAL_ANIM = `
  @keyframes _modalIn {
    from { opacity: 0; transform: scale(0.88) translateY(-12px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);     }
  }
  @keyframes _overlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

function AppModal({ type, title, message, onClose }) {
  const isWarn   = type === "alert";
  const headerBg = isWarn ? "#e65100" : "#1a6b1a";
  const Icon     = isWarn ? AlertTriangle : HelpCircle;
  const okColor  = isWarn ? "#e65100" : "#2e7d32";
  const okHover  = isWarn ? "#bf360c" : "#1b5e20";

  return (
    <>
      <style>{MODAL_ANIM}</style>
      {/* Overlay */}
      <div
        onClick={() => type === "alert" && onClose(undefined)}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.48)",
          animation: "_overlayIn 0.18s ease",
        }}
      />
      {/* Card */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, pointerEvents: "none",
      }}>
        <div style={{
          background: "#fff", borderRadius: 14,
          width: "min(440px, 100%)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          overflow: "hidden",
          animation: "_modalIn 0.2s cubic-bezier(.34,1.3,.64,1)",
          pointerEvents: "auto",
        }}>
          {/* Header */}
          <div style={{
            background: headerBg, padding: "14px 20px",
            display: "flex", alignItems: "center", gap: 12, color: "#fff",
          }}>
            <Icon size={26} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "Sarabun, sans-serif" }}>{title}</span>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 24px 12px" }}>
            <p style={{
              margin: 0, fontSize: 14, fontFamily: "Sarabun, sans-serif",
              whiteSpace: "pre-line", lineHeight: 1.85, color: "#333",
            }}>
              {message}
            </p>
          </div>

          {/* Footer */}
          <div style={{
            padding: "12px 20px 20px",
            display: "flex", justifyContent: "flex-end", gap: 10,
          }}>
            {type === "confirm" && (
              <button
                onClick={() => onClose(false)}
                style={{
                  background: "#f5f5f5", color: "#555",
                  border: "1.5px solid #d0d0d0", borderRadius: 8,
                  padding: "10px 26px", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "Sarabun, sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e0e0e0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              >
                ยกเลิก
              </button>
            )}
            <button
              onClick={() => onClose(type === "confirm" ? true : undefined)}
              style={{
                background: okColor, color: "#fff", border: "none", borderRadius: 8,
                padding: "10px 30px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "Sarabun, sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = okHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = okColor)}
            >
              ตกลง
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function useModal() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const showAlert = (message, title = "แจ้งเตือน") =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ type: "alert", title, message });
    });

  const showConfirm = (message, title = "ยืนยัน") =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ type: "confirm", title, message });
    });

  const handleClose = (value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  };

  const ModalEl = state ? (
    <AppModal
      type={state.type}
      title={state.title}
      message={state.message}
      onClose={handleClose}
    />
  ) : null;

  return { showAlert, showConfirm, ModalEl };
}

// ------ GreenButton -----------------------------------------
export function GreenButton({ children, onClick, color = "#2e7d32", fullWidth = false, disabled = false, style = {}, className }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className}
      style={{
        background: disabled ? "#9e9e9e" : color,
        color: "#fff", border: "none", borderRadius: 8,
        padding: "13px 36px", fontSize: 15, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "monospace", letterSpacing: 1,
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.7 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
