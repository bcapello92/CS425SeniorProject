import os

import pandas as pd
from datasets import load_dataset

from .templates import get_prompt_fn


def get_dataset(data_args):
    if data_args.dataset_name is None:
        raise ValueError("dataset_name cannot be None")

    if data_args.dataset_name.endswith(".parquet"):
        # Single local parquet file
        return load_dataset("parquet", data_files={"train": data_args.dataset_name})
    elif os.path.isdir(data_args.dataset_name):
        # A directory of parquet files (recursively)
        return load_dataset(
            "parquet",
            data_files={"train": os.path.join(data_args.dataset_name, "**/*.parquet")},
        )
    elif data_args.dataset_name.endswith(".csv"):
        return pd.read_csv(data_args.dataset_name)
    elif data_args.dataset_name.endswith(".json"):
        return load_dataset("json", data_files=data_args.dataset_name, split="train")
    else:
        raise ValueError(
            f"""Unsupporteed dataset: {data_args.dataset_name} passed.
            Supported types are .parquet, .json, .csv"""
        )


def formatting_prompts_func(example):
    return f"### Human: {example['query']}\n### Assistant: {example['answer']}"


def load_n_preprocess_data(data_args):
    if "ENT_Triage_4500_realistic" in data_args.dataset_name:
        # call the load dataset function
        df = get_dataset(data_args)

        # I expect these columns in the CSV, so I check for them explicitly
        expected_cols = [
            "symptoms_text",
            "duration_text",
            "symptom_duration_days",
            "comorbidities",
            "triage_category",
        ]

        missing = [c for c in expected_cols if c not in df.columns]
        if missing:
            raise ValueError(
                f"""Missing columns {missing}. 
                I'm only seeing: {df.columns.tolist()}"""
            )

        df = df[expected_cols].copy()

        df["label_clean"] = df["triage_category"].astype(str).str.strip().str.lower()

        LABEL2ID = {"red": 0, "orange": 1, "green": 2}

        before_rows = len(df)
        df = df[df["label_clean"].isin(LABEL2ID.keys())].copy()
        print(
            f"(data) kept {len(df)}/{before_rows} rows with labels in {list(LABEL2ID.keys())}"
        )

        # Light text cleanup: remove all the extra spaces and NaNs
        for col in ["symptoms_text", "duration_text", "comorbidities"]:
            df[col] = (
                df[col]
                .fillna("")
                .astype(str)
                .str.replace(r"\s+", " ", regex=True)
                .str.strip()
            )

        # Make sure duration days is actually an int
        df["symptom_duration_days"] = (
            pd.to_numeric(df["symptom_duration_days"], errors="coerce")
            .fillna(0)
            .astype(int)
        )

        # initialize prompt template
        prompt_template_fn = get_prompt_fn(data_args.prompt_template)

        # apply prompt template to get prompts
        df["text"] = df.apply(prompt_template_fn, axis=1)
        df["label_id"] = df["label_clean"].map(LABEL2ID)

        data = []
        for _, row in df.iterrows():
            data.append(
                {
                    "query": row["text"],
                    "answer": row["label_clean"],
                }
            )

        return data

