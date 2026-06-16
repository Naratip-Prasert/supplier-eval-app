// ============================================================
//  pages/LandingPage.jsx
// ============================================================

import { useState } from "react";
import { Header, CustomSelect, GreenInput, GreenButton, useModal } from "../components";
import { authFetch } from "../utils/api";
import { Info, Loader2, AlertCircle } from "lucide-react";
import { PRODUCT_TYPE_OPTIONS, EVAL_PERIOD_OPTIONS } from "../constants";

const PRODUCT_MAP   = { "สินค้า": "goods", "บริการ": "services", "สินค้าและบริการ": "both" };
const PRODUCT_LABEL = { goods: "สินค้า", services: "บริการ", both: "สินค้าและบริการ" };

export default function LandingPage({ authUser, onSubmit, onLogout }) {
  const { showAlert, ModalEl } = useModal();

  // Derive role from auth token — no manual role selector needed
  const isGCP      = authUser.role === "gcp";
  const themeColor = isGCP ? "#1565c0" : "#1a6b1a";

  const [evalType,     setEvalType]     = useState("");
  const [vendorCode,   setVendorCode]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [productType,  setProductType]  = useState("");
  const [period,       setPeriod]       = useState("");

  const [vendorLookup, setVendorLookup] = useState({ status: "idle", data: null });

  // ── Vendor lookup (authenticated) ───────────────────────────
  const lookupVendor = async (code) => {
    if (!code.trim()) return "idle";
    setVendorLookup({ status: "loading", data: null });
    try {
      const res = await authFetch(`/api/suppliers/${encodeURIComponent(code.trim())}`);
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
      setProductType(data.productType || "");
      return "found";
    } catch {
      setVendorLookup({ status: "error", data: null });
      return "error";
    }
  };

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    let vendorStatus = vendorLookup.status;
    if (evalType && vendorCode.trim() && vendorLookup.status === "idle") {
      vendorStatus = await lookupVendor(vendorCode);
    }

    const missing = [];
    if (!evalType)                        missing.push("ประเภทประเมิน");
    if (!vendorCode.trim())               missing.push("รหัสผู้ขาย / Vendor Code");
    else if (vendorStatus === "notfound") missing.push("รหัสผู้ขาย (ไม่พบในระบบ)");
    else if (vendorStatus === "error")    missing.push("รหัสผู้ขาย (เชื่อมต่อไม่ได้)");
    if (!productType)  missing.push("ประเภทสินค้า");
    if (!period)       missing.push("รอบการประเมิน");

    if (missing.length > 0) {
      await showAlert(
        `กรุณากรอกข้อมูลให้ครบก่อนดำเนินการต่อ\n\nยังขาด:\n• ${missing.join("\n• ")}`,
        "กรอกข้อมูลไม่ครบ"
      );
      return;
    }

    onSubmit({
      empId:       authUser.empId,
      employeeId:  authUser.empId,
      dept:        authUser.department,
      evalType,
      vendorCode,
      supplierName,
      productType: PRODUCT_MAP[productType] ?? productType,
      period,
      role:        authUser.role,
    });
  };

  const vendorFound = vendorLookup.status === "found";

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Sarabun, sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {ModalEl}
      <Header user={authUser} onLogout={onLogout} />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
          ประเมิน Supplier
        </h1>

        <div style={{
          border: `3px solid ${themeColor}`,
          borderRadius: 8, textAlign: "left",
        }}>
          <div style={{ background: themeColor, height: 8, borderRadius: "5px 5px 0 0" }} />

          <div style={{ padding: "20px 24px" }}>

            {/* Role badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
              padding: "10px 14px",
              background: isGCP ? "#e3f2fd" : "#f1f8e9",
              border: `1.5px solid ${isGCP ? "#90caf9" : "#a5d6a7"}`,
              borderRadius: 8,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: themeColor, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {authUser.fullName?.[0] ?? "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: themeColor }}>
                  {authUser.fullName}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 1 }}>
                  {authUser.empId} · {authUser.department}
                  {authUser.jobTitle && ` · ${authUser.jobTitle}`}
                </div>
              </div>
              <span style={{
                background: themeColor, color: "#fff",
                borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {isGCP ? "GCP" : "USER"}
              </span>
            </div>

            {isGCP && (
              <div style={{
                background: "#e3f2fd", border: "1.5px solid #90caf9",
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", color: "#1565c0",
              }}>
                <Info size={16} style={{ flexShrink: 0 }} />
                <span>
                  เจ้าหน้าที่ GCP จะเห็นแบบประเมินทั้งหมด แต่สามารถกรอกได้เฉพาะส่วนของฝ่ายจัดซื้อเท่านั้น
                </span>
              </div>
            )}

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
                      border: `1.5px solid ${evalType === v ? themeColor : "#bbb"}`,
                      borderRadius: 6, padding: "8px 18px",
                      cursor: "pointer", fontSize: 13, fontFamily: "monospace",
                      background: evalType === v
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
                      style={{ accentColor: themeColor }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* ── Supplier fields ── */}
            {evalType && (
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
                      <div style={{ fontSize: 12, color: "#888", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> กำลังค้นหา...
                      </div>
                    )}
                    {vendorLookup.status === "notfound" && (
                      <div style={{ fontSize: 12, color: "#e53935", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <AlertCircle size={12} /> ไม่พบ Vendor Code นี้ในระบบ
                      </div>
                    )}
                    {vendorLookup.status === "error" && (
                      <div style={{ fontSize: 12, color: "#e53935", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <AlertCircle size={12} /> ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</div>
                    )}
                  </div>

                  {/* Supplier Name — auto-filled */}
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
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <GreenButton
            onClick={handleSubmit}
            color={isGCP ? "#1565c0" : "#2e7d32"}
          >
            {isGCP ? "GCP เริ่มประเมิน Supplier" : "เริ่มประเมิน Supplier"}
          </GreenButton>
        </div>
      </div>
    </div>
  );
}
