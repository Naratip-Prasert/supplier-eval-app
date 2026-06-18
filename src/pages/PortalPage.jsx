// ============================================================
//  pages/PortalPage.jsx  —  Role-based portal hub after login
// ============================================================

import { useState } from "react";
import { Header } from "../components";
import {
  ClipboardList, Clock, BarChart2, Shield,
  User, LogOut, ArrowRight,
} from "lucide-react";

// ── Module definitions ────────────────────────────────────────
const MODULES = [
  {
    key: "evaluate",
    icon: ClipboardList,
    title: "ประเมินซัพพลายเออร์",
    titleEn: "Supplier Evaluation",
    desc: "เริ่มประเมิน Pre-Evaluation (ซัพพลายเออร์ใหม่) หรือ Post-Evaluation (ติดตามผล) สำหรับซัพพลายเออร์ที่ได้รับมอบหมาย",
    color: "#1b5e20",
    bg: "linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)",
    border: "#a5d6a7",
    accent: "#2e7d32",
    roles: ["USER", "GCP", "ADMIN"],
    available: true,
    buttonLabel: "เริ่มประเมิน",
  },
  {
    key: "history",
    icon: Clock,
    title: "ประวัติการประเมิน",
    titleEn: "My Evaluation History",
    desc: "ดูผลการประเมินที่คุณเคยส่งทั้งหมด พร้อมคะแนน เกรด และข้อมูลซัพพลายเออร์",
    color: "#1565c0",
    bg: "linear-gradient(135deg, #e3f2fd 0%, #ede7f6 100%)",
    border: "#90caf9",
    accent: "#1976d2",
    roles: ["USER", "GCP", "ADMIN"],
    available: true,
    buttonLabel: "ดูประวัติ",
  },
  {
    key: "dashboard",
    icon: BarChart2,
    title: "Dashboard",
    titleEn: "Analytics & Reports",
    desc: "สรุปผลการประเมินภาพรวม เปรียบเทียบซัพพลายเออร์ และแนวโน้มคะแนน",
    color: "#6a1b9a",
    bg: "linear-gradient(135deg, #f3e5f5 0%, #fce4ec 100%)",
    border: "#ce93d8",
    accent: "#7b1fa2",
    roles: ["USER", "GCP", "ADMIN"],
    available: false,
    buttonLabel: "เร็วๆ นี้",
  },
  {
    key: "admin",
    icon: Shield,
    title: "จัดการระบบ",
    titleEn: "Administration",
    desc: "จัดการข้อมูลซัพพลายเออร์ พนักงาน สิทธิ์การประเมิน เกณฑ์คะแนน และตั้งค่าระบบ",
    color: "#bf360c",
    bg: "linear-gradient(135deg, #fbe9e7 0%, #fff8e1 100%)",
    border: "#ffab91",
    accent: "#d84315",
    roles: ["ADMIN"],
    available: true,
    buttonLabel: "เข้าสู่ระบบจัดการ",
  },
];

const ROLE_BADGE = {
  USER:  { label: "USER — ผู้ใช้งานทั่วไป",  bg: "#e8f5e9", color: "#1b5e20" },
  GCP:   { label: "GCP — เจ้าหน้าที่จัดซื้อ",   bg: "#e3f2fd", color: "#1565c0" },
  ADMIN: { label: "Admin — Administrator", bg: "#fce4ec", color: "#880e4f" },
};

