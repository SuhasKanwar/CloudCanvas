import logging

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS, HOST, PORT
from models.llama import Llama
from schemas.response import AgentResponse, QueryRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CloudCanvas AI Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llama: Llama | None = None


@app.get("/", tags=["Root"])
def root() -> dict[str, bool | str]:
    return {"success": True, "message": "CloudCanvas AI Service is running."}

@app.get("/health", tags=["Health"])
def health() -> dict[str, bool | str]:
    return {"success": True, "message": "CloudCanvas AI Service is healthy."}


@app.post("/api/agent/query", response_model=AgentResponse, tags=["Agent"])
def query(request: QueryRequest) -> AgentResponse:
    global llama
    try:
        llama = llama or Llama()
        return llama.generate_response(request.query, request.session_history)
    except Exception as error:
        logger.exception("Llama request failed")
        raise HTTPException(status_code=502, detail=str(error)) from error

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
