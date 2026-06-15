import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import EvalForm from "./pages/Evalform";
import ResultPage from "./pages/Resultpage";

export default function App() {
  const [page, setPage] = useState("landing");
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);

  if (page === "landing") {
    return (
      <LandingPage
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
        onBack={() => setPage("landing")}
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
        onBackToEval={() => setPage("eval")}
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