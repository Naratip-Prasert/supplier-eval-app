// ============================================================
//  components/FilterChips.jsx — multi-select pill filter, shared
//  by TasksPage, AdminPage (SessionsTab), and LandingPage. An empty
//  `selected` Set means "no filter applied" (everything matches) —
//  the "ทั้งหมด" chip clears the set back to that state.
// ============================================================
export function FilterChips({ options, selected, onToggle, onClear, activeColor = "#1b5e20", activeBg }) {
  const bg = activeBg ?? `${activeColor}14`;
  const allActive = selected.size === 0;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button
        onClick={onClear}
        style={{
          padding: "6px 14px", borderRadius: 20,
          border: allActive ? `2px solid ${activeColor}` : "1px solid #ddd",
          background: allActive ? bg : "#fff",
          color: allActive ? activeColor : "#555",
          fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer",
          fontWeight: allActive ? 700 : 400,
        }}
      >
        ทั้งหมด
      </button>
      {options.map(({ v, l }) => {
        const active = selected.has(v);
        return (
          <button
            key={v}
            onClick={() => onToggle(v)}
            style={{
              padding: "6px 14px", borderRadius: 20,
              border: active ? `2px solid ${activeColor}` : "1px solid #ddd",
              background: active ? bg : "#fff",
              color: active ? activeColor : "#555",
              fontFamily: "Sarabun, sans-serif", fontSize: 12, cursor: "pointer",
              fontWeight: active ? 700 : 400,
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// Toggle a value's membership in a Set, returning a new Set (for setState).
export function toggleInSet(set, value) {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}
