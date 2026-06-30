// ============================================================
//  context/CriteriaContext.jsx
//  Loads criteria overrides from the DB once on mount.
//  All pages that render the eval form read from this context
//  instead of constants.js directly, so admin changes take effect
//  without a code deploy.
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authFetch } from "../utils/api";
import { buildOverrideMap, buildFunctionOverrideMap } from "../utils/criteriaOverlay";

const CriteriaContext = createContext({
  preMap:  null,
  postMap: null,
  funcMap: null,
  reload:  () => {},
});

export function CriteriaProvider({ children }) {
  const [preMap,  setPreMap]  = useState(null);
  const [postMap, setPostMap] = useState(null);
  const [funcMap, setFuncMap] = useState(null);

  const reload = useCallback(async () => {
    if (!localStorage.getItem('spe_token')) return; // not logged in yet
    try {
      const [preR, postR, funcR] = await Promise.all([
        authFetch('/api/criteria?evalType=pre_eval'),
        authFetch('/api/criteria?evalType=post_eval'),
        authFetch('/api/criteria?evalType=function'),
      ]);
      if (preR.ok)  setPreMap(buildOverrideMap(await preR.json()));
      if (postR.ok) setPostMap(buildOverrideMap(await postR.json()));
      if (funcR.ok) setFuncMap(buildFunctionOverrideMap(await funcR.json()));
    } catch {
      // fail silently — constants.js used as fallback
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <CriteriaContext.Provider value={{ preMap, postMap, funcMap, reload }}>
      {children}
    </CriteriaContext.Provider>
  );
}

// Hook for Evalform / ResultPage — core & ESG overrides
export function useCriteriaOverrides(isPost) {
  const { preMap, postMap } = useContext(CriteriaContext);
  return isPost ? postMap : preMap;
}

// Hook for Evalform / ResultPage — function module overrides
export function useFunctionOverrides() {
  return useContext(CriteriaContext).funcMap;
}

// Hook for AdminCriteriaEditor — call after saving to sync immediately
export function useCriteriaReload() {
  return useContext(CriteriaContext).reload;
}
