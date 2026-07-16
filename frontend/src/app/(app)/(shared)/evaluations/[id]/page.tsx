// ============================================================
//  app/(app)/evaluations/[id]/page.tsx
//  Ported from App.jsx's inline EvalHistoryLoader — fetches one saved
//  evaluation by id and renders ResultView read-only. Reached from
//  History/Supervisor/Admin/Result pages, each passing back their own
//  route via ?from= so the back button returns to the right place
//  (old App.jsx tracked this as `prevPage` in top-level state; here
//  it travels in the URL instead, which also makes this link
//  shareable/bookmarkable — the old app-state version never was).
// ============================================================
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getCriteria, type CriteriaEntry } from "@/constants";
import { authFetch } from "@/utils/api";
import ResultView from "@/components/shared/ResultView";
import type { EvalFormData, EvalResult } from "@/context/EvalFlowContext";

interface Loaded {
  formData: EvalFormData;
  result: EvalResult;
}

function backRouteFor(from: string | null, sessionId: string | null): string {
  if (from === "history") return "/history";
  if (from === "supervisor") return "/supervisor";
  if (from === "admin") return `/admin?tab=sessions${sessionId ? `&sessionId=${sessionId}` : ""}`;
  if (from === "result") return "/eval/result";
  return "/history";
}

function EvalDetailPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const sessionId = searchParams.get("sessionId");
  const { user, profilePic } = useAuth();

  const [loaded, setLoaded] = useState<Loaded | "error" | null>(null);

  useEffect(() => {
    // Same EvalHistoryLoader instance is reused across evalId changes (no
    // `key` prop — see onViewHistoryEval below) — without this guard,
    // navigating quickly between related evaluations could let an older,
    // slower response overwrite the newer one's display with no error.
    let cancelled = false;
    setLoaded(null);
    authFetch(`/api/evaluations/${params.id}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        const CRITERIA = getCriteria(d.evalType);

        // Scores are stored as 0-5 normalized (rawLv/maxLv*5) at submit time.
        // Reverse to raw level scale so sectionSummary formula (lv/maxLv)*weight works correctly.
        const maxLvMap: Record<string, number> = {};
        CRITERIA.forEach((sec) => sec.items.forEach((item: CriteriaEntry) => {
          if (!item.divider && item.no) maxLvMap[item.no] = item.levelValues ? Math.max(...item.levelValues) : 5;
        }));

        const scoresObj: Record<string, number> = {};
        const weightsObj: Record<string, number> = {};
        const notesObj: Record<string, string> = {};

        // 1. Seed from raw_scores (complete snapshot saved at submit time)
        const raw = d.rawScores ?? {};
        const hasRaw = Object.keys(raw).length > 0;
        Object.entries(raw).forEach(([code, entry]) => {
          const e = entry as { score?: number; weight?: number; note?: string };
          if (e.score != null) {
            const maxLv = maxLvMap[code] ?? 5;
            scoresObj[code] = (Number(e.score) / 5) * maxLv;
          }
          if (e.weight != null) weightsObj[code] = Number(e.weight);
          notesObj[code] = e.note || "";
        });

        // 2. Overlay with DB evaluation_scores (also stored as 0-5 normalized)
        (d.scores ?? []).forEach((s: { code: string; score?: number; weight?: number; note?: string }) => {
          if (s.score != null) {
            const maxLv = maxLvMap[s.code] ?? 5;
            scoresObj[s.code] = (Number(s.score) / 5) * maxLv;
          }
          if (s.weight != null) weightsObj[s.code] = Number(s.weight);
          notesObj[s.code] = s.note || "";
        });

        // 3. When raw_scores is missing (old evaluations), DB only has a few criteria
        //    so section aggregates will be wrong. Override radar with uniform polygon
        //    at the stored totalScore level so the chart matches the displayed score.
        const ratio    = Math.min(1, Number(d.totalScore) / 100);
        const radarOverride = hasRaw ? null : CRITERIA.map(() => ratio);

        setLoaded({
          formData: {
            empId:        d.employeeId,
            employeeId:   d.employeeId,
            dept:         d.department || "",
            evalType:     d.evalType,
            vendorCode:   d.vendorCode,
            supplierName: d.supplierName,
            period:       d.period,
            productType:  d.productType,
            role:         d.role,
          },
          result: {
            evalId:       d.id,
            submittedAt:  d.submittedAt,
            role:         d.role,
            totalScore:   Number(d.totalScore),
            grade:        d.grade,
            scores:       scoresObj,
            weights:      weightsObj,
            notes:        notesObj,
            radarOverride,
            moduleCode:   d.moduleCode ?? null,
            customItems:  d.customModuleItems ?? [],
          },
        });
      })
      .catch(() => { if (!cancelled) setLoaded("error"); });
    return () => { cancelled = true; };
  }, [params.id]);

  const onBack = () => router.push(backRouteFor(from, sessionId));
  const onViewHistoryEval = (id: string) => router.push(`/evaluations/${id}?from=${from ?? "history"}${sessionId ? `&sessionId=${sessionId}` : ""}`);

  if (loaded === "error") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Sarabun, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#c62828", marginBottom: 16 }}>โหลดข้อมูลไม่สำเร็จ</div>
        <button onClick={onBack} style={{ padding: "8px 20px", background: "#1b5e20", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "Sarabun, sans-serif" }}>กลับ</button>
      </div>
    </div>
  );
  if (!loaded) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e0e0e0", borderTop: "3px solid #1b5e20", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <ResultView
      formData={loaded.formData}
      result={loaded.result}
      user={user}
      profilePic={profilePic}
      onBack={onBack}
      onBackToEval={onBack}
      onViewHistoryEval={onViewHistoryEval}
      readOnly
    />
  );
}

export default function EvalDetailPage() {
  return (
    <Suspense fallback={null}>
      <EvalDetailPageInner />
    </Suspense>
  );
}
