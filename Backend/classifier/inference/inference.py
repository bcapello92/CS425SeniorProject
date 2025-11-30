import argparse
from contextlib import nullcontext

import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from data.load_n_preprocess import load_n_preprocess_data
from data.templates import model_input
from train.hparams import DataArguments

LABELS = ["red", "orange", "green"]


def build_case_prompt(symptoms: str, duration_text: str, comorbidities: str) -> str:
    row = {
        "symptoms_text": symptoms,
        "duration_text": duration_text,
        "comorbidities": comorbidities,
    }
    base_prompt = model_input(row)
    formatted = f"### Human: {base_prompt.strip()}\n### Assistant:"
    return formatted


def extract_label_from_raw(raw: str) -> str:
    primary = raw.split("###")[0].strip()
    # Take the first word
    first = primary.split()[0].lower()
    return first


def load_lora_model(base_model_name: str, adapter_path: str, device: str = "auto"):
    compute_dtype = torch.float16

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=False,
    )

    print(f"Loading base model: {base_model_name}")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        quantization_config=bnb_config,
        device_map=device,
        torch_dtype=compute_dtype,
    )

    # use KV-Cache for faster inference
    base_model.config.use_cache = True
    base_model.config.pretraining_tp = 1

    print(f"Loading LoRA adapters from: {adapter_path}")
    model = PeftModel.from_pretrained(base_model, adapter_path)

    tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    return model, tokenizer


def label_logprob(model, tokenizer, prompt: str, label: str) -> float:
    # We add a space before the label so tokenization is consistent
    full_text = prompt + " " + label

    enc = tokenizer(full_text, return_tensors="pt")
    input_ids = enc["input_ids"].to(model.device)
    attention_mask = enc.get("attention_mask")
    if attention_mask is not None:
        attention_mask = attention_mask.to(model.device)

    with torch.inference_mode():
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        # cast to float32 for numerical stability
        logits = outputs.logits.float()  # (1, seq_len, vocab)

    log_probs = F.log_softmax(logits[:, :-1, :], dim=-1)  # (1, seq_len-1, vocab)

    label_ids = tokenizer(" " + label, add_special_tokens=False)["input_ids"]
    L = len(label_ids)
    if L == 0:
        raise ValueError(f"Empty tokenization for label: {label!r}")

    seq_len_minus1 = log_probs.size(1)
    if L > seq_len_minus1:
        raise ValueError(
            f"Label {label!r} is longer than the available sequence positions."
        )

    start_pos = seq_len_minus1 - L  # index in log_probs
    total_logprob = 0.0
    for i, tok_id in enumerate(label_ids):
        pos = start_pos + i
        total_logprob += log_probs[0, pos, tok_id].item()

    return float(total_logprob)


def get_label_confidences(model, tokenizer, prompt: str):
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


def run_single_inference(
    model,
    tokenizer,
    symptoms: str,
    duration: str,
    comorbidities: str,
    max_new_tokens: int = 32,
):
    prompt = build_case_prompt(symptoms, duration, comorbidities)

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

    gen_only = out[0][inputs["input_ids"].shape[-1] :]
    raw = tokenizer.decode(gen_only, skip_special_tokens=True).strip()
    label = extract_label_from_raw(raw)

    _, _, label2prob = get_label_confidences(model, tokenizer, prompt)
    label_conf = label2prob.get(label, 0.0)

    return raw, label, label_conf, label2prob


