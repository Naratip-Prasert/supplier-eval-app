// ============================================================
//  utils/dateFilter.js — shared "date range or quick preset" filter
//  used by TasksPage (upload date) and AdminPage SessionsTab
//  (completed date).
// ============================================================

export const DATE_PRESETS = [
  { key: "all",   label: "ทั้งหมด" },
  { key: "today", label: "วันนี้" },
  { key: "7d",    label: "7 วัน" },
  { key: "30d",   label: "30 วัน" },
];

export const DEFAULT_DATE_FILTER = { preset: "all", from: "", to: "" };

export function matchesDateFilter(dateStr, filter) {
  const hasRange = !!(filter.from || filter.to);
  if (!hasRange && (!filter.preset || filter.preset === "all")) return true;

  if (!dateStr) return false;
  const d = new Date(dateStr);

  if (hasRange) {
    if (filter.from && d < new Date(filter.from)) return false;
    if (filter.to) {
      const to = new Date(filter.to);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  }

  const days = filter.preset === "today" ? 0 : filter.preset === "7d" ? 7 : filter.preset === "30d" ? 30 : null;
  if (days == null) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

export function DateFilterBar({ filter, onChange, label = "ช่วงวันที่" }) {
  const presetActive = !filter.from && !filter.to;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {DATE_PRESETS.map(p => {
        const active = presetActive && filter.preset === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange({ preset: p.key, from: "", to: "" })}
            style={{
              padding: "6px 14px", borderRadius: 20,
              border: active ? "2px solid #1b5e20" : "1px solid #ddd",
              background: active ? "#e8f5e9" : "#fff",
              color: active ? "#1b5e20" : "#555",
              fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer",
              fontWeight: active ? 700 : 400,
            }}
          >
            {p.label}
          </button>
        );
      })}
      <span style={{ fontSize: 11, color: "#aaa" }}>{label}:</span>
      <input
        type="date"
        value={filter.from}
        onChange={e => onChange({ ...filter, preset: "custom", from: e.target.value })}
        style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
      />
      <span style={{ color: "#aaa", fontSize: 12 }}>—</span>
      <input
        type="date"
        value={filter.to}
        onChange={e => onChange({ ...filter, preset: "custom", to: e.target.value })}
        style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6, fontFamily: "Sarabun, sans-serif" }}
      />
      {(filter.from || filter.to) && (
        <button
          onClick={() => onChange({ ...DEFAULT_DATE_FILTER })}
          style={{ fontSize: 11, color: "#c62828", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          ล้าง
        </button>
      )}
    </div>
  );
}
