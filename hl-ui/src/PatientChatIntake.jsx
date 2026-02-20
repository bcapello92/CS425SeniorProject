import React, { useState, useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import SymptomTimeline from "./SymptomTimeline.jsx";
import SuggestionChips from "./SuggestionChips.jsx";
import { triageClient } from "./triageClient";
import { handleUserMessage as sharedHandleUserMessage, uiToApiMessages, buildTranscript } from "./ChatbotLogic";
import "./Chatbot.css";

/*Wiem original code start*/

// Translation dictionary for UI text
const translations = {
  en: {
    greeting: "If this is a medical emergency, please call 911 immediately⚠️. Hi! I'm your ENT assistant. Tell me what's going on and I'll ask a few follow-ups to help our medical team understand your situation.",
    entLocation: "Before we begin, could you tell me: Is this mainly in your ear, nose/sinuses, throat/neck, or elsewhere?",
    enterCode: "Enter your Intake Code or Patient ID:",
    codePlaceholder: "e.g. 12345 or ABCD-123",
    consentText: "I consent to share my responses for care.",
    beginChat: "Begin Chat",
    startAnother: "Start another intake",
    languageLabel: "Language / Idioma",
    inputPlaceholder: "Type your symptoms...",
    sendButton: "Send",
    // Triage result messages
    triageSevere: "severe",
    triageUrgent: "urgent",
    triageRoutine: "routine",
    triageClassified: "Based on your conversation, your case is classified as",
    triageReasoning: "Reasoning:",
    triageNoRationale: "No rationale provided.",
    triageError: "Sorry, I couldn't submit for triage. Please try again."
  },
  es: {
    greeting: "Si esto es una emergencia médica, llame al 911 inmediatamente⚠️. ¡Hola! Soy su asistente de ORL. Dígame qué está pasando y haré algunas preguntas para ayudar a nuestro equipo médico a entender su situación.",
    entLocation: "Antes de comenzar, ¿podría decirme: esto ocurre principalmente en el oído, la nariz/senos paranasales, la garganta/cuello o en otra parte?",
    enterCode: "Ingrese su código de ingreso o ID de paciente:",
    codePlaceholder: "ej. 12345 o ABCD-123",
    consentText: "Doy mi consentimiento para compartir mis respuestas para atención médica.",
    beginChat: "Comenzar Chat",
    startAnother: "Iniciar otra consulta",
    languageLabel: "Language / Idioma",
    inputPlaceholder: "Escriba sus síntomas...",
    sendButton: "Enviar",
    // Triage result messages
    triageSevere: "severo",
    triageUrgent: "urgente",
    triageRoutine: "rutinario",
    triageClassified: "Según su conversación, su caso está clasificado como",
    triageReasoning: "Razonamiento:",
    triageNoRationale: "No se proporcionó razonamiento.",
    triageError: "Lo siento, no pude enviar para triaje. Por favor intente de nuevo."
  }
};

export default function PatientChatIntake() {
  // ---------- language ----------
  const [language, setLanguage] = useState('en'); // 'en' or 'es'
  const t = translations[language]; // translation helper

  // ---------- patient + consent ----------
  const [entryId, setEntryId] = useState("");
  const [patientId, setPatientId] = useState(null);
  const [consented, setConsented] = useState(false);

  // Helper for timestamps
  const getTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------- chat state ----------
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  // ---------- timeline state ----------
  const [showTimeline, setShowTimeline] = useState(false);
  const [symptomOnset, setSymptomOnset] = useState(null);

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
    const ts = getTimestamp();
    setMessages([
      { sender: "bot", text: `${t.greeting}`, timestamp: ts },
      { sender: "bot", text: t.entLocation, timestamp: ts },
    ]);
    setIsTyping(false);
    setSubmitting(false);
    setResult(null);
    setError(null);
  }

  // ---------- Timeline handlers ----------
  const handleTimelineSelect = ({ timestamp, humanReadable, mode }) => {
    setSymptomOnset({ timestamp, humanReadable, mode });
    setShowTimeline(false);

    // Add the selected timeline as a user message
    const timelineMessage = {
      sender: "user",
      text: humanReadable,
      timestamp: getTimestamp(),
      metadata: { symptomOnset: timestamp }
    };

    // Continue the conversation with the timeline data
    handleUserMessage(humanReadable);
  };

  const handleTimelineCancel = () => {
    setShowTimeline(false);
  };

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
      setShowTimeline,
      getTimestamp,
      language // Pass language to backend
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
    const sendingMessage = language === 'es'
      ? "✅ Enviando esta conversación para triaje..."
      : "✅ Sending this conversation for triage...";
    setMessages((prev) => [
      ...prev,
      { sender: "bot", text: sendingMessage },
    ]);

    try {
      const data = await triageClient.submitIntake({
        patientId,
        answers,
        transcript: buildTranscript(messages), // Pass the structured timeline data
        symptomOnset
      });

      setResult(data);

      // Don't show triage classification to patients
      /*
      const triageColor = String(data.color || "").toLowerCase();
      let triageLabel = t.triageRoutine;
      let severityClass = "non-urgent";
      let emoji = "✅";

      if (triageColor === "red") {
        triageLabel = t.triageSevere;
        severityClass = "emergency";
        emoji = "🚨";
      } else if (triageColor === "orange") {
        triageLabel = t.triageUrgent;
        severityClass = "semi-urgent";
        emoji = "⚠️";
      }

      const botReply = `
        <div class="severity-container">
          <button class="severity-btn ${severityClass}">
            ${emoji} ${triageLabel.charAt(0).toUpperCase() + triageLabel.slice(1)}
          </button>
          <p>${t.triageClassified} <strong>${triageLabel}</strong>.</p>
          <p><strong>${t.triageReasoning}</strong> ${data.rationale || t.triageNoRationale}</p>
        </div>
      `;

      setMessages((prev) => [...prev, { sender: "bot", text: botReply, isHTML: true }]);
      */
    } catch (err) {
      setError(err?.message || "Failed to submit for triage.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `❌ ${t.triageError}`,
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
          {/* Language Toggle */}
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', marginBottom: 8, color: '#666' }}>
              {t.languageLabel}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={() => setLanguage('en')}
                style={{
                  ...buttonPrimary,
                  backgroundColor: language === 'en' ? '#4a90e2' : '#ccc',
                  padding: '8px 16px',
                  fontSize: '0.9rem'
                }}
              >
                English
              </button>
              <button
                onClick={() => setLanguage('es')}
                style={{
                  ...buttonPrimary,
                  backgroundColor: language === 'es' ? '#4a90e2' : '#ccc',
                  padding: '8px 16px',
                  fontSize: '0.9rem'
                }}
              >
                Español
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            {t.enterCode}
          </div>
          <input
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            placeholder={t.codePlaceholder}
            style={inputStyle}
          />
          <label style={{ display: "block", marginTop: 10 }}>
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
            />{" "}
            {t.consentText}
          </label>
          <button
            disabled={!entryId.trim() || !consented}
            onClick={() => {
              setPatientId(entryId.trim());
              const ts = getTimestamp();
              setMessages([
                { sender: "bot", text: t.greeting, timestamp: ts },
                { sender: "bot", text: t.entLocation, timestamp: ts },
              ]);
            }}
            style={buttonPrimary}
          >
            {t.beginChat}
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

            {/* Timeline Picker */}
            {showTimeline && !result && (
              <SymptomTimeline
                onSelect={handleTimelineSelect}
                onCancel={handleTimelineCancel}
                language={language}
              />
            )}

            <div ref={bottomRef}></div>
          </div>

          {error && <div style={{ color: "crimson", marginTop: 8 }}>Error: {error}</div>}

          {/* After triage - show button above input */}
          {result && (
            <div style={{ padding: "16px 24px", background: "rgba(255,255,255,0.9)", textAlign: "center" }}>
              <button onClick={resetAll} style={buttonSecondary}>
                {t.startAnother}
              </button>
            </div>
          )}

          {/* Only show input when triage not complete */}
          {!result && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {/* Suggestion Chips */}
              {messages.length > 0 && messages[messages.length - 1].sender === "bot" && (
                <SuggestionChips
                  suggestions={messages[messages.length - 1].suggestions}
                  onSelect={handleUserMessage}
                />
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <ChatInput
                    onSend={handleUserMessage}
                    placeholder={t.inputPlaceholder}
                    buttonText={t.sendButton}
                  />
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
            </div>
          )}
        </>
      )}

      {/* Footer / Copyright */}

    </div>
  );
}
/*Wiem code end*/

// Simple styles
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
