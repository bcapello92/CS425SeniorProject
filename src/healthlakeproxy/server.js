// server.js (NO AUTH)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

const app = express();
app.use(cors({ origin: ['http://localhost:5173'] }));
app.use(express.json());

const REGION = process.env.REGION || process.env.AWS_REGION;
const DATASTORE_ID = process.env.DATASTORE_ID;
if (!REGION || !DATASTORE_ID) {
  console.error('Missing REGION or DATASTORE_ID in env');
  process.exit(1);
}
const BASE_HOST = `healthlake.${REGION}.amazonaws.com`;
const BASE_URL  = `https://${BASE_HOST}/datastore/${DATASTORE_ID}/r4`;

const credentials = fromNodeProviderChain({ profile: process.env.AWS_PROFILE });
const signer = new SignatureV4({ service: 'healthlake', region: REGION, sha256: Sha256, credentials });

async function signedFetch({ method='GET', path='', query='', body }) {
  const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
  const req = new HttpRequest({
    method,
    protocol: 'https:',
    hostname: BASE_HOST,
    path: `/datastore/${DATASTORE_ID}/r4${path}`,
    query: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    headers: { host: BASE_HOST, 'content-type': 'application/fhir+json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const signed = await signer.sign(req);
  const resp = await fetch(url, { method, headers: signed.headers, body: req.body });
  const text = await resp.text();
  const isJson = (resp.headers.get('content-type') || '').includes('json');
  const data = isJson ? (text ? JSON.parse(text) : {}) : text;
  if (!resp.ok) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    console.error('[HL ERROR]', resp.status, method, url, msg);
    const err = new Error(`HealthLake error ${resp.status}: ${msg}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'unknown', region: REGION });
});

app.get('/diag/hl-ping', async (req, res) => {
  try {
    const data = await signedFetch({ path: '/Patient', query: '_count=1' });
    res.json({ ok: true, sample: data.entry?.[0]?.resource?.id || null });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

app.get('/api/patients', async (req, res) => {
  try {
    const count = Math.min(100, Math.max(1, Number(req.query.count || 20)));
    const data = await signedFetch({ path: '/Patient', query: `_count=${count}` });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/observations', async (req, res) => {
  try {
    const patientId = req.query.patientId;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const count = Math.min(100, Math.max(1, Number(req.query.count || 25)));
    const query = `_count=${count}&subject=Patient%2F${encodeURIComponent(patientId)}&_sort=-date`;
    const data = await signedFetch({ path: '/Observation', query });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Triage board: pull recent observations and parse triage color from note text ("Triage: red|orange|yellow")
app.get('/api/triage-cases', async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.sinceHours || 24)));
    const sinceIso = new Date(Date.now() - hours * 3600e3).toISOString();
    const bundle = await signedFetch({
      path: '/Observation',
      query: `_count=100&_sort=-_lastUpdated&_lastUpdated=ge${encodeURIComponent(sinceIso)}`
    });
    const entries = (bundle.entry || []).map(e => e.resource).filter(r => r?.resourceType === 'Observation');

    const groups = { red: [], orange: [], yellow: [] };
    for (const o of entries) {
      const text = (o.note || []).map(n => n?.text || '').join(' ').toLowerCase();
      const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(text);
      const color = m?.[2]?.toLowerCase();
      if (!color) continue;

      const pid = o.subject?.reference?.replace(/^Patient\//,'') || 'unknown';
      const name = o.subject?.display || `Patient ${pid}`;

      groups[color].push({
        riskId: o.id,
        patientId: pid,
        patientName: name,
        date: o.effectiveDateTime || o.issued || o.meta?.lastUpdated,
        color,
        rationale: text || ''
      });
    }

    res.json({
      since: sinceIso,
      counts: { red: groups.red.length, orange: groups.orange.length, yellow: groups.yellow.length },
      groups
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
// --- POST /api/intake ---
// Body: { patientId: string, answers: [{linkId,text,answer}], transcript?: string }
app.post('/api/intake', async (req, res) => {
  try {
    const { patientId, answers = [], transcript = '' } = req.body || {};
    if (!patientId || typeof patientId !== 'string') {
      return res.status(400).json({ error: 'patientId is required' });
    }

    // --- very simple triage classifier (keyword-based) ---
    const text = [
      ...answers.map(a => `${a.text}: ${a.answer}`),
      transcript || ''
    ].join('\n').toLowerCase();

    let color = 'yellow';
    let rationale = 'Default (no critical keywords found).';

    const has = (w) => text.includes(w);
    if (has('chest pain') || has('shortness of breath') || has('unconscious') || has('severe bleeding')) {
      color = 'red';
      rationale = 'High-risk keywords detected (e.g., chest pain / SOB / LOC / severe bleeding).';
    } else if (has('worsening') || has('fever') || has('moderate pain') || has('can’t keep fluids')) {
      color = 'orange';
      rationale = 'Moderate-risk keywords detected (worsening symptoms / fever / moderate pain).';
    }

    // --- Create a FHIR Observation in HealthLake ---
    const nowIso = new Date().toISOString();
    const obs = {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
      code: {
        coding: [{ system: 'http://example.org/triage', code: 'result', display: 'Triage Result' }],
        text: 'Triage Result'
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: nowIso,
      valueCodeableConcept: { coding: [{ system: 'http://example.org/triage-color', code: color }], text: color },
      note: [
        { text: `Triage: ${color}` },
        { text: `Rationale: ${rationale}` },
        { text: `Transcript:\n${transcript}` }
      ],
      // keep answers in a safe extension blob (optional)
      extension: [{
        url: 'http://example.org/triage-answers',
        valueString: JSON.stringify(answers)
      }]
    };

    const created = await signedFetch({
      method: 'POST',
      path: '/Observation',
      body: obs
    });

    // Respond to UI
    res.json({
      id: created?.id || null,
      color,
      rationale,
      answers
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
// GET /api/triage-detail?riskId=Observation/<id> or just <id>
app.get('/api/triage-detail', async (req, res) => {
  try {
    const riskId = String(req.query.riskId || '').trim();
    if (!riskId) return res.status(400).json({ error: 'riskId is required' });

    const obsId = riskId.replace(/^Observation\//, '');
    const obs = await signedFetch({ path: `/Observation/${encodeURIComponent(obsId)}` });

    // --- extract triage color ---
    let color =
      obs?.valueCodeableConcept?.text ||
      obs?.valueCodeableConcept?.coding?.[0]?.code || '';
    color = String(color || '').toLowerCase();

    if (!['red','orange','yellow'].includes(color)) {
      // fallback: look in note text like "Triage: red"
      const notes = (obs.note || []).map(n => n?.text || '').join(' ');
      const m = /(triage(?:\s*color)?\s*:\s*)(red|orange|yellow)/i.exec(notes);
      color = (m?.[2] || '').toLowerCase();
    }

    // --- rationale (from notes if present) ---
    const rationaleNote = (obs.note || [])
      .map(n => n?.text || '')
      .find(t => /^rationale\s*:/i.test(t)) || '';
    const rationale = rationaleNote.replace(/^rationale\s*:\s*/i, '') || '';

    // --- answers (from extension blob if you saved them) ---
    let answers = [];
    const ext = (obs.extension || []).find(e => e.url === 'http://example.org/triage-answers');
    if (ext?.valueString) {
      try { answers = JSON.parse(ext.valueString); } catch {}
    }

    // --- patient info (optional) ---
    let patient = null;
    const patientRef = obs?.subject?.reference; // e.g. "Patient/123"
    if (patientRef && /^Patient\//.test(patientRef)) {
      const pid = patientRef.replace(/^Patient\//, '');
      try {
        const p = await signedFetch({ path: `/Patient/${encodeURIComponent(pid)}` });
        const nm = p?.name?.[0] || {};
        const full = [nm.given?.join(' '), nm.family].filter(Boolean).join(' ') || pid;
        patient = { id: pid, name: full, birthDate: p.birthDate || null };
      } catch { /* non-fatal */ }
    }

    res.json({
      id: obs.id,
      date: obs.effectiveDateTime || obs.issued || obs.meta?.lastUpdated || null,
      color: color || null,
      rationale: rationale || null,
      answers,
      patient
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`HealthLake proxy running on http://localhost:${PORT}`));
