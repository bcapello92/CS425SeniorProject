// hl-ui/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./AppLayout.jsx";
import PatientChatIntake from "./PatientChatIntake.jsx";
import ProviderHome from "./ProviderHome.jsx";
import ProviderTriage from "./ProviderTriage.jsx";
import LoginRedirect from "./LoginRedirect.jsx";
import AuthCallback from "./AuthCallback.jsx";
import ProviderAccount from "./ProviderAccount.jsx"
import { useAuth } from "./useAuth.jsx";
import { useEffect } from "react";

function Protected({ children }) {
  const { loading, isAuthenticated, login } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // send them to Cognito and come back to the current page
      login(window.location.pathname);
    }
  }, [loading, isAuthenticated, login]);

  if (loading) return <div style={{ padding: 16 }}>Checking login…</div>;

  // While redirecting to Cognito, render a simple message
  if (!isAuthenticated) return <div style={{ padding: 16 }}>Redirecting to login…</div>;

  return children;
}

export default function App() {
  return (
    <AppLayout>
      <Routes>
        {/* Public */}
        <Route path="/" element={<PatientChatIntake />} />

        {/* Cognito login jump */}
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/staff/callback" element={<AuthCallback />} />
        {/* Provider */}
        <Route
          path="/provider"
          element={
            <Protected>
              <ProviderHome />
            </Protected>
          }
        />
        <Route
          path="/provider/triage"
          element={
            <Protected>
              <ProviderTriage />
            </Protected>
          }
        />
        <Route
           path="/provider/account"
           element={
               <Protected>
                <ProviderAccount/>
               </Protected>
           }
        />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
