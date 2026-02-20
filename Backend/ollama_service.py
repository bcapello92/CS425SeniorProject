from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from contextlib import asynccontextmanager
import uvicorn
import os

from ollama_client import call_llm_api

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-warm the Ollama model on startup to avoid slow first requests"""
    print("\n" + "="*50)
    print("Pre-warming Ollama model...")
    print("="*50)
    
    try:
        # Make a dummy request to load the model into memory
        warmup_messages = [{"role": "user", "content": "hi"}]
        await call_llm_api(warmup_messages)
        print("Model loaded and ready!")
        print("="*50 + "\n")
    except Exception as e:
        print(f"Warning: Could not pre-warm model: {e}")
        print("Model will load on first patient request (may be slow)")
        print("="*50 + "\n")
    
    yield
    
    # Cleanup (if needed)
    print("Shutting down Ollama service...")

app = FastAPI(title="Ollama Conversation API", lifespan=lifespan)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    language: Optional[str] = 'en'  # New: language parameter for Spanish support

class ChatResponse(BaseModel):
    reply: str

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Handle conversational chat using Ollama
    """
    try:
        # Convert pydantic models to dicts for the client
        messages_dict = [{"role": m.role, "content": m.content} for m in request.messages]
        
        reply = await call_llm_api(messages_dict, language=request.language)
        return ChatResponse(reply=reply)
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ollama_service"}

@app.get("/")
async def root():
    return {"message": "Ollama Conversation Service is running"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port)
