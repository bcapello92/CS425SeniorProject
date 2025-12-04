import React, { useState, useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import { triageClient } from "./triageClient";
import "./App.css"; 

const questions = [
  "What main symptom are you experiencing?",
  "How long have you had this symptom?",
  "Would you describe your pain as mild, moderate, or severe?",
  "Is your symptom getting better or worse?",
  "What makes your symptoms worse?",
  "What makes your symptoms better?",
  "Do you have any underlying conditions (like diabetes or immune issues)?",
  "Are there other symptoms occurring at the same time?",
  "Do you have any test results or findings (like swelling or neck mass)?"
];

export default function PatientChatIntake() {
  // ---------- patient + consent ----------
  const [entryId, setEntryId] = useState("");
  const [patientId, setPatientId] = useState(null);
  const [consented, setConsented] = useState(false);

  // ---------- chat state ----------
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text:
        "👋 Hello! I’m your ENT assistant. Let’s go through a few quick questions about your symptoms."
    },
    { sender: "bot", text: questions[0] }
  ]);
  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  // ---------- triage state ----------
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const hasStartedChat = patientId !== null;

  function resetAll() {
    setEntryId("");
    setPatientId(null);
    setConsented(false);
    setMessages([
      {
        sender: "bot",
        text:
          "👋 Hello! I’m your ENT assistant. Let’s go through a few quick questions about your symptoms."
      },
      { sender: "bot", text: questions[0] }
    ]);
    setAnswers({});
    setCurrentQuestion(0);
    setIsTyping(false);
    setSubmitting(false);
    setResult(null);
    setError(null);
  }

  // ---------- handle chat answers ----------
  const handleUserMessage = async (userInput) => {
    const trimmed = userInput.trim();
    if (!trimmed || !patientId) return;

    const newMessages = [...messages, { sender: "user", text: trimmed }];
    setMessages(newMessages);

    // store answer by question text
    const qText = questions[currentQuestion];
    const newAnswers = { ...answers, [qText]: trimmed };
    setAnswers(newAnswers);

    // If there is a next question, ask it
    if (currentQuestion + 1 < questions.length) {
      const nextQuestion = questions[currentQuestion + 1];

      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...newMessages,
          { sender: "bot", text: nextQuestion }
        ]);
        setCurrentQuestion((prev) => prev + 1);
        setIsTyping(false);
      }, 900);
      return;
    }

    // ---------- all questions answered: send to triage pipeline ----------
    setIsTyping(true);
    setTimeout(async () => {
      const thinkingMessages = [
        ...newMessages,
        {
          sender: "bot",
          text: "Thank you! I’m analyzing your responses and sending them for triage..."
        }
      ];
      setMessages(thinkingMessages);
      setIsTyping(false);
      setSubmitting(true);
      setError(null);

      try {
        // Build answers array for /api/intake
        const answersArray = questions.map((q) => ({
          linkId: q,
          text: q,
          answer: newAnswers[q] || ""
        }));

        // Build transcript
        const transcriptLines = questions.map(
          (q) => `Q: ${q}\nA: ${newAnswers[q] || ""}`
        );
        const transcript = transcriptLines.join("\n");

        const data = await triageClient.submitIntake({
          patientId,
          answers: answersArray,
          transcript
        });

        // data: { id, color, rationale, answers }
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
        } else {
          triageLabel = "routine";
          severityClass = "non-urgent";
          emoji = "✅";
        }

        const botReply = `
          <div class="severity-container">
            <button class="severity-btn ${severityClass}">${emoji} ${triageLabel.charAt(0).toUpperCase() +
          triageLabel.slice(1)
        }</button>
            <p>Based on your responses, your case is classified as <strong>${triageLabel}</strong>.</p>
            <p><strong>Reasoning:</strong> ${data.rationale || "No rationale provided."}</p>
          </div>
        `;

        setMessages([
          ...thinkingMessages,
          { sender: "bot", text: botReply, isHTML: true }
        ]);
      } catch (err) {
        console.error("Triage error:", err);
        setError(err.message || "Failed to submit for triage.");
        setMessages([
          ...newMessages,
          {
            sender: "bot",
            text:
              "❌ Sorry, I couldn’t submit your responses for triage. Please try again."
          }
        ]);
      } finally {
        setSubmitting(false);
      }
    }, 1000);
  };

  // ---------- UI ----------
  return (
    <div className="chatbot-wrapper">
      <header className="chatbot-header">
        <img src="/logo.png" alt="ENT Logo" className="logo" />
        <h1>ENT Patient Support Chatbot</h1>
      </header>

      {/* Start screen for patient ID + consent */}
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
      {hasStartedChat && !result && (
        <>
          <div className="chat-window">
            {messages.map((msg, index) => (
              <ChatMessage
                key={index}
                sender={msg.sender}
                text={msg.text}
                isHTML={msg.isHTML}
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

          {error && (
            <div style={{ color: "crimson", marginTop: 8 }}>Error: {error}</div>
          )}

          <ChatInput onSend={handleUserMessage} />
        </>
      )}

      {/* After triage result you can show a reset button */}
      {result && (
        <div style={{ marginTop: 16 }}>
          <button onClick={resetAll} style={buttonSecondary}>
            Start another intake
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- simple inline styles to match your app ----------
const card = {
  margin: "16px auto",
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 12,
  background: "#fff",
  width: "100%",
  maxWidth: 480,
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
