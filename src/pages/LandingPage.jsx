// ============================================================
//  pages/LandingPage.js
//  หน้าแรก — เลือกประเภทผู้ประเมิน (User / GCP)
//  แสดง preview ฟอร์ม User แบบ static
// ============================================================

import { Header, CustomSelect, GreenInput } from "../components";
import { DEPT_OPTIONS, JOB_OPTIONS } from "../constants";

export default function LandingPage({ onSelect }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>เลือกประเภทผู้ประเมิน</h1>

        {/* Tab buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
          <button
            onClick={() => onSelect("user")}
            style={{
              background: "#2e7d32", color: "#fff", border: "none",
              borderRadius: 6, padding: "14px 48px", fontSize: 16, fontWeight: 700,
              cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
            }}
          >
            User
          </button>
          <button
            onClick={() => onSelect("gcp")}
            style={{
              background: "#1565c0", color: "#fff", border: "none",
              borderRadius: 6, padding: "14px 48px", fontSize: 16, fontWeight: 700,
              cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
            }}
          >
            GCP
          </button>
        </div>

        {/* Preview card */}
        <div style={{ border: "3px solid #1a6b1a", borderRadius: 8, textAlign: "left" }}>
          <div style={{ background: "#1a6b1a", height: 8, borderRadius: "5px 5px 0 0" }} />
          <div style={{ padding: "20px 24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              สำหรับ{" "}
              <span style={{ color: "#2e7d32" }}>User(ผู้ใช้งานทั่วไป)</span>
            </div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 20, fontFamily: "monospace" }}>
              ประเมิน Supplier หรือประเมิน Buyer กรอกข้อมูลและเลือกแบบประเมินด้านล่าง
            </div>

            {/* รหัสพนักงาน */}
            <div style={{ marginBottom: 16 }}>
              <GreenInput label="รหัสพนักงาน" required placeholder="เช่น 123456" disabled />
            </div>

            {/* แผนก + ชื่องาน */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <CustomSelect label="แผนก" required options={DEPT_OPTIONS} value="" onChange={() => {}} disabled />
              <CustomSelect label="ชื่องาน" required options={JOB_OPTIONS} value="" onChange={() => {}} disabled />
            </div>

            {/* ประเภทประเมิน */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                ประเภทประเมิน<span style={{ color: "#e53935" }}>*</span>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {["pre-Evaluation", "post-Evaluation"].map((v) => (
                  <label
                    key={v}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      border: "1.5px solid #bbb", borderRadius: 6,
                      padding: "8px 18px", cursor: "not-allowed",
                      fontSize: 13, fontFamily: "monospace",
                    }}
                  >
                    <input type="radio" name="evaltype_preview" disabled /> {v}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => onSelect("user")}
          style={{
            marginTop: 28, background: "#2e7d32", color: "#fff", border: "none",
            borderRadius: 8, padding: "14px 36px", fontSize: 15, fontWeight: 700,
            cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
          }}
        >
          เริ่มประเมิน Supplier
        </button>
      </div>
    </div>
  );
}