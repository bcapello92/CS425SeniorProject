@echo off
echo ==========================================
echo Starting Medical Triage Chatbot System
echo ==========================================

:: Base paths
set SCRIPT_DIR=%~dp0
set PROXY_DIR=%SCRIPT_DIR%healthlakeproxy
set UI_DIR=%SCRIPT_DIR%..\hl-ui
set IMG_DIR=%SCRIPT_DIR%imageRetrieval
set REPO_DIR=%SCRIPT_DIR%..

:: Dataset/index defaults for image retrieval
set IMAGE_DATA_ROOT=%IMG_DIR%\data
set IMAGE_INDEX_ROOT=%IMG_DIR%\index

:: Resolve venv Scripts dir (prefer Backend\.venv, then repo-root .venv)
set VENV_SCRIPTS=
if exist "%SCRIPT_DIR%.venv\Scripts\activate.bat" set VENV_SCRIPTS=%SCRIPT_DIR%.venv\Scripts
if "%VENV_SCRIPTS%"=="" if exist "%REPO_DIR%\.venv\Scripts\activate.bat" set VENV_SCRIPTS=%REPO_DIR%\.venv\Scripts
if "%VENV_SCRIPTS%"=="" (
  echo ERROR: Could not find .venv activate script.
  echo Checked:
  echo   %SCRIPT_DIR%.venv\Scripts\activate.bat
  echo   %REPO_DIR%\.venv\Scripts\activate.bat
  pause
  exit /b 1
)

:: Start Triage API
echo Starting Triage API on port 8000...
start "Triage API" cmd /k "cd /d %VENV_SCRIPTS% && call activate && cd /d %SCRIPT_DIR% && python triage_model_server.py"

:: Start Ollama Chat Service
echo Starting Ollama Chat Service on port 8002...s
start "Ollama Service" cmd /k "cd /d %VENV_SCRIPTS% && call activate && cd /d %SCRIPT_DIR% && uvicorn ollama_service:app --host 127.0.0.1 --port 8002"

:: Start Image Retrieval Service
echo Starting Image Retrieval Service on port 8001...
start "Image Retrieval" cmd /k "cd /d %VENV_SCRIPTS% && call activate && cd /d %IMG_DIR% && set ""IMAGE_DATA_DIR=%IMAGE_DATA_ROOT%"" && set ""IMAGE_INDEX_DIR=%IMAGE_INDEX_ROOT%"" && uvicorn imageRetrieval_server:app --host 127.0.0.1 --port 8001"

:: Start HealthLake Proxy (uses .env file for AWS credentials)
echo Starting HealthLake Proxy on port 4000...
start "HealthLake Proxy" cmd /k "cd /d %PROXY_DIR% && npm start"

:: Start Frontend (React/Vite)
echo Starting Frontend UI on port 5173...
start "Frontend UI" cmd /k "cd /d %UI_DIR% && npm run dev"

echo.
echo ==========================================
echo All services are starting in new windows.
echo  - Triage API:      http://localhost:8000
echo  - Ollama Service:  http://localhost:8002/health
echo  - Image Retrieval: http://127.0.0.1:8001/health
echo  - HL Proxy:        http://localhost:4000/health
echo  - Vite UI:         http://localhost:5173
echo  - Image Data Dir:  %IMAGE_DATA_ROOT%
echo ==========================================
pause
