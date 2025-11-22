# triage_model_server.py
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

MODEL_PATH = "llama32_ent_triage_cls_lora_merged"  # update to your path

app = FastAPI()

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None,
)

class IntakePayload(BaseModel):
  patientId: str
  answers: list[dict] = []
  transcript: str = ""

def build_prompt(payload: IntakePayload) -> str:
    answers_text = "\n".join(
        f"- {a.get('text', '')}: {a.get('answer', '')}"
        for a in payload.answers
    )

    return f"""
You are a triage assistant. Based on the patient intake information, assign a triage color and explain why.

Triage colors:
- red: life-threatening or very high risk
- orange: urgent, needs prompt evaluation but not immediately life-threatening
- yellow: non-urgent / routine

Return a single JSON object with two keys: "color" and "rationale".
The "color" MUST be exactly one of: "red", "orange", "yellow".

Patient ID: {payload.patientId}

Answers:
{answers_text}

Transcript:
{payload.transcript}

Respond with JSON only.
""".strip()


import torch

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
    print("DEBUG: input_len:", input_len, "total_len:", outputs[0].shape[-1], "gen_len:", gen_ids.shape[-1])

    if gen_ids.numel() == 0:
        # Nothing new generated
        return ""

    text = tokenizer.decode(gen_ids, skip_special_tokens=True)
    return text.strip()



import json
import re

def extract_json_color_and_rationale(model_output: str):
    if not model_output or not model_output.strip():
        return None, None

    # Try to isolate a JSON object
    match = re.search(r'\{.*\}', model_output, flags=re.DOTALL)
    snippet = match.group(0) if match else model_output

    try:
        data = json.loads(snippet)
        color = str(data.get("color", "")).lower()
        rationale = str(data.get("rationale", "")).strip()
        return color or None, rationale or None
    except Exception:
        # Parsing failed
        return None, None


@app.post("/triage")
def triage(payload: IntakePayload):
    prompt = build_prompt(payload)
    raw_output = run_model(prompt)
    color, rationale = extract_json_color_and_rationale(raw_output)

    print("\n=== TRIAGE REQUEST ===")
    print("Patient:", payload.patientId)
    print("Transcript snippet:", (payload.transcript or "").replace("\n", " ")[:200])
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