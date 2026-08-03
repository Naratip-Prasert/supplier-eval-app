"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { Upload, X, CheckCircle, AlertTriangle, ChevronRight, Download } from "lucide-react";
import { authFetch } from "@/utils/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

const OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, fontFamily: "Sarabun, sans-serif",
};
const MODAL: CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
  margin: 16,
};
const BTN_PRIMARY: CSSProperties = {
  background: "#1b5e20", color: "#fff", border: "none",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const BTN_SECONDARY: CSSProperties = {
  background: "#f5f5f5", color: "#333", border: "1px solid #ddd",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, cursor: "pointer",
};

interface UploadResult {
  ok: boolean;
  message?: string;
  processed?: number;
  skipped?: number;
  warnings?: string[];
}

interface SupplierUploadModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function SupplierUploadModal({ onClose, onSaved }: SupplierUploadModalProps) {
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<any[][] | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<UploadResult | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [fileError,  setFileError]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function handleFileSelect(f: File | null | undefined) {
    if (!f) return;
    setResult(null);
    setPreview(null);

    if (!ALLOWED_EXT.test(f.name)) {
      setFile(null);
      setFileError("รองรับเฉพาะไฟล์ .xlsx, .xls, .csv");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError(`ไฟล์ใหญ่เกินไป (${(f.size / 1024 / 1024).toFixed(1)} MB) — สูงสุด 10 MB`);
      return;
    }

    setFileError(null);
    setFile(f);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        setPreview(rows.slice(0, 6));
      } catch { setPreview(null); }
    };
    reader.onerror = () => setFileError("ไม่สามารถอ่านไฟล์ได้ ลองเลือกไฟล์ใหม่อีกครั้ง");
    reader.readAsArrayBuffer(f);
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res  = await authFetch("/api/admin/suppliers/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      
      if (mountedRef.current) {
        setResult({ ok: true, ...data });
      }
    } catch (e) {
      if (mountedRef.current) setResult({ ok: false, message: (e as Error).message });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function downloadTemplate() {
    try {
      const XLSX = await import("xlsx");
      const headers = [
        "Vendor Code", "Supplier Name", "TAX_ID", "Product Type", 
        "Category", "Function_Owner", "Job Value THB", "PTA Approve Date", 
        "Buyer Name", "Buyer Email", "Evaluator Name", "Evaluator Email"
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      XLSX.writeFile(wb, "Supplier_Master_Template.xlsx");
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div style={OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        <div style={{ background: "#1b5e20", borderRadius: "14px 14px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>อัพโหลด/อัปเดต ซัพพลายเออร์ด้วย Excel</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {!result && (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#555", lineHeight: 1.5 }}>
                ระบบจะใช้ <strong>Vendor Code</strong> เพื่อตรวจสอบ ถ้ารหัสซ้ำจะอัปเดตข้อมูล ถ้าไม่ซ้ำจะสร้างใหม่ (ไม่สร้างงานประเมิน)
              </p>

              <div
                style={{
                  border: `2px dashed ${dragOver ? "#1b5e20" : "#ccc"}`,
                  borderRadius: 10, padding: "24px 16px", textAlign: "center",
                  background: dragOver ? "#f1f8e9" : "#fafafa", cursor: "pointer",
                  marginBottom: 12, transition: "all 0.15s",
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
              >
                <Upload size={32} color="#888" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>
                  {file ? file.name : "คลิกหรือลากไฟล์มาวาง"}
                </div>
                <div style={{ fontSize: 12, color: "#aaa" }}>.xlsx, .xls, .csv (สูงสุด 10 MB)</div>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                  style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #1b5e20", color: "#1b5e20", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "Sarabun, sans-serif", fontWeight: 700 }}
                >
                  <Download size={14} /> ดาวน์โหลดเทมเพลต
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])} />
              </div>

              {fileError && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
                  background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8,
                  padding: "8px 12px", fontSize: 12.5, color: "#c62828",
                }}>
                  <AlertTriangle size={14} /> {fileError}
                </div>
              )}

              {preview && preview.length > 1 && (
                <div style={{ marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 12, color: "#777", marginBottom: 6 }}>ตัวอย่างข้อมูล (5 แถวแรก)</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>{preview[0].map((h, i) => (
                        <th key={i} style={{ padding: "4px 8px", background: "#e8f5e9", border: "1px solid #ddd", whiteSpace: "nowrap" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => (
                          <td key={j} style={{ padding: "3px 8px", border: "1px solid #eee", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {cell != null ? String(cell) : ""}
                          </td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={BTN_SECONDARY} onClick={onClose}>ยกเลิก</button>
                <button
                  style={{ ...BTN_PRIMARY, opacity: (!file || loading) ? 0.6 : 1 }}
                  disabled={!file || loading}
                  onClick={handleUpload}
                >
                  {loading ? "กำลังประมวลผล…" : (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ChevronRight size={16} /> อัพโหลด
                    </span>
                  )}
                </button>
              </div>
            </>
          )}

          {result && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              {result.ok ? (
                <>
                  <CheckCircle size={48} color="#2e7d32" style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#2e7d32", marginBottom: 8 }}>อัพโหลดสำเร็จ</div>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                    ประมวลผลแล้ว: <strong>{result.processed}</strong> รายการ |
                    ข้ามไป: <strong>{result.skipped}</strong> รายการ
                  </div>
                  
                  {result.warnings && result.warnings.length > 0 && (
                    <div style={{ textAlign: "left", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: "#f57f17" }}>⚠️ คำเตือน ({result.warnings.length})</div>
                      {result.warnings.map((w, i) => <div key={i} style={{ color: "#555", marginBottom: 3 }}>• {w}</div>)}
                    </div>
                  )}
                  <button style={{ ...BTN_PRIMARY, marginTop: 16 }} onClick={() => { onSaved(); onClose(); }}>ปิด</button>
                </>
              ) : (
                <>
                  <AlertTriangle size={48} color="#c62828" style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#c62828", marginBottom: 8 }}>อัพโหลดไม่สำเร็จ</div>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>{result.message}</div>
                  <button style={BTN_SECONDARY} onClick={() => setResult(null)}>ลองใหม่</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
