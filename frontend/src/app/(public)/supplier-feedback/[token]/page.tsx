// ============================================================
//  app/supplier-feedback/[token]/page.tsx
//  Public, unauthenticated page reached only via the one-time
//  magic-link emailed to a supplier after their session is
//  approved (database/CROSS_EVALUATION_SPEC.md, cross-eval #3).
//  No login, no sidebar — token in the URL is the only "auth".
// ============================================================
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Logo, GreenButton } from "@/components";
import { authFetch } from "@/utils/api";

const ROLE_LABEL: Record<string, string> = { USER: "ผู้ประเมิน (ฝ่ายใช้งาน)", GCP: "ผู้จัดซื้อ (Buyer)" };

interface Target {
  employeeId: string;
  fullName: string;
  role: string;
}

interface Criterion {
  code: string;
  nameTh: string;
}

interface FeedbackData {
  supplierName: string;
  targets: Target[];
  criteria: Criterion[];
}

function ScorePicker({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            width: 34, height: 34, borderRadius: 8,
            border: value === n ? "none" : "1.5px solid #cfd8cf",
            background: value === n ? "#1b5e20" : "#fff",
            color: value === n ? "#fff" : "#333",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            fontFamily: "Sarabun, sans-serif",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function SupplierFeedbackPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState]     = useState<"loading" | "error" | "ready" | "submitted">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData]       = useState<FeedbackData | null>(null);
  const [scores, setScores]   = useState<Record<string, Record<string, number>>>({}); // { [employeeId]: { [code]: score } }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authFetch(`/api/public/supplier-eval/${token}`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || "เกิดข้อผิดพลาด");
        return body;
      })
      .then(d => { setData(d); setState("ready"); })
      .catch((err: Error) => { setErrorMsg(err.message); setState("error"); });
  }, [token]);

  const setScore = (employeeId: string, code: string, value: number) => {
    setScores(prev => ({ ...prev, [employeeId]: { ...(prev[employeeId] || {}), [code]: value } }));
  };

  const allScored = !!data && data.targets.every(t =>
    data.criteria.every(c => scores[t.employeeId]?.[c.code] != null)
  );

  const handleSubmit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const ratings = data.targets.map(t => ({
        targetEmployeeId: t.employeeId,
        role: t.role,
        scores: Object.fromEntries(
          Object.entries(scores[t.employeeId] || {}).map(([code, score]) => [code, { score }])
        ),
      }));
      const res = await authFetch(`/api/public/supplier-eval/${token}`, {
        method: "POST",
        body: JSON.stringify({ ratings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "ส่งไม่สำเร็จ");
      setState("submitted");
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: ReactNode) => (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #14532d 0%, #1b5e20 55%, #2e7d32 100%)",
      fontFamily: "Sarabun, sans-serif", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "40px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Logo size={28} />
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: "monospace" }}>SPES</span>
      </div>
      <div style={{
        width: "100%", maxWidth: 560, background: "#fff", borderRadius: 16,
        boxShadow: "0 12px 36px rgba(0,0,0,0.18)", padding: "28px 28px 24px",
      }}>
        {children}
      </div>
    </div>
  );

  if (state === "loading") {
    return shell(<div style={{ textAlign: "center", padding: 40, color: "#888" }}>กำลังโหลด...</div>);
  }

  if (state === "error") {
    return shell(
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#c62828", fontSize: 15, fontWeight: 700 }}>{errorMsg}</div>
      </div>
    );
  }

  if (state === "submitted") {
    return shell(
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ color: "#1b5e20", fontSize: 16, fontWeight: 700 }}>ขอบคุณสำหรับความคิดเห็นของท่าน</div>
      </div>
    );
  }

  if (!data) return null;

  return shell(
    <>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: "#1b5e20" }}>ขอความคิดเห็นเกี่ยวกับการให้บริการ</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          {data.supplierName} — กรุณาให้คะแนนการทำงานร่วมกับทีมงานที่ดูแลท่าน (1 = ควรปรับปรุง, 5 = ดีเยี่ยม)
        </div>
      </div>

      {data.targets.map(t => (
        <div key={t.employeeId} style={{ marginBottom: 24, border: "1px solid #e8f0e8", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1b5e20", marginBottom: 2 }}>{t.fullName}</div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 14 }}>{ROLE_LABEL[t.role] ?? t.role}</div>
          {data.criteria.map(c => (
            <div key={c.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, color: "#333", flex: 1 }}>{c.nameTh}</div>
              <ScorePicker value={scores[t.employeeId]?.[c.code]} onChange={v => setScore(t.employeeId, c.code, v)} />
            </div>
          ))}
        </div>
      ))}

      {errorMsg && <div style={{ color: "#c62828", fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}

      <GreenButton fullWidth disabled={!allScored || submitting} onClick={handleSubmit}>
        {submitting ? "กำลังส่ง..." : "ส่งความคิดเห็น"}
      </GreenButton>
    </>
  );
}
