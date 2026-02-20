import React, { useState } from "react";
import "./Chatbot.css";
/*Wiem code start*/
const ChatInput = ({ onSend, placeholder = "Type your symptoms...", buttonText = "Send" }) => {
  const [input, setInput] = useState("");

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
