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
    "MODEL_NAME": "llama-3.3-70b-versatile",
    "TEMPERATURE": 0.2,
}

NVIDIA = {
    "MODEL_NAME": "meta/llama-3.3-70b-instruct",
    "TEMPERATURE": 0.2,
    "MAX_COMPLETION_TOKENS": 512,
    "REQUEST_TIMEOUT_SECONDS": 90,
}

ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("RouteDecision", RouteDecision),
}

AWS_ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("BuildResponse", BuildResponse),
}
