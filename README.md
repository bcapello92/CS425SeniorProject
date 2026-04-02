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

## VM Hosting

The VM reverse proxy is configured to expose whatever is listening on `0.0.0.0:8080` at:

- `https://enttriage.unr.dev/`

Recommended deployment pattern on the VM:

1. Keep backend services private on localhost:
   - HealthLake proxy on `127.0.0.1:4000`
   - Triage API on `127.0.0.1:8000`
   - Ollama chat service on `127.0.0.1:8002`
2. Run the Vite frontend on `0.0.0.0:8080`
3. Let the Vite dev server proxy browser requests from `/api` to `127.0.0.1:4000`

Frontend env on the VM (`hl-ui/.env.local`):

```powershell
VITE_PUBLIC_ORIGIN=https://enttriage.unr.dev
VITE_API_BASE=/api
VITE_CHAT_BASE=/chat
VITE_COGNITO_DOMAIN=https://us-east-1jrkokshnh.auth.us-east-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=21hhbicb04v7vus5dmlpged4bo
VITE_COGNITO_REDIRECT_URI=https://enttriage.unr.dev/staff/callback
VITE_COGNITO_LOGOUT_URI=https://enttriage.unr.dev/
```

Backend env on the VM (`Backend/healthlakeproxy/.env`):

```powershell
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=https://enttriage.unr.dev
COGNITO_REDIRECT_URI=https://enttriage.unr.dev/staff/callback
```

Start commands on the VM:

```powershell
cd Backend\healthlakeproxy
npm start
```

```powershell
cd Backend
.venv\Scripts\activate
python ollama_service.py
```

```powershell
cd Backend
.venv\Scripts\activate
python main.py
```

```powershell
cd hl-ui
$env:PORT="8080"
npm run dev
```

Important: add `https://enttriage.unr.dev/staff/callback` and `https://enttriage.unr.dev/` to the Cognito app client's allowed callback/logout URLs or login will fail.
