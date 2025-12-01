import React, { useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import "./App.css";
import { useEffect, useRef } from "react";

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

const Chatbot = () => {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text:
        " Hello! I’m your ENT assistant. Let’s go through a few quick questions about your symptoms."
    },
    { sender: "bot", text: questions[0] }
  ]);

  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  // Typing feature
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);
  // auto scrolling
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleUserMessage = async (userInput) => {
    const newMessages = [...messages, { sender: "user", text: userInput }];
    setMessages(newMessages);

    const newAnswers = { ...answers, [questions[currentQuestion]]: userInput };
    setAnswers(newAnswers);

    if (currentQuestion + 1 < questions.length) {

      const nextQuestion = questions[currentQuestion + 1];

  //  Start typing animation
      setIsTyping(true);

        setTimeout(() => {
    //  Bot sends the next question
        setMessages([...newMessages, { sender: "bot", text: nextQuestion }]);
        setCurrentQuestion(currentQuestion + 1);

    //  Stop typing animation
        setIsTyping(false);
      }, 900);
    } else {
      // All questions answered
      setTimeout(async () => {
        const thinkingMessages = [
          ...newMessages,
          { sender: "bot", text: "Thank you! I’m analyzing your responses..." }
        ];
        setMessages(thinkingMessages);

        try {
          const response = await fetch("http://172.22.140.123:8000/triage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symptom_text: Object.values(newAnswers).join(". ")
            })
          });

          const data = await response.json();
          console.log("Backend returned:", data);

          const triage = (data.triage || "").toLowerCase();

          let severityLabel = "";
          if (triage === "severe") {
            severityLabel =
              `<button class="severity-btn emergency">🚨 Severe</button>`;
          } else if (triage === "urgent") {
            severityLabel =
              `<button class="severity-btn semi-urgent">⚠️ Urgent</button>`;
          } else if (triage === "moderate") {
            severityLabel =
              `<button class="severity-btn semi-urgent">🟡 Moderate</button>`;
          } else {
            severityLabel =
              `<button class="severity-btn non-urgent">✅ Routine</button>`;
          }

          const botReply = `
            <div class="severity-container">
              ${severityLabel}
              <p>Based on your responses, your case is classified as <strong>${triage}</strong>.</p>
            </div>
          `;

          setMessages([
            ...thinkingMessages,
            { sender: "bot", text: botReply, isHTML: true }
          ]);

        } catch (error) {
          console.error("Backend error:", error);
          setMessages([
            ...newMessages,
            {
              sender: "bot",
              text: " Sorry, I couldn’t connect to the analysis system right now."
            }
          ]);
        }
      }, 1000);
    }
  };

  return (
    <div className="chatbot-wrapper">
      <header className="chatbot-header">
        <img src="/logo.png" alt="ENT Logo" className="logo" />
        <h1>ENT Patient Support Chatbot</h1>
      </header>

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
        {/* Auto scrolling */}
        <div ref={bottomRef}></div>
      </div>


      <ChatInput onSend={handleUserMessage} />
    </div>
  );
};

export default Chatbot;
