// ============================================================
//  pages/HistoryPage.jsx
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { Header } from "../components";
import { authFetch } from "../utils/api";
import {
  ClipboardList, Loader2, AlertCircle, ChevronRight,
  Search, SlidersHorizontal, X, TrendingUp,
} from "lucide-react";

const GRADE_COLOR = {
  A: { bg: "#dcfce7", text: "#166534", bar: "#16a34a" },
  B: { bg: "#dbeafe", text: "#1e40af", bar: "#2563eb" },
  C: { bg: "#fef9c3", text: "#854d0e", bar: "#ca8a04" },
  D: { bg: "#fee2e2", text: "#991b1b", bar: "#dc2626" },
  F: { bg: "#fce7f3", text: "#831843", bar: "#db2777" },
};

const EVAL_LABEL = { pre_eval: "Pre", post_eval: "Post", half_year: "Half-Year", yearly: "Yearly" };
const PRODUCT_LABEL = { goods: "สินค้า", services: "บริการ", both: "สินค้า+บริการ" };

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

// Date-only, no time — used for the dedicated "วันที่" column/badge. Don't
// derive this from formatDate() via .split(" ")[0]: Thai month abbreviations
// have a trailing dot but no embedded space issue, the date+time STRING
// itself has multiple space-separated parts (day / month / year / time),
// so splitting on " " silently truncates to just the day number.
function formatDateOnly(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Pill filter button ────────────────────────────────────────
function Pill({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 20, border: "none",
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: "Sarabun, sans-serif",
        background: active ? (color || "#111827") : "#f3f4f6",
        color: active ? "#fff" : "#6b7280",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, color, total }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: "1px solid #f0f0f0",
      padding: "12px 16px", minWidth: 0,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 800, color, flexShrink: 0 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 99 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export default function HistoryPage({ authUser, onBack, onViewDetail }) {
  const [records, setRecords] = useState([]);
  const [status,  setStatus]  = useState("loading");
  const [search,  setSearch]  = useState("");
  const [filterEval,  setFilterEval]  = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterRole,  setFilterRole]  = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [showFilter,  setShowFilter]  = useState(false);

  const isAdmin  = authUser?.role === "ADMIN";
  const endpoint = isAdmin ? "/api/evaluations/all" : "/api/evaluations/my";

  useEffect(() => {
    authFetch(endpoint)
      .then(r => r.json())
      .then(data => { setRecords(Array.isArray(data) ? data : []); setStatus("ok"); })
      .catch(() => setStatus("error"));
  }, [endpoint]);

  // ── Filter + search ───────────────────────────────────────
  const filtered = useMemo(() => {
    return records.filter(r => {
      if (filterEval   !== "all" && r.evalType !== filterEval)  return false;
      if (filterGrade  !== "all" && r.grade    !== filterGrade) return false;
      if (filterRole   !== "all" && r.role     !== filterRole)  return false;
      if (filterPeriod !== "all" && r.period   !== filterPeriod) return false;
      if (r.submittedAt) {
        const submitted = new Date(r.submittedAt);
        if (dateFrom && submitted < new Date(`${dateFrom}T00:00:00`)) return false;
        if (dateTo   && submitted > new Date(`${dateTo}T23:59:59.999`)) return false;
      } else if (dateFrom || dateTo) {
        return false; // no submission date to compare — exclude when a date filter is active
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [r.supplierName, r.vendorCode, r.evaluatorName, r.period].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, filterEval, filterGrade, filterRole, filterPeriod, dateFrom, dateTo]);

  // ── Stats ─────────────────────────────────────────────────
  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    records.forEach(r => { if (r.grade in counts) counts[r.grade]++; });
    return counts;
  }, [records]);

  const hasFilter = filterEval !== "all" || filterGrade !== "all" || filterRole !== "all" || filterPeriod !== "all" || !!dateFrom || !!dateTo || search.trim();

  const clearFilters = () => {
    setSearch(""); setFilterEval("all"); setFilterGrade("all"); setFilterRole("all"); setFilterPeriod("all");
    setDateFrom(""); setDateTo("");
  };

  const handleEvalFilter = (v) => {
    setFilterEval(v);
    setFilterPeriod("all"); // reset period when switching eval type
  };

  const themeColor = "#15803d";

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Sarabun, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .hist-row:hover { background: #f8fafc !important; }
      `}</style>

      {/* ── Header ── */}
      <Header
        titleOverride={isAdmin ? "ประวัติการประเมินทั้งหมด" : "ประวัติการประเมินของฉัน"}
        backLabel="← กลับหน้าหลัก"
        onBack={onBack}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 48px" }}>

        {/* ── Stats row ── */}
        {status === "ok" && records.length > 0 && (
          <>
            {/* Plain repeat(5,1fr) doesn't actually let tracks shrink below
                each card's min-content width (padding + "Grade A" label +
                value) — on a phone, 5× that minimum exceeds the viewport
                and the last card(s) overflow off-screen. minmax(0,1fr)
                lets tracks shrink properly; also drop to 3 cols on very
                narrow screens since 5 columns get cramped either way. */}
            <style>{`
              .hist-stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
              @media (max-width: 480px) {
                .hist-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
              }
            `}</style>
            <div className="hist-stats" style={{ display: "grid", gap: 10, marginBottom: 20, animation: "fadeUp 0.3s ease" }}>
              {(["A","B","C","D","F"]).map(g => (
                <StatCard
                  key={g}
                  label={`Grade ${g}`}
                  value={gradeCounts[g]}
                  color={GRADE_COLOR[g]?.bar}
                  total={records.length}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Search + Filter bar ── */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 16,
          overflow: "hidden",
        }}>
          {/* Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <Search size={16} style={{ color: "#9ca3af", flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา supplier, vendor code, รอบ..."
              style={{
                flex: 1, border: "none", outline: "none", fontSize: 13,
                fontFamily: "Sarabun, sans-serif", color: "#111827", background: "transparent",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={15} style={{ color: "#9ca3af" }} />
              </button>
            )}
            <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
            <button
              onClick={() => setShowFilter(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
                background: showFilter ? "#f0fdf4" : "none",
                border: `1px solid ${showFilter ? themeColor : "#e5e7eb"}`,
                borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, color: showFilter ? themeColor : "#6b7280",
                fontFamily: "Sarabun, sans-serif", transition: "all 0.15s",
              }}
            >
              <SlidersHorizontal size={13} />
              ตัวกรอง
              {hasFilter && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: themeColor, display: "inline-block",
                }} />
              )}
            </button>
            {status === "ok" && (
              <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                {filtered.length}/{records.length}
              </span>
            )}
          </div>

          {/* Filter panel */}
          {showFilter && (
            <div style={{ borderTop: "1px solid #f3f4f6", padding: "12px 16px", background: "#fafafa" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>

                {/* Eval type */}
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>ประเภท</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["all","ทั้งหมด"],["pre_eval","Pre"],["post_eval","Post"],["half_year","Half-Year"],["yearly","Yearly"]].map(([v,l]) => (
                      <Pill key={v} active={filterEval===v} onClick={()=>handleEvalFilter(v)} color={themeColor}>{l}</Pill>
                    ))}
                  </div>
                </div>

                {/* Period — show only when Post is selected */}
                {filterEval === "post_eval" && (
                  <div>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>รอบประเมิน</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[
                        ["all",         "ทั้งหมด"],
                        ["Monthly / รายเดือน",      "รายเดือน"],
                        ["Quarterly / รายไตรมาส",   "รายไตรมาส"],
                        ["Semi-Annual / 6 เดือน",   "6 เดือน"],
                        ["Annual / รายปี",           "รายปี"],
                      ].map(([v,l]) => (
                        <Pill key={v} active={filterPeriod===v} onClick={()=>setFilterPeriod(v)} color={themeColor}>{l}</Pill>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grade */}
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>เกรด</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["all","ทั้งหมด"],["A","A"],["B","B"],["C","C"],["D","D"],["F","F"]].map(([v,l]) => (
                      <Pill key={v} active={filterGrade===v} onClick={()=>setFilterGrade(v)} color={GRADE_COLOR[v]?.bar || themeColor}>{l}</Pill>
                    ))}
                  </div>
                </div>

                {/* Role (admin only) */}
                {isAdmin && (
                  <div>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>ผู้ประเมิน</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[["all","ทั้งหมด"],["USER","USER"],["GCP","GCP"]].map(([v,l]) => (
                        <Pill key={v} active={filterRole===v} onClick={()=>setFilterRole(v)} color={v==="GCP"?"#1d4ed8":themeColor}>{l}</Pill>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date submitted */}
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>วันที่ตอนที่เข้ามา</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={e => setDateFrom(e.target.value)}
                      style={{
                        border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px",
                        fontSize: 12, fontFamily: "Sarabun, sans-serif", color: "#374151",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={e => setDateTo(e.target.value)}
                      style={{
                        border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px",
                        fontSize: 12, fontFamily: "Sarabun, sans-serif", color: "#374151",
                      }}
                    />
                  </div>
                </div>

                {hasFilter && (
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button onClick={clearFilters} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 12, color: "#ef4444", fontFamily: "Sarabun, sans-serif", fontWeight: 600,
                    }}>
                      <X size={12} /> ล้างตัวกรอง
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── States ── */}
        {status === "loading" && (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            <Loader2 size={26} style={{ animation: "spin 0.8s linear infinite", marginBottom: 10 }} />
            <div style={{ fontSize: 13 }}>กำลังโหลด...</div>
          </div>
        )}

        {status === "error" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff5f5", border: "1px solid #fecaca",
            borderRadius: 10, padding: "14px 18px", color: "#dc2626", fontSize: 13,
          }}>
            <AlertCircle size={16} /> เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่
          </div>
        )}

        {status === "ok" && records.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 20px", background: "#fff", borderRadius: 12, border: "1.5px dashed #e5e7eb" }}>
            <ClipboardList size={36} style={{ color: "#d1d5db", marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: "#9ca3af" }}>ยังไม่มีประวัติการประเมิน</div>
          </div>
        )}

        {status === "ok" && records.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 12, border: "1px solid #f3f4f6" }}>
            <Search size={28} style={{ color: "#d1d5db", marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: "#9ca3af" }}>ไม่พบรายการที่ตรงกับตัวกรอง</div>
          </div>
        )}

        {/* ── Record list ── */}
        {/* This grid (36px + 1fr + several fixed-px columns totalling
            ~350-440px) leaves almost no room for the 1fr "Supplier" column
            — the single most important field in the row — on a phone
            width, squeezing the supplier name down to 1-2 visible
            characters. Below ~650px, show a 2-line card per row instead. */}
        <style>{`
          .hist-table-desktop { display: block; }
          .hist-table-mobile { display: none; }
          @media (max-width: 650px) {
            .hist-table-desktop { display: none; }
            .hist-table-mobile { display: block; }
          }
        `}</style>

        {status === "ok" && filtered.length > 0 && (
          <div className="hist-table-desktop" style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
            animation: "fadeUp 0.25s ease",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isAdmin ? "36px 1fr 130px 90px 100px 80px 80px 20px" : "36px 1fr 130px 100px 80px 80px 20px",
              gap: "0 12px", padding: "8px 18px",
              background: "#f9fafb", borderBottom: "1px solid #f3f4f6",
              fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5,
              alignItems: "center",
            }}>
              <div />
              <div>Supplier</div>
              <div>รอบ / ประเภท</div>
              {isAdmin && <div>ผู้ประเมิน</div>}
              <div>วันที่</div>
              <div style={{ textAlign: "center" }}>เกรด</div>
              <div style={{ textAlign: "right" }}>คะแนน</div>
              <div />
            </div>

            {/* Rows */}
            {filtered.map((r, idx) => {
              const gc = GRADE_COLOR[r.grade] ?? GRADE_COLOR.F;
              const score = r.totalScore != null ? Number(r.totalScore).toFixed(1) : "—";
              const clickable = !!onViewDetail;
              return (
                <div
                  key={r.evalId}
                  className="hist-row"
                  onClick={() => onViewDetail?.(r.evalId)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isAdmin ? "36px 1fr 130px 90px 100px 80px 80px 20px" : "36px 1fr 130px 100px 80px 80px 20px",
                    gap: "0 12px", padding: "11px 18px",
                    borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none",
                    alignItems: "center", cursor: clickable ? "pointer" : "default",
                    transition: "background 0.1s",
                    background: "#fff",
                  }}
                >
                  {/* Left accent */}
                  <div style={{
                    width: 4, height: 32, borderRadius: 4,
                    background: gc.bar, justifySelf: "center",
                  }} />

                  {/* Supplier info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13, color: "#111827",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.supplierName}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      {r.vendorCode} · {PRODUCT_LABEL[r.productType] ?? r.productType ?? "—"}
                    </div>
                  </div>

                  {/* Period + type */}
                  <div>
                    <div style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>
                      {r.period}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: r.evalType === "post_eval" ? "#eff6ff" : "#f0fdf4",
                        color: r.evalType === "post_eval" ? "#1d4ed8" : "#15803d",
                      }}>
                        {EVAL_LABEL[r.evalType] ?? r.evalType}
                      </span>
                    </div>
                  </div>

                  {/* Evaluator (admin only) */}
                  {isAdmin && (
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        overflow: "hidden", background: "#e8efe8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: "#4a6b4a",
                      }}>
                        {r.evaluatorPicture
                          ? <img src={r.evaluatorPicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (r.evaluatorName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                        }
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, color: "#374151", fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.evaluatorName ?? "—"}
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: r.role === "GCP" ? "#eff6ff" : "#f0fdf4",
                          color: r.role === "GCP" ? "#1d4ed8" : "#15803d",
                        }}>
                          {r.role}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Date submitted */}
                  <div style={{ fontSize: 11.5, color: "#6b7280" }}>
                    {formatDateOnly(r.submittedAt)}
                  </div>

                  {/* Grade badge */}
                  <div style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, borderRadius: 8,
                      background: gc.bg, color: gc.text,
                      fontSize: 14, fontWeight: 800,
                    }}>
                      {r.grade ?? "—"}
                    </span>
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: gc.bar, lineHeight: 1 }}>
                      {score}
                    </div>
                  </div>

                  {/* Chevron */}
                  <div>
                    {clickable && <ChevronRight size={15} style={{ color: "#d1d5db" }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {status === "ok" && filtered.length > 0 && (
          <div className="hist-table-mobile" style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
          }}>
            {filtered.map((r, idx) => {
              const gc = GRADE_COLOR[r.grade] ?? GRADE_COLOR.F;
              const score = r.totalScore != null ? Number(r.totalScore).toFixed(1) : "—";
              const clickable = !!onViewDetail;
              return (
                <div
                  key={r.evalId}
                  onClick={() => onViewDetail?.(r.evalId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px",
                    borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none",
                    cursor: clickable ? "pointer" : "default",
                  }}
                >
                  <div style={{ width: 4, height: 36, borderRadius: 4, background: gc.bar, flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.supplierName}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.vendorCode} · {PRODUCT_LABEL[r.productType] ?? r.productType ?? "—"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "#374151", fontWeight: 600 }}>{r.period}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: r.evalType === "post_eval" ? "#eff6ff" : "#f0fdf4",
                        color: r.evalType === "post_eval" ? "#1d4ed8" : "#15803d",
                      }}>
                        {EVAL_LABEL[r.evalType] ?? r.evalType}
                      </span>
                      {isAdmin && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 10, fontWeight: 700, padding: "1px 6px 1px 2px", borderRadius: 4,
                          background: r.role === "GCP" ? "#eff6ff" : "#f0fdf4",
                          color: r.role === "GCP" ? "#1d4ed8" : "#15803d",
                        }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                            overflow: "hidden", background: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, fontWeight: 700,
                          }}>
                            {r.evaluatorPicture
                              ? <img src={r.evaluatorPicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : (r.evaluatorName || "?").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
                            }
                          </span>
                          {r.evaluatorName ?? "—"} · {r.role}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, borderRadius: 8,
                      background: gc.bg, color: gc.text, fontSize: 13, fontWeight: 800, marginBottom: 4,
                    }}>
                      {r.grade ?? "—"}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 800, color: gc.bar, lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: 9.5, color: "#9ca3af", marginTop: 2 }}>
                      {formatDateOnly(r.submittedAt)}
                    </div>
                  </div>

                  {clickable && <ChevronRight size={15} style={{ color: "#d1d5db", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
