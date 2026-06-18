import { useState, useEffect } from "react";
import { authFetch } from "./utils/api";
import PortalPage         from "./pages/PortalPage";
import LandingPage        from "./pages/LandingPage";
import EvalForm           from "./pages/Evalform";
import ResultPage         from "./pages/Resultpage";
import ProfilePage        from "./pages/ProfilePage";
import HistoryPage        from "./pages/HistoryPage";
import AdminPage          from "./pages/AdminPage";
import LoginPage          from "./pages/LoginPage";
import RegisterPage       from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage  from "./pages/ResetPasswordPage";

// ── Loader: fetch a saved evaluation and render ResultPage read-only ──
function EvalHistoryLoader({ evalId, user, profilePic, onBack }) {
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    authFetch(`/api/evaluations/${evalId}`)
      .then(r => r.json())
      .then(d => {
        const scoresObj  = {};
        const weightsObj = {};
        const notesObj   = {};

        // 1. Seed from raw_scores (complete snapshot saved at submit time)
        const raw = d.rawScores ?? {};
        Object.entries(raw).forEach(([code, entry]) => {
          if (entry.score != null) scoresObj[code]  = Number(entry.score);
          if (entry.weight != null) weightsObj[code] = Number(entry.weight);
          notesObj[code] = entry.note || "";
        });

        // 2. Overlay with DB evaluation_scores (authoritative stored values)
        (d.scores ?? []).forEach(s => {
          if (s.score  != null) scoresObj[s.code]  = s.score;
          if (s.weight != null) weightsObj[s.code] = Number(s.weight);
          notesObj[s.code] = s.note || "";
        });

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
            totalScore: Number(d.totalScore),
            grade:      d.grade,
            scores:     scoresObj,
            weights:    weightsObj,
            notes:      notesObj,
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
      readOnly
    />
  );
}

function getStoredUser() {
  try {
    const token = localStorage.getItem("spe_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("spe_token");
      return null;
    }
    if (payload.role === 'BU') payload.role = 'USER';
    return payload;
  } catch {
    return null;
  }
}

export default function App() {
  const [user,           setUser]           = useState(() => getStoredUser());
  const [page,           setPage]           = useState(() => getStoredUser() ? "portal" : "landing");
  const [formData,       setFormData]       = useState({});
  const [result,         setResult]         = useState(null);
  const [evalSavedState, setEvalSavedState] = useState(null);
  const [profilePic,     setProfilePic]     = useState(null);
  const [evalDetailId,   setEvalDetailId]   = useState(null);
  const [prevPage,       setPrevPage]       = useState(null);

  useEffect(() => {
    if (!user) { setProfilePic(null); return; }
    authFetch("/api/employees/me")
      .then((r) => r.json())
      .then((d) => setProfilePic(d.profilePicture || null))
      .catch(() => {});
  }, [user?.empId]);

  // ── Password reset via email link ────────────────────────────
  const resetToken = new URLSearchParams(window.location.search).get("reset");
  if (resetToken) {
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={() => {
          window.history.replaceState({}, "", window.location.pathname);
          setPage("login");
          // Force re-render so the reset param is gone
          setUser(null);
        }}
      />
    );
  }

  // ── Auth handlers ─────────────────────────────────────────────
  const handleLogin = (token, userData) => {
    localStorage.setItem("spe_token", token);
    setUser(userData);
    setPage("portal");
  };

  const handleLogout = () => {
    localStorage.removeItem("spe_token");
    setUser(null);
    setFormData({});
    setResult(null);
    setEvalSavedState(null);
    setPage("portal");
  };

  // ── Not logged in: show auth pages ───────────────────────────
  if (!user) {
    if (page === "register") {
      return (
        <RegisterPage
          onBack={() => setPage("login")}
          onDone={() => setPage("login")}
        />
      );
    }
    if (page === "forgot") {
      return <ForgotPasswordPage onBack={() => setPage("login")} />;
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={() => setPage("register")}
        onForgot={() => setPage("forgot")}
      />
    );
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
        onEvaluate={() => setPage("landing")}
        onAdmin={() => setPage("admin")}
      />
    );
  }

  if (page === "admin") {
    return (
      <AdminPage
        authUser={user}
        onBack={() => setPage("portal")}
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
        onProfileUpdate={(token, userData, pic) => {
          localStorage.setItem("spe_token", token);
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
        onDone={(res) => { setEvalSavedState(res); setResult(res); setPage("result"); }}
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
    />
  );
}
