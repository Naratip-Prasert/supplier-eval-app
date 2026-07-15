// ============================================================
//  pages/UploadHistoryPage.jsx  —  Log of Excel/CSV uploads,
//  split out from TasksPage since it's a read-only history view,
//  not part of running evaluation tasks.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import { ArrowLeft, RefreshCw, AlertCircle, Search, ArrowDownUp, CalendarRange, X } from "lucide-react";
import { PaginationBar } from "../components/PaginationBar";

const PAGE_SIZE = 10;
const SORT_LABEL = { asc: "อัพโหลดเก่าสุดก่อน", desc: "อัพโหลดล่าสุดก่อน" };

export default function UploadHistoryPage({ onBack }) {
  const [batches,  setBatches]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [sortDir,  setSortDir]  = useState("desc");
  const [page,     setPage]     = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/batches");
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, sortDir]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo ? new Date(dateTo + "T23:59:59") : null;
    const q = search.trim().toLowerCase();
    const list = batches.filter(b => {
      const created = new Date(b.createdAt);
      const matchDate = (!from || created >= from) && (!to || created <= to);
      const matchSearch = !q
        || b.filename?.toLowerCase().includes(q)
        || b.batchType?.toLowerCase().includes(q)
        || b.uploadedBy?.toLowerCase().includes(q);
      return matchDate && matchSearch;
    });
    return [...list].sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sortDir === "asc" ? da - db : db - da;
    });
  }, [batches, search, dateFrom, dateTo, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function clearDateFilter() { setDateFrom(""); setDateTo(""); }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f0", fontFamily: "Sarabun, sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 48px" }}>

        {/* ── Breadcrumb bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              color: "#1b5e20", fontSize: 14, fontWeight: 700,
              fontFamily: "Sarabun, sans-serif", padding: 0,
            }}
          >
            <ArrowLeft size={16} /> งานประเมิน
          </button>
          <span style={{ color: "#ccc" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>ประวัติการอัพโหลด</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {loading && <span style={{ fontSize: 12, color: "#aaa" }}>กำลังโหลด…</span>}
            <button
              onClick={fetchAll}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer", fontSize: 12,
                color: "#555", fontFamily: "Sarabun, sans-serif",
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              รีเฟรช
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 10,
            padding: "12px 16px", marginBottom: 20, display: "flex", gap: 8,
            alignItems: "center", color: "#b71c1c", fontSize: 13,
          }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อไฟล์ / ประเภท / ผู้อัพโหลด…"
              style={{ width: "100%", paddingLeft: 32, padding: "8px 10px 8px 32px", border: "1px solid #e0e0e0", borderRadius: 7, fontFamily: "Sarabun, sans-serif", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            title="สลับการเรียงลำดับ"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", color: "#555", fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer" }}
          >
            <ArrowDownUp size={13} /> {SORT_LABEL[sortDir]}
          </button>
        </div>

        {/* Date range filter (by upload date) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#666", fontWeight: 600 }}>
            <CalendarRange size={14} /> ช่วงวันที่อัพโหลด:
          </span>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
          />
          <span style={{ fontSize: 12, color: "#aaa" }}>ถึง</span>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
          />
          {(dateFrom || dateTo) && (
            <button onClick={clearDateFilter} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "#666", fontFamily: "Sarabun, sans-serif" }}>
              <X size={11} /> ล้างวันที่
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>แสดง {filtered.length} จาก {batches.length} รายการ</div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>ไม่มีรายการ</div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["ไฟล์","ประเภท","จำนวน","สถานะ","ผู้อัพโหลด","วันที่"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(b => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "10px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.filename}</td>
                    <td style={{ padding: "10px 12px" }}>{b.batchType}</td>
                    <td style={{ padding: "10px 12px" }}>{b.rowCount}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: b.status === "done" ? "#e8f5e9" : b.status === "error" ? "#ffebee" : "#fff8e1", color: b.status === "done" ? "#2e7d32" : b.status === "error" ? "#c62828" : "#f57f17", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{b.status}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{b.uploadedBy || "-"}</td>
                    <td style={{ padding: "10px 12px", color: "#888" }}>{new Date(b.createdAt).toLocaleDateString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <PaginationBar
            page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
