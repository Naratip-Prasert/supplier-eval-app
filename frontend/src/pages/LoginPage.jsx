import { useState } from "react";
import { Logo, GreenInput, PasswordInput, GreenButton } from "../components";
import { API_BASE } from "../utils/api";

// Flat, few-color illustration — a clipboard being checked off with a
// star/badge result, echoing "supplier evaluation" without needing a
// real photo asset (none exist in this project yet).
function EvalIllustration() {
  return (
    <svg viewBox="0 0 360 320" width="100%" height="100%" style={{ maxWidth: 200 }}>
      <ellipse cx="180" cy="290" rx="120" ry="14" fill="rgba(0,0,0,0.12)" />

      {/* clipboard */}
      <rect x="90" y="40" width="160" height="220" rx="14" fill="#ffffff" />
      <rect x="90" y="40" width="160" height="220" rx="14" fill="none" stroke="#e8f5e9" strokeWidth="2" />
      <rect x="140" y="28" width="60" height="24" rx="8" fill="#e8f5e9" />
      <rect x="150" y="20" width="40" height="20" rx="8" fill="#a5d6a7" />

      {/* checklist rows */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(112, ${88 + i * 46})`}>
          <circle cx="10" cy="10" r="10" fill={i < 2 ? "#2e7d32" : "#c8e6c9"} />
          {i < 2 && (
            <path d="M5 10l3.2 3.2L15.5 6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
          <rect x="30" y="3" width="106" height="14" rx="7" fill="#eef5ee" />
        </g>
      ))}

      {/* badge / star result, overlapping bottom-right of the clipboard */}
      <circle cx="246" cy="232" r="38" fill="#1b5e20" />
      <path
        d="M246 210 l6.5 13.2 14.6 2.1 -10.6 10.3 2.5 14.5 -13 -6.8 -13 6.8 2.5-14.5 -10.6-10.3 14.6-2.1z"
        fill="#ffd54f"
      />

      {/* decorative dots */}
      <circle cx="64" cy="70" r="6" fill="#a5d6a7" opacity="0.8" />
      <circle cx="300" cy="90" r="9" fill="#a5d6a7" opacity="0.6" />
      <circle cx="62" cy="230" r="7" fill="#a5d6a7" opacity="0.6" />
    </svg>
  );
}

export default function LoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const handleSubmit = async (e) => {
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
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #14532d 0%, #1b5e20 55%, #2e7d32 100%)",
      fontFamily: "Sarabun, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 20px", position: "relative", overflow: "hidden",
    }}>
      {/* On short/landscape viewports (phone rotated sideways) the
          illustration+title would push the form below the fold — collapse
          it so the form is reachable without scrolling. */}
      <style>{`
        @media (max-height: 560px) and (orientation: landscape) {
          .login-hero { display: none; }
          .login-card { padding: 14px 24px !important; }
          .login-card-header { margin-bottom: 10px !important; }
          .login-card-logo { display: none; }
          .login-field { margin-bottom: 8px !important; }
        }
      `}</style>

      <div style={{
        position: "absolute", width: 260, height: 260, borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", top: -100, left: -80,
      }} />
      <div style={{
        position: "absolute", width: 200, height: 200, borderRadius: "50%",
        background: "rgba(255,255,255,0.05)", top: 60, right: -70,
      }} />

      <div className="login-hero" style={{ position: "relative", zIndex: 1, width: 140 }}>
        <EvalIllustration />
      </div>
      <div className="login-hero" style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          <Logo size={30} />
          <span style={{ color: "#fff", fontSize: 22, fontWeight: 800, letterSpacing: 1, fontFamily: "monospace" }}>SPES</span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
          Supplier Performance Evaluation System<br />
          ระบบประเมินผลการดำเนินงานของซัพพลายเออร์
        </div>
      </div>

      {/* ── Login form card ── */}
      <div className="login-card" style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 400,
        background: "#fff", borderRadius: 16,
        boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
        padding: "28px 28px 24px", textAlign: "center",
      }}>
        <div className="login-card-header" style={{ marginBottom: 22 }}>
          <div className="login-card-logo" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 48, borderRadius: 14, marginBottom: 10,
            background: "#1b5e20",
          }}>
            <Logo size={30} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1b5e20" }}>เข้าสู่ระบบ</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 4 }}>กรอกข้อมูลบัญชีของคุณเพื่อเข้าใช้งาน</div>
        </div>

        <form onSubmit={handleSubmit} style={{ textAlign: "left" }}>
          {error && (
            <div style={{
              background: "#ffebee", border: "1.5px solid #ef9a9a",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              color: "#c62828", fontSize: 13, textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <div className="login-field" style={{ marginBottom: 14 }}>
            <GreenInput
              label="รหัสพนักงาน หรือ Email"
              required
              value={identifier}
              onChange={setIdentifier}
              placeholder="เช่น EMP-001 หรือ email@example.com"
            />
          </div>

          <div className="login-field" style={{ marginBottom: 20 }}>
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
      </div>
    </div>
  );
}
