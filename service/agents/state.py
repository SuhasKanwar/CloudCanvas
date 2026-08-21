from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

from schemas.agent import AgentResponse, Route


class AgentState(TypedDict, total=False):
    query: str
    session_history: list[dict]
    route: Route
    route_reasoning: str
    messages: Annotated[list[BaseMessage], add_messages]
    final_response: AgentResponse
