


# This is the main entry point for the Ollama service. It creates a FastAPI app 
# and configures it with CORS middleware, message models, and the chat endpoint.
# It also defines the lifespan of the app, which is used to pre-warm the Ollama model
# on startup to avoid slow first requests.



from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from contextlib import asynccontextmanager
import uvicorn
import os

from ollama_client import call_llm_api, translate_to_english

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

app = FastAPI(title="Ollama Conversation API", lifespan=lifespan) # Create the FastAPI app

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware, # CORS middleware for frontend access.  This is a browser security feature called CORS (Cross-Origin Resource Sharing). I implemented CORSMiddleware in my FastAPI app to explicitly whitelist wildcard orgins=["*"] during local development, allowing the React frontend to securely transmit and receive chat data
    allow_origins=["*"],  # In production, specify actual origins. This grants React permission to access the FastAPI server.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel): # It guarantees that any incoming POST request must contain a messages array (a list of dictionaries) and an optional language string. It extracts the message and the language and hand them off to ollama_client
    messages: List[Message]
    language: Optional[str] = 'en'  # New: language parameter for Spanish support

class ChatResponse(BaseModel): 
    reply: str
     
# the core route of this service is the /chat endpoint. 
# When the React app fires off a user message, this endpoint catches the request.
# It extracts the conversation history (req.messages) and the language 
# preference (req.language), and then calls my internal asynchronous function 
# (call_llm_api) to actually interact with the local Llama model
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

        # If anything completely unexpected happens during the AI generation 
        # process that escapes my internal retry loops, this except block 
        # catches it and gracefully returns an HTTPException with a 500 status 
        # code and a clean JSON error message, ensuring the frontend can handle
        # the failure cleanly
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TranslateRequest(BaseModel):
    transcript: str

class TranslateResponse(BaseModel):
    translated: str

@app.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest):
    """
    Translates a Spanish transcript to English entirely locally via argostranslate.
    """
    try:
        translated = await translate_to_english(request.transcript)
        return TranslateResponse(translated=translated)
    except Exception as e:
        print(f"Error in translation endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health") # This is a simple health check endpoint that returns a JSON object with the status of the service. If the server crashes and doesn't reply "healthy," the cloud automatically reboots it.
async def health_check():
    return {"status": "healthy", "service": "ollama_service"}

@app.get("/") # This is a simple root endpoint that returns a JSON object with a message indicating that the service is running.
async def root():
    return {"message": "Ollama Conversation Service is running"}

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/upload-pdf")
async def upload_pdf(patient_id: str = Form(...), file: UploadFile = File(...)):
    """Uploads a PDF and associates it with a patient ID."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in " ._-")
    filename = f"{patient_id}_{safe_filename}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "Success", "filename": filename}

@app.get("/list-pdfs/{patient_id}")
async def list_pdfs(patient_id: str):
    """Lists all uploaded PDFs for a given patient ID."""
    # Find all PDFs matching the prefix
    files = list(UPLOAD_DIR.glob(f"{patient_id}_*.pdf"))
    return {"pdfs": [f.name for f in files]}

@app.get("/pdfs/{filename}")
async def get_pdf(filename: str):
    """Serves a specific PDF file."""
    # Prevent path traversal
    safe_filename = Path(filename).name
    file_path = UPLOAD_DIR / safe_filename
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, media_type='application/pdf')

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port) # the FASTAPI app runs on Uvicornport 8002
