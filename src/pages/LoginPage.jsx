import { useState } from "react";
import { Header, GreenInput, PasswordInput, GreenButton } from "../components";
import { BarChart3 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function LoginPage({ onLogin, onRegister, onForgot }) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "เข้าสู่ระบบไม่สำเร็จ");
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f9f5", fontFamily: "Sarabun, sans-serif" }}>
      <Header titleOverride="Supplier Performance Evaluation" />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "calc(100vh - 56px)", padding: 20,
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ marginBottom: 10, color: "#1a6b1a" }}><BarChart3 size={48} strokeWidth={1.5} /></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a6b1a" }}>เข้าสู่ระบบ</div>
            <div style={{ fontSize: 13, color: "#777", marginTop: 4 }}>Supplier Evaluation System</div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden" }}>
            <div style={{ background: "#1a6b1a", height: 6 }} />
            <form onSubmit={handleSubmit} style={{ padding: "28px 32px 24px" }}>
              {error && (
                <div style={{
                  background: "#ffebee", border: "1.5px solid #ef9a9a",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 18,
                  color: "#c62828", fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <GreenInput
                  label="รหัสพนักงาน หรือ Email"
                  required
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="เช่น EMP-001 หรือ email@example.com"
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <PasswordInput
                  label="รหัสผ่าน"
                  required
                  value={password}
                  onChange={setPassword}
                  placeholder="รหัสผ่าน"
                />
              </div>
              <div style={{ textAlign: "right", marginBottom: 24 }}>
                <button
                  type="button"
                  onClick={onForgot}
                  style={{
                    background: "none", border: "none", color: "#1a6b1a",
                    fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0,
                  }}
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>

              <GreenButton fullWidth disabled={loading} onClick={handleSubmit}>
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </GreenButton>
            </form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#555" }}>
            ยังไม่มีบัญชี?{" "}
            <button
              onClick={onRegister}
              style={{
                background: "none", border: "none", color: "#1a6b1a",
                fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline",
              }}
            >
              สมัครสมาชิก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
