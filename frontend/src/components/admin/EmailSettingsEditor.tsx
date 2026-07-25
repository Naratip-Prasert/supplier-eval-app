// ============================================================
//  components/admin/EmailSettingsEditor.tsx
//  Admin tab: Email Parameter — edit subject/title/body/button for all
//  9 outgoing email types, plus the 6 timing (days-before/after) settings.
//  Backed by email_templates / email_settings (see backend/utils/emailService.ts,
//  which reads these same rows — an unedited row keeps sending today's
//  exact hardcoded copy).
// ============================================================
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "../../utils/api";
import { Mail, Clock, Save, RefreshCw, AlertCircle, CheckCircle2, Info, Plus } from "lucide-react";

const FONT = "Sarabun, sans-serif";

interface EmailTemplate {
  emailType: string;
  subject: string;
  titleTh: string;
  bodyText: string;
  buttonLabel: string | null;
  updatedAt?: string;
}
interface EmailSetting {
  key: string;
  value: number;
  labelTh: string;
  updatedAt?: string;
}
interface ToastState { msg: string; type: "success" | "error"; }

const EMAIL_TYPE_LABELS: Record<string, string> = {
  invitation: "แจ้งเชิญประเมิน",
  reminder: "เตือนใกล้ครบกำหนด",
  overdue: "เกินกำหนด (ผู้ประเมิน)",
  overdue_escalation: "เกินกำหนด (แจ้ง Supervisor)",
  thankyou: "ขอบคุณหลังส่งผล",
  supervisor_notify: "แจ้ง Supervisor รออนุมัติ",
  supervisor_result_approved: "ผลอนุมัติแล้ว",
  supervisor_result_returned: "ผลถูกส่งคืนแก้ไข",
  supplier_eval_invite: "เชิญ Supplier ประเมินบริการ",
};

// Available {{placeholders}} per email type — must match the `vars` object
// each sendXEmail() builds server-side (backend/utils/emailService.ts).
const EMAIL_TYPE_VARS: Record<string, string[]> = {
  invitation: ["assignedName", "supplierName"],
  reminder: ["assignedName", "supplierName", "dueDate", "reminderDaysBefore"],
  overdue: ["assignedName", "supplierName", "dueDate", "overdueDaysAfter"],
  overdue_escalation: ["supervisorName", "supplierName", "overdueDaysAfter"],
  thankyou: ["assignedName", "supplierName", "reviewDueDays"],
  supervisor_notify: ["supervisorName", "supplierName"],
  supervisor_result_approved: ["toName", "supplierName"],
  supervisor_result_returned: ["toName", "supplierName"],
  supplier_eval_invite: ["supplierName"],
};

// Thai labels shown on the "insert variable" buttons — clicking one inserts
// the real {{token}} at the cursor so the admin never has to type the
// double-curly-brace syntax by hand.
const VAR_LABELS: Record<string, string> = {
  assignedName: "ชื่อผู้รับผิดชอบ",
  supplierName: "ชื่อ Supplier",
  dueDate: "วันครบกำหนด",
  reminderDaysBefore: "จำนวนวันก่อนครบกำหนด",
  overdueDaysAfter: "จำนวนวันหลังเกินกำหนด",
  reviewDueDays: "จำนวนวันให้ Supervisor อนุมัติ",
  supervisorName: "ชื่อ Supervisor",
  toName: "ชื่อผู้รับ",
};

// Sample values used only for the live preview (real sends substitute real data).
const PREVIEW_SAMPLE: Record<string, string> = {
  assignedName: "สมชาย ใจดี",
  supplierName: "ตัวอย่าง จำกัด (มหาชน)",
  dueDate: "31 กรกฎาคม 2569",
  supervisorName: "หัวหน้างาน ตัวอย่าง",
  toName: "ผู้รับ ตัวอย่าง",
};

