import { CHAT_BASE } from "./config";

const OLLAMA_CHAT_BASE = (CHAT_BASE || "http://localhost:8002").replace(/\/$/, "");
const CHAT_ENDPOINT = OLLAMA_CHAT_BASE.endsWith("/chat")
  ? OLLAMA_CHAT_BASE
  : `${OLLAMA_CHAT_BASE}/chat`;

export async function sendChat(messages, language = 'en') {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000); // 60s timeout (allows for Ollama cold start)

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, language }), // Include language in request
      signal: controller.signal,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await res.json()
      : { detail: await res.text() };

    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    return data.reply;
  } finally {
    clearTimeout(t);
  }
}

export async function translateTranscript(transcript) {
  try {
    const res = await fetch(`${OLLAMA_CHAT_BASE}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    return data.translated;
  } catch (err) {
    console.error("Translation API call failed:", err);
    throw err;
  }
}

export async function uploadPatientPdf(file, patientId) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("patient_id", patientId);

  const res = await fetch(`${OLLAMA_CHAT_BASE}/upload-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PDF upload failed: HTTP ${res.status}: ${errorText}`);
  }

  return await res.json();
}

export async function listPatientPdfs(patientId) {
  const res = await fetch(`${OLLAMA_CHAT_BASE}/list-pdfs/${patientId}`);
  if (!res.ok) {
    throw new Error('Failed to list PDFs');
  }
  const data = await res.json();
  return data.pdfs;
}

export function getPdfUrl(filename) {
  return `${OLLAMA_CHAT_BASE}/pdfs/${filename}`;
}

