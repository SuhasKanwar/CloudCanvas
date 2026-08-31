import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, trim_messages
from langchain_groq import ChatGroq
from groq import APIStatusError

from config import GROQ_API_KEY
from config.models import AWS_ROUTER_MODEL, ROUTER_MODEL
from config.prompts import AWS_ROUTER_SYSTEM_PROMPT, QUERY_ROUTER_SYSTEM_PROMPT
from schemas.agent import BuildResponse, RouteDecision
from utils.logger import logger


def compact_catalog_context(context: str, max_characters: int) -> str:
    if len(context) <= max_characters:
        return context
    try:
        catalog = json.loads(context)
    except (TypeError, json.JSONDecodeError):
        return context[:max_characters]
    if not isinstance(catalog, dict):
        return context[:max_characters]

    compact = {key: value for key, value in catalog.items() if not isinstance(value, list)}
    collections = {key: value for key, value in catalog.items() if isinstance(value, list)}
    compact.update({key: [] for key in collections})
    indexes = {key: 0 for key in collections}
    active = list(collections)
    # ponytail: Catalog arrays are server-bounded; use incremental size accounting if they become unbounded.
    while active:
        for key in active.copy():
            index = indexes[key]
            if index >= len(collections[key]):
                active.remove(key)
                continue
            compact[key].append(collections[key][index])
            encoded = json.dumps(compact, separators=(",", ":"))
            if len(encoded) > max_characters:
                compact[key].pop()
                active.remove(key)
            else:
                indexes[key] += 1
    encoded = json.dumps(compact, separators=(",", ":"))
    return encoded if len(encoded) <= max_characters else "{}"


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
        history = trim_messages(
            history,
            max_tokens=AWS_ROUTER_MODEL["MAX_HISTORY_TOKENS"],
            token_counter="approximate",
            strategy="last",
            start_on="human",
        )
        context = compact_catalog_context(context, AWS_ROUTER_MODEL["MAX_CONTEXT_CHARACTERS"])
        messages = [
            SystemMessage(content=AWS_ROUTER_SYSTEM_PROMPT),
            *( [SystemMessage(content=f"Connected AWS catalog:\n{context}")] if context else [] ),
            *history,
            HumanMessage(content=prompt),
        ]
        try:
            return self.model.invoke(messages)
        except APIStatusError as error:
            if error.status_code != 413:
                raise
            logger.warning("AWS router request exceeded Groq's token budget; retrying without catalog and history")
            return self.model.invoke([
                SystemMessage(content=AWS_ROUTER_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
