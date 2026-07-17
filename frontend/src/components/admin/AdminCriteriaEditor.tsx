// ============================================================
//  components/AdminCriteriaEditor.tsx
//  Admin tab: เปลี่ยนเกณฑ์และ parameter
//  Tabs: Core | Function (M1-M7) | ESG
//  Ported 1:1 from pages/AdminCriteriaEditor.jsx (2037 lines) — no logic
//  changes, only types added. Mounted inside app/(app)/admin/page.tsx's
//  "criteria" tab (was a standalone route in the old page-state app).
// ============================================================
"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { authFetch } from "../../utils/api";
import { useCriteriaReload } from "../../context/CriteriaContext";
import {
  r2adm, isEsgCategory, isEsgFactory, getCriteriaSetFromCode, nextItemCode,
  computeEffectiveWeights, computeEsgEffectiveWeights,
  getCatBuffer, getItemBuffer, getEsgItemBuffer, scaleItemsToTotal, scaleSectionItemsToTotal,
  buildSeedPayload,
  type AdminItem, type AdminSection,
} from "../../utils/admin/weightMath";
import {
  ChevronDown, ChevronRight,
  Save, RefreshCw, AlertCircle, CheckCircle2, X, Download, Trash2,
} from "lucide-react";

const FONT = "Sarabun, sans-serif";
const LEVEL_CIRCLE_COLORS = ["#ef5350", "#ff9800", "#fdd835", "#66bb6a", "#388e3c"];

// ── Local shapes (AdminItem/AdminSection from weightMath.ts cover only the
// fields the pure weight functions need — this page also reads/writes
// levels/levelValues/detailTh/groupLabels, so extend locally) ───────────
interface CritItem extends AdminItem {
  levels: string[];
  levelValues?: number[] | null;
  detailTh?: string;
}
interface CritSection extends AdminSection {
  groupLabels?: Record<string, { th: string; en: string }> | null;
  displayOrder?: number;
  items: CritItem[];
}

interface UpdatePayload {
  nameTh?: string;
  totalWeight?: number;
  code?: string;
  defaultWeight?: number;
  detailTh?: string;
  categoryId?: string;
  criteriaSet?: string;
  groupWeights?: Record<string, number>;
  groupLabels?: Record<string, { th: string; en: string }>;
  itemWeights?: Record<string, number>;
  itemIds?: string[];
}
type UpdateAction =
  | "cat-name" | "cat-weight" | "item-name" | "item-code" | "item-weight"
  | "add-item" | "delete-item" | "remove-esg-group" | "save-cat"
  | "normalize-esg" | "normalize-sec" | "save-item";
type OnUpdate = (action: UpdateAction, id: string, payload: UpdatePayload) => void | Promise<void>;

type SavingState =
  | { type: "item"; id: string }
  | { type: "category"; id: string }
  | { type: "new-item" }
  | { type: "levels"; id: string }
  | { type: "core-total" }
  | { type: "esg-total" }
  | null;

interface ToastState { msg: string; type: "success" | "error"; }

