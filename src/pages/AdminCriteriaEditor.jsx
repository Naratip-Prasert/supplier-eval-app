// ============================================================
//  pages/AdminCriteriaEditor.jsx
//  Admin tab: เปลี่ยนเกณฑ์และ parameter
//  Tabs: Core | Function (M1-M7) | ESG
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { authFetch } from "../utils/api";
import { useCriteriaReload } from "../context/CriteriaContext";
import { PRE_CRITERIA, POST_CRITERIA, FUNCTION_MODULES, FUNCTION_SECTION_WEIGHT } from "../constants";
import {
  ChevronDown, ChevronRight,
  Save, RefreshCw, AlertCircle, CheckCircle2, X, Download, Trash2,
} from "lucide-react";

// ── Seed payload builder ──────────────────────────────────────
// Seeds PRE + POST + all M1-M7 modules in one shot.
function buildSeedPayload() {
  const r2 = n => Math.round(n * 100) / 100;

  function computeEqualWeights(realItems, sw) {
    const n = realItems.length;
    if (n === 0) return {};
    const each = r2(sw / n);
    let rem = sw;
    const map = {};
    realItems.forEach((item, ii) => {
      const w = ii === n - 1 ? Math.max(0, r2(rem)) : each;
      map[item.no] = w;
      rem -= each;
    });
    return map;
  }

  const transform = (base, prefix, criteriaSet) =>
    base.map((section, si) => {
      const realItems = section.items.filter(i => !i.divider);
      const sw = section.weight ?? 0;
      const wMap = computeEqualWeights(realItems, sw);
      return {
        code:         `${prefix}-CAT${si + 1}`,
        nameTh:       section.section,
        totalWeight:  sw,
        criteriaSet,
        displayOrder: si + 1,
        items: realItems.map(item => ({
          code:          item.no,
          nameTh:        item.title,
          defaultWeight: wMap[item.no] ?? 0,
          levelValues:   item.levelValues ?? null,
          levels:        item.levels ?? [],
        })),
      };
    });

  const transformModules = () =>
    Object.entries(FUNCTION_MODULES).map(([key, mod], ki) => {
      const wMap = computeEqualWeights(mod.items, FUNCTION_SECTION_WEIGHT);
      return {
        code:         `${key.toUpperCase()}-CAT1`,
        nameTh:       mod.label,
        totalWeight:  FUNCTION_SECTION_WEIGHT,
        criteriaSet:  key,
        displayOrder: ki + 1,
        items: mod.items.map(item => ({
          code:          item.no,
          nameTh:        item.title,
          defaultWeight: wMap[item.no] ?? 0,
          levelValues:   item.levelValues ?? null,
          levels:        item.levels ?? [],
        })),
      };
    });

  return [
    ...transform(PRE_CRITERIA,  'PRE',  'pre_eval'),
    ...transform(POST_CRITERIA, 'POST', 'post_eval'),
    ...transformModules(),
  ];
}

// Derive DB criteria_set from category code
function getCriteriaSetFromCode(code) {
  if (!code) return 'pre_eval';
  const m = code.match(/^M(\d+)-/i);
  if (m) return `m${m[1]}`;
  return code.startsWith('POST-') ? 'post_eval' : 'pre_eval';
}

const FONT = "Sarabun, sans-serif";
const LEVEL_CIRCLE_COLORS = ["#ef5350", "#ff9800", "#fdd835", "#66bb6a", "#388e3c"];

const r2adm = n => Math.round(n * 100) / 100;

// Mirror of Evalform's initWeights logic — computes weight each item actually gets
function computeEffectiveWeights(items, sectionWeight) {
  const sw = sectionWeight ?? 0;
  if (items.length === 0) return {};
  const constantSum = items.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
  if (items.every(it => it.defaultWeight != null) && Math.abs(constantSum - sw) < 0.1) {
    return Object.fromEntries(items.map(it => [it.id, it.defaultWeight]));
  }
  // fallback: equal split with buffer on last item (same as Evalform)
  const each = r2adm(sw / items.length);
  let rem = sw;
  const result = {};
  items.forEach((it, ii) => {
    if (ii === items.length - 1) result[it.id] = Math.max(0, r2adm(rem));
    else { result[it.id] = each; rem -= each; }
  });
  return result;
}

