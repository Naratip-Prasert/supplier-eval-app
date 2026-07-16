// ============================================================
//  context/CriteriaContext.tsx
//  Loads criteria overrides from the DB once on mount.
//  All pages that render the eval form read from this context
//  instead of constants.js directly, so admin changes take effect
//  without a code deploy.
// ============================================================
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { authFetch } from "../utils/api";
import { buildOverrideMap, buildFunctionOverrideMap, type OverrideMap, type FunctionOverrideMap } from "../utils/shared/criteriaOverlay";

interface CriteriaContextValue {
  preMap: OverrideMap | null;
  postMap: OverrideMap | null;
  funcMapPre: FunctionOverrideMap | null;
  funcMapPost: FunctionOverrideMap | null;
  reload: () => Promise<void>;
}

const CriteriaContext = createContext<CriteriaContextValue>({
  preMap:      null,
  postMap:     null,
  funcMapPre:  null,
  funcMapPost: null,
  reload:      async () => {},
});

export function CriteriaProvider({ children }: { children: ReactNode }) {
  const [preMap,      setPreMap]      = useState<OverrideMap | null>(null);
  const [postMap,     setPostMap]     = useState<OverrideMap | null>(null);
  const [funcMapPre,  setFuncMapPre]  = useState<FunctionOverrideMap | null>(null);
  const [funcMapPost, setFuncMapPost] = useState<FunctionOverrideMap | null>(null);

  const reload = useCallback(async () => {
    try {
      // Function modules are configured separately per Pre/Post track (each
      // track's Core+ESG total differs, so each needs its own Function
      // weight to independently reach 100%) — two separate fetches.
      const [preR, postR, funcPreR, funcPostR] = await Promise.all([
        authFetch('/api/criteria?evalType=pre_eval'),
        authFetch('/api/criteria?evalType=post_eval'),
        authFetch('/api/criteria?evalType=function&track=pre'),
        authFetch('/api/criteria?evalType=function&track=post'),
      ]);
      if (preR.ok)      setPreMap(buildOverrideMap(await preR.json()));
      if (postR.ok)     setPostMap(buildOverrideMap(await postR.json()));
      if (funcPreR.ok)  setFuncMapPre(buildFunctionOverrideMap(await funcPreR.json()));
      if (funcPostR.ok) setFuncMapPost(buildFunctionOverrideMap(await funcPostR.json()));
    } catch {
      // fail silently — constants.js used as fallback
    }
  }, []);

  // No longer auto-fires on mount: since auth is now an httpOnly cookie the
  // provider can't check client-side, the (app) layout calls reload() itself
  // (via useCriteriaReload) once it knows the user is actually logged in.

  return (
    <CriteriaContext.Provider value={{ preMap, postMap, funcMapPre, funcMapPost, reload }}>
      {children}
    </CriteriaContext.Provider>
  );
}

// Hook for Evalform / ResultPage — core & ESG overrides
export function useCriteriaOverrides(isPost: boolean): OverrideMap | null {
  const { preMap, postMap } = useContext(CriteriaContext);
  return isPost ? postMap : preMap;
}

// Hook for Evalform / ResultPage — function module overrides (Pre/Post track-specific)
export function useFunctionOverrides(isPost: boolean): FunctionOverrideMap | null {
  const { funcMapPre, funcMapPost } = useContext(CriteriaContext);
  return isPost ? funcMapPost : funcMapPre;
}

// Hook for AdminCriteriaEditor — call after saving to sync immediately
export function useCriteriaReload(): () => Promise<void> {
  return useContext(CriteriaContext).reload;
}
