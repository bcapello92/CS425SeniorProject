from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

from src.retrieval import search_topk_state

app = FastAPI()

DATA_DIR = os.getenv("IMAGE_DATA_DIR", "./data")
INDEX_DIR = os.getenv("IMAGE_INDEX_DIR", "./index")
EMBED_MODEL = os.getenv("IMAGE_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
BASE_URL = os.getenv("IMAGE_BASE_URL", "http://127.0.0.1:8001")

imgs_folder = os.path.join(DATA_DIR, "imgs")
if os.path.isdir(imgs_folder):
    app.mount("/images", StaticFiles(directory=imgs_folder), name="images")


class ImageRequest(BaseModel):
    answers: list[dict] = []


def make_text(answers):
    parts = []
    for item in answers:
        q = str(item.get("text", "")).strip()
        a = str(item.get("answer", "")).strip()

        if q and a:
            parts.append(f"{q}: {a}")
        elif a:
            parts.append(a)

    return " | ".join(parts)


def find_location(text):
    text = text.lower()

    if "ear" in text or "hearing" in text or "ringing" in text or "tinnitus" in text:
        return "ear"
    if "nose" in text or "sinus" in text or "nasal" in text or "congestion" in text:
        return "nose"
    if "throat" in text or "swallow" in text or "voice" in text or "hoarse" in text:
        return "throat"

    return ""


def find_side(text):
    text = text.lower()

    if "left" in text:
        return "left"
    if "right" in text:
        return "right"

    return ""


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/search-images")
def search_images(data: ImageRequest):
    search_text = make_text(data.answers)
    location = find_location(search_text)
    side = find_side(search_text)
    try:
        result = search_topk_state(
            index_dir=INDEX_DIR,
            data_dir=DATA_DIR,
            embed_model=EMBED_MODEL,
            symptoms_text=search_text,
            duration_text="",
            comorbidities="",
            location=location,
            side=side,
            top_k=3,
            min_score=0.0,
            search_k=50,
            use_mmap=True,
        )
    except Exception as e:
        return {
            "images": [],
            "query": {"summary": search_text, "aligned_phrases": []},
            "note": f"Image retrieval unavailable: {str(e)}",
        }

    images = []

    for item in result.get("results", [])[:3]:
        file_name = item.get("img", "")
        image_url = f"{BASE_URL}/images/{file_name}" if file_name else ""

        images.append(
            {
                "imageUrl": image_url,
                "imageName": file_name,
                "score": round(float(item.get("score", 0.0)), 3),
                "description": item.get("desc", ""),
                "label": item.get("label", ""),
                "side": item.get("side", "unknown"),
            }
        )

    return {
        "images": images,
        "query": result.get("query", {}),
        "note": result.get("note", ""),
    }