// ── Toast ────────────────────────────────────────────────────
function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 8,
      background: ok ? "#1b5e20" : "#b71c1c", color: "#fff",
      borderRadius: 10, padding: "10px 20px", fontSize: 14,
      fontFamily: FONT, boxShadow: "0 4px 18px rgba(0,0,0,.22)",
      animation: "slideUp .2s ease",
    }}>
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {toast.msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", lineHeight: 1 }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── WeightInput ───────────────────────────────────────────────
function WeightInput({ value, onChange, onSave, disabled }: {
  value: number | null | undefined; onChange: (v: number) => void; onSave?: (v: number) => void; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setLocal(String(value ?? "")); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(local);
    if (!isNaN(n) && n !== value) { onChange(n); onSave?.(n); }
  };

  return editing ? (
    <input ref={inputRef} value={local} onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      disabled={disabled}
      style={{ width: 56, textAlign: "center", border: "2px solid #1b5e20", borderRadius: 6,
        padding: "2px 6px", fontFamily: FONT, fontSize: 13, fontWeight: 700, outline: "none" }}
    />
  ) : (
    <span onClick={() => !disabled && setEditing(true)} title="คลิกเพื่อแก้ไข"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 42, padding: "2px 8px", borderRadius: 6,
        background: "#e8f5e9", color: "#1b5e20", fontWeight: 700, fontSize: 13,
        cursor: disabled ? "default" : "pointer", border: "2px solid transparent",
        transition: "border-color .15s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = "#81c784"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}
    >{value ?? "–"}</span>
  );
}

// ── TextEdit ──────────────────────────────────────────────────
function TextEdit({ value, onChange, onSave, disabled, multiline = true, style = {} }: {
  value: string | null | undefined; onChange: (v: string) => void; onSave?: (v: string) => void;
  disabled?: boolean; multiline?: boolean; style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value ?? "");
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => { if (!editing) setLocal(value ?? ""); }, [value, editing]);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select?.(); } }, [editing]);

  const commit = () => {
    setEditing(false);
    if (local !== value) { onChange(local); onSave?.(local); }
  };

  const baseStyle: React.CSSProperties = {
    width: "100%", fontFamily: FONT, fontSize: 13, lineHeight: 1.5,
    border: "2px solid #1b5e20", borderRadius: 6, padding: "4px 8px",
    background: "#fff", outline: "none", resize: "vertical", ...style,
  };

  if (editing) {
    return multiline
      ? <textarea ref={ref} value={local} onChange={e => setLocal(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
          disabled={disabled} rows={3} style={baseStyle} />
      : <input ref={ref} value={local} onChange={e => setLocal(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          disabled={disabled} style={{ ...baseStyle, resize: "none" }} />;
  }

  return (
    <span onClick={() => !disabled && setEditing(true)} title="คลิกเพื่อแก้ไข"
      style={{
        display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word",
        cursor: disabled ? "default" : "text", padding: "3px 6px", borderRadius: 6,
        border: "2px solid transparent", transition: "border-color .15s", lineHeight: 1.5,
        fontSize: 13, fontFamily: FONT, ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = "#c8e6c9"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}
    >{value || <span style={{ color: "#ccc" }}>–</span>}</span>
  );
}

// ── LevelsModal — edit descriptions + levelValues ─────────────
function LevelsModal({ item, onClose, onSave, saving }: {
  item: CritItem; onClose: () => void; onSave: (item: CritItem, levels: string[], levelValues: number[]) => void; saving?: boolean;
}) {
  // Always keep exactly 5 slots: levels[i] = description for level i+1.
  // Pad with "" if the stored array is shorter.
  const [levels, setLevels] = useState<string[]>(() => {
    const arr = Array.isArray(item.levels) ? [...item.levels] : [];
    while (arr.length < 5) arr.push("");
    return arr.slice(0, 5);
  });
  const [levelValues, setLevelValues] = useState<number[]>(
    Array.isArray(item.levelValues) && item.levelValues.length > 0
      ? [...item.levelValues]
      : [1, 2, 3, 4, 5]
  );

  const updateLevel = (i: number, val: string) => setLevels(prev => prev.map((l, j) => j === i ? val : l));

  const toggleLV = (v: number) => {
    setLevelValues(prev => {
      if (prev.includes(v)) {
        if (prev.length <= 1) return prev;
        return prev.filter(x => x !== v);
      }
      return [...prev, v].sort((a, b) => a - b);
    });
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 8888,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 660,
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.2)",
        fontFamily: FONT,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}>
              แก้ไขระดับคะแนน — {item.code}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{item.nameTh}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa" }}>
            <X size={20} />
          </button>
        </div>

        {/* levelValues selector */}
        {(() => {
          const LV_LABELS = ["ต้องปรับปรุง", "ต่ำกว่าเกณฑ์", "ผ่านเกณฑ์", "ดี", "ดีเยี่ยม"];
          const LV_EN     = ["Unsatisfactory", "Below Standard", "Satisfactory", "Good", "Excellent"];
          return (
            <div style={{
              border: "1.5px solid #e0e0e0", borderRadius: 12,
              padding: "14px 16px", marginBottom: 18, background: "#fafafa",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 12 }}>
                ระดับคะแนนที่ใช้ได้
                <span style={{ fontWeight: 400, color: "#999", marginLeft: 6 }}>คลิกเพื่อเปิด/ปิดแต่ละระดับ</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map(v => {
                  const active = levelValues.includes(v);
                  const color  = LEVEL_CIRCLE_COLORS[v - 1];
                  return (
                    <button key={v} onClick={() => toggleLV(v)}
                      title={`${v} — ${LV_LABELS[v - 1]}\n${active ? "คลิกเพื่อปิด" : "คลิกเพื่อเปิด"}`}
                      style={{
                        flex: 1, padding: "10px 4px 8px",
                        borderRadius: 10,
                        border: `2px solid ${active ? color : "#e0e0e0"}`,
                        background: active ? color + "18" : "#f5f5f5",
                        cursor: "pointer", transition: "all .15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        outline: "none",
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: active ? color : "#ddd",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 900, fontSize: 15,
                        transition: "background .15s",
                        boxShadow: active ? `0 2px 6px ${color}55` : "none",
                      }}>{v}</div>
                      <div style={{
                        fontSize: 10.5, fontWeight: 700,
                        color: active ? color : "#bbb",
                        transition: "color .15s", lineHeight: 1.25, textAlign: "center",
                      }}>{LV_LABELS[v - 1]}</div>
                      <div style={{
                        fontSize: 9.5, color: active ? "#888" : "#ccc",
                        transition: "color .15s", lineHeight: 1.2, textAlign: "center",
                      }}>{LV_EN[v - 1]}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 10, textAlign: "right" }}>
                ระดับที่เปิด: [{levelValues.join(", ")}]
              </div>
            </div>
          );
        })()}

        {/* Level descriptions */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 8 }}>
          คำอธิบายแต่ละระดับ
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {levels.map((lvl, i) => {
            const levelNum = i + 1;
            const isActive = levelValues.includes(levelNum);
            return (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                opacity: isActive ? 1 : 0.35,
                transition: "opacity .15s",
              }}>
                <div style={{
                  minWidth: 28, height: 28, borderRadius: "50%",
                  background: isActive ? (LEVEL_CIRCLE_COLORS[i] ?? "#9e9e9e") : "#bdbdbd",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 2,
                  transition: "background .15s",
                }}>{levelNum}</div>
                <textarea value={lvl} onChange={e => updateLevel(i, e.target.value)} rows={2}
                  disabled={!isActive}
                  style={{
                    flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, resize: "vertical",
                    border: `1.5px solid ${isActive ? "#ddd" : "#e0e0e0"}`,
                    borderRadius: 8, padding: "6px 10px", outline: "none",
                    background: isActive ? "#fff" : "#f5f5f5",
                    cursor: isActive ? "text" : "default",
                  }}
                  onFocus={e => isActive && (e.target.style.borderColor = "#1b5e20")}
                  onBlur={e => (e.target.style.borderColor = isActive ? "#ddd" : "#e0e0e0")}
                />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", borderRadius: 8, border: "1.5px solid #ddd",
            background: "#fff", cursor: "pointer", fontFamily: FONT, fontSize: 14,
          }}>ยกเลิก</button>
          <button onClick={() => onSave(item, levels, levelValues)} disabled={saving}
            style={{
              padding: "8px 22px", borderRadius: 8, border: "none",
              background: saving ? "#a5d6a7" : "#1b5e20", color: "#fff",
              cursor: saving ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {saving ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
            บันทึกระดับคะแนน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddItemRow ────────────────────────────────────────────────
function AddItemRow({ onSave, onCancel, saving, hideWeights, defaultCode }: {
  onSave: (data: { code: string; nameTh: string; defaultWeight: number }) => void;
  onCancel: () => void; saving?: boolean; hideWeights?: boolean; defaultCode?: string;
}) {
  const [code,   setCode]   = useState(defaultCode || '');
  const [nameTh, setNameTh] = useState('');
  const [weight, setWeight] = useState('0');

  const submit = () => {
    if (!code.trim() || !nameTh.trim()) return;
    onSave({ code: code.trim(), nameTh: nameTh.trim(), defaultWeight: parseFloat(weight) || 0 });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: FONT, fontSize: 12, border: '1.5px solid #a5d6a7',
    borderRadius: 6, padding: '4px 7px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <tr style={{ background: '#f0fff4' }}>
      <td style={{ padding: '6px 8px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="รหัส"
          style={{ ...inputStyle, fontFamily: 'monospace' }} />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input value={nameTh} onChange={e => setNameTh(e.target.value)} placeholder="ชื่อหัวข้อ"
          style={inputStyle} />
      </td>
      {!hideWeights && (
        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
            style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
        </td>
      )}
      <td colSpan={hideWeights ? 4 : 3} style={{ padding: '6px 10px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={submit} disabled={saving || !code.trim() || !nameTh.trim()}
            style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              background: '#1b5e20', color: '#fff', fontFamily: FONT, fontSize: 12,
              cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700,
            }}>
            {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'บันทึก'}
          </button>
          <button onClick={onCancel} style={{
            padding: '4px 10px', borderRadius: 6, border: '1.5px solid #ddd',
            background: '#fff', fontFamily: FONT, fontSize: 12, cursor: 'pointer',
          }}>ยกเลิก</button>
        </div>
      </td>
    </tr>
  );
}

// ── AddSectionRow ─────────────────────────────────────────────
function AddSectionRow({ onSave, onCancel, saving }: {
  onSave: (data: { nameTh: string; totalWeight: number }) => void; onCancel: () => void; saving?: boolean;
}) {
  const [nameTh, setNameTh] = useState('');
  const [weight, setWeight] = useState('0');

  const inputStyle: React.CSSProperties = {
    fontFamily: FONT, fontSize: 13, border: '1.5px solid #a5d6a7',
    borderRadius: 8, padding: '6px 10px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
      background: '#f0fff4', borderRadius: 10, marginTop: 8,
      border: '1.5px dashed #a5d6a7',
    }}>
      <input value={nameTh} onChange={e => setNameTh(e.target.value)}
        placeholder="ชื่อหัวข้อใหม่" style={{ ...inputStyle, flex: 1 }} />
      <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
        placeholder="น้ำหนัก" style={{ ...inputStyle, width: 80, textAlign: 'center' }} />
      <button onClick={() => { if (nameTh.trim()) onSave({ nameTh: nameTh.trim(), totalWeight: parseFloat(weight) || 0 }); }}
        disabled={saving || !nameTh.trim()}
        style={{
          padding: '6px 16px', borderRadius: 8, border: 'none',
          background: '#1b5e20', color: '#fff', fontFamily: FONT, fontSize: 13,
          fontWeight: 700, cursor: saving || !nameTh.trim() ? 'not-allowed' : 'pointer',
        }}>
        {saving ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'บันทึก'}
      </button>
      <button onClick={onCancel} style={{
        padding: '6px 12px', borderRadius: 8, border: '1.5px solid #ddd',
        background: '#fff', fontFamily: FONT, fontSize: 13, cursor: 'pointer',
      }}>ยกเลิก</button>
    </div>
  );
}

// ── AddEsgGroupInline — inline form for adding a new ESG sub-group ───
function AddEsgGroupInline({ onSave, onCancel, saving }: {
  onSave: (th: string, en: string) => void; onCancel: () => void; saving?: boolean;
}) {
  const [th, setTh] = useState('');
  const [en, setEn] = useState('');
  const inputStyle: React.CSSProperties = {
    fontFamily: FONT, fontSize: 12, border: '1.5px solid #a5d6a7',
    borderRadius: 6, padding: '5px 8px', outline: 'none', boxSizing: 'border-box', width: 130,
  };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px',
      background: '#f0fff4', borderRadius: 8, border: '1.5px dashed #a5d6a7', minWidth: 150,
    }}>
      <input value={th} onChange={e => setTh(e.target.value)} placeholder="ชื่อกลุ่ม (ไทย)" style={inputStyle} />
      <input value={en} onChange={e => setEn(e.target.value)} placeholder="Group name (English)" style={inputStyle} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { if (th.trim()) onSave(th.trim(), en.trim()); }}
          disabled={saving || !th.trim()}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', flex: 1,
            background: '#1b5e20', color: '#fff', fontFamily: FONT, fontSize: 12,
            fontWeight: 700, cursor: saving || !th.trim() ? 'not-allowed' : 'pointer',
          }}>
          {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'เพิ่ม'}
        </button>
        <button onClick={onCancel} style={{
          padding: '5px 10px', borderRadius: 6, border: '1.5px solid #ddd',
          background: '#fff', fontFamily: FONT, fontSize: 12, cursor: 'pointer',
        }}>ยกเลิก</button>
      </div>
    </div>
  );
}

// ── ItemRow ───────────────────────────────────────────────────
function ItemRow({ item, onUpdate, onOpenLevels, saving, disabled, effectiveWeight, hideWeight, editableEffective, esgEditable }: {
  item: CritItem; onUpdate: OnUpdate; onOpenLevels: (item: CritItem) => void;
  saving: SavingState; disabled?: boolean; effectiveWeight?: number;
  hideWeight?: boolean; editableEffective?: boolean; esgEditable?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSaving = saving?.type === "item" && saving?.id === item.id;

  const saveItem = useCallback((patch: UpdatePayload) => {
    onUpdate("save-item", item.id, patch);
  }, [item.id, onUpdate]);

  return (
    <tr style={{ background: "#fff" }}>
      <td style={{ padding: "8px 10px", width: 66, whiteSpace: "nowrap" }}>
        <TextEdit value={item.code} disabled={disabled} multiline={false}
          onChange={v => onUpdate("item-code", item.id, { code: v })}
          onSave={v => saveItem({ code: v })}
          style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}
        />
      </td>
      <td style={{ padding: "6px 10px" }}>
        <TextEdit value={item.nameTh} disabled={disabled}
          onChange={v => onUpdate("item-name", item.id, { nameTh: v })}
          onSave={v => saveItem({ nameTh: v })}
        />
      </td>
      {!hideWeight && (
        <td style={{ padding: "6px 10px", textAlign: "center", width: 80 }}>
          {effectiveWeight != null && !editableEffective && !esgEditable
            ? /* fallback: read-only computed weight (currently unused — ESG is editable) */
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 42, padding: "2px 8px", borderRadius: 6,
                background: "#e3f2fd", color: "#1565c0", fontWeight: 700, fontSize: 13,
                border: "1.5px solid #90caf9",
              }}>{effectiveWeight}</span>
            : /* Function/Core/ESG: editable — show effective weight when computed, defaultWeight otherwise */
              <WeightInput
                value={effectiveWeight != null ? effectiveWeight : item.defaultWeight}
                disabled={disabled}
                onChange={v => onUpdate("item-weight", item.id, { defaultWeight: v })}
                onSave={v => saveItem({ defaultWeight: v })}
              />}
        </td>
      )}
      <td style={{ padding: "6px 10px", textAlign: "center", width: 90 }}>
        <span style={{ fontSize: 11, color: "#aaa" }}>
          {(item.levelValues?.length ?? 0) > 0 ? item.levelValues!.length : item.levels.length} ระดับ
          {(item.levelValues?.length ?? 0) > 0 && (item.levelValues?.length ?? 0) < 5
            ? <span style={{ marginLeft: 4, color: "#1b5e20" }}>[{item.levelValues!.join(",")}]</span>
            : null}
        </span>
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", width: 90 }}>
        <button onClick={() => onOpenLevels(item)} disabled={disabled}
          style={{
            padding: "4px 10px", borderRadius: 6, border: "1.5px solid #1b5e20",
            background: "#fff", color: "#1b5e20", cursor: "pointer",
            fontFamily: FONT, fontSize: 12, fontWeight: 700,
          }}
        >แก้ระดับ</button>
      </td>
      <td style={{ padding: "6px 6px", textAlign: "center", width: 90 }}>
        {isSaving ? (
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite", color: "#aaa" }} />
        ) : confirmDelete ? (
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            <button
              onClick={() => { setConfirmDelete(false); onUpdate("delete-item", item.id, {}); }}
              style={{
                padding: "2px 8px", borderRadius: 5, border: "none",
                background: "#ef4444", color: "#fff", fontSize: 11, fontFamily: FONT,
                fontWeight: 700, cursor: "pointer",
              }}>ยืนยัน</button>
            <button onClick={() => setConfirmDelete(false)}
              style={{
                padding: "2px 6px", borderRadius: 5, border: "1.5px solid #ddd",
                background: "#fff", fontSize: 11, fontFamily: FONT, cursor: "pointer",
              }}>ยกเลิก</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} disabled={disabled}
            title="ลบรายการนี้"
            style={{
              padding: "3px 6px", background: "none", border: "1.5px solid #fca5a5",
              borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
              color: "#ef4444", opacity: disabled ? 0.3 : 1, lineHeight: 1,
            }}
          ><Trash2 size={13} /></button>
        )}
      </td>
    </tr>
  );
}

const TH: React.CSSProperties = {
  padding: "9px 10px", fontSize: 11.5, fontWeight: 700, textAlign: "center",
  color: "#4a6b4a", textTransform: "uppercase", letterSpacing: ".3px",
  borderBottom: "1px solid #dce8dc",
};

