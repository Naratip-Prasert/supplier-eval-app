// ============================================================
//  app/page.tsx — root: bounce to /login or /portal depending on
//  session state, same as App.jsx's default landing behavior.
// ============================================================
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/utils/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    authFetch("/api/auth/me")
      .then((r) => (r.ok ? router.replace("/portal") : router.replace("/login")))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
