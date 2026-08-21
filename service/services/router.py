from langchain_core.messages import HumanMessage, SystemMessage
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
        ).with_structured_output(RouteDecision)

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
        ).with_structured_output(BuildResponse)

    def create_sketch(self, prompt: str) -> BuildResponse:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        return self.model.invoke([
            SystemMessage(content=AWS_ROUTER_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
