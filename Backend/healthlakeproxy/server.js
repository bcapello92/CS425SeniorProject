import "dotenv/config";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { fromIni } from "@aws-sdk/credential-provider-ini";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import cookieParser from "cookie-parser";
import {
  upsertUserAndMembership,
  getUserById,
  updateUserDisplayName,
  disableSelfAccount,
  getMembershipWithPermissions,
  listPendingMembers,
  approveMember,
  disableMember,
  createRole,
  deleteRole,
  setRolePermissions,
  listRoles,
  listPermissions,
  createOrRefreshInvite,
  listMemberInvites,
  logAudit,
    listMyAudit,
   listAuditAll
} from "./rbac_db.js";

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());


//logout
app.post("/api/auth/logout", (req, res) => {
    const secure=process.env.NODE_ENV==="production";

    res.clearCookie("access_token", {
    path: "/",
    sameSite: "lax",
    secure,
  });

  res.clearCookie("refresh_token", {
    path: "/",
    sameSite: "lax",
    secure,
  });
    return res.status(200).json({ok:true});
});
const MODEL_URL = process.env.MODEL_URL || "http://127.0.0.1:8000";
const CHAT_SERVICE_URL=process.env.CHAT_SERVICE_URL || "http://localhost:8002";
const rawImageRetrievalUrl =
  process.env.IMAGE_RETRIEVAL_URL || "http://127.0.0.1:8001";
const IMAGE_RETRIEVAL_URL =
  rawImageRetrievalUrl.replace(/\/$/, "") === CHAT_SERVICE_URL.replace(/\/$/, "")
    ? "http://127.0.0.1:8001"
    : rawImageRetrievalUrl;

if (IMAGE_RETRIEVAL_URL !== rawImageRetrievalUrl) {
  console.warn(
    `[WARN] IMAGE_RETRIEVAL_URL matched CHAT_SERVICE_URL (${rawImageRetrievalUrl}); falling back to ${IMAGE_RETRIEVAL_URL}`
  );
}
async function callModelTriage({ patientId, answers, transcript }) {
  const payload = {
    patientId,
    answers,
    transcript,
    symptoms: transcript
  };

  console.log(`[DEBUG] CallModelTriage: Payload prepared. Sending to ${MODEL_URL}/triage...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 min timeout for CPU inference

    const resp = await fetch(`${MODEL_URL}/triage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log(`[DEBUG] CallModelTriage: Fetch completed. Status: ${resp.status}`);

    const contentType = resp.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await resp.json()
      : { error: await resp.text() };

    if (!resp.ok) {
      const msg = typeof data === "string" ? data : JSON.stringify(data);
      console.error("[MODEL ERROR]", resp.status, msg);
      const err = new Error(`Model error ${resp.status}: ${msg}`);
      err.status = resp.status;
      throw err;
    }

    let color = String(data.color || "").toLowerCase();
    if (!["red", "orange", "yellow"].includes(color)) {
      color = "yellow"; // fallback
    }

    const rationale = data.rationale || "Model did not provide rationale.";
    const confidence =
      typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? data.confidence
        : null;
    const final_confidence =
      typeof data.final_confidence === "number" && Number.isFinite(data.final_confidence)
        ? data.final_confidence
        : null;
    const model_color =
      typeof data.model_color === "string" && data.model_color.trim()
        ? String(data.model_color).toLowerCase()
        : null;
    const used_fallback = data.used_fallback === true;
    const label_probs =
      data.label_probs && typeof data.label_probs === "object"
        ? data.label_probs
        : null;
    return {
      color,
      rationale,
      confidence,
      final_confidence,
      model_color,
      used_fallback,
      label_probs,
    };

  } catch (err) {
    console.error(`[DEBUG] CallModelTriage FAILED: ${err.message}`);
    throw err;
  }
}

