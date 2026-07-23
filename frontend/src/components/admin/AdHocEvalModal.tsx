"use client";

import { useState, type CSSProperties } from "react";
import { AlertTriangle, X, CheckCircle } from "lucide-react";
import { authFetch } from "@/utils/api";

const OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, fontFamily: "Sarabun, sans-serif",
};
const MODAL: CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
  margin: 16,
};
const INPUT: CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1.5px solid #ddd", borderRadius: 8,
  padding: "10px 12px", fontFamily: "Sarabun, sans-serif", fontSize: 14, outline: "none",
};
const LABEL: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#444", marginBottom: 6, display: "block" };
const BTN_PRIMARY: CSSProperties = {
  background: "#c62828", color: "#fff", border: "none",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const BTN_SECONDARY: CSSProperties = {
  background: "#f5f5f5", color: "#333", border: "1px solid #ddd",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, cursor: "pointer",
};

export default function AdHocEvalModal({ onClose }: { onClose: () => void }) {
  const [vendorCode, setVendorCode] = useState("");
  const [reason,     setReason]     = useState("");
  const [dueInDays,  setDueInDays]  = useState("7");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit() {
    if (!vendorCode.trim() || !reason.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await authFetch("/api/admin/ad-hoc-evaluation", {
        method: "POST",
        body: JSON.stringify({ vendorCode: vendorCode.trim(), reason: reason.trim(), dueInDays: Number(dueInDays) || 7 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "สร้างงานประเมินไม่สำเร็จ");
      setResult({ ok: true, message: data.message || "สร้างงานประเมินสำเร็จ" });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={20} color="#c62828" />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#222" }}>สร้างงานประเมิน Ad-hoc</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}><X size={20} /></button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#777", lineHeight: 1.6 }}>
            ใช้สำหรับกรณีพิเศษ เช่น complaint หรือ incident ที่ต้องประเมิน Supplier
            นอกรอบปกติทันที — งานจะถูกส่งให้ Buyer/Evaluator ที่บันทึกไว้ของ Supplier รายนี้
          </p>

          <div>
            <label style={LABEL}>รหัส Supplier (Vendor Code)</label>
            <input style={INPUT} value={vendorCode} onChange={e => setVendorCode(e.target.value)}
              placeholder="เช่น SUP-001" disabled={loading} />
          </div>

          <div>
            <label style={LABEL}>เหตุผล (Complaint / Incident)</label>
            <textarea style={{ ...INPUT, minHeight: 90, resize: "vertical", fontFamily: "Sarabun, sans-serif" }}
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="อธิบายเหตุผลที่ต้องประเมินกรณีพิเศษนี้" disabled={loading} />
          </div>

          <div>
            <label style={LABEL}>ครบกำหนดภายใน (วัน)</label>
            <input style={{ ...INPUT, width: 120 }} type="number" min={1} value={dueInDays}
              onChange={e => setDueInDays(e.target.value)} disabled={loading} />
          </div>

          {result && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
              background: result.ok ? "#e8f5e9" : "#ffebee", color: result.ok ? "#2e7d32" : "#c62828",
            }}>
              {result.ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              {result.message}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={BTN_SECONDARY} onClick={onClose}>{result?.ok ? "ปิด" : "ยกเลิก"}</button>
            {!result?.ok && (
              <button style={{ ...BTN_PRIMARY, opacity: loading || !vendorCode.trim() || !reason.trim() ? 0.6 : 1 }}
                onClick={handleSubmit} disabled={loading || !vendorCode.trim() || !reason.trim()}>
                {loading ? "กำลังสร้าง..." : "สร้างงานประเมิน"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
