import os
from dataclasses import dataclass
from typing import List


def _split_origins(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_title: str = "Voice Input Server"

    voice_model_name: str = os.getenv("VOICE_MODEL_NAME", "small.en")
    voice_device: str = os.getenv("VOICE_DEVICE", "cpu")
    voice_compute_type: str = os.getenv("VOICE_COMPUTE_TYPE", "int8")

    partial_every_n_chunks: int = int(os.getenv("VOICE_PARTIAL_EVERY_N_CHUNKS", "12"))
    min_partial_audio_bytes: int = int(
        os.getenv("VOICE_MIN_PARTIAL_AUDIO_BYTES", str(16000 * 2 * 4))
    )

    allow_origins: List[str] = None  

    submit_strategy: str = os.getenv(
        "VOICE_SUBMIT_STRATEGY",
        "proxy_then_direct",
    ).strip().lower()

    proxy_intake_url: str = os.getenv(
        "VOICE_PROXY_INTAKE_URL",
        "http://127.0.0.1:4000/api/intake",
    )

    triage_api_url: str = os.getenv(
        "VOICE_TRIAGE_API_URL",
        "http://127.0.0.1:8000/triage",
    )

    image_api_url: str = os.getenv(
        "VOICE_IMAGE_API_URL",
        "http://127.0.0.1:8001/search-images",
    )

    enable_image_retrieval: bool = os.getenv(
        "VOICE_ENABLE_IMAGE_RETRIEVAL",
        "false",
    ).strip().lower() in {"1", "true", "yes", "on"}

    http_timeout_sec: int = int(os.getenv("VOICE_HTTP_TIMEOUT_SEC", "90"))

    def __post_init__(self) -> None:
        if self.allow_origins is None:
            object.__setattr__(
                self,
                "allow_origins",
                _split_origins(
                    os.getenv(
                        "VOICE_ALLOW_ORIGINS",
                        "http://localhost:5173,http://127.0.0.1:5173,"
                        "http://localhost:3000,http://127.0.0.1:3000,"
                        "https://enttriage.unr.dev",
                    )
                ),
            )


settings = Settings()
