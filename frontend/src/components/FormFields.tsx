// ============================================================
//  components/FormFields.tsx
//  ชิ้นส่วนฟอร์มทั่วไป (label wrapper, read-only box, text input,
//  select) — เดิมอยู่ใน LandingPage.jsx แต่เป็น presentational component
//  ล้วนๆ ไม่ผูกกับ state ของหน้านั้นเลย แยกออกมาให้ใช้ซ้ำได้จากหน้าอื่น
// ============================================================
"use client";

import { useState, type ReactNode } from "react";
import { Building2, CheckCircle2, Search, ChevronDown } from "lucide-react";

// ── Field wrapper (label + required + hint) ───────────────────
interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</span>
        {required && <span style={{ color: "#ef4444", fontSize: 13 }}>*</span>}
        {hint && <span style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Read-only display box ─────────────────────────────────────
interface ReadBoxProps {
  value?: string | null;
  placeholder?: string;
  locked?: boolean;
}

export function ReadBox({ value, placeholder, locked }: ReadBoxProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: locked ? "#f3f4f6" : "#f9fafb",
      border: `1.5px solid ${locked ? "#d1d5db" : "#e5e7eb"}`,
      borderRadius: 9, padding: "9px 14px", minHeight: 42,
      color: value ? "#111827" : "#94a3b8", fontSize: 14,
    }}>
      {locked && <Building2 size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />}
      <span>{value || <em style={{ fontStyle: "normal" }}>{placeholder}</em>}</span>
      {locked && value && <CheckCircle2 size={14} style={{ color: "#22c55e", marginLeft: "auto", flexShrink: 0 }} />}
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  themeColor: string;
}

export function TextInput({ value, onChange, onBlur, placeholder, themeColor }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      border: `1.5px solid ${focused ? themeColor : "#d1d5db"}`,
      borderRadius: 9, background: "#fff", padding: "0 14px",
      boxShadow: focused ? `0 0 0 3px ${themeColor}18` : "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      <Search size={14} style={{ color: focused ? themeColor : "#94a3b8", flexShrink: 0, transition: "color 0.15s" }} />
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
interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  themeColor: string;
}

export function StyledSelect({ value, onChange, options, placeholder, themeColor }: StyledSelectProps) {
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
          fontSize: 14, fontFamily: "Sarabun, sans-serif", color: value ? "#111827" : "#94a3b8",
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
        color: focused ? themeColor : "#94a3b8", pointerEvents: "none",
        transition: "color 0.15s",
      }} />
    </div>
  );
}