// ── PortalPage ────────────────────────────────────────────────
export default function PortalPage({
  authUser, profilePic,
  onLogout, onProfile, onHistory, onEvaluate, onAdmin,
}) {
  const role    = authUser?.role ?? "USER";
  const badge   = ROLE_BADGE[role] ?? ROLE_BADGE.USER;
  const modules = MODULES
    .filter((m) => m.roles.includes(role))
    .sort((a, b) => role === "ADMIN" && a.key === "admin" ? -1 : role === "ADMIN" && b.key === "admin" ? 1 : 0);

  const handleModule = (mod) => {
    if (!mod.available) return;
    if (mod.key === "evaluate") onEvaluate?.();
    if (mod.key === "history")  onHistory?.();
    if (mod.key === "admin")    onAdmin?.();
  };

  const initials = (authUser?.fullName || "?")
    .split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>

      {/* ── Header ── */}
      <Header titleOverride="Supplier Evaluation System" />

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "20px 20px 48px" }}>

        {/* ── Welcome card ── */}
        <div style={{
          background: "linear-gradient(135deg, #1a6b1a 0%, #2e7d32 60%, #388e3c 100%)",
          borderRadius: 18, padding: "28px 32px", marginBottom: 32,
          boxShadow: "0 6px 28px rgba(26,107,26,0.28)",
          display: "flex", alignItems: "center", gap: 22,
          position: "relative", overflow: "hidden",
        }}>
          {/* Decorative circles */}
          <div style={{
            position: "absolute", right: -40, top: -40,
            width: 200, height: 200, borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
          }} />
          <div style={{
            position: "absolute", right: 60, bottom: -60,
            width: 150, height: 150, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }} />

          {/* Avatar */}
          <div style={{
            width: 70, height: 70, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            border: "2.5px solid rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: "#fff",
            flexShrink: 0, overflow: "hidden", position: "relative", zIndex: 1,
          }}>
            {profilePic
              ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initials}
          </div>

          <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>
              ยินดีต้อนรับเข้าสู่ระบบ
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>
              {authUser?.fullName}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                background: badge.bg, color: badge.color,
                borderRadius: 20, padding: "3px 12px",
                fontSize: 11, fontWeight: 700,
              }}>
                {badge.label}
              </span>
              <span style={{
                background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)",
                borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600,
              }}>
                {authUser?.department}
              </span>
              {authUser?.empId && (
                <span style={{
                  background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)",
                  borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600,
                  fontFamily: "monospace",
                }}>
                  {authUser.empId}
                </span>
              )}
            </div>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            flexShrink: 0, position: "relative", zIndex: 1,
          }}>
            <button
              onClick={onProfile}
              title="โปรไฟล์"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 20, padding: "6px 14px",
                cursor: "pointer", color: "#fff", fontSize: 12,
                fontFamily: "Sarabun, sans-serif", fontWeight: 600,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
            >
              <User size={13} /> โปรไฟล์
            </button>
            <button
              onClick={onLogout}
              title="ออกจากระบบ"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 20, padding: "6px 14px",
                cursor: "pointer", color: "rgba(255,255,255,0.75)", fontSize: 12,
                fontFamily: "Sarabun, sans-serif", fontWeight: 600,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,100,100,0.25)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
            >
              <LogOut size={13} /> ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ── Section label ── */}
        <div style={{ fontSize: 15, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: 0.3 }}>
          เลือกโมดูล
        </div>

        {/* ── Module cards grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))",
          gap: 18,
        }}>
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <ModuleCard
                key={mod.key}
                mod={mod}
                Icon={Icon}
                onClick={() => handleModule(mod)}
              />
            );
          })}
        </div>

        {/* ── Footer note ── */}
        <div style={{
          marginTop: 40, textAlign: "center",
          fontSize: 12, color: "#aaa",
        }}>
          Supplier Evaluation System · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

// ── Circle bg per module ─────────────────────────────────────
const CIRCLE_BG = {
  evaluate: "radial-gradient(circle at 38% 35%, #f1f8e9, #a5d6a7 130%)",
  history:  "radial-gradient(circle at 38% 35%, #e8f4fd, #90caf9 130%)",
  dashboard:"radial-gradient(circle at 38% 35%, #f8f0ff, #ce93d8 130%)",
  admin:    "radial-gradient(circle at 38% 35%, #fff3e0, #ffab91 130%)",
};

