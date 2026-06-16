// ============================================================
//  components/index.jsx — Shared UI components
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, AlertTriangle, HelpCircle } from "lucide-react";

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
export function Header({ subtitle, backLabel, onBack, titleOverride, user, onLogout }) {
  return (
    <div style={{
      background: "#1a6b1a", color: "#fff", padding: "10px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
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
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>
            {titleOverride || "Supplier Evaluation System"}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: "#a5d6a7", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {user && (
          <div style={{ textAlign: "right", lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{user.fullName}</div>
            <div style={{ fontSize: 11, color: "#a5d6a7" }}>{user.role} · {user.department}</div>
          </div>
        )}
        <Clock />
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
export function GreenButton({ children, onClick, color = "#2e7d32", fullWidth = false, disabled = false, style = {} }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
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
