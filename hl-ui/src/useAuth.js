// hl-ui/src/useAuth.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  COGNITO_REDIRECT_URI,
  buildLoginUrl,
  buildLogoutUrl,
} from "./auth.jsx";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [idToken, setIdToken] = useState(null);

  useEffect(() => {
    let token = null;

    // 1) If we're on the callback URL and see an id_token in the hash, capture it
    const hash = window.location.hash || "";
    const currentPath = window.location.pathname;
    const callbackPath = new URL(COGNITO_REDIRECT_URI).pathname;

    if (hash && currentPath === callbackPath) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const idTokenFromHash = params.get("id_token");
      const accessToken = params.get("access_token");

      if (idTokenFromHash) {
        token = idTokenFromHash;
        localStorage.setItem("id_token", token);
        if (accessToken) {
          localStorage.setItem("access_token", accessToken);
        }

        // Clean up URL so the hash disappears and go back to main app
        window.history.replaceState(null, "", "/");
      }
    }

    // 2) If we didn't just get a token from the hash, try localStorage
    if (!token) {
      token = localStorage.getItem("id_token");
    }

    if (token) {
      setIsAuthenticated(true);
      setIdToken(token);
    } else {
      setIsAuthenticated(false);
      setIdToken(null);
    }

    setLoading(false);
  }, []);

  function logout() {
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
    setIdToken(null);

    // Optional: also kick user to Cognito logout endpoint
    window.location.href = buildLogoutUrl();
  }

  function login() {
    window.location.href = buildLoginUrl();
  }

  return (
    <AuthContext.Provider
      value={{ loading, isAuthenticated, idToken, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
