// hl-ui/src/triageClient.js
const BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000";

const CHAT_BASE =
  import.meta.env.VITE_CHAT_BASE?.replace(/\/$/, "") ||
  "http://localhost:8002";

class TriageClient {
    // Shared fetch wrapper for the authenticated app API. It normalizes JSON/text responses into thrown errors.
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

    // Sends a completed patient intake payload to the backend so triage can be created and persisted.

    async submitIntake({ patientId, answers, transcript }) {
        return this._request("/api/intake", {
            method: "POST",
            body: { patientId, answers, transcript },
        });
    }

    // Loads the provider board summary grouped by triage level over a recent time window.
    async getBoard({ sinceHours }) {
        return this._request(
            `/api/triage-cases?sinceHours=${encodeURIComponent(sinceHours)}`
        );
    }

    // Loads the full detail for a single triage case when a provider expands it.
    async getDetail(riskId) {
        return this._request(
            `/api/triage-detail?riskId=${encodeURIComponent(riskId)}`
        );
    }

    // Retrieves schedule data for a given week when provider scheduling needs backend availability.
    async getScheduleWeek({ start }) {
        return this._request(
            `/api/provider/schedule-week?start=${encodeURIComponent(start)}`
        );
    }

    // Updates provider follow-up flags, either via a single key/value or a full partial update object.
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

    // Stores a provider override when the board triage level is manually changed.
    async setOverride(riskId, color, reason) {
        return this._request(
            `/api/triage-cases/${encodeURIComponent(riskId)}/override`,
            {
                method: "PATCH",
                body: { color, reason },
            }
        );
    }

    // Requests case-specific related images using structured patient answers from the triage detail payload.
    async searchRelatedImages({ answers }) {
        return this._request("/api/provider/image-retrieval", {
            method: "POST",
            body: { answers: Array.isArray(answers) ? answers : [] },
        });
    }

}

// Sends the live patient chat transcript to the separate chat service used during intake.
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
