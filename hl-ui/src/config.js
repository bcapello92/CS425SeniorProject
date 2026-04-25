function normalizeBaseUrl(value, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (normalized === "/") return "";
  if (normalized === "/api") return "";
  return normalized.replace(/\/$/, "");
}

const browserOrigin =
  typeof window !== "undefined" ? window.location.origin : "";

export const PUBLIC_ORIGIN = normalizeBaseUrl(
  import.meta.env.VITE_PUBLIC_ORIGIN,
  browserOrigin
);

export const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE, "");
export const CHAT_BASE = normalizeBaseUrl(import.meta.env.VITE_CHAT_BASE, "");
export const VOICE_BASE = normalizeBaseUrl(
  import.meta.env.VITE_VOICE_BASE,
  ""
);

export const COGNITO_DOMAIN =
  import.meta.env.VITE_COGNITO_DOMAIN ||
  "https://us-east-1jrkokshnh.auth.us-east-1.amazoncognito.com";

export const COGNITO_CLIENT_ID =
  import.meta.env.VITE_COGNITO_CLIENT_ID || "21hhbicb04v7vus5dmlpged4bo";

export const COGNITO_REDIRECT_URI =
  import.meta.env.VITE_COGNITO_REDIRECT_URI ||
  `${PUBLIC_ORIGIN}/staff/callback`;

export const COGNITO_LOGOUT_URI =
  import.meta.env.VITE_COGNITO_LOGOUT_URI || `${PUBLIC_ORIGIN}/`;
