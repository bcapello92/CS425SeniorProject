import { useEffect, useState } from "react";
import { getIdToken, parseTokensFromHash, clearIdToken } from "./auth";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [idToken, setIdTokenState] = useState(null);

  useEffect(() => {
    // 1) See if we just came back from Cognito (hash tokens)
    const parsed = parseTokensFromHash();
    if (parsed?.idToken) {
      setIdTokenState(parsed.idToken);
      setLoading(false);
      return;
    }

    // 2) Otherwise, see if we already have a token stored
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
