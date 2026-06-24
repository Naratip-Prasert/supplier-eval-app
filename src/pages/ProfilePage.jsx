// ============================================================
//  pages/ProfilePage.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Header } from "../components";
import { ShieldCheck, Camera, Loader2 } from "lucide-react";
import { authFetch } from "../utils/api";

const ROLE_LABEL = { gcp: "GCP", user: "USER", admin: "ADMIN", supervisor: "SUPERVISOR" };
const ROLE_COLOR = { gcp: "#1565c0", user: "#1a6b1a", admin: "#6a1b9a", supervisor: "#b56a00" };

export default function ProfilePage({ authUser, onBack, onProfileUpdate }) {
  const themeColor = ROLE_COLOR[authUser.role?.toLowerCase()] ?? "#1a6b1a";

  const [profilePic, setProfilePic] = useState(null);
  const [fullName,   setFullName]   = useState(authUser.fullName || "");
  const [email,      setEmail]      = useState(authUser.email    || "");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    authFetch("/api/employees/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.profilePicture) setProfilePic(d.profilePicture);
        if (d.fullName) setFullName(d.fullName);
        if (d.email)    setEmail(d.email);
      })
      .catch(() => {});
  }, []);

  // Name/email are managed by the organization's identity system, not
  // editable here — the only thing a user can change on their own profile
  // is their picture, so selecting a file saves immediately.
  const handleFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("รูปภาพต้องมีขนาดไม่เกิน 4 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setSaving(true);
      setError("");
      try {
        const res  = await authFetch("/api/employees/me", {
          method: "PATCH",
          body: JSON.stringify({ profilePicture: dataUrl }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.message || "บันทึกไม่สำเร็จ"); return; }
        setProfilePic(dataUrl);
        onProfileUpdate(data.token, data.user, dataUrl);
      } catch {
        setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const initials = fullName.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "Sarabun, sans-serif" }}>
      <Header titleOverride="โปรไฟล์ผู้ใช้" backLabel="← กลับหน้าหลัก" onBack={onBack} />

      <div style={{ maxWidth: 520, margin: "36px auto", padding: "0 20px" }}>
        <div style={{
          background: "#fff", borderRadius: 14,
          boxShadow: "0 2px 20px rgba(0,0,0,0.1)", overflow: "hidden",
        }}>

          {/* ── Banner ── */}
          <div style={{
            background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)`,
            padding: "28px 24px 22px",
            display: "flex", alignItems: "center", gap: 20,
          }}>
            {/* Avatar — the only editable field */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                onClick={() => !saving && fileRef.current?.click()}
                title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์"
                style={{
                  width: 80, height: 80, borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.8)",
                  overflow: "hidden",
                  background: profilePic ? "transparent" : "rgba(255,255,255,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 700, color: "#fff",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {profilePic
                  ? <img src={profilePic} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initials}
              </div>
              <div
                onClick={() => !saving && fileRef.current?.click()}
                style={{
                  position: "absolute", bottom: 1, right: 1,
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#fff", border: `2px solid ${themeColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: saving ? "default" : "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
              >
                {saving
                  ? <Loader2 size={13} style={{ color: themeColor, animation: "spin 1s linear infinite" }} />
                  : <Camera size={13} style={{ color: themeColor }} />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            </div>

            {/* Name & dept */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                {fullName || "ชื่อ-สกุล"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                {authUser.empId} · {authUser.department}
              </div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
                background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)",
                borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: "#fff",
              }}>
                <ShieldCheck size={11} />
                {ROLE_LABEL[authUser.role?.toLowerCase()] ?? authUser.role}
              </span>
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          {/* ── Error bar ── */}
          {error && (
            <div style={{
              background: "#fff5f5", borderBottom: "1px solid #ffd0d0",
              padding: "10px 24px", fontSize: 13, color: "#c62828",
            }}>
              {error}
            </div>
          )}

          {/* ── Read-only fields (managed by the organization's identity
              system — only the profile picture above can be changed here) ── */}
          <div style={{ padding: "4px 0 8px" }}>
            {[
              { label: "ชื่อ-สกุล", value: fullName },
              { label: "อีเมล", value: email },
              { label: "รหัสพนักงาน", value: authUser.empId },
              { label: "ฝ่าย/แผนก", value: authUser.department },
              authUser.jobTitle && { label: "ตำแหน่ง", value: authUser.jobTitle },
            ].filter(Boolean).map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "12px 24px", gap: 12,
                  borderBottom: "1px solid #f9f9f9",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#b0b0b0", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: value ? "#1a1a1a" : "#ccc" }}>
                    {value || "ยังไม่ได้กรอก"}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#ccc", whiteSpace: "nowrap" }}>แก้ไขไม่ได้</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
