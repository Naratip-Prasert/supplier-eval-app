// ============================================================
//  app/(app)/portal/page.tsx  —  Role-based portal hub after login
// ============================================================
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useModal, Clock as ClockWidget, Logo } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/api";
import {
  ClipboardList, Clock, BarChart2, Shield, CheckSquare,
  User, LogOut, ArrowRight, AlertTriangle, Star, type LucideIcon,
} from "lucide-react";

interface ModuleDef {
  key: string;
  icon: LucideIcon;
  title: string;
  titleEn: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
  roles: string[];
  available: boolean;
  buttonLabel: string;
}

// ── Module definitions ────────────────────────────────────────
const MODULES: ModuleDef[] = [
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
    roles: ["USER", "GCP"],
    available: true,
    buttonLabel: "ดูประวัติ",
  },
  {
    key: "serviceEval",
    icon: Star,
    title: "ประเมิน Buyer",
    titleEn: "Rate Your Buyer",
    desc: "หลังงานประเมินซัพพลายเออร์ของคุณได้รับการอนุมัติแล้ว ให้คะแนนการทำงานร่วมกับ Buyer ที่ดูแลรอบนั้น",
    color: "#e65100",
    bg: "linear-gradient(135deg, #fff3e0 0%, #fff8e1 100%)",
    border: "#ffcc80",
    accent: "#ef6c00",
    roles: ["USER"],
    available: true,
    buttonLabel: "ให้คะแนน",
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
    title: "ADMIN",
    titleEn: "Administration",
    desc: "จัดการพนักงาน ซัพพลายเออร์ งานประเมิน (อัพโหลด) และผล/ประวัติการประเมินทั้งหมด",
    color: "#bf360c",
    bg: "linear-gradient(135deg, #fbe9e7 0%, #fff8e1 100%)",
    border: "#ffab91",
    accent: "#d84315",
    roles: ["ADMIN"],
    available: true,
    buttonLabel: "เข้าสู่ระบบจัดการ",
  },
  {
    key: "supervisor",
    icon: CheckSquare,
    title: "อนุมัติผลการประเมิน",
    titleEn: "Approve Evaluations",
    desc: "ตรวจสอบและอนุมัติหรือส่งคืนผลการประเมิน Supplier หลังจากที่ GCP และ USER ส่งผลเรียบร้อยแล้ว",
    color: "#6a1b9a",
    bg: "linear-gradient(135deg, #f3e5f5 0%, #ede7f6 100%)",
    border: "#ce93d8",
    accent: "#7b1fa2",
    roles: ["SUPERVISOR", "ADMIN"],
    available: true,
    buttonLabel: "เข้าสู่หน้าอนุมัติ",
  },
];

const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  USER:       { label: "USER — ผู้ใช้งานทั่วไป",        bg: "#e8f5e9", color: "#1b5e20" },
  GCP:        { label: "GCP — เจ้าหน้าที่จัดซื้อ",      bg: "#e3f2fd", color: "#1565c0" },
  ADMIN:      { label: "Admin — Administrator",       bg: "#fce4ec", color: "#880e4f" },
  SUPERVISOR: { label: "Supervisor — ผู้อนุมัติ",       bg: "#f3e5f5", color: "#6a1b9a" },
};

// Sidebar background per role — same hue family as that role's badge above,
// so the sidebar itself hints at "which hat you're wearing" instead of a
// neutral dark panel for everyone.
const ROLE_SIDEBAR: Record<string, string> = {
  USER:       "linear-gradient(180deg, #1b5e20 0%, #133d16 100%)",
  GCP:        "linear-gradient(180deg, #0d47a1 0%, #0a2f6b 100%)",
  ADMIN:      "linear-gradient(180deg, #ad1457 0%, #6d0e37 100%)",
  SUPERVISOR: "linear-gradient(180deg, #6a1b9a 0%, #421263 100%)",
};

interface ReturnedTask {
  sessionStatus: string;
  supplierName: string;
}

