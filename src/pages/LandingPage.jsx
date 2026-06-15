// ============================================================
//  pages/LandingPage.jsx
//  หน้าแรก — เลือก User / GCP แล้ว form จะปลดล็อก
// ============================================================

import { useState } from "react";
import { Header, CustomSelect, GreenInput, GreenButton, useModal } from "../components";
import {
  DEPT_JOB_MAP,
  PRODUCT_TYPE_OPTIONS,
  PRE_EVAL_OPTIONS,
  EVAL_PERIOD_OPTIONS,
} from "../constants";

export default function LandingPage({ onSubmit }) {
  const { showAlert, ModalEl } = useModal();
  const [selectedRole, setSelectedRole] = useState(null); // null | "user" | "gcp"
  const [empId,        setEmpId]        = useState("");
  const [dept,         setDept]         = useState("");
  const [evalType,     setEvalType]     = useState("");
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");

  const locked = selectedRole === null;
  const isGCP  = selectedRole === "gcp";
  const themeColor = isGCP ? "#1565c0" : "#1a6b1a";

  const deptOptions = selectedRole ? Object.keys(DEPT_JOB_MAP[selectedRole]) : [];

  const handleSelectRole = (role) => {
    if (selectedRole === role) return;
    setSelectedRole(role);
    setEmpId(""); setDept(""); setEvalType("");
    setVendorCode(""); setSupplierName(""); setProductType(""); setPeriod("");
  };


  const PRODUCT_MAP = { "สินค้า": "goods", "บริการ": "services", "สินค้าและบริการ": "both" };

  const handleSubmit = async () => {
    const missing = [];
    if (!empId.trim())      missing.push("รหัสพนักงาน");
    if (!dept)              missing.push("แผนก");
    if (!evalType)          missing.push("ประเภทประเมิน");
    if (!vendorCode.trim()) missing.push("รหัสผู้ขาย / Vendor Code");
    if (!productType)       missing.push("ประเภทสินค้า");
    if (!period)            missing.push(evalType === "new_supplier" ? "ประเภทการประเมิน" : "รอบการประเมิน");

    if (missing.length > 0) {
      await showAlert(`กรุณากรอกข้อมูลให้ครบก่อนดำเนินการต่อ\n\nยังขาด:\n• ${missing.join("\n• ")}`, "กรอกข้อมูลไม่ครบ");
      return;
    }
    onSubmit({
      empId, dept, evalType, vendorCode, supplierName,
      productType: PRODUCT_MAP[productType] ?? productType,
      period, role: selectedRole,
      employeeId: empId.trim(),
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      {ModalEl}
      <Header />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>เลือกประเภทผู้ประเมิน</h1>

        {/* Tab buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
          {[
            { role: "user", label: "User",  bg: "#2e7d32", outline: "#1b5e20" },
            { role: "gcp",  label: "GCP",   bg: "#1565c0", outline: "#0d47a1" },
          ].map(({ role, label, bg, outline }) => (
            <button
              key={role}
              onClick={() => handleSelectRole(role)}
              style={{
                background: bg, color: "#fff", border: "none",
                borderRadius: 6, padding: "14px 48px", fontSize: 16,
                fontWeight: 700, cursor: "pointer", fontFamily: "monospace",
                letterSpacing: 1,
                opacity: locked || selectedRole === role ? 1 : 0.45,
                outline: selectedRole === role ? `3px solid ${outline}` : "none",
                outlineOffset: 3,
                transition: "opacity 0.2s, outline 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form card wrapper — blur overlay when locked */}
        <div style={{ position: "relative" }}>

          {/* Lock overlay */}
          {locked && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(3px)",
              background: "rgba(255,255,255,0.25)",
              borderRadius: 8,
              gap: 10,
              pointerEvents: "none",
            }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>🔒</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
                กรุณาเลือกประเภทผู้ประเมินก่อน
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                กดปุ่ม User หรือ GCP ด้านบน
              </div>
            </div>
          )}

          {/* Form card */}
          <div style={{
            border: `3px solid ${locked ? "#ccc" : themeColor}`,
            borderRadius: 8, textAlign: "left",
            filter: locked ? "blur(2.5px)" : "none",
            pointerEvents: locked ? "none" : "auto",
            transition: "filter 0.25s, border-color 0.25s",
          }}>
            <div style={{
              background: locked ? "#ccc" : themeColor,
              height: 8, borderRadius: "5px 5px 0 0",
              transition: "background 0.25s",
            }} />

            <div style={{ padding: "20px 24px" }}>

              {/* Title */}
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                สำหรับ{" "}
                <span style={{ color: locked ? "#999" : themeColor }}>
                  {locked
                    ? "User / GCP"
                    : isGCP
                    ? "GCP(เจ้าหน้าที่จัดซื้อ)"
                    : "User(ผู้ใช้งานทั่วไป)"}
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
                  disabled={locked}
                />
              </div>

              {/* แผนก */}
              <div style={{ marginBottom: 14 }}>
                <CustomSelect label="แผนก" required options={deptOptions} value={dept} onChange={setDept} disabled={locked} />
              </div>

              {/* ประเภทประเมิน */}
              <div style={{ marginBottom: evalType ? 14 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  ประเภทประเมิน<span style={{ color: "#e53935" }}>*</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    { value: "new_supplier", label: "pre-Evaluation" },
                    { value: "post_eval",    label: "post-Evaluation" },
                  ].map(({ value: v, label }) => (
                    <label
                      key={v}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        border: `1.5px solid ${!locked && evalType === v ? themeColor : "#bbb"}`,
                        borderRadius: 6, padding: "8px 18px",
                        cursor: locked ? "not-allowed" : "pointer",
                        fontSize: 13, fontFamily: "monospace",
                        background: !locked && evalType === v
                          ? (isGCP ? "#e3f2fd" : "#f1f8e9")
                          : "#fff",
                      }}
                    >
                      <input
                        type="radio"
                        name="evaltype"
                        value={v}
                        checked={evalType === v}
                        onChange={() => { setEvalType(v); setPeriod(""); }}
                        disabled={locked}
                        style={{ accentColor: themeColor }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Supplier fields — โชว์เมื่อเลือก evalType แล้ว */}
              {!locked && evalType && (
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
                      label={evalType === "new_supplier" ? "ประเภทการประเมิน" : "รอบการประเมิน"}
                      required
                      options={evalType === "new_supplier" ? PRE_EVAL_OPTIONS : EVAL_PERIOD_OPTIONS}
                      value={period}
                      onChange={setPeriod}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        {!locked && (
          <GreenButton
            onClick={handleSubmit}
            color={isGCP ? "#1565c0" : "#2e7d32"}
            style={{ marginTop: 28 }}
          >
            {isGCP ? "GCP เริ่มประเมิน Supplier" : "เริ่มประเมิน Supplier"}
          </GreenButton>
        )}
      </div>
    </div>
  );
}
