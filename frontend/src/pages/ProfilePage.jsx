// ============================================================
//  pages/ProfilePage.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Header } from "../components";
import { ShieldCheck, Camera, Loader2 } from "lucide-react";
import { authFetch } from "../utils/api";
import { roleThemeColor } from "../styles/theme";

const ROLE_LABEL = { gcp: "GCP", user: "USER", admin: "ADMIN", supervisor: "SUPERVISOR" };

export default function ProfilePage({ authUser, onBack, onProfileUpdate }) {
  const themeColor = roleThemeColor(authUser.role);

  const [profilePic, setProfilePic] = useState(null);
  const [fullName,   setFullName]   = useState(authUser.fullName || "");
  const [email,      setEmail]      = useState(authUser.email    || "");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    // กัน setState หลัง component unmount ไปแล้ว (เช่นกดกลับหน้าหลักระหว่าง
    // fetch ยังไม่เสร็จ)
    let cancelled = false;
    authFetch("/api/employees/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.profilePicture) setProfilePic(d.profilePicture);
        if (d.fullName) setFullName(d.fullName);
        if (d.email)    setEmail(d.email);
      })
      .catch(() => {});
    return () => { cancelled = true; };
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
        onProfileUpdate(data.user, dataUrl);
      } catch {
        setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const initials = fullName.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

  const fields = [
    { label: "อีเมล", value: email },
    { label: "รหัสพนักงาน", value: authUser.empId },
    { label: "ฝ่าย/แผนก", value: authUser.department },
    authUser.jobTitle && { label: "ตำแหน่ง", value: authUser.jobTitle },
  ].filter(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header titleOverride="โปรไฟล์ผู้ใช้" backLabel="← กลับหน้าหลัก" onBack={onBack} />

      <div style={{ maxWidth: 420, margin: "48px auto", padding: "0 20px" }}>
        <div style={{
          background: "#fff", borderRadius: 20,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>

          {/* ── Banner — pro-card style: avatar centered, straddling the
              banner/card boundary ── */}
          <div style={{
            position: "relative", overflow: "hidden",
            background: `linear-gradient(135deg, ${themeColor}, ${themeColor}99)`,
            height: 108,
          }}>
            <div aria-hidden style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1.4px, transparent 1.4px)",
              backgroundSize: "16px 16px",
            }} />
            <div aria-hidden style={{
              position: "absolute", top: -40, right: -30, width: 160, height: 160,
              borderRadius: "50%", background: "rgba(255,255,255,0.12)", pointerEvents: "none",
            }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px 26px" }}>
            {/* Avatar — the only editable field */}
            <div style={{ position: "relative", marginTop: -54, flexShrink: 0 }}>
              <div
                onClick={() => !saving && fileRef.current?.click()}
                title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์"
                style={{
                  width: 108, height: 108, borderRadius: "50%",
                  border: "4px solid #fff",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                  background: profilePic ? "#fff" : themeColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 34, fontWeight: 700, color: "#fff",
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
                  position: "absolute", bottom: 2, right: 2,
                  width: 30, height: 30, borderRadius: "50%",
                  background: "#fff", border: `2px solid ${themeColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: saving ? "default" : "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
              >
                {saving
                  ? <Loader2 size={14} style={{ color: themeColor, animation: "spin 1s linear infinite" }} />
                  : <Camera size={14} style={{ color: themeColor }} />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            </div>

            {/* Name, role badge, dept — all centered */}
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", marginTop: 14, textAlign: "center" }}>
              {fullName || "ชื่อ-สกุล"}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
              background: `${themeColor}17`, border: `1px solid ${themeColor}55`,
              borderRadius: 20, padding: "3px 12px", fontSize: 11.5, fontWeight: 700, color: themeColor,
            }}>
              <ShieldCheck size={12} />
              {ROLE_LABEL[authUser.role?.toLowerCase()] ?? authUser.role}
            </span>
            <div style={{ fontSize: 13, color: "#8a8a8a", marginTop: 8, textAlign: "center" }}>
              {authUser.department}{authUser.jobTitle ? ` · ${authUser.jobTitle}` : ""}
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          {/* ── Error bar ── */}
          {error && (
            <div style={{
              background: "#fff5f5", borderTop: "1px solid #ffd0d0", borderBottom: "1px solid #ffd0d0",
              padding: "10px 24px", fontSize: 13, color: "#c62828", textAlign: "center",
            }}>
              {error}
            </div>
          )}

          {/* ── Read-only fields (managed by the organization's identity
              system — only the profile picture above can be changed here) ── */}
          <div style={{
            margin: "0 20px 22px", padding: "16px 18px",
            background: "#fafafa", borderRadius: 14,
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 14px",
          }}>
            {fields.map(({ label, value }) => (
              <div key={label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "#a8a8a8", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                <div style={{
                  fontSize: 13.5, fontWeight: 600, color: value ? "#2a2a2a" : "#ccc",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={value || ""}>
                  {value || "ยังไม่ได้กรอก"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
