from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agents.nodes import (
    aws_router_node,
    llama_node,
    route_llama_tools,
    route_node,
    route_query,
)
from agents.state import AgentState
from schemas.agent import Route
from tools.search import search_tool


def compile_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("router", route_node)
    workflow.add_node("aws_router", aws_router_node)
    workflow.add_node("llama", llama_node)
    workflow.add_node("tools", ToolNode([search_tool]))
    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        route_query,
        {Route.AWS.value: "aws_router", Route.GENERAL.value: "llama"},
    )
    workflow.add_edge("aws_router", END)
    workflow.add_conditional_edges(
        "llama",
        route_llama_tools,
        {"tools": "tools", "done": END},
    )
    workflow.add_edge("tools", "llama")
    return workflow.compile()


agent_app = compile_graph()
