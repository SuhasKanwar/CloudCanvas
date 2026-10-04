from fastapi import FastAPI
import uvicorn
from config import HOST, PORT
from routers import agent

app = FastAPI(title="CloudCanvas AI Service")
app.include_router(agent.router)

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

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
