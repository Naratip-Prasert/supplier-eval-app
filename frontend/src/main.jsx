import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CriteriaProvider } from './context/CriteriaContext'
import App from './App.jsx'
import SupplierFeedbackPage from './pages/SupplierFeedbackPage.jsx'

// Suppliers reach this one URL with no login at all (magic-link email,
// cross-eval #3 — database/CROSS_EVALUATION_SPEC.md). Decided here, before
// <App/> and its hooks ever mount, instead of inside App itself — there's
// no router in this app, and an early-return above App's useState calls
// would violate the Rules of Hooks the moment the two paths diverge.
const supplierFeedbackMatch = window.location.pathname.match(/^\/supplier-feedback\/([^/]+)/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {supplierFeedbackMatch ? (
      <SupplierFeedbackPage token={supplierFeedbackMatch[1]} />
    ) : (
      <CriteriaProvider>
        <App />
      </CriteriaProvider>
    )}
  </StrictMode>,
)
