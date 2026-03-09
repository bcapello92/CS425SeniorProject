import React, { useState } from "react";
import "./Chatbot.css";
/*Wiem code start*/
const ChatInput = ({ onSend, placeholder = "Type your symptoms...", buttonText = "Send", externalValue, inputRef }) => {
  const [input, setInput] = useState("");

  // Update internal state when externalValue changes
  React.useEffect(() => {
    if (externalValue !== undefined) {
      setInput(externalValue);
    }
  }, [externalValue]);

  const handleSend = () => {
    if (input.trim() !== "") {
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
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
      />
      <button onClick={handleSend}>{buttonText}</button>
    </div>
  );
};

export default ChatInput;
/*Wiem Code end*/
