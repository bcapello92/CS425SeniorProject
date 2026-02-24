# Test Plan (Pytest Roadmap)

This project has three major test lanes:
- backend/unit correctness
- API/web behavior
- triage model quality/regression

The goal is to add `pytest` incrementally, starting with fast local tests and expanding to integration and evaluation coverage.

## Testing Goals

- Catch regressions in backend logic and request validation.
- Verify API behavior used by the web UI.
- Track triage model quality over time (accuracy and safety-sensitive recall).
- Keep local developer feedback fast.

## Recommended Tools

- `pytest` (main test runner)
- `pytest-mock` (mocking helpers, optional)
- `httpx` (API requests / async tests)
- `fastapi.testclient` (FastAPI endpoint tests)
- `pytest-cov` (coverage reporting, later)

Optional later:
- `playwright` for browser E2E tests (frontend/UI flows)
- Node test runner (`vitest` or `jest`) for direct unit tests of `Backend/healthlakeproxy`

## Test Scope

## 1. Unit Tests (`tests/unit`)

Focus on pure Python logic and deterministic helpers.

Initial targets:
- `Backend/deidentify_triage.py`
  - removes expected PII patterns
  - preserves clinically relevant content
- `Backend/pii_removal.py`
  - text normalization / redaction edge cases
- request payload validation helpers (if refactored into pure functions)
- formatting/template helpers used for prompts or outputs

Characteristics:
- no AWS calls
- no Ollama calls
- no model loading
- fast runtime

## 2. API / Integration Tests (`tests/api`)

Test HTTP behavior that the frontend relies on.

### FastAPI services (pytest-native)

Targets:
- `Backend/main.py`
- `Backend/ollama_service.py`

Coverage outline:
- valid request returns expected status and response shape
- invalid payload returns validation error (`422` or app-defined error)
- dependency failure paths return safe errors
- CORS/health endpoints (if added) behave as expected

### HealthLake Proxy (Node/Express)

Use `pytest` as a black-box HTTP client first (start service locally and call endpoints).

Coverage outline:
- unauthenticated access is rejected on protected routes
- audit endpoints return expected schema
- admin routes enforce permissions
- proxy diagnostic/health endpoints return useful status
- AWS/Cognito failures return safe messages (no secret leakage)

Note:
- Direct unit tests of proxy internals are better served by a JS test runner later.

## 3. Model Evaluation / Regression Tests (`tests/eval`)

This is separate from API correctness. These tests protect model quality.

### A. Golden Dataset Regression

Create a fixed dataset (JSONL/CSV) with:
- symptom text
- expected triage label (or accepted top-N labels)
- optional severity/risk flags
- optional notes for why the label is expected

Metrics to track:
- overall accuracy
- macro F1 (if class imbalance exists)
- per-class recall
- critical-class recall (high acuity / emergency)

Pass/fail should be based on thresholds and regression bounds, not only one metric.

### B. Safety / Must-Pass Cases

Curated high-risk scenarios that should not regress:
- chest pain + shortness of breath
- stroke-like symptoms
- severe bleeding
- suicidal ideation / self-harm
- pediatric red flags (if in scope)

These can be hard pass/fail regression checks.

### C. Robustness Cases

Cases for resilience and UX quality:
- typos / abbreviations (`SOB`, `CP`)
- short vague inputs
- long verbose inputs
- contradictory statements
- noisy punctuation/casing

### D. Performance (Optional)

- local inference latency budget
- timeout behavior under slow model load
- memory usage (best-effort, later)

## Mocking Strategy

Mock in most local tests:
- AWS HealthLake
- Cognito admin calls
- STS
- Ollama HTTP calls

Test for real in local tests where practical:
- FastAPI request validation
- response schemas
- local SQLite audit DB behavior (temporary DB path)

Use real AWS only in explicitly marked tests (e.g., `@pytest.mark.aws`) and keep them out of default runs.

## Proposed Pytest Markers

- `unit` : pure logic tests
- `api` : HTTP/API behavior tests
- `eval` : model quality/regression tests
- `slow` : expensive tests
- `aws` : hits real AWS services
- `localmodel` : loads local model weights / heavy inference

## Suggested Execution Modes

Fast local feedback:

```powershell
pytest -m "unit or api" -k "not slow"
```

Model regression suite only:

```powershell
pytest -m eval
```

Exclude real AWS in normal runs:

```powershell
pytest -m "not aws"
```

## Data and Baseline Decisions (To Finalize)

Before writing model eval tests, define:
- label set and class mapping used for evaluation
- baseline metrics (current model version)
- acceptance thresholds (minimum accuracy / recall)
- regression tolerance (e.g., no >X% drop in critical recall)
- versioning for evaluation datasets

## Phased Adoption Plan

### Phase 1 (start here)
- Add `pytest` config and markers
- Add unit tests for de-identification / text handling
- Add FastAPI API tests with mocked model/Ollama calls

### Phase 2
- Add proxy black-box API tests (local service process)
- Add SQLite audit behavior tests (temp DB)

### Phase 3
- Add model regression dataset and threshold-based eval tests
- Add CI jobs with separate fast and slow/eval lanes

### Phase 4 (optional)
- Add Playwright UI E2E tests for key user flows

## CI Recommendation (Later)

Split CI into multiple jobs:
- `unit-api-fast` (default on PRs)
- `proxy-integration` (optional / gated)
- `model-eval` (scheduled or manual if heavy)
- `aws-smoke` (manual, protected credentials only)

This keeps PR feedback fast while preserving deeper validation paths.