// ── Compact 3D-flat illustrations (82 × 82) ──────────────────
const CARD_ART = {
  evaluate: (
    <svg width="82" height="82" viewBox="0 0 82 82" fill="none">
      <defs>
        <linearGradient id="ev_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#81c784"/><stop offset="100%" stopColor="#2e7d32"/></linearGradient>
        <linearGradient id="ev_chk"  x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#b9f6ca"/><stop offset="100%" stopColor="#00c853"/></linearGradient>
      </defs>
      {/* clipboard 3D side */}
      <rect x="11" y="23" width="6"  height="50" rx="2" fill="#1b5e20"/>
      <rect x="11" y="69" width="50" height="6"  rx="2" fill="#1b5e20"/>
      {/* clipboard body */}
      <rect x="15" y="17" width="48" height="56" rx="7" fill="url(#ev_body)"/>
      {/* clip */}
      <rect x="29" y="11" width="22" height="12" rx="6" fill="#1b5e20"/>
      <rect x="34" y="13" width="12" height="8"  rx="4" fill="#388e3c"/>
      {/* lines on clipboard */}
      <rect x="23" y="33" width="32" height="5" rx="2.5" fill="rgba(255,255,255,0.9)"/>
      <rect x="23" y="43" width="22" height="4" rx="2"   fill="rgba(255,255,255,0.65)"/>
      <rect x="23" y="52" width="28" height="4" rx="2"   fill="rgba(255,255,255,0.65)"/>
      <rect x="23" y="61" width="16" height="4" rx="2"   fill="rgba(255,255,255,0.4)"/>
      {/* check badge */}
      <circle cx="61" cy="59" r="15" fill="url(#ev_chk)" stroke="white" strokeWidth="2"/>
      <path d="M54 59l5 6 10-11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* gold stars */}
      <path d="M67 14l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#ffd740"/>
      <path d="M13 10l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1-2 1 .4-2.3-1.7-1.6 2.3-.3z" fill="#ffd740" opacity=".75"/>
    </svg>
  ),
  history: (
    <svg width="82" height="82" viewBox="0 0 82 82" fill="none">
      <defs>
        <linearGradient id="cl_face" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0%" stopColor="#64b5f6"/><stop offset="100%" stopColor="#1565c0"/></linearGradient>
        <linearGradient id="cl_cal"  x1="0"  y1="0" x2="0"  y2="1"><stop offset="0%" stopColor="#90caf9"/><stop offset="100%" stopColor="#1976d2"/></linearGradient>
      </defs>
      {/* clock shadow */}
      <circle cx="38" cy="45" r="27" fill="#1565c0" opacity=".3"/>
      {/* clock face */}
      <circle cx="36" cy="42" r="27" fill="url(#cl_face)"/>
      <circle cx="36" cy="42" r="23" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1.5"/>
      {/* ticks */}
      <line x1="36" y1="18" x2="36" y2="23" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="36" y1="61" x2="36" y2="66" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="42" x2="17" y2="42" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="55" y1="42" x2="60" y2="42" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
      {/* hands */}
      <line x1="36" y1="42" x2="36" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="36" y1="42" x2="47" y2="50" stroke="white" strokeWidth="2"   strokeLinecap="round"/>
      <circle cx="36" cy="42" r="3" fill="white"/>
      {/* mini calendar floating */}
      <rect x="55" y="12" width="22" height="24" rx="5" fill="url(#cl_cal)" stroke="white" strokeWidth="1.5"/>
      <rect x="55" y="12" width="22" height="8"  rx="5" fill="#1565c0"/>
      <rect x="58" y="24" width="4" height="4" rx="1" fill="rgba(255,255,255,.75)"/>
      <rect x="65" y="24" width="4" height="4" rx="1" fill="rgba(255,255,255,.75)"/>
      <rect x="58" y="31" width="4" height="4" rx="1" fill="rgba(255,255,255,.5)"/>
      <rect x="65" y="31" width="4" height="4" rx="1" fill="rgba(255,255,255,.75)"/>
      {/* undo arrow */}
      <path d="M10 58 C7 50 11 42 17 39" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".7"/>
      <path d="M13 35 L17 39 L12 43"    stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".7"/>
    </svg>
  ),
  dashboard: (
    <svg width="82" height="82" viewBox="0 0 82 82" fill="none">
      <defs>
        <linearGradient id="db_b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ce93d8"/><stop offset="100%" stopColor="#6a1b9a"/></linearGradient>
        <linearGradient id="db_b2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e040fb"/><stop offset="100%" stopColor="#9c27b0"/></linearGradient>
        <linearGradient id="db_b3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f48fb1"/><stop offset="100%" stopColor="#880e4f"/></linearGradient>
      </defs>
      {/* panel */}
      <rect x="6" y="22" width="70" height="52" rx="9" fill="rgba(243,229,245,.7)"/>
      {/* bar 1 */}
      <rect x="16" y="58" width="12" height="10" rx="1.5" fill="#4a0072"/>
      <rect x="16" y="46" width="12" height="22" rx="3"   fill="url(#db_b1)"/>
      <rect x="16" y="44" width="12" height="5"  rx="2"   fill="#e1bee7"/>
      {/* bar 2 */}
      <rect x="35" y="58" width="12" height="10" rx="1.5" fill="#4a0072"/>
      <rect x="35" y="36" width="12" height="32" rx="3"   fill="url(#db_b2)"/>
      <rect x="35" y="34" width="12" height="5"  rx="2"   fill="#f3e5f5"/>
      {/* bar 3 */}
      <rect x="54" y="58" width="12" height="10" rx="1.5" fill="#4a0072"/>
      <rect x="54" y="28" width="12" height="40" rx="3"   fill="url(#db_b3)"/>
      <rect x="54" y="26" width="12" height="5"  rx="2"   fill="#fce4ec"/>
      {/* trend line */}
      <path d="M22 50 L41 38 L60 30" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="22" cy="50" r="3" fill="white"/>
      <circle cx="41" cy="38" r="3" fill="white"/>
      <circle cx="60" cy="30" r="3" fill="white"/>
      {/* floating metric card */}
      <rect x="42" y="6" width="34" height="20" rx="6" fill="white" stroke="rgba(206,147,216,.4)" strokeWidth="1"/>
      <rect x="48" y="11" width="14" height="5" rx="2.5" fill="#9c27b0"/>
      <rect x="48" y="18" width="9"  height="3" rx="1.5" fill="#ce93d8"/>
      <rect x="64" y="18" width="6"  height="3" rx="1.5" fill="#f48fb1"/>
      {/* sparkle */}
      <path d="M8 16 L9.5 12 L11 16 L15 17.5 L11 19 L9.5 23 L8 19 L4 17.5z" fill="#e040fb" opacity=".65"/>
    </svg>
  ),
  admin: (
    <svg width="82" height="82" viewBox="0 0 82 82" fill="none">
      <defs>
        <linearGradient id="ad_shd" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0%" stopColor="#ff7043"/><stop offset="100%" stopColor="#bf360c"/></linearGradient>
        <linearGradient id="ad_gr"  x1="0"  y1="0" x2="1"  y2="1"><stop offset="0%" stopColor="#ffcc80"/><stop offset="100%" stopColor="#e65100"/></linearGradient>
      </defs>
      {/* shield shadow */}
      <path d="M42 12 L66 22 L66 50 C66 65 53 74 42 80 C31 74 18 65 18 50 L18 22Z" fill="#bf360c" opacity=".3" transform="translate(2 3)"/>
      {/* shield */}
      <path d="M41 10 L65 20 L65 48 C65 64 53 74 41 80 C29 74 17 64 17 48 L17 20Z" fill="url(#ad_shd)"/>
      <path d="M41 18 L59 26 L59 48 C59 60 50 68 41 72 C32 68 23 60 23 48 L23 26Z" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
      {/* checkmark on shield */}
      <path d="M30 47l9 10 19-21" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* gear */}
      <circle cx="66" cy="18" r="12" fill="url(#ad_gr)" stroke="white" strokeWidth="1.8"/>
      <circle cx="66" cy="18" r="5"  fill="rgba(255,255,255,.4)"/>
      <path d="M66 6v4M66 28v4M54 18h4M74 18h4M58.1 10.1l2.8 2.8M71.1 23.1l2.8 2.8M58.1 25.9l2.8-2.8M71.1 12.9l2.8-2.8" stroke="rgba(255,255,255,.8)" strokeWidth="1.5" strokeLinecap="round"/>
      {/* user pills */}
      <circle cx="11" cy="26" r="6" fill="rgba(191,54,12,.5)" stroke="white" strokeWidth="1.3"/>
      <path d="M6 35 C6 30 16 30 16 35" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".8"/>
      <circle cx="11" cy="50" r="6" fill="rgba(191,54,12,.4)" stroke="white" strokeWidth="1.3"/>
      <path d="M6 59 C6 54 16 54 16 59" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".7"/>
    </svg>
  ),
};

