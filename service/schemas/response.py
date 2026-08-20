from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field


class ResponseType(str, Enum):
    BUILD = "build"
    TEXT = "text"


class TextResponse(BaseModel):
    type: Literal["text"] = ResponseType.TEXT
    message: str


class BuildResponse(BaseModel):
    type: Literal["build"] = ResponseType.BUILD
    message: str
    build: dict[str, Any] = Field(default_factory=dict)


AgentResponse = Annotated[
    Union[TextResponse, BuildResponse], Field(discriminator="type")
]


class QueryRequest(BaseModel):
    query: str = Field(min_length=1)
    session_history: list[dict[str, Any]] = Field(default_factory=list)
