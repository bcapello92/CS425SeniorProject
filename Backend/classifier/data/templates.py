def model_input(row):
    """
    Take one row at a time from the dataframe and turn it into a single text string
    that the classifier sees.

    *Important*: I didn't include the true label here. The model is supposed
    to learn to predict that from the text.
    """
    SYS_PROMPT = """
        You are a clinical triage assistant specializing in ENT (Ear, Nose, and Throat) presentations.
        Your task is to classify each case into one of three triage categories based ONLY on the provided information:

        - RED   = EMERGENCY (life-threatening or high risk of rapid deterioration)
        - ORANGE = SEMI-URGENT (significant symptoms or complication risk, but needs attention in 24-48 hours)
        - GREEN = NON-URGENT (mild or stable symptoms that can safely wait for a routine consultation)

        Each input example will contain:
        - Symptoms
        - Duration of symptoms
        - Comorbidities

        INSTRUCTIONS:
        1. Carefully read the symptoms, duration, and comorbidities.
        2. Infer the likely severity and risk level of the situation.
        3. Assign exactly ONE label: "RED", "ORANGE", or "GREEN".
        4. Provide a concise explanation linking specific parts of the input (symptoms, duration, comorbidities) to the chosen severity.

        OUTPUT FORMAT (STRICT):
        - First line: `label: RED` or `label: ORANGE` or `label: GREEN`
        - Second line: `reason: <short, clear explanation>`

        Do NOT:
        - Ask for more information.
        - Output probabilities or multiple labels.
        - Give treatment advice or management plans.
        - Mention that you are an AI model.

    """

    USER_PROMPT = f"""
        Classify the following ENT case into RED, ORANGE, or GREEN, and explain your reasoning.

        Symptoms:
        {row["symptoms_text"]}

        Duration of symptoms:
        {row["duration_text"]}

        Comorbidities:
        {row["comorbidities"]}

        Remember:
        - RED = emergency
        - ORANGE = semi-urgent
        - GREEN = non-urgent

        Follow the required output format:
        - First line: label: <RED/ORANGE/GREEN>
        - Second line: reason: <your explanation>

    """
    return SYS_PROMPT + USER_PROMPT


def model_input_few_shot(row):
    """
    Few-shot version: provide a handful of labeled examples, then ask for a label
    on the new case.
    """
    SYS_PROMPT = """
        You are a clinical triage assistant specializing in ENT (Ear, Nose, and Throat) presentations.
        Your task is to classify each case into one of three triage categories based ONLY on the provided information:

        - RED   = EMERGENCY (life-threatening or high risk of rapid deterioration)
        - ORANGE = SEMI-URGENT (significant symptoms or complication risk, but needs attention in 24-48 hours)
        - GREEN = NON-URGENT (mild or stable symptoms that can safely wait for a routine consultation)

        Each input example will contain:
        - Symptoms
        - Duration of symptoms
        - Comorbidities

        Below are some examples of how to classify cases.

        EXAMPLE 1
        Symptoms:
        Sudden onset severe throat pain, difficulty swallowing, muffled "hot potato" voice, drooling.

        Duration of symptoms:
        12 hours

        Comorbidities:
        Type 2 diabetes

        label: RED
        reason: Acute severe odynophagia, drooling, and muffled voice with diabetes suggest possible peritonsillar abscess or deep neck infection with airway risk, requiring emergency assessment.

        EXAMPLE 2
        Symptoms:
        Bilateral ear fullness, intermittent mild hearing loss, occasional popping sensation when swallowing.

        Duration of symptoms:
        3 weeks

        Comorbidities:
        None known

        label: GREEN
        reason: Subacute, mild, and non-progressive symptoms consistent with eustachian tube dysfunction without red-flag features, appropriate for non-urgent review.

        EXAMPLE 3
        Symptoms:
        Persistent unilateral nasal obstruction, blood-streaked nasal discharge, facial pressure.

        Duration of symptoms:
        6 weeks

        Comorbidities:
        Hypertension

        label: ORANGE
        reason: Chronic unilateral obstruction and blood-stained discharge are concerning but not immediately life-threatening, indicating semi-urgent ENT review.

        INSTRUCTIONS FOR NEW CASES:
        1. Carefully read the symptoms, duration, and comorbidities.
        2. Compare the severity pattern to the examples above.
        3. Assign exactly ONE label: "RED", "ORANGE", or "GREEN".
        4. Provide a concise explanation linking specific parts of the input (symptoms, duration, comorbidities) to the chosen severity.

        OUTPUT FORMAT (STRICT):
        - First line: `label: RED` or `label: ORANGE` or `label: GREEN`
        - Second line: `reason: <short, clear explanation>`

        Do NOT:
        - Ask for more information.
        - Output probabilities or multiple labels.
        - Give treatment advice or management plans.
        - Mention that you are an AI model.
    """

    USER_PROMPT = f"""
        Now classify the following ENT case into RED, ORANGE, or GREEN, following the examples above.

        Symptoms:
        {row["symptoms_text"]}

        Duration of symptoms:
        {row["duration_text"]}

        Comorbidities:
        {row["comorbidities"]}

        Follow the required output format:
        - First line: label: <RED/ORANGE/GREEN>
        - Second line: reason: <your explanation>
    """
    return SYS_PROMPT + USER_PROMPT