// Default labels/colors for the original 3 ESG sub-groups — used whenever
// admin hasn't overridden a group's label (groupLabels[key] absent). Colors
// beyond these 3 (for admin-added groups) come from GROUP_COLOR_PALETTE.
const DEFAULT_ESG_GROUP_TEXT: Record<string, { label: string; en: string }> = {
  "1": { label: "สิ่งแวดล้อม", en: "Environment" },
  "2": { label: "สังคม",       en: "Social" },
  "3": { label: "ธรรมาภิบาล", en: "Governance" },
};
const DEFAULT_ESG_COLORS: Record<string, string> = { "1": "#2e7d32", "2": "#1565c0", "3": "#6a1b9a" };
const GROUP_COLOR_PALETTE = ["#2e7d32", "#1565c0", "#6a1b9a", "#e65100", "#00838f", "#ad1457"];

interface EsgGroup { key: string; label: string; en: string; color: string; }

// Derives the *live* group list for this ESG section from whatever's
// actually there — section.items' code prefixes (ESG{n}./ESGF{n}.) union
// groupWeights' key set (covers a just-added, still-empty group) — instead
// of a fixed 3-entry array, so admin-added/removed groups show up correctly.
function deriveEsgGroups(
  section: CritSection,
  groupWeights: Record<string, number>,
  groupLabels: Record<string, { th: string; en: string }>
): EsgGroup[] {
  const keys = new Set<string>();
  (section.items ?? []).forEach(it => {
    if (it.isActive === false) return;
    const m = it.code?.match(/^ESGF?(\d+)\./i);
    if (m) keys.add(m[1]);
  });
  Object.keys(groupWeights ?? {}).forEach(k => keys.add(k));
  // Fallback to the original 3 only when nothing else is known yet (fresh
  // section, groupWeights never saved) — matches today's behavior.
  if (keys.size === 0) ["1", "2", "3"].forEach(k => keys.add(k));

  return [...keys]
    .sort((a, b) => Number(a) - Number(b))
    .map((key, i) => {
      const override = groupLabels?.[key];
      return {
        key,
        label: override?.th ?? DEFAULT_ESG_GROUP_TEXT[key]?.label ?? `กลุ่มที่ ${key}`,
        en:    override?.en ?? DEFAULT_ESG_GROUP_TEXT[key]?.en ?? "",
        color: DEFAULT_ESG_COLORS[key] ?? GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length],
      };
    });
}