function extractServiceError(data, fallback) {
  if (typeof data === "string" && data.trim()) return data;
  if (data?.error) return data.error;
  if (data?.detail) {
    if (typeof data.detail === "string") return data.detail;
    try {
      return JSON.stringify(data.detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

app.post("/api/patient-chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages[] is required" });
    }

    const resp = await fetch(`${CHAT_SERVICE_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: data?.detail || data?.error || "Chat service failed" });
    }

    res.json(data); // { reply }
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});
// ---------------------------------------------------------
// COGNITO JWT AUTH (for provider routes) aws calls not original code
// ---------------------------------------------------------
const COGNITO_REGION =
  process.env.COGNITO_REGION || process.env.AWS_REGION || "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const COGNITO_ISSUER =
  COGNITO_USER_POOL_ID &&
  `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;

const jwks =
  COGNITO_ISSUER &&
  jwksClient({
    jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,
  });

function getKey(header, callback) {
  if (!jwks) return callback(new Error("JWKS client not configured"));
  jwks.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) {
      return reject(new Error("Cognito env vars not configured"));
    }

    jwt.verify(
      token,
      getKey,
      {
        issuer: COGNITO_ISSUER,
      },
      (err, decoded) => {
        if (err) return reject(err);

        // Validate access token claims
        if (decoded.token_use !== "access") {
          return reject(new Error("Invalid token_use: expected 'access'"));
        }
        if (decoded.client_id !== COGNITO_CLIENT_ID) {
          return reject(new Error("Invalid client_id claim"));
        }

        resolve(decoded);
      }
    );
  });
}
//AWS ccode end
app.post("/api/auth/exchange", async (req, res) => {
    try {
        const { code, code_verifier } = req.body || {};
        if (!code || !code_verifier) {
            return res.status(400).json({ error: "code and code_verifier required" });
        }

        const domainRaw = (process.env.COGNITO_DOMAIN || "").trim();
        if (!domainRaw) {
            return res.status(500).json({ error: "Missing COGNITO_DOMAIN env var" });
        }

        // Ensure it has https:// and no trailing slash
        const domain = domainRaw.replace(/\/$/, "");
        if (!/^https?:\/\//i.test(domain)) {
            return res
                .status(500)
                .json({ error: "COGNITO_DOMAIN must include https:// (full URL)" });
        }

        const clientId = (process.env.COGNITO_CLIENT_ID || "").trim();
        const redirectUri = (process.env.COGNITO_REDIRECT_URI || "").trim();
        if (!clientId || !redirectUri) {
            return res.status(500).json({
                error: "Missing COGNITO_CLIENT_ID or COGNITO_REDIRECT_URI env var",
            });
        }

        const tokenUrl = `${domain}/oauth2/token`;

        const body = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier,
        });

        const resp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });

        const text = await resp.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch { }

        if (!resp.ok) {
            return res
                .status(resp.status)
                .json({ error: data?.error_description || data?.error || text });
        }

        const secure = process.env.NODE_ENV === "production";
        res.cookie("access_token", data.access_token, {
            httpOnly: true,
            secure,
            sameSite: "lax",
            path: "/",
            maxAge: (data.expires_in || 3600) * 1000,
        });

        if (data.refresh_token) {
            res.cookie("refresh_token", data.refresh_token, {
                httpOnly: true,
                secure,
                sameSite: "lax",
                path: "/",
            });
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});
// Express middleware to require Cognito login
async function requireAuth(req, res, next) {
  try {
    let token = null;

    const auth = req.headers.authorization || "";
    const [, bearer] = auth.split(" ");
    if (bearer) token = bearer;

    // fallback: cookie
    if (!token && req.cookies?.access_token) token = req.cookies.access_token;

    console.log("[AUTH DEBUG]", {
      path: req.path,
      method: req.method,
      hasAuthorizationHeader: Boolean(bearer),
      hasAccessTokenCookie: Boolean(req.cookies?.access_token),
      hasRefreshTokenCookie: Boolean(req.cookies?.refresh_token),
      cookieKeys: Object.keys(req.cookies || {}),
      origin: req.headers.origin || null,
    });

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or missing token" });
  }
}

