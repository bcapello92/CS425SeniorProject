// hl-ui/src/triageClient.js
const BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000";

const CHAT_BASE =
  import.meta.env.VITE_CHAT_BASE?.replace(/\/$/, "") ||
  "http://localhost:8002";
class TriageClient {
    async _request(path, { method = "GET", body } = {}) {
        const headers = {};
        if (body) headers["content-type"] = "application/json";

        const res = await fetch(`${BASE}${path}`, {
            method,
            headers,
            credentials: "include", 
            body: body ? JSON.stringify(body) : undefined,
        });

        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json")
            ? await res.json()
            : { error: await res.text() };

        if (!res.ok || data.error) {
            const message = data.error || `HTTP ${res.status}`;
            throw new Error(`HTTP ${res.status}: ${message}`);
        }

        return data;
    }

    // ---------- EXISTING TRIAGE METHODS ----------

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

    async getScheduleWeek({ start }) {
        return this._request(
            `/api/provider/schedule-week?start=${encodeURIComponent(start)}`
        );
    }

    async setFlag(riskId, keyOrUpdates, value) {
        const body =
            keyOrUpdates && typeof keyOrUpdates === "object" && value === undefined
                ? keyOrUpdates
                : { [keyOrUpdates]: value };

        return this._request(
            `/api/triage-cases/${encodeURIComponent(riskId)}/flags`,
            {
                method: "PATCH",
                body,
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

    async searchRelatedImages({ answers }) {
        return this._request("/api/provider/image-retrieval", {
            method: "POST",
            body: { answers: Array.isArray(answers) ? answers : [] },
        });
    }

}
// ---------- CHAT FUNCTION (OLLAMA) ----------

export async function sendChat(messages) {
  const res = await fetch(`${CHAT_BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat server error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.reply;
}

export const triageClient = new TriageClient();
