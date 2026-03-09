import React from 'react';
import './Chatbot.css';

/**
 * Renders a scrollable list of suggestion chips.
 * 
 * @param {Object} props
 * @param {string[]} props.suggestions - Array of suggestion texts
 * @param {Function} props.onSelect - Callback when a suggestion is clicked
 */
export default function SuggestionChips({ suggestions, onSelect }) {
    if (!suggestions || suggestions.length === 0) return null;

    return (
        <div className="suggestion-chips-container">
            {suggestions.map((text, index) => (
                <button
                    key={index}
                    className="suggestion-chip"
                    onClick={() => onSelect(text)}
                >
                    {text}
                </button>
            ))}
        </div>
    );
}
