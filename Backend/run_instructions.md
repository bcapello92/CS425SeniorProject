# Running the Medical Triage Chatbot

Follow these steps to start the backend services and the frontend UI.

## 0. Prerequisite: Ollama
The chatbot uses Ollama for conversational intelligence.
1.  Ensure **Ollama** is installed and running on your machine.
2.  Pull the required model:
    ```powershell
    ollama pull llama3.2:3b
    ```

## 1. Start the Backend Services

The backend consists of three services:
- **Triage API** (Port 8000): Handles ML-powered classification.
- **Ollama Service** (Port 8002): Handles conversational chat.
- **HealthLake Proxy**: Handles secure communication with AWS HealthLake.


### Start Triage API
1.  Open a terminal in the `Backend` directory.
2.  Run the Triage API:
    ```powershell
    python main.py
    ```

### Start Ollama Service
1.  Open a **new** terminal in the `Backend` directory.
2.  Run the Ollama Chat Service:
    ```powershell
    python ollama_service.py
    ```

### Start HealthLake Proxy
1.  Open a **new** terminal in the `Backend/healthlakeproxy` directory.
2.  Set the environment variables (required for AWS credentials):
    ```powershell
    $env:AWS_PROFILE="hl-dev"
    $env:AWS_SDK_LOAD_CONFIG="1"
    $env:AWS_REGION="us-east-1"
    ```
3.  Run the Proxy:
    ```powershell
    npm start
    ```


## 2. Start the Frontend UI

The frontend is a React application built with Vite.

1.  Open a **new** terminal in the `hl-ui` directory.
2.  Install dependencies (if not already done):
    ```powershell
    npm install
    ```
3.  Start the development server:
    ```powershell
    npm run dev
    ```
4.  Open your browser to the URL shown in the terminal (usually `http://localhost:5173`).

## 3. Verify the Connection

1.  Once all services are running, go to the chatbot UI in your browser.
2.  Enter some symptoms (e.g., "I have a sharp pain in my chest").
3.  Verify the bot responds with a follow-up question. If you see "I'm having trouble right now", ensure the Ollama engine is running and you have the model pulled.
