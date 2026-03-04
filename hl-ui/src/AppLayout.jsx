// hl-ui/src/AppLayout.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth.jsx";

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, isAuthenticated, login, logout } = useAuth();
  const isProviderRoute = location.pathname.startsWith("/provider");

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
    <div style={{ minHeight: "100vh", background: "#f6f8fb" }}>
      <header style={header}>
        <div style={left}>
          <button style={linkBtn} onClick={() => navigate("/")}>
            Patient Chat
          </button>

          <button style={linkBtn} onClick={goProvider}>
            Provider
          </button>

          {isProviderRoute ? (
            <button style={homeBtn} onClick={() => navigate("/provider")}>
              Provider Home
            </button>
          ) : null}
        </div>

        <div style={right}>
          {loading ? (
            <span style={status}>Checking login...</span>
          ) : isAuthenticated ? (
            <>
              <span style={status}>Provider signed in</span>
              <button style={dangerBtn} onClick={doLogout}>
                Logout
              </button>
            </>
          ) : (
            <button style={primaryBtn} onClick={() => login("/provider")}>
              Provider Login
            </button>
          )}
        </div>
      </header>

      <main style={{ padding: 16 }}>{children}</main>
    </div>
  );
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "#ffffff",
  borderBottom: "1px solid #e7edf5",
};

const left = { display: "flex", gap: 10, flexWrap: "wrap" };
const right = { display: "flex", gap: 10, alignItems: "center" };

const linkBtn = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #dbe4f0",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const homeBtn = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
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
