import { useState } from "react";
import { Header, PasswordInput, GreenButton } from "../components";
import { Lock, CheckCircle2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    if (!password || !confirm) { setError("กรุณากรอกรหัสผ่านให้ครบ"); return; }
    if (password.length < 8) { setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
    if (password !== confirm) { setError("รหัสผ่านไม่ตรงกัน"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "เกิดข้อผิดพลาด");
      setSuccess(true);
      setTimeout(onDone, 2500);
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
            <div style={{ marginBottom: 10, color: "#1a6b1a" }}><Lock size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a6b1a" }}>ตั้งรหัสผ่านใหม่</div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden" }}>
            <div style={{ background: "#1a6b1a", height: 6 }} />
            <div style={{ padding: "28px 32px 24px" }}>
              {success ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ marginBottom: 16, color: "#2e7d32" }}><CheckCircle2 size={52} strokeWidth={1.5} /></div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1a6b1a", marginBottom: 8 }}>ตั้งรหัสผ่านใหม่สำเร็จ!</div>
                  <div style={{ fontSize: 13, color: "#666" }}>กำลังพาคุณไปหน้าเข้าสู่ระบบ...</div>
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
                  <div style={{ marginBottom: 14 }}>
                    <PasswordInput
                      label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"
                      required
                      value={password}
                      onChange={setPassword}
                      placeholder="รหัสผ่านใหม่"
                    />
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <PasswordInput
                      label="ยืนยันรหัสผ่านใหม่"
                      required
                      value={confirm}
                      onChange={setConfirm}
                      placeholder="ยืนยันรหัสผ่าน"
                      error={confirm && password !== confirm ? "รหัสผ่านไม่ตรงกัน" : ""}
                    />
                  </div>
                  <GreenButton fullWidth disabled={loading} onClick={handleSubmit}>
                    {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
                  </GreenButton>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
