@echo off
echo Restarting Ollama...

REM Kill any existing Ollama processes
taskkill /F /IM ollama.exe /T 2>nul
timeout /t 2 /nobreak >nul

REM Start Ollama fresh
echo Starting Ollama service...
start "Ollama Service" ollama serve

timeout /t 3 /nobreak >nul
echo.
echo Ollama is restarting. Testing connection...
timeout /t 2 /nobreak >nul

REM Test with a simple query
ollama run llama3.2:3b "Hi" --verbose

echo.
echo Ollama should now be ready!
echo Press any key to close this window...
pause >nul
