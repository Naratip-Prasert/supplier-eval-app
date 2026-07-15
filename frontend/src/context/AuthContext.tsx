// ============================================================
//  context/AuthContext.tsx
//  Session state for everything under app/(app)/ — the JWT lives in an
//  httpOnly cookie the frontend can't read or decode, so "who am I" is
//  answered by asking the backend (GET /api/auth/me) once, here, instead
//  of every page re-fetching it. Ported from App.jsx's inline auth state.
// ============================================================
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { authFetch } from "../utils/api";
import { useCriteriaReload } from "./CriteriaContext";

export interface AuthUser {
  empId: string;
  fullName: string;
  role: string;
  email: string;
  department: string;
  jobTitle: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profilePic: string | null;
  authChecked: boolean;
  setUser: (u: AuthUser | null) => void;
  setProfilePic: (p: string | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profilePic: null,
  authChecked: false,
  setUser: () => {},
  setProfilePic: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const reloadCriteria = useCriteriaReload();

  // Restore the session on load — the JWT lives in an httpOnly cookie we
  // can't read, so ask the backend who (if anyone) it belongs to.
  useEffect(() => {
    authFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) { setProfilePic(null); return; }
    // Guard against a fast logout-then-login-as-someone-else racing an
    // older request — without this, the previous user's photo could
    // briefly land after the new user's fetch resolves first.
    let cancelled = false;
    authFetch("/api/employees/me")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setProfilePic(d.profilePicture || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.empId]);

  // Criteria overrides need a live session — fetch once we actually know
  // the user is logged in.
  useEffect(() => {
    if (user) reloadCriteria();
  }, [user?.empId, reloadCriteria]);

  const logout = async () => {
    await authFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, profilePic, authChecked, setUser, setProfilePic, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
