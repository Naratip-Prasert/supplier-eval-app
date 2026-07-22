// ============================================================
//  components/shared/SortableTh.tsx — click-to-sort table/grid header cell,
//  shared by AdminPage (SessionsTab), SupervisorPage (history), and
//  HistoryPage. First click on a column sorts ascending, a second click
//  flips to descending, clicking a different column restarts at ascending.
// ============================================================
"use client";

import { useState, type CSSProperties } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export interface SortState<K extends string> {
  key: K | null;
  dir: "asc" | "desc";
}

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

interface SortableThProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  /** "th" for real <table> headers, "div" for CSS-grid header rows (e.g. History page). */
  as?: "th" | "div";
  align?: "left" | "center" | "right";
  style?: CSSProperties;
}

export function SortableTh<K extends string>({
  label, sortKey, sort, onSort, as = "th", align = "left", style,
}: SortableThProps<K>) {
  const [hovered, setHovered] = useState(false);
  const Tag = as;
  const active = sort.key === sortKey;
  const justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  // A plain neutral icon alone is easy to miss as "this is clickable" — a
  // hover tint plus a stronger, permanent tint + bold label on whichever
  // column is actively sorted makes both states readable at a glance
  // without adding text (a badge here previously made the row too wide).
  return (
    // `display:flex` must NOT go on the <th>/<div> itself — overriding a
    // <th>'s default `display:table-cell` breaks the whole table's row
    // layout (cells stack vertically instead of sitting side by side).
    // The flex layout lives on an inner <span> instead, leaving the cell's
    // own display mode untouched.
    <Tag
      onClick={() => onSort(sortKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer", userSelect: "none",
        background: active ? "rgba(0,0,0,0.06)" : hovered ? "rgba(0,0,0,0.04)" : "transparent",
        fontWeight: active ? 800 : undefined,
        transition: "background 0.12s",
        ...style,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: justify, gap: 4, width: "100%" }}>
        {label}
        {active
          ? (sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
          : <ChevronsUpDown size={12} style={{ opacity: hovered ? 0.7 : 0.35, flexShrink: 0 }} />}
      </span>
    </Tag>
  );
}
