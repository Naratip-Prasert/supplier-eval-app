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
    roles: ["BU", "GCP", "ADMIN"],
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
    roles: ["BU", "GCP", "ADMIN"],
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
    roles: ["BU", "GCP", "ADMIN"],
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
    available: false,
    buttonLabel: "เร็วๆ นี้",
  },
];

const ROLE_BADGE = {
  BU:    { label: "USER — Business Unit",    bg: "#e8f5e9", color: "#1b5e20" },
  GCP:   { label: "GCP — Central Buyer",   bg: "#e3f2fd", color: "#1565c0" },
  ADMIN: { label: "Admin — Administrator", bg: "#fce4ec", color: "#880e4f" },
};

// ── PortalPage ────────────────────────────────────────────────
export default function PortalPage({
  authUser, profilePic,
  onLogout, onProfile, onHistory, onEvaluate,
}) {
  const role    = authUser?.role ?? "BU";
  const badge   = ROLE_BADGE[role] ?? ROLE_BADGE.BU;
  const modules = MODULES.filter((m) => m.roles.includes(role));

  const handleModule = (mod) => {
    if (!mod.available) return;
    if (mod.key === "evaluate") onEvaluate?.();
    if (mod.key === "history")  onHistory?.();
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
          gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
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

// ── ModuleCard ────────────────────────────────────────────────
function ModuleCard({ mod, Icon, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        border: `1.5px solid ${hovered && mod.available ? mod.border : "#e8e8e8"}`,
        borderRadius: 16,
        padding: "24px 22px 20px",
        cursor: mod.available ? "pointer" : "default",
        boxShadow: hovered && mod.available
          ? "0 10px 32px rgba(0,0,0,0.13)"
          : "0 2px 10px rgba(0,0,0,0.05)",
        transform: hovered && mod.available ? "translateY(-4px)" : "none",
        transition: "transform .2s, box-shadow .2s, border-color .15s",
        position: "relative", overflow: "hidden",
        opacity: mod.available ? 1 : 0.65,
      }}
    >
      {/* Coming soon badge */}
      {!mod.available && (
        <div style={{
          position: "absolute", top: 14, right: 14,
          background: "#f0f0f0", borderRadius: 20,
          padding: "2px 10px", fontSize: 10, color: "#999", fontWeight: 700,
          letterSpacing: 0.3,
        }}>
          COMING SOON
        </div>
      )}

      {/* Icon */}
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: mod.available ? mod.bg : "#f5f5f5",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 18, transition: "transform .2s",
        transform: hovered && mod.available ? "scale(1.08)" : "none",
      }}>
        <Icon size={28} style={{ color: mod.available ? mod.color : "#bbb" }} />
      </div>

      {/* Title */}
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1a1a1a", marginBottom: 3 }}>
        {mod.title}
      </div>
      <div style={{ fontSize: 11, color: "#bbb", marginBottom: 12, fontWeight: 500 }}>
        {mod.titleEn}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13, color: "#777", lineHeight: 1.65,
        marginBottom: 22, minHeight: 55,
      }}>
        {mod.desc}
      </div>

      {/* CTA */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 13, fontWeight: 700,
        color: mod.available ? mod.accent : "#ccc",
      }}>
        {mod.buttonLabel}
        {mod.available && (
          <ArrowRight
            size={15}
            style={{
              transform: hovered ? "translateX(3px)" : "none",
              transition: "transform .15s",
            }}
          />
        )}
      </div>
    </div>
  );
}
