from fastapi import APIRouter, HTTPException

from agents.graph import agent_app
from config.agent import AGENT_CONFIG
from schemas.agent import QueryRequest, QueryResponse
from utils.exception import CloudCanvasException
from utils.logger import logger


router = APIRouter(prefix="/api/agent", tags=["Agent"])


@router.post("/query", response_model=QueryResponse, response_model_exclude_none=True)
async def execute_query(request: QueryRequest) -> QueryResponse:
    try:
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