app.get("/api/me", requireAuth, (req, res) => {
  try {
    const sub = req.user?.sub;
    const email = req.user?.email || null;

  const { membership } = upsertUserAndMembership({ cognito_sub: sub, email });
  const loaded = getMembershipWithPermissions(membership.id);
  const user = getUserById(membership.user_id);

  res.json({
    ok: true,
    sub,
    email,
    displayName: user?.display_name || null,
    status: loaded.membership.status,
    roles: loaded.roles,
    permissions: loaded.permissions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function requireActiveMembership(req, res, next) {
  try {
    const sub = req.user?.sub;
    const email = req.user?.email || null;

    const { user, membership } = upsertUserAndMembership({ cognito_sub: sub, email });
    req.userId = user.id;
    const loaded = getMembershipWithPermissions(membership.id);

    req.membership = loaded.membership;
    req.roles = loaded.roles;
    req.permissions = new Set(loaded.permissions);

    if (req.membership.status !== "active") {
      return res.status(403).json({ error: `Account ${req.membership.status}.` });
    }

    next();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function requirePermission(key) {
  return (req, res, next) => {
    if (!req.permissions?.has(key)) {
      return res.status(403).json({ error: `Missing permission: ${key}` });
    }
    next();
  };
}

function parseJsonOrNull(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTriageFlags(flags) {
  const base = flags && typeof flags === "object" ? flags : {};
  const bulk = base.bulk && typeof base.bulk === "object" ? base.bulk : {};
  return { ...base, ...bulk };
}

function readTriageFlagsFromObservation(obs) {
  const flagsExt = (obs?.extension || []).find(
    (e) => e.url === "http://example.org/triage-flags"
  );
  return normalizeTriageFlags(parseJsonOrNull(flagsExt?.valueString) || {});
}

function findObservationNote(obs, pattern) {
  return (obs?.note || [])
    .map((entry) => entry?.text || "")
    .find((text) => pattern.test(text));
}

function readObservationExtensionJson(obs, url) {
  const entry = (obs?.extension || []).find((ext) => ext.url === url);
  return parseJsonOrNull(entry?.valueString);
}

function readTranscriptFromObservation(obs) {
  const transcriptNote = findObservationNote(obs, /^transcript\s*:/i);
  if (!transcriptNote) return null;
  return transcriptNote.replace(/^transcript\s*:\s*/i, "").trim() || null;
}

function readModelAccuracyFromObservation(obs) {
  const metrics =
    readObservationExtensionJson(obs, "http://example.org/triage-model-metrics") ||
    readObservationExtensionJson(obs, "http://example.org/model-metrics");

  if (metrics && typeof metrics === "object") {
    const accuracy =
      metrics.finalConfidence ??
      metrics.modelAccuracy ??
      metrics.accuracy ??
      metrics.confidence ??
      null;
    if (accuracy !== null && accuracy !== undefined && accuracy !== "") {
      return accuracy;
    }
  }

  const note = findObservationNote(obs, /^model\s*accuracy\s*:/i);
  if (!note) return null;
  return note.replace(/^model\s*accuracy\s*:\s*/i, "").trim() || null;
}

function readOverrideFromObservation(obs) {
  return (
    readObservationExtensionJson(obs, "http://example.org/triage-override") ||
    null
  );
}

app.get("/api/me", requireAuth, requireActiveMembership, (req, res) => {
    const user = getUserById(req.userId);
    res.json({
        ok: true,
        email: req.user?.email || null,
        displayName: user?.display_name || null,
        sub: req.user?.sub || null,
        status: req.membership.status,
        roles: req.roles,
        permissions: Array.from(req.permissions || []),
    });
});

app.get("/api/account/profile", requireAuth, requireActiveMembership, (req, res) => {
  const user = getUserById(req.userId);
  res.json({
    ok: true,
    email: user?.email || req.user?.email || null,
    displayName: user?.display_name || null,
    sub: req.user?.sub || null,
    status: req.membership?.status || null,
  });
});

app.patch("/api/account/profile", requireAuth, requireActiveMembership, (req, res) => {
  try {
    const displayName = req.body?.displayName;
    if (displayName != null && String(displayName).trim().length > 80) {
      return res.status(400).json({ error: "displayName must be 80 characters or fewer" });
    }

    const user = updateUserDisplayName({
      user_id: req.userId,
      display_name: displayName,
    });

    logAudit({
      actor_membership_id: req.membership.id,
      actor_user_id: req.userId,
      action: "account.profile.update",
      resource_type: "user",
      resource_id: String(req.userId),
      details: { displayName: user?.display_name || null },
    });

    res.json({
      ok: true,
      email: user?.email || req.user?.email || null,
      displayName: user?.display_name || null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

async function deleteCognitoUserBySub(sub) {
  if (!sub) return { deleted: false, reason: "missing_sub" };
  if (!COGNITO_USER_POOL_ID) return { deleted: false, reason: "missing_user_pool" };

  const client = await getCognitoAdminClient();
  const escapedSub = String(sub).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const existing = await client.send(
    new cognitoSdk.ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: `sub = "${escapedSub}"`,
      Limit: 1,
    })
  );

  const username = existing?.Users?.[0]?.Username;
  if (!username) return { deleted: false, reason: "not_found" };

  await client.send(
    new cognitoSdk.AdminDeleteUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
    })
  );

  return { deleted: true, username };
}

app.delete("/api/account", requireAuth, requireActiveMembership, async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "DELETE") {
      return res.status(400).json({ error: "confirm must be DELETE" });
    }

    let cognitoResult = null;
    try {
      cognitoResult = await deleteCognitoUserBySub(req.user?.sub);
    } catch (cognitoError) {
      cognitoResult = {
        deleted: false,
        reason: cognitoError?.message || "cognito_delete_failed",
      };
    }

    disableSelfAccount({ user_id: req.userId });

    logAudit({
      actor_membership_id: req.membership.id,
      actor_user_id: req.userId,
      action: "account.delete",
      resource_type: "user",
      resource_id: String(req.userId),
      details: { cognito: cognitoResult },
    });

    const secure = process.env.NODE_ENV === "production";
    res.clearCookie("access_token", { path: "/", sameSite: "lax", secure });
    res.clearCookie("refresh_token", { path: "/", sameSite: "lax", secure });

    res.json({
      ok: true,
      deleted: true,
      cognito: cognitoResult,
      warning: cognitoResult?.deleted === false ? "Local account disabled, Cognito cleanup did not complete." : null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/provider/home", requireAuth, requireActiveMembership, async (req, res) => {
  try {
    const permissions = Array.from(req.permissions || []);
    const canReadTriage = req.permissions?.has("triage.read");

    const auditRows = canReadTriage
      ? listAuditAll({ limit: 200 })
          .filter((r) => /^(triage|member)\./.test(String(r.action || "")))
          .slice(0, 25)
      : listMyAudit({
          actor_membership_id: req.membership.id,
          limit: 10,
        });

    const recentAudit = auditRows.map((r) => ({
      ...r,
      actorEmail:
        r.email ||
        r.cognito_sub ||
        req.user?.email ||
        (r.actor_user_id ? `user#${r.actor_user_id}` : null),
      details: parseJsonOrNull(r.details_json),
    }));

    let triage = null;
    if (canReadTriage) {
      const sinceIso = new Date(Date.now() - 24 * 3600e3).toISOString();
      const bundle = await signedFetch({
        path: "/Observation",
        query: `_count=100&_sort=-_lastUpdated&_lastUpdated=ge${encodeURIComponent(
          sinceIso
        )}`,
      });

      const entries = (bundle.entry || [])
        .map((e) => e.resource)
        .filter((r) => r?.resourceType === "Observation");

      const counts = { red: 0, orange: 0, yellow: 0 };
      for (const o of entries) {
        const text = (o.note || []).map((n) => n?.text || "").join(" ");
        const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(text);
        const color = String(m?.[2] || "").toLowerCase();
        if (!["red", "orange", "yellow"].includes(color)) continue;

        const flags = readTriageFlagsFromObservation(o);
        if (flags.contacted && flags.scheduled) continue;

        counts[color] += 1;
      }

      triage = {
        since: sinceIso,
        counts,
        openTotal: counts.red + counts.orange + counts.yellow,
      };
    }

    res.json({
      ok: true,
      provider: {
        email: req.user?.email || null,
        status: req.membership?.status || null,
        roles: req.roles || [],
        permissions,
      },
      summary: {
        recentAuditCount: recentAudit.length,
        lastAuditAt: recentAudit[0]?.at || null,
        triage,
      },
      recentAudit,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("/api/audit/my", requireAuth, requireActiveMembership, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const rows = listMyAudit({ actor_membership_id: req.membership.id, limit });
    res.json(rows.map(r => ({
        ...r, details: parseJsonOrNull(r.details_json)
    })));

});
app.get("/api/admin/audit", requireAuth, requireActiveMembership, requirePermission("members.manage"), (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const rows = listAuditAll({ limit });
    res.json(rows.map(r => ({ ...r, details: parseJsonOrNull(r.details_json) })));
});
/*AWS healthlake code start*/
// ---------------------------------------------------------
// HEALTHLAKE SIGNED CLIENT
// ---------------------------------------------------------


const REGION = (process.env.REGION || process.env.AWS_REGION || "").trim();
const DATASTORE_ID = (process.env.DATASTORE_ID || "").trim();
if (!REGION || !DATASTORE_ID) {
  console.error("Missing REGION or DATASTORE_ID in env");
  process.exit(1);
}
const BASE_HOST = `healthlake.${REGION}.amazonaws.com`;
const BASE_URL = `https://${BASE_HOST}/datastore/${DATASTORE_ID}/r4`;

const providerOptions = {};
if (process.env.AWS_PROFILE) {
  providerOptions.profile = process.env.AWS_PROFILE;
}
const credentials = process.env.AWS_PROFILE
  ? fromIni({ profile: process.env.AWS_PROFILE })
  : fromNodeProviderChain(providerOptions);

async function logResolvedAwsCredentials() {
  const resolved = await credentials();
  console.log("[AWS DEBUG] resolved credentials", {
    accessKeyPrefix: resolved?.accessKeyId?.slice(0, 8) || null,
    hasSessionToken: Boolean(resolved?.sessionToken),
    expiration:
      resolved?.expiration instanceof Date
        ? resolved.expiration.toISOString()
        : resolved?.expiration || null,
    profile: process.env.AWS_PROFILE || null,
    region: process.env.AWS_REGION || process.env.REGION || null,
  });
  return resolved;
}
let cognitoSdk = null;
let cognitoAdminClient = null;

async function getCognitoAdminClient() {
  if (cognitoAdminClient) return cognitoAdminClient;

  if (!cognitoSdk) {
    try {
      cognitoSdk = await import("@aws-sdk/client-cognito-identity-provider");
    } catch {
      throw new Error(
        "Missing dependency @aws-sdk/client-cognito-identity-provider. Run npm install in Backend/healthlakeproxy."
      );
    }
  }

  cognitoAdminClient = new cognitoSdk.CognitoIdentityProviderClient({
    region: COGNITO_REGION,
    credentials,
  });
  return cognitoAdminClient;
}

async function sendCognitoInvite({ email, suggestedRole }) {
  if (!COGNITO_USER_POOL_ID) {
    throw new Error("COGNITO_USER_POOL_ID is not configured");
  }

  const emailNormalized = String(email || "").trim().toLowerCase();
  if (!emailNormalized) throw new Error("email is required");

  const client = await getCognitoAdminClient();
  const escapedEmail = emailNormalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // When pool is configured with email alias, username must be a separate non-email value.
  let username = null;
  const existing = await client.send(
    new cognitoSdk.ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: `email = "${escapedEmail}"`,
      Limit: 1,
    })
  );

  if (Array.isArray(existing?.Users) && existing.Users.length > 0) {
    username = existing.Users[0]?.Username || null;
  }

  const isExisting = !!username;
  if (!username) {
    const nonce = Math.random().toString(36).slice(2, 8);
    username = `inv_${Date.now()}_${nonce}`;
  }

  let inviteResponse = null;
  inviteResponse = await client.send(
    new cognitoSdk.AdminCreateUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
      UserAttributes: [{ Name: "email", Value: emailNormalized }],
      DesiredDeliveryMediums: ["EMAIL"],
      MessageAction: isExisting ? "RESEND" : undefined,
    })
  );

  const groupMap = {
    staff: process.env.COGNITO_GROUP_STAFF || "staff",
    medical: process.env.COGNITO_GROUP_MEDICAL || "medical",
    admin: process.env.COGNITO_GROUP_ADMIN || "admin",
  };
  const groupName = groupMap[suggestedRole] || groupMap.staff;
  if (groupName) {
    await client.send(
      new cognitoSdk.AdminAddUserToGroupCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: username,
        GroupName: groupName,
      })
    );
  }

  return {
    username,
    group: groupName,
    email: emailNormalized,
    delivery:
      inviteResponse?.CodeDeliveryDetails || inviteResponse?.User?.UserStatus || null,
    resent: isExisting,
  };
}

const signer = new SignatureV4({
  service: "healthlake",
  region: REGION,
  sha256: Sha256,
  credentials,
});

console.log("[INIT] HealthLake Proxy starting with:", {
  REGION,
  DATASTORE_ID,
  HAS_ACCESS_KEY: !!process.env.AWS_ACCESS_KEY_ID,
  HAS_PROFILE: !!process.env.AWS_PROFILE
});

logResolvedAwsCredentials().catch((err) => {
  console.error("[AWS DEBUG] failed to resolve credentials", err);
});

async function signedFetch({ method = "GET", path = "", query = "", body }) {
  const queryParams = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;

  const resolved = await logResolvedAwsCredentials();
  console.log("[AWS DEBUG] signing request", {
    method,
    path,
    query,
    accessKeyPrefix: resolved?.accessKeyId?.slice(0, 8) || null,
    hasSessionToken: Boolean(resolved?.sessionToken),
  });

  const req = new HttpRequest({
    method,
    protocol: "https:",
    hostname: BASE_HOST,
    path: `/datastore/${DATASTORE_ID}/r4${path}`,
    query: queryParams,
    headers: {
      host: BASE_HOST,
      "content-type": "application/fhir+json",
      "accept": "application/fhir+json"
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const signed = await signer.sign(req);

  const fetchUrl = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
  const resp = await fetch(fetchUrl, {
    method,
    headers: signed.headers,
    body: req.body,
  });

  const text = await resp.text();
  const isJson = (resp.headers.get("content-type") || "").includes("json");
  const data = isJson ? (text ? JSON.parse(text) : {}) : text;

  if (!resp.ok) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    const isPatient = path.startsWith("/Patient/");

    if (isPatient) {
      console.warn(
        "[HL WARN] Patient request failed",
        resp.status,
        method,
        fetchUrl,
        msg
      );
    } else {
      console.error("[HL ERROR]", {
        status: resp.status,
        method,
        url: fetchUrl,
        response: msg,
        authHeader: signed.headers["authorization"] ? "PRESENT" : "MISSING"
      });
    }

    const err = new Error(`HealthLake error ${resp.status}: ${msg}`);
    err.status = resp.status;
    throw err;
  }

  return data;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "unknown",
    region: REGION,
  });
});

app.get("/diag/hl-ping", async (req, res) => {
  try {
    const data = await signedFetch({ path: "/Patient", query: "_count=1" });
    res.json({ ok: true, sample: data.entry?.[0]?.resource?.id || null });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});


app.get("/api/patients", async (req, res) => {
  try {
    const count = Math.min(100, Math.max(1, Number(req.query.count || 20)));
    const data = await signedFetch({
      path: "/Patient",
      query: `_count=${count}`,
    });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("/api/observations", async (req, res) => {
  try {
    const patientId = req.query.patientId;
    if (!patientId)
      return res.status(400).json({ error: "patientId is required" });
    const count = Math.min(100, Math.max(1, Number(req.query.count || 25)));
    const query = `_count=${count}&subject=Patient%2F${encodeURIComponent(
      patientId
    )}&_sort=-date`;
    const data = await signedFetch({ path: "/Observation", query });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
/* AWS healthlake connection code end*/


// ---------------------------------------------------------
// PROVIDER TRIAGE BOARD (PROTECTED) Brendan code
// ---------------------------------------------------------
// Fetch recent Observations, group by triage color from "Triage: red|orange|green"
app.get("/api/triage-cases", requireAuth,requireActiveMembership, requirePermission("triage.read"), async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.sinceHours || 24)));
    const sinceIso = new Date(Date.now() - hours * 3600e3).toISOString();
    const bundle = await signedFetch({
      path: "/Observation",
      query: `_count=100&_sort=-_lastUpdated&_lastUpdated=ge${encodeURIComponent(
        sinceIso
      )}`,
    });

    const entries = (bundle.entry || [])
      .map((e) => e.resource)
      .filter((r) => r?.resourceType === "Observation");

    console.log(`[BOARD] Found ${entries.length} observations since ${sinceIso}`);

    const groups = { red: [], orange: [], yellow: [] };

    for (const o of entries) {
      const text = (o.note || [])
        .map((n) => n?.text || "")
        .join(" ")
        .toLowerCase();
      const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(text);
      const color = m?.[2]?.toLowerCase();

      if (!color) {
        console.log(`[BOARD] Skipping obs ${o.id}: no triage color found in notes. Notes: "${text}"`);
        continue;
      }

      //read triage-flags extension ----
      const flags = readTriageFlagsFromObservation(o);

      // If both contacted & scheduled are true, SKIP this case entirely
      if (flags.contacted && flags.scheduled) {
        continue;
      }


      const pid = o.subject?.reference?.replace(/^Patient\//, "") || "unknown";
      const name = o.subject?.display || `Patient ${pid}`;

      groups[color].push({
        riskId: o.id,
        patientId: pid,
        patientName: name,
        date: o.effectiveDateTime || o.issued || o.meta?.lastUpdated,
        color,
        rationale: text || "",
      });
    }

    res.json({
      since: sinceIso,
      counts: {
        red: groups.red.length,
        orange: groups.orange.length,
        yellow: groups.yellow.length,
      },
      groups,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});


// ---------------------------------------------------------
// PATIENT INTAKE -> MODEL -> HEALTHLAKE (UNAUTH / PUBLIC) plug and play code for the most part
// ---------------------------------------------------------
app.post("/api/intake", async (req, res) => {
  try {
    const { patientId, answers = [], transcript = "" } = req.body || {};
    console.log(`[INTAKE] Received request for patientId: ${patientId}`);

    if (!patientId || typeof patientId !== "string") {
      return res.status(400).json({ error: "patientId is required" });
    }

    // 1) Ask classifier model
    const {
      color,
      rationale,
      confidence,
      final_confidence,
      model_color,
      used_fallback,
      label_probs,
    } = await callModelTriage({
      patientId,
      answers,
      transcript,
    });

    // 2) Create a FHIR Observation in HealthLake
    const nowIso = new Date().toISOString();
    const obs = {
      resourceType: "Observation",
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "survey",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://example.org/triage",
            code: "result",
            display: "Triage Result",
          },
        ],
        text: "Triage Result",
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: nowIso,
      valueCodeableConcept: {
        coding: [
          { system: "http://example.org/triage-color", code: color },
        ],
        text: color,
      },
      note: [
        { text: `Triage: ${color}` },
        { text: `Rationale: ${rationale}` },
        { text: `Transcript:\n${transcript}` },
      ],
      extension: [
        {
          url: "http://example.org/triage-answers",
          valueString: JSON.stringify(answers),
        },
        {
          url: "http://example.org/triage-model-metrics",
          valueString: JSON.stringify({
            modelAccuracy: final_confidence,
            confidence,
            finalConfidence: final_confidence,
            modelColor: model_color,
            finalColor: color,
            usedFallback: used_fallback,
            label_probs: label_probs || null,
          }),
        },
      ],
    };

    const created = await signedFetch({
      method: "POST",
      path: "/Observation",
      body: obs,
    });

    console.log(
      "[INTAKE] Successfully created Observation " +
        (created?.id || "") +
        " for patient " +
        patientId
    );

    res.json({
      id: created?.id || null,
      color,
      rationale,
      confidence,
      final_confidence,
      model_color,
      used_fallback,
      label_probs,
      answers,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---------------------------------------------------------
// TRIAGE DETAIL (PROTECTED)
// ---------------------------------------------------------
app.get(
  "/api/triage-detail",
  requireAuth,
  requireActiveMembership,
  requirePermission("triage.read"),
  async (req, res) => {
  try {
    const riskId = String(req.query.riskId || "").trim();
    if (!riskId) {
      return res.status(400).json({ error: "riskId is required" });
    }

    const obsId = riskId.replace(/^Observation\//, "");
    const obs = await signedFetch({
      path: `/Observation/${encodeURIComponent(obsId)}`,
    });

    // --- color ---
    let color =
      obs?.valueCodeableConcept?.text ||
      obs?.valueCodeableConcept?.coding?.[0]?.code ||
      "";
    color = String(color || "").toLowerCase();

    if (!["red", "orange", "yellow"].includes(color)) {
      const notesText = (obs.note || [])
        .map((n) => n?.text || "")
        .join(" ");
      const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(
        notesText
      );
      color = (m?.[2] || "").toLowerCase();
    }

    // --- rationale ---
    const rationaleNote = findObservationNote(obs, /^rationale\s*:/i) || "";
    const rationale = rationaleNote.replace(/^rationale\s*:\s*/i, "") || "";

    // --- answers ---
    let answers = [];
    const ansExt = (obs.extension || []).find(
      (e) => e.url === "http://example.org/triage-answers"
    );
    if (ansExt?.valueString) {
      try {
        answers = JSON.parse(ansExt.valueString);
      } catch {
        // ignore
      }
    }

    // --- flags ---
    const flags = readTriageFlagsFromObservation(obs);
    const transcript = readTranscriptFromObservation(obs);
    const modelAccuracy = readModelAccuracyFromObservation(obs);
    const override = readOverrideFromObservation(obs);

    // --- patient info (non-fatal) ---
    let patient = null;
    const patientRef = obs?.subject?.reference; // e.g. "Patient/patien0"
    if (patientRef && /^Patient\//.test(patientRef)) {
      const pid = patientRef.replace(/^Patient\//, "");
      try {
        const p = await signedFetch({
          path: `/Patient/${encodeURIComponent(pid)}`,
        });
        const nm = p?.name?.[0] || {};
        const full =
          [nm.given?.join(" "), nm.family].filter(Boolean).join(" ") || pid;
        patient = { id: pid, name: full, birthDate: p.birthDate || null };
      } catch (err) {
        console.warn(
          "[HL WARN] patient lookup failed",
          err.status || "",
          err.message || ""
        );
        patient = { id: pid, name: pid, birthDate: null };
      }
    }

    res.json({
      id: obs.id,
      date:
        obs.effectiveDateTime ||
        obs.issued ||
        obs.meta?.lastUpdated ||
        null,
      color: color || null,
      rationale: rationale || null,
      transcript,
      modelAccuracy,
      answers,
      patient,
      flags,
      override,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post(
  "/api/provider/image-retrieval",
  requireAuth,
  requireActiveMembership,
  requirePermission("triage.read"),
  async (req, res) => {
    try {
      const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
      const base = String(IMAGE_RETRIEVAL_URL || "").replace(/\/$/, "");
      const candidatePaths = [
        "/search-images",
        "/search-images/",
        "/search_images",
        "/search_images/",
        "/api/search-images",
        "/api/search_images",
      ];

      let lastStatus = 502;
      let lastError = "";
      let lastUrl = "";

      for (const p of candidatePaths) {
        const url = `${base}${p}`;
        lastUrl = url;

        const upstream = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers }),
        });

        const contentType = upstream.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await upstream.json()
          : { error: await upstream.text() };

        if (upstream.ok) {
          return res.json(data);
        }

        lastStatus = upstream.status || 502;
        lastError = extractServiceError(
          data,
          `Image retrieval service request failed (${lastStatus})`
        );

        if (upstream.status !== 404) {
          return res.status(upstream.status).json({
            error: `${lastError} [url=${url}]`,
          });
        }
      }

      return res.status(lastStatus).json({
        error: `${lastError} [lastTried=${lastUrl}]`,
      });
    } catch (e) {
      return res.status(502).json({
        error: e?.message || "Image retrieval service is unavailable",
      });
    }
  }
);

app.get(
  "/api/provider/schedule-week",
  requireAuth,
  requireActiveMembership,
  requirePermission("triage.read"),
  async (req, res) => {
    try {
      const rawStart = String(req.query.start || "").trim();
      const startDate = rawStart ? new Date(`${rawStart}T00:00:00`) : new Date();
      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "start must be a valid YYYY-MM-DD date" });
      }

      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const bundle = await signedFetch({
        path: "/Observation",
        query: "_count=100&_sort=-_lastUpdated",
      });

      const entries = (bundle.entry || [])
        .map((e) => e.resource)
        .filter((r) => r?.resourceType === "Observation");

      const appointments = [];

      for (const obs of entries) {
        const flags = readTriageFlagsFromObservation(obs);
        const appointmentAt = flags?.appointmentAt;
        if (!flags?.scheduled || !appointmentAt) continue;

        const apptDate = new Date(appointmentAt);
        if (Number.isNaN(apptDate.getTime())) continue;
        if (apptDate < start || apptDate >= end) continue;

        let color =
          obs?.valueCodeableConcept?.text ||
          obs?.valueCodeableConcept?.coding?.[0]?.code ||
          "";
        color = String(color || "").toLowerCase();
        if (!["red", "orange", "yellow"].includes(color)) {
          const noteText = (obs.note || []).map((n) => n?.text || "").join(" ");
          const match = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(noteText);
          color = String(match?.[2] || "yellow").toLowerCase();
        }

        const patientId = obs.subject?.reference?.replace(/^Patient\//, "") || "unknown";
        const patientName = obs.subject?.display || `Patient ${patientId}`;

        appointments.push({
          riskId: obs.id,
          patientId,
          patientName,
          appointmentAt: apptDate.toISOString(),
          color,
          contacted: !!flags?.contacted,
          scheduled: !!flags?.scheduled,
          contactMethod: flags?.contactMethod || null,
          sourceDate:
            obs.effectiveDateTime ||
            obs.issued ||
            obs.meta?.lastUpdated ||
            null,
        });
      }

      appointments.sort((a, b) => {
        const diff =
          new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime();
        if (diff !== 0) return diff;
        return String(a.patientName || "").localeCompare(String(b.patientName || ""));
      });

      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateKey = dayDate.toISOString().slice(0, 10);
        days.push({
          date: dateKey,
          label: dayDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          appointments: appointments.filter(
            (item) => item.appointmentAt.slice(0, 10) === dateKey
          ),
        });
      }

      res.json({
        ok: true,
        range: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        total: appointments.length,
        appointments,
        days,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------
// FLAGS (contacted/scheduled etc.) - PROTECTED
// ---------------------------------------------------------
app.patch(
  "/api/triage-cases/:riskId/flags",
  requireAuth, requireActiveMembership, requirePermission("triage.flag"),
  async (req, res) => {
    try {
      const rawId = req.params.riskId || "";
      const riskId = decodeURIComponent(rawId).replace(/^Observation\//, "");
      if (!riskId) {
        return res.status(400).json({ error: "riskId is required" });
      }

      const body = req.body || {};
      const updates =
        body?.bulk && typeof body.bulk === "object" ? body.bulk : body;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "flags payload required" });
      }

      // Load Observation
      const obs = await signedFetch({
        path: `/Observation/${encodeURIComponent(riskId)}`,
      });

      const url = "http://example.org/triage-flags";
      const exts = obs.extension || [];
      let flags = {};
      const existing = exts.find((e) => e.url === url);

      if (existing?.valueString) {
        flags = parseJsonOrNull(existing.valueString) || {};
      }

      flags = { ...normalizeTriageFlags(flags), ...updates };

      if (existing) {
        existing.valueString = JSON.stringify(flags);
      } else {
        exts.push({ url, valueString: JSON.stringify(flags) });
        obs.extension = exts;
      }

      await signedFetch({
        method: "PUT",
        path: `/Observation/${encodeURIComponent(riskId)}`,
        body: obs,
      });
        logAudit({
            actor_membership_id: req.membership.id,
            actor_user_id: req.userId,
            action: "triage.flag.update",
            resource_type: "Observation",
            resource_id: riskId,
            details: { updates },
        });
      res.json({ ok: true, flags });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }
);
/*Need to fix later on. Dont use alert can crash system*/
// ---------------------------------------------------------
// OVERRIDE COLOR - PROTECTED 
// ---------------------------------------------------------
app.patch(
  "/api/triage-cases/:riskId/override",
  requireAuth, requireActiveMembership, requirePermission("triage.override"),
  async (req, res) => {
    try {
      const rawId = req.params.riskId || "";
      const riskId = decodeURIComponent(rawId).replace(/^Observation\//, "");
      if (!riskId) {
        return res.status(400).json({ error: "riskId is required" });
      }

      const body = req.body || {};
      const color = String(body.color || "").toLowerCase();
      const reason = body.reason || null;

      if (!["red", "orange", "yellow"].includes(color)) {
        return res
          .status(400)
          .json({ error: "color must be red|orange|yellow" });
      }

      // oad Observation
      const obs = await signedFetch({
        path: `/Observation/${encodeURIComponent(riskId)}`,
      });

      //update valueCodeableConcept
      obs.valueCodeableConcept = obs.valueCodeableConcept || {};
      obs.valueCodeableConcept.text = color;
      obs.valueCodeableConcept.coding = [
        {
          system: "http://example.org/triage-color",
          code: color,
        },
      ];

      //update/add "Triage: <color>" note
      const notes = obs.note || [];
      const triageNoteIdx = notes.findIndex(
        (n) => typeof n?.text === "string" && /^triage\s*:/i.test(n.text)
      );
      const triageText = `Triage: ${color}`;
      if (triageNoteIdx >= 0) {
        notes[triageNoteIdx].text = triageText;
      } else {
        notes.push({ text: triageText });
      }
      obs.note = notes;

      //record override reason in extension
      const overrideUrl = "http://example.org/triage-override";
      const exts = obs.extension || [];
      const ts = new Date().toISOString();
      const payload = { color, reason, at: ts };
      const existing = exts.find((e) => e.url === overrideUrl);

      if (existing) {
        existing.valueString = JSON.stringify(payload);
      } else {
        exts.push({ url: overrideUrl, valueString: JSON.stringify(payload) });
        obs.extension = exts;
      }

      await signedFetch({
        method: "PUT",
        path: `/Observation/${encodeURIComponent(riskId)}`,
        body: obs,
      });
        logAudit({
            actor_membership_id: req.membership.id,
            actor_user_id: req.userId,
            action: "triage.override",
            resource_type: "Observation",
            resource_id: riskId,
            details: { color, reason },
        });
      res.json({ ok: true, color, override: payload });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }
);
// ---------------------------
// ADMIN: approvals (ADMIN ONLY via members.manage)
// ---------------------------
app.get(
  "/api/admin/requests",
  requireAuth,
  requireActiveMembership,
  requirePermission("members.manage"),
  (req, res) => res.json(listPendingMembers())
);

app.post(
  "/api/admin/invite",
  requireAuth,
  requireActiveMembership,
  requirePermission("members.manage"),
  async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const suggestedRoleRaw = String(req.body?.suggested_role || "staff").trim().toLowerCase();
      const note = req.body?.note ? String(req.body.note).trim() : null;

      if (!email) return res.status(400).json({ error: "email is required" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "email format is invalid" });
      }

      const allowedRoles = new Set(["staff", "medical", "admin"]);
      if (!allowedRoles.has(suggestedRoleRaw)) {
        return res.status(400).json({ error: "suggested_role must be staff|medical|admin" });
      }

      const cognitoInvite = await sendCognitoInvite({
        email,
        suggestedRole: suggestedRoleRaw,
      });

      const invite = createOrRefreshInvite({
        email,
        suggested_role: suggestedRoleRaw,
        note,
        invited_by_membership_id: req.membership.id,
        invited_by_user_id: req.userId,
      });

      logAudit({
        actor_membership_id: req.membership.id,
        actor_user_id: req.userId,
        action: "member.invite",
        resource_type: "invite",
        resource_id: String(invite.id),
        details: {
          email,
          suggested_role: suggestedRoleRaw,
          note: note || null,
          cognito_username: cognitoInvite.username,
          cognito_group: cognitoInvite.group,
        },
      });

      res.json({ ok: true, invite, cognito: { invited: true, ...cognitoInvite } });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

app.get(
  "/api/admin/invites",
  requireAuth,
  requireActiveMembership,
  requirePermission("members.manage"),
  (req, res) => {
    try {
      const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100)));
      res.json(listMemberInvites({ limit }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

app.post(
  "/api/admin/approve",
  requireAuth,
  requireActiveMembership,
  requirePermission("members.manage"),
  (req, res) => {
    try {
      const { membership_id, roles } = req.body || {};
      if (!membership_id) return res.status(400).json({ error: "membership_id required" });
      if (!Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ error: "roles[] required (admin|medical|staff)" });
      }

      approveMember({
        membership_id: Number(membership_id),
        roleNames: roles,
        approved_by_sub: req.user.sub,
      });
        logAudit({
            actor_membership_id: req.membership.id,
            actor_user_id: req.userId,
            action: "member.approve",
            resource_type: "membership",
            resource_id: String(membership_id),
            details: {roles},
        });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

app.post(
  "/api/admin/disable",
  requireAuth,
  requireActiveMembership,
  requirePermission("members.manage"),
  (req, res) => {
    try {
      const { membership_id } = req.body || {};
      if (!membership_id) return res.status(400).json({ error: "membership_id required" });

        const disabled = disableMember({ membership_id: Number(membership_id) });
        logAudit({
            actor_membership_id: req.membership.id,
            actor_user_id: req.userId,
            action: "member.disable",
            resource_type: "membership",
            resource_id: String(membership_id),
            details: { membership_id: Number(membership_id), status: disabled?.status || "disabled" },
        });
      res.json({ ok: true, membership: disabled });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------
// ADMIN: roles/permissions (ADMIN ONLY via roles.manage)
// ---------------------------
app.get(
  "/api/admin/roles",
  requireAuth,
  requireActiveMembership,
  requirePermission("roles.manage"),
  (req, res) => res.json(listRoles())
);

app.get(
  "/api/admin/permissions",
  requireAuth,
  requireActiveMembership,
  requirePermission("roles.manage"),
  (req, res) => res.json(listPermissions())
);

app.post(
  "/api/admin/roles",
  requireAuth,
  requireActiveMembership,
  requirePermission("roles.manage"),
  (req, res) => {
    try {
      const { name, description } = req.body || {};
      if (!name) return res.status(400).json({ error: "name required" });

      const role = createRole({ name, description });
      res.json(role);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

app.delete(
  "/api/admin/roles/:roleId",
  requireAuth,
  requireActiveMembership,
  requirePermission("roles.manage"),
  (req, res) => {
    try {
      deleteRole({ role_id: Number(req.params.roleId) });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

app.put(
  "/api/admin/roles/:roleId/permissions",
  requireAuth,
  requireActiveMembership,
  requirePermission("roles.manage"),
  (req, res) => {
    try {
      const role_id = Number(req.params.roleId);
      const { permissions } = req.body || {};
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: "permissions[] required" });
      }

      setRolePermissions({ role_id, permKeys: permissions });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);
// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`HealthLake proxy running on http://localhost:${PORT}`)
);
