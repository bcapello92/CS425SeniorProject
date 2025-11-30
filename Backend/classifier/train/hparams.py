from dataclasses import dataclass, field
from typing import Optional

import transformers


@dataclass
class ModelArguments:
    model_name: str = field(
        default="facebook/opt-125m",
        metadata={"help": "Model identifier for AutoModel.from_pretrained."},
    )
    version: Optional[str] = field(
        default="v0",
        metadata={"help": "Optional custom version tag for bookkeeping."},
    )

    @property
    def model_name_or_path(self) -> str:
        return self.model_name


@dataclass
class DataArguments:
    dataset_name: str = field(
        default=None,
        metadata={"help": "Path to the training data (.csv, .json, .parquet or dir)."},
    )
    prompt_template: str = field(
        default="base",
        metadata={
            "help": (
                "Name of the prompt template to use. "
                "Must match a key in your PROMPT_REGISTRY, e.g. 'base', 'few_shot', 'cot'."
            )
        },
    )


@dataclass
class TrainingArguments(transformers.TrainingArguments):
    output_dir: str = field(default="./results")

    num_train_epochs: int = field(default=1)
    per_device_train_batch_size: int = field(default=4)
    gradient_accumulation_steps: int = field(default=1)
    learning_rate: float = field(default=2e-4)
    lr_scheduler_type: str = field(default="constant")
    weight_decay: float = field(default=0.001)

    bits: int = field(default=4)
    double_quant: bool = field(
        default=False,
        metadata={
            "help": "Compress the quantization statistics through double quantization."
        },
    )
    quant_type: str = field(
        default="nf4",
        metadata={
            "help": "Quantization data type to use. Should be one of `fp4` or `nf4`."
        },
    )

    lora_enable: bool = field(default=True)
    lora_r: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.1
    lora_weight_path: str = ""
    lora_bias: str = "none"

    fp16: bool = field(default=True)
    bf16: bool = field(default=False)  # generally available for high end GPUs

    max_grad_norm: float = field(default=0.3)
    warmup_ratio: float = field(default=0.03)

    group_by_length: bool = field(default=True)
    report_to: str = None

    max_length: int = field(default=512)
    packing: bool = field(default=False)
    dataset_text_field: str = field(default="text")

    eval_strategy: str = field(default="no")
    save_strategy: str = field(default="epoch")
    save_total_limit: int = field(default=2)
    logging_steps: int = field(default=1)