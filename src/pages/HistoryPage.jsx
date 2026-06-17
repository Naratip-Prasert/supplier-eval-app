// ============================================================
//  pages/HistoryPage.jsx
// ============================================================

import { useState, useEffect } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import { ClipboardList, Loader2, AlertCircle, ChevronRight } from "lucide-react";

const GRADE_COLOR = {
  A: { bg: "#e8f5e9", border: "#a5d6a7", text: "#1b5e20", badge: "#1b5e20" },
  B: { bg: "#e3f2fd", border: "#90caf9", text: "#1565c0", badge: "#1565c0" },
  C: { bg: "#fff3e0", border: "#ffcc80", text: "#e65100", badge: "#e65100" },
  D: { bg: "#ffebee", border: "#ef9a9a", text: "#b71c1c", badge: "#b71c1c" },
  F: { bg: "#fce4ec", border: "#f48fb1", text: "#880e4f", badge: "#880e4f" },
};

const EVAL_LABEL = {
  new_supplier: "pre-Evaluation",
  post_eval:    "post-Evaluation",
};

const PRODUCT_LABEL = {
  goods:    "สินค้า",
  services: "บริการ",
  both:     "สินค้าและบริการ",
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function HistoryPage({ authUser, onBack }) {
  const [records, setRecords] = useState([]);
  const [status,  setStatus]  = useState("loading");

  useEffect(() => {
    authFetch("/api/evaluations/my")
      .then((r) => r.json())
      .then((data) => {
        setRecords(Array.isArray(data) ? data : []);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "Sarabun, sans-serif" }}>
      <Header
        titleOverride="ประวัติการประเมิน"
        backLabel="← กลับหน้าหลัก"
        onBack={onBack}
      />

      <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 20px" }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <ClipboardList size={20} style={{ color: "#1a6b1a" }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
            ประวัติการประเมินของฉัน
          </h2>
          {status === "ok" && (
            <span style={{
              marginLeft: "auto", background: "#e8f5e9", color: "#1a6b1a",
              borderRadius: 20, padding: "2px 12px", fontSize: 12, fontWeight: 700,
            }}>
              {records.length} รายการ
            </span>
          )}
        </div>

        {/* Loading */}
        {status === "loading" && (
          <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
            <div style={{ fontSize: 14 }}>กำลังโหลด...</div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff5f5", border: "1px solid #ffd0d0",
            borderRadius: 10, padding: "16px 20px", color: "#c62828", fontSize: 14,
          }}>
            <AlertCircle size={18} />
            เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่
          </div>
        )}

        {/* Empty */}
        {status === "ok" && records.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "#fff", borderRadius: 12, border: "1.5px dashed #ddd",
          }}>
            <ClipboardList size={40} style={{ color: "#ccc", marginBottom: 12 }} />
            <div style={{ fontSize: 15, color: "#aaa" }}>ยังไม่มีประวัติการประเมิน</div>
          </div>
        )}

        {/* Records */}
        {status === "ok" && records.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {records.map((r) => {
              const gc = GRADE_COLOR[r.grade] ?? GRADE_COLOR.F;
              const score = r.totalScore != null ? Number(r.totalScore).toFixed(2) : "—";
              return (
                <div
                  key={r.evalId}
                  style={{
                    background: "#fff",
                    border: `1.5px solid ${gc.border}`,
                    borderLeft: `5px solid ${gc.badge}`,
                    borderRadius: 10,
                    padding: "16px 20px",
                    display: "flex", alignItems: "center", gap: 16,
                    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Grade badge */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 10,
                    background: gc.bg, border: `2px solid ${gc.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 800, color: gc.badge,
                    flexShrink: 0,
                  }}>
                    {r.grade ?? "—"}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", marginBottom: 3 }}>
                      {r.supplierName}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                      <span style={{ fontFamily: "monospace" }}>{r.vendorCode}</span>
                      <span>·</span>
                      <span>{EVAL_LABEL[r.evalType] ?? r.evalType}</span>
                      <span>·</span>
                      <span>{r.period}</span>
                      {r.productType && (
                        <>
                          <span>·</span>
                          <span>{PRODUCT_LABEL[r.productType] ?? r.productType}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Score + date */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: gc.badge, lineHeight: 1 }}>
                      {score}
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>คะแนน</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                      {formatDate(r.submittedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
