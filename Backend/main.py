"""
FastAPI Server for ML-Powered Triage
Loads the ML model once on startup and provides /triage endpoint
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from contextlib import asynccontextmanager

from ml_inference import load_lora_model, run_inference





# Global model and tokenizer (loaded once on startup)
model = None
tokenizer = None


class TriageRequest(BaseModel):
    symptoms: str
    duration: str = "unknown"
    comorbidities: str = "none"


class TriageResponse(BaseModel):
    color: str
    severity: str
    emoji: str
    rationale: str
    confidence: float


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the ML model on server startup"""
    global model, tokenizer
    
    print("\n" + "="*50)
    print("Loading ML model...")
    print("="*50 + "\n")
    
    try:
        adapter_path = "slm-finetuned-adapter"
        base_model = "unsloth/llama-3.2-1b-instruct"
        
        if not os.path.exists(adapter_path):
            print(f"ERROR: Adapter path not found: {adapter_path}")
            print("Please ensure model files are in the Backend directory")
            # We don't return here so yield still happens, but model remains None
        else:
            model, tokenizer = load_lora_model(
                base_model_name=base_model,
                adapter_path=adapter_path
            )
            
            print("\n" + "="*50)
            print("Model loaded successfully!")
            print("="*50 + "\n")
        
    except Exception as e:
        print(f"\nFailed to load model: {str(e)}\n")
        # raise  <-- If we raise here, startup fails completely. 
        # The original code raised, so we should probably raise too or handle it.
        # However, for lifespan, if we fail here, the app won't start.
        raise
        
    yield
    
    # Clean up resources if needed
    model = None
    tokenizer = None



app = FastAPI(title="Medical Triage ML API", lifespan=lifespan)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/triage", response_model=TriageResponse)
async def triage_patient(request: TriageRequest):
    """
    Perform ML-powered triage classification
    """
    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503, 
            detail="Model not loaded. Please restart the server."
        )
    
    try:
        # Run ML inference
        raw_output, predicted_label, confidence, all_probs = run_inference(
            model=model,
            tokenizer=tokenizer,
            symptoms=request.symptoms,
            duration=request.duration,
            comorbidities=request.comorbidities
        )
        
        # Map label to user-friendly response
        severity_map = {
            "red": {
                "severity": "Emergency",
                "emoji": "🚨",
                "rationale": "Your symptoms indicate a potentially life-threatening condition. Please seek emergency medical attention immediately or call 911."
            },
            "orange": {
                "severity": "Urgent",
                "emoji": "⚠️",
                "rationale": "Your symptoms require prompt medical attention. Please visit an urgent care facility or contact your healthcare provider within the next few hours."
            },
            "green": {
                "severity": "Routine",
                "emoji": "✅",
                "rationale": "Your symptoms appear manageable. Schedule an appointment with your healthcare provider at your earliest convenience."
            }
        }
        
        # Handle yellow as green (some models may output yellow)
        if predicted_label == "yellow":
            predicted_label = "green"
        
        response_data = severity_map.get(predicted_label, severity_map["green"])
        
        return TriageResponse(
            color=predicted_label,
            severity=response_data["severity"],
            emoji=response_data["emoji"],
            rationale=f"{response_data['rationale']} (Model confidence: {confidence:.1%})",
            confidence=confidence
        )
        
    except Exception as e:
        print(f"Error during inference: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Triage classification failed: {str(e)}"
        )


@app.get("/")
async def root():
    """Health check endpoint"""
    model_status = "loaded" if model is not None else "not loaded"
    return {
        "status": "running",
        "model_status": model_status,
        "message": "Medical Triage ML API"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "model_loaded": model is not None,
        "tokenizer_loaded": tokenizer is not None,
        "status": "healthy" if (model and tokenizer) else "unhealthy"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
