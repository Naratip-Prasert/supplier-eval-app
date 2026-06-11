import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import UserForm from "./pages/Userform";   
import EvalForm from "./pages/Evalform";   
import ResultPage from "./pages/Resultpage"; 

export default function App() {
  const [page, setPage] = useState("landing");
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);

  if (page === "landing") {
    return (
      <LandingPage
        onSelect={(role) => {
          setFormData({ role });
          setPage("form");
        }}
      />
    );
  }

  if (page === "form") {
    return (
      <UserForm
        role={formData.role}
        onBack={() => setPage("landing")}
        onSubmit={(data) => {
          setFormData(data);
          setPage("eval");
        }}
      />
    );
  }

  if (page === "eval") {
    return (
      <EvalForm
        formData={formData}
        onBack={() => setPage("form")}
        onDone={(res) => {
          setResult(res);
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
        onBack={() => {
          setFormData({});
          setResult(null);
          setPage("landing");
        }}
      />
    );
  }

  return null;
}