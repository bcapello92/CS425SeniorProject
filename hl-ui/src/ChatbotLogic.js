import { sendChat } from "./ollamaChatClient";

/**
 * Handles the user message logic, including UI updates, smart exit triggers,
 * and background AI communication.
 * 
 * @param {Object} params - The parameters for handling the message.
 * @param {string} params.userInput - The raw text entered by the user.
 * @param {string|null} params.patientId - The ID of the current patient session.
 * @param {boolean} params.isTyping - Current typing state to prevent double submissions.
 * @param {Array} params.messages - Current conversation history.
 * @param {Function} params.setMessages - State setter for messages.
 * @param {Function} params.setIsTyping - State setter for typing status.
 * @param {Function} params.completeConversation - Callback to trigger triage/completion.
 * @param {Function} params.getTimestamp - Helper to generate formatted timestamps.
 */
export const handleUserMessage = async ({
    userInput,
    patientId,
    isTyping,
    messages,
    setMessages,
    setIsTyping,
    completeConversation,
    getTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}) => {
    const trimmed = userInput.trim();
    if (!trimmed || !patientId || isTyping) return;

    // 1) Add user message to UI immediately for responsiveness
    const userMessage = {
        sender: "user",
        text: trimmed,
        timestamp: getTimestamp(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // AI Communication
    setIsTyping(true);

    try {
        // Format history for the AI Service (FastAPI / Ollama)
        const apiMessages = updatedMessages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
        }));

        // Call the dedicated chat client
        const replyText = await sendChat(apiMessages);

        // Check for completion marker
        const COMPLETION_MARKER = "[COMPLETE_INTAKE]";
        const hasCompletionMarker = replyText && replyText.includes(COMPLETION_MARKER);

        // Strip the marker from display (user shouldn't see it)
        const displayText = hasCompletionMarker
            ? replyText.replace(COMPLETION_MARKER, "").trim()
            : replyText;

        // Add bot message
        const botMessage = {
            sender: "bot",
            text: displayText || "I understand. Could you tell me more about any other symptoms or how long this has been happening?",
            timestamp: getTimestamp(),
        };

        setMessages((prev) => [...prev, botMessage]);

        // Auto-trigger triage submission if marker detected
        if (hasCompletionMarker && completeConversation) {
            setIsTyping(false); // Hide typing indicator before triage submission
            const finalMessages = [...updatedMessages, botMessage];
            await completeConversation(finalMessages);
        }
    } catch (err) {
        console.error("Chatbot logic error:", err);

        // Graceful error handling in the chat UI
        setMessages((prev) => [
            ...prev,
            {
                sender: "bot",
                text: "I'm having a bit of trouble connecting to my brain right now. Could you repeat that or tell me when these symptoms first started?",
                timestamp: getTimestamp(),
            },
        ]);
    } finally {
        setIsTyping(false);
    }
};

/**
 * Converts UI message objects to the format expected by the backend API.
 */
export const uiToApiMessages = (uiMessages) => {
    return uiMessages
        .filter((m) => m && typeof m.text === "string" && m.text.trim() !== "")
        .map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
        }));
};

/**
 * Builds a plain-text transcript from the conversation history.
 */
export const buildTranscript = (uiMessages) => {
    return uiMessages
        .filter((m) => m && typeof m.text === "string" && m.text.trim() !== "")
        .map((m) => `${m.sender === "user" ? "Patient" : "Assistant"}: ${m.text}`)
        .join("\n");
};
