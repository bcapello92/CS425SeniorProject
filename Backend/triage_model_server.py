# triage_model_server.py
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
from deidentify_triage import _scrub_text_quick, age_bucket_hipaa, scrub_triage_transcript

import torch
import json
import re

MODEL_PATH = "llama32_ent_triage_cls_lora_merged"  

app = FastAPI()

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None,
)


class IntakePayload(BaseModel):
    
    answers: list[dict] = []
    transcript: str = ""
    age: int | None = None
    gender: str | None = None


def keyword_fallback(payload: IntakePayload):
    """
    Very simple backup classifier if the model output is empty or unparsable.
    Mirrors the old keyword logic: red > orange > yellow.
    """
    text = []
    for a in payload.answers:
        text.append(f"{a.get('text','')}: {a.get('answer','')}")
    if payload.transcript:
        text.append(payload.transcript)
    full = "\n".join(text).lower()

    def has(word: str) -> bool:
        return word in full

    # High-risk
    if (
        has("chest pain")
        or has("shortness of breath")
        or has("short of breath")
        or has("unconscious")
        or has("severe bleeding")
        or has("can't breathe")
        or has("cannot breathe")
    ):
        return (
            "red",
            "Fallback: high-risk keywords detected (e.g., chest pain, shortness of breath, severe bleeding).",
        )

    # Moderate-risk
    if (
        has("worsening")
        or has("getting worse")
        or has("fever")
        or has("high fever")
        or has("moderate pain")
        or has("can't keep fluids")
        or has("cant keep fluids")
    ):
        return (
            "orange",
            "Fallback: moderate-risk keywords detected (worsening symptoms, fever, moderate pain).",
        )

    # Default
    return (
        "yellow",
        "Fallback: no high-risk keywords detected; defaulting to routine.",
    )


def build_prompt(payload: IntakePayload) -> str:
    # scrub each answer text & answer body
    cleaned_answers = []
    for a in payload.answers:
        q_text = _scrub_text_quick(a.get("text", ""))
        a_text = _scrub_text_quick(a.get("answer", ""))
        cleaned_answers.append(f"- {q_text}: {a_text}")

    answers_text = "\n".join(cleaned_answers)

    # scrub full transcript with stronger de-identification
    cleaned_transcript = scrub_triage_transcript(payload.transcript)

    # optional: age bucket header if you start passing age
    age_tag = ""
    if payload.age is not None:
        age_group = age_bucket_hipaa(payload.age)
        if age_group:
            age_tag = f"[AGE_GROUP={age_group}]\n"

    return f"""
You are a triage assistant. Based on the patient intake information, assign a triage color and explain why.

Triage colors:
- red: life-threatening or very high risk
- orange: urgent, needs prompt evaluation but not immediately life-threatening
- yellow: non-urgent / routine

Return a single JSON object with two keys: "color" and "rationale".
The "color" MUST be exactly one of: "red", "orange", "yellow".

{age_tag}Answers:
{answers_text}

Transcript:
{cleaned_transcript}

Respond with JSON only.
""".strip()


def run_model(prompt: str) -> str:
    # Tokenize on CPU first
    enc = tokenizer(prompt, return_tensors="pt")
    input_ids = enc["input_ids"].to(model.device)
    attention_mask = enc["attention_mask"].to(model.device)

    input_len = input_ids.shape[-1]

    with torch.no_grad():
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=128,
            do_sample=False,  # greedy / deterministic
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
        )

    # Take only generated tokens *after* the prompt
    gen_ids = outputs[0][input_len:]

    # Debug: see what lengths we're getting
    print(
        "DEBUG: input_len:",
        input_len,
        "total_len:",
        outputs[0].shape[-1],
        "gen_len:",
        gen_ids.shape[-1],
    )

    if gen_ids.numel() == 0:
        # Nothing new generated
        return ""

    text = tokenizer.decode(gen_ids, skip_special_tokens=True)
    return text.strip()


def extract_json_color_and_rationale(model_output: str):
    if not model_output or not model_output.strip():
        return None, None

    s = model_output.strip()

    # Find the first JSON object by scanning and balancing braces
    start = s.find("{")
    if start == -1:
        return None, None

    depth = 0
    end = None
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end is None:
        return None, None

    snippet = s[start:end]  # this will stop at the first balanced JSON object

    try:
        data = json.loads(snippet)
        color = str(data.get("color", "")).strip().lower() or None
        rationale = str(data.get("rationale", "")).strip() or None
        return color, rationale
    except Exception:
        return None, None
@app.post("/triage")
def triage(payload: IntakePayload):
    prompt = build_prompt(payload)
    raw_output = run_model(prompt)
    color, rationale = extract_json_color_and_rationale(raw_output)

    # Scrub transcript snippet before logging to avoid leaking names/PII in logs
    raw_snippet = (payload.transcript or "").replace("\n", " ")[:200]
    scrubbed_snippet = scrub_triage_transcript(raw_snippet)

    print("\n=== TRIAGE REQUEST ===")
   
    print("Transcript snippet:", scrubbed_snippet)
    print("RAW MODEL OUTPUT:", repr(raw_output))
    print("PARSED:", {"color": color, "rationale": rationale})
    print("======================\n")

    # Fallback if model output is empty / unparsable
    if not color:
        color, rationale = keyword_fallback(payload)
        print("USING FALLBACK:", {"color": color, "rationale": rationale})

    # Normalize color
    if color not in ("red", "orange", "yellow"):
        color = "yellow"

    return {"color": color, "rationale": rationale}
