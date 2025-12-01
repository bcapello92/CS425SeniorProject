@echo off
setlocal enabledelayedexpansion

:: =======================
:: CONFIG — EDIT ME
:: =======================
set DEFAULT_PROFILE=hl-dev
set DEFAULT_REGION=us-east-1

:: Paths (no trailing slash)
set PROXY_DIR=C:\Users\Brendan\OneDrive\Documents\GitHub\CS425SeniorProject\Backend\healthlakeproxy
set UI_DIR=C:\Users\Brendan\OneDrive\Documents\GitHub\CS425SeniorProject\hl-ui\src

:: Python service root (where .venv and triage_model_server.py live)
set PY_DIR=C:\Users\Brendan\OneDrive\Documents\GitHub\CS425SeniorProject\Backend

:: Uvicorn module:variable (e.g., "triage_model_server:app")
set UVICORN_APP=triage_model_server:app
set UVICORN_PORT=8001

:: =======================
:: PROMPT FOR SSO PROFILE/REGION (with defaults)
:: =======================
set PROFILE_INPUT=
set REGION_INPUT=
set /p PROFILE_INPUT=AWS profile [%DEFAULT_PROFILE%]:
if "%PROFILE_INPUT%"=="" set PROFILE_INPUT=%DEFAULT_PROFILE%
set /p REGION_INPUT=AWS region [%DEFAULT_REGION%]:
if "%REGION_INPUT%"=="" set REGION_INPUT=%DEFAULT_REGION%

echo.
echo === Step 1: AWS SSO login for profile "%PROFILE_INPUT%" ===
aws sso login --profile %PROFILE_INPUT%
if errorlevel 1 (
  echo.
  echo [ERROR] aws sso login failed. Fix SSO then re-run.
  pause
  exit /b 1
)

:: Clear any stale static keys from env (avoid "invalid token" issues)
set AWS_ACCESS_KEY_ID=
set AWS_SECRET_ACCESS_KEY=
set AWS_SESSION_TOKEN=

:: Export the profile/region for child processes
set AWS_PROFILE=%PROFILE_INPUT%
set AWS_SDK_LOAD_CONFIG=1
set AWS_REGION=%REGION_INPUT%

echo.
echo === Verifying STS identity ===
aws sts get-caller-identity --profile %AWS_PROFILE%
if errorlevel 1 (
  echo.
  echo [ERROR] STS failed — profile/SSO not usable in this shell.
  pause
  exit /b 1
)

echo.
echo === Step 2: Starting services ===

:: =======================
:: Node proxy (HealthLake)
:: =======================
if exist "%PROXY_DIR%\package.json" (
  echo - Starting HealthLake proxy in new window...
  start "HL Proxy" cmd /k ^
    "cd /d %PROXY_DIR% && ^
     set AWS_PROFILE=%AWS_PROFILE% && ^
     set AWS_SDK_LOAD_CONFIG=1 && ^
     set AWS_REGION=%AWS_REGION% && ^
     npm run dev"
) else (
  echo [WARN] Proxy folder not found: %PROXY_DIR%
)

:: =======================
:: Vite UI
:: =======================
if exist "%UI_DIR%\package.json" (
  echo - Starting Vite UI in new window...
  start "Vite UI" cmd /k ^
    "cd /d %UI_DIR% && npm run dev"
) else (
  echo [WARN] UI folder not found: %UI_DIR%
)

:: =======================
:: Python Uvicorn (.venv)
:: =======================
if exist "%PY_DIR%\.venv\Scripts\activate.bat" (
  echo - Starting Uvicorn classifier in new window...
  start "Classifier (Uvicorn)" cmd /k ^
    "cd /d %PY_DIR% && ^
     call .venv\Scripts\activate && ^
     python --version && ^
     uvicorn %UVICORN_APP% --host 0.0.0.0 --reload --port %UVICORN_PORT%"
) else (
  echo [WARN] No .venv found at %PY_DIR%\.venv . Skipping Uvicorn.
  echo       Create it with:
  echo          cd /d %PY_DIR%
  echo          python -m venv .venv
  echo          .venv\Scripts\activate
  echo          pip install uvicorn fastapi transformers torch (etc.)
)

echo.
echo === All launch commands issued. Windows opened:
echo  - HL Proxy:   http://localhost:4000/health  and  /diag/hl-ping
echo  - Vite UI :   http://localhost:5173
echo  - Uvicorn :   http://localhost:%UVICORN_PORT%/docs (if FastAPI docs enabled)
echo.
echo NOTE: If the proxy shows "Could not load credentials", make sure you ran THIS .bat (SSO+env) and not a different terminal.
echo.
pause
endlocal
