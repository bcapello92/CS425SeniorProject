// hl-ui/src/useAuth.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { buildLoginUrl, buildLogoutUrl } from "./auth.jsx";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      const token = localStorage.getItem("access_token");
      if (cancelled) return;

      if (token) {
        setIsAuthenticated(true);
        setAccessToken(token);
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
      }
      setLoading(false);
    };

    sync();

    // keep tabs synced
    const onStorage = () => sync();
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);


  async function login(returnTo = "/provider") {
    sessionStorage.setItem("post_login_redirect", returnTo);
    const url = await buildLoginUrl();
    window.location.assign(url);
  }


  function logout() {
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("access_token_expires_at");
    sessionStorage.removeItem("post_login_redirect");

    setIsAuthenticated(false);
    setAccessToken(null);

    const url = buildLogoutUrl();
    window.location.assign(url);
  }

  return (
    <AuthContext.Provider
      value={{ loading, isAuthenticated, accessToken, login, logout }}
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
