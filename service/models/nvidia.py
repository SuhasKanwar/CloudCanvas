import sys

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from requests.exceptions import Timeout

from config import NVIDIA_API_KEY
from config.models import NVIDIA
from config.prompts import NVIDIA_SYSTEM_PROMPT
from tools.cloudcanvas import get_cloudcanvas_resource_support
from tools.search import search_tool
from utils.exception import CloudCanvasException
from utils.logger import logger


class Nvidia:
    def __init__(self, model_name: str = NVIDIA["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.system_prompt = NVIDIA_SYSTEM_PROMPT
        try:
            if not NVIDIA_API_KEY:
                raise ValueError("NVIDIA_API_KEY is not configured")
            self.model = ChatNVIDIA(
                api_key=NVIDIA_API_KEY,
                model=self.model_name,
                temperature=NVIDIA["TEMPERATURE"],
                top_p=NVIDIA["TOP_P"],
                max_tokens=NVIDIA["MAX_TOKENS"],
                model_kwargs={
                    "reasoning_budget": NVIDIA["REASONING_BUDGET"],
                    "chat_template_kwargs": NVIDIA["CHAT_TEMPLATE_KWARGS"],
                },
                timeout=NVIDIA["REQUEST_TIMEOUT_SECONDS"],
            ).bind_tools([search_tool, get_cloudcanvas_resource_support])
            self.prompt_template = ChatPromptTemplate.from_messages([
                ("system", self.system_prompt),
                ("system", "Relevant context (may be partial):\n{context}"),
                MessagesPlaceholder(variable_name="history"),
            ])
            self.chain = self.prompt_template | self.model
        except Exception as error:
            logger.exception("Failed to initialize NVIDIA model %s", self.model_name)
            raise CloudCanvasException(
                f"Failed to initialize NVIDIA model ({self.model_name})", sys,
            ) from error

    def invoke(
        self,
        prompt: str,
        session_history: list[dict],
        messages: list[BaseMessage] | None = None,
        context: str = "",
    ) -> object:
        try:
            return self.chain.invoke({
                "history": [*session_history, HumanMessage(content=prompt), *(messages or [])],
                "context": context,
            })
        except Timeout as error:
            logger.warning("NVIDIA model %s timed out", self.model_name)
            raise CloudCanvasException(
                f"NVIDIA NIM did not respond within {NVIDIA['REQUEST_TIMEOUT_SECONDS']} seconds", sys, 504,
            ) from error
        except Exception as error:
            logger.exception("NVIDIA model %s failed to generate a response", self.model_name)
            raise CloudCanvasException(
                f"Failed to generate a response from NVIDIA model ({self.model_name})", sys,
            ) from error
