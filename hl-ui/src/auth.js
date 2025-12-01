// src/auth.js

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI;
const COGNITO_LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI;

//use token in local storage
const TOKEN_KEY = "cognito_id_token";

export function getIdToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function setIdToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearIdToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Build Cognito Hosted UI login URL (Authorization Code flow)
export function buildLoginUrl() {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: "token", 
    scope: "openid email",
    redirect_uri: COGNITO_REDIRECT_URI,
  });

  return `${COGNITO_DOMAIN}/login?${params.toString()}`;
}

export function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: COGNITO_LOGOUT_URI,
  });

  return `${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

// Parse tokens from hash fragment when Cognito redirects back, e.g.
// http://localhost:5173/#id_token=...&access_token=...
export function parseTokensFromHash() {
  if (!window.location.hash.startsWith("#")) return null;
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);

  const idToken = params.get("id_token");
  const accessToken = params.get("access_token");

  if (idToken) {
    setIdToken(idToken);
    // Clear hash so it doesn’t bother routes
    window.location.hash = "";
    return { idToken, accessToken };
  }
  return null;
}
