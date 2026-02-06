#!/usr/bin/env bash
set -euo pipefail

# Path to the ENT triage dataset
DATASET_PATH="data/ENT_Triage_4500_realistic.csv"

# Choose model + prompt template
MODEL_NAME="unsloth/llama-3.2-1b-instruct"
PROMPT_TEMPLATE="base"                         

python -m train.train \
  --model_name "${MODEL_NAME}" \
  --dataset_name "${DATASET_PATH}" \
  --prompt_template "${PROMPT_TEMPLATE}" \
  --output_dir "outputs/ent_triage_lora_4bit" \
  --num_train_epochs 1 \
  --per_device_train_batch_size 4 \
  --gradient_accumulation_steps 1 \
  --learning_rate 2e-4 \
  --bits 4 \
  --lora_enable True \
  --fp16 True \
  --bf16 False \
  --max_length 512 \
  --group_by_length True \
  --logging_steps 10 \
  --save_strategy "epoch" \
  --save_total_limit 2 \
  --report_to "none"