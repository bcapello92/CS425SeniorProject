// src/triageClient.js

const BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ||
  'http://localhost:4000'; // adjust if needed

class TriageClient {
  // ---------- low-level helper ----------
  async _request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body
        ? { 'content-type': 'application/json' }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json')
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data;
  }

  // ---------- Patient Intake ----------
  async submitIntake({ patientId, answers, transcript }) {
    // POST /api/intake – your current endpoint
    return this._request('/api/intake', {
      method: 'POST',
      body: { patientId, answers, transcript },
    });
  }

  // ---------- Provider Triage board ----------
  async getBoard({ sinceHours }) {
    return this._request(
      `/api/triage-cases?sinceHours=${encodeURIComponent(sinceHours)}`
    );
  }

  async getDetail(riskId) {
    return this._request(
      `/api/triage-detail?riskId=${encodeURIComponent(riskId)}`
    );
  }

  async setFlag(riskId, key, value) {
    return this._request(
      `/api/triage-cases/${encodeURIComponent(riskId)}/flags`,
      {
        method: 'PATCH',
        body: { [key]: value },
      }
    );
  }
  async setOverride(riskId, color, reason) {
  return this._request(
    `/api/triage-cases/${encodeURIComponent(riskId)}/override`,
    {
      method: 'PATCH',
      body: { color, reason },
    }
  );
 }
}

export const triageClient = new TriageClient();
