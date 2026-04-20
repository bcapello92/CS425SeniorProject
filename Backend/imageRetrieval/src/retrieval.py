import os
import json

import numpy as np
import faiss

from .query_reformulation import align_to_dataset_style
from .embedder import get_embedder


_INDEX_CACHE = {}  #  faiss_path & use_mmap is index
_META_CACHE = {}   # meta_path is list of dicts


def clear_retrieval_cache():
    _INDEX_CACHE.clear()
    _META_CACHE.clear()


def load_jsonl(path):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def get_index(faiss_path, use_mmap=True):
    key = (faiss_path, bool(use_mmap))
    if key in _INDEX_CACHE:
        return _INDEX_CACHE[key]

    flags = faiss.IO_FLAG_MMAP if use_mmap else 0
    idx = faiss.read_index(faiss_path, flags)
    _INDEX_CACHE[key] = idx
    return idx


def get_meta(meta_path):
    if meta_path in _META_CACHE:
        return _META_CACHE[meta_path]

    docs = load_jsonl(meta_path)
    _META_CACHE[meta_path] = docs
    return docs


def make_patient_summary(symptoms_text, duration_text, comorbidities, location, side):
    parts = []
    if symptoms_text:
        parts.append(f"Symptoms: {symptoms_text}")
    if duration_text:
        parts.append(f"Duration: {duration_text}")
    if comorbidities:
        parts.append(f"Comorbidities: {comorbidities}")
    if location:
        parts.append(f"Location: {location}")
    if side:
        parts.append(f"Side: {side}")
    return " | ".join(parts)


def _pick_index_and_meta(index_dir, location):
    loc = (location or "").lower().strip()
    regions_dir = os.path.join(index_dir, "regions")

    if loc in {"nose", "ear", "throat", "unknown"}:
        rp = os.path.join(regions_dir, f"faiss_{loc}.index")
        mp = os.path.join(regions_dir, f"meta_{loc}.jsonl")
        if os.path.exists(rp) and os.path.exists(mp):
            return rp, mp

    return os.path.join(index_dir, "faiss.index"), os.path.join(index_dir, "meta.jsonl")


def search_topk_state(
    index_dir,
    data_dir,
    embed_model,
    symptoms_text="",
    duration_text="",
    comorbidities="",
    location="",
    side="",
    top_k=3,
    min_score=0.60,
    search_k=50,
    use_mmap=True,
    include_per_phrase_hits=True,
    per_phrase_hits_k=10,
):
    faiss_path, meta_path = _pick_index_and_meta(index_dir, location)
    if not os.path.exists(faiss_path) or not os.path.exists(meta_path):
        raise RuntimeError("Index not found. Run build first.")

    index = get_index(faiss_path, use_mmap=use_mmap)
    docs = get_meta(meta_path)

    patient = {
        "symptoms_text": symptoms_text,
        "duration_text": duration_text,
        "comorbidities": comorbidities,
        "location": location,
        "side": side,
    }

    summary = make_patient_summary(symptoms_text, duration_text, comorbidities, location, side)
    aligned = align_to_dataset_style(summary)
    if not aligned:
        state = {
            "patient": patient,
            "query": {"summary": summary, "aligned_phrases": aligned},
            "results": [],
            "note": "No searchable symptoms were provided.",
        }
        if include_per_phrase_hits:
            state["per_phrase_hits"] = []
        return state

    embedder = get_embedder(embed_model)

    Q = embedder.encode(aligned, convert_to_numpy=True, normalize_embeddings=True).astype(np.float32)
    Q = np.atleast_2d(Q)
    if Q.shape[1] != index.d:
        raise RuntimeError(
            f"Embedding dimension mismatch: query_dim={Q.shape[1]}, index_dim={index.d}"
        )
    k = max(int(search_k), int(top_k), 25)
    scores, idxs = index.search(Q, k=k)

    imgs_dir = os.path.join(data_dir, "imgs")

    best_by_img = {}
    per_phrase_hits = []

    for qi, phrase in enumerate(aligned):
        phrase_hits = []

        for score, idx in zip(scores[qi], idxs[qi]):
            if idx < 0:
                continue

            base = docs[idx]
            img = base.get("img", "")

            hit = dict(base)
            hit["score"] = float(score)
            hit["matched_phrase"] = phrase
            hit["img_path"] = os.path.join(imgs_dir, img) if img else ""

            if img:
                prev = best_by_img.get(img)
                if prev is None or hit["score"] > prev["score"]:
                    best_by_img[img] = hit

            if include_per_phrase_hits and len(phrase_hits) < int(per_phrase_hits_k):
                phrase_hits.append(
                    {
                        "img": hit.get("img", ""),
                        "score": float(hit["score"]),
                        "label": hit.get("label", ""),
                        "desc": hit.get("desc", ""),
                    }
                )

        if include_per_phrase_hits:
            per_phrase_hits.append({"phrase": phrase, "hits": phrase_hits})

    ranked = sorted(best_by_img.values(), key=lambda x: x["score"], reverse=True)

    s = (side or "").lower().strip()
    if s in {"left", "right"}:
        filtered = [r for r in ranked if r.get("side", "unknown") in {"unknown", s}]
        if filtered:
            ranked = filtered

    loc = (location or "").lower().strip()
    if loc in {"nose", "ear", "throat"}:
        filtered = [r for r in ranked if (loc in (r.get("region", "") or "") or loc in (r.get("label", "").lower()))]
        if filtered:
            ranked = filtered

    seen_desc = set()
    deduped = []
    for r in ranked:
        desc = r.get("desc", "")
        if desc in seen_desc:
            continue
        seen_desc.add(desc)
        deduped.append(r)

    confident = [r for r in deduped if float(r.get("score", 0.0)) >= float(min_score)]

    note = ""
    if not confident:
        note = f"No confident matches above {float(min_score):.2f}. Showing closest matches (low confidence)."
        final = deduped[: int(top_k)]
    else:
        final = confident[: int(top_k)]

    state = {
        "patient": patient,
        "query": {"summary": summary, "aligned_phrases": aligned},
        "results": final,
    }

    if note:
        state["note"] = note
    if include_per_phrase_hits:
        state["per_phrase_hits"] = per_phrase_hits

    return state