// ── PortalPage ────────────────────────────────────────────────
export default function PortalPage() {
  const { user: authUser, profilePic, logout } = useAuth();
  const router = useRouter();
  const role    = authUser?.role ?? "USER";
  const badge   = ROLE_BADGE[role] ?? ROLE_BADGE.USER;
  const sidebarBg = ROLE_SIDEBAR[role] ?? ROLE_SIDEBAR.USER;

  const { showConfirm, ModalEl } = useModal();
  const handleLogoutClick = async () => {
    const ok = await showConfirm("ต้องการออกจากระบบใช่ไหม?", "ยืนยันการออกจากระบบ");
    if (ok) { await logout(); router.push("/login"); }
  };

  // Surface "returned by supervisor" right here on the Portal — previously
  // evaluators only found out by happening to open the evaluate module.
  const [returnedTasks, setReturnedTasks] = useState<ReturnedTask[]>([]);
  useEffect(() => {
    if (!["USER", "GCP", "ADMIN"].includes(role)) return;
    authFetch("/api/evaluations/my-tasks")
      .then(r => r.ok ? r.json() : [])
      .then(data => setReturnedTasks(Array.isArray(data) ? data.filter((t: ReturnedTask) => t.sessionStatus === "returned") : []))
      .catch(() => {});
  }, [role]);

  // Cross-eval #4 (database/CROSS_EVALUATION_SPEC.md) — how many completed
  // sessions this USER hasn't yet rated their Buyer for.
  const [pendingServiceEval, setPendingServiceEval] = useState<unknown[]>([]);
  useEffect(() => {
    if (role !== "USER") return;
    authFetch("/api/service-evaluations/pending")
      .then(r => r.ok ? r.json() : [])
      .then(data => setPendingServiceEval(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [role]);

  const modules = MODULES
    .filter((m) => m.roles.includes(role))
    .sort((a, b) => {
      if (role === "ADMIN" && a.key === "admin") return -1;
      if (role === "ADMIN" && b.key === "admin") return 1;
      if (role === "SUPERVISOR" && a.key === "supervisor") return -1;
      if (role === "SUPERVISOR" && b.key === "supervisor") return 1;
      return 0;
    });

  const goEvaluate = (tab: string) => router.push(`/landing?tab=${tab}`);

  const handleModule = (mod: ModuleDef) => {
    if (!mod.available) return;
    if (mod.key === "evaluate")    goEvaluate("active");
    if (mod.key === "history")     router.push("/history");
    if (mod.key === "admin")       router.push("/admin");
    if (mod.key === "supervisor")  router.push("/supervisor");
    if (mod.key === "serviceEval") router.push("/service-eval");
  };

  const initials = (authUser?.fullName || "?")
    .split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div className="portal-shell" style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif", display: "flex" }}>
      {ModalEl}

      {/* Below ~768px there's no room for a full-height side column next to
          content — stack it as a compact top bar instead, with the profile
          block laid out as a row (avatar left, name/badge right) rather
          than centered, so Thai names (no spaces to wrap on) stay on one
          line as long as possible. */}
      <style>{`
        @media (max-width: 768px) {
          .portal-shell { flex-direction: column; }
          .portal-sidebar { width: 100% !important; flex-direction: row !important; flex-wrap: wrap; align-items: center; padding: 16px 20px !important; }
          .portal-sidebar-brand { margin-bottom: 0 !important; margin-right: 14px; }
          .portal-sidebar-profile { flex-direction: row !important; text-align: left !important; flex: 1; min-width: 200px; margin-bottom: 0 !important; }
          .portal-sidebar-avatar { margin: 0 12px 0 0 !important; }
          .portal-sidebar-nav { flex-direction: row !important; width: 100%; margin-top: 14px; }
          .portal-sidebar-spacer { display: none; }
          .portal-sidebar-clock { display: none; }
        }
      `}</style>

      {/* ── Sidebar ── */}
      <aside className="portal-sidebar" style={{
        width: 260, flexShrink: 0,
        background: sidebarBg,
        color: "#fff", display: "flex", flexDirection: "column",
        padding: "24px 22px",
      }}>
        {/* Brand */}
        <div className="portal-sidebar-brand" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <Logo size={30} />
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, letterSpacing: 1.2 }}>SPES</span>
        </div>

        {/* Profile */}
        <div className="portal-sidebar-profile" style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="portal-sidebar-avatar" style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 14px",
            background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, overflow: "hidden", flexShrink: 0,
          }}>
            {profilePic
              ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#ffffff", marginBottom: 6 }}>
              ยินดีต้อนรับเข้าสู่ระบบ
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, lineHeight: 1.3 }}>
              {authUser?.fullName}
            </div>
            <span style={{
              display: "inline-block", background: badge.bg, color: badge.color,
              borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700,
            }}>
              {badge.label}
            </span>
            {authUser?.empId && (
              <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", marginTop: 8 }}>
                {authUser.empId}
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <div className="portal-sidebar-nav" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => router.push("/profile")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
              color: "#fff", fontSize: 13, fontFamily: "Sarabun, sans-serif", fontWeight: 600,
              width: "100%", textAlign: "left",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.11)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
          >
            <User size={14} /> โปรไฟล์
          </button>
          <button
            onClick={handleLogoutClick}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
              color: "#ff8a80", fontSize: 13, fontFamily: "Sarabun, sans-serif", fontWeight: 600,
              width: "100%", textAlign: "left",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(229,57,53,0.16)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
          >
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>

        <div className="portal-sidebar-spacer" style={{ flex: 1 }} />

        <div className="portal-sidebar-clock" style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <ClockWidget />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 24px 48px" }}>

        {/* ── Returned-by-supervisor alert ── */}
        {returnedTasks.length > 0 && (
          <div
            onClick={() => goEvaluate("returned")}
            style={{
              background: "#fff3e0", border: "1.5px solid #ffb74d", borderRadius: 14,
              padding: "14px 20px", marginBottom: 24, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: "50%", background: "#fb8c00",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <AlertTriangle size={19} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e65100" }}>
                มีงานถูกส่งคืนจาก Supervisor {returnedTasks.length} รายการ — ต้องประเมินใหม่
              </div>
              <div style={{ fontSize: 12, color: "#bf6c00", marginTop: 2 }}>
                {returnedTasks.map(t => t.supplierName).join(", ")}
              </div>
            </div>
            <ArrowRight size={18} style={{ color: "#e65100", flexShrink: 0 }} />
          </div>
        )}

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
                badgeCount={
                  mod.key === "evaluate" ? returnedTasks.length :
                  mod.key === "serviceEval" ? pendingServiceEval.length : 0
                }
              />
            );
          })}
        </div>

        {/* ── Footer note ── */}
        <div style={{
          marginTop: 40, textAlign: "center",
          fontSize: 12, color: "#aaa",
        }}>
          SPES · {new Date().getFullYear()}
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Circle bg per module ─────────────────────────────────────
const CIRCLE_BG: Record<string, string> = {
  evaluate:    "radial-gradient(circle at 38% 35%, #f1f8e9, #a5d6a7 130%)",
  serviceEval: "radial-gradient(circle at 38% 35%, #fff3e0, #ffcc80 130%)",
  history:    "radial-gradient(circle at 38% 35%, #e8f4fd, #90caf9 130%)",
  dashboard:  "radial-gradient(circle at 38% 35%, #f8f0ff, #ce93d8 130%)",
  admin:      "radial-gradient(circle at 38% 35%, #fff3e0, #ffab91 130%)",
  supervisor: "radial-gradient(circle at 38% 35%, #f3e8fd, #b39ddb 130%)",
};

