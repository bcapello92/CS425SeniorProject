# deidentify_triage.py

import re
from typing import Any, Dict, List, Optional, Tuple

# ----------------------------
# Age helpers
# ----------------------------

def to_int_or_none(age: Any) -> Optional[int]:
    """Convert age into an integer value if possible.

    Examples: '23', 23, '23.0' -> 23; empty/weird -> None
    """
    try:
        if age is None:
            return None
        age_str = str(age).strip()
        if not age_str:
            return None
        return int(float(age_str))
    except Exception:
        return None


def age_bucket_hipaa(age_value: Any) -> Optional[str]:
    """Classify age into HIPAA-safe buckets."""
    age_int = to_int_or_none(age_value)
    if age_int is None:
        return None
    if age_int >= 90:
        return "90 plus"
    if age_int <= 17:
        return "child"
    if age_int <= 64:
        return "adult"
    return "older adult"  # 65–89


# ----------------------------
# Regex for personal identifiers
# ----------------------------

phone_re = re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b")
email_re = re.compile(r"\b\S+@\S+\.\S+\b")
street_re = re.compile(
    r"\b\d+\s+[A-Za-z]+\s+"
    r"(Street|St|Road|Rd|Avenue|Ave|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Hwy)\b",
    re.IGNORECASE,
)
zip_re = re.compile(r"\b\d{5}(-\d{4})?\b")
date_numeric_re = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")
date_text_re = re.compile(
    r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{2,4}\b",
    re.IGNORECASE,
)
time_re = re.compile(r"\b\d{1,2}:\d{2}\b")
ssn_re = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
id_hint_re = re.compile(
    r"\b(MRN|ID|Acct|Account|Policy|Member|Claim|Patient\s*ID)\s*[:#]?\s*\w+\b",
    re.IGNORECASE,
)
gender_words_re = re.compile(
    r"\b(male|female|man|woman|boy|girl|transgender|nonbinary|m|f)\b",
    re.IGNORECASE,
)


# ----------------------------
# Generic text scrubber
# ----------------------------

def _scrub_text_quick(raw_text: Any) -> str:
    """Hide obvious identifiers but keep medical meaning intact."""
    clean_text = str(raw_text or "")
    clean_text = phone_re.sub("[PHONE]", clean_text)
    clean_text = email_re.sub("[EMAIL]", clean_text)
    clean_text = street_re.sub("[ADDRESS]", clean_text)
    clean_text = zip_re.sub("[ZIP]", clean_text)
    clean_text = ssn_re.sub("[SSN]", clean_text)
    clean_text = id_hint_re.sub("[ID]", clean_text)
    clean_text = date_numeric_re.sub("[DATE]", clean_text)
    clean_text = date_text_re.sub("[DATE]", clean_text)
    clean_text = time_re.sub("[TIME]", clean_text)
    clean_text = gender_words_re.sub("[GENDER]", clean_text)
    return re.sub(r"\s+", " ", clean_text).strip()


# ----------------------------
# Transcript-specific scrubber
# ----------------------------

# Explicit "Patient: Brendan D" / "Name: John Smith"
name_line_re = re.compile(
    r"^(Patient|Pt|Name)\s*:\s*.+$",
    re.IGNORECASE | re.MULTILINE,
)

# Capitalized name-like pairs (e.g. "Brendan D", "John Smith")
name_pair_re = re.compile(
    r"\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{0,20}|[A-Z]\.)\b"
)


def scrub_triage_transcript(raw_text: Any) -> str:
    """De-identify a triage transcript.

    - Scrubs phones/emails/addresses/dates/etc using _scrub_text_quick
    - Scrubs explicit patient-name fields like 'Patient: Brendan D'
    - Scrubs capitalized name-like pairs (e.g. 'Brendan D', 'John Smith')
    """
    text = str(raw_text or "")
    text = _scrub_text_quick(text)
    text = name_line_re.sub(r"\1: [NAME]", text)
    text = name_pair_re.sub("[NAME]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ----------------------------
# Structured classifier input (optional)
# ----------------------------

def prepare_classifier_input(
    patient_input: Dict[str, Any]
) -> Tuple[Dict[str, Any], Dict[str, List[Any]], str]:
    """Prepare a de-identified classifier input from structured patient fields."""
    def get_text(key: str) -> str:
        return (patient_input.get(key) or "").strip()

    raw_name = get_text("name")
    raw_age = patient_input.get("age")
    raw_gender = get_text("gender")
    raw_symptoms = get_text("symptoms")
    raw_duration = get_text("duration")
    raw_pain_level = get_text("pain_level")
    raw_progress = get_text("progression")
    raw_aggravate = get_text("aggravating_factors")

    # keep a record of what structured PII we dropped
    removed_pii: Dict[str, List[Any]] = {
        "name": [raw_name] if raw_name else [],
        "age": [raw_age] if (raw_age is not None and str(raw_age).strip() != "") else [],
        "gender": [raw_gender] if raw_gender else [],
    }

    age_group = age_bucket_hipaa(raw_age)

    # scrub PII inside clinical text fields
    symptoms_clean = _scrub_text_quick(raw_symptoms)
    duration_clean = _scrub_text_quick(raw_duration)
    progress_clean = _scrub_text_quick(raw_progress)
    aggravate_clean = _scrub_text_quick(raw_aggravate)
    pain_clean = raw_pain_level  # raw pain level string

    # single string that the model (classifier) can see as input
    model_lines: List[str] = []
    if age_group:
        model_lines.append(f"[AGE_GROUP={age_group}]")
    if symptoms_clean:
        model_lines.append(f"Symptoms: {symptoms_clean}.")
    if duration_clean:
        model_lines.append(f"Duration: {duration_clean}.")
    if pain_clean:
        model_lines.append(f"Pain level: {pain_clean}.")
    if progress_clean:
        model_lines.append(f"Progression: {progress_clean}.")
    if aggravate_clean:
        model_lines.append(f"Aggravating factors: {aggravate_clean}.")
    model_input = " ".join(model_lines)

    # structured view, safe to log/use
    safe_struct: Dict[str, Any] = {
        "age_group": age_group,
        "symptoms": symptoms_clean,
        "duration": duration_clean,
        "pain_level": pain_clean,
        "progression": progress_clean,
        "aggravating_factors": aggravate_clean,
    }

    return safe_struct, removed_pii, model_input
