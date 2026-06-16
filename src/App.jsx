import { useState } from "react";
import LandingPage        from "./pages/LandingPage";
import EvalForm           from "./pages/Evalform";
import ResultPage         from "./pages/Resultpage";
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
  const [user,     setUser]     = useState(() => getStoredUser());
  const [page,     setPage]     = useState("landing");
  const [formData, setFormData] = useState({});
  const [result,   setResult]   = useState(null);

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
  if (page === "eval") {
    return (
      <EvalForm
        formData={formData}
        onBack={() => setPage("landing")}
        onDone={(res) => { setResult(res); setPage("result"); }}
      />
    );
  }

  if (page === "result") {
    return (
      <ResultPage
        formData={formData}
        result={result}
        onBackToEval={() => setPage("eval")}
        onBack={() => {
          setFormData({});
          setResult(null);
          setPage("landing");
        }}
      />
    );
  }

  return (
    <LandingPage
      authUser={user}
      onSubmit={(data) => { setFormData(data); setPage("eval"); }}
      onLogout={handleLogout}
    />
  );
}
