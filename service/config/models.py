import os

from schemas.agent import BuildResponse, RouteDecision

def _response_format(name: str, model: type) -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "schema": model.model_json_schema(),
        },
    }

LLAMA = {
    "MODEL_NAME": os.getenv("LLAMA_MODEL", "llama-3.3-70b-versatile"),
}

ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("RouteDecision", RouteDecision),
}

AWS_ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("BuildResponse", BuildResponse),
}
