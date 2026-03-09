import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def build_legacy_files(data):
    t2i = defaultdict(list)
    cls = {}

    for row in data:
        image_name = clean(row.get("Path"))
        label = clean(row.get("Classification"))
        desc = clean(row.get("DescriptionEN") or row.get("Description"))

        if not image_name or not desc:
            continue

        cls[image_name] = label
        if image_name not in t2i[desc]:
            t2i[desc].append(image_name)

    return dict(t2i), cls


def main():
    parser = argparse.ArgumentParser(
        description="Convert data.json into legacy t2i.json / cls.json / i2i.json files."
    )
    parser.add_argument(
        "--data-dir",
        default=".",
        help="Folder containing data.json. Output files are also written here.",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    data_json_path = data_dir / "data.json"

    if not data_json_path.exists():
        raise FileNotFoundError(f"Missing input file: {data_json_path}")

    data = json.loads(data_json_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("data.json must contain a top-level JSON array")

    t2i, cls = build_legacy_files(data)

    (data_dir / "t2i.json").write_text(
        json.dumps(t2i, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (data_dir / "cls.json").write_text(
        json.dumps(cls, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (data_dir / "i2i.json").write_text("{}", encoding="utf-8")

    print(f"Wrote {data_dir / 't2i.json'}")
    print(f"Wrote {data_dir / 'cls.json'}")
    print(f"Wrote {data_dir / 'i2i.json'}")
    print(f"Descriptions: {len(t2i)}")
    print(f"Images: {len(cls)}")


if __name__ == "__main__":
    main()
