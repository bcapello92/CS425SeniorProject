// hl-ui/src/triageClient.js
import { getIdToken } from "./auth.jsx";

const BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000";

class TriageClient {
  async _request(path, { method = "GET", body } = {}) {
    const token = getIdToken();

    const headers = {};
    if (body) {
      headers["content-type"] = "application/json";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data;
  }

  async submitIntake({ patientId, answers, transcript }) {
    return this._request("/api/intake", {
      method: "POST",
      body: { patientId, answers, transcript },
    });
  }

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
        method: "PATCH",
        body: { [key]: value },
      }
    );
  }

  async setOverride(riskId, color, reason) {
    return this._request(
      `/api/triage-cases/${encodeURIComponent(riskId)}/override`,
      {
        method: "PATCH",
        body: { color, reason },
      }
    );
  }
}

export const triageClient = new TriageClient();
