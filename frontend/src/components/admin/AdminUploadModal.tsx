"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { Upload, X, FileSpreadsheet, Calendar, CheckCircle, AlertTriangle, ChevronRight, Download } from "lucide-react";
import { authFetch } from "@/utils/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, matches the UI's stated limit
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

const OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, fontFamily: "Sarabun, sans-serif",
};
const MODAL: CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 800,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
  margin: 16,
};
const CARD = (active: boolean): CSSProperties => ({
  border: `2px solid ${active ? "#1b5e20" : "#e0e0e0"}`,
  borderRadius: 10, padding: "18px 20px", cursor: "pointer",
  background: active ? "#f1f8e9" : "#fff",
  transition: "all 0.15s",
  flex: 1,
});
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
  pre_eval?: number;
  post_eval?: number;
  warnings?: string[];
}

interface ValidateResultRow {
  vendorCode: string;
  taxId: string;
  supplierName: string;
  buyerEmail: string;
  evalEmail: string;
  isValid: boolean;
  errors: string[];
}

export default function AdminUploadModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"pre_post" | "periodic" | null>(null);
  const [periodicType, setPeriodicType] = useState("half_year");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[][] | null>(null);
  const [validateResult, setValidateResult] = useState<{ rows: ValidateResultRow[], canUpload: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Reset file if periodicType changes, so they have to re-validate
    setFile(null);
    setPreview(null);
    setValidateResult(null);
    setFileError(null);
  }, [periodicType, mode]);

  function handleFileSelect(f: File | null | undefined) {
    if (!f) return;
    setResult(null);
    setPreview(null);
    setValidateResult(null);

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

    if (mode === "periodic") {
      setValidating(true);
      const fd = new FormData();
      fd.append("file", f);
      fd.append("evalType", periodicType);

      authFetch("/api/admin/upload/validate-periodic", { method: "POST", body: fd })
        .then(res => res.json())
        .then(data => {
          if (!mountedRef.current) return;
          if (data.error || (data.message && !data.rows)) {
            setFileError(data.message || "ตรวจสอบไฟล์ไม่สำเร็จ");
            setFile(null);
          } else {
            setValidateResult(data);
          }
        })
        .catch(e => {
          if (!mountedRef.current) return;
          setFileError("ตรวจสอบไฟล์ไม่สำเร็จ: " + e.message);
          setFile(null);
        })
        .finally(() => {
          if (mountedRef.current) setValidating(false);
        });
      return;
    }

    if (mode === "pre_post") {
      setValidating(true);
      const fd = new FormData();
      fd.append("file", f);
      authFetch("/api/admin/upload/validate-pre-post", { method: "POST", body: fd })
        .then(async (res) => {
          const data = await res.json();
          if (!mountedRef.current) return;
          if (res.ok) {
            setValidateResult({ rows: data.rows || [], canUpload: data.canUpload });
            if (!data.canUpload) {
              setFileError("พบข้อผิดพลาดในบางแถว (ดูรายละเอียดด้านล่าง)");
              // don't clear file, let user see table
            }
          } else {
            setFileError(data.message || "ตรวจสอบไฟล์ไม่สำเร็จ");
            setFile(null);
          }
        })
        .catch(e => {
          if (!mountedRef.current) return;
          setFileError("ตรวจสอบไฟล์ไม่สำเร็จ: " + e.message);
          setFile(null);
        })
        .finally(() => {
          if (mountedRef.current) setValidating(false);
        });
      return;
    }
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const url = mode === "pre_post"
        ? "/api/admin/upload/pre-post"
        : `/api/admin/upload/periodic`;
      if (mode === "periodic") fd.append("evalType", periodicType);

      const res = await authFetch(url, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      if (mountedRef.current) setResult({ ok: true, ...data });
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
        "Buyer Name", "Buyer Email", "Evaluator Name", "Evaluator Email", "Evaluator Employee No"
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      XLSX.writeFile(wb, "Supplier_Eval_Template.xlsx");
    } catch (e) {
      console.error(e);
    }
  }

  const thStyle: CSSProperties = { padding: "4px 8px", background: "#e8f5e9", border: "1px solid #ddd", whiteSpace: "nowrap" };
  const tdStyle: CSSProperties = { padding: "3px 8px", border: "1px solid #eee", whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" };

  return (
    <div style={OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        <div style={{ background: "#1b5e20", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>จัดการงานประเมิน</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {!result && (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#555" }}>เลือกประเภทการจัดการประเมิน</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={CARD(mode === "pre_post")} onClick={() => setMode("pre_post")}>
                  <FileSpreadsheet size={28} color="#1b5e20" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Pre / Post Evaluation</div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                    Supplier ใหม่ (Pre) หรือหลัง PTA 90 วัน (Post)<br />Job Value &gt; 1,000,000 บาท
                  </div>
                </div>
                <div style={CARD(mode === "periodic")} onClick={() => setMode("periodic")}>
                  <Calendar size={28} color="#1565c0" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Half-Year / Yearly</div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                    การประเมินรายครึ่งปี (มิถุนายน)<br />หรือรายปี (ธันวาคม)
                  </div>
                </div>
              </div>

              {mode === "periodic" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {[{ v: "half_year", label: "Half-Year (มิถุนายน)" }, { v: "yearly", label: "Yearly (ธันวาคม)" }].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setPeriodicType(opt.v)}
                      style={{
                        padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                        border: periodicType === opt.v ? "2px solid #1565c0" : "1px solid #ddd",
                        background: periodicType === opt.v ? "#e3f2fd" : "#fff",
                        color: periodicType === opt.v ? "#1565c0" : "#555", fontFamily: "Sarabun, sans-serif",
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              )}

              {mode && (
                <>
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

                  {validating && <div style={{ marginBottom: 16, color: "#555", fontSize: 13, textAlign: "center" }}>กำลังตรวจสอบไฟล์...</div>}

                  {validateResult && validateResult.rows.length > 0 && (
                    <div style={{ marginBottom: 16, overflow: "auto", maxHeight: 200 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: validateResult.canUpload ? "#2e7d32" : "#c62828", marginBottom: 6 }}>
                        ผลการตรวจสอบ ({validateResult.canUpload ? "✅ พร้อมอัพโหลด" : "❌ พบข้อผิดพลาด กรุณาแก้ไขไฟล์แล้วอัพโหลดใหม่"})
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr>
                            <th style={thStyle}>Vendor Code</th>
                            <th style={thStyle}>Supplier Name</th>
                            <th style={thStyle}>TAX ID</th>
                            <th style={thStyle}>Buyer</th>
                            <th style={thStyle}>Evaluator</th>
                            <th style={thStyle}>สถานะ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validateResult.rows.map((r, i) => (
                            <tr key={i} style={{ background: r.isValid ? "#fff" : "#ffebee" }}>
                              <td style={tdStyle}>{r.vendorCode}</td>
                              <td style={tdStyle}>{r.supplierName}</td>
                              <td style={tdStyle}>{r.taxId}</td>
                              <td style={tdStyle}>{r.buyerEmail}</td>
                              <td style={tdStyle}>{r.evalEmail}</td>
                              <td style={{ ...tdStyle, color: r.isValid ? "#2e7d32" : "#c62828", whiteSpace: "normal", minWidth: 200 }}>
                                {r.isValid ? "ผ่าน" : r.errors.map((err, i) => <div key={i}>• {err}</div>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                </>
              )}
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
                  {result.pre_eval != null && (
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                      Pre-eval: <strong>{result.pre_eval}</strong> | Post-eval: <strong>{result.post_eval}</strong>
                    </div>
                  )}
                  {result.warnings && result.warnings.length > 0 && (
                    <div style={{ textAlign: "left", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: "#f57f17" }}>⚠️ คำเตือน ({result.warnings.length})</div>
                      {result.warnings.map((w, i) => <div key={i} style={{ color: "#555", marginBottom: 3 }}>• {w}</div>)}
                    </div>
                  )}
                  <button style={{ ...BTN_PRIMARY, marginTop: 16 }} onClick={onClose}>ปิด</button>
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

        {!result && mode && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fafafa", flexShrink: 0 }}>
            <button style={BTN_SECONDARY} onClick={onClose}>ยกเลิก</button>
            <button
              style={{
                ...BTN_PRIMARY,
                opacity: (!file || loading || validating || (!validateResult || !validateResult.canUpload)) ? 0.6 : 1
              }}
              disabled={!file || loading || validating || (!validateResult || !validateResult.canUpload)}
              onClick={handleUpload}
            >
              {loading ? "กำลังประมวลผล…" : (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronRight size={16} /> อัพโหลดและสร้างงานประเมิน
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
