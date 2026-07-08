// ============================================================
//  styles/theme.js
//  จุดกลางของสี/ธีมทั้งแอป — เดิมแต่ละหน้ากำหนดสีเอง (hex ตรงๆ ในทุกไฟล์)
//  ทำให้ role เดียวกันได้คนละสีในแต่ละหน้า (เช่น ADMIN เป็นสีชมพูในหน้าหนึ่ง
//  แต่เป็นสีม่วงอีกหน้าหนึ่ง) แก้โดยรวมเป็นจุดเดียว ให้ทุกหน้า import
//  แทนที่จะประกาศ hex ของตัวเอง
// ============================================================

// ── Role theme (badge color + light background tint) ──────────
// นี่คือ mapping ที่ "ถูกต้อง" ตามดีไซน์เดิม — ADMIN=ชมพู/แดง,
// SUPERVISOR=ม่วง, USER=เขียว, GCP=ฟ้า (ProfilePage.jsx เคยสลับ
// ADMIN กับ SUPERVISOR ผิดไปเป็นม่วง/ส้ม ตอนนี้แก้ให้ตรงกันหมดแล้ว)
export const ROLE_THEME = {
  USER:       { main: "#1b5e20", bg: "#e8f5e9", gradient: "linear-gradient(135deg, #14532d 0%, #1b5e20 60%, #2e7d32 100%)" },
  GCP:        { main: "#1565c0", bg: "#e3f2fd", gradient: "linear-gradient(135deg, #1e3a8a 0%, #1565c0 60%, #2563eb 100%)" },
  ADMIN:      { main: "#880e4f", bg: "#fce4ec", gradient: "linear-gradient(135deg, #4a0621 0%, #880e4f 60%, #ad1457 100%)" },
  SUPERVISOR: { main: "#6a1b9a", bg: "#f3e5f5", gradient: "linear-gradient(135deg, #38134f 0%, #6a1b9a 60%, #8e24aa 100%)" },
};

export function roleThemeColor(role) {
  return ROLE_THEME[role?.toUpperCase()]?.main ?? ROLE_THEME.USER.main;
}

export function roleThemeGradient(role) {
  return ROLE_THEME[role?.toUpperCase()]?.gradient ?? ROLE_THEME.USER.gradient;
}

// ── Core palette ────────────────────────────────────────────────
// เขียวหลักของแอป (SPES) — ใช้แทน hex เขียวที่ใกล้เคียงกันแต่ไม่เหมือนกัน
// เป๊ะที่กระจายอยู่ทั่วโปรเจกต์ (#1b5e20 / #2e7d32 / #1a6b1a ฯลฯ)
export const GREEN = {
  darkest: "#1b5e20",
  dark:    "#2e7d32",
  base:    "#1b5e20",
  light:   "#a5d6a7",
  bg:      "#e8f5e9",
};

// สถานะ/ความหมาย (error, warning, info) — ใช้ค่าที่พบบ่อยที่สุดในโค้ดเดิม
export const SEMANTIC = {
  error:   "#c62828",
  errorDark: "#b71c1c",
  warning: "#e65100",
  info:    "#1565c0",
};

// เกรดผลประเมิน A-F — ต้อง import ค่าจริงจาก constants.js (GRADE_MAP คือ
// source of truth ตัวจริง) ไม่ใช่กำหนดค่าใหม่ตรงนี้ — ค่าที่เคยเขียนไว้ตรง
// นี้ก่อนหน้า (#1b5e20/#1565c0/...) เดาผิดไปจากของจริง (#53af28/#92c015/...)
export { GRADE_MAP as GRADE_COLOR } from "../constants";

// เทาเป็นกลาง (Slate scale) — เดิมมีทั้ง Tailwind gray และ slate ปนกัน
// เลือก slate เป็นมาตรฐานเพราะมีจุดใช้งานอยู่แล้วมากกว่า
export const GRAY = {
  50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1",
  400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155",
  800: "#1e293b", 900: "#0f172a",
};
