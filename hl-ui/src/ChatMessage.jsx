import React from "react";
import "./Chatbot.css";
//wiem code
const ChatMessage = ({ sender, text, isHTML = false, timestamp }) => {
  // Render \n as actual line breaks for plain text messages
  const renderText = (t) =>
    t.split("\n").map((line, i, arr) => (
      <React.Fragment key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </React.Fragment>
    ));

  return (
    <div className={sender === "user" ? "message-user" : "message-bot"}>
      {isHTML ? (
        <div dangerouslySetInnerHTML={{ __html: text }} />
      ) : (
        renderText(text)
      )}
      {timestamp && <span className="message-timestamp">{timestamp}</span>}
    </div>
  );
};

export default ChatMessage;
