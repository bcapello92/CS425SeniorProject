@echo off
setlocal
echo ==========================================
echo   Medical Chatbot: Ollama + UI Mode
echo ==========================================
echo.

set "BACKEND_DIR=%~dp0Backend"
set "UI_DIR=%~dp0hl-ui"

:: 1. Start Ollama Service
echo [1/2] Starting Ollama Conversation Service...
start "Ollama Service" cmd /k "cd /d %BACKEND_DIR% && if exist .venv\Scripts\activate ( call .venv\Scripts\activate ) && python ollama_service.py"

:: 2. Start Frontend UI
echo [2/2] Starting Frontend UI...
start "Frontend UI" cmd /k "cd /d %UI_DIR% && if not exist node_modules ( echo Installing dependencies... && npm install ) && npm run dev"

echo.
echo ==========================================
echo   Services are starting!
echo.
echo   - Ollama API: http://localhost:8002
echo   - Frontend UI: http://localhost:5173
echo.
echo   Note: Triage will use the rule-based 
echo   fallback since the triage service
echo   is not running in this mode.
echo ==========================================
pause
