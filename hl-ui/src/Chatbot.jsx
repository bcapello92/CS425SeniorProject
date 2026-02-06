import { useState } from "react";
import ProviderTriage from "./ProviderTriage.jsx";
import PatientChatIntake from "./PatientChatIntake.jsx";
import { useAuth } from "./useAuth.jsx";
import "./Chatbot.css";

export default function Chatbot() {
    const [view, setView] = useState("provider");
    // Include 'login' from the context
    const { loading, isAuthenticated, login, logout } = useAuth();

    function handleTabClick(nextView) {
        if (nextView === "provider" && !isAuthenticated) {
            // Use the login function from the context, which is async/awaited internally
            login();
            return;
        }
        setView(nextView);
    }

    const showProvider = isAuthenticated;
    const currentView = showProvider ? view : "patient";

    return (
        <div
            style={{
                height: "100vh", // Force fixed height to enable full-height children
                overflow: "hidden", // Prevent scroll on body
                display: "flex",
                flexDirection: "column",
                // background: "transparent", // Let body gradient show through
            }}
        >
            <header
                style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: 12,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
                    background: "rgba(255, 255, 255, 0.8)",
                    backdropFilter: "blur(10px)",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                }}
            >
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={() => handleTabClick("provider")}
                        style={tab(currentView === "provider")}
                    >
                        Provider Triage
                    </button>
                    <button
                        onClick={() => handleTabClick("patient")}
                        style={tab(currentView === "patient")}
                    >
                        Patient Chat
                    </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {loading ? (
                        <span style={{ fontSize: 12, color: "#666" }}>
                            Checking login…
                        </span>
                    ) : isAuthenticated ? (
                        <>
                            <span style={{ fontSize: 12, color: "#666" }}>Logged in</span>
                            <button
                                style={tab(false)}
                                // Use the logout function from the context, which handles the redirect
                                onClick={logout}
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <button
                            style={tab(false)}
                            // Use the login function from the context
                            onClick={login}
                        >
                            Login
                        </button>
                    )}
                </div>
            </header>

            <main
                style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                    // Remove padding for patient view to allow full screen
                    padding: currentView === "patient" ? 0 : 16,
                    overflow: "hidden" // Prevent double scrollbars
                }}
            >
                {currentView === "provider" && showProvider && (
                    <div style={{ width: "100%", maxWidth: 1200 }}>
                        <ProviderTriage />
                    </div>
                )}
                {currentView === "patient" && (
                    <PatientChatIntake />
                )}
                {currentView === "provider" && !showProvider && !loading && (
                    <div style={{ marginTop: 40, textAlign: "center", color: "#555" }}>
                        You must be logged in to view the provider triage board.
                    </div>
                )}
            </main>
        </div>
    );
}

function tab(active) {
    return {
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.1)",
        background: active ? "rgba(102, 126, 234, 0.2)" : "rgba(255, 255, 255, 0.7)",
        color: active ? "#667eea" : "#555",
        fontWeight: active ? "600" : "400",
        cursor: "pointer",
        fontSize: 13,
        backdropFilter: "blur(4px)",
        transition: "all 0.2s ease"
    };
}
