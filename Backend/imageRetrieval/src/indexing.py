import os
import json

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

from .dataset import build_docs


def write_jsonl(rows, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def make_index(dim, index_type="flat", hnsw_m=32, ef_construction=200, ef_search=64):
    if index_type == "flat":
        return faiss.IndexFlatIP(dim)

    if index_type == "hnsw":
        idx = faiss.IndexHNSWFlat(dim, int(hnsw_m))
        idx.hnsw.efConstruction = int(ef_construction)
        idx.hnsw.efSearch = int(ef_search)
        return idx

    raise ValueError(f"Unknown index_type: {index_type}")


def build_index(
    data_dir,
    index_dir,
    embed_model,
    stream_batch_size=2048,
    index_type="flat",
    hnsw_m=32,
    hnsw_ef_construction=200,
    hnsw_ef_search=64,
    build_region_indexes=False,
):
    os.makedirs(index_dir, exist_ok=True)

    docs, _ = build_docs(data_dir)
    if not docs:
        raise RuntimeError("No docs built. Check data_dir and make sure imgs/ + json files exist.")

    embedder = SentenceTransformer(embed_model)

    first_bs = min(stream_batch_size, len(docs))
    first_texts = [d["desc"] for d in docs[:first_bs]]
    X0 = embedder.encode(
        first_texts,
        batch_size=64,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype(np.float32)

    dim = int(X0.shape[1])
    index = make_index(
        dim,
        index_type=index_type,
        hnsw_m=hnsw_m,
        ef_construction=hnsw_ef_construction,
        ef_search=hnsw_ef_search,
    )
    index.add(X0)

    region_indexes = {}
    region_docs = {}

    if build_region_indexes:
        for r in ["nose", "ear", "throat", "unknown"]:
            region_indexes[r] = make_index(
                dim,
                index_type=index_type,
                hnsw_m=hnsw_m,
                ef_construction=hnsw_ef_construction,
                ef_search=hnsw_ef_search,
            )
            region_docs[r] = []

        for j in range(first_bs):
            r = docs[j].get("region") or "unknown"
            if r not in region_indexes:
                r = "unknown"
            region_indexes[r].add(X0[j : j + 1])
            region_docs[r].append(docs[j])

    for i in range(first_bs, len(docs), stream_batch_size):
        batch = docs[i : i + stream_batch_size]
        texts = [d["desc"] for d in batch]

        Xb = embedder.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        ).astype(np.float32)

        index.add(Xb)

        if build_region_indexes:
            for j, d in enumerate(batch):
                r = d.get("region") or "unknown"
                if r not in region_indexes:
                    r = "unknown"
                region_indexes[r].add(Xb[j : j + 1])
                region_docs[r].append(d)

    faiss_path = os.path.join(index_dir, "faiss.index")
    meta_path = os.path.join(index_dir, "meta.jsonl")
    faiss.write_index(index, faiss_path)
    write_jsonl(docs, meta_path)

    if build_region_indexes:
        regions_dir = os.path.join(index_dir, "regions")
        os.makedirs(regions_dir, exist_ok=True)

        for r in ["nose", "ear", "throat", "unknown"]:
            rp = os.path.join(regions_dir, f"faiss_{r}.index")
            mp = os.path.join(regions_dir, f"meta_{r}.jsonl")
            faiss.write_index(region_indexes[r], rp)
            write_jsonl(region_docs[r], mp)