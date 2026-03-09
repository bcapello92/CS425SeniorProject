import re
from typing import Any, List

def clean(x: Any) -> str:
    return re.compile(r"\s+").sub(" ", str(x).strip())

def align_to_dataset_style(patient_summary: str) -> List[str]:
    s = (patient_summary or "").lower()
    out: List[str] = []

    def add(p: str) -> None:
        p = clean(p)
        if p and p not in out:
            out.append(p)

    if any(w in s for w in ["nose", "nasal", "sinus", "post-nasal", "runny", "congestion", "blocked", "sneeze"]):
        region = "nose"
    elif any(w in s for w in ["ear", "hearing", "tinnitus", "ringing", "earache"]):
        region = "ear"
    elif any(w in s for w in ["throat", "voice", "hoarse", "swallow", "choking"]):
        region = "throat"
    else:
        region = "unknown"

    if region == "nose":
        if any(w in s for w in ["blocked", "blockage", "obstruction", "stuffed"]):
            add("nasal obstruction")
            add("deviated nasal septum")
            add("nasal septal spur")
            add("nasal polyp")
        if any(w in s for w in ["runny", "discharge"]):
            add("nasal discharge")
            add("rhinitis")
        if "bleed" in s:
            add("epistaxis")

    if region == "ear":
        if any(w in s for w in ["hearing loss", "reduced hearing", "muffled"]):
            add("reduced hearing")
        if any(w in s for w in ["ringing", "tinnitus"]):
            add("tinnitus")
        if "pain" in s or "earache" in s:
            add("otitis externa")
            add("otitis media")

    if region == "throat":
        if any(w in s for w in ["hoarse", "voice"]):
            add("hoarseness")
            add("vocal cords inflammation")
        if any(w in s for w in ["unable to swallow", "pain when swallowing"]):
            add("odynophagia")
            add("throat swelling")
        if any(w in s for w in ["noisy breathing", "struggling to breathe", "choking"]):
            add("airway compromise")

    add(patient_summary) 
    return out[:10]