// hl-ui/src/useAuth.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  COGNITO_DOMAIN,
  COGNITO_CLIENT_ID,
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
    let cancelled = false;

    (async () => {
      let token = null;

      try {
        const { pathname, search } = window.location;
        const callbackPath = new URL(COGNITO_REDIRECT_URI).pathname;
        const params = new URLSearchParams(search);
        const code = params.get("code");
        const error = params.get("error");

        console.log("[Auth] pathname:", pathname);
        console.log("[Auth] callbackPath:", callbackPath);
        console.log("[Auth] search:", search);

        // 1) Handle Cognito callback with code
        if (pathname.startsWith(callbackPath)) {
          console.log("[Auth] On callback path");

          if (error) {
            console.error(
              "[Auth] Cognito error:",
              error,
              params.get("error_description")
            );
          } else if (code) {
            console.log("[Auth] Found code:", code);

            try {
              const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
              console.log("[Auth] code_verifier:", codeVerifier);

              if (!codeVerifier) {
                throw new Error("Missing PKCE code_verifier in sessionStorage");
              }

              const body = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: COGNITO_CLIENT_ID,
                code,
                redirect_uri: COGNITO_REDIRECT_URI,
                code_verifier: codeVerifier,
              });

              const resp = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
              });

              if (!resp.ok) {
                const text = await resp.text();
                console.error(
                  "[Auth] Token exchange failed:",
                  resp.status,
                  text
                );
                throw new Error("Token exchange failed");
              }

              const tokens = await resp.json();
              console.log("[Auth] token response:", tokens);

              const { id_token, access_token, refresh_token } = tokens;

              if (id_token) {
                localStorage.setItem("id_token", id_token);
                token = id_token;
              }
              if (access_token) {
                localStorage.setItem("access_token", access_token);
              }
              if (refresh_token) {
                localStorage.setItem("refresh_token", refresh_token);
              }

              // Clean URL & send user to staff area (change if your route differs)
              window.history.replaceState(null, "", "/staff");
            } catch (err) {
              console.error("[Auth] Error handling callback:", err);
            }
          }
        }

        // 2) If we didn't just get a fresh token, check localStorage
        if (!token) {
          token = localStorage.getItem("id_token");
        }

        if (!cancelled) {
          if (token) {
            setIsAuthenticated(true);
            setIdToken(token);
          } else {
            setIsAuthenticated(false);
            setIdToken(null);
          }
        }
      } catch (e) {
        console.error("[Auth] initAuth error:", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          console.log("[Auth] loading -> false");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Login (code + PKCE) -----
  function login() {
    buildLoginUrl().then((url) => {
      console.log("[Auth] redirecting to:", url);
      window.location.assign(url);
    });
  }

  // ----- Logout -----
  function logout() {
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setIsAuthenticated(false);
    setIdToken(null);

    const url = buildLogoutUrl();
    console.log("[Auth] logging out to:", url);
    window.location.assign(url);
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
