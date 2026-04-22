import base64
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from voice_input.config import settings
from voice_input.schemas import ReviewRequest, SubmitVoiceRequest
from voice_input.services.submission import (
    run_image_retrieval,
    submit_direct_to_triage,
    submit_to_proxy_intake,
)
from voice_input.services.transcription import transcribe_pcm_bytes
from voice_input.services.workflow import build_text_workflow_payload

router = APIRouter()


@router.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "voice-input",
        "submit_strategy": settings.submit_strategy,
        "proxy_intake_url": settings.proxy_intake_url,
        "triage_api_url": settings.triage_api_url,
        "image_api_url": settings.image_api_url,
        "image_retrieval_enabled": settings.enable_image_retrieval,
    }


@router.websocket("/ws/voice-stream")
async def voice_stream(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_text(
        json.dumps(
            {
                "type": "connected",
                "message": "Voice stream connected",
            }
        )
    )

    sample_rate = 16000
    pcm_chunks: List[bytes] = []
    chunk_count = 0
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    answer_options: Optional[List[str]] = None

    try:
        while True:
            raw_message = await ws.receive_text()
            data = json.loads(raw_message)
            msg_type = data.get("type")

            if msg_type == "start":
                sample_rate = int(data.get("sample_rate", 16000))
                pcm_chunks = []
                chunk_count = 0
                question_id = data.get("question_id")
                question_text = data.get("question_text")
                answer_options = data.get("answer_options") or []

                await ws.send_text(
                    json.dumps(
                        {
                            "type": "started",
                            "sample_rate": sample_rate,
                        }
                    )
                )
                continue

            if msg_type == "chunk":
                audio_base64 = data.get("audio_base64", "")
                if audio_base64:
                    pcm_chunks.append(base64.b64decode(audio_base64))

                chunk_count += 1
                total_audio = b"".join(pcm_chunks)
                enough_audio = len(total_audio) >= settings.min_partial_audio_bytes

                if (
                    chunk_count % settings.partial_every_n_chunks == 0
                    and enough_audio
                ):
                    partial_text = transcribe_pcm_bytes(total_audio, sample_rate)
                    if partial_text:
                        await ws.send_text(
                            json.dumps(
                                {
                                    "type": "partial",
                                    "recognized_text": partial_text,
                                }
                            )
                        )
                continue

            if msg_type == "stop":
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "processing_final",
                            "message": "Generating final transcript",
                        }
                    )
                )

                final_text = transcribe_pcm_bytes(b"".join(pcm_chunks), sample_rate)

                payload = build_text_workflow_payload(
                    final_text,
                    question_id=question_id,
                    question_text=question_text,
                    answer_options=answer_options,
                )

                await ws.send_text(
                    json.dumps(
                        {
                            "type": "final_transcript",
                            **payload,
                        }
                    )
                )
                break

            await ws.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    }
                )
            )

    except WebSocketDisconnect:
        return
    except Exception as exc:
        await ws.send_text(
            json.dumps(
                {
                    "type": "error",
                    "message": str(exc),
                }
            )
        )
    finally:
        try:
            await ws.close()
        except Exception:
            pass


@router.post("/voice/review-preview")
def review_preview(request: ReviewRequest) -> Dict[str, Any]:
    return build_text_workflow_payload(
        transcript=request.transcript,
        answers=request.answers,
        question_id=request.question_id,
        question_text=request.question_text,
        answer_options=request.answer_options,
    )


@router.post("/voice/submit")
def voice_submit(request: SubmitVoiceRequest) -> Dict[str, Any]:
    result = build_text_workflow_payload(
        transcript=request.transcript or "",
        answers=request.answers,
        question_id=request.question_id,
        question_text=request.question_text,
        answer_options=request.answer_options,
    )

    recognized_text = result["recognized_text"]
    triage_answers = result["answers_for_triage_submit"]
    chat_answers = result["answers_for_chat_workflow"]

    should_run_image_retrieval = (
        request.run_image_retrieval
        if request.run_image_retrieval is not None
        else settings.enable_image_retrieval
    )

    response: Dict[str, Any] = {
        **result,
        "submitted_to_model": False,
        "submission_target": None,
        "submission_mode": settings.submit_strategy,
        "age": request.age,
        "gender": request.gender,
        "patient_id": request.patient_id,
        "errors": [],
    }

    if not recognized_text and not triage_answers:
        response["errors"].append("No transcript or answers were provided.")
        return response

    proxy_allowed = settings.submit_strategy in {"proxy", "proxy_then_direct"}
    direct_allowed = settings.submit_strategy in {"direct", "proxy_then_direct"}

    if proxy_allowed:
        try:
            proxy_result = submit_to_proxy_intake(
                patient_id=request.patient_id,
                age=request.age,
                gender=request.gender,
                triage_answers=triage_answers,
                transcript=recognized_text,
            )
            response["proxy_intake"] = proxy_result

            if proxy_result.get("ok"):
                response["submitted_to_model"] = True
                response["submission_target"] = "proxy_intake"
        except Exception as exc:
            response["errors"].append(f"Proxy intake submit failed: {exc}")

    if not response["submitted_to_model"] and direct_allowed:
        try:
            triage_result = submit_direct_to_triage(
                patient_id=request.patient_id,
                triage_answers=triage_answers,
                transcript=recognized_text,
            )
            response["triage_response"] = triage_result

            if triage_result.get("ok"):
                response["submitted_to_model"] = True
                response["submission_target"] = "direct_triage"
        except Exception as exc:
            response["errors"].append(f"Direct triage submit failed: {exc}")

    if should_run_image_retrieval and chat_answers:
        try:
            image_result = run_image_retrieval(
                chat_answers=chat_answers,
                transcript=recognized_text,
            )
            response["image_retrieval"] = image_result
        except Exception as exc:
            response["errors"].append(f"Image retrieval failed: {exc}")

    return response