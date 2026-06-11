// ============================================================
//  components/index.js
//  Shared UI components ใช้ร่วมกันทุกหน้า
// ============================================================

import { useState, useEffect } from "react";

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
// subtitle = "BJC-10101|ฝ่ายวิศวกรรม|JB-022" (optional)
// backLabel / onBack = ปุ่มกลับ (optional)
// title = override ชื่อ title ขวา (optional)
export function Header({ subtitle, backLabel, onBack, titleOverride }) {
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
      <Clock />
    </div>
  );
}

// ------ CustomSelect ----------------------------------------
// สไตล์ dropdown สีเขียวอ่อน ตาม design
export function CustomSelect({ label, required, options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);

  // ปิด dropdown เมื่อคลิกนอก
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
          {label}
          {required && <span style={{ color: "#e53935" }}>*</span>}
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
          opacity: disabled ? 0.65 : 1,
          userSelect: "none",
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
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            maxHeight: 240, overflowY: "auto",
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
// Input field สไตล์เดียวกับ design (พื้นหลังเขียวอ่อน)
export function GreenInput({ label, required, value, onChange, placeholder, disabled }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
          {label}
          {required && <span style={{ color: "#e53935" }}>*</span>}
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder || ""}
        disabled={disabled}
        style={{
          width: "100%", boxSizing: "border-box",
          background: disabled ? "#f0f0f0" : "#d4f5c8",
          border: "1.5px solid #888", borderRadius: 8,
          padding: "8px 14px", fontSize: 14, outline: "none",
          opacity: disabled ? 0.65 : 1,
        }}
      />
    </div>
  );
}

// ------ GreenButton -----------------------------------------
export function GreenButton({ children, onClick, color = "#2e7d32", fullWidth = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color, color: "#fff", border: "none",
        borderRadius: 8, padding: "13px 36px",
        fontSize: 15, fontWeight: 700, cursor: "pointer",
        fontFamily: "monospace", letterSpacing: 1,
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}