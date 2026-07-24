// ============================================================
//  context/EvalFlowContext.tsx
//  Carries in-progress eval data across the /landing -> /eval -> /eval/result
//  hop. Ported 1:1 from App.jsx's top-level formData/result/evalSavedState
//  useState trio — moved into a Context (same pattern as CriteriaContext)
//  because Next.js pages don't share a parent's local state the way the
//  old App.jsx page-state-machine did.
//
//  Why this can't just be route params/refetch-by-id (see migration plan
//  B1): the ADMIN manual-entry flow on /landing has NO session/task id at
//  all before Evalform's first submit — vendorCode/supplierName/period are
//  freely typed into the form, and the backend only creates a session once
//  Evalform POSTs. There's nothing to fetch by id for that path, so the
//  object has to travel through client state for this one hop, exactly
//  like it did in App.jsx.
// ============================================================
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface EvalFormData {
  empId: string;
  employeeId: string;
  dept: string;
  evalType: string;
  vendorCode: string;
  supplierName: string;
  productType: string;
  period: string;
  role: string;
  sessionId?: string;
}

export interface EvalResult {
  evalId?: string;
  submittedAt?: string;
  role?: string;
  totalScore: number;
  grade: string;
  sectionWeights?: Record<number, number>;
  scores: Record<string, number>;
  weights: Record<string, number>;
  notes: Record<string, string>;
  // Evidence file attached alongside a note (EvalForm's NoteCell) — keyed
  // by item code same as scores/weights/notes. Uploaded ahead of submit via
  // POST /api/uploads/attachment; path/name mirror evaluation_scores.
  attachments?: Record<string, { path: string; name: string }>;
  // Criterion titles as they were when this evaluation was submitted (see
  // evaluation_scores.name_th_snapshot) — undefined/missing entries just
  // fall back to today's live criteria title, same as before this existed.
  titleSnapshots?: Record<string, string>;
  // Category/section label as it was at submit time (evaluation_scores.
  // category_name_th_snapshot) — used to place a since-deleted item's score
  // back into the right-looking section on the history view.
  categorySnapshots?: Record<string, string>;
  radarOverride?: number[] | null;
  moduleCode?: string | null;
  customItems?: unknown[];
  [key: string]: unknown;
}

interface EvalFlowContextValue {
  formData: EvalFormData | null;
  result: EvalResult | null;
  evalSavedState: EvalResult | null;
  setFormData: (d: EvalFormData | null) => void;
  setResult: (r: EvalResult | null) => void;
  setEvalSavedState: (s: EvalResult | null) => void;
  resetEvalFlow: () => void;
}

const EvalFlowContext = createContext<EvalFlowContextValue>({
  formData: null,
  result: null,
  evalSavedState: null,
  setFormData: () => {},
  setResult: () => {},
  setEvalSavedState: () => {},
  resetEvalFlow: () => {},
});

export function EvalFlowProvider({ children }: { children: ReactNode }) {
  const [formData, setFormData] = useState<EvalFormData | null>(null);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [evalSavedState, setEvalSavedState] = useState<EvalResult | null>(null);

  const resetEvalFlow = () => {
    setFormData(null);
    setResult(null);
    setEvalSavedState(null);
  };

  return (
    <EvalFlowContext.Provider value={{ formData, result, evalSavedState, setFormData, setResult, setEvalSavedState, resetEvalFlow }}>
      {children}
    </EvalFlowContext.Provider>
  );
}

export function useEvalFlow(): EvalFlowContextValue {
  return useContext(EvalFlowContext);
}