// ── SectionCard ───────────────────────────────────────────────
function SectionCard({ section, idx, onUpdate, onOpenLevels, saving, disabled, esgFilter, hideWeights, effectiveEditable, onDelete }: {
  section: CritSection; idx: number; onUpdate: OnUpdate; onOpenLevels: (item: CritItem) => void;
  saving: SavingState; disabled?: boolean; esgFilter?: string; hideWeights?: boolean;
  effectiveEditable?: boolean; onDelete?: (id: string) => void;
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [showAddRow,    setShowAddRow]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEsgSection = /^(PRE|POST)-ESG$/i.test(section.code ?? '');
  const defaultGW    = { "1": 33.33, "2": 33.33, "3": 33.34 };
  const [groupWeights, setGroupWeights] = useState<Record<string, number>>(
    () => section.groupWeights ? { ...section.groupWeights } : { ...defaultGW }
  );
  const [groupLabels, setGroupLabels] = useState<Record<string, { th: string; en: string }>>(() => ({ ...(section.groupLabels ?? {}) }));
  const [savingGW, setSavingGW] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [removingGroupKey, setRemovingGroupKey] = useState<string | null>(null);
  const liveGroups = deriveEsgGroups(section, groupWeights, groupLabels);
  const gwTotal = liveGroups.reduce((s, g) => s + (parseFloat(String(groupWeights[g.key])) || 0), 0);
  const gwOk    = Math.abs(gwTotal - 100) < 0.1;

  const saveGroupWeights = async () => {
    if (!gwOk) return;
    setSavingGW(true);
    try {
      // Saving the group % alone only touched the group_weights column —
      // the per-item default_weight for every ESG1/ESG2/ESG3 sub-item was
      // never persisted, so the DB stayed out of sync with what was shown
      // on screen (which is just a live client-side computation). Compute
      // and push the resulting item weights for BOTH HO and Factory subsets
      // (group % is shared between them) alongside the group_weights save.
      const itemWeights = {
        ...computeEsgEffectiveWeights(section.items, section.totalWeight, groupWeights, 'ho'),
        ...computeEsgEffectiveWeights(section.items, section.totalWeight, groupWeights, 'factory'),
      };
      await onUpdate("save-cat", section.id, { groupWeights, groupLabels, itemWeights });
    } finally {
      setSavingGW(false);
    }
  };

  // Add a brand-new ESG sub-group: next unused numeric key, weight rebalanced
  // to an equal split across (current groups + 1). Items for it get added
  // afterward through the normal "add item" flow using this key as the code
  // prefix (e.g. ESG4.1) — applyOverrides() synthesizes the group's divider
  // once it sees groupWeights carrying this key.
  const handleAddGroup = async (th: string, en: string) => {
    const existingKeys = liveGroups.map(g => Number(g.key));
    const nextKey = String((existingKeys.length ? Math.max(...existingKeys) : 0) + 1);
    const nextCount = liveGroups.length + 1;
    const each = r2adm(100 / nextCount);
    const newGW: Record<string, number> = {};
    liveGroups.forEach((g, i) => { newGW[g.key] = i === liveGroups.length - 1 ? r2adm(100 - each * (nextCount - 1)) : each; });
    newGW[nextKey] = each;
    const newGL = { ...groupLabels, [nextKey]: { th, en } };
    setGroupWeights(newGW);
    setGroupLabels(newGL);
    setAddingGroup(false);
    setSavingGW(true);
    try {
      const itemWeights = {
        ...computeEsgEffectiveWeights(section.items, section.totalWeight, newGW, 'ho'),
        ...computeEsgEffectiveWeights(section.items, section.totalWeight, newGW, 'factory'),
      };
      await onUpdate("save-cat", section.id, { groupWeights: newGW, groupLabels: newGL, itemWeights });
    } finally {
      setSavingGW(false);
    }
  };

  // Remove an ESG sub-group entirely (including the original 3) — soft-
  // deletes every item under its code prefix and rebalances the remaining
  // groups to an equal split. At least 1 group must remain.
  const handleRemoveGroup = async (key: string) => {
    if (liveGroups.length <= 1) return;
    const remaining = liveGroups.filter(g => g.key !== key);
    const each = r2adm(100 / remaining.length);
    const newGW: Record<string, number> = {};
    remaining.forEach((g, i) => { newGW[g.key] = i === remaining.length - 1 ? r2adm(100 - each * (remaining.length - 1)) : each; });
    const newGL = { ...groupLabels };
    delete newGL[key];
    const itemIds = section.items
      .filter(it => !it.divider && new RegExp(`^ESGF?${key}\\.`, 'i').test(it.code ?? ''))
      .map(it => it.id);
    const itemWeights = {
      ...computeEsgEffectiveWeights(section.items, section.totalWeight, newGW, 'ho'),
      ...computeEsgEffectiveWeights(section.items, section.totalWeight, newGW, 'factory'),
    };
    setGroupWeights(newGW);
    setGroupLabels(newGL);
    setRemovingGroupKey(null);
    await onUpdate("remove-esg-group", section.id, { itemIds, groupWeights: newGW, groupLabels: newGL, itemWeights });
  };
  const isSavingSection = saving?.type === "category" && saving?.id === section.id;
  const isSavingNew     = saving?.type === "new-item";
  let activeItems = section.items.filter(it => it.isActive !== false);
  if (esgFilter === "ho")      activeItems = activeItems.filter(it => !isEsgFactory(it.code));
  if (esgFilter === "factory") activeItems = activeItems.filter(it =>  isEsgFactory(it.code));

  // Compute effective weights:
  //   - effectiveEditable (Function modules): editable effective weight display
  //   - isEsgSection: read-only per-item weight from groupWeights (live preview)
  const effectiveWeights = effectiveEditable
    ? computeEffectiveWeights(activeItems, section.totalWeight)
    : isEsgSection && (section.totalWeight ?? 0) > 0
      ? computeEsgEffectiveWeights(section.items, section.totalWeight, groupWeights, esgFilter)
      : null;

  // "น้ำหนัก" ถูกซ่อนใน AddItemRow อยู่แล้วเมื่อ hideWeights=true (ดู colSpan
  // ด้านล่าง) — thead/ItemRow ต้องซ่อนคอลัมน์เดียวกันด้วย ไม่งั้นหัวตาราง
  // กับแถวข้อมูลจะมีจำนวนคอลัมน์ไม่ตรงกัน (เช่นตอนแสดง Function module)
  const colCount = hideWeights ? 5 : 6;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.07)",
      marginBottom: 14, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
        borderBottom: expanded ? "1px solid #e8f0e8" : "none",
        background: expanded ? "#f6faf6" : "#fff", cursor: "pointer",
      }}>
        <button onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 0, lineHeight: 1 }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <span style={{
          minWidth: 28, height: 28, borderRadius: "50%", background: "#1b5e20",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>{idx + 1}</span>
        <div style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
          <TextEdit value={section.nameTh} disabled={disabled} multiline={false}
            onChange={v => onUpdate("cat-name", section.id, { nameTh: v })}
            onSave={v => onUpdate("save-cat", section.id, { nameTh: v })}
            style={{ fontWeight: 700, fontSize: 14 }}
          />
        </div>
        {!hideWeights && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: 12, color: "#888", fontFamily: FONT }}>แก้ไขน้ำหนัก:</span>
            <WeightInput value={section.totalWeight} disabled={disabled}
              onChange={v => onUpdate("cat-weight", section.id, { totalWeight: v })}
              onSave={v => onUpdate("save-cat", section.id, { totalWeight: v })}
            />
          </div>
        )}
        {isSavingSection && (
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite", color: "#aaa", flexShrink: 0 }} />
        )}
        {onDelete && !disabled && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11, color: "#b71c1c", fontFamily: FONT, whiteSpace: "nowrap" }}>ยืนยันลบ?</span>
                <button onClick={() => { setConfirmDelete(false); onDelete(section.id); }}
                  style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "#b71c1c", color: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ลบ
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  style={{ padding: "3px 8px", borderRadius: 6, border: "1.5px solid #ddd", background: "#fff", fontFamily: FONT, fontSize: 12, cursor: "pointer" }}>
                  ยกเลิก
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                title="ลบหัวข้อนี้"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, lineHeight: 1, borderRadius: 6, transition: "color .15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#b71c1c"}
                onMouseLeave={e => e.currentTarget.style.color = "#ccc"}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && isEsgSection && !hideWeights && (
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid #e8f0e8",
          background: "#f9fdf9",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 10 }}>
            น้ำหนักหมวดย่อย
            <span style={{ fontWeight: 400, color: "#999", marginLeft: 6, fontSize: 11 }}>รวมต้องได้ 100%</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {liveGroups.map(g => (
              <div key={g.key} style={{
                display: "flex", flexDirection: "column", gap: 4, minWidth: 150,
                padding: 8, borderRadius: 8, background: removingGroupKey === g.key ? "#fff5f5" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%", background: g.color, flexShrink: 0,
                  }} />
                  <input
                    value={g.label} disabled={disabled}
                    onChange={e => setGroupLabels(prev => ({ ...prev, [g.key]: { ...prev[g.key], th: e.target.value, en: prev[g.key]?.en ?? g.en } }))}
                    placeholder="ชื่อกลุ่ม (ไทย)"
                    style={{
                      flex: 1, minWidth: 0, fontFamily: FONT, fontSize: 11, fontWeight: 700, color: g.color,
                      border: "1px solid transparent", borderRadius: 4, padding: "2px 4px", outline: "none", background: "transparent",
                    }}
                    onFocus={e => (e.target.style.borderColor = `${g.color}60`)}
                    onBlur={e => (e.target.style.borderColor = "transparent")}
                  />
                  {!disabled && (
                    removingGroupKey === g.key ? (
                      <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        <button onClick={() => handleRemoveGroup(g.key)} title="ยืนยันลบกลุ่ม"
                          style={{ background: "#b71c1c", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, padding: "2px 6px", cursor: "pointer", fontFamily: FONT, fontWeight: 700 }}>
                          ลบ
                        </button>
                        <button onClick={() => setRemovingGroupKey(null)} title="ยกเลิก"
                          style={{ background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: 4, fontSize: 10, padding: "2px 6px", cursor: "pointer", fontFamily: FONT }}>
                          ยกเลิก
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setRemovingGroupKey(g.key)} title="ลบกลุ่มนี้ (รวมหัวข้อทั้งหมดในกลุ่ม)"
                        disabled={liveGroups.length <= 1}
                        style={{
                          background: "none", border: "none", cursor: liveGroups.length <= 1 ? "not-allowed" : "pointer",
                          color: liveGroups.length <= 1 ? "#ddd" : "#ccc", padding: 2, flexShrink: 0, lineHeight: 1,
                        }}>
                        <Trash2 size={12} />
                      </button>
                    )
                  )}
                </div>
                <input
                  value={g.en} disabled={disabled}
                  onChange={e => setGroupLabels(prev => ({ ...prev, [g.key]: { ...prev[g.key], th: prev[g.key]?.th ?? g.label, en: e.target.value } }))}
                  placeholder="Group name (English)"
                  style={{
                    fontFamily: FONT, fontSize: 10, color: "#aaa",
                    border: "1px solid transparent", borderRadius: 4, padding: "1px 4px", outline: "none", background: "transparent",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#ddd")}
                  onBlur={e => (e.target.style.borderColor = "transparent")}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number" min={0} max={100} step={0.01}
                    value={groupWeights[g.key] ?? ""}
                    disabled={disabled}
                    onChange={e => setGroupWeights(prev => ({ ...prev, [g.key]: Number(e.target.value) }))}
                    style={{
                      width: 72, padding: "5px 8px", borderRadius: 6, fontFamily: FONT, fontSize: 13,
                      border: `1.5px solid ${g.color}60`, outline: "none", textAlign: "right",
                    }}
                    onFocus={e => (e.target.style.borderColor = g.color)}
                    onBlur={e => (e.target.style.borderColor = `${g.color}60`)}
                  />
                  <span style={{ fontSize: 12, color: "#888" }}>%</span>
                </div>
              </div>
            ))}

            {!disabled && (
              addingGroup ? (
                <AddEsgGroupInline onSave={handleAddGroup} onCancel={() => setAddingGroup(false)} saving={savingGW} />
              ) : (
                <button onClick={() => setAddingGroup(true)}
                  style={{
                    alignSelf: "center", display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px", borderRadius: 7, border: "1.5px dashed #a5d6a7",
                    background: "#f0fff4", color: "#1b5e20", fontFamily: FONT, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                  + เพิ่มกลุ่ม
                </button>
              )
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: gwOk ? "#2e7d32" : "#b71c1c", fontWeight: 700 }}>
                รวม: {r2adm(gwTotal)}%{gwOk ? " ✓" : " ≠ 100%"}
              </span>
              <button onClick={saveGroupWeights} disabled={disabled || savingGW || !gwOk}
                style={{
                  padding: "5px 14px", borderRadius: 7, border: "none", fontFamily: FONT, fontSize: 12,
                  fontWeight: 700, cursor: (disabled || savingGW || !gwOk) ? "not-allowed" : "pointer",
                  background: gwOk ? "#1b5e20" : "#ccc", color: "#fff",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                {savingGW ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f0f7f0" }}>
                <th style={TH}>รหัส</th>
                <th style={{ ...TH, textAlign: "left" }}>ชื่อหัวข้อ (คลิกเพื่อแก้ไข)</th>
                {!hideWeights && (
                  <th style={TH}>
                    น้ำหนัก{effectiveWeights && !effectiveEditable && !isEsgSection ? " (คำนวณ)" : ""}
                  </th>
                )}
                <th style={TH}>ระดับ</th>
                <th style={TH}>แก้ระดับ</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {activeItems.length === 0 && !showAddRow
                ? <tr><td colSpan={colCount} style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>ไม่มีรายการ — กด &quot;+ เพิ่ม item&quot; เพื่อเพิ่ม</td></tr>
                : activeItems.map(item => (
                  <ItemRow key={item.id ?? item.code} item={item}
                    onUpdate={onUpdate} onOpenLevels={onOpenLevels}
                    saving={saving} disabled={disabled}
                    effectiveWeight={effectiveWeights?.[item.id]}
                    hideWeight={hideWeights}
                    editableEffective={effectiveEditable}
                    esgEditable={isEsgSection}
                  />
                ))
              }
              {showAddRow && (
                <AddItemRow saving={isSavingNew} onCancel={() => setShowAddRow(false)}
                  defaultCode={nextItemCode(section.code, section.items, esgFilter)}
                  onSave={data => {
                    setShowAddRow(false);
                    onUpdate("add-item", section.id, {
                      ...data,
                      categoryId:  section.id,
                      criteriaSet: getCriteriaSetFromCode(section.code),
                    });
                  }}
                />
              )}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: "1px solid #e8f0e8" }}>
            <button onClick={() => setShowAddRow(true)} disabled={disabled || showAddRow}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 7, border: "1.5px dashed #a5d6a7",
                background: "#f6faf6", color: "#1b5e20", fontFamily: FONT, fontSize: 12,
                fontWeight: 600, cursor: disabled || showAddRow ? "not-allowed" : "pointer",
                opacity: showAddRow ? 0.5 : 1,
              }}
            >+ เพิ่ม item</button>
          </div>
          {!effectiveWeights && activeItems.length > 0 && (() => {
            const sum = activeItems.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
            const diff = Math.abs(sum - (section.totalWeight ?? 0));
            if (diff < 0.01) return null;
            return (
              <div style={{
                padding: "8px 18px", background: "#fff8e1",
                borderTop: "1px solid #ffe082", display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, color: "#e65100", fontFamily: FONT,
              }}>
                <AlertCircle size={13} />
                น้ำหนักรายการรวมได้ {sum.toFixed(1)} ≠ น้ำหนักหัวข้อ {section.totalWeight}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── PartCard ──────────────────────────────────────────────────
function PartCard({ label, weight, weightLabel, avgInfo, accent = "#1b5e20", onWeightSave, disabled, warning, warningMsg, children }: {
  label: string; weight?: number | null; weightLabel?: string; avgInfo?: string; accent?: string;
  onWeightSave?: (v: number) => void; disabled?: boolean; warning?: boolean; warningMsg?: string; children: ReactNode;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      boxShadow: "0 2px 10px rgba(0,0,0,.07)",
      marginBottom: 20, overflow: "hidden",
      border: `1.5px solid ${accent}22`,
    }}>
      <div style={{
        background: `${accent}0d`, padding: "12px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1.5px solid ${accent}22`,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: accent }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {avgInfo && (
            <span style={{ fontSize: 12, color: "#888", fontFamily: "Sarabun, sans-serif" }}>
              {avgInfo}
            </span>
          )}
          {warning && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#fff3e0", border: "1.5px solid #ffb74d",
              borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#e65100",
            }}>
              <AlertCircle size={11} />
              {warningMsg ?? "ผลรวมหัวข้อเพี้ยน — กดแก้น้ำหนักรวม"}
            </div>
          )}
          {weight != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#888" }}>{weightLabel ?? "น้ำหนักรวม:"}</span>
              {onWeightSave
                ? <WeightInput value={weight} disabled={disabled}
                    onChange={() => {}} onSave={onWeightSave} />
                : <span style={{
                    background: `${accent}18`, color: accent,
                    fontWeight: 800, fontSize: 13,
                    padding: "2px 10px", borderRadius: 6,
                    border: `1.5px solid ${accent}30`,
                  }}>{typeof weight === "number" ? weight.toFixed(1) : weight}</span>
              }
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "12px" }}>{children}</div>
    </div>
  );
}

// ── EsgFilterBtn ───────────────────────────────────────────────
function EsgFilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 18px", borderRadius: 20,
      border: `1.5px solid ${active ? "#1b5e20" : "#ddd"}`,
      background: active ? "#1b5e20" : "#fff",
      color: active ? "#fff" : "#666",
      fontFamily: FONT, fontSize: 13, fontWeight: active ? 700 : 400,
      cursor: "pointer", transition: "all .15s",
    }}>{children}</button>
  );
}

// ── SegButton: reusable tab/toggle button ─────────────────────
function SegButton({ active, onClick, children, style = {} }: {
  active: boolean; onClick: () => void; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick}
      style={{
        padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
        fontFamily: FONT, fontSize: 13, fontWeight: active ? 700 : 400,
        background: active ? "#1b5e20" : "transparent",
        color: active ? "#fff" : "#555", transition: "all .15s", ...style,
      }}
    >{children}</button>
  );
}

