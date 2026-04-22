import json
from typing import Any, Dict, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

from voice_input.config import settings


def post_json(url: str, payload: Dict[str, Any], timeout: int) -> Tuple[int, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            try:
                return response.status, json.loads(raw)
            except json.JSONDecodeError:
                return response.status, {"raw_text": raw}
    except urllib_error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"error": raw}


def submit_to_proxy_intake(
    *,
    patient_id: Optional[str],
    age: Optional[int],
    gender: Optional[str],
    triage_answers: List[Dict[str, Any]],
    transcript: str,
) -> Dict[str, Any]:
    payload = {
        "patientId": patient_id or "voice-input-patient",
        "age": age,
        "gender": gender,
        "answers": triage_answers,
        "transcript": transcript,
    }

    status_code, response_data = post_json(
        settings.proxy_intake_url,
        payload,
        timeout=settings.http_timeout_sec,
    )

    return {
        "ok": 200 <= status_code < 300,
        "status_code": status_code,
        "target": settings.proxy_intake_url,
        "response": response_data,
    }


def submit_direct_to_triage(
    *,
    patient_id: Optional[str],
    triage_answers: List[Dict[str, Any]],
    transcript: str,
) -> Dict[str, Any]:
    payload = {
        "patient_id": patient_id or "voice-input-patient",
        "transcript": transcript,
        "answers": triage_answers,
    }

    status_code, response_data = post_json(
        settings.triage_api_url,
        payload,
        timeout=settings.http_timeout_sec,
    )

    return {
        "ok": 200 <= status_code < 300,
        "status_code": status_code,
        "target": settings.triage_api_url,
        "response": response_data,
    }


def run_image_retrieval(
    *,
    image_answers: Optional[List[Dict[str, Any]]],
    transcript: str,
) -> Dict[str, Any]:
    payload_answers = list(image_answers or [])

    if not payload_answers and transcript:
        payload_answers = [
            {
                "linkId": "voice-input",
                "question": "Voice input",
                "answer": transcript,
            }
        ]

    payload = {"answers": payload_answers}

    status_code, response_data = post_json(
        settings.image_api_url,
        payload,
        timeout=settings.http_timeout_sec,
    )

    return {
        "ok": 200 <= status_code < 300,
        "status_code": status_code,
        "target": settings.image_api_url,
        "response": response_data,
    }