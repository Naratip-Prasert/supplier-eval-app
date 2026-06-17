import { useState, useEffect } from "react";
import { authFetch } from "./utils/api";
import LandingPage        from "./pages/LandingPage";
import EvalForm           from "./pages/Evalform";
import ResultPage         from "./pages/Resultpage";
import ProfilePage        from "./pages/ProfilePage";
import HistoryPage        from "./pages/HistoryPage";
import LoginPage          from "./pages/LoginPage";
import RegisterPage       from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage  from "./pages/ResetPasswordPage";

function getStoredUser() {
  try {
    const token = localStorage.getItem("spe_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("spe_token");
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export default function App() {
  const [user,           setUser]           = useState(() => getStoredUser());
  const [page,           setPage]           = useState("landing");
  const [formData,       setFormData]       = useState({});
  const [result,         setResult]         = useState(null);
  const [evalSavedState, setEvalSavedState] = useState(null);
  const [profilePic,     setProfilePic]     = useState(null);

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
    setPage("landing");
  };

  const handleLogout = () => {
    localStorage.removeItem("spe_token");
    setUser(null);
    setFormData({});
    setResult(null);
    setEvalSavedState(null);
    setPage("landing");
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
  if (page === "history") {
    return <HistoryPage authUser={user} onBack={() => setPage("landing")} />;
  }

  if (page === "profile") {
    return (
      <ProfilePage
        authUser={user}
        onBack={() => setPage("landing")}
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
          setPage("landing");
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
    />
  );
}
