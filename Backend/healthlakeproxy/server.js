// server.js – HealthLake proxy + model integration + Cognito-protected provider APIs

import "dotenv/config";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

// ---------------------------------------------------------
// MODEL SERVICE (classifier)
// ---------------------------------------------------------
const MODEL_URL = process.env.MODEL_URL || "http://localhost:8001";

async function callModelTriage({ patientId, answers, transcript }) {
  const payload = { patientId, answers, transcript };

  const resp = await fetch(`${MODEL_URL}/triage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

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
  return { color, rationale };
}

// ---------------------------------------------------------
// COGNITO JWT AUTH (for provider routes)
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
        audience: COGNITO_CLIENT_ID,
        issuer: COGNITO_ISSUER,
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      }
    );
  });
}

// Express middleware to require Cognito login
async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");

    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const decoded = await verifyToken(token);
    req.user = decoded; // optional: make user claims available
    next();
  } catch (e) {
    console.error("[AUTH ERROR]", e.message || e);
    return res.status(401).json({ error: "Invalid or missing token" });
  }
}

// ---------------------------------------------------------
// HEALTHLAKE SIGNED CLIENT
// ---------------------------------------------------------
const app = express();
app.use(cors({ origin: ["http://localhost:5173"] }));
app.use(express.json());

const REGION = process.env.REGION || process.env.AWS_REGION;
const DATASTORE_ID = process.env.DATASTORE_ID;
if (!REGION || !DATASTORE_ID) {
  console.error("Missing REGION or DATASTORE_ID in env");
  process.exit(1);
}
const BASE_HOST = `healthlake.${REGION}.amazonaws.com`;
const BASE_URL = `https://${BASE_HOST}/datastore/${DATASTORE_ID}/r4`;

const credentials = fromNodeProviderChain({ profile: process.env.AWS_PROFILE });
const signer = new SignatureV4({
  service: "healthlake",
  region: REGION,
  sha256: Sha256,
  credentials,
});

async function signedFetch({ method = "GET", path = "", query = "", body }) {
  const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;

  const req = new HttpRequest({
    method,
    protocol: "https:",
    hostname: BASE_HOST,
    path: `/datastore/${DATASTORE_ID}/r4${path}`,
    query: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    headers: { host: BASE_HOST, "content-type": "application/fhir+json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const signed = await signer.sign(req);

  const resp = await fetch(url, {
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
        url,
        msg
      );
    } else {
      console.error("[HL ERROR]", resp.status, method, url, msg);
    }

    const err = new Error(`HealthLake error ${resp.status}: ${msg}`);
    err.status = resp.status;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------
// BASIC DIAG/UTILITY ROUTES
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// PATIENT-FACING FHIR HELPERS (OPTIONAL)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// PROVIDER TRIAGE BOARD (PROTECTED)
// ---------------------------------------------------------
// Fetch recent Observations, group by triage color from "Triage: red|orange|yellow"
app.get("/api/triage-cases", requireAuth, async (req, res) => {
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

    const groups = { red: [], orange: [], yellow: [] };

    for (const o of entries) {
      const text = (o.note || [])
        .map((n) => n?.text || "")
        .join(" ")
        .toLowerCase();
      const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(text);
      const color = m?.[2]?.toLowerCase();
      if (!color) continue;

      //read triage-flags extension ----
      let flags = {};
      const flagsExt = (o.extension || []).find(
        (e) => e.url === "http://example.org/triage-flags"
      );
      if (flagsExt?.valueString) {
        try {
          flags = JSON.parse(flagsExt.valueString);
        } catch {
          flags = {};
        }
      }

      // If both contacted & scheduled are true, SKIP this case entirely
      if (flags.contacted && flags.scheduled) {
        continue;
      }
      // -----------------------------------------

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
// PATIENT INTAKE -> MODEL -> HEALTHLAKE (UNAUTH / PUBLIC)
// ---------------------------------------------------------
app.post("/api/intake", async (req, res) => {
  try {
    const { patientId, answers = [], transcript = "" } = req.body || {};
    if (!patientId || typeof patientId !== "string") {
      return res.status(400).json({ error: "patientId is required" });
    }

    // 1) Ask classifier model
    const { color, rationale } = await callModelTriage({
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
      ],
    };

    const created = await signedFetch({
      method: "POST",
      path: "/Observation",
      body: obs,
    });

    res.json({
      id: created?.id || null,
      color,
      rationale,
      answers,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---------------------------------------------------------
// TRIAGE DETAIL (PROTECTED)
// ---------------------------------------------------------
app.get("/api/triage-detail", requireAuth, async (req, res) => {
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
    const rationaleNote =
      (obs.note || [])
        .map((n) => n?.text || "")
        .find((t) => /^rationale\s*:/i.test(t)) || "";
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
    let flags = {};
    const flagsExt = (obs.extension || []).find(
      (e) => e.url === "http://example.org/triage-flags"
    );
    if (flagsExt?.valueString) {
      try {
        flags = JSON.parse(flagsExt.valueString);
      } catch {
        // ignore
      }
    }

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
      answers,
      patient,
      flags,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---------------------------------------------------------
// FLAGS (contacted/scheduled etc.) – PROTECTED
// ---------------------------------------------------------
app.patch(
  "/api/triage-cases/:riskId/flags",
  requireAuth,
  async (req, res) => {
    try {
      const rawId = req.params.riskId || "";
      const riskId = decodeURIComponent(rawId).replace(/^Observation\//, "");
      if (!riskId) {
        return res.status(400).json({ error: "riskId is required" });
      }

      const updates = req.body || {};
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
        try {
          flags = JSON.parse(existing.valueString);
        } catch {
          flags = {};
        }
      }

      flags = { ...flags, ...updates };

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

      res.json({ ok: true, flags });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------
// OVERRIDE COLOR – PROTECTED
// ---------------------------------------------------------
app.patch(
  "/api/triage-cases/:riskId/override",
  requireAuth,
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

      // load Observation
      const obs = await signedFetch({
        path: `/Observation/${encodeURIComponent(riskId)}`,
      });

      // 1) update valueCodeableConcept
      obs.valueCodeableConcept = obs.valueCodeableConcept || {};
      obs.valueCodeableConcept.text = color;
      obs.valueCodeableConcept.coding = [
        {
          system: "http://example.org/triage-color",
          code: color,
        },
      ];

      // 2) update/add "Triage: <color>" note
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

      // 3) record override reason in extension
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

      res.json({ ok: true, color, override: payload });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
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
