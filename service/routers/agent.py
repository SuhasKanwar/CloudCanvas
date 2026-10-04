import hmac

from fastapi import APIRouter, Depends, Header, HTTPException

from agents.graph import agent_app
from config.agent import AGENT_CONFIG
from config import AI_SERVICE_API_KEY
from schemas.agent import QueryRequest, QueryResponse
from tools.aws_catalog import aws_tool_context
from utils.exception import CloudCanvasException
from utils.logger import logger


router = APIRouter(prefix="/api/agent", tags=["Agent"])


def require_internal_service_key(service_key: str | None = Header(default=None, alias="X-CloudCanvas-Service-Key")) -> None:
    if len(AI_SERVICE_API_KEY) < 32:
        raise HTTPException(status_code=503, detail="AI service authentication is not configured.")
    if not service_key or not hmac.compare_digest(service_key, AI_SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized service request.")


@router.post("/query", response_model=QueryResponse, response_model_exclude_none=True)
async def execute_query(request: QueryRequest, _: None = Depends(require_internal_service_key)) -> QueryResponse:
    try:
        with aws_tool_context(request.connection_id, request.tool_token):
            result = agent_app.invoke(
                {
                    "query": request.query,
                    "session_history": [
                        message.model_dump() for message in request.session_history
                    ],
                    "context": request.context,
                },
                config={"recursion_limit": AGENT_CONFIG["MAX_RECURSION_LIMIT"]},
            )
        return QueryResponse(
            success=True,
            data=result["final_response"],
            message="Query executed successfully.",
        )
    except CloudCanvasException as error:
        logger.exception("Agent graph failed")
        raise HTTPException(status_code=error.status_code, detail=error.error_message) from error
    except Exception as error:
        logger.exception("Agent graph failed")
        raise HTTPException(status_code=502, detail=str(error)) from error
