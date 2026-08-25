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
    "MODEL_NAME": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "TEMPERATURE": 1,
    "TOP_P": 0.95,
    "MAX_TOKENS": 16384,
    "REASONING_BUDGET": 16384,
    "CHAT_TEMPLATE_KWARGS": {"enable_thinking": True},
    "REQUEST_TIMEOUT_SECONDS": 110,
}

ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("RouteDecision", RouteDecision),
}

AWS_ROUTER_MODEL = {
    "MODEL_NAME": "openai/gpt-oss-120b",
    "RESPONSE_FORMAT": _response_format("BuildResponse", BuildResponse),
}
