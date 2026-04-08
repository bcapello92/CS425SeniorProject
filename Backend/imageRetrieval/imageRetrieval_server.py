from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import traceback

from src.retrieval import search_topk_state
from src.retrieval import clear_retrieval_cache
from src.indexing import build_index

app = FastAPI()

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(THIS_DIR, "..", ".."))
WORKSPACE_PARENT = os.path.abspath(os.path.join(REPO_ROOT, ".."))
DEFAULT_DATA_DIR = os.path.join(THIS_DIR, "data")


def resolve_data_dir():
    env_dir = os.getenv("IMAGE_DATA_DIR")
    if env_dir:
        return os.path.abspath(env_dir)

    candidates = [
        DEFAULT_DATA_DIR,
        os.path.join(REPO_ROOT, "Backend", "imageRetrieval", "data"),
        WORKSPACE_PARENT,
    ]
    for candidate in candidates:
        imgs_dir = os.path.join(candidate, "imgs")
        images_dir = os.path.join(candidate, "images")
        has_metadata = any(
            os.path.isfile(os.path.join(candidate, name))
            for name in ("data.json", "t2i.json", "cls.json")
        )
        if has_metadata and (os.path.isdir(imgs_dir) or os.path.isdir(images_dir)):
            return candidate

    return DEFAULT_DATA_DIR


DATA_DIR = resolve_data_dir()
INDEX_DIR = os.getenv("IMAGE_INDEX_DIR", os.path.join(THIS_DIR, "index"))
EMBED_MODEL = os.getenv("IMAGE_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
BASE_URL = os.getenv("IMAGE_BASE_URL", "http://127.0.0.1:8001")

imgs_folder = os.path.join(DATA_DIR, "imgs")
if not os.path.isdir(imgs_folder):
    imgs_folder = os.path.join(DATA_DIR, "images")
if os.path.isdir(imgs_folder):
    app.mount("/images", StaticFiles(directory=imgs_folder), name="images")


class ImageRequest(BaseModel):
    answers: list[dict] = []


def ensure_index_ready():
    faiss_path = os.path.join(INDEX_DIR, "faiss.index")
    meta_path = os.path.join(INDEX_DIR, "meta.jsonl")
    if os.path.exists(faiss_path) and os.path.exists(meta_path):
        return

    build_index(
        data_dir=DATA_DIR,
        index_dir=INDEX_DIR,
        embed_model=EMBED_MODEL,
        build_region_indexes=True,
    )


def rebuild_index():
    clear_retrieval_cache()
    build_index(
        data_dir=DATA_DIR,
        index_dir=INDEX_DIR,
        embed_model=EMBED_MODEL,
        build_region_indexes=True,
    )


def make_text(answers):
    parts = []
    for item in answers:
        a = str(item.get("answer", "")).strip()
        if a:
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
    try:
        ensure_index_ready()

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
                min_score=0.60,
                search_k=50,
                use_mmap=True,
            )
        except RuntimeError as exc:
            if "Embedding dimension mismatch" not in str(exc):
                raise
            rebuild_index()
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
                min_score=0.60,
                search_k=50,
                use_mmap=True,
            )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Image retrieval failed. data_dir={DATA_DIR}, index_dir={INDEX_DIR}. "
                f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
            ),
        ) from exc

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
