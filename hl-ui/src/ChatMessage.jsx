import React from "react";
import "./App.css";
//wiem code
const ChatMessage = ({ sender, text, isHTML = false }) => {
  return (
    <div className={sender === "user" ? "message-user" : "message-bot"}>
      {isHTML ? (
        <div dangerouslySetInnerHTML={{ __html: text }} />
      ) : (
        text
      )}
    </div>
  );
};

export default ChatMessage;
