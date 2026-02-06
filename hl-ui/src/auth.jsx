// hl-ui/src/auth.jsx
/*AWS pprebuild code*/
// ----- Cognito config -----
export const COGNITO_DOMAIN =
  import.meta.env.VITE_COGNITO_DOMAIN ||
  "https://us-east-1jrkokshnh.auth.us-east-1.amazoncognito.com";

export const COGNITO_CLIENT_ID =
  import.meta.env.VITE_COGNITO_CLIENT_ID || "21hhbicb04v7vus5dmlpged4bo";

export const COGNITO_REDIRECT_URI =
  import.meta.env.VITE_COGNITO_REDIRECT_URI ||
  "http://localhost:5173/staff/callback";
//built for locol host
export const COGNITO_LOGOUT_URI =
  import.meta.env.VITE_COGNITO_LOGOUT_URI || "http://localhost:5173/";
// Hosted UI token endpoint
const TOKEN_ENDPOINT =
  import.meta.env.VITE_COGNITO_TOKEN_ENDPOINT ||
  `${COGNITO_DOMAIN}/oauth2/token`;

// ----- Token storage keys -----
const LS_ACCESS = "access_token";
const LS_ID = "id_token";
const LS_REFRESH = "refresh_token";
const LS_EXPIRES_AT = "expires_at"; // epoch ms

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

// ----- URL builders -----
// NOTE: async because we generate PKCE code challenge
export async function buildLoginUrl() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // store verifier for callback exchange
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
export async function exchangeCodeForTokens(code) {
  const verifier = sessionStorage.getItem("pkce_code_verifier");
  if (!verifier) throw new Error("Missing PKCE code verifier (sessionStorage)");

  const tokenUrl = `${COGNITO_DOMAIN}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: COGNITO_REDIRECT_URI,
    code_verifier: verifier,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // token endpoint sometimes returns urlencoded-ish errors, keep raw
  }

  if (!resp.ok) {
    throw new Error(data?.error_description || data?.error || text || `HTTP ${resp.status}`);
  }

  // Store tokens
  if (data.access_token) localStorage.setItem("access_token", data.access_token);
  if (data.id_token) localStorage.setItem("id_token", data.id_token);
  if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);


  if (data.expires_in) {
    const expiresAt = Date.now() + Number(data.expires_in) * 1000;
    localStorage.setItem("access_token_expires_at", String(expiresAt));
  }

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

// ----- Token getters -----
// Use ACCESS token for backend Authorization: Bearer ...
export function getAccessToken() {
  try {
    return localStorage.getItem(LS_ACCESS) || null;
  } catch {
    return null;
  }
}

// ID token is useful for UI / showing claims
export function getIdToken() {
  try {
    return localStorage.getItem(LS_ID) || null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  try {
    const access = localStorage.getItem(LS_ACCESS);
    const expiresAt = Number(localStorage.getItem(LS_EXPIRES_AT) || "0");
    return !!access && Date.now() < expiresAt - 10_000; // 10s buffer
  } catch {
    return false;
  }
}

export function logoutLocal() {
  try {
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_EXPIRES_AT);
    sessionStorage.removeItem("pkce_code_verifier");
  } catch {
    // ignore
  }
}

// ----- PKCE callback handler -----
// Call this on /staff/callback page load
export async function handleCognitoCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    throw new Error(`${error}${errorDesc ? `: ${errorDesc}` : ""}`);
  }

  if (!code) {
    // not a callback
    return { ok: false, reason: "no_code" };
  }

  const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
  if (!codeVerifier) {
    throw new Error("Missing PKCE code_verifier in sessionStorage");
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: COGNITO_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(
      `Token exchange failed (${resp.status}): ${data?.error_description || data?.error || text
      }`
    );
  }

  // Persist tokens
  const accessToken = data.access_token || null;
  const idToken = data.id_token || null;
  const refreshToken = data.refresh_token || null;
  const expiresIn = Number(data.expires_in || 3600); // seconds
  const expiresAt = Date.now() + expiresIn * 1000;

  if (!accessToken) {
    throw new Error("No access_token returned from Cognito token endpoint");
  }

  localStorage.setItem(LS_ACCESS, accessToken);
  if (idToken) localStorage.setItem(LS_ID, idToken);
  if (refreshToken) localStorage.setItem(LS_REFRESH, refreshToken);
  localStorage.setItem(LS_EXPIRES_AT, String(expiresAt));

  // Clean URL (remove ?code=...)
  window.history.replaceState({}, document.title, url.pathname);

  return { ok: true };
}