// hl-ui/src/App.jsx
import { useState } from "react";
import ProviderTriage from "./ProviderTriage";
import PatientChatIntake from "./PatientChatIntake";
import { useAuth } from "./useAuth";
import { buildLoginUrl, buildLogoutUrl } from "./auth";

export default function App() {
  const [view, setView] = useState("provider");
  const { loading, isAuthenticated, logout } = useAuth();

  // If not authed and user clicks Provider, send them to Cognito login
  function handleTabClick(nextView) {
    if (nextView === "provider" && !isAuthenticated) {
      const loginUrl = buildLoginUrl();
      window.location.href = loginUrl;
      return;
    }
    setView(nextView);
  }

  const showProvider = isAuthenticated;
  const currentView = showProvider ? view : "patient";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f7fb",
      }}
    >
      <header
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          padding: 12,
          borderBottom: "1px solid #eee",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleTabClick("provider")}
            style={tab(currentView === "provider")}
          >
            Provider Triage
          </button>
          <button
            onClick={() => handleTabClick("patient")}
            style={tab(currentView === "patient")}
          >
            Patient Chat
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading ? (
            <span style={{ fontSize: 12, color: "#666" }}>Checking login…</span>
          ) : isAuthenticated ? (
            <>
              <span style={{ fontSize: 12, color: "#666" }}>Logged in</span>
              <button
                style={tab(false)}
                onClick={() => {
                  logout();
                  window.location.href = buildLogoutUrl();
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              style={tab(false)}
              onClick={() => {
                window.location.href = buildLoginUrl();
              }}
            >
              Login
            </button>
          )}
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          padding: 16,
        }}
      >
        {currentView === "provider" && showProvider && (
          <div style={{ width: "100%", maxWidth: 1200 }}>
            <ProviderTriage />
          </div>
        )}
        {currentView === "patient" && (
          <div style={{ width: "100%", maxWidth: 720 }}>
            <PatientChatIntake />
          </div>
        )}
        {currentView === "provider" && !showProvider && !loading && (
          <div style={{ marginTop: 40, textAlign: "center", color: "#555" }}>
            You must be logged in to view the provider triage board.
          </div>
        )}
      </main>
    </div>
  );
}

function tab(active) {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: active ? "#e7f3ff" : "#fff",
    cursor: "pointer",
    fontSize: 13,
  };
}
