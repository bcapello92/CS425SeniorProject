import os
import httpx
from typing import List, Dict

# Use 127.0.0.1 to avoid occasional localhost/IPv6 resolution issues on Windows
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

MEDICAL_SAFE_SYSTEM_PROMPT = """
You are a medical intake assistant (NOT a clinician). Collect symptom details only.

Rules:
- Do NOT diagnose, do NOT provide medical advice, and do NOT recommend treatments or medications.
- Ask ONE clear follow-up question at a time.
- Aim for 9-10 questions total to gather all necessary information before completing the intake.
- Be concise and clinically focused. ALWAYS gather:
  * Onset (when did it start?)
  * Duration (how long has it lasted? Is it constant or intermittent?)
  * Severity (on a scale of 0-10, how bad is it?)
  * Location (where exactly is the symptom?). Only when it's necessary. Some symptoms don't have any locality such as "difficulty breathing".
  * What makes it BETTER (alleviating factors - rest, medication, position, etc.)
  * What makes it WORSE (aggravating factors - movement, eating, time of day, etc.)
  * Associated symptoms (any other symptoms occurring at the same time?)
- Prioritize red flags: trouble breathing, chest pain/pressure, fainting/confusion, severe bleeding,
  severe allergic reaction (face/tongue swelling), or ENT emergency signs (drooling/inability to swallow saliva,
  stridor, rapidly worsening neck swelling).
- If a red flag is present, advise urgent care/emergency services.
- End every message with exactly ONE question.

COMPLETION FLOW:
- After gathering sufficient information (chief complaint, onset, duration, severity, location, associated symptoms, and any red flags), ask: "Is there anything else you'd like to add before I send this to the medical team?"
- If the user responds negatively (e.g., "no", "nothing", "that's all", "nope", "I'm good"), respond with a brief acknowledgment followed EXACTLY by: [COMPLETE_INTAKE]
- Example: "Thank you for providing all that information. We're sending this to the medical team now. [COMPLETE_INTAKE]"
- Do NOT ask about phone calls, video calls, or any other contact methods. Simply confirm and end with the marker.
- If the user adds more information, gather it and ask the confirmation question again.
""".strip()

def _enforce_one_question(text: str) -> str:
    # If the model outputs multiple questions, keep only up to the first '?'
    if text.count("?") <= 1:
        return text.strip()
    first = text.split("?", 1)[0].strip() + "?"
    return first

async def call_llm_api(messages: List[Dict[str, str]]) -> str:
    """
    Call Ollama local chat endpoint.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": MEDICAL_SAFE_SYSTEM_PROMPT}, *messages],
        "stream": False,
        # Allow longer generation for detailed responses
         "options": {"num_predict": 256}
    }

    # Give Ollama plenty of time to load + generate (first request can be slow)
    timeout = httpx.Timeout(connect=30.0, read=800.0, write=60.0, pool=30.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()

            result = response.json()
            reply = (result.get("message") or {}).get("content") or ""

            if not reply.strip():
                # If Ollama returns an empty message for any reason
                return "I didn’t get a response back from the model. Can you tell me when your symptoms started?"

            return _enforce_one_question(reply)

    except httpx.ReadTimeout:
        print("Ollama error: ReadTimeout (model took too long to respond)")
        return "I’m taking longer than usual to respond. Can you tell me when your symptoms started?"

    except httpx.ConnectError as e:
        print(f"Ollama error: ConnectError ({e})")
        return "I can’t reach the local model server right now. Is Ollama running on your machine?"

    except httpx.HTTPStatusError as e:
        # Useful when Ollama returns 400/404/500 etc.
        status = e.response.status_code if e.response else "unknown"
        body = ""
        try:
            body = e.response.text[:300] if e.response else ""
        except Exception:
            pass
        print(f"Ollama error: HTTP {status} - {body}")
        return "I hit an error talking to the local model server. Can you tell me when your symptoms started?"

    except Exception as e:
        print(f"Ollama error: {e}")
        import traceback
        traceback.print_exc()
        return "I'm having trouble reaching my conversational brain right now. Can you tell me when your symptoms started?"
