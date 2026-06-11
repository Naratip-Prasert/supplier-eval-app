// ============================================================
//  pages/UserForm.js
//  หน้ากรอกข้อมูล — สลับ Tab User / GCP
//  เมื่อเลือก evalType จะโชว์ฟิลด์ Supplier เพิ่ม
// ============================================================

import { useState } from "react";
import { Header, CustomSelect, GreenInput, GreenButton } from "../components";
import {
  DEPT_OPTIONS,
  JOB_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  EVAL_PERIOD_OPTIONS,
} from "../constants";

export default function UserForm({ role, onBack, onSubmit }) {
  const [activeTab, setActiveTab] = useState(role === "gcp" ? "gcp" : "user");
  const [empId,        setEmpId]        = useState("");
  const [dept,         setDept]         = useState("");
  const [job,          setJob]          = useState("");
  const [evalType,     setEvalType]     = useState(""); // "pre-Evaluation" | "post-Evaluation"
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");

  const isGCP = activeTab === "gcp";
  const accentColor = isGCP ? "#1565c0" : "#1a6b1a";

  const handleSubmit = () => {
    onSubmit({ empId, dept, job, evalType, vendorCode, supplierName, productType, period, role: activeTab });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>เลือกประเภทผู้ประเมิน</h1>

        {/* Tab buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 24 }}>
          {["user", "gcp"].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                background: t === "user" ? "#2e7d32" : "#1565c0",
                color: "#fff", border: "none", borderRadius: 6,
                padding: "12px 44px", fontSize: 15, fontWeight: 700,
                cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
                opacity: activeTab === t ? 1 : 0.55,
                transition: "opacity 0.15s",
              }}
            >
              {t === "user" ? "User" : "GCP"}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div style={{ border: `3px solid ${accentColor}`, borderRadius: 8, textAlign: "left" }}>
          <div style={{ background: accentColor, height: 8, borderRadius: "5px 5px 0 0" }} />
          <div style={{ padding: "20px 24px" }}>

            {/* Title */}
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              สำหรับ{" "}
              <span style={{ color: accentColor }}>
                {isGCP ? "GCP(เจ้าหน้าที่จัดซื้อ)" : "User(ผู้ใช้งานทั่วไป)"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16, fontFamily: "monospace" }}>
              {isGCP
                ? "ประเมิน Supplier โดยเจ้าหน้าที่ GCP — สามารถกรอกข้อมูลและมองเห็นแบบประเมินทั้งหมด"
                : "ประเมิน Supplier หรือประเมิน Buyer กรอกข้อมูลและเลือกแบบประเมินด้านล่าง"}
            </div>

            {/* GCP notice */}
            {isGCP && (
              <div style={{
                background: "#e3f2fd", border: "1.5px solid #90caf9",
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", color: "#1565c0",
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>ℹ</span>
                <span>
                  เจ้าหน้าที่ GCP จะเห็นแบบประเมินทั้งหมด แต่สามารถกรอกได้เฉพาะส่วนของฝ่ายจัดซื้อเท่านั้น
                  ส่วนอื่นจะแสดงเป็น Read-only
                </span>
              </div>
            )}

            {/* รหัสพนักงาน */}
            <div style={{ marginBottom: 14 }}>
              <GreenInput
                label={`รหัสพนักงาน${isGCP ? " GCP" : ""}`}
                required
                value={empId}
                onChange={setEmpId}
                placeholder="เช่น 123456"
              />
            </div>

            {/* แผนก + ชื่องาน */}
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <CustomSelect label="แผนก" required options={DEPT_OPTIONS} value={dept} onChange={setDept} />
              <CustomSelect label="ชื่องาน" required options={JOB_OPTIONS} value={job} onChange={setJob} />
            </div>

            {/* ประเภทประเมิน */}
            <div style={{ marginBottom: evalType ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                ประเภทประเมิน<span style={{ color: "#e53935" }}>*</span>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {["pre-Evaluation", "post-Evaluation"].map((v) => (
                  <label
                    key={v}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      border: `1.5px solid ${evalType === v ? accentColor : "#bbb"}`,
                      borderRadius: 6, padding: "8px 18px", cursor: "pointer",
                      fontSize: 13, fontFamily: "monospace",
                      background: evalType === v ? (isGCP ? "#e3f2fd" : "#f1f8e9") : "#fff",
                    }}
                  >
                    <input
                      type="radio"
                      name="evaltype"
                      value={v}
                      checked={evalType === v}
                      onChange={() => setEvalType(v)}
                      style={{ accentColor }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>

            {/* Supplier fields — โชว์เมื่อเลือก evalType แล้ว */}
            {evalType && (
              <div style={{
                border: "1.5px solid #ccc", borderRadius: 8,
                padding: 16, background: "#fafafa", marginTop: 14,
              }}>
                <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                  <GreenInput
                    label="รหัสผู้ขาย/vender code"
                    required
                    value={vendorCode}
                    onChange={setVendorCode}
                    placeholder="เช่น SUP-001"
                  />
                  <GreenInput
                    label="ชื่อผู้ขาย/Supplier"
                    value={supplierName}
                    onChange={setSupplierName}
                    placeholder="เช่น ABC Supply Co.,Ltd."
                  />
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <CustomSelect
                    label="ประเภทสินค้า"
                    required
                    options={PRODUCT_TYPE_OPTIONS}
                    value={productType}
                    onChange={setProductType}
                  />
                  <CustomSelect
                    label="รอบการประเมิน"
                    required
                    options={EVAL_PERIOD_OPTIONS}
                    value={period}
                    onChange={setPeriod}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <GreenButton
          onClick={handleSubmit}
          color={isGCP ? "#1565c0" : "#2e7d32"}
          style={{ marginTop: 28 }}
        >
          {isGCP ? "GCP เริ่มประเมิน Supplier" : "เริ่มประเมิน Supplier"}
        </GreenButton>
      </div>
    </div>
  );
}