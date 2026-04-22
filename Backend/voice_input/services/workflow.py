from typing import Any, Dict, List, Optional

from voice_input.services.transcription import normalize_transcript


def build_chat_answer_object(
    recognized_text: str,
    question_id: Optional[str] = None,
    question_text: Optional[str] = None,
    answer_options: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    if not recognized_text:
        return None

    return {
        "id": question_id or "voice-input",
        "question": question_text or "Voice input",
        "answer": recognized_text,
        "answerOptions": list(answer_options or []),
    }

def build_image_answer_object(
    recognized_text: str,
    question_id: Optional[str] = None,
    question_text: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not recognized_text:
        return None

    return {
        "linkId": question_id or "voice-input",
        "question": question_text or "Voice input",
        "answer": recognized_text,
    }


def build_triage_answer_object(
    recognized_text: str,
    question_id: Optional[str] = None,
    question_text: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not recognized_text:
        return None

    prompt_text = question_text or "Voice input"

    return {
        "linkId": question_id or "voice-input",
        "question": prompt_text,
        "text": prompt_text,
        "answer": recognized_text,
    }


def normalize_answers_for_chat(
    answers: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []

    for index, item in enumerate(answers or [], start=1):
        if not isinstance(item, dict):
            continue

        answer_text = normalize_transcript(item.get("answer", ""))
        if not answer_text:
            continue

        normalized.append(
            {
                "id": item.get("id") or item.get("linkId") or f"question-{index}",
                "question": item.get("question") or item.get("text") or f"Question {index}",
                "answer": answer_text,
                "answerOptions": item.get("answerOptions") or [],
            }
        )

    return normalized


def normalize_answers_for_triage(
    answers: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []

    for index, item in enumerate(answers or [], start=1):
        if not isinstance(item, dict):
            continue

        answer_text = normalize_transcript(item.get("answer", ""))
        if not answer_text:
            continue

        question_text = (
            item.get("question")
            or item.get("text")
            or f"Question {index}"
        )

        normalized.append(
            {
                "linkId": item.get("linkId") or item.get("id") or f"question-{index}",
                "question": question_text,
                "text": question_text,
                "answer": answer_text,
            }
        )

    return normalized


def normalize_answers_for_image(
    answers: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []

    for index, item in enumerate(answers or [], start=1):
        if not isinstance(item, dict):
            continue

        answer_text = normalize_transcript(item.get("answer", ""))
        if not answer_text:
            continue

        normalized.append(
            {
                "linkId": item.get("linkId") or item.get("id") or f"question-{index}",
                "question": item.get("question") or item.get("text") or f"Question {index}",
                "answer": answer_text,
            }
        )

    return normalized

def append_if_new(
    items: List[Dict[str, Any]],
    new_item: Optional[Dict[str, Any]],
    value_key: str = "answer",
) -> List[Dict[str, Any]]:
    updated = list(items)

    if not new_item:
        return updated

    new_value = normalize_transcript(new_item.get(value_key, ""))
    if not new_value:
        return updated

    if updated:
        last_item = updated[-1]
        last_value = normalize_transcript(last_item.get(value_key, ""))
        last_id = str(last_item.get("id") or last_item.get("linkId") or "")
        new_id = str(new_item.get("id") or new_item.get("linkId") or "")
        if last_value == new_value and last_id == new_id:
            return updated

    updated.append(new_item)
    return updated


def build_text_workflow_payload(
    transcript: str,
    answers: Optional[List[Dict[str, Any]]] = None,
    question_id: Optional[str] = None,
    question_text: Optional[str] = None,
    answer_options: Optional[List[str]] = None,
) -> Dict[str, Any]:
    recognized_text = normalize_transcript(transcript)

    chat_answers = normalize_answers_for_chat(answers)
    triage_answers = normalize_answers_for_triage(answers)
    image_answers = normalize_answers_for_image(answers)

    chat_answer_object = build_chat_answer_object(
        recognized_text,
        question_id=question_id,
        question_text=question_text,
        answer_options=answer_options,
    )

    triage_answer_object = build_triage_answer_object(
        recognized_text,
        question_id=question_id,
        question_text=question_text,
    )

    image_answer_object = build_image_answer_object(
        recognized_text,
        question_id=question_id,
        question_text=question_text,
    )

    answers_for_chat_workflow = append_if_new(chat_answers, chat_answer_object)
    answers_for_triage_submit = append_if_new(triage_answers, triage_answer_object)
    answers_for_image_submit = append_if_new(image_answers, image_answer_object)

    return {
        "recognized_text": recognized_text,
        "patient_text": recognized_text,
        "text_input_value": recognized_text,
        "chat_answer_object": chat_answer_object,
        "triage_answer_object": triage_answer_object,
        "image_answer_object": image_answer_object,
        "answers_for_chat_workflow": answers_for_chat_workflow,
        "answers_for_triage_submit": answers_for_triage_submit,
        "answers_for_image_submit": answers_for_image_submit,
        "ready_for_existing_text_workflow": bool(recognized_text),
    }