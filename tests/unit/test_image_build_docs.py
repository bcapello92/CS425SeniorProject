import json
import os
import sys
from pathlib import Path
import pytest


SRC_DIR = Path(__file__).resolve().parents[2] / "Backend" / "imageRetrieval" / "src"
sys.path.insert(0, str(SRC_DIR))

from dataset import build_docs

#checks that build_docs() ignores missing image files &  includes the neighbor image correctly.
@pytest.mark.unit
def test_build_docs(tmp_path):
    data_dir = tmp_path / "data"
    imgs_dir = data_dir / "imgs"
    imgs_dir.mkdir(parents=True)

    (imgs_dir / "img1.png").write_bytes(b"fake")
    (imgs_dir / "img2.png").write_bytes(b"fake")  # neighbor image

    (data_dir / "t2i.json").write_text(json.dumps({"ear pain": ["img1.png", "missing.png"]}), "utf-8")
    (data_dir / "cls.json").write_text(json.dumps({"img1.png": "ear-left", "img2.png": "ear-right"}), "utf-8")
    (data_dir / "i2i.json").write_text(json.dumps({"img1.png": "img2.png"}), "utf-8")

    docs, imgs_path = build_docs(str(data_dir))

    assert imgs_path.endswith("imgs")
    assert sorted(d["img"] for d in docs) == ["img1.png", "img2.png"]

    d1 = next(d for d in docs if d["img"] == "img1.png")
    assert d1["region"] == "ear"
    assert d1["side"] == "left"
    assert os.path.basename(d1["img_path"]) == "img1.png"