@echo off
echo ==========================================
echo Starting Medical Triage Chatbot System
echo ==========================================

:: Get the directory where this script is located
set SCRIPT_DIR=%~dp0
set PROXY_DIR=%SCRIPT_DIR%healthlakeproxy
set UI_DIR=%SCRIPT_DIR%..\hl-ui

:: Start Triage API
echo Starting Triage API on port 8000...
start "Triage API" cmd /k "cd /d %SCRIPT_DIR% && python main.py"

:: Start Ollama Chat Service
echo Starting Ollama Chat Service on port 8002...
start "Ollama Service" cmd /k "cd /d %SCRIPT_DIR% && python ollama_service.py"

:: Start HealthLake Proxy (uses .env file for AWS credentials)
echo Starting HealthLake Proxy on port 4000...
start "HealthLake Proxy" cmd /k "cd /d %PROXY_DIR% && npm start"

:: Start Frontend (React/Vite)
echo Starting Frontend UI on port 5173...
start "Frontend UI" cmd /k "cd /d %UI_DIR% && npm run dev"

echo.
echo ==========================================
echo All services are starting in new windows.
echo  - Triage API:     http://localhost:8000
echo  - Ollama Service: http://localhost:8002
echo  - HL Proxy:       http://localhost:4000/health
echo  - Vite UI:        http://localhost:5173
echo.
echo Please ensure Ollama engine is running!
echo ==========================================
pause
