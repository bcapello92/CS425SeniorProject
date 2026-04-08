// hl-ui/src/AppLayout.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth.jsx";

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, isAuthenticated, login, logout } = useAuth();
  const isLandingPage = location.pathname === "/";

  function goProvider() {
    if (isAuthenticated) {
      navigate("/provider");
    } else {
      login("/provider");
    }
  }

  function doLogout() {
    logout();
  }

  return (
    <div style={isLandingPage ? landingShell : appShell}>
      <header style={isLandingPage ? landingHeader : header}>
        <div style={left}>
          <button
            style={isLandingPage ? landingLinkBtn : linkBtn}
            onClick={goProvider}
          >
            Provider
          </button>
        </div>

        <div style={right}>
          {isLandingPage ? (
            <button style={landingLinkBtn} onClick={() => navigate("/patient")}>
              Patient Page
            </button>
          ) : loading ? (
            <span style={status}>Checking login…</span>
          ) : isAuthenticated ? (
            <>
              <span style={status}>Provider signed in</span>
              <button style={dangerBtn} onClick={doLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button style={linkBtn} onClick={() => navigate("/patient")}>
                Patient Chat
              </button>
              <button style={primaryBtn} onClick={() => login("/provider")}>
                Provider Login
              </button>
            </>
          )}
        </div>
      </header>

      <main style={isLandingPage ? landingMain : appMain}>{children}</main>
    </div>
  );
}

const appShell = { minHeight: "100vh", background: "#f6f8fb" };

const landingShell = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% 0%, rgba(99, 102, 241, 0.25), transparent 60%), radial-gradient(900px 500px at 80% 10%, rgba(16, 185, 129, 0.18), transparent 60%), #0b1020",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "#ffffff",
  borderBottom: "1px solid #e7edf5",
};

const landingHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  maxWidth: 980,
  margin: "0 auto",
  padding: "24px 18px 0",
};

const left = { display: "flex", gap: 10 };
const right = { display: "flex", gap: 10, alignItems: "center" };

const appMain = { padding: 16 };
const landingMain = { padding: 0 };

const linkBtn = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #dbe4f0",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const landingLinkBtn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(255, 255, 255, 0.06)",
  color: "rgba(255, 255, 255, 0.92)",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: "0.04em",
};

const primaryBtn = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #c7dbff",
  background: "#e7f3ff",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerBtn = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  fontWeight: 700,
  cursor: "pointer",
};

const status = {
  fontSize: 12,
  color: "#64748b",
};
