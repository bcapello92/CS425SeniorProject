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
    setShowTimeline = null, // New: callback to show timeline picker
    getTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    language = 'en' // New: language parameter for Spanish support
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
    // 2) Background: call Ollama service
    setIsTyping(true);

    try {
        const apiMessages = uiToApiMessages(updatedMessages);
        const reply = await sendChat(apiMessages, language); // Pass language to backend

        // Detect completion marker (case-insensitive, handle both underscore and space)
        const hasCompletionMarker = reply && (
            reply.toLowerCase().includes("[complete_intake]") ||
            reply.toLowerCase().includes("[complete intake]")
        );

        // Remove the marker from display (user shouldn't see it)
        const displayText = hasCompletionMarker
            ? reply.replace(/\[complete[_\s]intake\]/gi, "").trim()
            : reply;

        // Add bot message
        const botMessage = {
            sender: "bot",
            text: displayText || "I understand. Could you tell me more about any other symptoms or how long this has been happening?",
            timestamp: getTimestamp(),
        };

        // Detect if we should show timeline picker (English and Spanish)
        if (setShowTimeline && displayText) {
            const lowerText = displayText.toLowerCase();
            const keywordMatch =
                // English — onset only (when did it START, not how long it has been)
                (lowerText.includes("when") && (
                    lowerText.includes("start") || lowerText.includes("begin") ||
                    lowerText.includes("onset") || lowerText.includes("occur") ||
                    lowerText.includes("happen") || lowerText.includes("notice") ||
                    lowerText.includes("appear") || lowerText.includes("first")
                )) ||
                lowerText.includes("since when") ||
                // Spanish — onset only
                (lowerText.includes("cuándo") && (lowerText.includes("comenzó") || lowerText.includes("empezó") || lowerText.includes("inicio") || lowerText.includes("apareció"))) ||
                (lowerText.includes("cuando") && (lowerText.includes("comenzo") || lowerText.includes("empezo") || lowerText.includes("aparecio"))) ||
                lowerText.includes("desde cuándo") ||
                lowerText.includes("desde cuando");

            if (keywordMatch) {
                setShowTimeline(true);
            }
        }

        // Generate smart suggestions
        console.log('[DEBUG] Generating suggestions with language:', language, 'for text:', displayText.substring(0, 50));
        const suggestions = getSmartSuggestions(displayText, language);
        console.log('[DEBUG] Generated suggestions:', suggestions);
        botMessage.suggestions = suggestions;

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
 * Generates smart suggestions based on the bot's message text.
 * @param {string} text - The text from the bot.
 * @param {string} language - Language code ('en' or 'es').
 * @returns {string[]} - Array of suggested responses.
 */
export const getSmartSuggestions = (text, language = 'en') => {
    if (!text) return [];
    const lower = text.toLowerCase();
    const suggestions = [];

    const isSpanish = language === 'es';

    // 1) Explicit Yes/No requests (like red flag screening)
    if (lower.includes("(yes/no)") || lower.includes("(sí/no)") || lower.includes("(si/no)")) {
        return isSpanish
            ? ["Sí", "No", "No estoy seguro/a"]
            : ["Yes", "No", "Not sure"];
    }

    // 1b) ENT location question — opening question about where symptoms are
    if (
        (lower.includes("ear") && lower.includes("nose") && lower.includes("throat")) ||
        (lower.includes("oído") || lower.includes("oido")) && (lower.includes("nariz") || lower.includes("garganta"))
    ) {
        return isSpanish
            ? ["Oído", "Nariz/Senos", "Garganta/Cuello", "Otro lugar"]
            : ["Ear", "Nose/Sinuses", "Throat/Neck", "Elsewhere"];
    }

    // 2) General Yes/No questions
    // Completion / confirmation question — always return Yes/No first
    if (
        (lower.includes("anything else") && (lower.includes("add") || lower.includes("share") || lower.includes("tell"))) ||
        lower.includes("send this to the medical team") ||
        lower.includes("enviar esto al equipo") ||
        lower.includes("equipo médico") || lower.includes("equipo medico") ||
        lower.includes("hay algo más") || lower.includes("hay algo mas") ||
        lower.includes("algo más que") || lower.includes("algo mas que")
    ) {
        return isSpanish ? ["Sí", "No", "No estoy seguro/a"] : ["Yes", "No", "Not sure"];
    }

    if (
        lower.includes("do you") || lower.includes("have you") || lower.includes("are you") || lower.includes("did you") ||
        lower.includes("tiene") || lower.includes("siente") || lower.includes("ha sentido") || lower.includes("está ") || lower.includes("esta ")
    ) {
        suggestions.push(
            isSpanish ? "Sí" : "Yes",
            isSpanish ? "No" : "No",
            isSpanish ? "No estoy seguro/a" : "Not sure"
        );
    }

    // Pain scale
    if (
        lower.includes("scale") || lower.includes("1-10") || (lower.includes("pain") && lower.includes("bad")) ||
        lower.includes("escala") || lower.includes("0-10") || lower.includes("severidad") ||
        (lower.includes("dolor") && lower.includes("grave")) || (lower.includes("qué tan") && lower.includes("grave"))
    ) {
        return isSpanish
            ? ["Leve (1-3)", "Moderado (4-6)", "Severo (7-10)"]
            : ["Mild (1-3)", "Moderate (4-6)", "Severe (7-10)"];
    }

    // Duration (if not covered by timeline picker, or as fallback)
    if (
        lower.includes("how long") || lower.includes("duration") ||
        lower.includes("cuánto tiempo") || lower.includes("cuanto tiempo") ||
        lower.includes("cuánto ha durado") || lower.includes("cuanto ha durado") ||
        lower.includes("duración") || lower.includes("duracion")
    ) {
        suggestions.push(
            isSpanish ? "Acaba de empezar" : "Just started",
            isSpanish ? "Unos días" : "A few days",
            isSpanish ? "Más de una semana" : "Over a week",
            isSpanish ? "Crónico/Largo plazo" : "Chronic/Long-term"
        );
    }

    // Fever specific
    if (lower.includes("fever") || lower.includes("temperature") ||
        lower.includes("fiebre") || lower.includes("temperatura")) {
        suggestions.push(
            isSpanish ? "Sin fiebre" : "No fever",
            isSpanish ? "Fiebre baja" : "Low grade",
            isSpanish ? "Fiebre alta (>39°C)" : "High fever (>102°F)"
        );
    }

    // Common ENT symptoms — require 'symptom' co-occurrence so 'else' alone doesn't match
    if (
        lower.includes("symptom") || lower.includes("experiencing") ||
        lower.includes("síntomas") || lower.includes("sintomas") ||
        lower.includes("experimentando") || lower.includes("otro síntoma") || lower.includes("otro sintoma")
    ) {
        suggestions.push(
            isSpanish ? "Dolor de garganta" : "Sore throat",
            isSpanish ? "Dolor de oído" : "Ear pain",
            isSpanish ? "Congestión" : "Congestion",
            isSpanish ? "Tos" : "Cough",
            isSpanish ? "Mareos" : "Dizziness"
        );
    }

    // Limit to 4 suggestions max to avoid clutter
    return suggestions.slice(0, 4);
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
