import { useState } from "react";
import { Header, GreenInput, PasswordInput, GreenButton } from "../components";
import { UserPlus, CheckCircle2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function RegisterPage({ onBack, onDone }) {
  const [employeeId, setEmployeeId] = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    if (!employeeId.trim() || !email.trim() || !password || !confirm) {
      setError("กรุณากรอกข้อมูลให้ครบ"); return;
    }
    if (password.length < 8) { setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
    if (password !== confirm) { setError("รหัสผ่านไม่ตรงกัน"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employeeId.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "สมัครสมาชิกไม่สำเร็จ");
      setSuccess(true);
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
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ marginBottom: 10, color: "#1a6b1a" }}><UserPlus size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a6b1a" }}>สมัครสมาชิก</div>
            <div style={{ fontSize: 13, color: "#777", marginTop: 4 }}>สร้างบัญชีเพื่อเข้าใช้งานระบบ</div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden" }}>
            <div style={{ background: "#1a6b1a", height: 6 }} />
            <div style={{ padding: "28px 32px 24px" }}>
              {success ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ marginBottom: 16, color: "#2e7d32" }}><CheckCircle2 size={52} strokeWidth={1.5} /></div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1a6b1a", marginBottom: 8 }}>สมัครสมาชิกสำเร็จ!</div>
                  <div style={{ fontSize: 14, color: "#555", marginBottom: 28, lineHeight: 1.7 }}>
                    คุณสามารถเข้าสู่ระบบด้วยบัญชีที่สร้างแล้วได้เลย
                  </div>
                  <GreenButton fullWidth onClick={onDone}>ไปหน้าเข้าสู่ระบบ</GreenButton>
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
                    <GreenInput
                      label="รหัสพนักงาน"
                      required
                      value={employeeId}
                      onChange={setEmployeeId}
                      placeholder="เช่น EMP-001"
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <GreenInput
                      label="Email"
                      required
                      value={email}
                      onChange={setEmail}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <PasswordInput
                      label="รหัสผ่าน (อย่างน้อย 8 ตัว)"
                      required
                      value={password}
                      onChange={setPassword}
                      placeholder="รหัสผ่าน"
                      error={password && password.length < 8 ? "อย่างน้อย 8 ตัวอักษร" : ""}
                    />
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <PasswordInput
                      label="ยืนยันรหัสผ่าน"
                      required
                      value={confirm}
                      onChange={setConfirm}
                      placeholder="ยืนยันรหัสผ่าน"
                      error={confirm && password !== confirm ? "รหัสผ่านไม่ตรงกัน" : ""}
                    />
                  </div>

                  <GreenButton fullWidth disabled={loading} onClick={handleSubmit}>
                    {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
                  </GreenButton>
                </form>
              )}
            </div>
          </div>

          {!success && (
            <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#555" }}>
              มีบัญชีแล้ว?{" "}
              <button
                onClick={onBack}
                style={{
                  background: "none", border: "none", color: "#1a6b1a",
                  fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline",
                }}
              >
                เข้าสู่ระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
