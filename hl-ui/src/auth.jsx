// hl-ui/src/auth.jsx

export const COGNITO_DOMAIN =
  import.meta.env.VITE_COGNITO_DOMAIN ||
  "https://us-east-1jrkokshnh.auth.us-east-1.amazoncognito.com";

export const COGNITO_CLIENT_ID =
  import.meta.env.VITE_COGNITO_CLIENT_ID || "21hhbicb04v7vus5dmlpged4bo";

export const COGNITO_REDIRECT_URI =
  import.meta.env.VITE_COGNITO_REDIRECT_URI ||
  "http://localhost:5173/staff/callback";

export const COGNITO_LOGOUT_URI =
  import.meta.env.VITE_COGNITO_LOGOUT_URI || "http://localhost:5173/";

// Your Express proxy base (adjust if needed)
export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:4000";

// ----- PKCE helpers -----
function base64UrlEncodeBytes(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(length = 64) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncodeBytes(array);
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

// NOTE: async because we generate PKCE code challenge
export async function buildLoginUrl() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem("pkce_code_verifier", codeVerifier);

  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: "code",
    scope: "openid email",
    redirect_uri: COGNITO_REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${COGNITO_DOMAIN}/login?${params.toString()}`;
}

// Exchange in EXPRESS (server sets HttpOnly cookies)
export async function exchangeCodeForTokens(code) {
  const verifier = sessionStorage.getItem("pkce_code_verifier");
  if (!verifier) throw new Error("Missing PKCE code verifier (sessionStorage)");

  const resp = await fetch(`${API_BASE}/api/auth/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code, code_verifier: verifier }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }

  //changed to remove local storage.
  sessionStorage.removeItem("pkce_code_verifier");
  return data;
}

export function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: COGNITO_LOGOUT_URI,
  });

  return `${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

// Clear server cookies
export async function logoutServer() {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}