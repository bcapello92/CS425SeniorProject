import React from "react";
import "./Chatbot.css";
//wiem code
const ChatMessage = ({ sender, text, isHTML = false, timestamp, onEdit }) => {
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
      {sender === "user" && onEdit && !isHTML && (
        <button
          className="message-edit-btn"
          onClick={onEdit}
          title="Edit message"
        >
          ✏️
        </button>
      )}
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
