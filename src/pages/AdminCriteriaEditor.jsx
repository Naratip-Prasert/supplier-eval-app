// ============================================================
//  pages/AdminCriteriaEditor.jsx
//  Admin tab: เปลี่ยนเกณฑ์และ parameter
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "../utils/api";
import { useCriteriaReload } from "../context/CriteriaContext";
import { PRE_CRITERIA, POST_CRITERIA } from "../constants";
import {
  ChevronDown, ChevronRight,
  Save, RefreshCw, AlertCircle, CheckCircle2, X, Download, Trash2,
} from "lucide-react";

// แปลง PRE_CRITERIA / POST_CRITERIA → format สำหรับ seed endpoint
// ใช้ equal-distribution เหมือน initWeights ใน Evalform เพื่อให้ค่าตรงกัน
function buildSeedPayload() {
  const r2 = n => Math.round(n * 100) / 100;

  // Replicate initWeights equal-split logic so seeded values match Evalform
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
        code:        `${prefix}-CAT${si + 1}`,
        nameTh:      section.section,
        totalWeight: sw,
        criteriaSet,
        displayOrder: si + 1,
        items: realItems.map(item => ({
          code:          item.no,
          nameTh:        item.title,
          defaultWeight: wMap[item.no] ?? 0,
          levels:        item.levels ?? [],
        })),
      };
    });
  return [
    ...transform(PRE_CRITERIA,  'PRE',  'pre_eval'),
    ...transform(POST_CRITERIA, 'POST', 'post_eval'),
  ];
}

// ── tiny helpers ──────────────────────────────────────────────
const FONT = "Sarabun, sans-serif";

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

// Inline editable number — click to focus, Enter/blur to confirm
function WeightInput({ value, onChange, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(String(value ?? ""));
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setLocal(String(value ?? "")); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(local);
    if (!isNaN(n) && n !== value) {
      onChange(n);
      onSave?.(n);
    }
  };

  return editing ? (
    <input
      ref={inputRef}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      disabled={disabled}
      style={{
        width: 56, textAlign: "center", border: "2px solid #1b5e20", borderRadius: 6,
        padding: "2px 6px", fontFamily: FONT, fontSize: 13, fontWeight: 700,
        outline: "none",
      }}
    />
  ) : (
    <span
      onClick={() => !disabled && setEditing(true)}
      title="คลิกเพื่อแก้ไข"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 42, padding: "2px 8px", borderRadius: 6,
        background: "#e8f5e9", color: "#1b5e20", fontWeight: 700, fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        border: "2px solid transparent",
        transition: "border-color .15s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = "#81c784"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}
    >{value ?? "–"}</span>
  );
}

// Editable textarea-like span
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
    background: "#fff", outline: "none", resize: "vertical",
    ...style,
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
    <span
      onClick={() => !disabled && setEditing(true)}
      title="คลิกเพื่อแก้ไข"
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