// Groups the 9 email types by where they sit in one evaluation task's
// lifecycle — mirrors the numbered sections already in emailService.ts
// (1. Invitation → 2. Reminder → 3. Overdue/escalation, then 4-6. result
// & approval, then 7. the separate supplier-feedback invite).
const EMAIL_TAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: "ติดตามงานประเมิน", keys: ["invitation", "reminder", "overdue", "overdue_escalation"] },
  { label: "ผลการประเมินและอนุมัติ", keys: ["thankyou", "supervisor_notify", "supervisor_result_approved", "supervisor_result_returned"] },
  { label: "แบบประเมินเพิ่มเติม", keys: ["supplier_eval_invite"] },
];

// Groups the 6 timing settings by what they control — reminders/escalation
// on one hand, due-date calculation on the other.
const TIMING_GROUPS: { label: string; keys: string[] }[] = [
  { label: "แจ้งเตือนงานประเมิน", keys: ["reminder_days_before", "overdue_days_after", "review_due_days"] },
  { label: "ครบกำหนดประเมิน", keys: ["pre_eval_due_days", "post_eval_due_days", "periodic_due_days"] },
];

function activeFieldLabel(field: "subject" | "titleTh" | "bodyText"): string {
  return { subject: "หัวข้ออีเมล", titleTh: "หัวข้อในการ์ด", bodyText: "เนื้อหา" }[field];
}

function esc(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Preview-only: wraps a substituted value in a highlight chip so the admin
// can see at a glance which words come from real data vs. the fixed text
// they typed — the actual saved template still stores the raw {{token}}.
function highlight(value: string): string {
  return `<span style="background:#fff176;color:#5c4a00;padding:0 4px;border-radius:4px;font-weight:700;">${value}</span>`;
}

// Mirrors emailService.ts's renderText/renderBodyHtml (escape-then-substitute
// order), but highlights each substituted value for the live preview.
function renderText(template: string, vars: Record<string, string>): string {
  return esc(template).replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? highlight(esc(vars[key])) : ""));
}
function renderBodyHtml(template: string, vars: Record<string, string>): string {
  const escapedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) escapedVars[k] = highlight(esc(v));
  const rendered = esc(template).replace(/\{\{(\w+)\}\}/g, (_, key) => (key in escapedVars ? escapedVars[key] : ""));
  // Explicit inline margin — the app's own globals.css resets `* { margin: 0 }`,
  // which would otherwise silently flatten every paragraph gap in this preview
  // even though the same blank line renders fine in a real, standalone email.
  return rendered.split(/\n\s*\n/).filter(b => b.trim()).map(b => `<p style="margin:0 0 14px;">${b.split("\n").join("<br/>")}</p>`).join("\n");
}

// ── Toast ────────────────────────────────────────────────────
function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 8,
      background: ok ? "#1b5e20" : "#c62828", color: "#fff",
      padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
      fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    }}>
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {toast.msg}
    </div>
  );
}