// ── Toast ────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
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
function WeightInput({ value, onChange, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(String(value ?? ""));
  const inputRef = useRef(null);

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
function TextEdit({ value, onChange, onSave, disabled, multiline = true, style = {} }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value ?? "");
  const ref = useRef(null);

  useEffect(() => { if (!editing) setLocal(value ?? ""); }, [value, editing]);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select?.(); } }, [editing]);

  const commit = () => {
    setEditing(false);
    if (local !== value) { onChange(local); onSave?.(local); }
  };

  const baseStyle = {
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
function LevelsModal({ item, onClose, onSave, saving }) {
  const [levels, setLevels] = useState([...item.levels]);
  const [levelValues, setLevelValues] = useState(
    Array.isArray(item.levelValues) && item.levelValues.length > 0
      ? [...item.levelValues]
      : [1, 2, 3, 4, 5]
  );

  const updateLevel = (i, val) => setLevels(prev => prev.map((l, j) => j === i ? val : l));
  const deleteLevel = (i) => setLevels(prev => prev.filter((_, j) => j !== i));
  const addLevel    = () => setLevels(prev => [...prev, ""]);

  const toggleLV = (v) => {
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
        <div style={{
          background: "#f6faf6", border: "1.5px solid #c8e6c9", borderRadius: 10,
          padding: "12px 14px", marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", marginBottom: 8 }}>
            ระดับคะแนนที่ใช้ได้ (levelValues)
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            {[1, 2, 3, 4, 5].map(v => {
              const active = levelValues.includes(v);
              return (
                <button key={v} onClick={() => toggleLV(v)}
                  title={active ? `ปิดใช้คะแนน ${v}` : `เปิดใช้คะแนน ${v}`}
                  style={{
                    width: 38, height: 38, borderRadius: "50%", fontWeight: 800, fontSize: 15,
                    border: `2px solid ${active ? "#1b5e20" : "#ccc"}`,
                    background: active ? "#1b5e20" : "#fff",
                    color: active ? "#fff" : "#aaa",
                    cursor: "pointer", transition: "all .15s",
                  }}>{v}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#777" }}>
            ปุ่มที่เปิดใช้จะ clickable ในหน้าประเมิน — ค่าปัจจุบัน: [{levelValues.join(", ")}]
          </div>
        </div>

        {/* Level descriptions */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 8 }}>
          คำอธิบายแต่ละระดับ
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {levels.map((lvl, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{
                minWidth: 28, height: 28, borderRadius: "50%",
                background: LEVEL_CIRCLE_COLORS[i] ?? "#9e9e9e",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 2,
              }}>{i + 1}</div>
              <textarea value={lvl} onChange={e => updateLevel(i, e.target.value)} rows={2}
                style={{
                  flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, resize: "vertical",
                  border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "#1b5e20")}
                onBlur={e => (e.target.style.borderColor = "#ddd")}
              />
              <button onClick={() => deleteLevel(i)} disabled={levels.length <= 1}
                title="ลบระดับนี้"
                style={{
                  flexShrink: 0, marginTop: 2, padding: "5px 7px",
                  background: "none", border: "1.5px solid #fca5a5", borderRadius: 6,
                  cursor: levels.length <= 1 ? "not-allowed" : "pointer",
                  color: "#ef4444", opacity: levels.length <= 1 ? 0.3 : 1, lineHeight: 1,
                }}
              ><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <button onClick={addLevel} style={{
          marginTop: 12, width: "100%", padding: "8px", borderRadius: 8,
          border: "1.5px dashed #a5d6a7", background: "#f6faf6",
          color: "#1b5e20", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>+ เพิ่มระดับ</button>

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
function AddItemRow({ onSave, onCancel, saving, hideWeights }) {
  const [code,   setCode]   = useState('');
  const [nameTh, setNameTh] = useState('');
  const [weight, setWeight] = useState('0');

  const submit = () => {
    if (!code.trim() || !nameTh.trim()) return;
    onSave({ code: code.trim(), nameTh: nameTh.trim(), defaultWeight: parseFloat(weight) || 0 });
  };

  const inputStyle = {
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
function AddSectionRow({ onSave, onCancel, saving }) {
  const [nameTh, setNameTh] = useState('');
  const [weight, setWeight] = useState('0');

  const inputStyle = {
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


// ── ItemRow ───────────────────────────────────────────────────
function ItemRow({ item, onUpdate, onOpenLevels, saving, disabled, effectiveWeight, hideWeight, editableEffective }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSaving = saving?.type === "item" && saving?.id === item.id;

  const saveItem = useCallback((patch) => {
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
          {effectiveWeight != null && !editableEffective
            ? /* ESG: read-only computed weight */
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 42, padding: "2px 8px", borderRadius: 6,
                background: "#e3f2fd", color: "#1565c0", fontWeight: 700, fontSize: 13,
                border: "1.5px solid #90caf9",
              }}>{effectiveWeight}</span>
            : /* Function/Core: editable — show effective weight when computed, defaultWeight otherwise */
              <WeightInput
                value={effectiveWeight != null && editableEffective ? effectiveWeight : item.defaultWeight}
                disabled={disabled}
                onChange={v => onUpdate("item-weight", item.id, { defaultWeight: v })}
                onSave={v => saveItem({ defaultWeight: v })}
              />}
        </td>
      )}
      <td style={{ padding: "6px 10px", textAlign: "center", width: 90 }}>
        <span style={{ fontSize: 11, color: "#aaa" }}>
          {item.levelValues?.length > 0 ? item.levelValues.length : item.levels.length} ระดับ
          {item.levelValues?.length > 0 && item.levelValues?.length < 5
            ? <span style={{ marginLeft: 4, color: "#1b5e20" }}>[{item.levelValues.join(",")}]</span>
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

const TH = {
  padding: "9px 10px", fontSize: 11.5, fontWeight: 700, textAlign: "center",
  color: "#4a6b4a", textTransform: "uppercase", letterSpacing: ".3px",
  borderBottom: "1px solid #dce8dc",
};

// ── SectionCard ───────────────────────────────────────────────
function SectionCard({ section, idx, onUpdate, onOpenLevels, saving, disabled, esgFilter, hideWeights, effectiveEditable, onDelete, isBuffer }) {
  const [expanded,      setExpanded]      = useState(false);
  const [showAddRow,    setShowAddRow]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSavingSection = saving?.type === "category" && saving?.id === section.id;
  const isSavingNew     = saving?.type === "new-item";
  let activeItems = section.items.filter(it => it.isActive !== false);
  if (esgFilter === "ho")      activeItems = activeItems.filter(it => !it.code?.startsWith("F"));
  if (esgFilter === "factory") activeItems = activeItems.filter(it =>  it.code?.startsWith("F"));

  // Compute effective weights (same as Evalform's initWeights) when:
  //   - effectiveEditable → Function modules: editable effective weight display
  const effectiveWeights = effectiveEditable
    ? computeEffectiveWeights(activeItems, section.totalWeight)
    : null;

  const colCount = 6;

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

      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f0f7f0" }}>
                <th style={TH}>รหัส</th>
                <th style={{ ...TH, textAlign: "left" }}>ชื่อหัวข้อ (คลิกเพื่อแก้ไข)</th>
                <th style={TH}>
                  น้ำหนัก{effectiveWeights && !effectiveEditable ? " (คำนวณ)" : ""}
                </th>
                <th style={TH}>ระดับ</th>
                <th style={TH}>แก้ระดับ</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {activeItems.length === 0 && !showAddRow
                ? <tr><td colSpan={colCount} style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>ไม่มีรายการ — กด "+ เพิ่ม item" เพื่อเพิ่ม</td></tr>
                : activeItems.map(item => (
                  <ItemRow key={item.id ?? item.code} item={item}
                    onUpdate={onUpdate} onOpenLevels={onOpenLevels}
                    saving={saving} disabled={disabled}
                    effectiveWeight={effectiveWeights?.[item.id]}
                    editableEffective={effectiveEditable}
                  />
                ))
              }
              {showAddRow && (
                <AddItemRow saving={isSavingNew} onCancel={() => setShowAddRow(false)}
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
            const diff = Math.abs(sum - section.totalWeight);
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
function PartCard({ label, weight, weightLabel, avgInfo, accent = "#1b5e20", onWeightSave, disabled, warning, warningMsg, children }) {
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
function EsgFilterBtn({ active, onClick, children }) {
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
function SegButton({ active, onClick, children, style = {} }) {
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
export default function AdminCriteriaEditor({ authUser }) {
  const [evalType,        setEvalType]        = useState("pre_eval");
  const [coreEsgSections, setCoreEsgSections] = useState([]);
  const [funcSections,    setFuncSections]    = useState([]);
  const [esgFilter,       setEsgFilter]       = useState("ho"); // "ho" | "factory"
  const [loading,         setLoading]         = useState(false);
  const [saving,          setSaving]          = useState(null);
  const [toast,           setToast]           = useState(null);
  const [levelsModal,     setLevelsModal]     = useState(null);
  const [seeding,         setSeeding]         = useState(false);
  const [addingSection,   setAddingSection]   = useState(null); // null | "core" | "esg"
  const [addingFuncMod,   setAddingFuncMod]   = useState(false); // false | true
  const [savingSection,   setSavingSection]   = useState(false);
  const [coreTarget,      setCoreTarget]      = useState(null); // authorized Core total
  const esgNormalized  = useRef({ ho: false, factory: false });
  const coreNormalized = useRef(false);
  // Ground-truth mirror of what's actually in DB for coreEsgSections.
  // ALL buffer/scale calculations use this instead of React state, so unsaved
  // cat-weight cascades never corrupt handleCoreWeightSave or cross-section edits.
  const savedSections = useRef(null);
  const reloadContext = useCriteriaReload();

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadAll = useCallback(async (et) => {
    setLoading(true);
    esgNormalized.current  = { ho: false, factory: false };
    coreNormalized.current = false;
    savedSections.current  = null;
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`/api/criteria?evalType=${et}`),
        authFetch(`/api/criteria?evalType=function`),
      ]);
      if (!r1.ok || !r2.ok) throw new Error();
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setCoreEsgSections(d1);
      setFuncSections(d2);
      savedSections.current = d1;
      const isEsg = s => !!(s.nameTh?.includes('ESG') || s.code?.match(/ESG/i));
      setCoreTarget(d1.filter(s => !isEsg(s)).reduce((s, c) => s + (parseFloat(c.totalWeight) || 0), 0));
    } catch {
      showToast("โหลดข้อมูลไม่สำเร็จ — ตรวจสอบว่า server กำลังทำงานอยู่", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(evalType); esgNormalized.current = { ho: false, factory: false }; }, [evalType, loadAll]);

  const isESGSection = s => s.nameTh?.includes('ESG') || s.code?.match(/ESG/i);
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
      showToast(err.message || 'นำเข้าข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setSeeding(false);
    }
  }, [evalType, loadAll, showToast, reloadContext]);

  const handleSeed      = useCallback(() => callSeed(false), [callSeed]);
  const handleResetWeights = useCallback(() => callSeed(true),  [callSeed]);

  // ── Function total weight: patch all M1-M7 sections at once ──
  const handleFuncWeightSave = useCallback(async (newWeight) => {
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
  const handleAddSection = useCallback(async (codePrefix, nameTh, totalWeight, isFunc = false) => {
    setSavingSection(true);
    try {
      const body = isFunc
        ? { nameTh, totalWeight, type: 'function' }
        : { codePrefix, nameTh, totalWeight };
      const r = await authFetch('/api/criteria/categories', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message ?? '');
      const raw = await r.json();
      // Normalize numeric fields (pg returns numerics as strings)
      const newSec = { ...raw, totalWeight: parseFloat(raw.totalWeight) || 0, displayOrder: Number(raw.displayOrder) || 0, items: [] };
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
      showToast(err.message || 'เพิ่มหัวข้อไม่สำเร็จ', 'error');
    } finally {
      setSavingSection(false);
    }
  }, [showToast, reloadContext]);

  // ── Delete section ───────────────────────────────────────────
  const handleDeleteSection = useCallback(async (id) => {
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
      showToast(err.message || 'ลบหัวข้อไม่สำเร็จ', 'error');
    } finally {
      setSaving(null);
    }
  }, [showToast, reloadContext]);

  // ── Buffer helpers ─────────────────────────────────────────────
  // Returns { adjustments: {id: newWeight, ...} } or { tooLarge: true }
  // Rule: only items AFTER the edited one (index > editedIdx) buffer the change,
  // cascading from the last item backward. Editing the last item always fails
  // (nothing after it) → tooLarge → toast error.
  const getCatBuffer = useCallback((pool, editedId, newVal) => {
    const n = pool.length;
    if (n < 2) return { adjustments: {} };
    const editedIdx = pool.findIndex(s => s.id === editedId);
    if (editedIdx === -1) return { adjustments: {} };
    const clamped = Math.max(0, Number(newVal) || 0);
    const delta = r2adm(clamped - (pool[editedIdx].totalWeight ?? 0));
    if (Math.abs(delta) < 0.005) return { adjustments: {} };

    // Candidates: items after the edited one, from last toward editedIdx
    const candidates = [];
    for (let i = n - 1; i > editedIdx; i--) candidates.push(pool[i]);

    const adjustments = {};
    let remaining = delta;
    for (const sec of candidates) {
      if (Math.abs(remaining) < 0.005) break;
      const cur = sec.totalWeight ?? 0;
      if (remaining > 0) {
        const absorb = Math.min(cur, remaining);
        if (absorb > 0.005) {
          adjustments[sec.id] = r2adm(cur - absorb);
          remaining = r2adm(remaining - absorb);
        }
      } else {
        adjustments[sec.id] = r2adm(cur + Math.abs(remaining));
        remaining = 0;
      }
    }

    if (remaining > 0.005) return { tooLarge: true };
    return { adjustments };
  }, []);

  // Same rule for items within a section
  const getItemBuffer = useCallback((sec, editedId, newVal) => {
    const items = sec.items.filter(it => it.isActive !== false);
    const n = items.length;
    if (n < 2) return { adjustments: {} };
    const editedIdx = items.findIndex(it => it.id === editedId);
    if (editedIdx === -1) return { adjustments: {} };
    const clamped = Math.max(0, Number(newVal) || 0);
    const delta = r2adm(clamped - (items[editedIdx].defaultWeight ?? 0));
    if (Math.abs(delta) < 0.005) return { adjustments: {} };

    // Candidates: items after the edited one, from last toward editedIdx
    const candidates = [];
    for (let i = n - 1; i > editedIdx; i--) candidates.push(items[i]);

    const adjustments = {};
    let remaining = delta;
    for (const it of candidates) {
      if (Math.abs(remaining) < 0.005) break;
      const cur = it.defaultWeight ?? 0;
      if (remaining > 0) {
        const absorb = Math.min(cur, remaining);
        if (absorb > 0.005) {
          adjustments[it.id] = r2adm(cur - absorb);
          remaining = r2adm(remaining - absorb);
        }
      } else {
        adjustments[it.id] = r2adm(cur + Math.abs(remaining));
        remaining = 0;
      }
    }

    if (remaining > 0.005) return { tooLarge: true };
    return { adjustments };
  }, []);

  // Scale items to match newTotal.
  // If items have existing weights → proportional (preserves user's custom ratios).
  // If all items are 0 → equal: integer first → equal 2-dp → buffer last.
  // forceEqual=true → always distribute equally (used for normalize-esg)
  // forceEqual=false → proportional when items have weights (used for save-cat, handleCoreWeightSave)
  const scaleItemsToTotal = useCallback((secItems, newTotal, forceEqual = false) => {
    const real = secItems.filter(it => it.isActive !== false);
    if (real.length === 0) return {};
    const n = real.length;
    const oldSum = real.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
    const result = {};
    const equalDist = () => {
      const each = r2adm(newTotal / n);
      if (each === Math.round(each)) {
        real.forEach(it => { result[it.id] = each; });
      } else {
        let rem = newTotal;
        real.forEach((it, i) => {
          if (i === n - 1) { result[it.id] = Math.max(0, r2adm(rem)); }
          else { result[it.id] = each; rem -= each; }
        });
      }
    };
    if (!forceEqual && oldSum > 0) {
      // Proportional — preserves custom item weight ratios
      let rem = newTotal;
      real.forEach((it, i) => {
        if (i === n - 1) { result[it.id] = Math.max(0, r2adm(rem)); }
        else { const w = r2adm((it.defaultWeight / oldSum) * newTotal); result[it.id] = w; rem -= w; }
      });
    } else {
      equalDist();
    }
    return result;
  }, []);

  // ── handleUpdate (unified across both datasets) ──────────────
  const handleUpdate = useCallback(async (action, id, payload) => {
    const inFunc = (
      funcSections.some(s => s.id === id) ||
      funcSections.some(s => s.items?.some(it => it.id === id))
    );
    const setSecs = inFunc ? setFuncSections : setCoreEsgSections;
    const isEsgSec = s => !!(s.nameTh?.includes('ESG') || s.code?.match(/ESG/i));

    if (action === "cat-name") {
      setSecs(prev => prev.map(s => s.id === id ? { ...s, nameTh: payload.nameTh } : s));
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
            const scales = scaleItemsToTotal(s.items, clamped);
            return { ...s, totalWeight: clamped, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }));
          return;
        }
        const bufResult = getCatBuffer(pool, id, clamped);
        if (bufResult.tooLarge) {
          showToast("น้ำหนักเกิน — แก้ตัวก่อนหน้าก่อน", "error");
          return;
        }
        setSecs(prev => prev.map(s => {
          if (s.id === id) {
            const scales = scaleItemsToTotal(s.items, clamped);
            return { ...s, totalWeight: clamped, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }
          const adjW = bufResult.adjustments?.[s.id];
          if (adjW !== undefined) {
            const scales = scaleItemsToTotal(s.items, adjW);
            return { ...s, totalWeight: adjW, items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it) };
          }
          return s;
        }));
      } else {
        setSecs(prev => prev.map(s => s.id === id ? { ...s, totalWeight: payload.totalWeight } : s));
      }
      return;
    }

    if (action === "item-name") {
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, nameTh: payload.nameTh } : it),
      })));
      return;
    }
    if (action === "item-code") {
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, code: payload.code } : it),
      })));
      return;
    }

    if (action === "item-weight") {
      const allSecs = inFunc ? funcSections : coreEsgSections;
      const sec = allSecs.find(s => s.items?.some(it => it.id === id));
      if (!sec) {
        setSecs(prev => prev.map(s => ({
          ...s, items: s.items.map(it => it.id === id ? { ...it, defaultWeight: payload.defaultWeight } : it),
        })));
        return;
      }
      // Use saved (DB) state for the section, not the live React state
      const snapSec = (savedSections.current ?? coreEsgSections).find(s => s.items?.some(it => it.id === id)) ?? sec;
      // For ESG sections: buffer only within the currently-filtered subset (HO or Factory)
      const esgPool = (!inFunc && isEsgSec(snapSec))
        ? snapSec.items.filter(it => {
            if (it.isActive === false) return false;
            if (esgFilter === "ho") return !it.code?.startsWith("F");
            if (esgFilter === "factory") return it.code?.startsWith("F");
            return true;
          })
        : null;
      const activeItems = esgPool ?? snapSec.items.filter(it => it.isActive !== false);
      const itemOldSum = activeItems.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
      const itemClamped = Math.max(0, Number(payload.defaultWeight) || 0);
      if (itemOldSum < 0.005) {
        // First time: all items start at 0 → set all equal to clamped
        setSecs(prev => prev.map(s => ({
          ...s, items: s.items.map(it => activeItems.some(x => x.id === it.id) ? { ...it, defaultWeight: itemClamped } : it),
        })));
        return;
      }
      const bufSec = esgPool
        ? { ...sec, items: esgPool, totalWeight: sec.totalWeight }
        : sec;
      const buf = getItemBuffer(bufSec, id, payload.defaultWeight);
      setSecs(prev => prev.map(s => ({
        ...s, items: s.items.map(it => {
          if (it.id === id) return { ...it, defaultWeight: Math.max(0, Number(payload.defaultWeight) || 0) };
          if (buf && it.id === buf.bufItem.id) return { ...it, defaultWeight: buf.bufVal };
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
        showToast(err.message || 'เพิ่มรายการไม่สำเร็จ', 'error');
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

    if (action === "save-cat") {
      setSaving({ type: "category", id });
      try {
        const allSecs = inFunc ? funcSections : coreEsgSections;
        const current = allSecs.find(s => s.id === id);
        const body = { ...current, ...payload };
        const r = await authFetch(`/api/criteria/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: body.nameTh, totalWeight: body.totalWeight }),
        });
        if (!r.ok) throw new Error();
        // Persist buffer section + scaled items when a Core/ESG weight changed
        if (!inFunc && payload.totalWeight != null) {
          const clamped = Math.max(0, Number(payload.totalWeight) || 0);
          const isEsg = isEsgSec(current ?? {});
          const pool = coreEsgSections.filter(s => isEsgSec(s) === isEsg);
          const buf = getCatBuffer(pool, id, clamped);

          // Save items in main section (proportional — preserves custom ratios)
          const mainScales = scaleItemsToTotal(current?.items ?? [], clamped);
          await Promise.all(Object.entries(mainScales).map(([itemId, w]) => {
            const it = current?.items?.find(x => x.id === Number(itemId));
            if (!it) return Promise.resolve();
            return authFetch(`/api/criteria/items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
            });
          }));

          // Save buffer section + its items
          if (buf) {
            const bufSec = pool.find(s => s.id === buf.bufId);
            await authFetch(`/api/criteria/categories/${buf.bufId}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: bufSec?.nameTh, totalWeight: buf.bufVal }),
            });
            const bufScales = scaleItemsToTotal(bufSec?.items ?? [], buf.bufVal);
            await Promise.all(Object.entries(bufScales).map(([itemId, w]) => {
              const it = bufSec?.items?.find(x => x.id === Number(itemId));
              if (!it) return Promise.resolve();
              return authFetch(`/api/criteria/items/${itemId}`, {
                method: "PATCH",
                body: JSON.stringify({ nameTh: it.nameTh, defaultWeight: w }),
              });
            }));
          }
        }
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
        if (esgFilter === "ho")      return !it.code?.startsWith("F");
        if (esgFilter === "factory") return  it.code?.startsWith("F");
        return true;
      });
      const scales = scaleItemsToTotal(pool, sec.totalWeight, true); // force equal
      setSecs(prev => prev.map(s => s.id !== id ? s : {
        ...s,
        items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it),
      }));
      setSaving({ type: "category", id });
      try {
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === Number(itemId));
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
      const scales = scaleItemsToTotal(pool, sec.totalWeight, true);
      setSecs(prev => prev.map(s => s.id !== id ? s : {
        ...s,
        items: s.items.map(it => scales[it.id] !== undefined ? { ...it, defaultWeight: scales[it.id] } : it),
      }));
      try {
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === Number(itemId));
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
      let item = null;
      let itemSec = null;
      allSecs.forEach(s => s.items?.forEach(it => { if (it.id === id) { item = it; itemSec = s; } }));
      if (!item) return;
      const body = { ...item, ...payload };
      try {
        const r = await authFetch(`/api/criteria/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: body.nameTh, detailTh: body.detailTh, defaultWeight: body.defaultWeight, code: body.code }),
        });
        if (!r.ok) throw new Error();
        // Persist the buffer item when weight changed (ESG: respect filter)
        if (payload.defaultWeight != null && itemSec) {
          const esgPool = (!inFunc && isEsgSec(itemSec))
            ? itemSec.items.filter(it => {
                if (it.isActive === false) return false;
                if (esgFilter === "ho") return !it.code?.startsWith("F");
                if (esgFilter === "factory") return it.code?.startsWith("F");
                return true;
              })
            : null;
          const bufSec = esgPool
            ? { ...itemSec, items: esgPool, totalWeight: itemSec.totalWeight }
            : itemSec;
          const buf = getItemBuffer(bufSec, id, payload.defaultWeight);
          if (buf) {
            await authFetch(`/api/criteria/items/${buf.bufItem.id}`, {
              method: "PATCH",
              body: JSON.stringify({ nameTh: buf.bufItem.nameTh, defaultWeight: buf.bufVal }),
            });
          }
        }
        showToast("บันทึกรายการสำเร็จ");
        reloadContext();
      } catch {
        showToast("บันทึกรายการไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
    }
  }, [coreEsgSections, funcSections, esgFilter, evalType, showToast, loadAll, reloadContext, getCatBuffer, getItemBuffer, scaleItemsToTotal]);

  // Auto-normalize ESG item weights when filter or data changes
  useEffect(() => {
    if (esgNormalized.current[esgFilter]) return;
    const isEsg = s => !!(s.nameTh?.includes('ESG') || s.code?.match(/ESG/i));
    const esgSecs = coreEsgSections.filter(isEsg);
    if (!esgSecs.length) return;
    let needsNorm = false;
    esgSecs.forEach(sec => {
      const pool = sec.items.filter(it => {
        if (it.isActive === false) return false;
        return esgFilter === "factory" ? it.code?.startsWith("F") : !it.code?.startsWith("F");
      });
      if (pool.length === 0) return;
      const sum = pool.reduce((s, it) => s + (it.defaultWeight ?? 0), 0);
      if (Math.abs(sum - sec.totalWeight) > 0.01) needsNorm = true;
    });
    esgNormalized.current[esgFilter] = true;
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
  const handleSaveLevels = useCallback(async (item, levels, levelValues) => {
    setSaving({ type: "levels", id: item.id });
    try {
      const r = await authFetch(`/api/criteria/items/${item.id}/levels`, {
        method: "PATCH",
        body: JSON.stringify({ levels, levelValues }),
      });
      if (!r.ok) throw new Error();
      const updater = prev => prev.map(s => ({
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
  const handleCoreWeightSave = useCallback(async (newTotal) => {
    const clamped = Math.max(0, Number(newTotal) || 0);
    const isESGSec = s => !!(s.nameTh?.includes('ESG') || s.code?.match(/ESG/i));
    const savedCore = (savedSections.current ?? coreEsgSections).filter(s => !isESGSec(s));
    const n = savedCore.length || 1;
    const newWeights = {};
    // Always equal distribution across all CORE sections
    const each = r2adm(clamped / n);
    let rem = clamped;
    savedCore.forEach((sec, i) => {
      if (i === n - 1) { newWeights[sec.id] = Math.max(0, r2adm(rem)); }
      else { newWeights[sec.id] = each; rem -= each; }
    });
    const syncCore = prev => prev.map(s => {
      const newW = newWeights[s.id];
      if (newW === undefined) return s;
      const scales = scaleItemsToTotal(s.items, newW);
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
        const scales = scaleItemsToTotal(sec.items, newW);
        await Promise.all(Object.entries(scales).map(([itemId, w]) => {
          const it = sec.items.find(x => x.id === Number(itemId));
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
  }, [coreEsgSections, scaleItemsToTotal, showToast, reloadContext, loadAll, evalType, setCoreTarget]);

  const coreWeight  = r2adm(coreSections.reduce((s, c) => s + (c.totalWeight ?? 0), 0));
  const esgWeight   = r2adm(esgSections.reduce((s, c) => s + (c.totalWeight ?? 0), 0));
  const funcWeight  = r2adm(funcSections[0]?.totalWeight ?? FUNCTION_SECTION_WEIGHT);
  const totalWeight = r2adm(coreWeight + funcWeight + esgWeight);
  const weightOk    = Math.abs(totalWeight - 100) < 0.1;
  const allEmpty    = !loading && coreEsgSections.length === 0 && funcSections.length === 0;

  // Function: each M1-M7 module = 25% (evaluator picks one module only)
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
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล Core — กด "เพิ่มรายการที่ขาดหาย"</div>
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
                    evalType === 'post_eval' ? 'POST-CAT' : 'PRE-CAT', nameTh, tw
                  )}
                />
              : <button onClick={() => setAddingSection('core')} disabled={!!saving}
                  style={{
                    marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #a5d6a7",
                    background: "#f6faf6", color: "#1b5e20", fontFamily: FONT,
                    fontSize: 12, fontWeight: 600, cursor: !!saving ? "not-allowed" : "pointer",
                  }}>+ เพิ่มหัวข้อ</button>
            }
          </PartCard>

          {/* Function */}
          <PartCard label="Function"
            weight={funcSections[0]?.totalWeight ?? FUNCTION_SECTION_WEIGHT}
            weightLabel="น้ำหนักรวม:" avgInfo={funcAvgInfo} accent="#2e7d32"
            onWeightSave={handleFuncWeightSave} disabled={!!saving || seeding}
          >
            {funcSections.length === 0 && !addingFuncMod
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล Function — กด "เพิ่มรายการที่ขาดหาย"</div>
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
                    fontSize: 12, fontWeight: 600, cursor: !!saving ? "not-allowed" : "pointer",
                  }}>+ เพิ่มหัวข้อ</button>
            }
          </PartCard>

          {/* ESG */}
          <PartCard label="ESG" weight={esgWeight} accent="#1565c0">
            {/* HO/Store | Factory filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <EsgFilterBtn active={esgFilter === "ho"}      onClick={() => setEsgFilter("ho")}>HO / Store</EsgFilterBtn>
              <EsgFilterBtn active={esgFilter === "factory"} onClick={() => setEsgFilter("factory")}>Factory</EsgFilterBtn>
            </div>
            {esgSections.length === 0 && addingSection !== 'esg'
              ? <div style={{ textAlign: "center", padding: "30px", color: "#bbb", fontSize: 13 }}>ไม่พบข้อมูล ESG — กด "เพิ่มรายการที่ขาดหาย"</div>
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
                    fontSize: 12, fontWeight: 600, cursor: !!saving ? "not-allowed" : "pointer",
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
