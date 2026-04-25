import React, { useState } from "react";
import "./Chatbot.css";
/*Wiem code start*/
const ChatInput = ({
  onSend,
  placeholder = "Type your symptoms...",
  buttonText = "Send",
  externalValue,
  inputRef,
  onToggleVoice,
  voiceEnabled = false,
  isRecording = false,
  disabled = false,
}) => {
  const [input, setInput] = useState("");

  // Update internal state when externalValue changes
  React.useEffect(() => {
    if (externalValue !== undefined) {
      setInput(externalValue);
    }
  }, [externalValue]);

  const handleSend = () => {
    if (!disabled && input.trim() !== "") {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="chat-input">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
      />
      {voiceEnabled ? (
        <button
          type="button"
          onClick={onToggleVoice}
          style={{
            background: isRecording ? "#b91c1c" : "#1d4ed8",
            minWidth: 54,
          }}
        >
          {isRecording ? "Stop" : "Mic"}
        </button>
      ) : null}
      <button onClick={handleSend}>{buttonText}</button>
    </div>
  );
};

export default ChatInput;
/*Wiem Code end*/
