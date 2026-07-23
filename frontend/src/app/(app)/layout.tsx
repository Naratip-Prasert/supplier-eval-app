// ============================================================
//  app/(app)/layout.tsx
//  Every authenticated page lives under this route group. Wraps
//  CriteriaProvider (must be outside AuthProvider — AuthProvider calls
//  useCriteriaReload()) + AuthProvider, then gates children behind the
//  auth check exactly like App.jsx used to: render nothing until
//  authChecked, redirect to /login if not logged in.
//  supplier-feedback/[token] lives outside this group, so it's never
//  wrapped in either provider — no special-case bypass code needed
//  (main.jsx used to need a pathname regex for this).
// ============================================================
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CriteriaProvider } from "@/context/CriteriaContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { EvalFlowProvider } from "@/context/EvalFlowContext";
import ChatWidget from "@/components/shared/ChatWidget";

function AuthGate({ children }: { children: ReactNode }) {
  const { user, authChecked } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authChecked && !user) router.replace("/login");
  }, [authChecked, user, router]);

  // Waiting on the initial session check, or about to redirect — render
  // nothing, same as App.jsx's `if (!authChecked) return null`.
  if (!authChecked || !user) return null;

  return (
    <>
      {children}
      <ChatWidget />
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <CriteriaProvider>
      <AuthProvider>
        <AuthGate>
          <EvalFlowProvider>{children}</EvalFlowProvider>
        </AuthGate>
      </AuthProvider>
    </CriteriaProvider>
  );
}
