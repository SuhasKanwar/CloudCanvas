from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_nvidia_ai_endpoints import ChatNVIDIA

from config import NVIDIA_API_KEY
from config.models import NVIDIA
from config.prompts import NVIDIA_SYSTEM_PROMPT
from tools.search import search_tool


class Nvidia:
    def __init__(self, model_name: str = NVIDIA["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.model = ChatNVIDIA(
            api_key=NVIDIA_API_KEY,
            model=self.model_name,
            temperature=0.2,
        ).bind_tools([search_tool])

    def invoke(
        self,
        prompt: str,
        session_history: list[dict],
        messages: list[BaseMessage] | None = None,
    ) -> object:
        if not NVIDIA_API_KEY:
            raise RuntimeError("NVIDIA_API_KEY is not configured")
        conversation = [HumanMessage(content=prompt), *(messages or [])]
        return self.model.invoke([
            SystemMessage(content=NVIDIA_SYSTEM_PROMPT),
            *session_history,
            *conversation,
        ])