def model_input_cot(row):
    """
    Chain-of-thought version: explicitly ask the model to reason step-by-step
    before outputting the final label + reason.
    """
    SYS_PROMPT = """
        You are a clinical triage assistant specializing in ENT (Ear, Nose, and Throat) presentations.
        Your task is to classify each case into one of three triage categories based ONLY on the provided information:

        - RED   = EMERGENCY (life-threatening or high risk of rapid deterioration)
        - ORANGE = SEMI-URGENT (significant symptoms or complication risk, but needs attention in 24-48 hours)
        - GREEN = NON-URGENT (mild or stable symptoms that can safely wait for a routine consultation)

        Each input example will contain:
        - Symptoms
        - Duration of symptoms
        - Comorbidities

        INSTRUCTIONS:
        1. Carefully read the symptoms, duration, and comorbidities.
        2. Think step-by-step about:
           - Airway, breathing, circulation risks
           - Red-flag ENT features (e.g., severe bleeding, stridor, sepsis signs)
           - Chronicity and comorbidity-related risk amplification
        3. First, reason through the case in a few short steps.
        4. Then, based on that reasoning, assign exactly ONE label: "RED", "ORANGE", or "GREEN".
        5. Provide a concise explanation linking specific parts of the input (symptoms, duration, comorbidities) to the chosen severity.

        OUTPUT FORMAT (STRICT):
        - First line: `label: RED` or `label: ORANGE` or `label: GREEN`
        - Second line: `reason: <short, clear explanation>`

        You may think step-by-step in your internal reasoning, but your final visible output must strictly follow the two-line format above.

        Do NOT:
        - Ask for more information.
        - Output probabilities or multiple labels.
        - Give treatment advice or management plans.
        - Mention that you are an AI model.
    """

    USER_PROMPT = f"""
        Classify the following ENT case into RED, ORANGE, or GREEN, and explain your reasoning.

        Symptoms:
        {row["symptoms_text"]}

        Duration of symptoms:
        {row["duration_text"]}

        Comorbidities:
        {row["comorbidities"]}

        Remember:
        - RED = emergency
        - ORANGE = semi-urgent
        - GREEN = non-urgent

        Think through the severity step-by-step, then follow the required output format:
        - First line: label: <RED/ORANGE/GREEN>
        - Second line: reason: <your explanation>
    """
    return SYS_PROMPT + USER_PROMPT


PROMPT_REGISTRY = {
    "base": model_input,
    "few_shot": model_input_few_shot,
    "cot": model_input_cot,
}


def get_prompt_fn(name: str):
    try:
        return PROMPT_REGISTRY[name]
    except KeyError:
        valid = ", ".join(PROMPT_REGISTRY.keys())
        raise ValueError(f"Unknown prompt style '{name}'. Valid options: {valid}")