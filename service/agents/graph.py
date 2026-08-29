from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agents.nodes import (
    aws_router_node,
    nvidia_node,
    route_nvidia_tools,
    route_node,
    route_query,
)
from agents.state import AgentState
from schemas.agent import Route
from tools.aws_catalog import get_aws_catalog
from tools.cloudcanvas import get_cloudcanvas_resource_support
from tools.search import search_tool


def compile_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("router", route_node)
    workflow.add_node("aws_router", aws_router_node)
    workflow.add_node("nvidia", nvidia_node)
    workflow.add_node("tools", ToolNode([search_tool, get_cloudcanvas_resource_support, get_aws_catalog]))
    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        route_query,
        {Route.AWS.value: "aws_router", Route.GENERAL.value: "nvidia"},
    )
    workflow.add_edge("aws_router", END)
    workflow.add_conditional_edges(
        "nvidia",
        route_nvidia_tools,
        {"tools": "tools", "done": END},
    )
    workflow.add_edge("tools", "nvidia")
    return workflow.compile()


agent_app = compile_graph()
