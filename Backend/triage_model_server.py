# triage_model_server.py
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM, StoppingCriteria, StoppingCriteriaList
from deidentify_triage import _scrub_text_quick, age_bucket_hipaa, scrub_triage_transcript

import torch
import json

MODEL_PATH = "llama32_ent_triage_cls_lora_merged"

# Tune these for CPU speed
MAX_TRANSCRIPT_CHARS = 2000
MAX_NEW_TOKENS = 160

app = FastAPI()

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None,
)
model.eval()

class StopOnJsonEnd(StoppingCriteria):
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.started = False
        self.depth = 0

    def __call__(self, input_ids, scores, **kwargs):
        # Decode only the last token for efficiency
        last_token_id = input_ids[0, -1].item()
        ch = self.tokenizer.decode([last_token_id], skip_special_tokens=True)

        for c in ch:
            if c == "{":
                self.started = True
                self.depth += 1
            elif c == "}" and self.started:
                self.depth -= 1
                if self.depth <= 0:
                    return True  # stop when JSON closes

        return False

class IntakePayload(BaseModel):
    answers: list[dict] = []
    transcript: str = ""
    age: int | None = None
    gender: str | None = None


def keyword_fallback(payload: IntakePayload):
    """
    Backup classifier if the model output is empty/unparsable.
    red > orange > yellow
    """
    text = []
    for a in payload.answers:
        text.append(f"{a.get('text','')}: {a.get('answer','')}")
    if payload.transcript:
        text.append(payload.transcript)
    full = "\n".join(text).lower()

    def has(word: str) -> bool:
        return word in full

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

    return ("yellow", "Fallback: no high-risk keywords detected; defaulting to routine.")


def build_prompt(payload: IntakePayload) -> str:
    cleaned_answers = []
    for a in payload.answers:
        q_text = _scrub_text_quick(a.get("text", ""))
        a_text = _scrub_text_quick(a.get("answer", ""))
        cleaned_answers.append(f"- {q_text}: {a_text}")
    answers_text = "\n".join(cleaned_answers)

    # Cap transcript length BEFORE scrubbing to keep prompt short
    transcript = (payload.transcript or "")[:MAX_TRANSCRIPT_CHARS]
    cleaned_transcript = scrub_triage_transcript(transcript)

    age_tag = ""
    if payload.age is not None:
        age_group = age_bucket_hipaa(payload.age)
        if age_group:
            age_tag = f"[AGE_GROUP={age_group}]\n"

    return f"""
You are a triage assistant. Use ONLY the provided Answers and Transcript.
Do NOT invent medical history, diagnoses, or symptoms not explicitly stated.

Triage colors:
- red: life-threatening or very high risk
- orange: urgent, needs prompt evaluation but not immediately life-threatening
- yellow: non-urgent / routine

Output rules (must follow exactly):
- Respond with JSON only (no markdown, no extra text).
- Output EXACTLY ONE JSON object.
- Start your response with '{{' and end with '}}'.
- Keys must be exactly: "color", "rationale"
- "color" must be exactly one of: "red", "orange", "yellow"
- "rationale" must be ONE sentence, max 20 words.

Example:
{{"color":"orange","rationale":"Worsening throat pain and fever suggest urgent evaluation within hours."}}

{age_tag}Answers:
{answers_text}

Transcript:
{cleaned_transcript}
""".strip()


def run_model(prompt: str) -> str:
    enc = tokenizer(prompt, return_tensors="pt")
    input_ids = enc["input_ids"].to(model.device)
    attention_mask = enc.get("attention_mask")
    if attention_mask is not None:
        attention_mask = attention_mask.to(model.device)

    input_len = input_ids.shape[-1]

    with torch.inference_mode():
        stopping=StoppingCriteriaList([StopOnJsonEnd(tokenizer)])
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
            stopping_criteria=stopping,
        )

    gen_ids = outputs[0][input_len:]
    if gen_ids.numel() == 0:
        return ""

    text = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()
    return text


def extract_first_json_object(text: str) -> str | None:
   
    if not text:
        return None
    s = text.strip()
    start = s.find("{")
    if start == -1:
        return None

    depth = 0
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return None


def extract_json_color_and_rationale(model_output: str):
    if not model_output or not model_output.strip():
        return None, None

    snippet = extract_first_json_object(model_output)
    if not snippet:
        return None, None

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

    # scrub transcript snippet before logging
    raw_snippet = (payload.transcript or "").replace("\n", " ")[:200]
    scrubbed_snippet = scrub_triage_transcript(raw_snippet)

    print("\n=== TRIAGE REQUEST ===")
    print("Transcript snippet:", scrubbed_snippet)
    print("RAW MODEL OUTPUT:", repr(raw_output))
    print("PARSED:", {"color": color, "rationale": rationale})
    print("======================\n")

    if not color:
        color, rationale = keyword_fallback(payload)
        print("USING FALLBACK:", {"color": color, "rationale": rationale})

    if color not in ("red", "orange", "yellow"):
        color = "yellow"

    return {"color": color, "rationale": rationale}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
