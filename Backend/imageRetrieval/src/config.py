import os

def load_yaml_config(path: str):
    if not path:
        return {}

    if not os.path.exists(path):
        raise FileNotFoundError(f"Config not found: {path}")

    try:
        import yaml 
    except Exception as e:
        raise RuntimeError(
            "You passed --config but PyYAML isn't installed.\n"
            "Install it using: pip install PyYAML>=6.0"
        ) from e

    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    if cfg is None:
        cfg = {}

    if not isinstance(cfg, dict):
        raise ValueError("Config root must be a dict (top-level YAML mapping).")

    return cfg


def _set_if_none(args, name: str, value):
    if getattr(args, name, None) is None:
        setattr(args, name, value)


def apply_config_to_args(cmd: str, args, cfg):
    _set_if_none(args, "data_dir", cfg.get("data_dir"))
    _set_if_none(args, "index_dir", cfg.get("index_dir"))
    _set_if_none(args, "embed_model", cfg.get("embed_model"))

    if cmd == "build":
        build_cfg = cfg.get("build", {})
        if not isinstance(build_cfg, dict):
            build_cfg = {}

        for key in [
            "stream_batch_size",
            "index_type",
            "hnsw_m",
            "hnsw_ef_construction",
            "hnsw_ef_search",
            "build_region_indexes",
        ]:
            _set_if_none(args, key, build_cfg.get(key))

    if cmd == "search":
        search_cfg = cfg.get("search", {})
        if not isinstance(search_cfg, dict):
            search_cfg = {}

        for key in [
            "symptoms_text",
            "duration_text",
            "comorbidities",
            "location",
            "side",
            "top_k",
            "min_score",
            "search_k",
            "use_mmap",
            "quiet",
        ]:
            _set_if_none(args, key, search_cfg.get(key))

    return args


def validate_required(args):
    if not getattr(args, "data_dir", None):
        raise SystemExit("Missing --data-dir (or data_dir in config).")
    if not getattr(args, "index_dir", None):
        raise SystemExit("Missing --index-dir (or index_dir in config).")