def eval_on_dataset(model, tokenizer, data_args, max_new_tokens: int = 32):
    print(f"Evaluating on dataset: {data_args.dataset_name}")
    data = load_n_preprocess_data(data_args)

    if data is None or len(data) == 0:
        raise ValueError(
            f"No data returned by load_n_preprocess_data for: {data_args.dataset_name}"
        )

    correct = 0
    total = 0
    confidences = []

    amp_ctx_cls = torch.cuda.amp.autocast if torch.cuda.is_available() else nullcontext

    for example in data:
        prompt = f"### Human: {example['query']}\n### Assistant:"
        gt = str(example["answer"]).strip().lower()

        inputs = tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(model.device) for k, v in inputs.items()}

        with torch.inference_mode(), amp_ctx_cls(dtype=torch.float16):
            out = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                eos_token_id=tokenizer.eos_token_id,
                pad_token_id=tokenizer.eos_token_id,
                repetition_penalty=1.1,
                no_repeat_ngram_size=3,
            )

        gen_only = out[0][inputs["input_ids"].shape[-1] :]
        raw = tokenizer.decode(gen_only, skip_special_tokens=True).strip()
        pred = extract_label_from_raw(raw)

        _, _, label2prob = get_label_confidences(model, tokenizer, prompt)
        pred_conf = label2prob.get(pred, 0.0)
        confidences.append(pred_conf)

        total += 1
        if pred == gt:
            correct += 1

    acc = 100.0 * correct / total if total > 0 else 0.0
    avg_conf = float(sum(confidences) / len(confidences)) if confidences else 0.0

    print(f"Accuracy on {total} examples: {acc:.2f}%")
    print(f"Average confidence (for predicted labels): {avg_conf:.3f}")
    return acc, avg_conf


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base_model",
        type=str,
        default="unsloth/llama-3.2-1b-instruct",
        help="Base model name used during training.",
    )
    parser.add_argument(
        "--adapter_path",
        type=str,
        default="slm-finetuned-adapter",
        help="Path to the saved LoRA adapter directory.",
    )
    parser.add_argument(
        "--symptoms",
        type=str,
        default=None,
        help="Symptoms text for a single inference case.",
    )
    parser.add_argument(
        "--duration_text",
        type=str,
        default=None,
        help="Duration of symptoms text for a single inference case.",
    )
    parser.add_argument(
        "--comorbidities",
        type=str,
        default="none",
        help="Comorbidities text for a single inference case.",
    )
    parser.add_argument(
        "--csv_eval_path",
        type=str,
        default=None,
        help=(
            "Optional path to an evaluation dataset "
            "(e.g. ENT_Triage_4500_realistic.csv). "
            "This will be passed as DataArguments.dataset_name and "
            "preprocessed via load_n_preprocess_data."
        ),
    )
    parser.add_argument(
        "--perform_inference",
        type=bool,
        default=True,
        help="Flag to perform inference on a single example.",
    )
    parser.add_argument(
        "--prompt_template",
        type=str,
        default="base",
        help="Prompt template name (must match a key in PROMPT_REGISTRY).",
    )
    parser.add_argument(
        "--max_new_tokens",
        type=int,
        default=32,
        help="Max new tokens to generate.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    model, tokenizer = load_lora_model(args.base_model, args.adapter_path)

    if args.perform_inference and (args.csv_eval_path is not None):
        raise ValueError(
            "Arguments: perform_infernce and csv_eval_path cannot be performed together "
        )

    # Single-example inference
    if args.perform_inference:
        if (
            args.symptoms is not None
            and args.duration_text is not None
            and args.comorbidities is not None
        ):
            print("=== Running Single Inference ===")
            _, label, conf, _ = run_single_inference(
                model,
                tokenizer,
                symptoms=args.symptoms,
                duration=args.duration_text,
                comorbidities=args.comorbidities,
                max_new_tokens=args.max_new_tokens,
            )

            return label, conf

    # Dataset evaluation
    if args.csv_eval_path is not None:
        print("\n=== Performaing Dataset Evaluation ===")
        data_args = DataArguments(
            dataset_name=args.csv_eval_path,
            prompt_template=args.prompt_template,
        )
        acc, avg_conf = eval_on_dataset(
            model,
            tokenizer,
            data_args=data_args,
            max_new_tokens=args.max_new_tokens,
        )

        return acc, avg_conf


if __name__ == "__main__":
    main()