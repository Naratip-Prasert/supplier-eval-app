// ============================================================
//  pages/LandingPage.jsx
// ============================================================

import { useState } from "react";
import { Header, CustomSelect, GreenInput, GreenButton, useModal } from "../components";
import {
  DEPT_JOB_MAP,
  PRODUCT_TYPE_OPTIONS,
  PRE_EVAL_OPTIONS,
  EVAL_PERIOD_OPTIONS,
} from "../constants";

const API_BASE    = import.meta.env.VITE_API_URL || "http://localhost:5000";
const PRODUCT_MAP = { "สินค้า": "goods", "บริการ": "services", "สินค้าและบริการ": "both" };
const PRODUCT_LABEL = { goods: "สินค้า", services: "บริการ", both: "สินค้าและบริการ" };

export default function LandingPage({ onSubmit }) {
  const { showAlert, ModalEl } = useModal();
  const [selectedRole, setSelectedRole] = useState(null);
  const [empId,        setEmpId]        = useState("");
  const [dept,         setDept]         = useState("");
  const [evalType,     setEvalType]     = useState("");
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");

  // status: "idle" | "loading" | "found" | "notfound" | "error"
  const [empLookup,    setEmpLookup]    = useState({ status: "idle", data: null });
  const [vendorLookup, setVendorLookup] = useState({ status: "idle", data: null });

  const locked     = selectedRole === null;
  const isGCP      = selectedRole === "gcp";
  const themeColor = isGCP ? "#1565c0" : "#1a6b1a";
  const deptOptions = selectedRole ? Object.keys(DEPT_JOB_MAP[selectedRole]) : [];

  const handleSelectRole = (role) => {
    if (selectedRole === role) return;
    setSelectedRole(role);
    setEmpId(""); setDept(""); setEvalType("");
    setVendorCode(""); setSupplierName(""); setProductType(""); setPeriod("");
    setEmpLookup({ status: "idle", data: null });
    setVendorLookup({ status: "idle", data: null });
  };

  // ── Employee lookup (triggered on blur) ─────────────────────
  const lookupEmployee = async (id) => {
    if (!id.trim()) return "idle";
    setEmpLookup({ status: "loading", data: null });
    try {
      const res = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(id.trim())}`);
      if (res.status === 404) {
        setEmpLookup({ status: "notfound", data: null });
        return "notfound";
      }
      if (!res.ok) {
        setEmpLookup({ status: "error", data: null });
        return "error";
      }
      const data = await res.json();
      setEmpLookup({ status: "found", data });
      setDept(data.department || "");
      return "found";
    } catch {
      setEmpLookup({ status: "error", data: null });
      return "error";
    }
  };

  // ── Vendor lookup (triggered on blur) ───────────────────────
  const lookupVendor = async (code) => {
    if (!code.trim()) return "idle";
    setVendorLookup({ status: "loading", data: null });
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/${encodeURIComponent(code.trim())}`);
      if (res.status === 404) {
        setVendorLookup({ status: "notfound", data: null });
        return "notfound";
      }
      if (!res.ok) {
        setVendorLookup({ status: "error", data: null });
        return "error";
      }
      const data = await res.json();
      setVendorLookup({ status: "found", data });
      setSupplierName(data.supplierName || "");
      setProductType(data.productType || ""); // 'goods' | 'services' | 'both'
      return "found";
    } catch {
      setVendorLookup({ status: "error", data: null });
      return "error";
    }
  };

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Trigger any pending lookups before validating
    let empStatus    = empLookup.status;
    let vendorStatus = vendorLookup.status;
    if (empId.trim() && empLookup.status === "idle") {
      empStatus = await lookupEmployee(empId);
    }
    if (evalType && vendorCode.trim() && vendorLookup.status === "idle") {
      vendorStatus = await lookupVendor(vendorCode);
    }

    const missing = [];
    if (!empId.trim())                 missing.push("รหัสพนักงาน");
    else if (empStatus === "notfound") missing.push("รหัสพนักงาน (ไม่พบในระบบ)");
    else if (empStatus === "error")    missing.push("รหัสพนักงาน (เชื่อมต่อไม่ได้)");
    if (!dept)                         missing.push("แผนก");
    if (!evalType)                     missing.push("ประเภทประเมิน");
    if (!vendorCode.trim())               missing.push("รหัสผู้ขาย / Vendor Code");
    else if (vendorStatus === "notfound") missing.push("รหัสผู้ขาย (ไม่พบในระบบ)");
    else if (vendorStatus === "error")    missing.push("รหัสผู้ขาย (เชื่อมต่อไม่ได้)");
    if (!productType)  missing.push("ประเภทสินค้า");
    if (!period)       missing.push(evalType === "new_supplier" ? "ประเภทการประเมิน" : "รอบการประเมิน");

    if (missing.length > 0) {
      await showAlert(`กรุณากรอกข้อมูลให้ครบก่อนดำเนินการต่อ\n\nยังขาด:\n• ${missing.join("\n• ")}`, "กรอกข้อมูลไม่ครบ");
      return;
    }

    onSubmit({
      empId, dept, evalType, vendorCode, supplierName,
      productType: PRODUCT_MAP[productType] ?? productType, // handles both Thai and English
      period, role: selectedRole,
      employeeId: empId.trim(),
    });
  };

  const empFound    = empLookup.status === "found";
  const vendorFound = vendorLookup.status === "found";

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      {ModalEl}
      <Header />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>เลือกประเภทผู้ประเมิน</h1>

        {/* Role tabs */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
          {[
            { role: "user", label: "User", bg: "#2e7d32", outline: "#1b5e20" },
            { role: "gcp",  label: "GCP",  bg: "#1565c0", outline: "#0d47a1" },
          ].map(({ role, label, bg, outline }) => (
            <button
              key={role}
              onClick={() => handleSelectRole(role)}
              style={{
                background: bg, color: "#fff", border: "none",
                borderRadius: 6, padding: "14px 48px", fontSize: 16,
                fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
                opacity: locked || selectedRole === role ? 1 : 0.45,
                outline: selectedRole === role ? `3px solid ${outline}` : "none",
                outlineOffset: 3, transition: "opacity 0.2s, outline 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form card wrapper */}
        <div style={{ position: "relative" }}>

          {/* Lock overlay */}
          {locked && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(3px)", background: "rgba(255,255,255,0.25)",
              borderRadius: 8, gap: 10, pointerEvents: "none",
            }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>🔒</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>กรุณาเลือกประเภทผู้ประเมินก่อน</div>
              <div style={{ fontSize: 12, color: "#666" }}>กดปุ่ม User หรือ GCP ด้านบน</div>
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
            <div style={{ background: locked ? "#ccc" : themeColor, height: 8, borderRadius: "5px 5px 0 0", transition: "background 0.25s" }} />

            <div style={{ padding: "20px 24px" }}>

              {/* Title */}
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                สำหรับ{" "}
                <span style={{ color: locked ? "#999" : themeColor }}>
                  {locked ? "User / GCP" : isGCP ? "GCP(เจ้าหน้าที่จัดซื้อ)" : "User(ผู้ใช้งานทั่วไป)"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 16, fontFamily: "monospace" }}>
                {isGCP
                  ? "ประเมิน Supplier โดยเจ้าหน้าที่ GCP — สามารถกรอกข้อมูลและมองเห็นแบบประเมินทั้งหมด"
                  : "ประเมิน Supplier หรือประเมิน Buyer กรอกข้อมูลและเลือกแบบประเมินด้านล่าง"}
              </div>

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

              {/* ── รหัสพนักงาน ── */}
              <div style={{ marginBottom: 6 }}>
                <GreenInput
                  label={`รหัสพนักงาน${isGCP ? " GCP" : ""}`}
                  required
                  value={empId}
                  onChange={(v) => {
                    setEmpId(v);
                    setEmpLookup({ status: "idle", data: null });
                    setDept("");
                  }}
                  onBlur={() => lookupEmployee(empId)}
                  placeholder="เช่น EMP-001"
                  disabled={locked}
                />
                {empLookup.status === "loading" && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>⏳ กำลังค้นหา...</div>
                )}
                {empLookup.status === "notfound" && (
                  <div style={{ fontSize: 12, color: "#e53935", marginTop: 4 }}>⚠ ไม่พบรหัสพนักงานนี้ในระบบ</div>
                )}
                {empLookup.status === "error" && (
                  <div style={{ fontSize: 12, color: "#e53935", marginTop: 4 }}>⚠ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</div>
                )}
              </div>

              {/* Employee info card (shown when found) */}
              {empFound && empLookup.data && (
                <div style={{
                  background: "#f1f8e9", border: "1.5px solid #a5d6a7",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 10,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: themeColor, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, fontWeight: 700, flexShrink: 0,
                  }}>
                    {empLookup.data.fullName?.[0] ?? "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a6b1a" }}>
                      {empLookup.data.fullName}
                    </div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      {empLookup.data.department}
                      {empLookup.data.jobTitle && ` · ${empLookup.data.jobTitle}`}
                    </div>
                  </div>
                  <span style={{
                    background: isGCP ? "#1565c0" : "#2e7d32", color: "#fff",
                    borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {empLookup.data.role}
                  </span>
                </div>
              )}

              {/* ── แผนก — read-only when auto-filled ── */}
              <div style={{ marginBottom: 14 }}>
                {empFound ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
                      แผนก <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(จากระบบ)</span>
                    </div>
                    <div style={{
                      background: "#f0f0f0", border: "1.5px solid #aaa",
                      borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "#444",
                    }}>
                      {dept || "—"}
                    </div>
                  </>
                ) : (
                  <CustomSelect label="แผนก" required options={deptOptions} value={dept} onChange={setDept} disabled={locked} />
                )}
              </div>

              {/* ── ประเภทประเมิน ── */}
              <div style={{ marginBottom: evalType ? 14 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  ประเภทประเมิน<span style={{ color: "#e53935" }}>*</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    { value: "new_supplier", label: "pre-Evaluation"  },
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

              {/* ── Supplier fields ── */}
              {!locked && evalType && (
                <div style={{
                  border: "1.5px solid #ccc", borderRadius: 8,
                  padding: 16, background: "#fafafa", marginTop: 14,
                }}>
                  <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>

                    {/* Vendor Code */}
                    <div style={{ flex: 1 }}>
                      <GreenInput
                        label="รหัสผู้ขาย/vendor code"
                        required
                        value={vendorCode}
                        onChange={(v) => {
                          setVendorCode(v);
                          setVendorLookup({ status: "idle", data: null });
                          setSupplierName("");
                          setProductType("");
                        }}
                        onBlur={() => lookupVendor(vendorCode)}
                        placeholder="เช่น SUP-001"
                      />
                      {vendorLookup.status === "loading" && (
                        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>⏳ กำลังค้นหา...</div>
                      )}
                      {vendorLookup.status === "notfound" && (
                        <div style={{ fontSize: 12, color: "#e53935", marginTop: 4 }}>⚠ ไม่พบ Vendor Code นี้ในระบบ</div>
                      )}
                      {vendorLookup.status === "error" && (
                        <div style={{ fontSize: 12, color: "#e53935", marginTop: 4 }}>⚠ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</div>
                      )}
                    </div>

                    {/* Supplier Name — auto-filled, read-only */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
                        ชื่อผู้ขาย/Supplier
                        {vendorFound && (
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}> (จากระบบ)</span>
                        )}
                      </div>
                      <div style={{
                        background: vendorFound ? "#f0f0f0" : "#d4f5c8",
                        border: `1.5px solid ${vendorFound ? "#aaa" : "#888"}`,
                        borderRadius: 8, padding: "8px 14px", fontSize: 14,
                        color: supplierName ? "#222" : "#999",
                        minHeight: 40, display: "flex", alignItems: "center",
                      }}>
                        {supplierName || (
                          <span style={{ fontStyle: "italic", fontSize: 13 }}>
                            กรอก Vendor Code ก่อน
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 14 }}>

                    {/* Product Type — auto-filled when vendor found */}
                    <div style={{ flex: 1 }}>
                      {vendorFound ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#222" }}>
                            ประเภทสินค้า <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(จากระบบ)</span>
                          </div>
                          <div style={{
                            background: "#f0f0f0", border: "1.5px solid #aaa",
                            borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "#444",
                          }}>
                            {PRODUCT_LABEL[productType] ?? productType}
                          </div>
                        </>
                      ) : (
                        <CustomSelect
                          label="ประเภทสินค้า"
                          required
                          options={PRODUCT_TYPE_OPTIONS}
                          value={productType}
                          onChange={setProductType}
                        />
                      )}
                    </div>

                    {/* Period */}
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
