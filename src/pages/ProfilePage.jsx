// ============================================================
//  pages/ProfilePage.jsx
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Header } from "../components";
import { ShieldCheck, Edit3, Check, X, Camera } from "lucide-react";
import { authFetch } from "../utils/api";

const ROLE_LABEL = { gcp: "GCP", user: "USER", admin: "ADMIN", supervisor: "SUPERVISOR" };
const ROLE_COLOR = { gcp: "#1565c0", user: "#1a6b1a", admin: "#6a1b9a", supervisor: "#b56a00" };

export default function ProfilePage({ authUser, onBack, onProfileUpdate }) {
  const themeColor = ROLE_COLOR[authUser.role?.toLowerCase()] ?? "#1a6b1a";

  const [profilePic, setProfilePic]   = useState(null);
  const [editMode,   setEditMode]     = useState(false);
  const [fullName,   setFullName]     = useState(authUser.fullName || "");
  const [email,      setEmail]        = useState(authUser.email    || "");
  const [newPic,     setNewPic]       = useState(null);
  const [saving,     setSaving]       = useState(false);
  const [error,      setError]        = useState("");
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

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("รูปภาพต้องมีขนาดไม่เกิน 4 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setNewPic(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!fullName.trim()) { setError("กรุณากรอกชื่อ-สกุล"); return; }
    setSaving(true);
    setError("");
    try {
      const res  = await authFetch("/api/employees/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim(),
          email:    email.trim() || null,
          profilePicture: newPic ?? profilePic,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "บันทึกไม่สำเร็จ"); return; }
      const updatedPic = newPic ?? profilePic;
      if (newPic) setProfilePic(newPic);
      setNewPic(null);
      setEditMode(false);
      onProfileUpdate(data.token, data.user, updatedPic);
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setNewPic(null);
    setError("");
    setFullName(authUser.fullName || "");
    setEmail(authUser.email || "");
  };

  const displayPic = editMode ? (newPic ?? profilePic) : profilePic;
  const initials   = fullName.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

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
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                onClick={() => editMode && fileRef.current?.click()}
                style={{
                  width: 80, height: 80, borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.8)",
                  overflow: "hidden",
                  background: displayPic ? "transparent" : "rgba(255,255,255,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 700, color: "#fff",
                  cursor: editMode ? "pointer" : "default",
                  transition: "opacity 0.15s",
                }}
              >
                {displayPic
                  ? <img src={displayPic} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initials}
              </div>
              {editMode && (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    position: "absolute", bottom: 1, right: 1,
                    width: 26, height: 26, borderRadius: "50%",
                    background: "#fff", border: `2px solid ${themeColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  <Camera size={13} style={{ color: themeColor }} />
                </div>
              )}
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

            {/* Edit / Save / Cancel buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, alignSelf: "flex-start" }}>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  style={btnStyle("rgba(255,255,255,0.2)", "rgba(255,255,255,0.5)", "#fff")}
                >
                  <Edit3 size={13} /> แก้ไข
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={btnStyle(
                      saving ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.28)",
                      "rgba(255,255,255,0.5)", "#fff",
                      saving
                    )}
                  >
                    <Check size={13} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                  <button
                    onClick={handleCancel}
                    style={btnStyle("rgba(255,255,255,0.08)", "rgba(255,255,255,0.3)", "rgba(255,255,255,0.8)")}
                  >
                    <X size={13} /> ยกเลิก
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Error bar ── */}
          {error && (
            <div style={{
              background: "#fff5f5", borderBottom: "1px solid #ffd0d0",
              padding: "10px 24px", fontSize: 13, color: "#c62828",
            }}>
              {error}
            </div>
          )}

          {/* ── Editable fields ── */}
          <div style={{ padding: "4px 0 8px" }}>
            <Field
              label="ชื่อ-สกุล"
              value={fullName}
              editMode={editMode}
              onChange={setFullName}
              placeholder="กรอกชื่อ-สกุล"
              themeColor={themeColor}
            />
            <Field
              label="อีเมล"
              value={email}
              editMode={editMode}
              onChange={setEmail}
              placeholder="กรอก Email"
              type="email"
              themeColor={themeColor}
            />
          </div>

          {/* ── Read-only fields ── */}
          <div style={{ borderTop: "1px solid #f0f0f0", padding: "4px 0 8px" }}>
            {[
              { label: "รหัสพนักงาน", value: authUser.empId },
              { label: "ฝ่าย/แผนก",   value: authUser.department },
              authUser.jobTitle && { label: "ตำแหน่ง", value: authUser.jobTitle },
            ].filter(Boolean).map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "12px 24px", gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#b0b0b0", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, color: "#555" }}>{value}</div>
                </div>
                <div style={{ fontSize: 10, color: "#ccc" }}>แก้ไขไม่ได้</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, editMode, onChange, placeholder, type = "text", themeColor }) {
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #f9f9f9" }}>
      <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 5 }}>{label}</div>
      {editMode ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%", boxSizing: "border-box",
            border: `1.5px solid ${themeColor}`,
            borderRadius: 8, padding: "8px 12px",
            fontSize: 14, fontFamily: "Sarabun, sans-serif",
            outline: "none", background: "#fafff8",
          }}
        />
      ) : (
        <div style={{ fontSize: 14, fontWeight: 600, color: value ? "#1a1a1a" : "#ccc" }}>
          {value || "ยังไม่ได้กรอก"}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, border, color, disabled = false) {
  return {
    display: "flex", alignItems: "center", gap: 6,
    background: bg, border: `1px solid ${border}`,
    borderRadius: 8, padding: "6px 12px",
    color, fontSize: 12, fontFamily: "Sarabun, sans-serif",
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
}
