// ============================================================
//  app/(app)/eval/page.tsx
//  Reached from /landing after picking a supplier/session — formData
//  lives in EvalFlowContext (set by LandingPage just before navigating
//  here), same as the old App.jsx page-state's "eval" branch. Submitting
//  hands the scored result to EvalFlowContext and moves on to
//  /eval/result, which is what actually POSTs to the backend.
// ============================================================
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEvalFlow } from "@/context/EvalFlowContext";
import EvalForm, { type EvalDonePayload } from "@/components/shared/EvalForm";

export default function EvalPage() {
  const router = useRouter();
  const { user, profilePic } = useAuth();
  const { formData, evalSavedState, setEvalSavedState, setResult } = useEvalFlow();

  useEffect(() => {
    if (!formData) router.replace("/landing");
  }, [formData, router]);

  if (!formData) return null;

  const handleDone = (res: EvalDonePayload) => {
    // ผู้ที่กำลังส่งผลตอนนี้คือ user ที่ล็อกอินอยู่ — แนบ role ไว้ด้วย
    // เพื่อให้ป้าย "(ผลประเมินล่าสุด)" บนหน้า Result รู้ว่าต้องเทียบ
    // ล่าสุดกับ role ไหน (USER/GCP มีสิทธิ์ประเมินแยกกัน)
    const withRole = { ...res, role: user?.role };
    setEvalSavedState(withRole);
    setResult(withRole);
    router.push("/eval/result");
  };

  return (
    <EvalForm
      formData={formData}
      savedState={evalSavedState}
      user={user}
      profilePic={profilePic}
      onBack={() => { setEvalSavedState(null); router.push("/landing"); }}
      onDone={handleDone}
    />
  );
}