// ── Levels modal ──────────────────────────────────────────────
function LevelsModal({ item, onClose, onSave, saving }) {
  const [levels, setLevels] = useState([...item.levels]);

  const updateLevel = (i, val) => setLevels(prev => prev.map((l, j) => j === i ? val : l));
  const deleteLevel = (i) => setLevels(prev => prev.filter((_, j) => j !== i));
  const addLevel    = () => setLevels(prev => [...prev, ""]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 8888,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 640,
        maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.2)",
        fontFamily: FONT,
      }}>
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

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {levels.map((lvl, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{
                minWidth: 28, height: 28, borderRadius: "50%", background: LEVEL_CIRCLE_COLORS[i] ?? "#9e9e9e",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 2,
              }}>{i + 1}</div>
              <textarea
                value={lvl}
                onChange={e => updateLevel(i, e.target.value)}
                rows={2}
                style={{
                  flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, resize: "vertical",
                  border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "#1b5e20")}
                onBlur={e => (e.target.style.borderColor = "#ddd")}
              />
              <button
                onClick={() => deleteLevel(i)}
                disabled={levels.length <= 1}
                title="ลบระดับนี้"
                style={{
                  flexShrink: 0, marginTop: 2, padding: "5px 7px",
                  background: "none", border: "1.5px solid #fca5a5", borderRadius: 6,
                  cursor: levels.length <= 1 ? "not-allowed" : "pointer",
                  color: "#ef4444", opacity: levels.length <= 1 ? 0.3 : 1, lineHeight: 1,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addLevel}
          style={{
            marginTop: 12, width: "100%", padding: "8px", borderRadius: 8,
            border: "1.5px dashed #a5d6a7", background: "#f6faf6",
            color: "#1b5e20", fontFamily: FONT, fontSize: 13, fontWeight: 600,
            cursor: "pointer",
          }}
        >+ เพิ่มระดับ</button>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", borderRadius: 8, border: "1.5px solid #ddd",
            background: "#fff", cursor: "pointer", fontFamily: FONT, fontSize: 14,
          }}>ยกเลิก</button>
          <button
            onClick={() => onSave(item, levels)}
            disabled={saving}
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

const LEVEL_CIRCLE_COLORS = ["#ef5350", "#ff9800", "#fdd835", "#66bb6a", "#388e3c"];

// ── Add item inline row ───────────────────────────────────────
function AddItemRow({ onSave, onCancel, saving }) {
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
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
          style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
      </td>
      <td colSpan={3} style={{ padding: '6px 10px' }}>
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

// ── Item row ──────────────────────────────────────────────────
function ItemRow({ item, onUpdate, onOpenLevels, saving, disabled }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSaving = saving?.type === "item" && saving?.id === item.id;

  const saveItem = useCallback(async (patch) => {
    onUpdate("save-item", item.id, patch);
  }, [item.id, onUpdate]);

  return (
    <tr style={{ background: "#fff" }}>
      <td style={{ padding: "8px 10px", width: 66, whiteSpace: "nowrap" }}>
        <TextEdit
          value={item.code}
          disabled={disabled}
          multiline={false}
          onChange={v => onUpdate("item-code", item.id, { code: v })}
          onSave={v => saveItem({ code: v })}
          style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}
        />
      </td>
      <td style={{ padding: "6px 10px" }}>
        <TextEdit
          value={item.nameTh}
          disabled={disabled}
          onChange={v => onUpdate("item-name", item.id, { nameTh: v })}
          onSave={v => saveItem({ nameTh: v })}
        />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", width: 80 }}>
        <WeightInput
          value={item.defaultWeight}
          disabled={disabled}
          onChange={v => onUpdate("item-weight", item.id, { defaultWeight: v })}
          onSave={v => saveItem({ defaultWeight: v })}
        />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", width: 90 }}>
        <span style={{ fontSize: 12, color: "#aaa" }}>{item.levels.length} ระดับ</span>
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", width: 90 }}>
        <button
          onClick={() => onOpenLevels(item)}
          disabled={disabled}
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
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: "2px 6px", borderRadius: 5, border: "1.5px solid #ddd",
                background: "#fff", fontSize: 11, fontFamily: FONT, cursor: "pointer",
              }}>ยกเลิก</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={disabled}
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

// ── Section card ──────────────────────────────────────────────
function SectionCard({ section, idx, onUpdate, onOpenLevels, saving, disabled, evalType }) {
  const [expanded,    setExpanded]    = useState(false);
  const [showAddRow,  setShowAddRow]  = useState(false);
  const isSavingSection  = saving?.type === "category" && saving?.id === section.id;
  const isSavingNew      = saving?.type === "new-item";
  const activeItems = section.items.filter(it => it.isActive !== false);

  return (
    <div style={{
      background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.07)",
      marginBottom: 14, overflow: "hidden",
    }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
        borderBottom: expanded ? "1px solid #e8f0e8" : "none",
        background: expanded ? "#f6faf6" : "#fff",
        cursor: "pointer",
      }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 0, lineHeight: 1 }}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Section number badge */}
        <span style={{
          minWidth: 28, height: 28, borderRadius: "50%", background: "#1b5e20",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>{idx + 1}</span>

        {/* Section name (editable) */}
        <div style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
          <TextEdit
            value={section.nameTh}
            disabled={disabled}
            multiline={false}
            onChange={v => onUpdate("cat-name", section.id, { nameTh: v })}
            onSave={v => onUpdate("save-cat", section.id, { nameTh: v })}
            style={{ fontWeight: 700, fontSize: 14 }}
          />
        </div>

        {/* Weight */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 12, color: "#888", fontFamily: FONT }}>น้ำหนัก:</span>
          <WeightInput
            value={section.totalWeight}
            disabled={disabled}
            onChange={v => onUpdate("cat-weight", section.id, { totalWeight: v })}
            onSave={v => onUpdate("save-cat", section.id, { totalWeight: v })}
          />
        </div>

        {/* Saving indicator */}
        {isSavingSection && (
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite", color: "#aaa", flexShrink: 0 }} />
        )}
      </div>

      {/* Items table */}
      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f0f7f0" }}>
                <th style={TH}>รหัส</th>
                <th style={{ ...TH, textAlign: "left" }}>ชื่อหัวข้อ (คลิกเพื่อแก้ไข)</th>
                <th style={TH}>น้ำหนัก</th>
                <th style={TH}>ระดับ</th>
                <th style={TH}>แก้ระดับ</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {activeItems.length === 0 && !showAddRow
                ? <tr><td colSpan={6} style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>ไม่มีรายการ — กด "+ เพิ่ม item" เพื่อเพิ่ม</td></tr>
                : activeItems.map(item => (
                  <ItemRow
                    key={item.id ?? item.code}
                    item={item}
                    onUpdate={onUpdate}
                    onOpenLevels={onOpenLevels}
                    saving={saving}
                    disabled={disabled}
                  />
                ))
              }
              {showAddRow && (
                <AddItemRow
                  saving={isSavingNew}
                  onCancel={() => setShowAddRow(false)}
                  onSave={data => {
                    setShowAddRow(false);
                    onUpdate("add-item", section.id, {
                      ...data,
                      categoryId:  section.id,
                      criteriaSet: evalType,
                    });
                  }}
                />
              )}
            </tbody>
          </table>

          {/* Add item button */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #e8f0e8" }}>
            <button
              onClick={() => setShowAddRow(true)}
              disabled={disabled || showAddRow}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 7, border: "1.5px dashed #a5d6a7",
                background: "#f6faf6", color: "#1b5e20", fontFamily: FONT, fontSize: 12,
                fontWeight: 600, cursor: disabled || showAddRow ? "not-allowed" : "pointer",
                opacity: showAddRow ? 0.5 : 1,
              }}
            >+ เพิ่ม item</button>
          </div>

          {/* Items weight sum hint */}
          {activeItems.length > 0 && (() => {
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

const TH = {
  padding: "9px 10px", fontSize: 11.5, fontWeight: 700, textAlign: "center",
  color: "#4a6b4a", textTransform: "uppercase", letterSpacing: ".3px",
  borderBottom: "1px solid #dce8dc",
};

// ── Main component ────────────────────────────────────────────
export default function AdminCriteriaEditor({ authUser }) {
  const [evalType,     setEvalType]     = useState("pre_eval");
  const [sections,     setSections]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(null);
  const [toast,        setToast]        = useState(null);
  const [levelsModal,  setLevelsModal]  = useState(null);
  const reloadContext  = useCriteriaReload();
  const [seeding,      setSeeding]      = useState(false);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadCriteria = useCallback(async (et) => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/criteria?evalType=${et}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setSections(data);
    } catch {
      showToast("โหลดข้อมูลไม่สำเร็จ — ตรวจสอบว่า server กำลังทำงานอยู่", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      const payload = buildSeedPayload();
      const r = await authFetch('/api/criteria/seed', {
        method: 'POST',
        body: JSON.stringify({ sections: payload }),
      });
      const contentType = r.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server ไม่ตอบสนอง (${r.status}) — รีสตาร์ท server แล้วลองใหม่`);
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      showToast(data.message ?? 'นำเข้าข้อมูลสำเร็จ');
      await loadCriteria(evalType);
      reloadContext();
    } catch (err) {
      showToast(err.message || 'นำเข้าข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setSeeding(false);
    }
  }, [evalType, loadCriteria, showToast, reloadContext]);

  useEffect(() => { loadCriteria(evalType); }, [evalType, loadCriteria]);

  // ── update local state + optionally call API ─────────────────
  const handleUpdate = useCallback(async (action, id, payload) => {
    if (action === "cat-name") {
      setSections(prev => prev.map(s => s.id === id ? { ...s, nameTh: payload.nameTh } : s));
      return;
    }
    if (action === "cat-weight") {
      setSections(prev => prev.map(s => s.id === id ? { ...s, totalWeight: payload.totalWeight } : s));
      return;
    }
    if (action === "item-name") {
      setSections(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, nameTh: payload.nameTh } : it),
      })));
      return;
    }
    if (action === "item-code") {
      setSections(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, code: payload.code } : it),
      })));
      return;
    }
    if (action === "item-weight") {
      setSections(prev => prev.map(s => ({
        ...s, items: s.items.map(it => it.id === id ? { ...it, defaultWeight: payload.defaultWeight } : it),
      })));
      return;
    }

    // ── ADD item ─────────────────────────────────────────────────
    if (action === "add-item") {
      setSaving({ type: "new-item" });
      try {
        const r = await authFetch('/api/criteria/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error((await r.json()).message ?? '');
        showToast('เพิ่มรายการสำเร็จ');
        await loadCriteria(evalType);
        reloadContext();
      } catch (err) {
        showToast(err.message || 'เพิ่มรายการไม่สำเร็จ', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }

    // ── DELETE item (soft) ────────────────────────────────────────
    if (action === "delete-item") {
      setSaving({ type: "item", id });
      try {
        const r = await authFetch(`/api/criteria/items/${id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();
        setSections(prev => prev.map(s => ({
          ...s, items: s.items.filter(it => it.id !== id),
        })));
        showToast('ลบรายการสำเร็จ');
        reloadContext();
      } catch {
        showToast('ลบรายการไม่สำเร็จ', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }

    // API calls
    if (action === "save-cat") {
      setSaving({ type: "category", id });
      try {
        const current = sections.find(s => s.id === id);
        const body = { ...current, ...payload };
        const r = await authFetch(`/api/criteria/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: body.nameTh, totalWeight: body.totalWeight }),
        });
        if (!r.ok) throw new Error();
        showToast("บันทึกหัวข้อสำเร็จ");
        reloadContext();
      } catch {
        showToast("บันทึกหัวข้อไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
    }

    if (action === "save-item") {
      setSaving({ type: "item", id });
      let item = null;
      sections.forEach(s => s.items.forEach(it => { if (it.id === id) item = it; }));
      if (!item) return;
      const body = { ...item, ...payload };
      try {
        const r = await authFetch(`/api/criteria/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nameTh: body.nameTh, detailTh: body.detailTh, defaultWeight: body.defaultWeight, code: body.code }),
        });
        if (!r.ok) throw new Error();
        showToast("บันทึกรายการสำเร็จ");
        reloadContext();
      } catch {
        showToast("บันทึกรายการไม่สำเร็จ", "error");
      } finally {
        setSaving(null);
      }
    }
  }, [sections, showToast, evalType, loadCriteria, reloadContext]);

  // ── save levels ───────────────────────────────────────────────
  const handleSaveLevels = useCallback(async (item, levels) => {
    setSaving({ type: "levels", id: item.id });
    try {
      const r = await authFetch(`/api/criteria/items/${item.id}/levels`, {
        method: "PATCH",
        body: JSON.stringify({ levels }),
      });
      if (!r.ok) throw new Error();
      // Update local state
      setSections(prev => prev.map(s => ({
        ...s,
        items: s.items.map(it => it.id === item.id ? { ...it, levels } : it),
      })));
      showToast("บันทึกระดับคะแนนสำเร็จ");
      reloadContext();
      setLevelsModal(null);
    } catch {
      showToast("บันทึกระดับคะแนนไม่สำเร็จ", "error");
    } finally {
      setSaving(null);
    }
  }, [showToast]);

  // ── total weight sum ──────────────────────────────────────────
  const totalWeight = sections.reduce((s, c) => s + (c.totalWeight ?? 0), 0);
  const weightOk    = Math.abs(totalWeight - 100) < 0.1;

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Top bar ─── */}
      <div style={{
        background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 20,
        boxShadow: "0 2px 10px rgba(0,0,0,.06)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a1a", marginRight: 4 }}>
          เปลี่ยนเกณฑ์และ Parameter
        </div>

        {/* PRE/POST toggle */}
        <div style={{ display: "flex", background: "#f0f4f0", borderRadius: 10, padding: 3, gap: 2 }}>
          {[
            { key: "pre_eval",  label: "PRE — ผู้ขายใหม่" },
            { key: "post_eval", label: "POST — ประเมินประจำ" },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setEvalType(opt.key)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 13, fontWeight: evalType === opt.key ? 700 : 400,
                background: evalType === opt.key ? "#1b5e20" : "transparent",
                color: evalType === opt.key ? "#fff" : "#555",
                transition: "all .15s",
              }}
            >{opt.label}</button>
          ))}
        </div>

        {/* Total weight badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
          borderRadius: 8, background: weightOk ? "#e8f5e9" : "#fff8e1",
          border: `1.5px solid ${weightOk ? "#a5d6a7" : "#ffe082"}`,
          fontSize: 12, fontWeight: 700,
          color: weightOk ? "#1b5e20" : "#e65100",
        }}>
          {weightOk ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          รวมน้ำหนักทั้งหมด: {totalWeight.toFixed(1)} / 100
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={handleSeed}
            disabled={loading || seeding}
            title="นำเข้าข้อมูลจาก constants.js เพื่อเริ่มต้นใช้งาน"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "#fff3e0", border: "1.5px solid #ffcc80", borderRadius: 8,
              padding: "7px 14px", cursor: (loading || seeding) ? "not-allowed" : "pointer",
              fontSize: 12, fontFamily: FONT, color: "#e65100", fontWeight: 600,
            }}
          >
            <Download size={13} style={{ animation: seeding ? "spin 1s linear infinite" : "none" }} />
            นำเข้าข้อมูลเริ่มต้น
          </button>
          <button
            onClick={() => loadCriteria(evalType)}
            disabled={loading}
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

      {/* ── Info tip ─── */}
      <div style={{
        background: "#e3f2fd", border: "1px solid #90caf9", borderRadius: 10,
        padding: "10px 16px", marginBottom: 20, fontSize: 12.5, color: "#1565c0",
        fontFamily: FONT,
      }}>
        <b>วิธีใช้:</b> คลิกที่ชื่อหัวข้อหรือน้ำหนักเพื่อแก้ไขทันที — กด Enter หรือคลิกออกเพื่อบันทึกอัตโนมัติ &nbsp;|&nbsp;
        กด "แก้ระดับ" เพื่อแก้ไขข้อความระดับคะแนน 1–5
      </div>

      {/* ── Loading ─── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 15 }}>
          <RefreshCw size={22} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <div>กำลังโหลดข้อมูลเกณฑ์…</div>
        </div>
      )}

      {/* ── Empty state ─── */}
      {!loading && sections.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px", background: "#fff",
          borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)",
          color: "#888", fontSize: 15,
        }}>
          <AlertCircle size={32} style={{ marginBottom: 10, opacity: .5 }} />
          <div style={{ fontWeight: 600 }}>ไม่พบข้อมูลเกณฑ์ในฐานข้อมูล</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "#aaa" }}>กดปุ่มด้านล่างเพื่อนำเข้าข้อมูลจาก constants.js</div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              marginTop: 18, display: "inline-flex", alignItems: "center", gap: 7,
              background: "#e65100", color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 22px", fontSize: 14, fontFamily: FONT, fontWeight: 700,
              cursor: seeding ? "not-allowed" : "pointer",
            }}
          >
            <Download size={15} style={{ animation: seeding ? "spin 1s linear infinite" : "none" }} />
            {seeding ? "กำลังนำเข้า…" : "นำเข้าข้อมูลเริ่มต้น"}
          </button>
        </div>
      )}

      {/* ── Sections ─── */}
      {!loading && sections.map((section, idx) => (
        <SectionCard
          key={section.id ?? idx}
          section={section}
          idx={idx}
          evalType={evalType}
          onUpdate={handleUpdate}
          onOpenLevels={setLevelsModal}
          saving={saving}
          disabled={!!saving}
        />
      ))}

      {/* ── Levels modal ─── */}
      {levelsModal && (
        <LevelsModal
          item={levelsModal}
          onClose={() => setLevelsModal(null)}
          onSave={handleSaveLevels}
          saving={saving?.type === "levels" && saving?.id === levelsModal.id}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
