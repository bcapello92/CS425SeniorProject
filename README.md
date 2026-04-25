# CS425SeniorProject

AI Triage application with:
- `hl-ui` (Vite React frontend)
- `Backend/healthlakeproxy` (Node/Express AWS HealthLake + Cognito proxy)
- `Backend` FastAPI services (triage API + Ollama chat service)

## Install (Fresh System / Windows)

### 1. Install required software

- **AWS CLI v2** (required for AWS SSO login)
- **Node.js LTS** (includes `npm`)
- **Python 3.11.9** (pinned in `.python-version`)
- **Ollama** (local chat model runtime)

Recommended versions:
- Node.js: `20.x LTS`
- Python: `3.11.9`

### 2. Configure AWS SSO (IAM Identity Center)

Set up your AWS profile (example profile name used by this project is `hl-dev`):

```powershell
aws configure sso --profile hl-dev
```

Then log in:

```powershell
aws sso login --profile hl-dev
aws sts get-caller-identity --profile hl-dev
```

### 3. Clone and install Node dependencies

Frontend UI:

```powershell
cd hl-ui
npm install
```

HealthLake/Cognito proxy:

```powershell
cd ..\Backend\healthlakeproxy
npm install
```

### 4. Set up Python environment (Backend)

From the repo root:

```powershell
cd Backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install uvicorn fastapi pydantic httpx torch transformers peft
```

Note: `uvicorn` is required to run the FastAPI services. The ML packages (`torch`, `transformers`, `peft`) are used by the triage classifier.

### 5. Install test dependencies (pytest)

Install test tooling into the same `Backend` virtual environment:

```powershell
cd Backend
.venv\Scripts\activate
pip install pytest pytest-mock pytest-cov
```

Optional: verify pytest is available

```powershell
pytest --version
```

Test scaffolding and planning docs are included in:
- `pytest.ini`
- `TEST_PLAN.md`

### 6. Install and prepare Ollama

Install Ollama, make sure it is running, then pull the model used by the chatbot:

```powershell
ollama pull llama3.2:3b
```

### 7. Configure local environment variables

Create/fill these files with your team/project values:
- `Backend/healthlakeproxy/.env`
- `hl-ui/.env.local`

Required AWS-related values include:
- `AWS_PROFILE`
- `AWS_REGION` / `REGION`
- `DATASTORE_ID` (HealthLake datastore)
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_DOMAIN`
- `COGNITO_REDIRECT_URI`

## AWS Resources Required

This app expects access to:
- **AWS IAM Identity Center (SSO)** profile
- **AWS STS** (credential verification)
- **AWS HealthLake** datastore
- **Amazon Cognito User Pool** + App Client + Hosted UI domain
- Cognito groups (for example `admin`, `provider`/staff/medical)

The SSO role used locally should allow:
- HealthLake datastore API access (FHIR read/write)
- Cognito admin actions used by the proxy (user lookup/create/delete/group assignment)

## Run Locally

### Option A: Use the startup script

From the repo root:

```powershell
.\startUp.bat
```

This script:
- prompts for AWS profile/region
- runs `aws sso login`
- verifies identity with STS
- starts the HealthLake proxy
- starts the Vite UI
- starts the Python Uvicorn service (if `Backend\.venv` exists)

### Option B: Start services manually

1. Backend triage API (`Backend`, port `8000`)

```powershell
cd Backend
.venv\Scripts\activate
python main.py
```

2. Ollama chat service (`Backend`, port `8002`)

```powershell
cd Backend
.venv\Scripts\activate
python ollama_service.py
```

3. HealthLake proxy (`Backend/healthlakeproxy`, port `4000`)

```powershell
cd Backend\healthlakeproxy
$env:AWS_PROFILE="hl-dev"
$env:AWS_SDK_LOAD_CONFIG="1"
$env:AWS_REGION="us-east-1"
npm run dev
```

4. Frontend UI (`hl-ui`, usually port `5173`)

```powershell
cd hl-ui
npm run dev
```

## Local URLs

- UI: `http://localhost:5173`
- HealthLake proxy: `http://localhost:4000`
- Triage API: `http://localhost:8000`
- Ollama service: `http://localhost:8002`

## Web Hosting

The VM reverse proxy is configured to expose whatever is listening on `0.0.0.0:8080` at:

- `https://enttriage.unr.dev/`