// ── ModuleCard ────────────────────────────────────────────────
function ModuleCard({ mod, Icon, onClick }) {
  const [hovered, setHovered] = useState(false);
  const art      = CARD_ART[mod.key];
  const circleBg = CIRCLE_BG[mod.key] ?? "radial-gradient(circle,#f5f5f5,#e0e0e0)";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: "24px 18px 20px",
        textAlign: "center",
        cursor: mod.available ? "pointer" : "default",
        boxShadow: hovered && mod.available
          ? "0 14px 36px rgba(0,0,0,0.15)"
          : "0 3px 14px rgba(0,0,0,0.08)",
        transform: hovered && mod.available ? "translateY(-6px)" : "none",
        transition: "transform .22s, box-shadow .22s",
        position: "relative",
        opacity: mod.available ? 1 : 0.72,
      }}
    >
      {/* Coming soon chip */}
      {!mod.available && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          background: "#f0f0f0", borderRadius: 20,
          padding: "2px 9px", fontSize: 9, color: "#999", fontWeight: 800, letterSpacing: 0.5,
        }}>SOON</div>
      )}

      {/* Circle illustration */}
      <div style={{
        width: 118, height: 118, borderRadius: "50%",
        background: mod.available ? circleBg : "radial-gradient(circle,#f5f5f5,#e0e0e0)",
        margin: "0 auto 16px",
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: hovered && mod.available ? "scale(1.07)" : "scale(1)",
        transition: "transform .25s",
        filter: mod.available ? "none" : "grayscale(1) opacity(.5)",
      }}>
        {art ?? <Icon size={42} style={{ color: mod.color }} />}
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a1a", marginBottom: 3, lineHeight: 1.3 }}>
        {mod.title}
      </div>
      <div style={{ fontSize: 10.5, color: "#bbb", fontWeight: 500, letterSpacing: 0.3, marginBottom: 14 }}>
        {mod.titleEn}
      </div>

      {/* CTA */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 12, fontWeight: 700,
        color: mod.available ? mod.accent : "#ccc",
      }}>
        {mod.buttonLabel}
        {mod.available && (
          <ArrowRight size={13} style={{
            transform: hovered ? "translateX(3px)" : "none",
            transition: "transform .15s",
          }}/>
        )}
      </div>
    </div>
  );
}
