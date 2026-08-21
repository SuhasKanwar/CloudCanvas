from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from config import GROQ_API_KEY
from config.models import LLAMA
from config.prompts import LLAMA_SYSTEM_PROMPT
from tools.search import search_tool


class Llama:
    def __init__(self, model_name: str = LLAMA["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.model = ChatGroq(
            api_key=GROQ_API_KEY,
            model=self.model_name,
            temperature=0.2,
        ).bind_tools([search_tool])

    def invoke(
        self,
        prompt: str,
        session_history: list[dict],
        messages: list[BaseMessage] | None = None,
    ) -> object:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        conversation = [HumanMessage(content=prompt), *(messages or [])]
        return self.model.invoke([
            SystemMessage(content=LLAMA_SYSTEM_PROMPT),
            *session_history,
            *conversation,
        ])