// ── Main component ────────────────────────────────────────────
export default function AdminCriteriaEditor() {
  const [evalType,        setEvalType]        = useState("pre_eval");
  const [coreEsgSections, setCoreEsgSections] = useState<CritSection[]>([]);
  const [funcSections,    setFuncSections]    = useState<CritSection[]>([]);
  const [esgFilter,       setEsgFilter]       = useState("ho"); // "ho" | "factory"
  const [loading,         setLoading]         = useState(false);
  const [saving,          setSaving]          = useState<SavingState>(null);
  const [toast,           setToast]           = useState<ToastState | null>(null);
  const [levelsModal,     setLevelsModal]     = useState<CritItem | null>(null);
  const [seeding,         setSeeding]         = useState(false);
  const [addingSection,   setAddingSection]   = useState<"core" | "esg" | null>(null);
  const [addingFuncMod,   setAddingFuncMod]   = useState(false);
  const [savingSection,   setSavingSection]   = useState(false);
  const [coreTarget,      setCoreTarget]      = useState<number | null>(null); // authorized Core total
  const [esgTarget,       setEsgTarget]       = useState<number | null>(null); // authorized ESG total
  const esgNormalized  = useRef({ ho: false, factory: false });
  const coreNormalized = useRef(false);
  // Ground-truth mirror of what's actually in DB for coreEsgSections.
  // ALL buffer/scale calculations use this instead of React state, so unsaved
  // cat-weight cascades never corrupt handleCoreWeightSave or cross-section edits.
  const savedSections = useRef<CritSection[] | null>(null);
  const reloadContext = useCriteriaReload();

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadAll = useCallback(async (et: string) => {
    setLoading(true);
    esgNormalized.current  = { ho: false, factory: false };
    coreNormalized.current = false;
    savedSections.current  = null;
    try {
      const track = et === 'post_eval' ? 'post' : 'pre';
      const [r1, r2] = await Promise.all([
        authFetch(`/api/criteria?evalType=${et}`),
        authFetch(`/api/criteria?evalType=function&track=${track}`),
      ]);
      if (!r1.ok || !r2.ok) throw new Error();
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]) as [CritSection[], CritSection[]];
      setCoreEsgSections(d1);
      setFuncSections(d2);
      savedSections.current = d1;
      const isEsg = isEsgCategory;
      setCoreTarget(d1.filter(s => !isEsg(s)).reduce((s, c) => s + (parseFloat(String(c.totalWeight)) || 0), 0));
      setEsgTarget(d1.filter(s =>  isEsg(s)).reduce((s, c) => s + (parseFloat(String(c.totalWeight)) || 0), 0));
    } catch {
      showToast("โหลดข้อมูลไม่สำเร็จ — ตรวจสอบว่า server กำลังทำงานอยู่", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(evalType); esgNormalized.current = { ho: false, factory: false }; }, [evalType, loadAll]);

  const isESGSection = isEsgCategory;
  const coreSections = useMemo(() => coreEsgSections.filter(s => !isESGSection(s)), [coreEsgSections]);
  const esgSections  = useMemo(() => coreEsgSections.filter(s => isESGSection(s)),  [coreEsgSections]);

  // ── Seed ────────────────────────────────────────────────────
  const callSeed = useCallback(async (reset = false) => {
    setSeeding(true);
    try {
      const payload = buildSeedPayload();
      const r = await authFetch('/api/criteria/seed', {
        method: 'POST',
        body: JSON.stringify({ sections: payload, reset }),
      });
      const contentType = r.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json'))
        throw new Error(`Server ไม่ตอบสนอง (${r.status}) — รีสตาร์ท server แล้วลองใหม่`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      showToast(data.message ?? 'นำเข้าข้อมูลสำเร็จ');
      await loadAll(evalType);
      reloadContext();
    } catch (err) {
      showToast((err as Error).message || 'นำเข้าข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setSeeding(false);
    }
  }, [evalType, loadAll, showToast, reloadContext]);

  const handleSeed      = useCallback(() => callSeed(false), [callSeed]);

  // ── Function total weight: patch all M1-M7 sections at once ──
  const handleFuncWeightSave = useCallback(async (newWeight: number) => {
    setFuncSections(prev => prev.map(s => ({ ...s, totalWeight: newWeight })));
    try {
      await Promise.all(funcSections.map(s =>
        authFetch(`/api/criteria/categories/${s.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: s.nameTh, totalWeight: newWeight }),
        })
      ));
      showToast("บันทึกน้ำหนัก Function สำเร็จ");
      reloadContext();
    } catch {
      showToast("บันทึกน้ำหนัก Function ไม่สำเร็จ", "error");
      loadAll(evalType);
    }
  }, [funcSections, evalType, showToast, loadAll, reloadContext]);

  // ── Add section ──────────────────────────────────────────────
  const handleAddSection = useCallback(async (codePrefix: string | null, nameTh: string, totalWeight: number, isFunc = false) => {
    setSavingSection(true);
    try {
      const body = isFunc
        ? { nameTh, totalWeight, type: 'function', track: evalType === 'post_eval' ? 'post' : 'pre' }
        : { codePrefix, nameTh, totalWeight };
      const r = await authFetch('/api/criteria/categories', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message ?? '');
      const raw = await r.json();
      // Normalize numeric fields (pg returns numerics as strings)
      const newSec: CritSection = { ...raw, totalWeight: parseFloat(raw.totalWeight) || 0, displayOrder: Number(raw.displayOrder) || 0, items: [] };
      if (isFunc) setFuncSections(prev => [...prev, newSec]);
      else {
        setCoreEsgSections(prev => [...prev, newSec]);
        savedSections.current = [...(savedSections.current ?? []), newSec];
      }
      setAddingSection(null);
      setAddingFuncMod(false);
      showToast('เพิ่มหัวข้อสำเร็จ');
      reloadContext();
    } catch (err) {
      showToast((err as Error).message || 'เพิ่มหัวข้อไม่สำเร็จ', 'error');
    } finally {
      setSavingSection(false);
    }
  }, [evalType, showToast, reloadContext]);

  // ── Delete section ───────────────────────────────────────────
  const handleDeleteSection = useCallback(async (id: string) => {
    setSaving({ type: "category", id });
    try {
      const r = await authFetch(`/api/criteria/categories/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? '');
      setCoreEsgSections(prev => prev.filter(s => s.id !== id));
      setFuncSections(prev => prev.filter(s => s.id !== id));
      if (savedSections.current) savedSections.current = savedSections.current.filter(s => s.id !== id);
      showToast('ลบหัวข้อสำเร็จ');
      reloadContext();
    } catch (err) {
      showToast((err as Error).message || 'ลบหัวข้อไม่สำเร็จ', 'error');
    } finally {
      setSaving(null);
    }
  }, [showToast, reloadContext]);

  // ── handleUpdate (unified across both datasets) ──────────────
  const handleUpdate: OnUpdate = useCallback(async (action, id, payload) => {
    const inFunc = (
      funcSections.some(s => s.id === id) ||
      funcSections.some(s => s.items?.some(it => it.id === id))
    );
    const setSecs = inFunc ? setFuncSections : setCoreEsgSections;
    const isEsgSec = isEsgCategory;

    if (action === "cat-name") {
      setSecs(prev => prev.map(s => s.id === id ? { ...s, nameTh: payload.nameTh! } : s));
      return;
    }

    if (action === "cat-weight") {
      if (!inFunc) {
        const current = coreEsgSections.find(s => s.id === id);
        const isEsg = isEsgSec(current ?? {});
        const pool = coreEsgSections.filter(s => isEsgSec(s) === isEsg);
        const clamped = Math.max(0, Number(payload.totalWeight) || 0);
        const oldSum = pool.reduce((s, c) => s + (c.totalWeight ?? 0), 0);
        if (oldSum < 0.005) {
          // First time: all sections in pool start at 0 → set all equal to clamped
          setSecs(prev => prev.map(s => {
            if (!pool.some(p => p.id === s.id)) return s;
            const scales = scaleSectionItemsToTotal(s, clamped);
            return { ...s, totalWeight: clamped, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }));
          return;
        }
        const bufResult = getCatBuffer(pool, id, clamped);
        if (bufResult.tooLarge) {
          showToast("น้ำหนักเกิน — แก้ตัวก่อนหน้าก่อน", "error");
          return;
        }
        // Single-section ESG: no buffer → block if over esgTarget budget
        if (isEsg && pool.length < 2 && esgTarget !== null && clamped > esgTarget + 0.005) {
          showToast(`น้ำหนัก ESG เกิน ${esgTarget}% — กดแก้น้ำหนักรวม ESG ก่อน`, "error");
          return;
        }
        setSecs(prev => prev.map(s => {
          if (s.id === id) {
            const scales = scaleSectionItemsToTotal(s, clamped);
            return { ...s, totalWeight: clamped, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }
          const adjW = bufResult.adjustments?.[s.id];
          if (adjW !== undefined) {
            const scales = scaleSectionItemsToTotal(s, adjW);
            return { ...s, totalWeight: adjW, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }
          return s;
        }));
      } else {
        setSecs(prev => prev.map(s => s.id === id ? { ...s, totalWeight: payload.totalWeight! } : s));
      }
      return;
    }

    if (action === "item-name") {
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, nameTh: payload.nameTh! } : it),
      })));
      return;
    }
    if (action === "item-code") {
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, code: payload.code! } : it),
      })));
      return;
    }

    if (action === "item-weight") {
      const allSecs = inFunc ? funcSections : coreEsgSections;
      const sec = allSecs.find(s => s.items?.some(it => it.id === id));
      if (!sec) {
        // หา item ใน allSecs ไม่เจอ — setSecs (ทำงานบนชุดข้อมูลเดียวกัน)
        // จะหาไม่เจอเหมือนกันแน่นอน ไม่มีอะไรให้ patch ได้จริง แค่ log ไว้เผื่อ
        // debug แล้วออกเลย ไม่ต้อง trigger re-render เปล่าๆ
        console.warn(`[AdminCriteriaEditor] item-weight: ไม่พบ item id=${id} ใน section ที่โหลดไว้`);
        return;
      }
      // Use saved (DB) state for the section, not the live React state
      const snapSec = (savedSections.current ?? coreEsgSections).find(s => s.items?.some(it => it.id === id)) ?? sec;

      // ESG sections: rebalance within the item's OWN ESG1/ESG2/ESG3
      // sub-group only (filtered to the current HO/Factory subset), so the
      // group's configured % stays fixed instead of bleeding into other groups.
      if (!inFunc && isEsgSec(snapSec)) {
        const esgPool = snapSec.items.filter(it => {
          if (it.isActive === false) return false;
          if (esgFilter === "ho") return !isEsgFactory(it.code);
          if (esgFilter === "factory") return isEsgFactory(it.code);
          return true;
        });
        const buf = getEsgItemBuffer(esgPool, snapSec.totalWeight, snapSec.groupWeights, id, payload.defaultWeight!);
        setSecs(prev => prev.map(s => ({
          ...s, items: s.items.map(it => {
            if (it.id === id) return { ...it, defaultWeight: buf.clamped };
            const adjW = buf.adjustments?.[it.id];
            if (adjW !== undefined) return { ...it, defaultWeight: adjW };
            return it;
          }),
        })));
        return;
      }

      const activeItems = snapSec.items.filter(it => it.isActive !== false);
      const itemOldSum = activeItems.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
      const itemClamped = Math.max(0, Number(payload.defaultWeight) || 0);
      if (itemOldSum < 0.005) {
        // First time: all items start at 0 → set all equal to clamped
        setSecs(prev => prev.map(s => ({
          ...s, items: s.items.map(it => activeItems.some(x => x.id === it.id) ? { ...it, defaultWeight: itemClamped } : it),
        })));
        return;
      }
      const buf = getItemBuffer(sec, id, payload.defaultWeight!);
      if (buf.tooLarge) {
        showToast("น้ำหนักเกิน — แก้ตัวก่อนหน้าก่อน", "error");
        return;
      }
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => {
          if (it.id === id) return { ...it, defaultWeight: Math.max(0, Number(payload.defaultWeight) || 0) };
          const adjW = buf.adjustments?.[it.id];
          if (adjW !== undefined) return { ...it, defaultWeight: adjW };
          return it;
        }),
      })));
      return;
    }

    if (action === "add-item") {
      setSaving({ type: "new-item" });
      try {
        const r = await authFetch('/api/criteria/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error((await r.json()).message ?? '');
        showToast('เพิ่มรายการสำเร็จ');
        await loadAll(evalType);
        reloadContext();
      } catch (err) {
        showToast((err as Error).message || 'เพิ่มรายการไม่สำเร็จ', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }

    if (action === "delete-item") {
      setSaving({ type: "item", id });
      try {
        const r = await authFetch(`/api/criteria/items/${id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();
        setSecs(prev => prev.map(s => ({
          ...s, items: s.items.filter(it => it.id !== id),
        })));
        esgNormalized.current = { ho: false, factory: false };
        showToast('ลบรายการสำเร็จ');
        reloadContext();
      } catch {
        showToast('ลบรายการไม่สำเร็จ', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }

    // Remove an entire ESG sub-group (e.g. admin deletes "Governance"): soft-
    // deletes every item under that group's code prefix, then persists the
    // rebalanced groupWeights/groupLabels + recomputed item weights for the
    // groups that remain — all in one action so it's one toast, one state
    // update, instead of stacking one "ลบรายการสำเร็จ" toast per item.
    if (action === "remove-esg-group") {
      setSaving({ type: "category", id });
      try {
        await Promise.all((payload.itemIds ?? []).map(itemId =>
          authFetch(`/api/criteria/items/${itemId}`, { method: 'DELETE' })
        ));
        await authFetch(`/api/criteria/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ groupWeights: payload.groupWeights, groupLabels: payload.groupLabels }),
        });
        await Promise.all(Object.entries(payload.itemWeights ?? {}).map(([itemId, w]) => {
          const it = coreEsgSections.find(s => s.id === id)?.items?.find(x => x.id === itemId);
          if (!it) return Promise.resolve();
          return authFetch(`/api/criteria/items/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
          });
        }));
        setSecs(prev => prev.map(s => {
          if (s.id !== id) return s;
          const removedIds = new Set(payload.itemIds);
          return {
            ...s,
            groupWeights: payload.groupWeights,
            groupLabels:  payload.groupLabels,
            items: s.items
              .filter(it => !removedIds.has(it.id))
              .map(it => payload.itemWeights?.[it.id] !== undefined ? { ...it, defaultWeight: payload.itemWeights![it.id] } : it),
          };
        }));
        esgNormalized.current = { ho: false, factory: false };
        showToast('ลบกลุ่มสำเร็จ');
        reloadContext();
      } catch {
        showToast('ลบกลุ่มไม่สำเร็จ', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }

    if (action === "save-cat") {
      setSaving({ type: "category", id });
      try {
        const allSecs = inFunc ? funcSections : coreEsgSections;
        const current = allSecs.find(s => s.id === id);

        // Pre-flight: validate section weight against buffer BEFORE touching DB.
        // This prevents the category row from being saved with an over-budget weight
        // that would leave the buffer section in an impossible negative state.
        let poolBuf: { clamped: number; pool: CritSection[]; buf: ReturnType<typeof getCatBuffer> } | null = null;
        if (!inFunc && payload.totalWeight != null) {
          const clamped = Math.max(0, Number(payload.totalWeight) || 0);
          const isEsg   = isEsgSec(current ?? {});
          const pool    = coreEsgSections.filter(s => isEsgSec(s) === isEsg);
          const buf     = getCatBuffer(pool, id, clamped);
          if (buf.tooLarge) {
            showToast("น้ำหนักเกินขีดจำกัด — ลดน้ำหนักหัวข้ออื่นก่อน", "error");
            return;
          }
          // Single-section ESG: no buffer section to absorb → compare directly vs esgTarget
          if (isEsg && pool.length < 2 && esgTarget !== null && clamped > esgTarget + 0.005) {
            showToast(`น้ำหนัก ESG เกิน ${esgTarget}% — กดแก้น้ำหนักรวม ESG ก่อน`, "error");
            return;
          }
          poolBuf = { clamped, pool, buf };
        }

        const body = { ...current, ...payload };
        const patchBody: Record<string, unknown> = { nameTh: body.nameTh, totalWeight: body.totalWeight };
        if (payload.groupWeights !== undefined) patchBody.groupWeights = payload.groupWeights;
        if (payload.groupLabels  !== undefined) patchBody.groupLabels  = payload.groupLabels;
        const r = await authFetch(`/api/criteria/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        });
        if (!r.ok) throw new Error();
        // Persist buffer section + scaled items when a Core/ESG weight changed
        if (poolBuf) {
          const { clamped, pool, buf } = poolBuf;

          // Save items in main section (proportional — preserves custom ratios)
          const mainScales = current ? scaleSectionItemsToTotal(current, clamped) : {};
          await Promise.all(Object.entries(mainScales).map(([itemId, w]) => {
            const it = current?.items?.find(x => x.id === itemId);
            if (!it) return Promise.resolve();
            return authFetch(`/api/criteria/items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
            });
          }));

          // Save buffer sections + their items
          if (buf.adjustments) {
            await Promise.all(Object.entries(buf.adjustments).map(async ([secId, w]) => {
              const bufSec = pool.find(s => s.id === secId);
              if (!bufSec) return;
              await authFetch(`/api/criteria/categories/${secId}`, {
                method: "PATCH",
                body: JSON.stringify({ nameTh: bufSec.nameTh, totalWeight: w }),
              });
              const bufScales = scaleSectionItemsToTotal(bufSec, w);
              await Promise.all(Object.entries(bufScales).map(([itemId, iw]) => {
                const it = bufSec.items.find(x => x.id === itemId);
                if (!it) return Promise.resolve();
                return authFetch(`/api/criteria/items/${itemId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: iw }),
                });
              }));
            }));
          }
        }
        // ESG group % save: push the resulting per-item weights (computed
        // client-side from the new groupWeights) to the DB too — otherwise
        // only the group_weights column changes and every ESG1/ESG2/ESG3
        // sub-item's default_weight stays stale.
        if (payload.itemWeights) {
          await Promise.all(Object.entries(payload.itemWeights).map(([itemId, w]) => {
            const it = current?.items?.find(x => x.id === itemId);
            if (!it) return Promise.resolve();
            return authFetch(`/api/criteria/items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
            });
          }));
        }
        // Update local state
        setSecs(prev => prev.map(s => {
          if (s.id !== id) return s;
          const updated = { ...s };
          if (payload.nameTh       !== undefined) updated.nameTh       = payload.nameTh;
          if (payload.totalWeight  !== undefined) updated.totalWeight  = Number(payload.totalWeight);
          if (payload.groupWeights !== undefined) updated.groupWeights = payload.groupWeights;
          if (payload.groupLabels  !== undefined) updated.groupLabels  = payload.groupLabels;
          if (payload.itemWeights) {
            updated.items = s.items.map(it =>
              payload.itemWeights![it.id] !== undefined ? { ...it, defaultWeight: payload.itemWeights![it.id] } : it
            );
          }
          return updated;
        }));
        showToast("บันทึกหัวข้อสำเร็จ");
        reloadContext();
      } catch {
        showToast("บันทึกหัวข้อไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
      return;
    }

    if (action === "normalize-esg") {
      const allSecs = inFunc ? funcSections : coreEsgSections;
      const sec = allSecs.find(s => s.id === id);
      if (!sec) return;
      const pool = sec.items.filter(it => {
        if (it.isActive === false) return false;
        if (esgFilter === "ho")      return !isEsgFactory(it.code);
        if (esgFilter === "factory") return  isEsgFactory(it.code);
        return true;
      });
      // Per-group equal split (respects groupWeights), and only fills in
      // groups that still have an un-set item — a flat whole-section split
      // (the old behavior) ignored group boundaries entirely and would
      // silently wipe out any custom per-item weights on every reload.
      const grpOf = (code: string | null | undefined) => (code ?? '').match(/^ESGF?(\d+)\./i)?.[1] ?? null;
      const byGroup: Record<string, CritItem[]> = {};
      pool.forEach(it => {
        const g = grpOf(it.code);
        if (g) (byGroup[g] = byGroup[g] ?? []).push(it);
      });
      const scales: Record<string, number> = {};
      Object.entries(byGroup).forEach(([grp, items]) => {
        if (!items.some(it => it.defaultWeight == null)) return; // fully customized already — leave alone
        const pct  = sec.groupWeights?.[grp] != null ? Number(sec.groupWeights[grp]) : (100 / 3);
        const absW = (pct / 100) * (sec.totalWeight ?? 0);
        const n    = items.length;
        let rem = absW;
        items.forEach((it, i) => {
          if (i === n - 1) scales[it.id] = Math.max(0, r2adm(rem));
          else { const w = r2adm(absW / n); scales[it.id] = w; rem -= w; }
        });
      });
      if (Object.keys(scales).length === 0) return;
      setSecs(prev => prev.map(s => s.id !== id ? s : {
        ...s,
        items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it),
      }));
      setSaving({ type: "category", id });
      try {
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === itemId);
          if (!it) return Promise.resolve();
          return authFetch(`/api/criteria/items/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
          });
        }));
        showToast("ปรับน้ำหนักสำเร็จ");
        reloadContext();
      } catch {
        showToast("ปรับน้ำหนักไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
      return;
    }

    // Normalize all active items in a section to equal distribution (silent, no toast)
    if (action === "normalize-sec") {
      const allSecs = inFunc ? funcSections : coreEsgSections;
      const sec = allSecs.find(s => s.id === id);
      if (!sec) return;
      const pool = sec.items.filter(it => it.isActive !== false);
      const scales = scaleItemsToTotal(pool, sec.totalWeight ?? 0, true);
      setSecs(prev => prev.map(s => s.id !== id ? s : {
        ...s,
        items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it),
      }));
      try {
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === itemId);
          if (!it) return Promise.resolve();
          return authFetch(`/api/criteria/items/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
          });
        }));
        reloadContext();
      } catch { /* silent — background cleanup */ }
      return;
    }

    if (action === "save-item") {
      setSaving({ type: "item", id });
      const allSecs = inFunc ? funcSections : coreEsgSections;
      let item: CritItem | null = null;
      let itemSec: CritSection | null = null;
      allSecs.forEach(s => s.items?.forEach(it => { if (it.id === id) { item = it; itemSec = s; } }));
      // Every SectionCard renders disabled={!!saving} — bailing out here
      // without clearing it would lock the whole editor until reload.
      if (!item) { setSaving(null); return; }
      const foundItem: CritItem = item;
      const isEsgItem = !inFunc && itemSec && isEsgSec(itemSec) && payload.defaultWeight != null;
      const esgPool = isEsgItem
        ? itemSec!.items.filter(it => {
            if (it.isActive === false) return false;
            if (esgFilter === "ho") return !isEsgFactory(it.code);
            if (esgFilter === "factory") return isEsgFactory(it.code);
            return true;
          })
        : null;
      const esgBuf = isEsgItem
        ? getEsgItemBuffer(esgPool!, itemSec!.totalWeight, itemSec!.groupWeights, id, payload.defaultWeight!)
        : null;
      // Computed up front (not after the PATCH) so a last-item edit that
      // can't be redistributed is rejected before anything hits the server
      // — previously this ran after the item's own PATCH had already
      // committed, and its tooLarge flag was never even checked, so the
      // edited item's new weight was saved with no sibling compensating it.
      const nonEsgBuf = (!isEsgItem && payload.defaultWeight != null && itemSec)
        ? getItemBuffer(itemSec, id, payload.defaultWeight)
        : null;
      if (nonEsgBuf?.tooLarge) {
        setSaving(null);
        showToast("น้ำหนักเกิน — แก้ตัวก่อนหน้าก่อน", "error");
        return;
      }
      const body = { ...foundItem, ...payload, ...(esgBuf ? { defaultWeight: esgBuf.clamped } : {}) };
      try {
        const r = await authFetch(`/api/criteria/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: body.nameTh, detailTh: body.detailTh, defaultWeight: body.defaultWeight, code: body.code }),
        });
        if (!r.ok) throw new Error();
        if (esgBuf?.adjustments) {
          await Promise.all(Object.entries(esgBuf.adjustments).map(([itemId, w]) => {
            const it = itemSec!.items.find(x => x.id === itemId);
            if (!it) return Promise.resolve();
            return authFetch(`/api/criteria/items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
            });
          }));
        } else if (nonEsgBuf?.adjustments) {
          await Promise.all(Object.entries(nonEsgBuf.adjustments).map(([itemId, w]) => {
            const it = itemSec!.items.find(x => x.id === itemId);
            if (!it) return Promise.resolve();
            return authFetch(`/api/criteria/items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
            });
          }));
        }
        showToast("บันทึกรายการสำเร็จ");
        reloadContext();
      } catch {
        showToast("บันทึกรายการไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
    }
  }, [coreEsgSections, funcSections, esgFilter, evalType, showToast, loadAll, reloadContext, esgTarget]);

  // Auto-normalize ESG item weights when filter or data changes.
  // Only fills in items that have never been set (defaultWeight == null) —
  // checking the whole-section sum against totalWeight was fragile (any
  // rounding drift across groups tripped it) and, worse, "normalize-esg"
  // used to flatten ALL groups into one equal split, wiping out any custom
  // per-item weights on every reload/tab switch.
  useEffect(() => {
    if (esgNormalized.current[esgFilter as "ho" | "factory"]) return;
    const isEsg = isEsgCategory;
    const esgSecs = coreEsgSections.filter(isEsg);
    if (!esgSecs.length) return;
    let needsNorm = false;
    esgSecs.forEach(sec => {
      const pool = sec.items.filter(it => {
        if (it.isActive === false) return false;
        return esgFilter === "factory" ? isEsgFactory(it.code) : !isEsgFactory(it.code);
      });
      if (pool.length === 0) return;
      if (pool.some(it => it.defaultWeight == null)) needsNorm = true;
    });
    esgNormalized.current[esgFilter as "ho" | "factory"] = true;
    if (needsNorm) esgSecs.forEach(sec => handleUpdate("normalize-esg", sec.id, {}));
  }, [esgFilter, coreEsgSections, handleUpdate]);

  // Auto-normalize CORE item weights on load (fixes rounding artifacts like [5.01,5.01,4.98])
  // Only normalizes when items are "approximately equal" (max−min < 0.5) but not yet exact
  useEffect(() => {
    if (coreNormalized.current) return;
    if (coreSections.length === 0) return;
    coreNormalized.current = true;
    coreSections.forEach(sec => {
      const real = sec.items.filter(it => it.isActive !== false);
      if (real.length < 2) return;
      const weights = real.map(it => it.defaultWeight ?? 0);
      const max = Math.max(...weights);
      const min = Math.min(...weights);
      if (max - min < 0.005) return; // already clean
      if (max - min >= 0.05) return; // custom weights — don't overwrite
      handleUpdate("normalize-sec", sec.id, {});
    });
  }, [coreSections, handleUpdate]);

  // ── Save levels + levelValues ────────────────────────────────
  const handleSaveLevels = useCallback(async (item: CritItem, levels: string[], levelValues: number[]) => {
    setSaving({ type: "levels", id: item.id });
    try {
      const r = await authFetch(`/api/criteria/items/${item.id}/levels`, {
        method: "PATCH",
        body: JSON.stringify({ levels, levelValues }),
      });
      if (!r.ok) throw new Error();
      const updater = (prev: CritSection[]) => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === item.id ? { ...it, levels, levelValues } : it),
      }));
      setCoreEsgSections(updater);
      setFuncSections(updater);
      showToast("บันทึกระดับคะแนนสำเร็จ");
      reloadContext();
      setLevelsModal(null);
    } catch {
      showToast("บันทึกระดับคะแนนไม่สำเร็จ", "error");
    } finally {
      setSaving(null);
    }
  }, [showToast, reloadContext]);

  // ── Core total weight: scale all Core sections proportionally (preserves ratios) ──
  const handleCoreWeightSave = useCallback(async (newTotal: number) => {
    const clamped = Math.max(0, Number(newTotal) || 0);
    const isESGSec = isEsgCategory;
    const savedCore = (savedSections.current ?? coreEsgSections).filter(s => !isESGSec(s));
    const n = savedCore.length || 1;
    const newWeights: Record<string, number> = {};
    // Always equal distribution across all CORE sections
    const each = r2adm(clamped / n);
    let rem = clamped;
    savedCore.forEach((sec, i) => {
      if (i === n - 1) { newWeights[sec.id] = Math.max(0, r2adm(rem)); }
      else { newWeights[sec.id] = each; rem -= each; }
    });
    const syncCore = (prev: CritSection[]) => prev.map(s => {
      const newW = newWeights[s.id];
      if (newW === undefined) return s;
      const scales = scaleItemsToTotal(s.items, newW, true);
      return { ...s, totalWeight: newW, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
    });
    setCoreEsgSections(syncCore);
    setSaving({ type: "core-total" });
    try {
      await Promise.all(savedCore.map(async sec => {
        const newW = newWeights[sec.id];
        if (newW === undefined) return;
        const cr = await authFetch(`/api/criteria/categories/${sec.id}`, {
          method: "PATCH", body: JSON.stringify({ nameTh: sec.nameTh, totalWeight: newW }),
        });
        if (!cr.ok) throw new Error(`PATCH category ${sec.id} failed`);
        const scales = scaleItemsToTotal(sec.items, newW, true);
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === itemId);
          if (!it) return Promise.resolve();
          return authFetch(`/api/criteria/items/${itemId}`, {
            method: "PATCH", body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
          });
        }));
      }));
      savedSections.current = syncCore(savedSections.current ?? coreEsgSections);
      setCoreTarget(clamped);
      showToast("บันทึกน้ำหนัก Core สำเร็จ");
      reloadContext();
    } catch {
      showToast("บันทึกน้ำหนัก Core ไม่สำเร็จ", "error");
      loadAll(evalType);
    } finally {
      setSaving(null);
    }
  }, [coreEsgSections, showToast, reloadContext, loadAll, evalType, setCoreTarget]);

  // ── ESG total weight: distribute across ESG sections; within each section,
  // HO and Factory sub-criteria are separate tracks and each gets scaled to
  // the full new total independently (see scaleSectionItemsToTotal) ──
  const handleEsgWeightSave = useCallback(async (newTotal: number) => {
    const clamped = Math.max(0, Number(newTotal) || 0);
    const isESGSec = isEsgCategory;
    const savedEsg = (savedSections.current ?? coreEsgSections).filter(isESGSec);
    const n = savedEsg.length || 1;
    const newWeights: Record<string, number> = {};
    const each = r2adm(clamped / n);
    let rem = clamped;
    savedEsg.forEach((sec, i) => {
      if (i === n - 1) { newWeights[sec.id] = Math.max(0, r2adm(rem)); }
      else { newWeights[sec.id] = each; rem -= each; }
    });
    const syncEsg = (prev: CritSection[]) => prev.map(s => {
      const newW = newWeights[s.id];
      if (newW === undefined) return s;
      const scales = scaleSectionItemsToTotal(s, newW, true);
      return { ...s, totalWeight: newW, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
    });
    setCoreEsgSections(syncEsg);
    setSaving({ type: "esg-total" });
    try {
      await Promise.all(savedEsg.map(async sec => {
        const newW = newWeights[sec.id];
        if (newW === undefined) return;
        const cr = await authFetch(`/api/criteria/categories/${sec.id}`, {
          method: "PATCH", body: JSON.stringify({ nameTh: sec.nameTh, totalWeight: newW }),
        });
        if (!cr.ok) throw new Error(`PATCH category ${sec.id} failed`);
        const scales = scaleSectionItemsToTotal(sec, newW, true);
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === itemId);
          if (!it) return Promise.resolve();
          return authFetch(`/api/criteria/items/${itemId}`, {
            method: "PATCH", body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
          });
        }));
      }));
      savedSections.current = syncEsg(savedSections.current ?? coreEsgSections);
      setEsgTarget(clamped);
      showToast("บันทึกน้ำหนัก ESG สำเร็จ");
      reloadContext();
    } catch {
      showToast("บันทึกน้ำหนัก ESG ไม่สำเร็จ", "error");
      loadAll(evalType);
    } finally {
      setSaving(null);
    }
  }, [coreEsgSections, showToast, reloadContext, loadAll, evalType, setEsgTarget]);

  const coreWeight  = r2adm(coreSections.reduce((s, c) => s + (c.totalWeight ?? 0), 0));
  const esgWeight   = r2adm(esgSections.reduce((s, c) => s + (c.totalWeight ?? 0), 0));
  // ยังไม่มี row Function ใน DB (ก่อน seed) → ใช้ส่วนที่เหลือจาก 100 แทน
  // ค่าคงที่ — น้ำหนัก Function จริงเป็นค่าที่ admin ปรับได้ ไม่ใช่ 25 ตายตัว
  const funcWeight  = r2adm(funcSections[0]?.totalWeight ?? Math.max(0, 100 - coreWeight - esgWeight));
  const totalWeight = r2adm(coreWeight + funcWeight + esgWeight);
  const weightOk    = Math.abs(totalWeight - 100) < 0.1;
  const allEmpty    = !loading && coreEsgSections.length === 0 && funcSections.length === 0;

  // Function: evaluator picks one M1-M7 module; each module carries the
  // full Function weight (admin-configurable, defaults to 100 − Core − ESG)
  const funcAvgInfo = "สำหรับ Function ให้แก้ไขที่น้ำหนักรวม";

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Top bar ─── */}
      <div style={{
        background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 16,
        boxShadow: "0 2px 10px rgba(0,0,0,.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a1a" }}>
            เปลี่ยนเกณฑ์และ Parameter
          </div>

          {/* PRE / POST toggle */}
          <div style={{ display: "flex", background: "#f0f4f0", borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              { key: "pre_eval",  label: "Pre — ผู้ขายใหม่" },
              { key: "post_eval", label: "Post — ประเมินประจำ" },
            ].map(opt => (
              <SegButton key={opt.key} active={evalType === opt.key} onClick={() => setEvalType(opt.key)}>
                {opt.label}
              </SegButton>
            ))}
          </div>

          {/* Weight badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
            borderRadius: 8, background: weightOk ? "#e8f5e9" : "#fff8e1",
            border: `1.5px solid ${weightOk ? "#a5d6a7" : "#ffe082"}`,
            fontSize: 12, fontWeight: 700,
            color: weightOk ? "#1b5e20" : "#e65100",
          }}>
            {weightOk ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            รวม: {totalWeight.toFixed(1)} / 100
            <span style={{ fontWeight: 400, color: "#888", fontSize: 11 }}>
              (Core {coreWeight.toFixed(1)} + Func {funcWeight.toFixed(1)} + ESG {esgWeight.toFixed(1)})
            </span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={handleSeed} disabled={loading || seeding}
              title="เพิ่มเฉพาะรายการที่ขาดหาย — ไม่ทับข้อมูลที่แก้ไขไว้"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#e8f5e9", border: "1.5px solid #a5d6a7", borderRadius: 8,
                padding: "7px 14px", cursor: (loading || seeding) ? "not-allowed" : "pointer",
                fontSize: 12, fontFamily: FONT, color: "#1b5e20", fontWeight: 600,
              }}
            >
              <Download size={13} style={{ animation: seeding ? "spin 1s linear infinite" : "none" }} />
              เพิ่มรายการที่ขาดหาย
            </button>
            <button onClick={() => loadAll(evalType)} disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#fff", border: "1.5px solid #ddd", borderRadius: 8,
                padding: "7px 14px", cursor: loading ? "not-allowed" : "pointer",
                fontSize: 12, fontFamily: FONT, color: "#555",
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              โหลดใหม่
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading ─── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 15 }}>
          <RefreshCw size={22} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <div>กำลังโหลดข้อมูลเกณฑ์…</div>
        </div>
      )}

      {/* ── Empty state ─── */}
      {allEmpty && (
        <div style={{
          textAlign: "center", padding: "60px 20px", background: "#fff",
          borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)",
          color: "#888", fontSize: 15,
        }}>
          <AlertCircle size={32} style={{ marginBottom: 10, opacity: .5 }} />
          <div style={{ fontWeight: 600 }}>ไม่พบข้อมูลเกณฑ์ในฐานข้อมูล</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "#aaa" }}>กดปุ่มด้านล่างเพื่อนำเข้าข้อมูลจาก constants.js</div>
          <button onClick={handleSeed} disabled={seeding}
            style={{
              marginTop: 18, display: "inline-flex", alignItems: "center", gap: 7,
              background: "#e65100", color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 22px", fontSize: 14, fontFamily: FONT, fontWeight: 700,
              cursor: seeding ? "not-allowed" : "pointer",
            }}
          >
            <Download size={15} style={{ animation: seeding ? "spin 1s linear infinite" : "none" }} />
            {seeding ? "กำลังนำเข้า…" : "เพิ่มรายการที่ขาดหาย"}
          </button>
        </div>
      )}

      {/* ── Three Part Cards ─── */}
      {!loading && !allEmpty && (
        <>
          {/* Core */}
          <PartCard label="Core" weight={coreWeight} onWeightSave={handleCoreWeightSave} disabled={!!saving}
            warning={coreTarget !== null && Math.abs(coreWeight - coreTarget) > 0.05}
            warningMsg={coreTarget !== null ? `น้ำหนักรวม ${coreWeight} เกินเป้า ${coreTarget} — กดแก้น้ำหนักรวม` : undefined}>
            {coreSections.length === 0 && addingSection !== 'core'
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล Core — กด &quot;เพิ่มรายการที่ขาดหาย&quot;</div>
              : coreSections.map((section, idx) => (
                  <SectionCard key={section.id ?? idx} section={section} idx={idx}
                    onUpdate={handleUpdate} onOpenLevels={setLevelsModal}
                    saving={saving} disabled={!!saving}
                    onDelete={handleDeleteSection}
                  />
                ))
            }
            {addingSection === 'core'
              ? <AddSectionRow saving={savingSection} onCancel={() => setAddingSection(null)}
                  onSave={({ nameTh, totalWeight: tw }) => handleAddSection(
                    evalType === 'post_eval' ? 'POST-CORE' : 'PRE-CORE', nameTh, tw
                  )}
                />
              : <button onClick={() => setAddingSection('core')} disabled={!!saving}
                  style={{
                    marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #a5d6a7",
                    background: "#f6faf6", color: "#1b5e20", fontFamily: FONT,
                    fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                  }}>+ เพิ่มหัวข้อ</button>
            }
          </PartCard>

          {/* Function */}
          <PartCard label="Function"
            weight={funcWeight}
            weightLabel="น้ำหนักรวม:" avgInfo={funcAvgInfo} accent="#2e7d32"
            onWeightSave={handleFuncWeightSave} disabled={!!saving || seeding}
          >
            {funcSections.length === 0 && !addingFuncMod
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล Function — กด &quot;เพิ่มรายการที่ขาดหาย&quot;</div>
              : funcSections.map((section, idx) => (
                  <SectionCard key={section.id ?? idx} section={section} idx={idx}
                    onUpdate={handleUpdate} onOpenLevels={setLevelsModal}
                    saving={saving} disabled={!!saving}
                    effectiveEditable={true}
                    hideWeights={true}
                    onDelete={handleDeleteSection}
                  />
                ))
            }
            {addingFuncMod
              ? <AddSectionRow saving={savingSection} onCancel={() => setAddingFuncMod(false)}
                  onSave={({ nameTh, totalWeight: tw }) => handleAddSection(null, nameTh, tw, true)}
                />
              : <button onClick={() => setAddingFuncMod(true)} disabled={!!saving}
                  style={{
                    marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #a5d6a7",
                    background: "#f6faf6", color: "#2e7d32", fontFamily: FONT,
                    fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                  }}>+ เพิ่มหัวข้อ</button>
            }
          </PartCard>

          {/* ESG */}
          <PartCard label="ESG" weight={esgWeight} accent="#1565c0"
            onWeightSave={handleEsgWeightSave} disabled={!!saving}
            warning={esgTarget !== null && Math.abs(esgWeight - esgTarget) > 0.05}
            warningMsg={esgTarget !== null ? `น้ำหนักรวม ${esgWeight} เกินเป้า ${esgTarget} — กดแก้น้ำหนักรวม` : undefined}>
            {/* HO/Store | Factory filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <EsgFilterBtn active={esgFilter === "ho"}      onClick={() => setEsgFilter("ho")}>HO / Store</EsgFilterBtn>
              <EsgFilterBtn active={esgFilter === "factory"} onClick={() => setEsgFilter("factory")}>Factory</EsgFilterBtn>
            </div>
            {esgSections.length === 0 && addingSection !== 'esg'
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล ESG — กด &quot;เพิ่มรายการที่ขาดหาย&quot;</div>
              : esgSections.map((section, idx) => (
                  <SectionCard key={section.id ?? idx} section={section} idx={idx}
                    onUpdate={handleUpdate} onOpenLevels={setLevelsModal}
                    saving={saving} disabled={!!saving}
                    esgFilter={esgFilter}
                    onDelete={handleDeleteSection}
                  />
                ))
            }
            {addingSection === 'esg'
              ? <AddSectionRow saving={savingSection} onCancel={() => setAddingSection(null)}
                  onSave={({ nameTh, totalWeight: tw }) => handleAddSection(
                    evalType === 'post_eval' ? 'POST-ESG' : 'PRE-ESG', nameTh, tw
                  )}
                />
              : <button onClick={() => setAddingSection('esg')} disabled={!!saving}
                  style={{
                    marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #90caf9",
                    background: "#f0f4ff", color: "#1565c0", fontFamily: FONT,
                    fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                  }}>+ เพิ่มหัวข้อ</button>
            }
          </PartCard>
        </>
      )}

      {/* ── Levels modal ─── */}
      {levelsModal && (
        <LevelsModal item={levelsModal} onClose={() => setLevelsModal(null)}
          onSave={handleSaveLevels}
          saving={saving?.type === "levels" && saving?.id === levelsModal.id}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />

      <style>{`
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
