from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from voice_input.config import settings
from voice_input.routes import router
from voice_input.services.transcription import preload_voice_model

app = FastAPI(title=settings.app_title)

if settings.allow_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def startup_event() -> None:
    preload_voice_model()


app.include_router(router)