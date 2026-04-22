import io
import os
import re
import tempfile
import wave
from typing import Optional

from faster_whisper import WhisperModel

from voice_input.config import settings

_voice_model: Optional[WhisperModel] = None


def get_voice_model() -> WhisperModel:
    global _voice_model

    if _voice_model is None:
        print(
            f"Loading voice model: {settings.voice_model_name} on {settings.voice_device}"
        )
        _voice_model = WhisperModel(
            settings.voice_model_name,
            device=settings.voice_device,
            compute_type=settings.voice_compute_type,
        )
        print("Voice model loaded")

    return _voice_model


def preload_voice_model() -> None:
    get_voice_model()


def normalize_transcript(text: str) -> str:
    text = str(text or "")
    text = re.sub(r"\s+", " ", text).strip(" ,")

    if not text:
        return ""

    if text[-1] not in ".!?":
        text += "."

    return text


def pcm_bytes_to_wav_bytes(pcm_bytes: bytes, sample_rate: int) -> bytes:
    wav_buffer = io.BytesIO()

    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)

    return wav_buffer.getvalue()


def transcribe_pcm_bytes(pcm_bytes: bytes, sample_rate: int) -> str:
    if not pcm_bytes:
        return ""

    wav_bytes = pcm_bytes_to_wav_bytes(pcm_bytes, sample_rate)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_file.write(wav_bytes)
        temp_path = temp_file.name

    try:
        model = get_voice_model()
        segments, _ = model.transcribe(
            temp_path,
            language="en",
            vad_filter=True,
            condition_on_previous_text=False,
            beam_size=5,
            best_of=5,
            temperature=0.0,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return normalize_transcript(text)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass