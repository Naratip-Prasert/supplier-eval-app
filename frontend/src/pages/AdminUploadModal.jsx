import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { Upload, X, FileSpreadsheet, Calendar, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { authFetch } from "../utils/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, matches the UI's stated limit
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

const OVERLAY = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, fontFamily: "Sarabun, sans-serif",
};
const MODAL = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
  margin: 16,
};
const CARD = (active) => ({
  border: `2px solid ${active ? "#1b5e20" : "#e0e0e0"}`,
  borderRadius: 10, padding: "18px 20px", cursor: "pointer",
  background: active ? "#f1f8e9" : "#fff",
  transition: "all 0.15s",
  flex: 1,
});
const BTN_PRIMARY = {
  background: "#1b5e20", color: "#fff", border: "none",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const BTN_SECONDARY = {
  background: "#f5f5f5", color: "#333", border: "1px solid #ddd",
  borderRadius: 8, padding: "10px 24px", fontFamily: "Sarabun, sans-serif",
  fontSize: 14, cursor: "pointer",
};

export default function AdminUploadModal({ onClose }) {
  const [mode,       setMode]       = useState(null); // 'pre_post' | 'periodic'
  const [periodicType, setPeriodicType] = useState("half_year");
  const [file,       setFile]       = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [fileError,  setFileError]  = useState(null);
  const fileRef = useRef();

  // กัน setState หลัง component unmount (เช่นปิด modal ระหว่าง upload ยังไม่เสร็จ)
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  function handleFileSelect(f) {
    if (!f) return;
    setResult(null);
    setPreview(null);

    // Drag-and-drop bypasses the <input accept> filter entirely, so both
    // checks need to happen here too, not just rely on the file picker.
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
    // Preview: read first 5 rows
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        setPreview(rows.slice(0, 6));
      } catch { setPreview(null); }
    };
    // ไฟล์อ่านไม่ได้จริงๆ (เสีย/สิทธิ์ถูกปฏิเสธ ฯลฯ) ต้องบอก error ให้เห็น
    // ไม่งั้น modal จะค้างไม่มี preview แล้วก็ไม่มีข้อความอะไรบอกว่าทำไม
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
      const url = mode === "pre_post"
        ? "/api/admin/upload/pre-post"
        : `/api/admin/upload/periodic`;
      if (mode === "periodic") fd.append("evalType", periodicType);

      const res  = await authFetch(url, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      if (mountedRef.current) setResult({ ok: true, ...data });
    } catch (e) {
      if (mountedRef.current) setResult({ ok: false, message: e.message });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        {/* Header */}
        <div style={{ background: "#1b5e20", borderRadius: "14px 14px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>จัดการงานประเมิน</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Step 1: Choose mode */}
          {!result && (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#555" }}>เลือกประเภทการจัดการประเมิน</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={CARD(mode === "pre_post")} onClick={() => { setMode("pre_post"); setFile(null); setPreview(null); setFileError(null); }}>
                  <FileSpreadsheet size={28} color="#1b5e20" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Pre / Post Evaluation</div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                    Supplier ใหม่ (Pre) หรือหลัง PTA 90 วัน (Post)<br />Job Value &gt; 1,000,000 บาท
                  </div>
                </div>
                <div style={CARD(mode === "periodic")} onClick={() => { setMode("periodic"); setFile(null); setPreview(null); setFileError(null); }}>
                  <Calendar size={28} color="#1565c0" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Half-Year / Yearly</div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                    การประเมินรายครึ่งปี (มิถุนายน)<br />หรือรายปี (ธันวาคม)
                  </div>
                </div>
              </div>

              {/* Periodic sub-type */}
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

              {/* File upload area */}
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
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                      onChange={(e) => handleFileSelect(e.target.files[0])} />
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

                  {/* Preview table */}
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
                          <ChevronRight size={16} /> อัพโหลดและสร้างงานประเมิน
                        </span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Result */}
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
                  {result.warnings?.length > 0 && (
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
      </div>
    </div>
  );
}
