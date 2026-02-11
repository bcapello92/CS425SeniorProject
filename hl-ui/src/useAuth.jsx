// hl-ui/src/useAuth.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { buildLoginUrl, buildLogoutUrl, logoutServer, API_BASE } from "./auth.jsx";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [me, setMe] = useState(null);

  async function refreshMe() {
    try {
        const resp = await fetch(`${API_BASE}/api/me`,{
        method: "GET",
        credentials: "include",
      });

      if (!resp.ok) {
        setIsAuthenticated(false);
        setMe(null);
        return;
      }

      const data = await resp.json().catch(() => ({}));
      setIsAuthenticated(true);
      setMe(data);
    } catch {
      setIsAuthenticated(false);
      setMe(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await refreshMe();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(returnTo = "/provider") {
    sessionStorage.setItem("post_login_redirect", returnTo);
    const url = await buildLoginUrl();
    window.location.assign(url);
  }

  async function logout() {
    sessionStorage.removeItem("post_login_redirect");
    await logoutServer();

    const url = buildLogoutUrl();
    window.location.assign(url);
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        isAuthenticated,
        me,            
        refreshMe,     
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}