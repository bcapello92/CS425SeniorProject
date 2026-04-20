import os
import re
import json
from typing import Dict, List, Tuple, Any

def clean(x: Any) -> str:
    return re.compile(r"\s+").sub(" ", str(x).strip())

def load_json(path: str) -> Any:
    with open(path, "rb") as f:
        b = f.read()
    return json.loads(b.decode("utf-8"))

def region_from_label(lbl: str) -> str:
    s = (lbl or "").lower().strip()
    if s.startswith("nose"):
        return "nose"
    if s.startswith("ear"):
        return "ear"
    if s == "throat":
        return "throat"
    if s.startswith("vc-"):  
        return "throat"
    return "unknown"

def side_from_label(lbl: str) -> str:
    s = (lbl or "").lower().strip()
    if s.endswith("-left"):
        return "left"
    if s.endswith("-right"):
        return "right"
    return "unknown"

def build_docs(data_dir: str) -> Tuple[List[Dict[str, Any]], str]:
    t2i_path = os.path.join(data_dir, "t2i.json")
    cls_path = os.path.join(data_dir, "cls.json")
    i2i_path = os.path.join(data_dir, "i2i.json")
    imgs_dir = os.path.join(data_dir, "imgs")

    t2i = load_json(t2i_path)
    cls = load_json(cls_path)
    i2i = load_json(i2i_path) if os.path.exists(i2i_path) else {}

    existing_imgs = set(os.listdir(imgs_dir)) if os.path.isdir(imgs_dir) else set()
    img_name_lookup = {name.lower(): name for name in existing_imgs}

    neighbors: Dict[str, set] = {}
    if isinstance(i2i, dict):
        for a, b in i2i.items():
            a, b = clean(a), clean(b)
            if not a or not b:
                continue
            neighbors.setdefault(a, set()).add(b)
            neighbors.setdefault(b, set()).add(a)

    docs: List[Dict[str, Any]] = []
    seen = set() 

    for desc, img_val in t2i.items():
        desc = clean(desc)
        if not desc:
            continue

        if isinstance(img_val, str):
            imgs = [clean(img_val)]
        elif isinstance(img_val, list):
            imgs = [clean(x) for x in img_val]
        else:
            continue

        for img in imgs:
            if not img:
                continue
            actual_img = img_name_lookup.get(img.lower())
            if not actual_img:
                continue

            lbl = clean(cls.get(img, cls.get(actual_img, "")))
            key = (desc, actual_img)
            if key not in seen:
                docs.append({
                    "desc": desc,
                    "img": actual_img,
                    "img_path": os.path.join(imgs_dir, actual_img),
                    "label": lbl,
                    "region": region_from_label(lbl),
                    "side": side_from_label(lbl),
                    "linked": sorted(neighbors.get(img, neighbors.get(actual_img, ()))),
                })
                seen.add(key)

            for other in neighbors.get(img, ()):
                other = clean(other)
                if not other:
                    continue
                actual_other = img_name_lookup.get(other.lower())
                if not actual_other:
                    continue
                other_lbl = clean(cls.get(other, cls.get(actual_other, "")))
                other_key = (desc, actual_other)
                if other_key not in seen:
                    docs.append({
                        "desc": desc,
                        "img": actual_other,
                        "img_path": os.path.join(imgs_dir, actual_other),
                        "label": other_lbl,
                        "region": region_from_label(other_lbl),
                        "side": side_from_label(other_lbl),
                        "linked": sorted(neighbors.get(other, neighbors.get(actual_other, ()))),
                    })
                    seen.add(other_key)

    return docs, imgs_dir