// ── Compact 3D-flat illustrations (82 × 82) ──────────────────
const CARD_ART: Record<string, ReactNode> = {
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
  supervisor: (
    <svg width="82" height="82" viewBox="0 0 82 82" fill="none">
      <defs>
        <linearGradient id="sv_stamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b388ff"/><stop offset="100%" stopColor="#6a1b9a"/></linearGradient>
        <linearGradient id="sv_chk"   x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ea80fc"/><stop offset="100%" stopColor="#aa00ff"/></linearGradient>
      </defs>
      {/* document 3D side */}
      <rect x="12" y="20" width="6"  height="44" rx="2" fill="#4a148c"/>
      {/* document body */}
      <rect x="16" y="14" width="40" height="50" rx="6" fill="rgba(243,229,245,.55)" stroke="#9c27b0" strokeWidth="1.5"/>
      <rect x="23" y="25" width="26" height="4" rx="1.5" fill="#9c27b0" opacity=".55"/>
      <rect x="23" y="34" width="20" height="4" rx="1.5" fill="#9c27b0" opacity=".4"/>
      <rect x="23" y="43" width="24" height="4" rx="1.5" fill="#9c27b0" opacity=".4"/>
      {/* approval stamp circle, tilted */}
      <g transform="rotate(-14 56 50)">
        <circle cx="56" cy="50" r="20" fill="url(#sv_stamp)" stroke="white" strokeWidth="2.5"/>
        <circle cx="56" cy="50" r="14" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeDasharray="3 3"/>
        <path d="M48 50l5.5 6 13-14" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      {/* signature flourish */}
      <path d="M14 70 C20 66 24 72 30 68 C36 64 40 70 46 67" stroke="#7b1fa2" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".75"/>
      {/* sparkle */}
      <path d="M66 16l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#ffd740" opacity=".8"/>
    </svg>
  ),
};

// ── ModuleCard ────────────────────────────────────────────────
function ModuleCard({ mod, Icon, onClick, badgeCount = 0 }: { mod: ModuleDef; Icon: LucideIcon; onClick: () => void; badgeCount?: number }) {
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

      {/* Returned-task notification badge */}
      {badgeCount > 0 && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          background: "#e53935", color: "#fff", borderRadius: 20,
          minWidth: 22, height: 22, padding: "0 6px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, boxShadow: "0 2px 6px rgba(229,57,53,0.5)",
        }}>
          {badgeCount}
        </div>
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