The hosted website runs the frontend and HealthLake/Cognito proxy on the VM. The model workloads run separately on a Tailscale-connected machine:

- `enttriage.unr.dev` VM:
  - HealthLake proxy on `127.0.0.1:4000`
  - Vite frontend on `0.0.0.0:8080`
  - Vite proxies `/api` to `127.0.0.1:4000`
- Tailscale model host:
  - Triage API on Tailscale HTTPS port `8443`
  - Chat service on Tailscale HTTPS port `8444`
  - Image retrieval on Tailscale HTTPS port `8445`
  - Voice input service on Tailscale HTTPS port `8446`

Frontend env on the VM (`hl-ui/.env.local`):

```powershell
VITE_PUBLIC_ORIGIN=https://enttriage.unr.dev
VITE_API_BASE=/api
VITE_CHAT_BASE=/chat
VITE_VOICE_BASE=/voice-api
VITE_DEV_CHAT_TARGET=https:
VITE_DEV_VOICE_TARGET=
VITE_COGNITO_DOMAIN=https://us-east-1jrkokshnh.auth.us-east-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=
VITE_COGNITO_REDIRECT_URI=https://enttriage.unr.dev/staff/callback
VITE_COGNITO_LOGOUT_URI=https://enttriage.unr.dev/
```

Backend env on the VM (`Backend/healthlakeproxy/.env`):

```powershell
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=https://enttriage.unr.dev
COGNITO_REDIRECT_URI=https://enttriage.unr.dev/staff/callback
MODEL_URL=https:
CHAT_SERVICE_URL=https:
IMAGE_RETRIEVAL_URL=https:
```

Start the proxy on the VM:

```powershell
cd Backend\healthlakeproxy
npm start
```

Start the website on the VM:

```powershell
cd hl-ui
$env:PORT="8080"
npm run dev
```

Do not start the triage API, chat service, or image retrieval service on the website VM for the hosted deployment. Those services should be running on the Tailscale model host, and the VM proxy/frontend should point at the Tailscale URLs above.

Important: add `https://enttriage.unr.dev/staff/callback` and `https://enttriage.unr.dev/` to the Cognito app client's allowed callback/logout URLs or login will fail.

## Tailscale Model Hosting

If you want to run the model-serving workloads on a separate GPU machine and let the rest of the app reach them over Tailscale, keep the services bound to `127.0.0.1` on the GPU host and publish them with `tailscale serve`.

Prerequisites on the GPU host:

- Tailscale installed and connected to your tailnet
- HTTPS enabled for Tailscale Serve
- `Backend\.venv` or repo-root `.venv` present
- Ollama running locally on that machine

Start the stack from the repo root on the Tailscale model host:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_tailscale_model_services.ps1
```

That script:

- starts the triage API on `127.0.0.1:8000`
- starts the chat service on `127.0.0.1:8002`
- starts the image retrieval service on `127.0.0.1:8001`
- starts the voice input service on `127.0.0.1:8003`
- publishes them privately to your tailnet with Tailscale Serve on HTTPS ports `8443`, `8444`, `8445`, and `8446`

The resulting URLs look like:

```powershell
https://your-gpu-host.your-tailnet.ts.net:8443/triage
https://your-gpu-host.your-tailnet.ts.net:8444/chat
https://your-gpu-host.your-tailnet.ts.net:8445/search-images
https://your-gpu-host.your-tailnet.ts.net:8446/health
```

To consume those services from another machine, set:

- `MODEL_URL=https://your-gpu-host.your-tailnet.ts.net:8443`
- `CHAT_SERVICE_URL=https://your-gpu-host.your-tailnet.ts.net:8444`
- `IMAGE_RETRIEVAL_URL=https://your-gpu-host.your-tailnet.ts.net:8445`

For the hosted public website, keep browser requests on the website origin and proxy them through Vite:

- `VITE_CHAT_BASE=/chat`
- `VITE_VOICE_BASE=/voice-api`
- `VITE_DEV_CHAT_TARGET=https://your-gpu-host.your-tailnet.ts.net:8444`
- `VITE_DEV_VOICE_TARGET=https://your-gpu-host.your-tailnet.ts.net:8446`

`/voice-api` is configured as a websocket-capable proxy to the Tailscale voice service, so public users on `enttriage.unr.dev` do not need Tailscale installed in their browser/device.


