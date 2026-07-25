---
name: app-ui-design
description: Design conventions for this app's real pages (Next.js frontend, not Artifacts) — palette, typography, card/module patterns, spacing, grouping. Load before styling, redesigning, or adding UI in frontend/src/app or frontend/src/components.
---

Design conventions extracted from this codebase's own existing pages (Portal, Admin, EvalForm, Supervisor). The goal is every new or restyled screen reads as part of the same product, not a bolted-on page with its own visual language. Follow the existing pattern first; only introduce something new when nothing in the app already solves the problem.

## Foundations

- **Font**: `"Sarabun, sans-serif"` everywhere, set inline as `fontFamily` on the outermost container (no CSS module/Tailwind font class — this app styles with inline `style={{}}` objects throughout, not Tailwind or styled-components). Follow that convention: plain inline styles, not a new styling system.
- **Primary green**: `#1b5e20` (buttons, active states, links, brand accents). Page background: `#f0f4f0`.
- **Per-module accent colors** — each functional area owns one hex color used consistently for its icon, active border, badge, and hover glow. Established palette so far:
  - Employees `#1b5e20` (green) · Evaluation Tasks `#00897b` (teal) · Results & History `#6a1b9a` (purple) · Service Feedback `#e65100` (orange) · Criteria Editor `#bf360c` (deep orange/red) · Email Parameter `#1565c0` (blue)
  - Pick a new module's color to stay visually distinct from its neighbors in the same grid — don't reuse an adjacent card's hue.
- **Cards**: white background, `borderRadius: 14` (data cards/tables) or `18` (module/nav cards), `boxShadow: "0 2px 10px rgba(0,0,0,0.06)"` at rest. Border `1px solid #dde3dd` on data cards; module/nav cards use a transparent 2px border that becomes `2px solid {accentColor}` when active.
- **Spacing scale**: 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 — pick from this, don't invent arbitrary px values.
- **Type scale**: 10–11px (English subtitle / meta), 12–13px (body/table), 14–15px (section labels), 17–18px (card headers), 22px+ only for hero numbers (scores, big counts).

## Module/nav cards (the pattern behind Portal's and Admin's top grid)

Each module is a `TabCard`/`ModuleCard`: white rounded card, centered content, a circular icon badge on top, Thai label (bold, 13px) then English label (10px, `#bbb`, letter-spacing). The circle badge uses a `radial-gradient(circle at 38% 35%, <light>, <accent> 130%)` background with the module's Lucide icon in its accent color on top — never a flat single-color circle, the radial gradient is what makes these read as "illustrated" rather than flat UI.

Hover/active state: `translateY(-4px)` + stronger shadow + colored border, all on the same 0.2s transition — apply this to any new module card so it doesn't feel static next to its siblings.

## Grouping a module grid

`repeat(auto-fit, minmax(170px, 1fr))` on a plain flat list looks fine for small counts but produces an **orphaned row** once the count doesn't divide evenly into the viewport's column count (e.g. 6 items wrapping to 5+1 looks like a mistake, not a design). When a grid grows past ~5 items:
1. First ask whether the modules split into a real conceptual grouping (e.g. day-to-day data entry vs. system configuration/parameters) — if yes, split into two labeled sub-grids with a small section header (12–13px, `#888`/`#999`, uppercase or a colored eyebrow) above each, rather than one long undifferentiated row. This is usually the right call once you have both "things you do" and "things you configure" in the same list.
2. Only if there's no real grouping, fall back to fixing the column count explicitly (e.g. `repeat(3, 1fr)`) so it terminates in a clean rectangle instead of auto-fit's remainder row.

## Content-area patterns (inside a selected module)

- **Data tables**: `.admin-table` class (already global in `admin/page.tsx`'s `<style>` block) — light green header row `#eaf0ea`, uppercase 11.5px header text, zebra striping, hover highlight `#f1f7f1`. Reuse this class rather than inventing new table styling.
- **Search/filter bar**: white pill input with a `Search` icon inset-left, `border: 1px solid #e0e0e0`, `borderRadius: 8`. Filter chips use `FilterChips` (`components/shared/FilterChips.tsx`).
- **Toasts**: fixed bottom-center pill, green for success / red for error, auto-dismiss ~3s. See `Toast` in `AdminCriteriaEditor.tsx` or `EmailSettingsEditor.tsx` for the exact shape — copy it rather than restyling.
- **Empty/loading states**: centered gray text (`color: "#bbb"`/`"#aaa"`), no spinners-as-illustration, just `กำลังโหลด…` / `ไม่พบข้อมูล` etc.
- **Info/hint boxes**: light-tinted background matching the message tone — blue (`#e8f0fe`/`#1565c0`) for neutral info, amber (`#fff8e1`/`#8a6100`) for warnings — `Info`/`AlertCircle` icon from lucide-react on the left, never a bare colored paragraph.

## Language

Thai-first for all user-facing labels (this is an internal Thai enterprise tool); English only as a secondary subtitle/label or for technical terms with no natural Thai equivalent (Supplier, Vendor Code, etc.) — match the Thai/English mixing ratio already visible in the surrounding page, don't translate everything or English everything.

## What to avoid

- No Tailwind classes, no CSS modules, no styled-components — this app is 100% inline `style={{}}` objects. Introducing a second styling system mid-app is worse than the verbosity of matching the existing one.
- No generic AI-page defaults (gradient hero banners, glassmorphism, emoji as section markers, `rounded-lg` cliché) — this is a plain, dense, internal admin tool, not a marketing site. Restraint and legibility beat visual flourish here.
- Don't reach for a brand-new color when an existing module accent (see palette above) already fits the semantic role.
