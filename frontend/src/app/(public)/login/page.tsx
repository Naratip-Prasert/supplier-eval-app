// ============================================================
//  app/login/page.tsx
//  Split-screen layout: compact white form panel (fixed width) +
//  a green branding panel carrying the SPES wordmark, headline,
//  and BJC/Big C lockup — replaces the earlier single-column
//  hero-over-card layout.
// ============================================================
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Logo, GreenInput, PasswordInput, GreenButton } from "@/components";
import { API_BASE } from "@/utils/api";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!identifier.trim() || !password) { setError("กรุณากรอกข้อมูลให้ครบ"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        // Required by the backend's global CSRF guard (see utils/api.js#authFetch,
        // which this raw fetch mirrors since no session cookie exists yet).
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "เข้าสู่ระบบไม่สำเร็จ");
      // (app)/layout.tsx's AuthProvider re-fetches /api/auth/me on mount and
      // will pick up the session cookie the login response just set.
      router.push("/portal");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "Sarabun, sans-serif",
      display: "flex", overflow: "hidden",
    }}>
      <style>{`
        /* Below ~860px there's no room for both panels — the branding
           panel is decorative, so it's the one that goes, and the form
           panel expands to fill the screen instead of staying pinned to
           a 420px sliver. */
        @media (max-width: 860px) {
          .login-brand-panel { display: none; }
          .login-form-panel { width: 100% !important; max-width: 440px; margin: 0 auto; }
        }

        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-form-panel > * { animation: loginFadeUp .6s ease-out both; }
        .login-brand-block { animation: loginFadeUp .6s ease-out .15s both; }

        @keyframes loginLogoPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,213,79,0.35); }
          70%      { box-shadow: 0 0 0 16px rgba(255,213,79,0); }
        }
        .login-logo-ring { animation: loginLogoPulse 2.6s ease-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .login-bg-video { display: none; }
          .login-form-panel > *, .login-brand-block, .login-logo-ring { animation: none; }
        }
      `}</style>

      {/* ── Left: form panel ── */}
      <div className="login-form-panel" style={{
        width: 440, flexShrink: 0, background: "#fff",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "40px 44px", position: "relative", overflow: "hidden",
      }}>
        {/* Faint decorative blob, top-left — echoes the brand green without
            competing with the form itself. */}
        <div style={{
          position: "absolute", top: -80, left: -80, width: 240, height: 240,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(46,125,50,0.08), transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ textAlign: "center", marginBottom: 28, position: "relative" }}>
          <div className="login-logo-ring" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 60, height: 60, borderRadius: 18, marginBottom: 14,
            background: "#2e7d32",
          }}>
            <Logo size={32} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1b5e20" }}>เข้าสู่ระบบ</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 5 }}>กรอกข้อมูลบัญชีของคุณเพื่อเข้าใช้งาน</div>
        </div>

        <form onSubmit={handleSubmit} style={{ textAlign: "left", position: "relative" }}>
          {error && (
            <div style={{
              background: "#ffebee", border: "1.5px solid #ef9a9a",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              color: "#c62828", fontSize: 13, textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <GreenInput
              label="รหัสพนักงาน หรือ Email"
              required
              value={identifier}
              onChange={setIdentifier}
              placeholder="เช่น EMP-001 หรือ email@example.com"
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <PasswordInput
              label="รหัสผ่าน"
              required
              value={password}
              onChange={setPassword}
              placeholder="รหัสผ่าน"
            />
          </div>

          <GreenButton fullWidth disabled={loading} onClick={handleSubmit}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </GreenButton>
        </form>

        <div style={{
          marginTop: 28, paddingTop: 16, borderTop: "1px solid #f0f2f0",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#aaa", letterSpacing: 0.5 }}>SPES 2026</span>
        </div>
      </div>

      {/* ── Right: branding panel ── */}
      <div className="login-brand-panel" style={{
        flex: 1, position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #14532d 0%, #1b5e20 55%, #2e7d32 100%)",
      }}>
        <video
          className="login-bg-video"
          autoPlay muted loop playsInline
          poster="/login-bg-poster.jpg"
          style={{
            position: "absolute", top: "50%", left: "50%",
            minWidth: "100%", minHeight: "100%", width: "auto", height: "auto",
            transform: "translate(-50%, -50%)", objectFit: "cover", zIndex: 0,
          }}
        >
          <source src="/login-bg.mp4" type="video/mp4" />
        </video>
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          background: "linear-gradient(135deg, rgba(20,83,45,0.72) 0%, rgba(27,94,32,0.66) 55%, rgba(46,125,50,0.58) 100%)",
        }} />

        <div className="login-brand-block" style={{
          position: "relative", zIndex: 1, height: "100%",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "44px 64px", textAlign: "right",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginBottom: 14 }}>
              <Logo size={38} />
              <span style={{
                fontSize: 64, fontWeight: 800, letterSpacing: 1.5, fontFamily: "monospace",
                backgroundImage: "linear-gradient(100deg, #fff 20%, #ffd54f 40%, #fff 60%)",
                WebkitBackgroundClip: "text", backgroundClip: "text",
                color: "transparent", WebkitTextFillColor: "transparent",
              }}>
                SPES
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1.35, textShadow: "0 1px 10px rgba(0,0,0,0.25)" }}>
              Supplier Performance<br />Evaluation System
            </div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.85)", marginTop: 14 }}>
              ระบบประเมินผลการดำเนินงานของซัพพลายเออร์
            </div>
            <div style={{ width: 120, height: 5, background: "#ffd54f", borderRadius: 2, marginTop: 22, marginLeft: "auto" }} />
          </div>

          <img
            src="/bjgbgc-CRGzxnoC.png"
            alt="BJC · Big C"
            style={{ width: 180, height: "auto", alignSelf: "flex-end", filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.25))" }}
          />
        </div>
      </div>
    </div>
  );
}
