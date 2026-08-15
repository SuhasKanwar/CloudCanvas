import os, sys

from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware

from utils.logger import logger
from utils.exception import CloudCanvasException

from config import PORT, ALLOWED_ORIGINS
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/", tags=["Root"])
def root() -> dict:
    return {
        "success": True,
        "message": "Welcome to CloudCanvas AI Service. Visit /docs for API documentation."
    }

@app.get("/health", tags=["Health"])
def health() -> dict:
    return {
        "success": True,
        "message": "CloudCanvas AI Service is healthy and running successfully."
    }

@app.exception_handler(CloudCanvasException)
def CloudCanvas_exception_handler(request, exc: CloudCanvasException):
    logger.error(f"Error occurred in script: {exc.file_name} at line: {exc.line_number} with message: {exc.error_message}")
    return {
        "success": False,
        "message": f"Error occurred in script: {exc.file_name} at line: {exc.line_number} with message: {exc.error_message}"
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)