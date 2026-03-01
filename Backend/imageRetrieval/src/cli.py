import argparse
import json
import os
import sys

if __name__ == "__main__" and __package__ is None:
    sys.path.append(os.path.dirname(os.path.dirname(__file__)))

try:
    from .config import load_yaml_config, apply_config_to_args, validate_required
    from .indexing import build_index
    from .retrieval import search_topk_state
except ImportError:
    from src.config import load_yaml_config, apply_config_to_args, validate_required
    from src.indexing import build_index
    from src.retrieval import search_topk_state


def add_common_args(p: argparse.ArgumentParser):
    #train folder
    p.add_argument("--data-dir", default=None)
    # where faiss.index and meta.jsonl are written & read
    p.add_argument("--index-dir", default=None)
    p.add_argument("--embed-model", default=None)


def add_bool_flag(p: argparse.ArgumentParser, flag_name: str, dest: str):
    p.add_argument(flag_name, dest=dest, action="store_const", const=True, default=None)
    p.add_argument("--no-" + flag_name.lstrip("-"), dest=dest, action="store_const", const=False, default=None)


def main():
    parser = argparse.ArgumentParser(prog="entrep-rag")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ap_b = sub.add_parser("build") # building FAISS index and metadata
    ap_b.add_argument("--config", default="")
    add_common_args(ap_b)

    ap_b.add_argument("--stream-batch-size", dest="stream_batch_size", type=int, default=None)
    ap_b.add_argument("--index-type", dest="index_type", choices=["flat", "hnsw"], default=None)
    ap_b.add_argument("--hnsw-m", dest="hnsw_m", type=int, default=None)
    ap_b.add_argument("--hnsw-ef-construction", dest="hnsw_ef_construction", type=int, default=None)
    ap_b.add_argument("--hnsw-ef-search", dest="hnsw_ef_search", type=int, default=None)
    add_bool_flag(ap_b, "--build-region-indexes", dest="build_region_indexes")

    ap_s = sub.add_parser("search")
    ap_s.add_argument("--config", default="")
    add_common_args(ap_s)

    ap_s.add_argument("--symptoms-text", dest="symptoms_text", default=None)
    ap_s.add_argument("--duration-text", dest="duration_text", default=None)
    ap_s.add_argument("--comorbidities", dest="comorbidities", default=None)
    ap_s.add_argument("--location", dest="location", default=None)
    ap_s.add_argument("--side", dest="side", default=None)
    ap_s.add_argument("--top-k", dest="top_k", type=int, default=None)
    ap_s.add_argument("--min-score", dest="min_score", type=float, default=None)
    ap_s.add_argument("--search-k", dest="search_k", type=int, default=None)
    add_bool_flag(ap_s, "--use-mmap", dest="use_mmap")
    add_bool_flag(ap_s, "--quiet", dest="quiet")

    args = parser.parse_args()

    cfg = load_yaml_config(args.config or "")
    args = apply_config_to_args(args.cmd, args, cfg)
    validate_required(args)

    if args.embed_model is None:
        args.embed_model = "sentence-transformers/all-MiniLM-L6-v2"

    if args.cmd == "build":
        if args.stream_batch_size is None:
            args.stream_batch_size = 2048
        if args.index_type is None:
            args.index_type = "flat"
        if args.hnsw_m is None:
            args.hnsw_m = 32
        if args.hnsw_ef_construction is None:
            args.hnsw_ef_construction = 200
        if args.hnsw_ef_search is None:
            args.hnsw_ef_search = 64
        if args.build_region_indexes is None:
            args.build_region_indexes = False

        build_index(
            data_dir=args.data_dir,
            index_dir=args.index_dir,
            embed_model=args.embed_model,
            stream_batch_size=args.stream_batch_size,
            index_type=args.index_type,
            hnsw_m=args.hnsw_m,
            hnsw_ef_construction=args.hnsw_ef_construction,
            hnsw_ef_search=args.hnsw_ef_search,
            build_region_indexes=args.build_region_indexes,
        )
        print("BUILD COMPLETED")
        return

    if args.cmd == "search":
        if args.top_k is None:
            args.top_k = 3
        if args.min_score is None:
            args.min_score = 0.60
        if args.search_k is None:
            args.search_k = 50
        if args.use_mmap is None:
            args.use_mmap = True
        if args.quiet is None:
            args.quiet = False
        if args.symptoms_text is None:
            args.symptoms_text = ""
        if args.duration_text is None:
            args.duration_text = ""
        if args.comorbidities is None:
            args.comorbidities = ""
        if args.location is None:
            args.location = ""
        if args.side is None:
            args.side = ""

        state = search_topk_state(
            index_dir=args.index_dir,
            data_dir=args.data_dir,
            embed_model=args.embed_model,
            symptoms_text=args.symptoms_text,
            duration_text=args.duration_text,
            comorbidities=args.comorbidities,
            location=args.location,
            side=args.side,
            top_k=args.top_k,
            min_score=args.min_score,
            search_k=args.search_k,
            use_mmap=args.use_mmap,
        )

        if not args.quiet:
            print(json.dumps(state, indent=2, ensure_ascii=False))
        return


if __name__ == "__main__":
    main()