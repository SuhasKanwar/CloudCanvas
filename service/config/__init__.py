import os

from dotenv import load_dotenv

load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
LLAMA_MODEL = os.getenv("LLAMA_MODEL", "llama-3.3-70b-versatile")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
