const OLLAMA_CHAT_BASE =
  import.meta.env.VITE_OLLAMA_CHAT_BASE?.replace(/\/$/, "") ||
  "http://localhost:8002";

export async function sendChat(messages) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const res = await fetch(`${OLLAMA_CHAT_BASE}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
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
