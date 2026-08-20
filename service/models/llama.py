import json
from typing import Any

from groq import Groq

from config import GROQ_API_KEY, LLAMA_MODEL
from schemas.response import AgentResponse, BuildResponse, ResponseType, TextResponse

SYSTEM_PROMPT = """
You are the CloudCanvas infrastructure assistant.
Return only valid JSON with this exact shape:

Text response:
{"type":"text","message":"..."}

Build response:
{"type":"build","message":"...","build":{}}

Use type "build" only when the user asks to create, change, or delete AWS
infrastructure. Put the machine-readable infrastructure request in build.
Use type "text" for explanations, questions, and status messages.
Do not add markdown or extra fields.
""".strip()


class Llama:
    def __init__(self, model_name: str = LLAMA_MODEL) -> None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        self.client = Groq(api_key=GROQ_API_KEY)
        self.model_name = model_name

    def generate_response(
        self, prompt: str, session_history: list[dict[str, Any]] | None = None
    ) -> AgentResponse:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(session_history or [])
        messages.append({"role": "user", "content": prompt})

        result = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            response_format={"type": "json_object"},
        )
        content = result.choices[0].message.content or ""
        return self.parse_response(content)

    @staticmethod
    def parse_response(content: str) -> AgentResponse:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            return TextResponse(message=content)

        if payload.get("type") == ResponseType.BUILD.value:
            return BuildResponse(
                message=str(payload.get("message", "")),
                build=payload.get("build", {}),
            )
        return TextResponse(message=str(payload.get("message", content)))
