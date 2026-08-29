import sys

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_groq import ChatGroq

from config import GROQ_API_KEY
from config.models import LLAMA
from config.prompts import LLAMA_SYSTEM_PROMPT
from tools.aws_catalog import get_aws_catalog
from tools.cloudcanvas import get_cloudcanvas_resource_support
from tools.search import search_tool
from utils.exception import CloudCanvasException
from utils.logger import logger


class Llama:
    def __init__(self, model_name: str = LLAMA["MODEL_NAME"]) -> None:
        self.model_name = model_name
        self.system_prompt = LLAMA_SYSTEM_PROMPT
        try:
            if not GROQ_API_KEY:
                raise ValueError("GROQ_API_KEY is not configured")
            self.model = ChatGroq(
                api_key=GROQ_API_KEY,
                model=self.model_name,
                temperature=LLAMA["TEMPERATURE"],
            ).bind_tools([search_tool, get_cloudcanvas_resource_support, get_aws_catalog])
            self.prompt_template = ChatPromptTemplate.from_messages([
                ("system", self.system_prompt),
                ("system", "Relevant context (may be partial):\n{context}"),
                MessagesPlaceholder(variable_name="history"),
            ])
            self.chain = self.prompt_template | self.model
        except Exception as error:
            logger.exception("Failed to initialize Llama model %s", self.model_name)
            raise CloudCanvasException(
                f"Failed to initialize Llama model ({self.model_name})", sys,
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
        except Exception as error:
            logger.exception("Llama model %s failed to generate a response", self.model_name)
            raise CloudCanvasException(
                f"Failed to generate a response from Llama model ({self.model_name})", sys,
            ) from error
