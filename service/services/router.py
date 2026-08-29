from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from config import GROQ_API_KEY
from config.models import AWS_ROUTER_MODEL, ROUTER_MODEL
from config.prompts import AWS_ROUTER_SYSTEM_PROMPT, QUERY_ROUTER_SYSTEM_PROMPT
from schemas.agent import BuildResponse, RouteDecision


class ModelRouter:
    def __init__(self, model_name: str = ROUTER_MODEL["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.model = ChatGroq(
            api_key=GROQ_API_KEY,
            model=self.model_name,
            temperature=0,
        ).with_structured_output(
            RouteDecision,
            method=ROUTER_MODEL["STRUCTURED_OUTPUT_METHOD"],
            strict=ROUTER_MODEL["STRUCTURED_OUTPUT_STRICT"],
        )

    def route_request(self, prompt: str) -> RouteDecision:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        return self.model.invoke([
            SystemMessage(content=QUERY_ROUTER_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])


class AwsRouter:
    def __init__(self, model_name: str = AWS_ROUTER_MODEL["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.model = ChatGroq(
            api_key=GROQ_API_KEY,
            model=self.model_name,
            temperature=0,
        ).with_structured_output(
            BuildResponse,
            method=AWS_ROUTER_MODEL["STRUCTURED_OUTPUT_METHOD"],
            strict=AWS_ROUTER_MODEL["STRUCTURED_OUTPUT_STRICT"],
        )

    def create_sketch(self, prompt: str, session_history: list[dict], context: str = "") -> BuildResponse:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        history = [
            HumanMessage(content=message["content"]) if message.get("role") == "user" else AIMessage(content=message["content"])
            for message in session_history
            if message.get("role") in {"user", "assistant"} and isinstance(message.get("content"), str)
        ]
        return self.model.invoke([
            SystemMessage(content=AWS_ROUTER_SYSTEM_PROMPT),
            *( [SystemMessage(content=f"Connected AWS catalog:\n{context}")] if context else [] ),
            *history,
            HumanMessage(content=prompt),
        ])