export default function EmailSettingsEditor() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [settings,  setSettings]  = useState<EmailSetting[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [subTab,    setSubTab]    = useState<string>("invitation"); // emailType | "timing"
  const [toast,     setToast]     = useState<ToastState | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tR, sR] = await Promise.all([
        authFetch("/api/admin/email-templates"),
        authFetch("/api/admin/email-settings"),
      ]);
      if (!tR.ok || !sR.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${tR.status}/${sR.status})`);
      const [tRes, sRes] = await Promise.all([tR.json(), sR.json()]);
      setTemplates(Array.isArray(tRes) ? tRes : []);
      setSettings(Array.isArray(sRes) ? sRes : []);
    } catch (e) {
      console.error("[EmailSettingsEditor] fetchAll error:", e);
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string, type: "success" | "error") => setToast({ msg, type });

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#aaa", fontFamily: FONT }}>กำลังโหลด…</div>;

  if (error) {
    return (
      <div style={{
        background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 10,
        padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
        color: "#b71c1c", fontSize: 13, fontFamily: FONT,
      }}>
        <AlertCircle size={16} /> {error}
        <button onClick={fetchAll} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b71c1c", fontWeight: 700 }}>
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <Toast toast={toast} />

      {/* ── Sub-tab bar, grouped by where each email sits in one evaluation
           task's lifecycle, rather than one flat row of 10 buttons ── */}
      <div style={{ marginBottom: 20, borderBottom: "1.5px solid #eee", paddingBottom: 14 }}>
        {EMAIL_TAB_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9aa39a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              {group.label}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {group.keys.map(key => (
                <button
                  key={key}
                  onClick={() => setSubTab(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0",
                    cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: FONT,
                    background: subTab === key ? "#1b5e20" : "#fff",
                    color: subTab === key ? "#fff" : "#555",
                    borderColor: subTab === key ? "#1b5e20" : "#e0e0e0",
                  }}
                >
                  <Mail size={13} /> {EMAIL_TYPE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9aa39a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
            ตั้งค่า
          </div>
          <button
            onClick={() => setSubTab("timing")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0",
              cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: FONT,
              background: subTab === "timing" ? "#e65100" : "#fff",
              color: subTab === "timing" ? "#fff" : "#555",
              borderColor: subTab === "timing" ? "#e65100" : "#e0e0e0",
            }}
          >
            <Clock size={13} /> จัดการเวลา
          </button>
        </div>
      </div>

      {subTab === "timing" ? (
        <TimingPanel
          settings={settings}
          onSaved={(updated) => {
            setSettings(prev => prev.map(s => s.key === updated.key ? updated : s));
            showToast("บันทึกจังหวะเวลาสำเร็จ", "success");
          }}
          onError={(msg) => showToast(msg, "error")}
        />
      ) : (
        <TemplatePanel
          key={subTab}
          emailType={subTab}
          template={templates.find(t => t.emailType === subTab) ?? null}
          settings={settings}
          onSaved={(updated) => {
            setTemplates(prev => prev.map(t => t.emailType === updated.emailType ? updated : t));
            showToast("บันทึกอีเมลสำเร็จ", "success");
          }}
          onError={(msg) => showToast(msg, "error")}
        />
      )}
    </div>
  );
}

// ── Timing panel — 6 number inputs, save one at a time ─────────
function TimingPanel({ settings, onSaved, onError }: {
  settings: EmailSetting[];
  onSaved: (updated: EmailSetting) => void;
  onError: (msg: string) => void;
}) {
  const [drafts,  setDrafts]  = useState<Record<string, string>>(
    () => Object.fromEntries(settings.map(s => [s.key, String(s.value)]))
  );
  const [saving,  setSaving]  = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(settings.map(s => [s.key, String(s.value)])));
  }, [settings]);

  const save = async (key: string) => {
    const value = parseInt(drafts[key], 10);
    if (!Number.isFinite(value) || value < 1 || value > 365) {
      onError("จำนวนวันต้องเป็นตัวเลข 1-365");
      return;
    }
    setSaving(key);
    try {
      const r = await authFetch(`/api/admin/email-settings/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "บันทึกไม่สำเร็จ");
      onSaved(d);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #dde3dd",
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)", padding: "8px 24px",
    }}>
      {TIMING_GROUPS.map((group, gi) => (
        <div key={group.label} style={{ padding: "16px 0", borderTop: gi === 0 ? "none" : "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9aa39a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            {group.label}
          </div>
          {group.keys.map(key => {
            const s = settings.find(x => x.key === key);
            if (!s) return null;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div style={{ flex: 1, fontSize: 13, color: "#333" }}>{s.labelTh || s.key}</div>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={drafts[s.key] ?? ""}
                  onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                  style={{
                    width: 70, padding: "7px 10px", border: "1.5px solid #e0e0e0", borderRadius: 7,
                    fontSize: 13, fontFamily: FONT, boxSizing: "border-box", textAlign: "center",
                  }}
                />
                <span style={{ fontSize: 12, color: "#888", width: 24 }}>วัน</span>
                <button
                  onClick={() => save(s.key)}
                  disabled={saving === s.key || String(s.value) === drafts[s.key]}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                    background: "#1b5e20", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: FONT,
                    opacity: (saving === s.key || String(s.value) === drafts[s.key]) ? 0.5 : 1,
                  }}
                >
                  {saving === s.key ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
                  บันทึก
                </button>
              </div>
            );
          })}
        </div>
      ))}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Template panel — subject/title/body/button form + live preview ─
