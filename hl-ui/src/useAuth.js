// src/useAuth.js
import { useEffect, useState } from "react";
import { getIdToken, parseTokensFromHash, clearIdToken } from "./auth";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [idToken, setIdTokenState] = useState(null);

  useEffect(() => {
    // 1) Maybe we just came back from Cognito and have tokens in URL hash
    const parsed = parseTokensFromHash();
    if (parsed?.idToken) {
      setIdTokenState(parsed.idToken);
      setLoading(false);
      return;
    }

    // 2) Otherwise, see if we have something stored
    const existing = getIdToken();
    if (existing) {
      setIdTokenState(existing);
    }

    setLoading(false);
  }, []);

  function logout() {
    clearIdToken();
    setIdTokenState(null);
  }

  return {
    loading,
    idToken,
    isAuthenticated: !!idToken,
    logout,
  };
}
