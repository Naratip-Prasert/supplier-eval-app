"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { Upload, X, FileSpreadsheet, Calendar, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { authFetch } from "@/utils/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, matches the UI's stated limit
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

const OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, fontFamily: "Sarabun, sans-serif",
};
const MODAL: CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 840,
  maxHeight: "90vh", display: "flex", flexDirection: "column",
  boxShadow: "0 8px 40px rgba(0,0,0,0.18)", margin: 16, overflow: "hidden"
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

export default function AdminUploadModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"pre_post" | "periodic" | null>(null);
  const [periodicType, setPeriodicType] = useState("half_year");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [analysis, setAnalysis] = useState<any[] | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, number>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // กัน setState หลัง component unmount (เช่นปิด modal ระหว่าง upload ยังไม่เสร็จ)
  // Reset to true on mount (not just declare it via useRef's initial value)
  // — React 18 StrictMode double-invokes effects in dev (mount → cleanup →
  // mount again), so the cleanup below fires once "for free" right after
  // the first mount. Without this line, mountedRef.current is permanently
  // false from that point on even though the component is genuinely
  // mounted, silently skipping every setResult/setLoading call forever.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function handleFileSelect(f: File | null | undefined) {
    if (!f) return;
    setResult(null);
    setPreview(null);
    setConflicts(null);
    setAnalysis(null);
    setResolutions({});
    setOpenDropdown(null);

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

    if (mode === "pre_post") {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("analyzeOnly", "true");
      setLoading(true);
      authFetch("/api/admin/upload/pre-post", { method: "POST", body: fd })
        .then(async res => {
          const data = await res.json();
          if (mountedRef.current) {
            setLoading(false);
            if (data.analysis) setAnalysis(data.analysis);
            if (res.status === 409 && data.conflicts) {
              setConflicts(data.conflicts);
            }
          }
        })
        .catch(() => {
          if (mountedRef.current) setLoading(false);
        });
      return;
    }

    // Preview: read first 5 rows — xlsx is dynamically imported here (not at
    // module top level) so its ~1MB bundle only loads once a file is
    // actually picked, not on every page that happens to render this modal.
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
      if (conflicts) fd.append("resolutions", JSON.stringify(resolutions));

      const url = mode === "pre_post"
        ? "/api/admin/upload/pre-post"
        : `/api/admin/upload/periodic`;
      if (mode === "periodic") fd.append("evalType", periodicType);

      const res = await authFetch(url, { method: "POST", body: fd });
      const data = await res.json();

      if (res.status === 409) {
        setConflicts(data.conflicts);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(data.message || "Upload failed");
      if (mountedRef.current) setResult({ ok: true, ...data });
    } catch (e) {
      if (mountedRef.current) setResult({ ok: false, message: (e as Error).message });
    } finally {
      if (mountedRef.current && !conflicts) setLoading(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        <div style={{ background: "#1b5e20", borderRadius: "14px 14px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>จัดการงานประเมิน</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto" }}>
          {!result && (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#555" }}>เลือกประเภทการจัดการประเมิน</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={CARD(mode === "pre_post")} onClick={() => { setMode("pre_post"); setFile(null); setPreview(null); setFileError(null); setConflicts(null); }}>
                  <FileSpreadsheet size={28} color="#1b5e20" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Pre / Post Evaluation</div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                    Supplier ใหม่ (Pre) หรือหลัง PTA 90 วัน (Post)<br />Job Value &gt; 1,000,000 บาท
                  </div>
                </div>
                <div style={CARD(mode === "periodic")} onClick={() => { setMode("periodic"); setFile(null); setPreview(null); setFileError(null); setConflicts(null); }}>
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

                  {/* Analysis table */}
                  {analysis && (
                    <div style={{ marginBottom: 16, overflowX: "auto" }}>
                      <div style={{ fontSize: 13, color: "#444", marginBottom: 8, fontWeight: 700 }}>ผลการตรวจสอบข้อมูล ({analysis.length} รายการ)</div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "center" }}>แถว</th>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "left" }}>ชื่อซัพพลายเออร์ (Tax ID)</th>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "right" }}>มูลค่า (บาท)</th>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "center" }}>PTA Date</th>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "left" }}>ผู้ซื้อ / ผู้ประเมิน</th>
                            <th style={{ padding: "6px 10px", background: "#f5f5f5", border: "1px solid #ddd", whiteSpace: "nowrap", textAlign: "center" }}>การจัดการ (Action)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.map((a, i) => {
                            let actionColor = "#555";
                            let actionText = a.action;
                            let actionBg = "transparent";

                            if (a.action === 'CREATE_PRE_EVAL') { actionColor = "#1b5e20"; actionBg = "#e8f5e9"; actionText = "สร้างใหม่ (Pre-eval)"; }
                            else if (a.action === 'CREATE_POST_EVAL') { actionColor = "#1b5e20"; actionBg = "#e8f5e9"; actionText = "สร้างใหม่ (Post-eval)"; }
                            else if (a.action === 'UPDATE_POST_EVAL') { actionColor = "#0d47a1"; actionBg = "#e3f2fd"; actionText = "อัปเดต (Post-eval)"; }
                            else if (a.action === 'CONFLICT') { actionColor = "#b71c1c"; actionBg = "#ffebee"; actionText = "กำกวม (รอเลือกจับคู่)"; }
                            else if (a.action === 'SKIP_TASK_LOW_VALUE') { actionText = "ข้าม (ยอด < 1M)"; }
                            else if (a.action === 'SKIP_EXISTING_OPEN') { actionText = "ข้าม (มีรอบที่ค้างอยู่)"; }
                            else if (a.action === 'SKIP_NO_DATA') { actionText = "ข้าม (แถวว่าง)"; }

                            const rowData = a.row || {};

                            return (
                              <tr key={i}>
                                <td style={{ padding: "6px 10px", border: "1px solid #eee", textAlign: "center" }}>{a.rowIdx}</td>
                                <td style={{ padding: "6px 10px", border: "1px solid #eee", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  <div style={{ fontWeight: 600 }}>{rowData.supplierName || "—"}</div>
                                  <div style={{ fontSize: 10, color: "#888" }}>{rowData.taxId || "—"}</div>
                                </td>
                                <td style={{ padding: "6px 10px", border: "1px solid #eee", textAlign: "right" }}>
                                  {rowData.jobValue ? Number(rowData.jobValue).toLocaleString() : "—"}
                                </td>
                                <td style={{ padding: "6px 10px", border: "1px solid #eee", textAlign: "center" }}>
                                  {rowData.ptaDate ? new Date(rowData.ptaDate).toLocaleDateString("th-TH") : "—"}
                                </td>
                                <td style={{ padding: "6px 10px", border: "1px solid #eee", maxWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  <div style={{ fontSize: 10.5, color: "#555" }} title={rowData.buyerEmail}>B: {rowData.buyerEmail || "—"}</div>
                                  <div style={{ fontSize: 10.5, color: "#555" }} title={rowData.evalEmail}>E: {rowData.evalEmail || "—"}</div>
                                </td>
                                <td style={{ padding: "4px 10px", border: "1px solid #eee", textAlign: "center" }}>
                                  {a.action === 'CONFLICT' ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                                      <span style={{ background: actionBg, color: actionColor, padding: "2px 8px", borderRadius: 12, fontWeight: 600, display: "inline-block", fontSize: 10 }}>{actionText}</span>
                                      <div style={{ position: "relative", width: "100%", maxWidth: 220 }}>
                                        <div 
                                          onClick={() => setOpenDropdown(openDropdown === String(a.rowIdx) ? null : String(a.rowIdx))}
                                          style={{
                                            padding: "6px 10px", borderRadius: 6, 
                                            border: resolutions[a.rowIdx] ? "1px solid #2e7d32" : "1px solid #d32f2f",
                                            background: resolutions[a.rowIdx] ? "#e8f5e9" : "#fff",
                                            color: resolutions[a.rowIdx] ? "#1b5e20" : "#c62828",
                                            fontSize: 11.5, fontWeight: resolutions[a.rowIdx] ? 600 : 500,
                                            cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)", transition: "all 0.2s"
                                          }}
                                        >
                                          {resolutions[a.rowIdx] ? (
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                              {a.matches?.find((m: any) => m.id === resolutions[a.rowIdx])?.jobValue ? Number(a.matches?.find((m: any) => m.id === resolutions[a.rowIdx])?.jobValue).toLocaleString() : "-"} บ.
                                            </span>
                                          ) : (
                                            <span>-- เลือกจับคู่งาน ({a.matches?.length || 0}) --</span>
                                          )}
                                          <span style={{ fontSize: 10 }}>▼</span>
                                        </div>
                                        
                                        {openDropdown === String(a.rowIdx) && (
                                          <div style={{ 
                                            position: "absolute", top: "100%", right: 0, marginTop: 4,
                                            background: "#fff", border: "1px solid #ccc", borderRadius: 8,
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100,
                                            minWidth: 260, overflow: "hidden", textAlign: "left"
                                          }}>
                                            {a.matches?.map((m: any, idx: number) => (
                                              <div 
                                                key={m.id} 
                                                onClick={() => {
                                                  setResolutions(prev => ({ ...prev, [a.rowIdx]: m.id }));
                                                  setOpenDropdown(null);
                                                }}
                                                style={{ 
                                                  padding: "10px 12px", borderBottom: idx < a.matches.length - 1 ? "1px solid #eee" : "none",
                                                  background: resolutions[a.rowIdx] === m.id ? "#f1f8e9" : "#fff",
                                                  cursor: "pointer"
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = resolutions[a.rowIdx] === m.id ? "#f1f8e9" : "#fff")}
                                              >
                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 2 }}>มูลค่า: {m.jobValue ? Number(m.jobValue).toLocaleString() : "-"} บาท</div>
                                                <div style={{ fontSize: 11, color: "#666" }}>PTA: {m.ptaDate ? new Date(m.ptaDate).toLocaleDateString("th-TH") : "-"}</div>
                                                <div style={{ fontSize: 11, color: "#888" }}>Buyer: {m.buyerEmail || "-"}</div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ background: actionBg, color: actionColor, padding: "2px 8px", borderRadius: 12, fontWeight: 600, display: "inline-block" }}>{actionText}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Preview table (Fallback for periodic) */}
                  {!analysis && preview && preview.length > 1 && (
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
                      disabled={!file || loading || (conflicts ? Object.keys(resolutions).length !== conflicts.length : false)}
                      onClick={handleUpload}
                    >
                      {loading ? "กำลังประมวลผล…" : conflicts ? "ยืนยันการจับคู่และอัปโหลด" : (
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
      </div>
    </div>
  );
}