function TemplatePanel({ emailType, template, settings, onSaved, onError }: {
  emailType: string;
  template: EmailTemplate | null;
  settings: EmailSetting[];
  onSaved: (updated: EmailTemplate) => void;
  onError: (msg: string) => void;
}) {
  const [subject,     setSubject]     = useState(template?.subject ?? "");
  const [titleTh,     setTitleTh]     = useState(template?.titleTh ?? "");
  const [bodyText,    setBodyText]    = useState(template?.bodyText ?? "");
  const [buttonLabel, setButtonLabel] = useState(template?.buttonLabel ?? "");
  const [saving,      setSaving]      = useState(false);

  // Which field an "insert variable" click should target — tracked via
  // onFocus rather than onSelect, since a button click blurs the field
  // before firing but doesn't reset this JS state, and the DOM element's
  // selectionStart/End (read in insertVariable below) also survives blur.
  const [activeField, setActiveField] = useState<"subject" | "titleTh" | "bodyText">("bodyText");
  const subjectRef = useRef<HTMLInputElement>(null);
  const titleRef   = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (token: string) => {
    const fieldMap = {
      subject:  { ref: subjectRef, value: subject,  setValue: setSubject },
      titleTh:  { ref: titleRef,   value: titleTh,  setValue: setTitleTh },
      bodyText: { ref: bodyRef,    value: bodyText, setValue: setBodyText },
    } as const;
    const { ref, value, setValue } = fieldMap[activeField];
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const inserted = `{{${token}}}`;
    setValue(value.slice(0, start) + inserted + value.slice(end));
    requestAnimationFrame(() => {
      const pos = start + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const vars = EMAIL_TYPE_VARS[emailType] ?? [];
  const dirty = !!template && (
    subject !== template.subject || titleTh !== template.titleTh ||
    bodyText !== template.bodyText || (buttonLabel || "") !== (template.buttonLabel ?? "")
  );

  // {{token}} appearing more than once is fine — the substitution is a
  // global regex, so every occurrence gets replaced, both here and in the
  // real send. What ISN'T safe is a token this email type doesn't define
  // (a typo, or one copied from a different email's placeholder list) —
  // that one silently renders as blank text in the real email since
  // renderText/renderBodyHtml drop any key not found in `vars`. Surface it
  // here instead of letting it ship unnoticed.
  const unknownTokens = Array.from(
    new Set([...`${subject} ${titleTh} ${bodyText}`.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))
  ).filter(token => !vars.includes(token));

  const save = async () => {
    if (!subject.trim() || !titleTh.trim() || !bodyText.trim()) {
      onError("กรุณากรอกหัวข้ออีเมล ชื่อหัวข้อ และเนื้อหาให้ครบ");
      return;
    }
    setSaving(true);
    try {
      const r = await authFetch(`/api/admin/email-templates/${emailType}`, {
        method: "PATCH",
        body: JSON.stringify({ subject, titleTh, bodyText, buttonLabel: buttonLabel.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "บันทึกไม่สำเร็จ");
      onSaved(d);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Preview values: real settings values where relevant, sample text otherwise.
  const previewVars: Record<string, string> = { ...PREVIEW_SAMPLE };
  for (const v of vars) {
    const setting = settings.find(s => s.key === {
      reminderDaysBefore: "reminder_days_before",
      overdueDaysAfter: "overdue_days_after",
      reviewDueDays: "review_due_days",
    }[v]);
    if (setting) previewVars[v] = String(setting.value);
  }

  if (!template) {
    return <div style={{ color: "#bbb", padding: 24, textAlign: "center" }}>ไม่พบ template นี้ในระบบ</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      {/* ── Edit form ── */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #dde3dd",
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", padding: "20px 22px",
      }}>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16,
          background: "#e8f0fe", border: "1px solid #c3d9fb", borderRadius: 8,
          padding: "10px 12px", fontSize: 11.5, color: "#1565c0",
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            แทรกตัวแปรที่ตำแหน่งเคอร์เซอร์ในช่องที่กำลังพิมพ์อยู่ ({activeFieldLabel(activeField)}):
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {vars.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#fff", border: "1px solid #90caf9", color: "#1565c0",
                    borderRadius: 20, padding: "3px 10px 3px 8px", fontSize: 11.5, fontWeight: 600,
                    fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  <Plus size={11} /> {VAR_LABELS[v] ?? v}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, color: "#5a7bb5" }}></div>
          </div>
        </div>

        <Field label="หัวข้ออีเมล (Subject)">
          <input ref={subjectRef} value={subject} onChange={e => setSubject(e.target.value)} onFocus={() => setActiveField("subject")} style={inputStyle} />
        </Field>
        <Field label="หัวข้อในการ์ด (Title)">
          <input ref={titleRef} value={titleTh} onChange={e => setTitleTh(e.target.value)} onFocus={() => setActiveField("titleTh")} style={inputStyle} />
        </Field>
        <Field label="เนื้อหา (Body) — แยกย่อหน้าด้วยบรรทัดว่าง">
          <textarea ref={bodyRef} value={bodyText} onChange={e => setBodyText(e.target.value)} onFocus={() => setActiveField("bodyText")} rows={7} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
        </Field>
        <Field label="ข้อความปุ่ม (ว่าง = ไม่แสดงปุ่ม)">
          <input value={buttonLabel ?? ""} onChange={e => setButtonLabel(e.target.value)} style={inputStyle} />
        </Field>

        {unknownTokens.length > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14,
            background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8,
            padding: "10px 12px", fontSize: 12, color: "#8a6100",
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              พบตัวแปรที่ไม่รู้จักสำหรับอีเมลประเภทนี้: {unknownTokens.map(t => (
                <code key={t} style={{ background: "#fff", padding: "1px 5px", borderRadius: 4, marginRight: 4 }}>{`{{${t}}}`}</code>
              ))}
              <div style={{ marginTop: 3 }}>ตัวแปรเหล่านี้จะไม่ถูกแทนที่ในอีเมลจริง — จะหายไปเป็นข้อความว่างเปล่า กรุณาลบหรือแก้เป็นตัวแปรที่ใช้ได้ด้านบน</div>
            </div>
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 6,
            padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#1b5e20", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FONT,
            opacity: (saving || !dirty) ? 0.5 : 1,
          }}
        >
          {saving ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
          บันทึก
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* ── Live preview (mirrors backend wrap()) ── */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
          ตัวอย่าง Subject:{" "}
          <span
            style={{ color: "#333", textTransform: "none", fontWeight: 600 }}
            dangerouslySetInnerHTML={{ __html: renderText(subject, previewVars) }}
          />
        </div>
        <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 480, background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <div style={{ background: "#1a6b1a", padding: "18px 24px" }}>
            <h2
              style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 700 }}
              dangerouslySetInnerHTML={{ __html: renderText(titleTh, previewVars) }}
            />
          </div>
          <div style={{ background: "#f9f9f9", padding: 24, borderTop: "1px solid #ddd", fontSize: 14, color: "#333", lineHeight: 1.8 }}>
            <div dangerouslySetInnerHTML={{ __html: renderBodyHtml(bodyText, previewVars) }} />
            {buttonLabel?.trim() && (
              <a style={{ display: "inline-block", background: "#1a6b1a", color: "#fff", padding: "12px 28px", borderRadius: 8, textDecoration: "none", fontWeight: 700, marginTop: 8 }}>
                {buttonLabel}
              </a>
            )}
            <hr style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "20px 0 14px" }} />
            <p style={{ margin: 0, color: "#aaa", fontSize: 12 }}>Supplier Performance Evaluation System</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1.5px solid #e0e0e0", borderRadius: 7,
  fontSize: 13, fontFamily: FONT, boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
