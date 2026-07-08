import { useState, useEffect } from "react";
import { authFetch } from "./utils/api";
import { getCriteria } from "./constants";
import { useCriteriaReload } from "./context/CriteriaContext";
import PortalPage         from "./pages/PortalPage";
import LandingPage        from "./pages/LandingPage";
import EvalForm           from "./pages/Evalform";
import ResultPage         from "./pages/Resultpage";
import ProfilePage        from "./pages/ProfilePage";
import HistoryPage        from "./pages/HistoryPage";
import AdminPage          from "./pages/AdminPage";
import UploadHistoryPage  from "./pages/UploadHistoryPage";
import SupervisorPage     from "./pages/SupervisorPage";
import LoginPage          from "./pages/LoginPage";

// ── Loader: fetch a saved evaluation and render ResultPage read-only ──
function EvalHistoryLoader({ evalId, user, profilePic, onBack, onViewHistoryEval }) {
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    authFetch(`/api/evaluations/${evalId}`)
      .then(r => r.json())
      .then(d => {
        const CRITERIA = getCriteria(d.evalType);

        // Scores are stored as 0-5 normalized (rawLv/maxLv*5) at submit time.
        // Reverse to raw level scale so sectionSummary formula (lv/maxLv)*weight works correctly.
        const maxLvMap = {};
        CRITERIA.forEach(sec => sec.items.forEach(item => {
          if (!item.divider) maxLvMap[item.no] = item.levelValues ? Math.max(...item.levelValues) : 5;
        }));

        const scoresObj  = {};
        const weightsObj = {};
        const notesObj   = {};

        // 1. Seed from raw_scores (complete snapshot saved at submit time)
        const raw = d.rawScores ?? {};
        const hasRaw = Object.keys(raw).length > 0;
        Object.entries(raw).forEach(([code, entry]) => {
          if (entry.score != null) {
            const maxLv = maxLvMap[code] ?? 5;
            scoresObj[code] = (Number(entry.score) / 5) * maxLv;
          }
          if (entry.weight != null) weightsObj[code] = Number(entry.weight);
          notesObj[code] = entry.note || "";
        });

        // 2. Overlay with DB evaluation_scores (also stored as 0-5 normalized)
        (d.scores ?? []).forEach(s => {
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
      .catch(() => setLoaded("error"));
  }, [evalId]);

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
    <ResultPage
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

export default function App() {
  // The JWT now lives in an httpOnly cookie the frontend can't read or
  // decode itself — session state comes from asking the backend who we are.
  const [user,           setUser]           = useState(null);
  const [authChecked,    setAuthChecked]    = useState(false);
  const [page,           setPage]           = useState("landing");
  const [formData,       setFormData]       = useState({});
  const [result,         setResult]         = useState(null);
  const [evalSavedState, setEvalSavedState] = useState(null);
  const [profilePic,     setProfilePic]     = useState(null);
  const [evalDetailId,   setEvalDetailId]   = useState(null);
  const [prevPage,       setPrevPage]       = useState(null);
  const [adminSessionId, setAdminSessionId] = useState(null);
  const [adminInitialTab, setAdminInitialTab] = useState(null);
  const [landingInitialTab, setLandingInitialTab] = useState("active");
  const reloadCriteria = useCriteriaReload();

  // Restore the session on load — the JWT lives in an httpOnly cookie we
  // can't read, so ask the backend who (if anyone) it belongs to.
  useEffect(() => {
    authFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setUser(d.user);
        setPage("portal");
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) { setProfilePic(null); return; }
    authFetch("/api/employees/me")
      .then((r) => r.json())
      .then((d) => setProfilePic(d.profilePicture || null))
      .catch(() => {});
  }, [user?.empId]);

  // Criteria overrides need a live session — fetch once we actually know
  // the user is logged in, instead of the provider guessing from a
  // (no-longer-readable) localStorage token.
  useEffect(() => {
    if (user) reloadCriteria();
  }, [user?.empId, reloadCriteria]);

  // ── Auth handlers ─────────────────────────────────────────────
  const handleLogin = (userData) => {
    setUser(userData);
    setPage("portal");
  };

  const handleLogout = () => {
    authFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setFormData({});
    setResult(null);
    setEvalSavedState(null);
    setPage("portal");
  };

  // ── Waiting on the initial session check ─────────────────────
  if (!authChecked) {
    return null;
  }

  // ── Not logged in: show auth pages ───────────────────────────
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // ── Logged in: show main app pages ───────────────────────────
  if (page === "portal") {
    return (
      <PortalPage
        authUser={user}
        profilePic={profilePic}
        onLogout={handleLogout}
        onProfile={() => setPage("profile")}
        onHistory={() => setPage("history")}
        onEvaluate={(tab) => { setLandingInitialTab(tab || "active"); setPage("landing"); }}
        onAdmin={() => { setAdminSessionId(null); setAdminInitialTab(null); setPage("admin"); }}
        onSupervisor={() => setPage("supervisor")}
      />
    );
  }

  if (page === "admin") {
    return (
      <AdminPage
        authUser={user}
        onBack={() => setPage("portal")}
        initialSessionId={adminSessionId}
        initialTab={adminInitialTab}
        onViewEvaluation={(id, sessionId) => {
          setAdminSessionId(sessionId);
          setPrevPage("admin");
          setEvalDetailId(id);
          setPage("evalDetail");
        }}
        onViewUploadHistory={() => {
          setAdminInitialTab("tasks");
          setPage("uploadHistory");
        }}
      />
    );
  }

  if (page === "uploadHistory") {
    return (
      <UploadHistoryPage
        onBack={() => setPage("admin")}
      />
    );
  }

  if (page === "supervisor") {
    return (
      <SupervisorPage
        authUser={user}
        onBack={() => setPage("portal")}
        onViewEvaluation={(id) => {
          setPrevPage("supervisor");
          setEvalDetailId(id);
          setPage("evalDetail");
        }}
      />
    );
  }

  if (page === "evalDetail") {
    return (
      <EvalHistoryLoader
        evalId={evalDetailId}
        user={user}
        profilePic={profilePic}
        onBack={() => { setPage(prevPage ?? "history"); setPrevPage(null); }}
        onViewHistoryEval={(id) => setEvalDetailId(id)}
      />
    );
  }

  if (page === "history") {
    return (
      <HistoryPage
        authUser={user}
        onBack={() => setPage("portal")}
        onViewDetail={(id) => { setPrevPage("history"); setEvalDetailId(id); setPage("evalDetail"); }}
      />
    );
  }

  if (page === "profile") {
    return (
      <ProfilePage
        authUser={user}
        onBack={() => setPage("portal")}
        onProfileUpdate={(userData, pic) => {
          setUser(userData);
          if (pic !== undefined) setProfilePic(pic);
        }}
      />
    );
  }

  if (page === "eval") {
    return (
      <EvalForm
        formData={formData}
        savedState={evalSavedState}
        user={user}
        profilePic={profilePic}
        onBack={() => { setEvalSavedState(null); setPage("landing"); }}
        onDone={(res) => {
          // ผู้ที่กำลังส่งผลตอนนี้คือ user ที่ล็อกอินอยู่ — แนบ role ไว้ด้วย
          // เพื่อให้ป้าย "(ผลประเมินล่าสุด)" บนหน้า Result รู้ว่าต้องเทียบ
          // ล่าสุดกับ role ไหน (USER/GCP มีสิทธิ์ประเมินแยกกัน)
          const withRole = { ...res, role: user.role };
          setEvalSavedState(withRole);
          setResult(withRole);
          setPage("result");
        }}
      />
    );
  }

  if (page === "result") {
    return (
      <ResultPage
        formData={formData}
        result={result}
        user={user}
        profilePic={profilePic}
        onBackToEval={() => setPage("eval")}
        onBack={() => {
          setFormData({});
          setResult(null);
          setEvalSavedState(null);
          setPage("portal");
        }}
        onViewHistoryEval={(id) => { setPrevPage("result"); setEvalDetailId(id); setPage("evalDetail"); }}
      />
    );
  }

  return (
    <LandingPage
      authUser={user}
      profilePic={profilePic}
      onSubmit={(data) => { setFormData(data); setPage("eval"); }}
      onLogout={handleLogout}
      onProfile={() => setPage("profile")}
      onHistory={() => setPage("history")}
      onBack={() => setPage("portal")}
      initialTaskTab={landingInitialTab}
    />
  );
}
