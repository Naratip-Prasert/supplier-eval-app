// ============================================================
//  app/(app)/eval/result/page.tsx
//  Reached only right after submitting from /eval — formData/result
//  live in EvalFlowContext (set by Evalform just before navigating
//  here), not fetched by id. If they're missing (e.g. a hard refresh
//  on this URL, which the old page-state app could never do either
//  since it wasn't a real route), bounce to /landing — there's
//  nothing to show.
// ============================================================
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEvalFlow } from "@/context/EvalFlowContext";
import ResultView from "@/components/shared/ResultView";

export default function EvalResultPage() {
  const router = useRouter();
  const { user, profilePic } = useAuth();
  const { formData, result, setFormData, setResult, setEvalSavedState } = useEvalFlow();

  useEffect(() => {
    if (!formData || !result) router.replace("/landing");
  }, [formData, result, router]);

  if (!formData || !result) return null;

  return (
    <ResultView
      formData={formData}
      result={result}
      user={user}
      profilePic={profilePic}
      onBackToEval={() => router.push("/eval")}
      onBack={() => {
        setFormData(null);
        setResult(null);
        setEvalSavedState(null);
        router.push("/portal");
      }}
      onViewHistoryEval={(id) => router.push(`/evaluations/${id}?from=result`)}
    />
  );
}
