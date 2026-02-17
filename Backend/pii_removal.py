import re

# converts age into integer value.
def to_int_or_none(age):
    """possible patients inputs: '23', 23, '23.0' then 23; empty/weird then None"""
    try:
        if age is None:
            return None
        age_str = str(age).strip()
        if not age_str:
            return None
        return int(float(age_str))
    except Exception:
        return None

# classifies age into a few categories so the real age is hidden from the classifier
def age_bucket_hipaa(age_value):
    # HIPAA thing: 90+ must be grouped
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

# Regex for personal identifiers identification
phone_re = re.compile(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b')
email_re = re.compile(r'\b\S+@\S+\.\S+\b')
street_re = re.compile(
    r'\b\d+\s+[A-Za-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Hwy)\b',
    re.IGNORECASE
)
zip_re = re.compile(r'\b\d{5}(-\d{4})?\b')
date_numeric_re = re.compile(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b')
date_text_re = re.compile(
    r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{2,4}\b',
    re.IGNORECASE
)
time_re = re.compile(r'\b\d{1,2}:\d{2}\b')
ssn_re = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
id_hint_re = re.compile(
    r'\b(MRN|ID|Acct|Account|Policy|Member|Claim|Patient\s*ID)\s*[:#]?\s*\w+\b',
    re.IGNORECASE
)
gender_words_re = re.compile(
    r'\b(male|female|man|woman|boy|girl|transgender|nonbinary|m|f)\b',
    re.IGNORECASE
)

# keeps the symptoms and other necessary things while removing the personal identifiers from the string
def _scrub_text_quick(raw_text):
    """hide obvious identifiers but keep medical meaning intact."""
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

def prepare_classifier_input(patient_input):
    # grabs inputs
    def get_text(key):
        return (patient_input.get(key) or "").strip()

    raw_name = get_text("name")
    raw_age = patient_input.get("age")
    raw_gender = get_text("gender")
    raw_symptoms = get_text("symptoms")
    raw_duration = get_text("duration")
    raw_pain_level = get_text("pain_level")
    raw_progress = get_text("progression")
    raw_aggravate = get_text("aggravating_factors")

    # drop structured PII (but keep a record what we dropped)
    removed_pii = {
        "name": [raw_name] if raw_name else [],
        "age": [raw_age] if (raw_age is not None and str(raw_age).strip() != "") else [],
        "gender": [raw_gender] if raw_gender else [],
    }

    age_group = age_bucket_hipaa(raw_age)

    # lightly scrub PII inside clinical text
    symptoms_clean = _scrub_text_quick(raw_symptoms)
    duration_clean = _scrub_text_quick(raw_duration)
    progress_clean = _scrub_text_quick(raw_progress)
    aggravate_clean = _scrub_text_quick(raw_aggravate)
    pain_clean = raw_pain_level  # "6/10" is fine

    # single string that the model (classifier) can see as input
    model_lines = []
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

    # also return a structured view
    safe_struct = {
        "age_group": age_group,
        "symptoms": symptoms_clean,
        "duration": duration_clean,
        "pain_level": pain_clean,
        "progression": progress_clean,
        "aggravating_factors": aggravate_clean,
    }

    return safe_struct, removed_pii, model_input
