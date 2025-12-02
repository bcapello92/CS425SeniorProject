// hl-ui/src/auth.jsx

// ----- Cognito config -----
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

// ----- PKCE helpers -----
function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(length = 64) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

// ----- URL builders -----
// NOTE: buildLoginUrl is now async because of PKCE
export async function buildLoginUrl() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // store the verifier for the callback handler
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

export function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: COGNITO_LOGOUT_URI,
  });

  return `${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

// ----- Token helper for API calls -----
export function getIdToken() {
  try {
    const token = localStorage.getItem("id_token");
    return token || null;
  } catch {
    return null;
  }
}
