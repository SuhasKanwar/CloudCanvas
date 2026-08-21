from functools import lru_cache

from langchain_core.messages import AIMessage

from agents.state import AgentState
from models.llama import Llama
from schemas.agent import BuildResponse, Route, RouteDecision
from services.router import AwsRouter, ModelRouter


@lru_cache
def router_client() -> ModelRouter:
    return ModelRouter()


@lru_cache
def aws_router_client() -> AwsRouter:
    return AwsRouter()


@lru_cache
def llama_client() -> Llama:
    return Llama()


def route_node(state: AgentState) -> dict:
    decision: RouteDecision = router_client().route_request(state["query"])
    return {
        "route": decision.route,
        "route_reasoning": decision.reasoning,
    }


def aws_router_node(state: AgentState) -> dict:
    response: BuildResponse = aws_router_client().create_sketch(state["query"])
    return {"final_response": response}


def llama_node(state: AgentState) -> dict:
    response = llama_client().invoke(
        state["query"],
        state.get("session_history", []),
        state.get("messages", []),
    )
    if not isinstance(response, AIMessage):
        response = AIMessage(content=str(response))
    updates: dict = {"messages": [response]}
    if not response.tool_calls:
        content = response.content
        if isinstance(content, list):
            content = "".join(
                block.get("text", "") for block in content if isinstance(block, dict)
            )
        updates["final_response"] = {"type": "text", "message": str(content)}
    return updates


def route_query(state: AgentState) -> str:
    return state.get("route", Route.GENERAL).value


def route_llama_tools(state: AgentState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return "done"
    last_message = messages[-1]
    return "tools" if getattr(last_message, "tool_calls", None) else "done"
