// ============================================================
//  pages/Userform.jsx
//  - Employee ID validated on blur → auto-fills dept + job (Req 2, 11)
//  - Vendor code validated on blur → auto-fills supplier name (Req 8)
//  - Required-field alert before submit (Req 5)
//  - eval_type: new_supplier / re_evaluation (Req 7)
//  - VITE_API_URL from .env (Req 13)
// ============================================================

import { useState } from "react";
import { Header, GreenInput, GreenButton, CustomSelect } from "../components";
import { PRODUCT_TYPE_OPTIONS, EVAL_PERIOD_OPTIONS } from "../constants";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Maps Thai display value → English value sent to API
const PRODUCT_TYPE_TO_API = {
  "สินค้า": "goods",
  "บริการ": "services",
  "สินค้าและบริการ": "both",
};

const EVAL_TYPE_OPTIONS = [
  { value: "new_supplier",  label: "New Supplier / ซัพพลายเออร์ใหม่" },
  { value: "re_evaluation", label: "Re-Evaluation / ประเมินซ้ำ" },
];

export default function UserForm({ role, onBack, onSubmit }) {
  const [activeTab, setActiveTab] = useState(role === "gcp" ? "gcp" : "user");

  // Employee fields
  const [empId,      setEmpId]      = useState("");
  const [empInfo,    setEmpInfo]    = useState(null);   // { fullName, department, jobTitle, role }
  const [empLoading, setEmpLoading] = useState(false);
  const [empError,   setEmpError]   = useState(null);

  // Eval type
  const [evalType, setEvalType] = useState("");

  // Supplier fields
  const [vendorCode,        setVendorCode]        = useState("");
  const [supplierName,      setSupplierName]      = useState("");
  const [supplierValidated, setSupplierValidated] = useState(false);
  const [supplierError,     setSupplierError]     = useState(null);
  const [productType,       setProductType]       = useState("");
  const [period,            setPeriod]            = useState("");

  const isGCP       = activeTab === "gcp";
  const accentColor = isGCP ? "#1565c0" : "#1a6b1a";

  // ── Employee ID validation ─────────────────────────────────
  const handleEmpBlur = async () => {
    if (!empId.trim()) return;
    setEmpLoading(true);
    setEmpError(null);
    setEmpInfo(null);
    try {
      const res = await fetch(`${API_URL}/api/employees/${encodeURIComponent(empId.trim())}`);
      if (!res.ok) {
        setEmpError("ไม่พบรหัสพนักงานในระบบ");
        return;
      }
      const data = await res.json();
      setEmpInfo(data);
    } catch {
      setEmpError("ไม่สามารถตรวจสอบรหัสพนักงานได้");
    } finally {
      setEmpLoading(false);
    }
  };

  // ── Vendor code validation ─────────────────────────────────
  const handleVendorBlur = async () => {
    if (!vendorCode.trim()) return;
    setSupplierError(null);
    try {
      const res = await fetch(`${API_URL}/api/suppliers`);
      const all = await res.json();
      const found = all.find((s) => s.vendorCode === vendorCode.trim());
      if (found) {
        setSupplierName(found.supplierName);
        setSupplierValidated(true);
      } else {
        setSupplierError("ไม่พบรหัสผู้ขายในระบบ");
        setSupplierValidated(false);
      }
    } catch {
      setSupplierError("ไม่สามารถตรวจสอบรหัสผู้ขายได้");
    }
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = () => {
    const missing = [];
    if (!empId.trim())   missing.push("รหัสพนักงาน");
    if (!empInfo)        missing.push("รหัสพนักงาน (ต้องตรวจสอบก่อน — คลิกออกจากช่อง)");
    if (!evalType)       missing.push("ประเภทประเมิน");
    if (!vendorCode.trim()) missing.push("รหัสผู้ขาย (Vendor Code)");
    if (!supplierName.trim()) missing.push("ชื่อผู้ขาย");
    if (!productType)    missing.push("ประเภทสินค้า");
    if (!period)         missing.push("รอบการประเมิน");

    if (missing.length > 0) {
      alert(`กรุณากรอกข้อมูลให้ครบถ้วน:\n\n• ${missing.join("\n• ")}`);
      return;
    }

    onSubmit({
      empId:        empId.trim(),
      dept:         empInfo.department,
      job:          empInfo.jobTitle,
      evalType,
      vendorCode:   vendorCode.trim(),
      supplierName: supplierName.trim(),
      productType:  PRODUCT_TYPE_TO_API[productType] || productType,
      period,
      role:         empInfo.role,
    });
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

            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              สำหรับ{" "}
              <span style={{ color: accentColor }}>
                {isGCP ? "GCP (เจ้าหน้าที่จัดซื้อ)" : "User (ผู้ใช้งานทั่วไป)"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16, fontFamily: "monospace" }}>
              {isGCP
                ? "ประเมิน Supplier โดยเจ้าหน้าที่ GCP"
                : "ประเมิน Supplier — กรอกข้อมูลและเลือกแบบประเมินด้านล่าง"}
            </div>

            {/* รหัสพนักงาน */}
            <div style={{ marginBottom: 14 }}>
              <GreenInput
                label={`รหัสพนักงาน${isGCP ? " GCP" : ""}`}
                required
                value={empId}
                onChange={(v) => { setEmpId(v); setEmpInfo(null); setEmpError(null); }}
                onBlur={handleEmpBlur}
                placeholder="เช่น EMP-001"
                error={empError}
              />
              {empLoading && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>กำลังตรวจสอบ...</div>
              )}
              {empInfo && (
                <div style={{
                  marginTop: 6, padding: "6px 10px", background: "#e8f5e9",
                  border: "1px solid #a5d6a7", borderRadius: 6, fontSize: 12, color: "#2e7d32",
                }}>
                  ✅ พบข้อมูล: <b>{empInfo.fullName}</b> — {empInfo.role}
                </div>
              )}
            </div>

            {/* แผนก + ชื่องาน (auto-filled, read-only) */}
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <GreenInput
                label="แผนก"
                required
                value={empInfo?.department || ""}
                placeholder="จะแสดงอัตโนมัติเมื่อกรอกรหัสพนักงาน"
                disabled
              />
              <GreenInput
                label="ชื่องาน"
                required
                value={empInfo?.jobTitle || ""}
                placeholder="จะแสดงอัตโนมัติเมื่อกรอกรหัสพนักงาน"
                disabled
              />
            </div>

            {/* ประเภทประเมิน */}
            <div style={{ marginBottom: evalType ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                ประเภทประเมิน<span style={{ color: "#e53935" }}>*</span>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {EVAL_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      border: `1.5px solid ${evalType === opt.value ? accentColor : "#bbb"}`,
                      borderRadius: 6, padding: "8px 18px", cursor: "pointer",
                      fontSize: 13, fontFamily: "monospace",
                      background: evalType === opt.value ? (isGCP ? "#e3f2fd" : "#f1f8e9") : "#fff",
                    }}
                  >
                    <input
                      type="radio"
                      name="evaltype"
                      value={opt.value}
                      checked={evalType === opt.value}
                      onChange={() => setEvalType(opt.value)}
                      style={{ accentColor }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Supplier fields */}
            {evalType && (
              <div style={{
                border: "1.5px solid #ccc", borderRadius: 8,
                padding: 16, background: "#fafafa", marginTop: 14,
              }}>
                <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                  <GreenInput
                    label="รหัสผู้ขาย (Vendor Code)"
                    required
                    value={vendorCode}
                    onChange={(v) => { setVendorCode(v); setSupplierValidated(false); setSupplierError(null); }}
                    onBlur={handleVendorBlur}
                    placeholder="เช่น SUP-001"
                    error={supplierError}
                  />
                  <GreenInput
                    label="ชื่อผู้ขาย / Supplier"
                    required
                    value={supplierName}
                    onChange={setSupplierName}
                    placeholder="จะแสดงอัตโนมัติเมื่อกรอกรหัสผู้ขาย"
                    disabled={supplierValidated}
                  />
                </div>
                {supplierValidated && (
                  <div style={{
                    marginBottom: 10, padding: "6px 10px", background: "#e8f5e9",
                    border: "1px solid #a5d6a7", borderRadius: 6, fontSize: 12, color: "#2e7d32",
                  }}>
                    ✅ ตรวจสอบผู้ขายแล้ว
                  </div>
                )}
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
