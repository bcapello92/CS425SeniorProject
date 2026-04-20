"""
ML Inference Module for Triage Classification
Provides functions to load the LoRA model and perform triage predictions
"""
import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from contextlib import nullcontext

LABELS = ["red", "orange", "blue"]


def build_triage_prompt(symptoms: str, duration: str, comorbidities: str) -> str:
    """Build the prompt for the model"""
    prompt_text = f"""You are a medical triage assistant. Based on the patient information below, classify the urgency level.

Patient Information:
- Symptoms: {symptoms}
- Duration: {duration}
- Medical History: {comorbidities}

Classify as one of: red (emergency), orange (urgent), or blue (routine)

Classification:"""
    
    formatted = f"### Human: {prompt_text.strip()}\n### Assistant:"
    return formatted


def extract_label_from_raw(raw: str) -> str:
    """Extract the classification label from model output"""
    primary = raw.split("###")[0].strip()
    first = primary.split()[0].lower()
    
    # Normalize variations
    if first in ['red', 'emergency', 'severe']:
        return 'red'
    elif first in ['orange', 'urgent', 'moderate']:
        return 'orange'
    elif first in ['green', 'blue', 'routine', 'minor']:
        return 'blue'
    
    return first


def load_lora_model(
    base_model_name: str = "unsloth/llama-3.2-1b-instruct",
    adapter_path: str = "slm-finetuned-adapter",
):
    print(f"Loading base model: {base_model_name}")

    tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # IMPORTANT: avoid Accelerate "big model" dispatch/offload
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=False,   # <-- change this to False
        device_map=None,           # <-- do NOT use device_map here
    ).to("cpu")

    base_model.config.use_cache = True

    print(f"Loading LoRA adapters from: {adapter_path}")
    model = PeftModel.from_pretrained(
        base_model,
        adapter_path,
        device_map=None,          # <-- force no accelerate dispatch
        offload_folder=None,      # <-- prevent disk offload
    ).to("cpu")

    model.eval()
    print("Model + LoRA loaded successfully on CPU")
    return model, tokenizer


def label_logprob(model, tokenizer, prompt: str, label: str) -> float:
    """Calculate log probability for a specific label"""
    full_text = prompt + " " + label

    enc = tokenizer(full_text, return_tensors="pt")
    input_ids = enc["input_ids"].to(model.device)
    attention_mask = enc.get("attention_mask")
    if attention_mask is not None:
        attention_mask = attention_mask.to(model.device)

    with torch.inference_mode():
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=256,         
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
        )
        logits = outputs.logits.float()

    log_probs = F.log_softmax(logits[:, :-1, :], dim=-1)

    label_ids = tokenizer(" " + label, add_special_tokens=False)["input_ids"]
    L = len(label_ids)
    if L == 0:
        raise ValueError(f"Empty tokenization for label: {label!r}")

    seq_len_minus1 = log_probs.size(1)
    if L > seq_len_minus1:
        raise ValueError(f"Label {label!r} is longer than available positions.")

    start_pos = seq_len_minus1 - L
    total_logprob = 0.0
    for i, tok_id in enumerate(label_ids):
        pos = start_pos + i
        total_logprob += log_probs[0, pos, tok_id].item()

    return float(total_logprob)


def get_label_confidences(model, tokenizer, prompt: str):
    """Get confidence scores for all labels"""
    scores = []
    for lab in LABELS:
        lp = label_logprob(model, tokenizer, prompt, lab)
        scores.append(lp)

    scores_tensor = torch.tensor(scores)
    probs_tensor = torch.softmax(scores_tensor, dim=0)
    probs = probs_tensor.tolist()

    label2prob = {lab: p for lab, p in zip(LABELS, probs)}
    pred_label = LABELS[int(scores_tensor.argmax().item())]
    pred_confidence = max(probs)

    return pred_label, pred_confidence, label2prob


def run_inference(model, tokenizer, symptoms: str, duration: str, 
                  comorbidities: str, max_new_tokens: int = 32):
    """Run inference for triage classification"""
    prompt = build_triage_prompt(symptoms, duration, comorbidities)

    inputs = tokenizer(prompt, return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    amp_ctx = (
        torch.cuda.amp.autocast(dtype=torch.float16)
        if torch.cuda.is_available()
        else nullcontext()
    )

    with torch.inference_mode(), amp_ctx:
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
            repetition_penalty=1.1,
            no_repeat_ngram_size=3,
        )

    gen_only = out[0][inputs["input_ids"].shape[-1]:]
    raw = tokenizer.decode(gen_only, skip_special_tokens=True).strip()
    label = extract_label_from_raw(raw)

    _, _, label2prob = get_label_confidences(model, tokenizer, prompt)
    label_conf = label2prob.get(label, 0.0)

    return raw, label, label_conf, label2prob
