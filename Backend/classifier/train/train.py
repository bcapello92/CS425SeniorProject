import torch
import transformers
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
)
from trl import SFTConfig, SFTTrainer

from data.load_n_preprocess import (
    formatting_prompts_func,
    load_n_preprocess_data,
)
from train.hparams import (
    DataArguments,
    ModelArguments,
    TrainingArguments,
)


def train():
    parser = transformers.HfArgumentParser(
        (ModelArguments, DataArguments, TrainingArguments)
    )
    model_args, data_args, training_args = parser.parse_args_into_dataclasses()

    # load raw data
    data = load_n_preprocess_data(data_args)

    dataset = Dataset.from_list(data)
    dataset = dataset.train_test_split(test_size=0.1)
    print(
        f"""Train size: {len(dataset["train"])}, 
            Test size: {len(dataset["test"])}"""
    )

    compute_dtype = (
        torch.float16
        if training_args.fp16
        else (torch.bfloat16 if training_args.bf16 else torch.float32)
    )

    # load quantization config
    bnb_model_from_training_args = {}
    if training_args.bits in [4, 8]:
        from transformers import BitsAndBytesConfig

        bnb_model_from_training_args.update(
            dict(
                device_map={"": training_args.device},
                load_in_4bit=training_args.bits == 4,
                load_in_8bit=training_args.bits == 8,
                quantization_config=BitsAndBytesConfig(
                    load_in_4bit=training_args.bits == 4,
                    load_in_8bit=training_args.bits == 8,
                    llm_int8_threshold=6.0,
                    llm_int8_has_fp16_weight=False,
                    bnb_4bit_compute_dtype=compute_dtype,
                    bnb_4bit_use_double_quant=False,
                    bnb_4bit_quant_type=training_args.quant_type,  # {'fp4', 'nf4'}
                ),
            )
        )

        # load model
        model = AutoModelForCausalLM.from_pretrained(
            model_args.model_name,
            quantization_config=bnb_model_from_training_args,
            device_map="auto",
            torch_dtype=torch.float16,
        )

        # enable KV-Cache
        model.config.use_cache = True
        model.config.pretraining_tp = 1

        tokenizer = AutoTokenizer.from_pretrained(
            model_args.model_name, trust_remote_code=True
        )
        tokenizer.pad_token = tokenizer.eos_token

        if "llama-3.2" in model_args.model_name:
            tokenizer.padding_side = "right"

        if training_args.gradient_checkpointing:
            if hasattr(model, "enable_input_require_grads"):
                model.enable_input_require_grads()
            else:

                def make_inputs_require_grad(module, input, output):
                    output.requires_grad_(True)

                model.get_input_embeddings().register_forward_hook(
                    make_inputs_require_grad
                )

        # add LoRA Adapters
        if training_args.lora_enable:
            from peft import LoraConfig

            lora_config = LoraConfig(
                r=training_args.lora_r,
                lora_alpha=training_args.lora_alpha,
                lora_dropout=training_args.lora_dropout,
                bias=training_args.lora_bias,
                task_type="CAUSAL_LM",
            )
            if training_args.bits == 16:
                if training_args.bf16:
                    model.to(torch.bfloat16)
                if training_args.fp16:
                    model.to(torch.float16)

        training_arguments = SFTConfig(
            output_dir=training_args.output_dir,
            num_train_epochs=training_args.num_train_epochs,
            per_device_train_batch_size=training_args.per_device_train_batch_size,
            gradient_accumulation_steps=training_args.gradient_accumulation_steps,
            learning_rate=training_args.learning_rate,
            weight_decay=training_args.weight_decay,
            fp16=training_args.fp16,
            bf16=training_args.bf16,
            max_grad_norm=training_args.max_grad_norm,
            warmup_ratio=training_args.warmup_ratio,
            group_by_length=training_args.group_by_length,
            lr_scheduler_type=training_args.lr_scheduler_type,
            report_to=training_args.report_to,
            max_length=training_args.max_length,
            packing=training_args.packing,
            dataset_text_field=training_args.dataset_text_field,
        )
        trainer = SFTTrainer(
            model=model,
            args=training_arguments,
            train_dataset=dataset["train"],
            eval_dataset=dataset["test"],
            peft_config=lora_config,
            formatting_func=formatting_prompts_func,
        )

        print("Starting Training...")
        trainer.train()

        trainer.model.save_pretrained(training_args.output_dir)
        print(f"Adapters saved to {training_args.output_dir}")


if __name__ == "__main__":
    train()