from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ReviewRequest(BaseModel):
    transcript: str
    answers: Optional[List[Dict[str, Any]]] = None
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    answer_options: Optional[List[str]] = None


class SubmitVoiceRequest(BaseModel):
    transcript: Optional[str] = ""
    answers: Optional[List[Dict[str, Any]]] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    patient_id: Optional[str] = None
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    answer_options: Optional[List[str]] = None
    run_image_retrieval: Optional[bool] = None