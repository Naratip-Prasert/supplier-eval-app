import { useState } from "react";
import { Header, GreenInput, GreenButton } from "../components";
import { KeyRound, Mail } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ForgotPasswordPage({ onBack }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email.trim()) { setError("กรุณากรอก Email"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "เกิดข้อผิดพลาด");
      setSent(true);
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
            <div style={{ marginBottom: 10, color: "#1a6b1a" }}><KeyRound size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a6b1a" }}>ลืมรหัสผ่าน</div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden" }}>
            <div style={{ background: "#1a6b1a", height: 6 }} />
            <div style={{ padding: "28px 32px 24px" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ marginBottom: 16, color: "#1a6b1a" }}><Mail size={48} strokeWidth={1.5} /></div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1a6b1a", marginBottom: 10 }}>ตรวจสอบ Email ของคุณ</div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.8 }}>
                    ถ้า Email นี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้<br />
                    ลิงก์จะหมดอายุใน <strong>1 ชั่วโมง</strong>
                  </div>
                  <div style={{ marginTop: 28 }}>
                    <GreenButton fullWidth onClick={onBack}>กลับหน้าเข้าสู่ระบบ</GreenButton>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div style={{
                      background: "#ffebee", border: "1.5px solid #ef9a9a",
                      borderRadius: 8, padding: "10px 14px", marginBottom: 18,
                      color: "#c62828", fontSize: 13,
                    }}>
                      {error}
                    </div>
                  )}
                  <div style={{ fontSize: 14, color: "#555", marginBottom: 20, lineHeight: 1.75 }}>
                    กรอก Email ที่ลงทะเบียนไว้ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <GreenInput
                      label="Email"
                      required
                      value={email}
                      onChange={setEmail}
                      placeholder="email@example.com"
                    />
                  </div>
                  <GreenButton fullWidth disabled={loading} onClick={handleSubmit}>
                    {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
                  </GreenButton>
                </form>
              )}
            </div>
          </div>

          {!sent && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button
                onClick={onBack}
                style={{
                  background: "none", border: "none", color: "#1a6b1a",
                  fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline",
                }}
              >
                ← กลับหน้าเข้าสู่ระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
