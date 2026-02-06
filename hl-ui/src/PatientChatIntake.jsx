import React, { useState, useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import { triageClient } from "./triageClient";
import { handleUserMessage as sharedHandleUserMessage, uiToApiMessages, buildTranscript } from "./ChatbotLogic";
import "./Chatbot.css";

/*Wiem original code start*/
const BOT_GREETING =
  "👋 Hi! I’m your ENT assistant. Tell me what’s going on and I’ll ask a few follow-ups.";

export default function PatientChatIntake() {
  // ---------- patient + consent ----------
  const [entryId, setEntryId] = useState("");
  const [patientId, setPatientId] = useState(null);
  const [consented, setConsented] = useState(false);

  // Helper for timestamps
  const getTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------- chat state ----------
  const [messages, setMessages] = useState([
    { sender: "bot", text: BOT_GREETING, timestamp: getTimestamp() },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  // ---------- triage state ----------
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const hasStartedChat = patientId !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function resetAll() {
    setEntryId("");
    setPatientId(null);
    setConsented(false);
    setMessages([{ sender: "bot", text: BOT_GREETING, timestamp: getTimestamp() }]);
    setIsTyping(false);
    setSubmitting(false);
    setResult(null);
    setError(null);
  }

  // ---------- Chat send ----------
  const handleUserMessage = (userInput) => {
    sharedHandleUserMessage({
      userInput,
      patientId,
      isTyping,
      messages,
      setMessages,
      setIsTyping,
      completeConversation: sendForTriage,
      getTimestamp
    });
  };

  // ---------- Send chat transcript for triage ----------
  async function sendForTriage() {
    if (!patientId) return;
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const transcript = buildTranscript(messages);

    // answers are optional; you can keep empty or derive later
    const answers = [];

    // add a visible status message
    setMessages((prev) => [
      ...prev,
      { sender: "bot", text: "✅ Sending this conversation for triage..." },
    ]);

    try {
      const data = await triageClient.submitIntake({
        patientId,
        answers,
        transcript,
      });

      setResult(data);

      const triageColor = String(data.color || "").toLowerCase();
      let triageLabel = "routine";
      let severityClass = "non-urgent";
      let emoji = "✅";

      if (triageColor === "red") {
        triageLabel = "severe";
        severityClass = "emergency";
        emoji = "🚨";
      } else if (triageColor === "orange") {
        triageLabel = "urgent";
        severityClass = "semi-urgent";
        emoji = "⚠️";
      }

      const botReply = `
        <div class="severity-container">
          <button class="severity-btn ${severityClass}">
            ${emoji} ${triageLabel.charAt(0).toUpperCase() + triageLabel.slice(1)}
          </button>
          <p>Based on your conversation, your case is classified as <strong>${triageLabel}</strong>.</p>
          <p><strong>Reasoning:</strong> ${data.rationale || "No rationale provided."}</p>
        </div>
      `;

      setMessages((prev) => [...prev, { sender: "bot", text: botReply, isHTML: true }]);
    } catch (err) {
      setError(err?.message || "Failed to submit for triage.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "❌ Sorry, I couldn't submit for triage. Please try again.",
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  const userMessageCount = messages.filter((m) => m.sender === "user").length;
  // const canSendForTriage = hasStartedChat && !result && userMessageCount >= 2 && !submitting;

  return (
    <div className="chatbot-wrapper">
      <header className="chatbot-header">
        <img src="/logo.png" alt="ENT Logo" className="logo" />
        <h1>ENT Patient Support Chatbot</h1>
      </header>

      {/* Start screen */}
      {!hasStartedChat && !result && (
        <div style={card}>
          <div style={{ marginBottom: 8 }}>
            Enter your Intake Code or Patient ID:
          </div>
          <input
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            placeholder="e.g. 12345 or ABCD-123"
            style={inputStyle}
          />
          <label style={{ display: "block", marginTop: 10 }}>
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
            />{" "}
            I consent to share my responses for care.
          </label>
          <button
            disabled={!entryId.trim() || !consented}
            onClick={() => setPatientId(entryId.trim())}
            style={buttonPrimary}
          >
            Begin Chat
          </button>
        </div>
      )}

      {/* Chat window */}
      {hasStartedChat && (
        <>
          <div className="chat-window">
            {messages.map((msg, index) => (
              <ChatMessage
                key={index}
                sender={msg.sender}
                text={msg.text}
                isHTML={msg.isHTML}
                timestamp={msg.timestamp}
              />
            ))}

            {isTyping && (
              <div className="message-bot typing-indicator">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            <div ref={bottomRef}></div>
          </div>

          {error && <div style={{ color: "crimson", marginTop: 8 }}>Error: {error}</div>}

          {/* After triage - show button above input */}
          {result && (
            <div style={{ padding: "16px 24px", background: "rgba(255,255,255,0.9)", textAlign: "center" }}>
              <button onClick={resetAll} style={buttonSecondary}>
                Start another intake
              </button>
            </div>
          )}

          {/* Only show input when triage not complete */}
          {!result && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <ChatInput onSend={handleUserMessage} />
              </div>

              {/* <button
              onClick={sendForTriage}
              disabled={!canSendForTriage}
              style={{
                ...buttonPrimary,
                height: 44,
                alignSelf: "flex-end",
                opacity: canSendForTriage ? 1 : 0.5,
              }}
              title={
                userMessageCount < 2
                  ? "Have a short conversation first (at least 2 patient messages)."
                  : ""
              }
            >
              {submitting ? "Sending…" : "Send for Triage"}
            </button> */}
            </div>
          )}
        </>
      )}

      {/* After triage */}
      {/* {result && (
        <div style={{ marginTop: 16 }}>
          <button onClick={resetAll} style={buttonSecondary}>
            Start another intake
          </button>
        </div>
      )} */}
    </div>
  );
}
/*Wiem code end*/
const card = {
  margin: "16px",
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 12,
  background: "#fff",
  width: "calc(100% - 32px)",
  boxShadow: "0 1px 8px rgba(0,0,0,0.05)"
};

const inputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 10
};

const buttonPrimary = {
  marginTop: 10,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#e7f3ff",
  cursor: "pointer"
};

const buttonSecondary = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer"
};
