import React, { useState } from "react";
import { X } from "lucide-react";
import { authFetch } from "@/utils/api";

interface SupplierRow {
  vendorCode: string;
  supplierName: string;
  productType: string;
  taxId?: string | null;
  category?: string | null;
  functionOwner?: string | null;
  jobValueThb?: number | null;
  ptaApproveDate?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  evaluatorName?: string | null;
  evaluatorEmail?: string | null;
  contactEmail?: string | null;
  isActive: boolean;
}

interface EditSupplierModalProps {
  supplier: SupplierRow;
  isNew?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditSupplierModal({ supplier, isNew, onClose, onSaved }: EditSupplierModalProps) {
  const [formData, setFormData] = useState({
    vendorCode: supplier.vendorCode || "",
    supplierName: supplier.supplierName || "",
    productType: supplier.productType || "both",
    taxId: supplier.taxId || "",
    category: supplier.category || "",
    functionOwner: supplier.functionOwner || "",
    jobValueThb: supplier.jobValueThb !== null && supplier.jobValueThb !== undefined ? String(supplier.jobValueThb) : "",
    ptaApproveDate: supplier.ptaApproveDate ? new Date(supplier.ptaApproveDate).toISOString().slice(0, 10) : "",
    buyerName: supplier.buyerName || "",
    buyerEmail: supplier.buyerEmail || "",
    evaluatorName: supplier.evaluatorName || "",
    evaluatorEmail: supplier.evaluatorEmail || "",
    isActive: supplier.isActive,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        jobValueThb: formData.jobValueThb ? Number(formData.jobValueThb) : null,
        ptaApproveDate: formData.ptaApproveDate ? formData.ptaApproveDate : null,
      };

      let res;
      if (isNew) {
        res = await authFetch(`/api/admin/suppliers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch(`/api/admin/suppliers/${supplier.vendorCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "บันทึกไม่สำเร็จ");
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 20
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#333", fontFamily: "Sarabun, sans-serif" }}>
            {isNew ? "สร้างข้อมูล Supplier ใหม่" : "แก้ไขข้อมูล Supplier"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#888" />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div style={{ color: "#d32f2f", fontSize: 13, background: "#ffebee", padding: "10px 14px", borderRadius: 8 }}>{error}</div>}
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Vendor Code">
              <input name="vendorCode" value={formData.vendorCode} onChange={handleChange} disabled={!isNew} style={{ ...inputStyle, background: isNew ? "#fff" : "#f5f5f5" }} />
            </Field>
            <Field label="Supplier Name">
              <input name="supplierName" value={formData.supplierName} onChange={handleChange} style={inputStyle} />
            </Field>
            
            <Field label="Tax ID">
              <input name="taxId" value={formData.taxId} onChange={handleChange} style={inputStyle} />
            </Field>
            <Field label="Product Type">
              <select name="productType" value={formData.productType} onChange={handleChange} style={inputStyle}>
                <option value="both">สินค้า+บริการ (both)</option>
                <option value="goods">สินค้า (goods)</option>
                <option value="services">บริการ (services)</option>
              </select>
            </Field>

            <Field label="Category">
              <input name="category" value={formData.category} onChange={handleChange} style={inputStyle} />
            </Field>
            <Field label="Function Owner">
              <input name="functionOwner" value={formData.functionOwner} onChange={handleChange} style={inputStyle} />
            </Field>

            <Field label="Job Value (THB)">
              <input type="number" name="jobValueThb" value={formData.jobValueThb} onChange={handleChange} style={inputStyle} />
            </Field>
            <Field label="PTA Approve Date">
              <input type="date" name="ptaApproveDate" value={formData.ptaApproveDate} onChange={handleChange} style={inputStyle} />
            </Field>

            <Field label="Buyer Name">
              <input name="buyerName" value={formData.buyerName} onChange={handleChange} style={inputStyle} />
            </Field>
            <Field label="Buyer Email">
              <input name="buyerEmail" value={formData.buyerEmail} onChange={handleChange} style={inputStyle} />
            </Field>

            <Field label="Evaluator Name">
              <input name="evaluatorName" value={formData.evaluatorName} onChange={handleChange} style={inputStyle} />
            </Field>
            <Field label="Evaluator Email">
              <input name="evaluatorEmail" value={formData.evaluatorEmail} onChange={handleChange} style={inputStyle} />
            </Field>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="checkbox" id="isActive" name="isActive" checked={formData.isActive} onChange={handleChange} />
            <label htmlFor="isActive" style={{ fontSize: 13, color: "#333", cursor: "pointer" }}>เปิดใช้งาน (Active)</label>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Sarabun, sans-serif" }}>
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1b5e20", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "Sarabun, sans-serif" }}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6, boxSizing: "border-box",
  border: "1px solid #ccc", fontSize: 13, fontFamily: "Sarabun, sans-serif"
};
