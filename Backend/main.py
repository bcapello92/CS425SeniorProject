from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

app = FastAPI()

MODEL_PATH = "llama32_ent_triage_cls_lora_merged"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16,
    device_map="auto"
)

class Symptoms(BaseModel):
    symptom_text: str

@app.post("/triage")
def get_triage(symptoms: Symptoms):
    prompt = f"""
    Classify the medical triage severity for this patient.
    Return ONLY one of: routine, moderate, urgent, severe.

    Symptoms:
    {symptoms.symptom_text}

    Triage:
    """

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    output = model.generate(
        **inputs,
        max_new_tokens=10,
        temperature=0.2
    )
    
    text = tokenizer.decode(output[0], skip_special_tokens=True)
    answer = text.split("Triage:")[-1].strip().lower()

    return {"triage": answer}
