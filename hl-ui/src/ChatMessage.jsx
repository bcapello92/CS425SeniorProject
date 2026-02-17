import React from "react";
import "./Chatbot.css";
//wiem code
const ChatMessage = ({ sender, text, isHTML = false, timestamp }) => {
  return (
    <div className={sender === "user" ? "message-user" : "message-bot"}>
      {isHTML ? (
        <div dangerouslySetInnerHTML={{ __html: text }} />
      ) : (
        text
      )}
      {timestamp && <span className="message-timestamp">{timestamp}</span>}
    </div>
  );
};

export default ChatMessage;
